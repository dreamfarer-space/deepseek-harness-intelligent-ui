# Presentation routing (#58)

How the plugin's system-prompt section ([`src/guidance.js`](../src/guidance.js)) and the tool
descriptions tell the model whether to answer in prose, with native components (`ui_render`),
a sandboxed widget (`ui_render_widget`), a composition (`ui_compose`) or an in-place edit
(`ui_patch`). It records the conflicts found in
[#58](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/issues/58), what was
borrowed from four comparable projects, and how the result is measured.

The plugin keeps **self-routing**: the model decides inside its normal turn. There is no separate
router service, no new public tool and no change to any rendering protocol.

## Conflicts in the previous rules

Baseline: [`3169c66`](https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui/blob/3169c66ecc901b7249352fbed0daf803052b25dd/src/guidance.js).
These are overlaps found by reading the rules, not measured error rates.

| # | Rules that overlapped | Risk |
| --- | --- | --- |
| 1 | "Conceptual explanations, principles, theories and knowledge Q&A → plain text" vs. Plot for parameter exploration and Compose for teaching | The topic ("explain damping ratio") overrides the task ("…and let me drag it") |
| 2 | "3D, Three.js, simulate, game → ALWAYS a widget" vs. "code to copy and workspace work → plain text" | A keyword pulls code requests and project changes into an inline widget |
| 3 | "Always use `ui_render` for … formulas, tables, flows" vs. `ui_render`'s own "when structured presentation answers better than prose" | Any formula or short comparison becomes a card |
| 4 | "One UI call per answer is usually enough" vs. Compose for multi-part answers | Read as a reason to drop reasoning or refuse a reasonable mix |

None of these rules carried an explicit priority, so the model had to guess which one won.

## Decision order

The guidance now states one order; an earlier step wins over a later one, and a topic or a
keyword alone never decides:

1. **Task and explicit constraints.** Text only, Markdown, "no chart", code to copy and changes to
   workspace files are delivered in that form, never replaced by a UI in the chat. Building a page,
   component, game or 3D scene in the project is software work. A request to see or operate
   something here, or `/ui`, asks for UI. A restriction holds even after earlier UI turns.
2. **Visual benefit.** UI only when seeing or operating it helps more than reading: data to compare,
   spatial relations, a parameter to drag, a process to step through, rows to filter, input to
   collect, a real decision. Definitions, a few facts, one formula and short code stay in prose.
3. **Data and capability.** The user's data, stable facts or explicit parameters; never invented
   numbers. Only tools enabled on this host.
4. **Simplest medium.** Native components whenever they can express it; a widget only for what the
   catalog cannot draw.
5. **Arrangement.** One UI → `ui_render` or `ui_render_widget`. Analysis ending in one decision →
   prose in the reply plus one Choice. Prose that continues between UI moments → `ui_compose`.
6. **Follow-ups.** Change the UI already shown (`ui_patch` for native UI) and keep earlier
   constraints; a new keyword is not a new task.

Five short "same topic, different task" pairs follow the order in the prompt. They deliberately use
topics that the evaluation does **not** use (low-pass filter, WebGL shaders, Postgres/MySQL, Ohm's
law, a physics engine), so the evaluation measures the rule and not memorised examples; a test
fails if an evaluated prompt appears in the guidance.

The `ui_render`, `ui_render_widget` and `ui_compose` descriptions repeat the same boundaries in one
sentence each, and every sentence that names another tool is only emitted when that tool is
enabled (for example, a widget-only host is no longer told to "ALWAYS use ui_render").

## What was borrowed

| Project | Idea used | Not adopted |
| --- | --- | --- |
| [Thesys open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui/blob/03213439358bf3408ad61a46ec9e3230c5572e48/src/lib/prompt-options.ts#L52-L71) | Ask what relation the user needs to see (compare, shape, place, parameter), and give paired examples | Its broad triggers on numbers, lists and steps |
| [CopilotKit OpenIntelligentUI](https://github.com/CopilotKit/OpenIntelligentUI/blob/8391a94c1c3939c679e40ddd7bfc08a9ef690e70/docs/visualization-routing.md) | Explicit decision dimensions mapped to renderers, and a decision that holds across the turn | A separate router model: extra latency, cost, configuration and a failure dependency, with no measured gain here yet |
| [dsh-genui](https://github.com/omdsh-dev/dsh-genui/blob/344febdcbbbecac5a7d89330d3bfe1d522d75439/SKILL.md) | Every positive rule paired with when not to use it; no cards around ordinary prose | Its in-text fence protocol (this plugin uses tool calls) |
| [ZCode Visualize](https://github.com/zai-org/ZCode/blob/3c5b227649371507ddc4eb46ac5133afe6db1cab/apps/zcode-cli/packages/visualize-plugin/skills/visualize/SKILL.md#L8-L12) | Decide where the result is delivered (project vs. chat) before deciding what to draw | Its Markdown/Mermaid/HTML host APIs |

## Measuring it

Group F of the real-model evaluation ([`scripts/eval/routing.mjs`](../scripts/eval/routing.mjs))
holds 21 paired cases that keep the topic and change only the task, in Chinese and English, plus
multi-turn and missing-data cases. Categories split the error types:

- `no-ui` failures are unnecessary UI;
- `needs-ui` failures are missed or wrong UI (no interaction, missing explanation, changed data);
- `update` failures are follow-ups that re-render instead of patching or disturb untouched parts.

Cases also record tokens and time. To compare prompts, run the same group on the baseline and on
the candidate, each into its own report (the prompt hash in each report tells them apart):

```sh
git checkout <baseline>  && node scripts/run-real-model-suite.mjs F --repeat 3 --report docs/routing-baseline.json
git checkout <candidate> && node scripts/run-real-model-suite.mjs F --repeat 3 --report docs/routing-candidate.json
```

Group E (E1, E2) and F5b/F7b cover `ui_compose`, which is not yet in the recorded baseline either:
`node scripts/run-real-model-suite.mjs E --repeat 3`.

**Status:** the decision order and the cases are in place, but neither prompt has been run against
the real model yet, so there is no measured improvement to report. Publish both reports, including
failed samples, model, sample count and cost, before drawing conclusions. A separate router is worth
evaluating only if the candidate still shows stable misroutes.
