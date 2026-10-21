# Intelligent UI GitHub bots

Both bots run on GitHub Actions using AgentRouter and the official Codex CLI.
The default model is `gpt-6.1-sol` with high reasoning effort.

- **AI Issue Labeler**: handles opened, edited and reopened issues, selecting up
  to three existing classification labels. Adds labels without removing human
  labels; leaves status, priority and assignment decisions to maintainers.
- **AI PR Review**: handles opened, synchronized, reopened and ready PRs. Posts
  a Chinese advisory review with inline findings tied to added lines and the
  exact head commit. It never approves, requests changes or merges a PR.

Configure `AGENTROUTER_API_KEY` as a repository Actions secret. Optional repository
variables: `AGENTROUTER_BASE_URL`, `ISSUE_LABEL_MODEL`, `PR_REVIEW_MODEL`.
The base URL defaults to `https://agentrouter.org/v1`.

To process existing items or retry a failed request: Actions → select the bot →
Run workflow → select `main`, enter the item number. Dry run defaults to enabled;
disable it to publish. A commit already reviewed by this bot is skipped.

The workflows only execute trusted base-branch automation. They never install or
execute PR code. PR file contents are read through GitHub's API; the model runs
in an empty temporary directory with all tools disabled (verified against the
outgoing request for the pinned CLI), isolated Codex config, no MCP configuration,
and without the GitHub token. Only validated labels and
validated review locations can be published. Model output cannot choose API routes.
Generated bundles, lock files and binary assets are omitted. Large source files and
diffs may be truncated; omissions are listed in the review. This is a bounded
static review, not test execution or a guarantee that every defect is found.

Provider failures fail the Actions run rather than fabricate a review. Transient
rate limits receive one delayed retry. Check the Actions run and provider account
availability if a run fails; no alternate model is selected automatically.
