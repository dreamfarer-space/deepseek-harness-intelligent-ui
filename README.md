<div align="center">

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/hero.svg" alt="DeepSeek Harness Intelligent UI: generative, interactive UI for DeepSeek Harness" width="100%">

**English** · [中文](README.zh-CN.md)

[![CI](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deepseek-harness-intelligent-ui?color=4d6bfe&label=npm)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![npm downloads (last 18 months)](https://img.shields.io/npm/dt/deepseek-harness-intelligent-ui?color=22d3ee&label=npm%20downloads)](https://www.npmjs.com/package/deepseek-harness-intelligent-ui)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-0.1.7%20%E2%80%93%200.2.x-22d3ee)](docs/compatibility.md)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022.13-34d399)](https://nodejs.org)
[![OS](https://img.shields.io/badge/OS-Windows%20%7C%20Linux%20%7C%20macOS-a78bfa)](docs/compatibility.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-97a1c9)](LICENSE)

[Demo](#-demo) · [Quick start](#-quick-start) · [How it decides](#-how-the-agent-decides) · [Components](#-component-catalog-ui_render) · [Widgets](#-sandboxed-widgets-ui_render_widget) · [Extending](#-extending) · [Security](#-security-model) · [Configuration](#%EF%B8%8F-configuration) · [Quality](#-real-model-quality-baseline) · [Develop](#-develop-and-verify)

</div>

Generative, interactive UI for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Ask in plain language and the agent decides on its own how to answer:

- **plain text** when that reads best;
- **native components**: dashboards, data grids, charts, scatter plots and heatmaps, timelines, live function plots, KaTeX math, Mermaid diagrams, code diffs, file trees, JSON trees, forms and choice cards;
- a fully custom **sandboxed live widget**: Three.js scenes, canvas simulations, mini-apps.

The UI renders progressively while the answer streams. Sorting, filtering, sliders, rotation, zoom and tabs respond instantly in the browser. Only explicit actions (a button, a form, a choice, `Bridge.sendPrompt`) go back to the agent, either in the current session or in a new one.

It ports the ideas of CopilotKit's [OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (Open Generative UI + A2UI-style declarative components) onto DSH's own extension points, with no CopilotKit, LangGraph or external router.

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
Sort, search, filter, page, export, hover, sliders, rotation and tabs run in the browser and never call the model.

</td>
</tr>
<tr>
<td valign="top">

### 🧩 26 components
From cards and tabs to data grids, `Scatter`, `Heatmap`, `Plot`, `Math`, `Mermaid`, `CodeDiff` and `Choice`. Every UI is validated before it renders.

</td>
<td valign="top">

### 🔒 Sandboxed by default
Opaque-origin iframe, strict CSP, token-checked messages and a rate-limited bridge, all verified in a real browser.

</td>
<td valign="top">

### 💾 State that survives
Tabs, sort, filters, form values, sliders and `UI.state` survive turn folding, in-place edits, page reloads and stopped generations.

</td>
</tr>
</table>

## 🎬 Demo

### The real DeepSeek model, end to end

https://github.com/user-attachments/assets/e4eb0adc-659e-4c80-b473-449aa42ca00f

<img align="right" width="110" src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/scripts/eval/demo/assets/whale/greet.webp" alt="The DeepSeek whale girl who narrates the demo">

All 11 browser cases of the [quality baseline](#-real-model-quality-baseline), generated live by **`deepseek-flash`** in DSH Web 0.2.0-rc.1 (2026-10-16): text, chart, table, form round trip, `Plot`, Three.js with "Ask to fix", stop → regenerate, two in-place edits, Fast 3G, CDN offline and phone width. Failures are left in and marked ✗. The DeepSeek whale girl (鲸鱼娘) narrates ([credits](#credits)). Full video: [docs/assets/real-model/demo.mp4](docs/assets/real-model/demo.mp4) (2 min 27 s).

<details>
<summary><b>🖼️ Results at a glance</b> (screenshots per case)</summary>
<br>

| Multi-series chart: **✗** (call cut off mid-stream) | Two in-place edits with `ui_patch`: ✓ |
|:---:|:---:|
| ![Chart](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/chart.png) | ![Patched](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/patched.png) |
| *The chart is right, but the card says "generation interrupted"* | *"Make it a line chart", then "add 小程序 30/45/60/80": one card, version 3* |
| **Form submit → the agent uses the values: ✓** | **Damped oscillation `Plot` with live sliders: ✓** |
| ![Form follow-up](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/form-followup.png) | ![Plot](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/plot.png) |
| **Three.js: ✗, then repaired with "Ask to fix"** | **Stopped mid-stream → regenerated: ✓** |
| ![Three.js repaired](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/three-repaired.png) | ![Regenerated](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/regenerated.png) |
| **Fast 3G, cache off: ✓** | **CDN unreachable: ✓ (degrades as designed)** |
| ![Weak network](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/weak-network.png) | ![Offline](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/offline.png) |
| **Phone width (390 px): ✓** | **Sortable table: ✗ (agent researched instead)** |
| ![Mobile](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/mobile.png) | ![Table](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/table.png) |

GIF version for viewers that cannot play video (e.g. npm): [demo.gif](https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/real-model/demo.gif).

</details>

### Feature tour

Recorded live in the **DeepSeek Harness desktop app** with real DeepSeek models through the magpie gateway; nothing is scripted. The camera follows the cursor and zooms into each interaction; waits for the model are fast-forwarded (the badge shows the speed).

**`Choice`: pick one option, continue here or start it in a new session** · DeepSeek-V4.1-Flash

https://github.com/user-attachments/assets/1317993c-17b1-4fca-9356-c365afcc6101

**`Table` as a data grid: typed sorting, search, per-column filters, paging, CSV export** · DeepSeek-V4.1-Flash

https://github.com/user-attachments/assets/be9c74e4-2ed3-402c-bd08-d57ea8516eec

**`Scatter` and `Heatmap`: hover, tap and keyboard inspection; missing data hatched, never 0** · DeepSeek-Flash

https://github.com/user-attachments/assets/cb575946-bab5-4551-9621-489dee55df07

**`CodeDiff`, `FileTree` and `JsonView`: code as text, collapsible context, JSONPath copy** · DeepSeek-Flash

https://github.com/user-attachments/assets/75900041-3880-4e21-97f8-21bfd41872ad

## 🚀 Quick start

You need [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **0.1.7 – 0.2.x** (`>=0.1.7-rc.1 <0.3.0`) and Node.js ≥ 22.13, on Windows, Linux or macOS. Nothing is compiled during install: the package ships its prebuilt browser bundle and has no install scripts.

```sh
dsh plugin --profile web add deepseek-harness-intelligent-ui
```

Restart DSH Web (`dsh web`) and ask for something visual, for example *"compare Q1–Q4 revenue by channel"* or *"let me explore x²+y²+z²=2Rz in 3D"*. In the **desktop app**, use **Plugins → Add plugin** with the same package name.

The guided installer checks Node, the `dsh` version, pnpm and the profile first, then runs the same `dsh plugin add`:

```sh
npx deepseek-harness-intelligent-ui install     # --profile <name>, --dsh <path>, --dry-run
npx deepseek-harness-intelligent-ui doctor      # diagnose only
```

| Task | Command |
|---|---|
| Upgrade | `dsh plugin --profile web add deepseek-harness-intelligent-ui@latest` |
| Try a prerelease (when a `next` dist-tag exists) | `dsh plugin --profile web add deepseek-harness-intelligent-ui@next` |
| Pin a version | `dsh plugin --profile web add deepseek-harness-intelligent-ui@0.2.7` |
| Uninstall | `dsh plugin --profile web remove deepseek-harness-intelligent-ui` (or `npx deepseek-harness-intelligent-ui uninstall`) |
| From a checkout | `dsh plugin --profile web add file:/path/to/deepseek-harness-intelligent-ui` |

<details>
<summary><b>🩺 Troubleshooting</b></summary>
<br>

- *`pnpm was not found`*: DSH installs plugins with pnpm. Run `corepack enable` (it ships with Node) or `npm i -g pnpm`.
- *`… is incompatible with dsh X`*: your DSH is outside the supported range. Upgrade DSH (`npm i -g @deepseek-ai/dsh@latest`) or check [compatibility](docs/compatibility.md) for a plugin release that supports it.
- *Upgrading from 0.1.x (`dsh-intelligent-ui` via `file:`)*: run `dsh plugin --profile web remove dsh-intelligent-ui` first. Both packages insert the same `intelligent-ui` row, and `doctor` reports the conflict.
- *The UI does not appear*: restart DSH Web after installing, and make sure you started the profile you installed into.

</details>

**Compatibility.** CI installs the packed plugin and runs the full browser E2E on Windows, Linux and macOS against DSH `0.1.7-rc.2`, `0.2.0-rc.1`, `latest`, `next` and `alpha`, on every push and nightly, so new DSH releases are caught early. Details and local verification history: [docs/compatibility.md](docs/compatibility.md).

## 🧠 How the agent decides

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/routing.svg" alt="The agent routes each prompt to plain text, ui_render or ui_render_widget; local interactions never call the model, explicit actions go back to the agent" width="100%">

The plugin injects a system-prompt section ([`src/guidance.js`](src/guidance.js)) so the model routes each turn itself:

- **Plain text** for greetings, short facts, explanations, code to copy, and workspace/coding work.
- **`ui_render`** for structured answers: comparisons, data to explore, dashboards, processes, formulas, functions, code reviews, choices between alternatives, input collection.
- **`ui_render_widget`** for what the catalog cannot draw: 3D, simulations, animations, games, custom tools.
- **Local first:** anything computable in the browser must update instantly without a message to the model.

Why these rules were kept after a real-model A/B against a rewritten decision order, and how routing is measured: [docs/presentation-routing.md](docs/presentation-routing.md).

`/ui <request>` forces a UI answer.

| Tool | Use it for | Rendering |
|---|---|---|
| `ui_render` | Structured answers | Native React components from a fixed catalog, rendered progressively as the JSON streams |
| `ui_patch` | Changing a UI shown earlier | Component-level operations; untouched components keep their state ([details](#-updating-a-ui-in-place-ui_patch)) |
| `ui_render_widget` | Custom visuals, 3D, simulations, mini-apps | HTML/CSS/JS in an opaque-origin sandboxed iframe: CSS first, HTML morphed in live, JS last, all in **one** iframe |

## 🧩 Component catalog (`ui_render`)

| Category | Components |
|---|---|
| Layout | `Card`, `Stack`, `Grid`, `Tabs` (keyboard navigable) |
| Text & callouts | `Text` (markdown subset), `Code`, `Alert`, `Badge`, `Divider` |
| Data | `Stat`, `Progress`, `List`, `Timeline`, **`Table`** as a data grid: typed sorting (numbers, ISO dates, booleans), search, per-column filters, paging, CSV/Markdown export |
| Charts | **`Chart`** (bar / line / area / pie, stacked, legend toggles, hover/tap/keyboard tooltips, data export), **`Scatter`** (continuous x/y), **`Heatmap`** (sequential or diverging scale, explicit missing cells) |
| Maps | **`Map`** (markers, routes, groups; drag/keyboard pan and zoom; a built-in offline world outline, or the tile basemap you configure) |
| Media | **`Image`** and **`Gallery`** (photos from https URLs, lazy and without a Referer, captions and linked credits, a modal full-size viewer with arrow keys; a broken photo shows its description) |
| Math & diagrams | **`Plot`** (y = f(x) with sliders that redraw instantly; a safe expression compiler, never `eval`), **`Math`** (KaTeX), **`Mermaid`** |
| Code & structure | **`CodeDiff`** (multi-file before/after or unified patch), **`FileTree`** (status badges), **`JsonView`** (JSONPath, copy) |
| Interaction | `Button`, **`Choice`** (single-choice card), `Form` (text, number, range slider, select, checkbox, date, textarea) |

- **Validated before it renders.** A UI travels as a flat node list with id references (DSH's tool schema has no recursion). The Host rejects unknown types or props, dangling or duplicate ids, cycles, shape mismatches (chart series, heatmap rows), non-finite numbers, uncompilable `Plot` expressions, out-of-range map coordinates and oversized data, returning `ok:false` with paths so the model fixes and retries.
- **Text, never HTML.** Cells, code, JSON and labels render as React text. CSV export neutralises spreadsheet formula injection and is RFC 4180 with a UTF-8 BOM.
- **Accessible and responsive.** Charts are focusable and keyboard-inspectable, trees use `role=tree`, touch targets grow on coarse pointers, and charts lay out at the card's real width so axis text stays legible on phones.
- **`Math` and `Mermaid`** render in the same sandbox as widgets from the CDN allowlist, with a static fallback when the CDN is unreachable, or fully offline with the [offline resource package](docs/offline-resources.md).

### Choice and new sessions

`Choice` shows a question with option cards and two buttons. **Continue in this session** sends the picked option's prompt as your next message. **Start new session** creates a session in the same workspace, submits that prompt there and opens it; nothing from the current conversation is copied, so each option's prompt is self-contained. `Button` can do the same with `sessionTarget: "new"`. The launch is idempotent: a double click, a retry after a failure or a reload never starts the task twice.

Roadmap and design notes for upcoming components (`Map`, `Calendar`): [docs/component-roadmap.md](docs/component-roadmap.md).

## 🔁 Updating a UI in place (`ui_patch`)

When the user asks to change a UI shown earlier ("make that bar chart a line chart; leave the rest"), the agent patches it by component id instead of re-sending the whole tree.

- **Identity:** every `ui_render` result reports the UI's `uiId` and `version` 1; each accepted patch reports the new version and an `id:Type` outline.
- **Operations:** `setProps` (merge, `unset` to remove), `replaceNode`, `insertChild` and `removeNode`, applied in order and **all-or-nothing**. The next version then passes the same checks as a fresh `ui_render`.
- **Concurrency:** `baseVersion` is required; a stale patch is refused with the current version, and patches never run in parallel.
- **Scope:** the Host stores nothing. It rebuilds the current version by replaying the conversation's own history, so a patch can only address UIs of the same conversation.
- **State:** components keep their ids across versions, so untouched components keep their sort, filters, tab, form input, submitted lock and slider positions. A replaced component starts fresh.
- **Display:** while a patch streams, the previous version stays live. On success the new version renders beneath the reply and the older copy collapses to "Updated to version N". Refused, failed or stopped patches change nothing.
- **Widgets** are re-rendered rather than patched, and keep their `UI.state`.

## 🪟 Sandboxed widgets (`ui_render_widget`)

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/widget-streaming.svg" alt="Widget fields stream in order: placeholder, then a live preview with morphed HTML, then the same iframe is finalized and the code runs" width="100%">

Fields follow the OpenIntelligentUI streaming contract, **in this order**: `title`, `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions`. Placeholder lines show until `css` is complete; then a preview frame opens and the partial `html` is morphed in ([idiomorph](https://github.com/bigskysoftware/idiomorph)); when the arguments are complete, the **same frame is finalized in place** and the code runs.

| Runtime helper | What it does |
|---|---|
| `UI.three(el, { camera, target, autoRotate })` | Renderer, scene, lights and OrbitControls (drag rotates, wheel/pinch zooms); renders on demand and handles resize |
| `UI.canvas(el, draw)` | HiDPI 2D canvas, redrawn on resize and theme change |
| `UI.state` / `UI.setState()` | Persisted state; inputs with an `id` are persisted and restored automatically |
| `UI.color('accent')` / `UI.css()` | Opaque theme color for three.js/canvas / raw CSS value |
| `UI.onTheme(cb)`, `UI.scheme`, `UI.reducedMotion` | React to theme and motion preferences |
| `.ui-row`, `.ui-control`, `.ui-card`, `.ui-stage` | Helper classes |

- **Bridge:** `Bridge.sendPrompt({ text })` disables the clicked control until the host answers; `Bridge.openLink({ url })` opens links; `Websandbox.connection.remote.*` is kept for OpenIntelligentUI compatibility.
- **Libraries:** an importmap maps `three`, `three/addons/…`, `d3`, `chart.js/auto`, `gsap` and `canvas-confetti` to esm.sh.
- **Recovery:** script errors show a count with **Reload** and **Ask to fix** (which sends the errors to the agent).

### Where the UI appears, and what survives

- While a turn runs, the UI renders inline in the tool call; one component instance spans preparing → running → result.
- When the turn ends, DSH folds tool calls into the "process" section, so the plugin re-presents each UI **beneath the reply** and the inline copy shrinks to a pointer.
- Interaction state is kept per UI in memory and in `localStorage` (bounded), so moving beneath the reply or reloading restores it. The UIs themselves are rebuilt from the durable session log.
- A stopped generation keeps the finished part (a static widget preview or the completed components) with a notice and **Regenerate**, even when DSH dropped a call that was still streaming.

## 🔌 Extending

| | |
|---|---|
| **Third-party components** | Trusted companion plugins register versioned, namespaced components with shared Host/browser props validation, React renderers and disable/uninstall lifecycle. Model output can never register or load code. [Extension API and GitDiffViewer template](docs/component-extensions.md) |
| **Controlled data and actions** | `Table` and `Chart` can share a scoped, read-only `dataRef` with local search/filter/sort/paging. Trusted hosts register schema-checked actions that run only after a native click, with permission checks, write approval and idempotent receipts. [Integration guide](docs/controlled-data-actions.md) |
| **Portable renderer** | `renderer/renderer.js` renders accepted `ui_render`, `ui_patch` and widget artifacts outside DSH Web, e.g. in a mobile WebView. [Remote-client contract](docs/portable-renderer.md) |
| **Offline resources** | An optional tarball embeds locked KaTeX/fonts, Mermaid, Three.js, D3, Chart.js and canvas-confetti, so formulas, diagrams and standard 3D scenes work without a CDN. [Offline package](docs/offline-resources.md) |

## 🔒 Security model

<img src="https://raw.githubusercontent.com/dreamfarer-space/deepseek-harness-intelligent-ui/main/docs/assets/readme/security.svg" alt="Widgets run in an opaque-origin sandboxed iframe under a strict CSP; access to the host page is blocked and only token-checked postMessage calls reach the rate-limited bridge" width="100%">

- **Widget isolation:** `<iframe sandbox="allow-scripts allow-forms">` with `srcdoc` and **no** `allow-same-origin`. The E2E verifies in a browser that `parent.document`, `localStorage` and `document.cookie` throw `SecurityError`, `fetch` is blocked, and `window.origin === "null"`.
- **CSP:** `default-src 'none'`; scripts, styles, fonts and images only from `cdnAllowlist`; `connect-src 'none'` unless `allowNetwork`; `form-action 'none'`; `base-uri 'none'`. A per-widget sandbox boundary audit with the measured matrix is in [docs/widget-csp-audit.md](docs/widget-csp-audit.md) and runs as `npm run e2e:security`.
- **What `allowNetwork=false` does and does not stop:** it blocks `fetch`, XHR, WebSocket, `EventSource`, `sendBeacon` and `<a ping>`. It does **not** stop `<img>`, `<script src>`, `<link rel=stylesheet>`, `@font-face` or `<video>` from requesting an **allowlisted** origin, and this implementation emits origin-only `cdnAllowlist` sources, without path restrictions — so an allowlisted CDN can still see widget data in a resource URL. Set `cdnAllowlist: []` to block external resource requests; the offline bundle already does. This does not stop a widget navigating its own frame or sending data in that initial navigation URL.
- **Navigation:** a document-bound MessageChannel prevents a replacement document from receiving host data. A later iframe `load` removes the foreign UI; an unfinished response can delay this visual removal. The initial self-navigation request is still possible. The iframe sandbox blocks top-level navigation, `window.open` and file downloads. A cross-origin download link can still trigger a self-navigation request before the browser blocks saving the response.
- **Messages:** a one-time handshake validates the iframe source and fresh document token before accepting its transferred port. All later messages use that port and validate token/shape; window RPCs and stale ports are rejected (verified in E2E).
- **`sendPrompt` limits:** refused for 1 s after mount, at most one per 2 s, capped at `sendPromptMaxChars`, queued as a normal user message.
- **`openLink`:** https only, optionally restricted to `openLinkAllowedOrigins`.
- **Catalog:** text renders as React elements, never raw HTML; `Plot` expressions are compiled over a fixed math table with no `eval`, `Function` or property access; new-session launches and host actions need an explicit native click.

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
| `allowNetwork` | `false` | Let widgets `fetch` and use WebSocket to those origins. Off still allows resource elements to reach them; use an empty `cdnAllowlist` to block external resource requests (self-navigation is still possible) |
| `maxWidgetHeight` | `2400` | Maximum frame height (px) |
| `maxWidgetBytes` | `400000` | Reject larger widgets |
| `sendPromptMaxChars` | `4000` | Longest message a widget, button, form or choice may send |
| `openLinkAllowedOrigins` | `[]` | If non-empty, the only origins `openLink` may open |
| `mapTileUrl` | `''` | Raster tile template for `Map`, e.g. `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (https with `{z}`/`{x}`/`{y}`). Empty: the offline outline. Follow the provider's tile usage policy |
| `mapTileAttribution` | `''` | Attribution always shown on tiled maps, e.g. `© OpenStreetMap contributors` |
| `mapTileMaxZoom` | `19` | Highest zoom the tile provider serves |
| `mediaAllowedOrigins` | `[]` | If non-empty, the only https origins `Image`/`Gallery` may load from; others show a placeholder. Empty: any https source |

## 📊 Real-model quality baseline

A tool call whose arguments parse is not the same as a UI the user can use. `npm run eval:real` measures three layers **separately**; a pass in one is not evidence for another.

| Layer | What it proves | Latest · 2026-10-16 · `deepseek-flash` |
| --- | --- | :---: |
| **Mock E2E** | Rendering, streaming, interaction, persistence and isolation, with **scripted** answers | **30 / 30** |
| **Real model · API** | Right tool, valid arguments on the **first** try, and the rendered UI contains the requested components and data | **30 / 32** (94%) |
| **Real model · browser** | What the model generated works in real DSH Web + Chrome: renders, interacts, survives stop/resume and bad networks, no console errors | **9 / 11** automated<br>**8 / 11** after review |

| Timing (real model) | p50 | p95 |
| --- | ---: | ---: |
| First visible UI preview | 7.6 s | 70.2 s |
| UI generation complete | 11.8 s | 73.4 s |
| Browser-side execution after the stream | 26 ms | 2.9 s |

The long tail comes from large Three.js widgets (10–20 KB of code before the preview starts). The failures are real model and agent behaviour: a call cut off mid-stream, an agent that researched on the web instead of rendering, Three.js scope slips repaired with "Ask to fix", and invalid first attempts the model fixed on retry. Each case, its checks and the full findings: [docs/real-model-eval.md](docs/real-model-eval.md).

<details>
<summary><b>▶️ Run it</b></summary>
<br>

The key is read from the environment only, and the run refuses to write a report that still contains it.

```sh
export DEEPSEEK_API_KEY='<your-key>'               # PowerShell: $env:DEEPSEEK_API_KEY = '<your-key>'
npm run eval:real                                   # mock E2E + API + browser; exits 1 on any failure
npm run eval:real -- --repeat 3                     # per-case success rates and p50/p95
npm run eval:real -- --record && npm run eval:demo  # record and cut the demo video
```

| Option | Effect |
| --- | --- |
| `--stage mock,api,browser` | Run only some layers (`all` by default); `A`–`F` selects API categories (`F`: paired presentation-routing cases, [#58](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/58)) |
| `--only B3,R-chart` | Run only these cases |
| `--keep-other-layers` | Keep the layers or cases this run did not execute, each with its own date |
| `--append` | With `--only`: add the rerun as extra samples; a failure is never replaced by a lucky retry |
| `--rescore` | Re-judge the last API run from its saved transcripts with the current assertions, no model calls |
| `--report <file.json>` | Write the report elsewhere, e.g. one file per prompt version to compare a baseline with a candidate |
| `DEEPSEEK_EVAL_MODEL` | Model id (default `deepseek-flash`) |

The **Real-model eval** workflow runs the same command on demand with the `DEEPSEEK_API_KEY` secret; a full run costs about ¥1.5 with `deepseek-flash`.

</details>

<details>
<summary><b>🔬 What each case checks</b></summary>
<br>

**API stage** (`scripts/eval/api-stage.mjs`, 16 cases, assertions v3; every criterion is its own check):

- **Plain text (A1–A4):** no UI tool, a substantive answer.
- **Charts/tables (B1–B3, B5):** KPI tiles named by meaning; a sortable table with all five requested columns; a bar chart with Q1–Q4 and both an online and an offline series; a chronology with 4+ milestones.
- **Forms (B4, D1):** range, checkbox and select fields; D1 submits like the browser and requires the follow-up to use the submitted values.
- **Math Plot (C2):** three sliders, every one used in the expression, an `exp(…)·sin/cos(…)` shape.
- **Three.js and widgets (C1, C3, C4):** `UI.three()` or `import("three")`, animation, lights, start/pause and parameter controls.
- **Multi-turn edits (D2, D3):** a new column with every value correct and old values kept; bar → line, then a third series with exact values.
- **Presentation routing (F, not yet in the recorded run):** 21 cases in pairs that keep the topic and change only the task (explain vs. drag a parameter, explain Three.js vs. a rotatable scene here, code to copy vs. a repo change, Markdown table vs. a searchable grid of the user's rows, a formula vs. a derivation with a plot between the steps, a closing Choice vs. a chart after each section), plus a patch that must leave a filtered table untouched, a text-only restriction after a 3D turn and live data without a source. `no-ui` failures are unnecessary UI, `needs-ui` failures missed UI. Details: [#58](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/58).

**Browser stage** (`scripts/eval/browser-stage.mjs`, 11 cases, each in a new conversation): plain text creates no card; chart legend, Q1–Q4 and local hover; table re-sorts without a model call; a form filled and submitted with real mouse and keyboard; Plot slider redraws; Three.js canvas drawn (pixel statistics) and draggable, with "Ask to fix" on failure; stop → preview → Regenerate; two in-place edits; Fast 3G; CDN blocked; 390 px phone width. Console errors are recorded per case, and every screenshot is reviewed by hand.

</details>

## 🛠 Develop and verify

```sh
npm install
npm run build            # client-src/ → client/client.js and renderer/renderer.js
npm test                 # unit and component tests (vitest)
npm run typecheck
npm run e2e:all          # build → install into a temp DSH home → scripted model + real DSH Web → browser checks
npm run e2e:controlled   # controlled data/actions in real Chromium
npm run e2e:extensions   # third-party component template in real Chromium
npm run e2e:offline      # offline resource package with the network cut
npm run smoke -- --spec ./deepseek-harness-intelligent-ui-<v>.tgz   # install smoke test of a packed tarball
npm run demo:features    # re-record the feature-tour videos in the DSH desktop app
npm run docs:art         # regenerate the README illustrations
```

- **Layout:** `src/` is the Host half (plain ESM, no build); `client-src/` is the browser half (TSX, bundled with esbuild). `client/client.js` and `renderer/renderer.js` are committed and published so npm, `file:` and git installs need no build step; CI fails if they are stale. Never add a `prepare`/`postinstall` script: DSH's pnpm blocks plugin build scripts.
- **E2E** needs Chrome (`CHROME_PATH` to override), `dsh` on PATH (`DSH_BIN` to override) and runs on Windows, Linux and macOS. `--spec <tgz>` tests a packed tarball, `--record` re-records the scripted demo, `E2E_DATA_ONLY=1` / `E2E_SESSION_ONLY=1` run one group.
- **Feature-tour videos:** start the desktop app with `--remote-debugging-port=9333`, select the model, then `npm run demo:features` ([`scripts/demo/`](scripts/demo)).

<details>
<summary><b>✅ What the browser E2E checks</b> (<code>scripts/e2e/browser.mjs</code>)</summary>
<br>

- Plain Q&A stays text; the dashboard streams progressively.
- Chart hover, table sort and tabs are local; a form round trip returns a new UI.
- `ui_patch` turns a chart from bar to line: an invalid first attempt is refused, the old copy collapses, state is kept, including after a reload.
- The widget preview is finalized in the same iframe; the Three.js scene renders, rotates and zooms; the R slider is local; `Bridge.sendPrompt` round-trips.
- KaTeX and Mermaid render; Plot sliders are local; earlier UIs keep their state.
- Stop → static preview → Regenerate; dark theme; phone width without overflow; a reload restores every UI and its state.
- The sandbox is isolated and forged messages are ignored.
- **Data tools:** search plus range and date filters, CSV contents and formula neutralisation, scatter hover, heatmap keyboard with 0 vs missing data, CodeDiff without HTML execution, and no model calls for any of it.
- **New sessions:** a native button starts exactly one independent session, without copied history.
- No plugin errors in the console.

</details>

<details>
<summary><b>📦 Releasing</b> (maintainers)</summary>
<br>

1. Open a `chore: prepare x.y.z release` PR: add a `## [x.y.z]` section to [CHANGELOG.md](CHANGELOG.md), run `npm version x.y.z --no-git-tag-version` and `npm run build`, update the pinned version in the READMEs, and check with `npm run release:check`.
2. Merge it once CI is green.
3. Tag the merge commit `vx.y.z` and push the tag. The Release workflow runs the CI matrix, publishes to npm through Trusted Publishing with provenance (`next` for prereleases), smoke-tests the published package on all three OSes and creates the GitHub Release from the changelog section.

OIDC and repository settings: [docs/releasing.md](docs/releasing.md).

</details>

## 📚 Documentation

| Document | Contents |
|---|---|
| [compatibility.md](docs/compatibility.md) | Supported DSH, Node and OS versions; what CI tests |
| [component-roadmap.md](docs/component-roadmap.md) | What issue #17 shipped; `Map` and `Calendar` proposals |
| [component-extensions.md](docs/component-extensions.md) | Third-party component API and template |
| [controlled-data-actions.md](docs/controlled-data-actions.md) | Host data binding and schema-checked actions |
| [portable-renderer.md](docs/portable-renderer.md) | Rendering artifacts outside DSH Web |
| [offline-resources.md](docs/offline-resources.md) | Offline KaTeX/Mermaid/Three.js package |
| [real-model-eval.md](docs/real-model-eval.md) | Real-model evaluation: cases, checks, findings |
| [releasing.md](docs/releasing.md) | Release integrity and npm Trusted Publishing |
| [CHANGELOG.md](CHANGELOG.md) | Changes per release |

## Limitations

- The default online package needs reachable CDN resources for Math/Mermaid and imported widget libraries. The [offline package](docs/offline-resources.md) covers Math, Mermaid and standard Three.js scenes; other addons, GSAP and external media are not included. Library failures show an explicit fallback or script error.
- Interaction state is per browser (`localStorage`), not synced across devices.
- A call dropped while streaming is matched to its turn by start/end time; a large clock offset between a remote DSH host and the browser could hide that card.

## Credits

Concepts, the streaming widget contract and parts of the prompt guidance come from [CopilotKit/OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI) (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The DeepSeek whale girl (鲸鱼娘) who narrates the end-to-end demo, in 26 poses, is by [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume) (MIT © Sutera-Diffusus; illustrations by [@SuteraWu](https://github.com/SuteraWu)). The unmodified files and licence are in [`scripts/eval/demo/assets/whale/`](scripts/eval/demo/assets/whale) and are not part of the npm package.

Licensed under [MIT](LICENSE).
