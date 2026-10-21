# Presentation routing (#58)

How the model decides between prose, native components (`ui_render`), a sandboxed widget
(`ui_render_widget`), a composition (`ui_compose`) and an in-place edit (`ui_patch`), what
[#58](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/58) found in the
rules, what was measured with real models, and why the guidance in
[`src/guidance.js`](../src/guidance.js) was kept.

**Outcome.** The plugin keeps self-routing with its current guidance. A rewritten guidance with an
explicit decision order ([#60](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/pull/60))
was measured in four rounds and did not route better than the current one. The measurable problem
was elsewhere: models left out the required `root` field, which [#62](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/pull/62)
fixed. The paired evaluation cases stay in the suite so that any future rule change has to beat this
baseline.

## Conflicts found by reading the rules

Baseline: [`3169c66`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/3169c66ecc901b7249352fbed0daf803052b25dd/src/guidance.js).
These are overlaps in the wording, not measured error rates.

| # | Rules that overlap | Risk |
| --- | --- | --- |
| 1 | "Conceptual explanations … → plain text" vs. Plot for parameter exploration and Compose for teaching | The topic ("explain damping ratio") overrides the task ("…and let me drag it") |
| 2 | "3D, Three.js, game → ALWAYS a widget" vs. "code to copy and workspace work → plain text" | A keyword pulls code requests and project changes into a widget |
| 3 | "Always use `ui_render` for … formulas, tables" vs. `ui_render`'s "when structured presentation answers better" | Any formula or short comparison becomes a card |
| 4 | "One UI call per answer" vs. Compose for multi-part answers | Reasoning dropped, or a reasonable mix refused |

## Comparable projects

| Project | Idea | Not applicable here |
| --- | --- | --- |
| [Thesys open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/prompt-options.ts#L52-L71) | Choose the medium by the relation the user needs to see; paired examples | Broad triggers on numbers, lists and steps |
| [CopilotKit OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI/blob/8391a94c1c3939c679e40ddd7bfc08a9ef690e70/docs/visualization-routing.md) | Explicit decision dimensions mapped to renderers, kept for the whole turn | A separate router model: latency, cost, configuration and a failure dependency |
| [dsh-genui](https://github.com/omdsh-dev/dsh-genui/blob/344febdcbbbecac5a7d89330d3bfe1d522d75439/SKILL.md) | Every positive rule paired with when not to use it | Its in-text fence protocol (this plugin uses tool calls) |
| [ZCode Visualize](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/packages/visualize-plugin/skills/visualize/SKILL.md#L8-L12) | Decide where the result is delivered (project vs. chat) before what to draw | Its Markdown/Mermaid/HTML host APIs |

## How it was measured

Group F of the real-model evaluation ([`scripts/eval/routing.mjs`](../scripts/eval/routing.mjs),
#59, #61) holds 21 cases in pairs that keep the topic and change only the task: explain vs. drag a
parameter, explain Three.js vs. a rotatable scene here, code to copy vs. a repo change, a Markdown
table vs. a searchable grid of the user's rows, a formula vs. a derivation with a plot between the
steps, a closing Choice vs. a chart after each section, plus an edit that must leave a filtered table
alone, a text-only restriction after a 3D turn and live data with no source. Chinese and English.
The whole answer is judged, not only the tool name. `no-ui` failures are unnecessary UI, `needs-ui`
failures missed or wrong UI.

Runs used the API stage (real model, the plugin's real tools, no browser) through a local
OpenAI-compatible gateway (`DEEPSEEK_EVAL_ENDPOINT=http://127.0.0.1:<port>/v1/chat/completions`) with
DeepSeek V4.1 Flash and DeepSeek Flash, on 2026-10-21.

## Results

The decision-order rewrite was revised three times after looking at its failures (a single Choice or
timeline wrapped in a composition, a widget for a long explanation, sample data drawn when live data
was missing, code in a Code card). The last round compares the current guidance with the final
rewrite, both with the `root` fix, three runs per case, DeepSeek V4.1 Flash, all 39 cases:

| Group | Passed: current → rewrite | Routed correctly: current → rewrite |
| --- | --- | --- |
| A plain text | 12/12 → 11/12 | 12/12 → 11/12 |
| B native components | 7/15 → 6/15 | 13/15 → 13/15 |
| C plots and 3D | 12/12 → 12/12 | 12/12 → 12/12 |
| D multi-turn | 7/9 → 6/9 | 9/9 → 9/9 |
| E compositions | 4/6 → 2/6 | 6/6 → 5/6 |
| F needs-ui | 24/27 → 21/27 | 27/27 → 26/27 |
| F no-ui | 29/33 → 31/33 | 32/33 → 32/33 |
| F update | 3/3 → 3/3 | 3/3 → 3/3 |
| **Total** | **98/117 → 92/117** | **114/117 → 111/117** |

The rewrite also cost about 30% more tokens on plain-text answers. The DeepSeek Flash round was
dominated by gateway errors (HTTP 503 and timeouts on 37 and 39 of 63 cases), so it supports no
conclusion either way.

Earlier rounds seemed to favour the rewrite. Most of that difference was first-attempt argument
failures, which vary from run to run and were frequent before #62: the model named a component
`"root"` but left out the required `root` field. With the field documented, those failures in groups
B, D and E fell from 5 of 30 to 0 of 20 in a dedicated check (first-attempt validity 60% → 80%), and
to 3 of 60 across both arms of the final round (all three in the Form case, B4).

What the numbers say about the four conflicts: on these models, the current guidance already routes
the paired cases correctly 97% of the time. Its remaining misses are single samples (a timeline once
in a composition, a widget once for live data). The overlaps are real in the wording, but they did
not produce a stable misroute, which #58 set as the bar for changing the architecture or the rules.

## What remains

- About one first attempt in ten is still refused for malformed JSON (for example an extra `}`), with
  either guidance. It is model output, and the retry recovers it.
- `Form` answers (B4) still sometimes omit `root`.
- The browser stage was not part of these runs.

## Re-running the comparison

```sh
export DEEPSEEK_API_KEY=<key> DEEPSEEK_EVAL_ENDPOINT=<…/chat/completions> DEEPSEEK_EVAL_MODEL=<model>
git checkout main                && node scripts/run-real-model-suite.mjs all --stage api --repeat 3 --report routing-current.json
git checkout <candidate branch>  && node scripts/run-real-model-suite.mjs all --stage api --repeat 3 --report routing-candidate.json
```

Each report records its prompt hash, so the two are never mixed. Only a candidate that is better on
`no-ui` and `needs-ui` together, over at least three runs per case and more than one model, should
replace the current guidance.
