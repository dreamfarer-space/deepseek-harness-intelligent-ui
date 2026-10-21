"""Safety and publication boundary checks; no model/network calls."""
import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
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
                    "changed_files": 1,
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
            return [{"filename": "src/button.js", "status": "modified",
                     "patch": "@@ -1,2 +1,3 @@\n context\n-old\n+new\n+extra"}]
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

    def test_invalid_review_line_never_publishes(self):
        gh = GitHubStub()
        with patch.object(bot, "infer", return_value={"summary": "问题", "findings": [
            {"path": "src/button.js", "line": 999, "priority": "P1", "title": "x", "body": "x"}
        ]}):
            with self.assertRaises(bot.BotError):
                bot.review_pr(gh, 1, False)
        self.assertEqual(gh.writes, [])

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

    def test_model_process_has_no_github_credentials(self):
        def run(args, **kwargs):
            self.assertNotIn("GITHUB_TOKEN", kwargs["env"])
            self.assertNotIn("UNRELATED_SECRET", kwargs["env"])
            self.assertIn("features.shell_tool=false", args)
            self.assertIn("--ignore-user-config", args)
            self.assertEqual(kwargs["env"]["CODEX_GATEWAY_API_KEY"], "test-only-key")
            Path(args[args.index("--output-last-message") + 1]).write_text('{"labels":[],"reason":""}', encoding="utf-8")
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        with patch.dict(os.environ, {"AGENTROUTER_API_KEY": "test-only-key", "GITHUB_TOKEN": "test-only-github",
                                     "UNRELATED_SECRET": "must-not-leak"}), patch.object(bot.subprocess, "run", side_effect=run):
            self.assertEqual(bot.infer("classify", bot.LABEL_SCHEMA, "gpt-6.1-sol")["labels"], [])

    def test_mentions_and_secrets_are_redacted(self):
        with patch.dict(os.environ, {"AGENTROUTER_API_KEY": "test-only-key"}):
            self.assertEqual(bot.clean("@someone test-only-key"), "＠someone [REDACTED]")


if __name__ == "__main__":
    unittest.main()
