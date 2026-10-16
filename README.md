<div align="center">

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/hero.svg" alt="DeepSeek Harness Intelligent UI: generative, interactive UI for DeepSeek Harness" width="100%">

**English** · [中文](README.zh-CN.md)

[![CI](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deepseek-harness-intelligent-ui?color=4d6bfe&label=npm)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7%20%E2%80%93%200.2.x-22d3ee)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.13-34d399)](https://nodejs.org)
[![OS](https://img.shields.io/badge/OS-Windows%20%7C%20Linux%20%7C%20macOS-a78bfa)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/main/docs/compatibility.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-97a1c9)](LICENSE)

[Demo](#-demo) · [Quick start](#-quick-start) · [How it decides](#-how-the-agent-decides) · [Widgets](#-sandboxed-widgets-ui_render_widget) · [Security](#-security-model) · [Configuration](#%EF%B8%8F-configuration) · [Develop](#-develop-and-verify)

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

![DeepSeek Harness Intelligent UI demo](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/demo.gif)

🎥 **Full-quality video (H.264, ~2 min):** [docs/assets/demo.mp4](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/v0.2.1/docs/assets/demo.mp4)

> [!NOTE]
> The recording comes from the real DSH Web 0.2.0-rc.1 with this plugin installed, driven by `npm run e2e:all -- --record`. The model behind it is the **scripted mock** in `scripts/e2e/` (no API key was available), so the answers are canned. Everything you see (streaming, rendering, interaction, the round trips, persistence, isolation) is the real plugin running in DSH.

<details>
<summary><b>📸 Screenshot gallery</b> (dashboard, Three.js, math, forms, streaming, dark mode, phone, reload)</summary>
<br>

| Dashboard streams in, then settles | Three.js widget: R slider, rotate, zoom |
|:---:|:---:|
| ![Dashboard](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/3-dashboard.png) | ![Sphere](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/7-widget-rotated.png) |
| *Stat, Grid, Tabs, stacked bar chart with hover tooltip, sortable table, timeline, form* | *`x²+y²+z²=2Rz` via `UI.three()`: the slider re-shapes the surface locally* |

| Math, live Plot, Mermaid | Form → agent → new UI |
|:---:|:---:|
| ![Math](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/9-math.png) | ![Form](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/4-form-sent.png) |
| *KaTeX formula, `Plot` with parameter sliders (no model call), Mermaid flowchart* | *Submitted values reach the agent, which answers with a forecast chart* |

| Streaming preview (same iframe becomes final) | Stopped mid-generation |
|:---:|:---:|
| ![Preview](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/5-widget-preview.png) | ![Stopped](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/10-stopped.png) |

| Dark theme | Phone width (dark) | After reload |
|:---:|:---:|:---:|
| ![Dark](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/11b-dark-widget.png) | ![Mobile](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/12-mobile-dark.png) | ![Reload](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/v0.2.1/docs/assets/screenshots/14-reload.png) |

To get an inline player on GitHub, drag `docs/assets/demo.mp4` into a GitHub comment or release editor and paste the resulting `https://github.com/user-attachments/assets/…` URL on its own line here. GitHub only renders inline video for uploaded attachments, not for repository files.

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
| Pin a version | `dsh plugin --profile web add deepseek-harness-intelligent-ui@0.2.3` |
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
| `0.2.1-alpha.4` (`alpha`) | ✅ | ✅ |

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

`Math` and `Mermaid` render inside the same sandbox as widgets, loading KaTeX or Mermaid from the CDN allowlist. No third-party code runs in the DSH page and the host bundle stays small (~127 KB). If the CDN is unreachable, the source text is shown instead.

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
- **Interaction state persists per tool call:** the open tab, table sort, form values, the submitted lock, Plot sliders, widget controls and `UI.state`, and frame heights. It lives in memory and in `localStorage` (bounded), so moving beneath the reply or reloading the page restores it. The UIs themselves are rebuilt from the durable session log.
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
| `enableCatalog` | `true` | Register `ui_render` |
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
npm run e2e:all     # build → install into a temp DSH home → mock model + real DSH Web → 24 browser checks
npm run e2e:all -- --record   # also re-records docs/assets/demo.mp4 / demo.gif (needs ffmpeg)
npm run e2e:all -- --spec ./deepseek-harness-intelligent-ui-<v>.tgz   # E2E the packed tarball instead of the checkout
npm run smoke -- --spec ./deepseek-harness-intelligent-ui-<v>.tgz     # install smoke test (no browser): version gate, bundle row, DSH Web boot
npm run docs:art    # regenerate the animated README illustrations in docs/assets/readme/
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

<details>
<summary><b>🤖 Real-model evaluation</b></summary>
<br>

The API suite checks model routing, tool-argument schemas, and selected requested components or data across 15 prompts. It does **not** execute model-generated widgets in a browser or verify factual data, visual quality, physics, or interaction behavior. The separate browser E2E uses scripted model responses.

The checked-in [historical report](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/v0.2.1/docs/real-model-eval-report.json) was produced by the earlier evaluator. Its 15/15 result is not a current pass rate: B3 was incorrectly accepted despite containing no Chart. Other cases need a new run under the stricter assertions; the original report is retained with an audit note.

The current suite requires rendered components (not orphan nodes), a sortable table for B2, a four-quarter multi-series bar chart for B3, range/checkbox form controls for B4, and parameter sliders for a native C2 Plot. Multi-turn cases validate all tool calls, acknowledge each call, require the submitted APAC/4/Optimistic parameters, and check all three requested screen sizes while retaining existing table values. These are automated assertions, not a complete quality assessment.

Set `DEEPSEEK_API_KEY` in the environment before running; no credentials file is read:

```sh
export DEEPSEEK_API_KEY='<your-key>'
node scripts/run-real-model-suite.mjs all   # A, B, C, D or all
```

```powershell
$env:DEEPSEEK_API_KEY = '<your-key>'
node scripts/run-real-model-suite.mjs all
```

Each invocation writes only that run's cases to `docs/real-model-eval-report.json`. A partial run does not merge older cases into a new timestamp. Failed assertions/API calls exit with code 1; an invalid category or missing key fails before changing the report. Keep keys out of git.

</details>

## Limitations

- Widgets, Math and Mermaid need the CDN allowlist to be reachable. Offline, Math/Mermaid fall back to source text and `UI.three` reports a script error.
- Persisted interaction state is per browser (`localStorage`), not synced across devices.
- Matching a dropped (stopped-while-streaming) call to its turn uses the turn's start/end times. A large clock offset between a remote DSH host and the browser could hide that card. Calls that reached the session log are unaffected.

## Credits

Concepts, the streaming widget contract, and parts of the prompt guidance come from [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Licensed under MIT.
