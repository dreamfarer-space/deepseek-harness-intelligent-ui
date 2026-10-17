<div align="center">

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/hero.svg" alt="DeepSeek Harness Intelligent UI: generative, interactive UI for DeepSeek Harness" width="100%">

**English** · [中文](README.zh-CN.md)

[![CI](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deepseek-harness-intelligent-ui?color=4d6bfe&label=npm)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7%20%E2%80%93%200.2.x-22d3ee)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.13-34d399)](https://nodejs.org)
[![OS](https://img.shields.io/badge/OS-Windows%20%7C%20Linux%20%7C%20macOS-a78bfa)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-97a1c9)](LICENSE)

[Demo](#-demo) · [Quality](#-real-model-quality-baseline) · [Quick start](#-quick-start) · [How it decides](#-how-the-agent-decides) · [Widgets](#-sandboxed-widgets-ui_render_widget) · [Security](#-security-model) · [Configuration](#%EF%B8%8F-configuration) · [Develop](#-develop-and-verify)

</div>

Generative, interactive UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Ask in plain language and the agent decides on its own whether to answer with text, with native components (dashboards, tables, charts, timelines, live function plots, KaTeX math, Mermaid diagrams, forms), or with a fully custom **sandboxed live widget** (Three.js scenes, canvas simulations, mini-apps). The UI renders progressively in the chat while the answer streams. Sliders, rotation, zoom, sorting and tabs respond instantly in the browser. Only explicit actions (a button, a form, `Bridge.sendPrompt`) go back to the agent.

It ports the ideas of CopilotKit's [OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (Open Generative UI + A2UI-style declarative components) onto DSH's own extension points. It needs no CopilotKit, LangGraph, or external router.

## ✨ Highlights

<table>
<tr>
<td width="33%" valign="top">

### 🧠 Decides by itself
No command needed. Each turn the agent picks text, native components or a live widget, guided by a system-prompt section.

</td>
<td width="33%" valign="top">

### ⚡ Streams progressively
Components appear while the JSON streams. Widgets morph into **one** iframe and finalize in place: no rebuild, no flash.

</td>
<td width="33%" valign="top">

### 🖱️ Local first
Sliders, rotate, zoom, sort, tabs and hover tooltips run in the browser and never call the model.

</td>
</tr>
<tr>
<td valign="top">

### 🧩 20-component catalog
Cards, grids, tabs, tables, charts, timelines, `Plot`, KaTeX `Math`, `Mermaid`, forms. Validated before it renders.

</td>
<td valign="top">

### 🔒 Sandboxed by default
Opaque-origin iframe, strict CSP, token-checked messages and a rate-limited bridge, all verified in a real browser.

</td>
<td valign="top">

### 💾 State that survives
Open tabs, sort order, form values, sliders and `UI.state` survive turn folding, page reloads and stopped generations.

</td>
</tr>
</table>

## 🎬 Demo

### The real DeepSeek model, end to end

https://github.com/user-attachments/assets/e4eb0adc-659e-4c80-b473-449aa42ca00f

<details>
<summary><b>🎞️ GIF highlights</b> (for viewers that cannot play the video, e.g. npm)</summary>
<br>

<p align="center">
  <img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/demo.gif" alt="Real deepseek-flash model in DSH Web, narrated by the whale girl: a form round trip, a damped-oscillation Plot with sliders, and two in-place chart edits via ui_patch" width="100%">
</p>

</details>

<img align="right" width="120" src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/scripts/eval/demo/assets/whale/greet.webp" alt="The DeepSeek whale girl who narrates the demo">

🎥 **Full video (H.264, 2 min 27 s, 9.5 MB):** [docs/assets/real-model/demo.mp4](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/assets/real-model/demo.mp4). It covers all 11 browser cases, and every chapter ends on its real result: text, chart, table, form round trip, Plot, Three.js with "Ask to fix", stop → regenerate, two in-place edits, Fast 3G, CDN offline and phone width. The DeepSeek whale girl (鲸鱼娘) narrates; her art is from [dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) (MIT, see the [credits](#credits)).

> [!NOTE]
> Recorded on 2026-10-16 by `npm run eval:real -- --stage browser --record` and edited with `npm run eval:demo`. Every card was generated live by the real **`deepseek-flash`** model in real **DSH Web 0.2.0-rc.1** with this plugin installed. Nothing is scripted, and **failures are left in**: each chapter card is marked ✓ or ✗, and the narration says what went wrong. While the model is working the video is sped up; the stopwatch in the corner shows the real elapsed time. The results are in the [real-model quality baseline](#-real-model-quality-baseline).

| Multi-series chart: **✗** (call cut off mid-stream) | Two in-place edits with `ui_patch`: ✓ |
|:---:|:---:|
| ![Chart](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/chart.png) | ![Patched](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/patched.png) |
| *The chart is right, but the card says "generation interrupted": more components were still pending* | *"Make it a line chart", then "add 小程序 30/45/60/80": one card, version 3, exact values* |
| **Form submit → the agent uses the values: ✓** | **Damped oscillation `Plot` with live sliders: ✓** |
| ![Form follow-up](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/form-followup.png) | ![Plot](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/plot.png) |
| *The submitted 全国 / 4 / 乐观 drive a quarterly forecast* | *y = A·e^(−γt)·cos(ωt) with envelopes; the sliders never call the model* |
| **Three.js: ✗, then repaired with "Ask to fix"** | **Stopped mid-stream → regenerated: ✓** |
| ![Three.js repaired](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/three-repaired.png) | ![Regenerated](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/regenerated.png) |
| *First attempt: `view is not defined`. After "Ask to fix": sphere centred at (0,0,R) with axes* | *The interrupted card keeps a static preview; Regenerate produces the full scene* |
| **Fast 3G, cache off: ✓** | **CDN unreachable: ✓ (degrades as designed)** |
| ![Weak network](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/weak-network.png) | ![Offline](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/offline.png) |
| *three.js loads slowly but still renders* | *The failure is shown on the card; the chat keeps working* |
| **Phone width (390 px): ✓** | **Sortable table: ✗ (no table within 5 min)** |
| ![Mobile](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/mobile.png) | ![Table](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/table.png) |
| *No overflow; KPI text and charts fit* | *The agent spent the whole budget researching car specs on the web* |

<details>
<summary><b>🧪 Scripted-model demo</b> (the pipeline E2E: dark mode, reload, sandbox isolation)</summary>
<br>

![DeepSeek Harness Intelligent UI demo with the scripted model](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/demo.gif)

🎥 [docs/assets/demo.mp4](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/v0.2.1/docs/assets/demo.mp4). This recording is from `npm run e2e:all -- --record`. The model behind it is the **scripted mock** in `scripts/e2e/`, so the answers are canned. It shows the plugin pipeline (streaming, rendering, round trips, persistence, isolation), not how a real model behaves.

| Dashboard streams in, then settles | Three.js widget: R slider, rotate, zoom |
|:---:|:---:|
| ![Dashboard](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/3-dashboard.png) | ![Sphere](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/7-widget-rotated.png) |

| Dark theme | Phone width (dark) | After reload |
|:---:|:---:|:---:|
| ![Dark](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/11b-dark-widget.png) | ![Mobile](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/12-mobile-dark.png) | ![Reload](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/14-reload.png) |

</details>

## 🚀 Quick start

You need [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **0.1.7 – 0.2.x** (`>=0.1.7-rc.1 <0.3.0`) and Node.js ≥ 22.13, on Windows, Linux or macOS. Nothing is compiled during install. The package ships its prebuilt browser bundle and declares no install scripts.

```sh
dsh plugin --profile web add deepseek-harness-intelligent-ui
```

Then restart DSH Web (`dsh web`) and ask for something visual, for example *"compare Q1–Q4 revenue by channel"* or *"let me explore x²+y²+z²=2Rz in 3D"*.

To have your environment checked first, use the guided installer instead. It verifies Node, the `dsh` version, pnpm and the profile, then runs the same `dsh plugin add`:

```sh
npx deepseek-harness-intelligent-ui install            # --profile <name>, --dsh <path>, --dry-run
npx deepseek-harness-intelligent-ui doctor             # diagnose only
```

| Task | Command |
|---|---|
| Upgrade | `dsh plugin --profile web add deepseek-harness-intelligent-ui@latest` |
| Try a prerelease (only when the `next` dist-tag exists) | `dsh plugin --profile web add deepseek-harness-intelligent-ui@next` |
| Pin a version | `dsh plugin --profile web add deepseek-harness-intelligent-ui@0.2.5` |
| Uninstall | `dsh plugin --profile web remove deepseek-harness-intelligent-ui` (or `npx deepseek-harness-intelligent-ui uninstall`) |
| From a checkout | `dsh plugin --profile web add file:/path/to/deepseek-harness-intelligent-ui` |

<details>
<summary><b>🩺 Troubleshooting</b></summary>
<br>

- *`pnpm was not found`*: DSH installs plugins with pnpm. Run `corepack enable` (it ships with Node) or `npm i -g pnpm`.
- *`… is incompatible with dsh X`*: your DSH is outside the supported range. Upgrade DSH (`npm i -g @deepseek-ai/dsh@latest`) or check [compatibility](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md) for a plugin release that supports it.
- *Upgrading from 0.1.x (`dsh-intelligent-ui` via `file:`)*: run `dsh plugin --profile web remove dsh-intelligent-ui` first. Both packages insert the same `intelligent-ui` row, and `doctor` reports the conflict.
- *The UI does not appear*: restart DSH Web after installing, and make sure you started the profile you installed into (`dsh web`).

</details>

### Compatibility

| DeepSeek Harness | Install smoke test | Browser E2E (24 checks) |
|---|:---:|:---:|
| `0.1.7-rc.2` | ✅ | ✅ |
| `0.2.0-rc.1` | ✅ | ✅ |
| `0.2.0-rc.2` (`latest`) | ✅ | ✅ |
| `0.2.1-alpha.2` | ✅ | ✅ |
| `0.2.1-alpha.4` | ✅ | ✅ |
| `0.2.1-alpha.5` (`alpha`) | ✅ | ✅ |
| `0.2.1-rc.2` (`next`) | ✅ | ✅ |

CI runs the matrix on Windows, Linux and macOS, nightly too, so new DSH releases are caught early. Details: [docs/compatibility.md](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md).

## 🧠 How the agent decides

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/routing.svg" alt="The agent routes each prompt to plain text, ui_render or ui_render_widget; local interactions never call the model, explicit actions go back to the agent" width="100%">

The plugin injects a system-prompt section (`src/guidance.js`) that makes the model route each turn itself. There is no command and no external router:

- **Plain text** for greetings, short facts, explanations, code to copy, and workspace/coding work.
- **`ui_render`** for structured answers: comparisons, data, dashboards, processes, formulas, functions to explore, choices, input collection.
- **`ui_render_widget`** when the user wants to explore, manipulate or watch something the catalog cannot draw: 3D, simulations, animations, games, custom tools.
- **Local first:** anything computable in the browser (sliders, rotation, zoom, filtering, sorting, recomputing) must update instantly without a message to the model.

`/ui <request>` still exists to force a UI answer.

| Tool | Use it for | Rendering |
|---|---|---|
| `ui_render` | Structured answers | Native React components from a fixed catalog, rendered progressively as the JSON streams |
| `ui_patch` | Changing a UI shown earlier | Component-level operations on that UI; untouched components keep their state ([details](#-updating-a-ui-in-place-ui_patch)) |
| `ui_render_widget` | Custom visuals, 3D, simulations, mini-apps | HTML/CSS/JS in an opaque-origin sandboxed iframe: CSS first, HTML morphed in live, JS last, all in **one** iframe |

## 🧩 Component catalog (`ui_render`)

| Category | Components |
|---|---|
| Layout | `Card`, `Stack`, `Grid`, `Tabs` (keyboard navigable) |
| Text & callouts | `Text` (markdown subset), `Code`, `Alert`, `Badge`, `Divider` |
| Data | `Stat`, `Progress`, `List`, `Table` (sortable), `Timeline` |
| Charts | `Chart`: bar / line / area / pie, stacked, hover tooltip, toggleable legend |
| Math & diagrams | **`Plot`** (y = f(x) with parameter sliders that redraw instantly; expressions run in a safe compiler, never `eval`), **`Math`** (KaTeX), **`Mermaid`** (flowchart, sequence, class, state, ER, gantt, mindmap…) |
| Interaction | `Button` (sends a prompt), `Form` (text, number, **range slider**, select, checkbox, date, textarea; submits the values as a message) |

A UI travels as a **flat node list with id references**, because DSH's tool-schema subset has no recursion. The Host validates it before acknowledging: unknown types or props, dangling or duplicate ids, cycles, two parents, chart length mismatches, `Plot` expressions that do not compile, slider defaults out of range, and so on. Problems come back as `ok:false` with paths, so the model can fix them and retry.

`Math` and `Mermaid` render inside the same sandbox as widgets, loading KaTeX or Mermaid from the CDN allowlist. No third-party code runs in the DSH page. If the CDN is unreachable, the source text and a static fallback status are shown. An [optional offline resource package](docs/offline-resources.md) embeds locked KaTeX/fonts, Mermaid, Three.js/OrbitControls, D3, Chart.js and canvas-confetti without opening the sandbox network.

## 🔁 Updating a UI in place (`ui_patch`)

When the user asks to change a UI shown earlier ("make that bar chart a line chart; leave the rest"), the agent patches it by component id instead of re-sending the whole tree.

- **Identity:** every `ui_render` result tells the model the UI's `uiId` (its call id) and `version` 1. Each accepted patch reports the new version and an `id:Type` outline of the components.
- **Operations:** `setProps` (merge props, `unset` to remove), `replaceNode` (same id, new type/props/children), `insertChild` (new components under a container), and `removeNode`. They apply in order and **all-or-nothing**. The whole next version then passes the same checks as a fresh `ui_render` (types, props, references, cycles, depth, sizes, Tabs labels).
- **Concurrency:** `baseVersion` is required. A patch based on an older version is refused as stale and reports the current version, so the model re-derives the patch and retries. Patches run exclusively (never in parallel), so versions form one ordered chain.
- **Scope:** the Host stores nothing. It rebuilds the current version by replaying the conversation's own history (accepted renders, then accepted patches), so a patch can only address UIs of the same conversation. Unknown ids, other conversations' UIs and UIs dropped by context compaction are refused, and the model falls back to `ui_render`.
- **State:** components keep their ids across versions, and interaction state is keyed by `uiId` + component id. Every component a patch does not replace keeps its table sort, selected tab, form input, submitted lock and Plot slider positions. A `replaceNode`d component starts fresh; to reset any component, give it a new id. Form fields added by a patch start at their defaults.
- **Display:** while a patch streams or runs, its card is a one-line "Updating the UI…" status and the previous version stays live, so a half-applied patch is never drawn. On success the next version renders beneath the new reply and the older copy collapses to "Updated to version N". A refused, failed or stopped patch leaves the previous version untouched. The full snapshot travels in the durable result meta, so a reload shows the latest version.
- **Widgets** (`ui_render_widget`) are not patched: the agent re-renders them, and they keep their `UI.state` when it does.

## 🪟 Sandboxed widgets (`ui_render_widget`)

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/widget-streaming.svg" alt="Widget fields stream in order: placeholder, then a live preview with morphed HTML, then the same iframe is finalized and the code runs" width="100%">

Fields follow the OpenIntelligentUI streaming contract, **in this order**: `title`, `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`.

- **Streaming:** placeholder lines show until `css` is complete. Then a preview frame opens and the cleaned partial `html` is morphed in ([idiomorph](https://github.com/bigskysoftware/idiomorph)). When the arguments are complete, the **same frame is finalized in place**: the final HTML is morphed and the code runs. There is no rebuild, blank flash or height jump.
- **Runtime helpers** (global `UI`):

  | Helper | What it does |
  |---|---|
  | `UI.three(el, { camera, target, autoRotate })` | Renderer, scene, lights and OrbitControls (drag rotates, wheel/pinch zooms); renders on demand and handles resize |
  | `UI.canvas(el, draw)` | HiDPI 2D canvas, redrawn on resize and theme change |
  | `UI.state` / `UI.setState()` | Persisted state; inputs with an `id` are persisted and restored automatically |
  | `UI.color('accent')` / `UI.css()` | Opaque theme color for three.js/canvas / raw CSS value |
  | `UI.onTheme(cb)`, `UI.scheme`, `UI.reducedMotion` | React to theme and motion preferences |
  | `.ui-row`, `.ui-control`, `.ui-card`, `.ui-stage` | Helper classes |

- **Bridge:** `Bridge.sendPrompt({ text })` disables the clicked control until the host answers, so double clicks cannot queue duplicates. `Bridge.openLink({ url })` opens links, and `Websandbox.connection.remote.*` is kept for OpenIntelligentUI compatibility.
- **Libraries:** an importmap maps `three`, `three/addons/…`, `d3`, `chart.js/auto`, `gsap` and `canvas-confetti` to esm.sh.
- **Recovery:** script errors show a count with **Reload** and **Ask to fix** (the latter sends the errors to the agent).

### Where the UI appears, and what survives

- While a turn runs, the UI renders inline inside the tool call. One component instance spans preparing → running → result, so interaction state carries over.
- When the turn ends, DSH folds tool calls into the "process" section. The plugin re-presents each UI **beneath the reply** (`conversation.chat.turnTail`), and the inline copy shrinks to a pointer.
- **Interaction state persists per UI** (per tool call; patched versions share their `ui_render` call's state): the open tab, table sort, form values, the submitted lock, Plot sliders, widget controls and `UI.state`, and frame heights. It lives in memory and in `localStorage` (bounded), so moving beneath the reply or reloading the page restores it. The UIs themselves are rebuilt from the durable session log.
- **Stopped generation:**
  - If the call already reached DSH, the view keeps the finished part (a static widget preview or the completed components) with a notice and a **Regenerate** button.
  - If the user stops while the arguments are still streaming, DSH drops the call entirely. The plugin stashes what was streamed and shows it beneath the stopped turn the same way.

## 🔒 Security model

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/security.svg" alt="Widgets run in an opaque-origin sandboxed iframe under a strict CSP; access to the host page is blocked and only token-checked postMessage calls reach the rate-limited bridge" width="100%">

- **Widget isolation:** widgets run in `<iframe sandbox="allow-scripts allow-forms">` with `srcdoc` and **no** `allow-same-origin`. They cannot reach the DSH page, its cookies or storage, or its API. The E2E checks this in the browser: `parent.document`, `localStorage` and `document.cookie` all throw `SecurityError`, `fetch` is blocked, and `window.origin === "null"`.
- **CSP:** `default-src 'none'`; scripts, styles, fonts and images load only from `cdnAllowlist`; `connect-src 'none'` unless `allowNetwork` is on; `form-action 'none'` and `base-uri 'none'`.
- **Messages from the frame:** they are accepted only from that frame's `contentWindow`, must carry a per-frame random token, and are shape-checked. Persisted widget state is size-limited JSON. The E2E checks that forged messages from the page or the frame are dropped.
- **`sendPrompt` limits:** refused during the first second after mount; at most one send every 2 seconds; text capped at `sendPromptMaxChars`; queued as a normal user message.
- **`openLink`:** https only, optionally restricted to `openLinkAllowedOrigins`.
- **Catalog:** text renders as React elements, never raw HTML. `Plot` expressions are compiled by a tokenizer/parser over a fixed math function table, with no `eval`, `Function`, or property access.

## ⚙️ Configuration

The bundle patch inserts the plugin row automatically. To change settings, add to your profile's `cordis.patch.yml`:

```yaml
- id: intelligent-ui
  config:
    allowNetwork: true
    cdnAllowlist: [https://esm.sh, https://cdn.jsdelivr.net]
```

| Option | Default | Meaning |
|---|---|---|
| `enableCatalog` | `true` | Register `ui_render` and `ui_patch` |
| `enableWidget` | `true` | Register `ui_render_widget` |
| `injectGuidance` | `true` | Add the "when to use UI" system-prompt section |
| `cdnAllowlist` | esm.sh, jsdelivr, unpkg | Origins widgets (and Math/Mermaid) may load resources from |
| `allowNetwork` | `false` | Let widgets `fetch` and use WebSocket to those origins |
| `maxWidgetHeight` | `2400` | Maximum frame height (px) |
| `maxWidgetBytes` | `400000` | Reject larger widgets |
| `sendPromptMaxChars` | `4000` | Longest message a widget, button or form may send |
| `openLinkAllowedOrigins` | `[]` | If non-empty, the only origins `openLink` may open |

## 🛠 Develop and verify

```sh
npm install
npm run build       # client-src/ → client/client.js (DSH __ModuleLoader__ factory; React and Cordis external)
npm test            # vitest (catalog, expressions, tools, plugin mount, streaming parser, frame/CSP/bridge, state, theme, views, interruption, turn tail, DSH compatibility gate, installer CLI)
npm run typecheck
npm run e2e:all     # build → install into a temp DSH home → mock model + real DSH Web → 30 browser checks
npm run e2e:all -- --record   # also re-records docs/assets/demo.mp4 / demo.gif (needs ffmpeg)
npm run e2e:all -- --spec ./deepseek-harness-intelligent-ui-<v>.tgz   # E2E the packed tarball instead of the checkout
npm run smoke -- --spec ./deepseek-harness-intelligent-ui-<v>.tgz     # install smoke test (no browser): version gate, bundle row, DSH Web boot
npm run docs:art    # regenerate the animated README illustrations in docs/assets/readme/
npm run eval:real   # real-model quality baseline (needs DEEPSEEK_API_KEY): see below
```

The E2E runs on Windows, Linux and macOS. It finds Chrome per platform (set `CHROME_PATH` to override) and uses `DSH_BIN` to test another `dsh` binary. CI runs everything on all three OSes against every supported DSH line ([compatibility](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)).

- **Layout:** `src/` is the Host half (plain ESM, no build). `client-src/` is the browser half (TSX, bundled with esbuild). `client/client.js` is committed and published so npm, `file:` and git installs need no build step. CI fails if it is stale. Never add a `prepare`/`postinstall` script, because DSH's pnpm blocks plugin build scripts.
- Requires Chrome (`CHROME_PATH`), `dsh` on PATH and, for `--record`, `ffmpeg`. Headless Chrome uses SwiftShader for WebGL.

<details>
<summary><b>✅ What the browser E2E checks</b> (<code>scripts/e2e/browser.mjs</code>)</summary>
<br>

Report: [`docs/e2e-report.json`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/v0.2.1/docs/e2e-report.json).

- Plain Q&A stays text.
- The dashboard streams progressively.
- Chart hover, table sort and tabs are local.
- A form round-trip returns a new UI.
- A second-turn `ui_patch` turns the dashboard chart from bar to line: an invalid first attempt is refused, the old copy collapses, and sort, tab and form state are kept, including after a reload.
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

</details>

<details>
<summary><b>📦 Releasing</b> (maintainers)</summary>
<br>

See [release security and OIDC setup](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/releasing.md).

1. Add the notes under a new `## [x.y.z]` heading in [CHANGELOG.md](CHANGELOG.md).
2. Run `npm version x.y.z` (or `npm version prerelease --preid rc`). This rebuilds `client/client.js` with the new version and tags the commit.
3. Run `git push --follow-tags`. The tag triggers the Release workflow, which:
   - runs the full CI matrix;
   - publishes to npm with provenance (dist-tag `next` for prereleases);
   - smoke-tests the published package on Windows, Linux and macOS;
   - creates the GitHub Release with the changelog section and the tarball.
4. Run `npm run release:check` to perform the same preflight locally.

</details>

## 📊 Real-model quality baseline

A tool call whose arguments parse is not the same as a UI the user can use. `npm run eval:real` measures three layers **separately**, and a pass in one is not evidence for another:

| Layer | What it proves | Latest · 2026-10-16 · `deepseek-flash` |
| --- | --- | :---: |
| **Mock E2E** | Rendering, streaming, interaction, persistence and isolation, with **scripted** model answers | **30 / 30** |
| **Real model · API** | The model picks the right tool, emits valid arguments on the **first** try, and the rendered UI contains the requested components and data. The model sees the plugin's real tools and guidance; the tools' own `execute()` runs, including `ui_patch` | **30 / 32** (94%) |
| **Real model · browser** | What the model generated actually works in real DSH Web + Chrome: it renders, responds to interaction, survives stop/resume and bad networks, and logs no console errors | **9 / 11** automated<br>**8 / 11** after manual review |

| Timing (real model) | p50 | p95 |
| --- | ---: | ---: |
| First visible UI preview (browser) | 7.6 s | 70.2 s |
| UI generation complete (browser) | 11.8 s | 73.4 s |
| Browser-side execution after the stream (widget code, three.js from the CDN) | 26 ms | 2.9 s |
| One model API call | 2.4 s | 75.7 s |

The long tail comes from large Three.js widgets: the model writes 10–20 KB of code before the preview starts.

**What the run found.** These are real model and agent behaviours, not harness noise; each one is a failed or flagged case in the [full report](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/real-model-eval.md):

- **A tool call cut off mid-stream (R-chart):** the chart rendered correctly, but the turn ended while more components were still streaming. The plugin correctly downgraded the card to "generation interrupted, showing the completed part" with a Regenerate button. The automated content checks passed, but the manual review counts it as a failure, and a new check now fails any case that leaves an interrupted card.
- **Agent research instead of a UI (R-table):** DSH's agent spent the whole 5-minute budget researching car specs on the web (20 steps, about 1.3M tokens) and never rendered the table.
- **Three.js scope slips:** two recordings, two variants of the same bug. `view is not defined` in this run and `THREE is not defined` in the previous one: the widget code used a variable outside its scope. The card flags "1 个脚本错误", and the user's **"让模型修复"** button produced a working scene both times.
- **Invalid first attempts (API):** a missing closing brace in nested `props` (D2, both turns) and duplicate component ids (B1). The plugin refuses these and the model fixes them on retry, but the user briefly sees a refused card, so these count as failures.
- **Agent behaviour around the UI:** DSH's agent may first search the workspace, ask a clarifying question, or send sub-agents to research facts. The browser stage answers clarifying questions like a user would (picking the recommended option) and waits for the UI itself, not just for the turn to go idle.

<details>
<summary><b>▶️ Run it</b></summary>
<br>

Put the key in the environment. No credentials file is read, and the run refuses to write a report that still contains the key.

```sh
export DEEPSEEK_API_KEY='<your-key>'          # PowerShell: $env:DEEPSEEK_API_KEY = '<your-key>'
npm run eval:real                              # mock E2E + API + browser; exits 1 on any failure
npm run eval:real -- --repeat 3                # 3 runs per API case → per-case success rates, p50/p95
npm run eval:real -- --record && npm run eval:demo   # also record and cut the demo video
npm run eval:gallery                           # README screenshots on one uniform 1200×750 canvas
```

| Option | Effect |
| --- | --- |
| `--stage mock,api,browser` | Run only some layers (`all` by default). `A`/`B`/`C`/`D` selects API categories, as before. |
| `--only B3,R-chart` | Run only these cases. |
| `--keep-other-layers` | Keep the layers (or, with `--only`, the cases) this run did not execute. Each keeps its own date. |
| `--append` | With `--only`: add the rerun as extra samples. A failure is never replaced by a lucky retry. |
| `--rescore` | Re-judge the last API run from its saved transcripts with the current assertions, with no model calls. |
| `DEEPSEEK_EVAL_MODEL` | Model id (default `deepseek-flash`). |

The **Real-model eval** GitHub workflow runs the same command on demand with the `DEEPSEEK_API_KEY` secret and uploads the report and screenshots. A full run costs about ¥1.5 with `deepseek-flash`.

</details>

<details>
<summary><b>🔬 What each case checks</b></summary>
<br>

**API stage** (`scripts/eval/api-stage.mjs`, 16 cases, assertions v3). Every criterion is its own check, so the report says *which* one failed:

- **Plain text (A1–A4):** no UI tool, a substantive answer.
- **Charts/tables (B1–B3, B5):**
  - KPI tiles named by meaning (revenue, active users incl. 月活/MAU, conversion, order value);
  - a sortable table with all five requested columns;
  - a **bar chart with Q1–Q4 and both an online and an offline series** (the 2026-10-10 B3 answer, a form without a chart, is kept as a test fixture and must fail);
  - a chronology with 4+ milestones (a `Timeline`, or a Mermaid diagram with 4+ ordered years).
- **Form (B4, D1):** range, checkbox and select fields. D1 submits the form exactly as the browser would and requires the follow-up to use the submitted region, quarter count and scenario.
- **Math Plot (C2):** three sliders, *every slider used in the expression*, and an `exp(…)·sin/cos(…)` shape.
- **Three.js and widgets (C1, C3, C4):** `UI.three()`/`import("three")`, animation, lights, start/pause and parameter controls.
- **Multi-turn edits:** D2 adds a column with every per-model value correct and every old value kept. D3 makes two successive edits (bar → line, then a third series with exact values, original series unchanged). `ui_patch` in place is recorded.

Each case records tool choice, first-attempt schema validity versus recovery, API time per call, the model id the API reports and its `system_fingerprint`, and the prompt hash.

**Browser stage** (`scripts/eval/browser-stage.mjs`, 11 cases, each in a new conversation):

- **Plain text:** no card is created.
- **Chart:** legend, Q1–Q4, 8+ bars, local hover tooltip.
- **Table:** clicking a header re-sorts rows with no model call.
- **Form:** filled and submitted with the real mouse and keyboard; the follow-up must mention the submitted values; the form locks.
- **Plot:** dragging a slider redraws the curve.
- **Three.js:** the canvas is **drawn, not blank** (pixel statistics), dragging changes the image, and there are no widget script errors. On failure, the "Ask to fix" path is tried and reported.
- **Stop/resume:** stop mid-stream → static preview, notice and Regenerate → a complete scene.
- **Two in-place edits:** one live card, version 3, line chart, third series.
- **Weak network:** Fast 3G with the cache off.
- **No network:** the CDN is blocked; the failure must be shown on the card, the DSH page must have no uncaught errors, and the chat must keep working.
- **Phone width (390 px):** no overflow; the KPI grid uses at most 2 columns.

Every case also records console errors, with the host page separated from widget frames. DSH run failures such as quota errors are reported as *infrastructure* errors, outside the model's success rate.

Automated checks cannot judge visual quality, so the report also carries a **sampled manual review** of every screenshot.

</details>

> [!IMPORTANT]
> The [2026-10-10 report](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/history/2026-10-10-real-model-eval-report.json) (15/15) is a **historical snapshot**, not a pass rate. It came from an API-only evaluator that passed B3 although no chart was rendered, and it did not keep the arguments needed to rescore it. The current numbers are in [`docs/real-model-eval.md`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/real-model-eval.md) (human-readable) and [`docs/real-model-eval-report.json`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/real-model-eval-report.json).

## Limitations

- The default online package needs reachable CDN resources for Math/Mermaid and imported widget libraries. An [optional offline package](docs/offline-resources.md) supports Math, Mermaid and standard Three.js scenes; other addons, GSAP and external media remain unsupported offline. Library failures show an explicit static fallback or widget script error.
- Persisted interaction state is per browser (`localStorage`), not synced across devices.
- Matching a dropped (stopped-while-streaming) call to its turn uses the turn's start/end times. A large clock offset between a remote DSH host and the browser could hide that card. Calls that reached the session log are unaffected.

## Credits

Concepts, the streaming widget contract, and parts of the prompt guidance come from [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Licensed under MIT.

**Whale girl in the demo video.** The DeepSeek whale girl (鲸鱼娘) who narrates the demo, in 26 poses, is by [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) (MIT © Sutera-Diffusus; illustrations by [@SuteraWu](https://github.com/SuteraWu)). The unmodified files and their licence are in [`scripts/eval/demo/assets/whale/`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/tree/main/scripts/eval/demo/assets/whale). They are not part of the npm package.

## Controlled data and actions

Table and Chart can share a scoped, read-only `dataRef` with local search/filter/sort/paging. Trusted host adapters can register schema-validated actions, with explicit user clicks, permission checks, write approval, and idempotent receipts. See [the integration guide and runnable example](docs/controlled-data-actions.md).
