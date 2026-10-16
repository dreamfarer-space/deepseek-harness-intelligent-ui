# Real-model Generative UI evaluation

> Last updated by `node scripts/run-real-model-suite.mjs all --stage browser --only R-three --keep-other-layers` on **2026-10-16** · model **deepseek-flash** (API reports deepseek-flash) · assertions v3 · prompt 55e5cf438f50 · DSH 0.2.0-rc.1

Built from these invocations (oldest first):

- `node scripts/run-real-model-suite.mjs all --repeat 2 --record` · 2026-10-16 08:12 UTC — all three layers; API ×2 per case; recorded the demo (cost ¥1.54)
- `node scripts/run-real-model-suite.mjs all --rescore` · 2026-10-16 08:38 UTC — API layer re-judged from the saved transcripts after fixing three over-strict assertions (月活 as active users, 指导价 as price, a dated Mermaid flow as a timeline); no model calls
- `node scripts/run-real-model-suite.mjs all --stage browser --only R-three --keep-other-layers` · 2026-10-16 08:41 UTC — a second R-three sample, added as run #2 next to the failed run #1 (merged once by hand with the --append logic, which was added right after)

Three separately measured layers. A pass in one layer is not evidence for another:

| Layer | What it proves | Result |
| --- | --- | --- |
| Mock E2E | Rendering, streaming, interaction, persistence and isolation with **scripted** model answers | **30/30** (100%) · 2026-10-16 (kept from an earlier run) |
| Real model · API | The real model picks the right tool, emits valid arguments and the requested components/data | **30/32** (94%) · 2026-10-16 (kept from an earlier run) |
| Real model · browser | What the real model generated actually renders and works in real DSH Web + Chrome | **11/12** (92%) · 2026-10-16 |

## Real model · API structural assertions

API time per model call: p50 2.4 s · p95 75.7 s · per case p50 11.7 s · p95 102.2 s (n=32)

| Category | Passed | Rate |
| --- | --- | --- |
| text | 8/8 | 100% |
| chart-table | 7/8 | 88% |
| form | 4/4 | 100% |
| threejs | 4/4 | 100% |
| math-plot | 2/2 | 100% |
| widget | 2/2 | 100% |
| multi-turn | 3/4 | 75% |

| Case | Category | Result | Tool | Schema (1st try) | API time | Failure reason |
| --- | --- | --- | --- | --- | --- | --- |
| A1 Plain answer | text | ✅ | none | ✅ | 4.0 s |  |
| A2 Plain answer | text | ✅ | none | ✅ | 11.2 s |  |
| A3 Plain answer | text | ✅ | none | ✅ | 3.5 s |  |
| A4 Plain answer | text | ✅ | none | ✅ | 8.9 s |  |
| B1 Dashboard | chart-table | ❌ | ui_render✗ → ui_render | ❌ (recovered) | 25.9 s | arguments valid on the first attempt (components[10].id: duplicate id "trendCard"; components[13].id: duplicate id "pieCard"; components[17].id: duplicate id "tableCard") |
| B2 Sortable table | chart-table | ✅ | ui_render | ✅ | 30.4 s |  |
| B3 Multi-series chart | chart-table | ✅ | ui_render | ✅ | 8.7 s |  |
| B4 Interactive form | form | ✅ | ui_render | ✅ | 11.1 s |  |
| B5 Timeline | chart-table | ✅ | ui_render | ✅ | 25.3 s |  |
| C1 3D sphere | threejs | ✅ | ui_render_widget | ✅ | 66.9 s |  |
| C2 Slider plot | math-plot | ✅ | ui_render | ✅ | 5.5 s |  |
| C3 Three.js solar system | threejs | ✅ | ui_render_widget | ✅ | 89.1 s |  |
| C4 Pendulum simulator | widget | ✅ | ui_render_widget | ✅ | 67.2 s |  |
| D1 Form submit → follow-up | form | ✅ | ui_render → ui_render | ✅ | 12.2 s |  |
| D2 Add a table column | multi-turn | ❌ | ui_render✗ → ui_render → ui_patch✗ → ui_patch | ❌ (recovered) | 9.9 s | arguments valid on the first attempt (Arguments are not valid JSON: Expected double-quoted property name in JSON at position 430 (line 1 column 431)); arguments valid on the first attempt (Arguments are not valid JSON: Expected double-quoted property name in JSON at position 295 (line 1 column 296)) |
| D3 Two successive chart edits | multi-turn | ✅ | ui_render → ui_patch → ui_patch | ✅ | 13.2 s |  |
| A1 #2 Plain answer | text | ✅ | none | ✅ | 5.5 s |  |
| A2 #2 Plain answer | text | ✅ | none | ✅ | 9.0 s |  |
| A3 #2 Plain answer | text | ✅ | none | ✅ | 2.6 s |  |
| A4 #2 Plain answer | text | ✅ | none | ✅ | 7.3 s |  |
| B1 #2 Dashboard | chart-table | ✅ | ui_render | ✅ | 16.8 s |  |
| B2 #2 Sortable table | chart-table | ✅ | ui_render | ✅ | 16.1 s |  |
| B3 #2 Multi-series chart | chart-table | ✅ | ui_render | ✅ | 14.4 s |  |
| B4 #2 Interactive form | form | ✅ | ui_render | ✅ | 11.7 s |  |
| B5 #2 Timeline | chart-table | ✅ | ui_render | ✅ | 25.5 s |  |
| C1 #2 3D sphere | threejs | ✅ | ui_render_widget | ✅ | 76.9 s |  |
| C2 #2 Slider plot | math-plot | ✅ | ui_render | ✅ | 6.6 s |  |
| C3 #2 Three.js solar system | threejs | ✅ | ui_render_widget | ✅ | 102.2 s |  |
| C4 #2 Pendulum simulator | widget | ✅ | ui_render_widget | ✅ | 103.5 s |  |
| D1 #2 Form submit → follow-up | form | ✅ | ui_render → ui_render | ✅ | 15.9 s |  |
| D2 #2 Add a table column | multi-turn | ✅ | ui_render → ui_patch | ✅ | 8.3 s |  |
| D3 #2 Two successive chart edits | multi-turn | ✅ | ui_render → ui_patch → ui_patch | ✅ | 10.5 s |  |

## Real model · browser runtime

First visible preview: p50 8.4 s · p95 74.9 s · complete generation: p50 13.6 s · p95 78.2 s · browser execution after the stream: p50 33 ms · p95 2.9 s

| Category | Passed | Rate |
| --- | --- | --- |
| text | 1/1 | 100% |
| chart-table | 2/2 | 100% |
| form | 1/1 | 100% |
| math-plot | 1/1 | 100% |
| threejs | 1/2 | 50% |
| stop-resume | 1/1 | 100% |
| multi-turn | 1/1 | 100% |
| network | 2/2 | 100% |
| mobile | 1/1 | 100% |

| Case | Category | Result | First preview | Generated | Browser exec | Console errors | Failure reason / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-text Plain question stays text | text | ✅ | – | – | – | 0 |  |
| R-chart Multi-series bar chart | chart-table | ✅ | 10.5 s | 12.8 s | 0 ms | 0 |  |
| R-table Sortable comparison table | chart-table | ✅ | 6.4 s | 9.5 s | 33 ms | 0 |  |
| R-form Form submit → agent follow-up | form | ✅ | 5.1 s | 6.2 s | 36 ms | 0 |  |
| R-plot Function plot with sliders | math-plot | ✅ | 6.2 s | 7.6 s | 0 ms | 0 |  |
| R-three Three.js 3D surface | threejs | ❌ | 8.4 s | 17.1 s | 904 ms | 2 | 3D sphere: no widget script errors (promise: THREE is not defined) · "Ask to fix" outcome not measured (harness bug, fixed); screenshot shows the repaired scene working |
| R-three #2 Three.js 3D surface | threejs | ✅ | 59.0 s | 69.9 s | 1.1 s | 0 |  |
| R-stop Stop mid-stream, then regenerate | stop-resume | ✅ | 74.9 s | 78.2 s | – | 0 |  |
| R-patch Two successive in-place edits | multi-turn | ✅ | 4.5 s | 5.5 s | 0 ms | 0 |  |
| R-weak Weak network (Fast 3G, cache off) | network | ✅ | 24.0 s | 31.6 s | 2.9 s | 0 |  |
| R-offline CDN unreachable (offline widgets) | network | ✅ | 4.4 s | 13.6 s | 47 ms | 2 |  |
| R-mobile Dashboard at phone width | mobile | ✅ | 10.0 s | 18.8 s | 0 ms | 1 |  |

## Sampled manual review

Automated checks cannot judge visual quality. These cases were inspected by looking at the screenshots:

| Case | Screenshot | Verdict | Notes |
| --- | --- | --- | --- |
| R-chart | [chart.png](assets/real-model/chart.png) | pass | Two series × Q1–Q4 grouped bars, legend and axis correct. Values are explicitly labelled as sample data (示意数据) with a form to enter real figures — honest, not fabricated as fact. |
| R-table | [table.png](assets/real-model/table.png) | pass | All five requested columns, sortable headers. Spot-checked rows match public specs (e.g. Model Y RWD 593 km CLTC / 5.9 s / ¥26.35万 / 62.5 kWh); automation does not verify facts. |
| R-form | [form-followup.png](assets/real-model/form-followup.png) | pass | Follow-up restates the submitted values (全国 / 4 / 乐观) in a table and asks only for the missing base-quarter sales. |
| R-plot | [plot.png](assets/real-model/plot.png) | pass | Correct damped oscillation y = A·e^(−γt)·cos(ωt) with ±A·e^(−γt) envelopes, KaTeX formula, three working sliders. |
| R-three #1 | [three-script-error.png](assets/real-model/three-script-error.png) | fail | Sphere and axes draw, but one script error (THREE is not defined) is flagged on the card. After "让模型修复" the scene renders with a lat/long mesh and no error (three-repaired.png). |
| R-three #2 | [three.png](assets/real-model/three.png) | pass | Geometry correct: sphere centred at C(0,0,R), tangent to the z = 0 plane at the origin; labelled axes and plane; R slider updates the equation text. |
| R-stop | [stopped.png](assets/real-model/stopped.png) | pass | Interrupted card keeps a static preview, shows the interruption notice and a Regenerate button; the regenerated solar system (regenerated.png) has sun, orbits, ringed Saturn and labels. |
| R-patch | [patched.png](assets/real-model/patched.png) | pass | Version 3 shows exactly the requested values (online 120→170, offline 90→100, 小程序 30→80); the added difference column is arithmetically correct (30/40/62/70). |
| R-weak | [weak-network.png](assets/real-model/weak-network.png) | pass | Cube with colour-coded, labelled X/Y/Z axes and grid renders on Fast 3G. |
| R-offline | [offline.png](assets/real-model/offline.png) | pass (degraded as designed) | With the CDN blocked the stage stays empty but the card says "1 个脚本错误" and offers Reload / Ask to fix; the conversation continues. |
| R-mobile | [mobile.png](assets/real-model/mobile.png) | pass, minor | No page overflow at 390 px; KPI grid and pie chart fit. The wide business-line table needs horizontal scrolling inside its card and wraps currency values onto two lines — usable but cramped. |

## History

- [docs/history/2026-10-10-real-model-eval-report.json](history/2026-10-10-real-model-eval-report.json) — historical snapshot from the v2 evaluator (API only). Its 15/15 is not a pass rate: B3 had no Chart; other cases cannot be rescored because arguments were not kept.
