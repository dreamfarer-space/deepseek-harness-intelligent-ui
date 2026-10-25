# Intelligent UI GitHub bots

CodeRabbit is the sole automatic PR code reviewer. The custom workflow that
published “Intelligent UI · AI 审核” has been removed. Historical reviews remain
in PR timelines; the shared Python implementation is retained for its tests and
Issue labeling, but has no automatic PR review entrypoint.

## AI Issue Labeler

Handles opened, edited and reopened issues, selecting up to three existing
classification labels. Adds labels without removing human labels; leaves
status, priority and assignment decisions to maintainers.

Configure `GEMINI_API_KEY` as a repository Actions secret. Optional repository
variables: `GEMINI_BASE_URL` and `ISSUE_LABEL_MODEL`. The default model is
`gemini-3.8-flash-high`; the base URL defaults to `https://api.zemengzhou.com/v1`.

To process an existing issue or retry a failed request: Actions → AI Issue
Labeler → Run workflow → select `main`, enter the issue number. Dry run defaults
to enabled; disable it to publish labels.

The workflow executes only trusted default-branch automation and does not
install or execute PR code. Inference uses a text-only HTTPS Chat Completions
request; the GitHub token is never sent to the model service. Model output
cannot choose API routes. Provider failures fail the Actions run rather than
fabricate results. Transient rate limits receive one delayed retry; no
alternate model is selected automatically.
