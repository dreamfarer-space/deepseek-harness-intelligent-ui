# Portable Renderer / remote-client contract (experimental)

This optional browser bundle is independent of DSH Web. Build with \`npm run build:renderer\`, then read \`renderer/renderer.js\` as an **offline asset** in the embedding WebView.

## API

The bundle defines \`DshIntelligentUiRenderer.mount(element, host)\`:

- \`host.sendPrompt(text): Promise<void>\`: called only for catalog actions or an iframe Widget bridge action. The embedding client **must** validate scope, rate, length and delivery state before dispatching into its existing authenticated Session Prompt API. A rejection must reject the Promise.
- \`host.onHeight(height)\`: optional content height in CSS pixels.
- \`mount().render(artifact)\`: accepts \`{kind,uiId,version,title?,definition,policy?}\` where the definition is the complete accepted \`ui_render\` argument object, the complete \`ui_patch\` snapshot, or the accepted \`ui_render_widget\` argument object.
- \`mount().setTheme('light'|'dark')\` and \`mount().dispose()\`.

\`uiId\` is the original ui_render call ID (or widget call ID); \`version\` starts at 1 and is monotonically increasing. The caller must keep Host+Session+uiId isolation, validate success and reject stale/conflicting patches **before** passing data to render(). The renderer does not reconstruct from a text summary.

## Security and packaging

The host must **not** expose arbitrary RPC, identity, local files, credentials or Android native APIs to the WebView. A hostile widget must remain in its opaque-origin sandbox: \`WidgetFrame\` uses iframe CSP, a per-frame token and a source-checked postMessage bridge. A remote host must independently authenticate and scope prompt actions. The bundle has React and catalog code built in; the CDN allowance only affects optional libraries inside a sandboxed Widget, never bootstrap dependencies.

Include \`renderer/renderer.js\` in the published package. In Android, embed it locally in HTML, and do not load the renderer from a remote website. Treat widget code as untrusted even though the Host accepted the tool call. Feature-detect WebGL, reduce/disable CDN permissions for offline deployments, and show explicit errors for unsupported widgets.

This is a separate build entry; the existing DSH client factory remains unchanged.
