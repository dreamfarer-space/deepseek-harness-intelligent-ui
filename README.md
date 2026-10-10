# DeepSeek Harness Intelligent UI

English | [中文](README.zh-CN.md)

Generative, interactive UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): the model can answer with cards, tables, charts, KPI tiles, tabs, buttons, forms, and fully custom **sandboxed live widgets**, rendered right in the chat while the answer streams. Clicks and form submissions flow back into the conversation as the user's next message.

It ports the ideas of CopilotKit's [OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (Open Generative UI + A2UI-style declarative components) onto DSH's own extension points. It needs no CopilotKit, LangGraph, or external router.

## Demo & Video Preview

### Interactive Walkthrough (Full Flow)

![DeepSeek Harness Intelligent UI Demo](docs/assets/demo.gif)

> 🎥 **Video Recording:** [docs/assets/demo.mp4](docs/assets/demo.mp4) (H.264 high quality)

### Visual Walkthrough

| 1. Streamed Declarative Dashboard | 2. Themed SVG Chart |
|:---:|:---:|
| ![Dashboard](docs/assets/screenshots/2-render-ready.png) | ![Chart](docs/assets/screenshots/3-chart.png) |
| *Card, Grid, Stat metrics, Tabs, sortable Table* | *Interactive multi-series SVG chart* |

| 3. Interactive Form Submission | 4. Sandboxed Live Widget |
|:---:|:---:|
| ![Form Submitted](docs/assets/screenshots/4-form-sent.png) | ![Live Widget](docs/assets/screenshots/6-widget-final.png) |
| *Form values submitted back into conversation* | *Isolated iframe with sliders, canvas & styles* |

| 5. Widget Two-Way Bridge | 6. Session Persistence & Rehydration |
|:---:|:---:|
| ![Widget Sent](docs/assets/screenshots/7-widget-sent.png) | ![Reload](docs/assets/screenshots/8-reload.png) |
| *`Bridge.sendPrompt` feeds UI interactions to model* | *Cards and widgets rebuild cleanly on reload* |

## What the model gets

| Tool | Use it for | Rendering |
|---|---|---|
| `ui_render` | Structured answers: comparisons, data, dashboards, choices, input collection | Native React components from a fixed catalog, rendered progressively as JSON streams |
| `ui_render_widget` | Custom visuals: simulations, animations, diagrams, calculators, 3D | HTML/CSS/JS in an opaque-origin sandboxed iframe. CSS is applied first, HTML is morphed in live, and JS runs at the end |

- **Command:** `/ui <what to show>` asks the conversation's model to answer with UI.
- **System prompt:** a section tells the model when to choose text, the catalog, or a widget. This replaces OpenIntelligentUI's external router.

### Component catalog (`ui_render`)

`Card`, `Stack`, `Grid`, `Tabs`, `Text` (markdown subset), `Code`, `Alert`, `Badge`, `Divider`, `Stat`, `Progress`, `List`, `Table` (sortable), `Chart` (bar, line, area, pie; SVG; themed), `Button` (sends a prompt), and `Form` (text, number, select, checkbox, date, textarea; submits values as a message).

DSH's tool-schema subset has no recursion, so a UI travels as a **flat node list with id references**:

```json
{ "title": "Trip", "root": "card", "components": [
  { "id": "card", "type": "Card", "props": { "title": "Kyoto" }, "children": ["days"] },
  { "id": "days", "type": "Stat", "props": { "label": "Days", "value": 3 } } ] }
```

The Host validates the tree before acknowledging it: unknown types or props, dangling or duplicate ids, cycles, two parents, chart length mismatches, and so on. Problems come back as `ok:false` with paths, so the model can fix them and retry.

### Widgets (`ui_render_widget`)

The fields follow the OpenIntelligentUI streaming contract, **in this order**: `title`, `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`.

How a widget renders:
- **While arguments stream:** placeholder lines show until `css` is complete. Then a preview frame opens and the partial `html` is cleaned and morphed into it ([idiomorph](https://github.com/bigskysoftware/idiomorph)).
- **Final render:** the frame is rebuilt with the code. `jsFunctions` runs once, then each `jsExpressions` item runs in order. Errors are captured per expression and shown as a badge.
- **Inside the widget:** `Bridge.sendPrompt({ text })` and `Bridge.openLink({ url })` are available. `Websandbox.connection.remote.*` also works, for OpenIntelligentUI compatibility.
- **Libraries:** `--ui-*` theme variables follow DSH light and dark mode. An importmap provides `three`, `d3`, `chart.js/auto`, `gsap` and `canvas-confetti` from esm.sh.

### Where the UI appears

While a turn runs, the UI renders inline inside the tool call and updates as it streams. When the turn ends, DSH folds tool calls into the collapsed "process" section. The plugin then re-presents every successful UI **beneath the reply** through the `conversation.chat.turnTail` slot, and the inline copy shrinks to a one-line pointer. Both views derive from the durable session log, so a page reload rebuilds them.

## Security model

- **Widget isolation:** widgets run in `<iframe sandbox="allow-scripts allow-forms">` with `srcdoc` and **no** `allow-same-origin`. They cannot reach the DSH page, its cookies or storage, or its API.
- **Widget CSP:**
  - `default-src 'none'`.
  - Scripts, styles, fonts and images load only from the `cdnAllowlist`.
  - `connect-src 'none'` unless `allowNetwork` is on.
  - `form-action 'none'` and `base-uri 'none'`.
- **Messages from the frame:** they are accepted only from that frame's `contentWindow` and must carry a per-frame random token.
- **`sendPrompt` limits:**
  - It is refused during the first second after mount, so a widget cannot send on load.
  - At most one send every 2 seconds.
  - Text is capped at `sendPromptMaxChars`.
  - The message is queued as a normal user message, never as a steer.
- **`openLink`:** https only, optionally restricted to `openLinkAllowedOrigins`.
- **Catalog text:** components render text as React elements, never raw HTML. Links must be http(s).

## Install

Requires DeepSeek Harness `0.2.0-rc.1` and Node ≥ 22.13.

```sh
dsh plugin --profile web add file:/path/to/deepseek-harness-intelligent-ui
# or, once published: dsh plugin --profile web add dsh-intelligent-ui
```

Restart DSH Web afterwards. The bundle patch inserts the plugin row automatically. To change settings, add to your profile's `cordis.patch.yml`:

```yaml
- id: intelligent-ui
  config:
    allowNetwork: true
    cdnAllowlist: [https://esm.sh, https://cdn.jsdelivr.net]
```

| Option | Default | Meaning |
|---|---|---|
| `enableCatalog` | `true` | Register `ui_render` |
| `enableWidget` | `true` | Register `ui_render_widget` |
| `injectGuidance` | `true` | Add the "when to use UI" system-prompt section |
| `cdnAllowlist` | esm.sh, jsdelivr, unpkg | Origins widgets may load resources from |
| `allowNetwork` | `false` | Let widgets `fetch` and use WebSocket to those origins |
| `maxWidgetHeight` | `2400` | Maximum frame height (px) |
| `maxWidgetBytes` | `400000` | Reject larger widgets |
| `sendPromptMaxChars` | `4000` | Longest message a widget, button or form may send |
| `openLinkAllowedOrigins` | `[]` | If non-empty, the only origins `openLink` may open |

## Develop

```sh
npm install
npm run build       # client-src/ → client/client.js (DSH __ModuleLoader__ factory; React and Cordis external)
npm test            # vitest: catalog, tools, plugin mount, streaming parser, frame/CSP, bridge, views (jsdom), turn tail
npm run typecheck
```

- **Layout:** `src/` is the Host half (plain ESM, no build). `client-src/` is the browser half (TSX, bundled with esbuild). `client/client.js` is committed so `file:` and git installs need no build step.
- **End-to-end test:** this drives a real DSH Web, using the real DeepSeek streaming adapter pointed at a scripted mock, so no API key is needed.

  ```sh
  npm run e2e:mock                                    # scripted Messages API on 127.0.0.1:3199
  DSH_HOME=/tmp/dsh-e2e dsh plugin --profile web add file:$PWD
  DSH_HOME=/tmp/dsh-e2e DEEPSEEK_API_KEY=mock DEEPSEEK_BASE_URL=http://127.0.0.1:3199 \
    dsh --profile web --no-open --port 3181          # prints the tokenized URL
  npm run e2e:browser -- "<url>" e2e-shots e2e-mock.log
  ```

## Credits

Concepts, the streaming widget contract, and parts of the prompt guidance come from [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Licensed under MIT.
