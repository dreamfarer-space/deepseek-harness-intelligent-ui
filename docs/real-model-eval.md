# Real-model Generative UI evaluation

> Last updated by `node scripts/run-real-model-suite.mjs all --stage browser --record --keep-other-layers` on **2026-10-16** · model **deepseek-flash** (API reports deepseek-flash) · assertions v3 · prompt 55e5cf438f50 · DSH 0.2.0-rc.1

Built from these invocations (oldest first):

- `node scripts/run-real-model-suite.mjs all --repeat 2 --record` · 2026-10-16 08:12 UTC — all three layers; API ×2 per case; recorded the demo (cost ¥1.54)
- `node scripts/run-real-model-suite.mjs all --rescore` · 2026-10-16 08:38 UTC — API layer re-judged from the saved transcripts after fixing three over-strict assertions (月活 as active users, 指导价 as price, a dated Mermaid flow as a timeline); no model calls
- `node scripts/run-real-model-suite.mjs all --stage browser --only R-three --keep-other-layers` · 2026-10-16 08:41 UTC — a second R-three sample, added as run #2 next to the failed run #1 (merged once by hand with the --append logic, which was added right after)
- `node scripts/run-real-model-suite.mjs all --stage browser --record --keep-other-layers` · 2026-10-16 14:00 UTC — browser layer re-recorded for the demo video (all 11 cases, replacing the previous browser layer; cost ¥0.86). API and mock layers kept.

Three separately measured layers. A pass in one layer is not evidence for another:

| Layer | What it proves | Result |
| --- | --- | --- |
| Mock E2E | Rendering, streaming, interaction, persistence and isolation with **scripted** model answers | **30/30** (100%) · 2026-10-16 (kept from an earlier run) |
| Real model · API | The real model picks the right tool, emits valid arguments and the requested components/data | **30/32** (94%) · 2026-10-16 (kept from an earlier run) |
| Real model · browser | What the real model generated actually renders and works in real DSH Web + Chrome | **9/11** (82%) · 2026-10-16 · **manual review: 1 more failed** (R-chart) |

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

First visible preview: p50 7.6 s · p95 70.2 s · complete generation: p50 11.8 s · p95 73.4 s · browser execution after the stream: p50 26 ms · p95 2.9 s

| Category | Passed | Rate |
| --- | --- | --- |
| text | 1/1 | 100% |
| chart-table | 1/2 | 50% |
| form | 1/1 | 100% |
| math-plot | 1/1 | 100% |
| threejs | 0/1 | 0% |
| stop-resume | 1/1 | 100% |
| multi-turn | 1/1 | 100% |
| network | 2/2 | 100% |
| mobile | 1/1 | 100% |

| Case | Category | Result | First preview | Generated | Browser exec | Console errors | Failure reason / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-text Plain question stays text | text | ✅ | – | – | – | 0 |  |
| R-chart Multi-series bar chart | chart-table | ✅ | 4.3 s | 8.7 s | 0 ms | 0 |  |
| R-table Sortable comparison table | chart-table | ❌ | – | – | – | 0 | table rendered with 3+ rows (0 rows); columns are sortable; turn finished |
| R-form Form submit → agent follow-up | form | ✅ | 4.5 s | 5.3 s | 26 ms | 0 |  |
| R-plot Function plot with sliders | math-plot | ✅ | 7.9 s | 10.0 s | 0 ms | 0 |  |
| R-three Three.js 3D surface | threejs | ❌ | 4.5 s | 11.8 s | 1.4 s | 0 | 3D sphere: no widget script errors (jsExpressions[1]: view is not defined) · "Ask to fix" outcome not measured (harness bug, fixed); screenshot shows the repaired scene working |
| R-stop Stop mid-stream, then regenerate | stop-resume | ✅ | 70.2 s | 73.4 s | – | 0 |  |
| R-patch Two successive in-place edits | multi-turn | ✅ | 4.8 s | 5.4 s | 30 ms | 0 |  |
| R-weak Weak network (Fast 3G, cache off) | network | ✅ | 9.2 s | 18.1 s | 2.9 s | 0 |  |
| R-offline CDN unreachable (offline widgets) | network | ✅ | 7.6 s | 13.7 s | 47 ms | 2 |  |
| R-mobile Dashboard at phone width | mobile | ✅ | 18.9 s | 25.2 s | 0 ms | 1 |  |

## Sampled manual review

Automated checks cannot judge visual quality. These cases were inspected by looking at the screenshots:

| Case | Screenshot | Verdict | Notes |
| --- | --- | --- | --- |
| R-chart | [chart.png](assets/real-model/chart.png) | fail (automated pass is a false positive) | Chart content is right (two series × Q1–Q4, four KPI tiles), but the card says "生成已中断，以下为已完成的部分": the ui_render call was cut off mid-stream while more components (skeletons in the recording) were still pending, so the user got an interrupted card. The checks only looked at content; a new check now fails any case that leaves an interrupted or failed card. |
| R-table | [table.png](assets/real-model/table.png) | fail | No table: the agent spent the whole 5-minute budget researching car specs on the web (20 steps, ~1.3M tokens) before rendering anything. |
| R-form | [form-followup.png](assets/real-model/form-followup.png) | pass | The follow-up builds a quarterly forecast table from the submitted 全国 / 4 / 乐观 values (+10% per quarter) and explains the optimistic assumption. |
| R-plot | [plot.png](assets/real-model/plot.png) | pass | Correct damped oscillation y = A·e^(−γt)·cos(ωt) with ±A·e^(−γt) envelopes, KaTeX formula, working sliders. |
| R-three | [three.png](assets/real-model/three.png) | fail | The sphere draws, but the card flags one script error (view is not defined). After "让模型修复" the scene renders without errors (three-repaired.png): x²+y²+(z−R)²=R², centre (0,0,R), labelled axes. |
| R-stop | [stopped.png](assets/real-model/stopped.png) | pass | Interrupted card keeps its preview with the notice and Regenerate; the regenerated solar system (regenerated.png) shows the sun, orbits and lit planets. |
| R-patch | [patched.png](assets/real-model/patched.png) | pass | Version 3: line chart with 线上 120→170, 线下 90→100 and 小程序 30→80, exactly as requested. |
| R-weak | [weak-network.png](assets/real-model/weak-network.png) | pass | Colour cube with labelled ±X/±Y axes renders on Fast 3G. |
| R-offline | [offline.png](assets/real-model/offline.png) | pass (degraded as designed) | CDN blocked: empty stage, "1 个脚本错误" with Reload / Ask to fix; the conversation continues. |
| R-mobile | [mobile.png](assets/real-model/mobile.png) | pass | Phone width: KPI text, line chart and pie chart fit; no horizontal overflow. |

## History

- [docs/history/2026-10-10-real-model-eval-report.json](history/2026-10-10-real-model-eval-report.json) — historical snapshot from the v2 evaluator (API only). Its 15/15 is not a pass rate: B3 had no Chart; other cases cannot be rescored because arguments were not kept.
