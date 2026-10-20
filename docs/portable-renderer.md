# Portable Renderer / remote-client contract (experimental)

This optional browser bundle is independent of DSH Web. Build with `npm run build:renderer`, then read `renderer/renderer.js` as an **offline asset** in the embedding WebView.

## API

The bundle defines `DshIntelligentUiRenderer.mount(element, host)`:

- `host.sendPrompt(text): Promise<void>`: called only for catalog actions or an iframe Widget bridge action. The embedding client **must** validate scope, rate, length and delivery state before dispatching into its existing authenticated Session Prompt API. A rejection must reject the Promise.
- `host.onHeight(height)`: optional content height in CSS pixels.
- `mount().render(artifact)`: accepts `{kind,uiId,version,title?,definition,policy?}` where the definition is the complete accepted `ui_render` argument object, the complete `ui_patch` snapshot, the accepted `ui_render_widget` argument object, or — for `kind: "composition"` — the accepted `ui_compose` argument object (`{title?, blocks}`). Older artifact kinds keep working unchanged.
- Composed blocks render in order: `markdown` through the same GFM renderer (raw HTML stays inert text, only http(s)/mailto links), `catalog` through the catalog renderer, and `widget` through the same opaque-origin frame. `projectNativeUiEvents` reports `kind: "composition"`; a `ui_patch` on `<composition uiId>#<block id>` replaces only that catalog block and bumps the composition's version.
- `mount().setTheme('light'|'dark')` and `mount().dispose()`.

`uiId` is the original ui_render call ID (or widget/composition call ID); `version` starts at 1 and is monotonically increasing. A composed answer's catalog blocks are addressed as `<composition uiId>#<block id>`. The caller must keep Host+Session+uiId isolation, validate success and reject stale/conflicting patches **before** passing data to render(). The renderer does not reconstruct from a text summary.

Catalog blocks have independent patch versions, each starting at 1. Every accepted block patch increments the composition artifact version by one; that artifact revision is not a block's `baseVersion`.

## Security and packaging

The host must **not** expose arbitrary RPC, identity, local files, credentials or Android native APIs to the WebView. A hostile widget must remain in its opaque-origin sandbox: `WidgetFrame` uses iframe CSP, a per-frame token and a source-checked postMessage bridge. A remote host must independently authenticate and scope prompt actions. The bundle has React and catalog code built in; the CDN allowance only affects optional libraries inside a sandboxed Widget, never bootstrap dependencies.

Include `renderer/renderer.js` in the published package. In Android, embed it locally in HTML, and do not load the renderer from a remote website. Treat widget code as untrusted even though the Host accepted the tool call. Feature-detect WebGL, reduce/disable CDN permissions for offline deployments, and show explicit errors for unsupported widgets.

This is a separate build entry; the existing DSH client factory remains unchanged.

## Pure event projection

Consumers receiving raw native Session events may import `projectNativeUiEvents` from `deepseek-harness-intelligent-ui/portable` and pass `{hostId, sessionId}`. It sorts by native sequence, correlates `tool/call` with `tool/result` using `message.source.callId`, requires positive success metadata, validates full declarations, and only accepts full monotonic patch snapshots. Android can keep an equivalent incremental reducer while this API stabilizes.

Version updates keep their original Turn owner to avoid unnecessary WebView unmounts; the latest patch Turn is reported separately as `updatedTurn` so remote clients can display a pointer after the updated reply.
