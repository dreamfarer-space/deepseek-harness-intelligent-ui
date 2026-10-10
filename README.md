# DeepSeek Harness Intelligent UI

English | [中文](README.zh-CN.md)

Generative, interactive UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Ask in plain language and the agent decides on its own whether to answer with text, with native components (dashboards, tables, charts, timelines, live function plots, KaTeX math, Mermaid diagrams, forms), or with a fully custom **sandboxed live widget** (Three.js scenes, canvas simulations, mini-apps). The UI renders progressively in the chat while the answer streams. Sliders, rotation, zoom, sorting and tabs respond instantly in the browser. Only explicit actions (a button, a form, `Bridge.sendPrompt`) go back to the agent.

It ports the ideas of CopilotKit's [OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (Open Generative UI + A2UI-style declarative components) onto DSH's own extension points. It needs no CopilotKit, LangGraph, or external router.

## Demo

![DeepSeek Harness Intelligent UI demo](docs/assets/demo.gif)

🎥 **Full-quality video (H.264, ~2 min):** [docs/assets/demo.mp4](docs/assets/demo.mp4)

> The recording comes from the real DSH Web 0.2.0-rc.1 with this plugin installed, driven by `npm run e2e:all -- --record`. The model behind it is the **scripted mock** in `scripts/e2e/` (no API key was available), so the answers are canned. Everything you see (streaming, rendering, interaction, the round trips, persistence, isolation) is the real plugin running in DSH.
>
> To get an inline player on GitHub, drag `docs/assets/demo.mp4` into a GitHub comment or release editor and paste the resulting `https://github.com/user-attachments/assets/…` URL on its own line here. GitHub only renders inline video for uploaded attachments, not for repository files.

| Dashboard streams in, then settles | Three.js widget: R slider, rotate, zoom |
|:---:|:---:|
| ![Dashboard](docs/assets/screenshots/3-dashboard.png) | ![Sphere](docs/assets/screenshots/7-widget-rotated.png) |
| *Stat, Grid, Tabs, stacked bar chart with hover tooltip, sortable table, timeline, form* | *`x²+y²+z²=2Rz` via `UI.three()`: the slider re-shapes the surface locally* |

| Math, live Plot, Mermaid | Form → agent → new UI |
|:---:|:---:|
| ![Math](docs/assets/screenshots/9-math.png) | ![Form](docs/assets/screenshots/4-form-sent.png) |
| *KaTeX formula, `Plot` with parameter sliders (no model call), Mermaid flowchart* | *Submitted values reach the agent, which answers with a forecast chart* |

| Streaming preview (same iframe becomes final) | Stopped mid-generation |
|:---:|:---:|
| ![Preview](docs/assets/screenshots/5-widget-preview.png) | ![Stopped](docs/assets/screenshots/10-stopped.png) |

| Dark theme | Phone width (dark) | After reload |
|:---:|:---:|:---:|
| ![Dark](docs/assets/screenshots/11b-dark-widget.png) | ![Mobile](docs/assets/screenshots/12-mobile-dark.png) | ![Reload](docs/assets/screenshots/14-reload.png) |

## How the agent decides

The plugin injects a system-prompt section (`src/guidance.js`) that makes the model route each turn itself. There is no command and no external router:

- **Plain text** for greetings, short facts, explanations, code to copy, and workspace/coding work.
- **`ui_render`** for structured answers: comparisons, data, dashboards, processes, formulas, functions to explore, choices, input collection.
- **`ui_render_widget`** when the user wants to explore, manipulate or watch something the catalog cannot draw: 3D, simulations, animations, games, custom tools.
- **Local first:** anything computable in the browser (sliders, rotation, zoom, filtering, sorting, recomputing) must update instantly without a message to the model.

`/ui <request>` still exists to force a UI answer.

## Tools

| Tool | Use it for | Rendering |
|---|---|---|
| `ui_render` | Structured answers | Native React components from a fixed catalog, rendered progressively as the JSON streams |
| `ui_render_widget` | Custom visuals, 3D, simulations, mini-apps | HTML/CSS/JS in an opaque-origin sandboxed iframe: CSS first, HTML morphed in live, JS last, all in **one** iframe |

### Component catalog (`ui_render`)

`Card`, `Stack`, `Grid`, `Tabs` (keyboard navigable), `Text` (markdown subset), `Code`, `Alert`, `Badge`, `Divider`, `Stat`, `Progress`, `List`, `Table` (sortable), `Chart` (bar / line / area / pie, stacked, hover tooltip, toggleable legend), `Timeline`, **`Plot`** (y = f(x) with parameter sliders that redraw instantly; expressions run in a safe compiler, never `eval`), **`Math`** (KaTeX), **`Mermaid`** (flowchart, sequence, class, state, ER, gantt, mindmap…), `Button` (sends a prompt), and `Form` (text, number, **range slider**, select, checkbox, date, textarea; submits the values as a message).

A UI travels as a **flat node list with id references**, because DSH's tool-schema subset has no recursion. The Host validates it before acknowledging: unknown types or props, dangling or duplicate ids, cycles, two parents, chart length mismatches, `Plot` expressions that do not compile, slider defaults out of range, and so on. Problems come back as `ok:false` with paths, so the model can fix them and retry.

`Math` and `Mermaid` render inside the same sandbox as widgets, loading KaTeX or Mermaid from the CDN allowlist. No third-party code runs in the DSH page and the host bundle stays small (~127 KB). If the CDN is unreachable, the source text is shown instead.

### Widgets (`ui_render_widget`)

Fields follow the OpenIntelligentUI streaming contract, **in this order**: `title`, `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`.

- **Streaming:** placeholder lines show until `css` is complete. Then a preview frame opens and the cleaned partial `html` is morphed in ([idiomorph](https://github.com/bigskysoftware/idiomorph)). When the arguments are complete, the **same frame is finalized in place**: the final HTML is morphed and the code runs. There is no rebuild, blank flash or height jump.
- **Runtime helpers** (global `UI`):
  - `UI.three(el, { camera, target, autoRotate })` returns a renderer, scene, lights and OrbitControls (drag rotates, wheel/pinch zooms), renders on demand, and handles resize.
  - `UI.canvas(el, draw)` gives a HiDPI 2D canvas that is redrawn on resize and theme change.
  - `UI.state` / `UI.setState()` persist state. Inputs with an `id` are persisted and restored automatically.
  - `UI.color('accent')` returns an opaque theme color for three.js/canvas, and `UI.css()` returns a raw value.
  - `UI.onTheme(cb)`, `UI.scheme` and `UI.reducedMotion` are also available.
  - Helper classes: `.ui-row`, `.ui-control`, `.ui-card`, `.ui-stage`.
- **Bridge:** `Bridge.sendPrompt({ text })` disables the clicked control until the host answers, so double clicks cannot queue duplicates. `Bridge.openLink({ url })` opens links, and `Websandbox.connection.remote.*` is kept for OpenIntelligentUI compatibility.
- **Libraries:** an importmap maps `three`, `three/addons/…`, `d3`, `chart.js/auto`, `gsap` and `canvas-confetti` to esm.sh.
- **Recovery:** script errors show a count with **Reload** and **Ask to fix** (the latter sends the errors to the agent).

### Where the UI appears, and what survives

- While a turn runs, the UI renders inline inside the tool call. One component instance spans preparing → running → result, so interaction state carries over.
- When the turn ends, DSH folds tool calls into the "process" section. The plugin re-presents each UI **beneath the reply** (`conversation.chat.turnTail`), and the inline copy shrinks to a pointer.
- **Interaction state persists per tool call:** the open tab, table sort, form values, the submitted lock, Plot sliders, widget controls and `UI.state`, and frame heights. It lives in memory and in `localStorage` (bounded), so moving beneath the reply or reloading the page restores it. The UIs themselves are rebuilt from the durable session log.
- **Stopped generation:**
  - If the call already reached DSH, the view keeps the finished part (a static widget preview or the completed components) with a notice and a **Regenerate** button.
  - If the user stops while the arguments are still streaming, DSH drops the call entirely. The plugin stashes what was streamed and shows it beneath the stopped turn the same way.

## Security model

- **Widget isolation:** widgets run in `<iframe sandbox="allow-scripts allow-forms">` with `srcdoc` and **no** `allow-same-origin`. They cannot reach the DSH page, its cookies or storage, or its API. The E2E checks this in the browser: `parent.document`, `localStorage` and `document.cookie` all throw `SecurityError`, `fetch` is blocked, and `window.origin === "null"`.
- **CSP:**
  - `default-src 'none'`.
  - Scripts, styles, fonts and images load only from `cdnAllowlist`.
  - `connect-src 'none'` unless `allowNetwork` is on.
  - `form-action 'none'` and `base-uri 'none'`.
- **Messages from the frame:** they are accepted only from that frame's `contentWindow`, must carry a per-frame random token, and are shape-checked. Persisted widget state is size-limited JSON. The E2E checks that forged messages from the page or the frame are dropped.
- **`sendPrompt` limits:**
  - It is refused during the first second after mount.
  - At most one send every 2 seconds.
  - Text is capped at `sendPromptMaxChars`.
  - The message is queued as a normal user message.
- **`openLink`:** https only, optionally restricted to `openLinkAllowedOrigins`.
- **Catalog:** text renders as React elements, never raw HTML. `Plot` expressions are compiled by a tokenizer/parser over a fixed math function table, with no `eval`, `Function`, or property access.

## Install

Requires DeepSeek Harness `0.2.0-rc.1` and Node ≥ 22.13.

```sh
dsh plugin --profile web add file:/path/to/deepseek-harness-intelligent-ui
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
| `cdnAllowlist` | esm.sh, jsdelivr, unpkg | Origins widgets (and Math/Mermaid) may load resources from |
| `allowNetwork` | `false` | Let widgets `fetch` and use WebSocket to those origins |
| `maxWidgetHeight` | `2400` | Maximum frame height (px) |
| `maxWidgetBytes` | `400000` | Reject larger widgets |
| `sendPromptMaxChars` | `4000` | Longest message a widget, button or form may send |
| `openLinkAllowedOrigins` | `[]` | If non-empty, the only origins `openLink` may open |

## Develop and verify

```sh
npm install
npm run build       # client-src/ → client/client.js (DSH __ModuleLoader__ factory; React and Cordis external)
npm test            # vitest: 74 tests (catalog, expressions, tools, plugin mount, streaming parser, frame/CSP/bridge, state, theme, views, interruption, turn tail)
npm run typecheck
npm run e2e:all     # build → install into a temp DSH home → mock model + real DSH Web → 24 browser checks
npm run e2e:all -- --record   # also re-records docs/assets/demo.mp4 / demo.gif (needs ffmpeg)
```

- **Layout:** `src/` is the Host half (plain ESM, no build). `client-src/` is the browser half (TSX, bundled with esbuild). `client/client.js` is committed so `file:` and git installs need no build step.
- **What the E2E checks** (`scripts/e2e/browser.mjs`, report in [`docs/e2e-report.json`](docs/e2e-report.json)):
  - Plain Q&A stays text.
  - The dashboard streams progressively.
  - Chart hover, table sort and tabs are local.
  - A form round-trip returns a new UI.
  - The preview iframe is finalized in place.
  - The Three.js scene renders, and the R slider, drag-rotate and wheel-zoom work.
  - The `Bridge.sendPrompt` round trip works.
  - KaTeX and Mermaid render.
  - Plot sliders work.
  - Earlier UIs keep their state.
  - Stop → static preview → Regenerate works.
  - The sandbox is isolated and forged messages are ignored.
  - Dark theme reaches cards and widgets.
  - Phone width has no overflow.
  - A reload restores the UIs and their state.
  - No plugin console errors appear.
- Requires Chrome (`CHROME_PATH`), `dsh` on PATH and, for `--record`, `ffmpeg`. Headless Chrome uses SwiftShader for WebGL.

## Real-model Evaluation

The self-routing guidance and UI generation quality were evaluated against the official DeepSeek API (`deepseek-flash`), covering 15 distinct natural-language prompts across 4 categories (detailed report in [`docs/real-model-eval-report.json`](docs/real-model-eval-report.json)):

- **A. Plain Text Q&A (4/4 PASS, 100%):** Math definitions, Kalman filter concepts, Newton's third law, robot kinematics singularities. The model answers concisely in text without invoking UI tools or creating spurious cards.
- **B. Native Components (`ui_render`, 5/5 PASS, 100%):** Executive business dashboards (24+ components), sortable EV performance comparison tables, multi-series quarterly revenue bar charts, feedback rating forms, and robotics milestone timelines. The model autonomously selects `ui_render`, passing full `validateTree` checks.
- **C. Custom Sandboxed Widgets (`ui_render_widget`, 4/4 PASS, 100%):** 3D surface $x^2+y^2+z^2=2Rz$, damped oscillator slider plot, Three.js solar system scene, and dynamic pendulum physics simulator. The model autonomously chooses `ui_render_widget` with valid HTML/CSS/JS code passing `validateWidget`.
- **D. Multi-turn Interaction Flow (2/2 PASS, 100%):** Form submission parameter reasoning and multi-turn iterative UI modification with context preservation.

```sh
node scripts/run-real-model-suite.mjs [A|B|C|D|all]   # Run the evaluation suite (requires DEEPSEEK_API_KEY)
```

## Limitations

- Widgets, Math and Mermaid need the CDN allowlist to be reachable. Offline, Math/Mermaid fall back to source text and `UI.three` reports a script error.
- Persisted interaction state is per browser (`localStorage`), not synced across devices.
- Matching a dropped (stopped-while-streaming) call to its turn uses the turn's start/end times. A large clock offset between a remote DSH host and the browser could hide that card. Calls that reached the session log are unaffected.

## Credits

Concepts, the streaming widget contract, and parts of the prompt guidance come from [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Licensed under MIT.
