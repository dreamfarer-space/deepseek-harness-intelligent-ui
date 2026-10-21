"""Safety and publication boundary checks; no model/network calls."""
import importlib.util
import os
from pathlib import Path
import json
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("bot", Path(__file__).with_name("bot.py"))
assert spec is not None and spec.loader is not None
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class GitHubStub:
    def __init__(self):
        self.writes = []
        self.issue_reads = 0
        self.pr_reads = 0
        self.stale_issue = False
        self.stale_pr = False
        self.stale_base = False

    def call(self, route, method="GET", payload=None):
        if method != "GET":
            self.writes.append((route, method, payload))
            return {"html_url": "https://github.com/example/repo/pull/1#review"}
        if route == "issues/1":
            self.issue_reads += 1
            return {"title": "Fix inaccessible button", "body": "Cannot focus with keyboard",
                    "state": "open", "updated_at": "new" if self.stale_issue and self.issue_reads > 1 else "old",
                    "labels": [{"name": "help wanted"}]}
        if route == "pulls/1":
            self.pr_reads += 1
            return {"title": "Fix button", "body": "", "state": "open", "draft": False,
                    "changed_files": len(getattr(self, "files", [0])),
                    "base": {"sha": "c" * 40 if self.stale_base and self.pr_reads > 1 else "d" * 40, "ref": "main"},
                    "head": {"sha": "b" * 40 if self.stale_pr and self.pr_reads > 1 else "a" * 40}}
        if route.startswith("contents/"):
            return {"encoding": "none", "size": 1000000}
        raise AssertionError(route)

    def pages(self, route):
        if route == "labels":
            return [{"name": "bug"}, {"name": "help wanted"}, {"name": "accessibility"}]
        if route == "pulls/1/reviews":
            return []
        if route == "pulls/1/files":
            return getattr(self, "files", [{"filename": "src/button.js", "status": "modified",
                                            "patch": "@@ -1,2 +1,3 @@\n context\n-old\n+new\n+extra"}])
        raise AssertionError(route)


class Boundaries(unittest.TestCase):
    def test_label_addition_preserves_manual_labels(self):
        gh = GitHubStub()
        with patch.object(bot, "infer", return_value={"labels": ["bug"], "reason": "确认问题"}):
            bot.label_issue(gh, 1, False)
        self.assertEqual(gh.writes, [("issues/1/labels", "POST", {"labels": ["bug"]})])

    def test_model_cannot_assign_status_labels(self):
        gh = GitHubStub()
        with patch.object(bot, "infer", return_value={"labels": ["help wanted"], "reason": ""}):
            with self.assertRaises(bot.BotError):
                bot.label_issue(gh, 1, False)
        self.assertEqual(gh.writes, [])

    def test_dry_run_and_stale_issue_never_write(self):
        for dry in (True, False):
            gh = GitHubStub()
            gh.stale_issue = True
            with patch.object(bot, "infer", return_value={"labels": ["bug"], "reason": "问题"}):
                bot.label_issue(gh, 1, dry)
            self.assertEqual(gh.writes, [])

    def test_added_line_coordinates(self):
        self.assertEqual(bot.added_lines("@@ -8,3 +8,4 @@\n a\n-old\n+new\n+extra\n z"), {9, 10})

    def test_review_is_advisory_and_bound_to_exact_commit(self):
        gh = GitHubStub()
        result = {"summary": "发现问题", "findings": [{"path": "src/button.js", "line": 2,
                  "priority": "P2", "title": "按钮失效", "body": "点击时触发错误"}]}
        with patch.object(bot, "infer", return_value=result):
            bot.review_pr(gh, 1, False)
        payload = gh.writes[0][2]
        self.assertEqual(payload["event"], "COMMENT")
        self.assertEqual(payload["commit_id"], "a" * 40)
        self.assertEqual(payload["comments"][0]["line"], 2)

    def test_offset_review_line_is_dropped_not_published(self):
        gh = GitHubStub()
        with patch.object(bot, "infer", return_value={"summary": "问题", "findings": [
            {"path": "src/button.js", "line": 999, "priority": "P1", "title": "x", "body": "x"}
        ]}):
            bot.review_pr(gh, 1, False)
        payload = gh.writes[0][2]
        self.assertEqual(payload["event"], "COMMENT")
        self.assertEqual(payload["comments"], [])

    def test_stale_review_never_publishes(self):
        gh = GitHubStub()
        gh.stale_pr = True
        with patch.object(bot, "infer", return_value={"summary": "没有发现问题", "findings": []}):
            bot.review_pr(gh, 1, False)
        self.assertEqual(gh.writes, [])

    def test_changed_base_never_publishes(self):
        gh = GitHubStub()
        gh.stale_base = True
        with patch.object(bot, "infer", return_value={"summary": "没有发现问题", "findings": []}):
            bot.review_pr(gh, 1, False)
        self.assertEqual(gh.writes, [])

    def test_inference_payload_has_no_tools_and_no_github_token(self):
        captured = {}

        class FakeResponse:
            def __init__(self, body):
                self._body = body

            def read(self):
                return json.dumps(self._body).encode()

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        def fake_urlopen(request, timeout=None):
            captured["url"] = request.full_url
            captured["headers"] = dict(request.headers)
            captured["payload"] = json.loads(request.data)
            return FakeResponse({"choices": [{"message": {"content": '```json\n{"labels": [], "reason": "ok"}\n```'}}]})

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only-key", "GITHUB_TOKEN": "test-only-github"}), \
                patch.object(bot.urllib.request, "urlopen", side_effect=fake_urlopen):
            result = bot.infer("classify", bot.LABEL_SCHEMA, "gemini-3.8-flash-high")

        payload = captured["payload"]
        self.assertNotIn("tools", payload)
        self.assertEqual(payload["model"], "gemini-3.8-flash-high")
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        serialized = json.dumps(payload) + json.dumps(captured["headers"])
        self.assertNotIn("test-only-github", serialized)
        self.assertTrue(captured["url"].endswith("/chat/completions"))
        self.assertEqual(result, {"labels": [], "reason": "ok"})

    def test_provider_failure_fails_closed(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only-key"}), \
                patch.object(bot.urllib.request, "urlopen", side_effect=bot.urllib.error.URLError("down")), \
                patch.object(bot.time, "sleep", lambda *_: None):
            with self.assertRaises(bot.BotError):
                bot.infer("classify", bot.LABEL_SCHEMA, "gemini-3.8-flash-high")

    def test_mentions_and_secrets_are_redacted(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-only-key"}):
            self.assertEqual(bot.clean("@someone test-only-key"), "＠someone [REDACTED]")
    def test_missing_credential_skips_without_failing(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "GITHUB_TOKEN": "x",
                                     "GITHUB_REPOSITORY": "o/r", "BOT_MODE": "pr",
                                     "TARGET_NUMBER": "1", "DRY_RUN": "false"}, clear=False):
            bot.main()

    def test_large_pr_is_split_into_batches_without_dropping_files(self):
        gh = GitHubStub()
        gh.files = [{"filename": f"src/mod{i}.js", "status": "modified",
                     "patch": "@@ -1 +1 @@\n-a\n+" + "b" * 400} for i in range(12)]
        seen, batches = set(), []

        def fake_infer(prompt, schema, model):
            payload = json.loads(prompt[prompt.index('{"title"'):])
            batches.append(1)
            seen.update(f["path"] for f in payload["files"])
            return {"summary": f"批次 {len(batches)}", "findings": []}

        with patch.object(bot, "BATCH_CHARS", 1000), patch.object(bot, "infer", side_effect=fake_infer):
            bot.review_pr(gh, 1, True)
        self.assertGreater(len(batches), 1)
        self.assertEqual(len(seen), 12)
        self.assertEqual(gh.writes, [])



if __name__ == "__main__":
    unittest.main()
