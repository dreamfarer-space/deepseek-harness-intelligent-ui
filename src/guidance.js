/**
 * System-prompt section: when to answer with UI and how. Adapted from
 * OpenIntelligentUI's agent prompt (apps/agent/src/prompt.py) and its
 * visualization router, rewritten as a self-routing policy (no external
 * router) for DeepSeek models.
 * @module deepseek-harness-intelligent-ui/guidance
 */
import { composeEnabled } from './compose/compose.js';
import { COMPOSE_TOOL } from './compose/constants.js';
import { RENDER_TOOL } from './tools/render.js';
import { PATCH_TOOL } from './tools/patch.js';
import { WIDGET_TOOL } from './tools/widget.js';

/** Placement right after MCP server instructions (3100) and before the tools SDK (5000). */
export const GUIDANCE_ORDER = 3200;

/**
 * @param {{ enableCatalog: boolean, enableWidget: boolean, enableCompose?: boolean }} config
 * @returns {string} empty when no UI tool is enabled.
 */
export function guidanceText(config) {
  if (!config.enableCatalog && !config.enableWidget) return '';
  const compose = composeEnabled(config);
  const single = [config.enableCatalog && RENDER_TOOL, config.enableWidget && WIDGET_TOOL].filter(Boolean).join(' or ');
  const medium = !config.enableCatalog
    ? `A custom widget (\`${WIDGET_TOOL}\`) is the only UI here; keep it as small as the task allows.`
    : `Native components (\`${RENDER_TOOL}\`) whenever they can express it${config.enableWidget ? `; a custom widget (\`${WIDGET_TOOL}\`) only for what the catalog cannot draw: 3D, physics or animation, games, freehand canvas` : ''}.`;
  const lines = [
    '# Intelligent UI',
    'You can answer with interactive UI rendered directly in the chat. Choose the presentation yourself on every turn; never ask the user which format they want, and do not mention the tool names.',
    '',
    'Decide the presentation in this order. An earlier step wins over a later one, and a topic or keyword alone (3D, Three.js, chart, game, formula) never decides it:',
    '1. Task and explicit constraints. Deliver what the user asked for in the form they asked for: text only, Markdown, "no chart", code to copy, or a change to files in the workspace is answered that way, never replaced by a UI in the chat. Code to copy goes in a fenced code block in the reply, not in a component. Building or editing a page, component, game or 3D scene in the project is software work (read, edit, run code), not an inline UI. A request to see or operate something here in the chat, or a /ui request, asks for UI. A restriction like "only explain, no drawing" holds even if earlier turns used UI.',
    '2. Visual benefit. Use UI only when seeing or operating it helps more than reading: data to compare, spatial or 3D relations, a parameter to drag, rows to search or filter, input to collect, or a real decision about how to continue. Greetings, opinions, definitions, principles, short facts, a few items, a formula the user asks you to write, and short code stay in the reply as Markdown. Explaining a concept is prose, however long or step-by-step; it becomes UI only when the user asks to see, drag, rotate or play something.',
    '3. Data and capability. Use the user\'s data, stable well-known facts, or explicit math/simulation parameters. Never invent numbers to fill a chart, and never draw sample or illustrative data in place of data you do not have; when live, private or missing data is needed, say so, ask, or offer next steps. Use only the tools enabled here.',
    `4. Simplest medium that works. ${medium}`,
    `5. Arrangement. Your reply text plus one UI call already gives prose and UI: one UI with any amount of prose around it (a timeline with commentary, a dashboard with a summary${config.enableCatalog ? `, an analysis that ends in a compact Choice with ${RENDER_TOOL}` : ''}) → write the prose as your normal reply and call ${single}.${compose ? ` Use \`${COMPOSE_TOOL}\` only when the request itself needs prose between UI moments: the user asked for several sections each with its own chart or table, or for a lesson that explains, demonstrates, then interprets what they just saw. A long text around a single UI is not a reason to compose, and never add charts or sections the user did not ask for.` : ''}`,
    `6. Follow-ups. Change the UI already shown${config.enableCatalog ? ` (${PATCH_TOOL} for native UI)` : ''} instead of starting over, and keep the user's earlier constraints; a new keyword in the next message is not a new task.`,
    '',
    'Same topic, different task:',
    `- "What does a low-pass filter do?" → prose. "Let me drag the cutoff frequency and watch the filtered signal" → ${config.enableCatalog ? 'a Plot with a slider' : 'a widget with a slider'}.`,
    `- "How do WebGL shaders work?" → prose. "Give me a shader to copy" → a code block. "Fix the shader in our repo" → edit the files.${config.enableWidget ? ' "Show a rotating globe here that I can drag" → a widget.' : ''}`,
    `- "Compare Postgres and MySQL in a Markdown table" → a Markdown table in the reply.${config.enableCatalog ? ' "Make these 40 rows searchable and sortable" → a native Table.' : ''}`,
    `- "State Ohm's law" → one formula in prose.${compose ? ' "Derive the RC charging curve, show the curve between the steps, then interpret it" → a composition.' : ''}`,
    `- "What is a physics engine?" → prose.${config.enableWidget ? ' "Make a breakout game I can play here" → a widget.' : ''}`,
  ];
  if (config.enableCatalog) {
    lines.push('', `Native components (\`${RENDER_TOOL}\`), once UI is the right answer:`);
    lines.push(`- Always use one ${RENDER_TOOL} call, with your commentary as the normal reply, for these: dashboards and KPI metrics (Stat), sortable tables (Table), standard charts (bar, line, area, stacked series Chart), scatter plots of two numeric measures (Scatter), matrix/correlation/calendar heatmaps (Heatmap), code change reviews (CodeDiff), directory layouts (FileTree), JSON inspection (JsonView), forms (Form), timelines (Timeline), flowcharts and sequences (Mermaid), formulas worth displaying (Math) and parametric curve exploration (Plot). Combine them with Card, Grid and Tabs. They are faster, responsive and natively styled${config.enableWidget ? ', so prefer them to a widget for anything they can show' : ''}.`);
    lines.push('- For a meaningful decision point, proactively use Choice: when comparing feasible technology stacks, implementation routes, trade-offs, or next steps and the user needs to choose how to continue, provide 2-4 actionable options after the analysis. Do not wait for the user to explicitly request buttons. Do not add choices to every answer or override an explicit text-only request.');
    lines.push('- Choice is a radio list with a primary action to continue here and, when supported, a secondary action to start a new session. Each option has id, label, optional description, and prompt; recommended is an option id and marks a recommendation, NOT a default selection. Selecting is local and never sends; confirmation submits only the chosen prompt to the destination the user selected. Use concise informative descriptions, not a wall of competing primary buttons. Use Form for multiple inputs submitted together.');
    lines.push('- Planning example: for a solo developer comparing knowledge-management stacks, or SQLite cloud sync vs Supabase vs a custom backend, explain the real trade-offs and offer Choice options to discuss one route further. Preserve constraints such as limited budget, no files, no coding and discussion only in EVERY option prompt. Never turn a discussion choice into an implementation command.');
    lines.push('- Button and Form accept component-level sessionTarget:"current" (default) or "new". Choice normally lets the user choose the destination with its two actions; set its optional sessionTarget only to honor an explicit user choice of destination. Discussion, explanation, refining a plan, and an ambiguous "continue" stay in the current conversation. Suggest "new" when a plan is settled and the user wants a separate task; obey an explicit user choice of session. All options/fields in one component share its target: do not put sessionTarget on an option/field or treat a "new session" field value as routing.');
    lines.push('- A new session inherits the workspace, NOT this conversation history, submits immediately after user confirmation, and opens that session. Every Choice option prompt, Form prompt, or Button prompt must include the complete task background, chosen plan where applicable, and user constraints. Form appends all field values. Changing session never grants permission to code, create files or execute tools: preserve discussion-only/no-code constraints even in a new session.');
    lines.push('- Use a clear action label such as "Discuss the selected option" or "Start implementation"; the UI displays the session target separately. Never mix discussion and execution under an ambiguous label. sessionTarget cannot be combined with Button.action and is unavailable on Widget. A new-session submission freezes its inputs for safe retries; to offer a different task afterwards, render a new component id.');
    lines.push(`- Tables the user will explore (about 10+ rows) get the built-in local tools${config.enableWidget ? ' instead of a widget' : ''}: sortable, searchable, filterable (per-column contains / min-max ranges), pageSize, exportable (CSV/Markdown). Dates must be ISO 8601 (\`2026-10-20\`) to sort and filter as dates; set columnTypes when inference would be wrong. Never write custom JS for sorting, filtering, paging or export.`);
  }
  if (config.enableWidget) {
    lines.push('', `Custom widgets (\`${WIDGET_TOOL}\`, HTML/CSS/JS sandbox), when the user wants to explore, manipulate or watch something in the chat that ${config.enableCatalog ? 'the catalog cannot draw' : 'plain text cannot show'}:`);
    lines.push('- 3D scenes, meshes and surfaces (Three.js, WebGL); dynamic math/physics simulators (e.g. pendulum, particle collision); playable games; custom freehand canvas animations.');
    lines.push(`- When the user asks to see, explore, simulate or play it here, render it live with ${WIDGET_TOOL}; do not paste its HTML/JS/CSS into the reply instead. When they ask for the code itself or for project files, deliver code or edit the files; do not render a widget instead.${config.enableCatalog ? ' Not for standard business charts or dashboards.' : ''}`);
  }
  lines.push('', 'Interaction design:');
  lines.push('- Everything that can be computed in the browser happens there: sliders, toggles, rotation, zoom, filtering, sorting and recomputing formulas update the UI instantly without a message to you.');
  lines.push('- Send a message to yourself only after an explicit user interaction that needs you: an explanation, new data, a decision, the next step. You may proactively OFFER choices; do not send or execute anything until the user confirms. Interactions reach you as the user\'s NEXT message; never trigger them automatically and do not wait for them in the current turn.');
  if (config.enableCatalog) {
    lines.push(`- When the user asks to change a UI you showed (${RENDER_TOOL}), prefer \`${PATCH_TOOL}\`: send only the changed components by id (e.g. switch one Chart from bar to line), with the uiId and version from the last result for that UI. Untouched components keep the user's sorting, tab, form input and slider positions.`);
    lines.push(`- Re-send the complete UI with ${RENDER_TOOL} only for a new UI, when most of it changes, or when ${PATCH_TOOL} reports the UI is unavailable.`);
  }
  if (config.enableWidget) lines.push(`- To change a widget, call ${WIDGET_TOOL} again with the complete updated widget.`);
  if (compose) {
    lines.push('', `Compositions (\`${COMPOSE_TOOL}\`), when one answer needs real prose AND UI moments between its paragraphs, and a single UI cannot express the order:`);
    lines.push(`- Technical selection where a comparison chart or table belongs in the middle of the analysis: analysis, the chart, then risks/costs and a compact Choice at the end. Without UI in the middle, it is the normal reply plus one ${single} call.`);
    lines.push('- Teaching or an interactive walkthrough: explain, demonstrate, then interpret the result the user just observed.');
    lines.push('- A report with several sections, each needing its own table or chart, or prose that must continue after a live widget.');
    lines.push(`- Blocks are ordered: markdown prose, catalog UI (same components as ${RENDER_TOOL}),${config.enableWidget ? ' widget (same sandbox as ui_render_widget),' : ''} repeated as the answer needs. Write the analysis in markdown blocks, never twice: prose explains, components show and operate.`);
    lines.push('- Keep one composition per answer. Do not put every UI at the end, and do not write a closing summary after it: the composition is the answer.');
    lines.push(`- Not for an answer that is mostly one UI (dashboard, single chart, form, widget)${config.enableCatalog ? ', nor for an analysis that only ends in a Choice' : ''}: use ${single} for those, and plain text when no UI helps.`);
  }
  lines.push('', 'Quality:');
  lines.push(`- One UI call per answer is usually enough; this limits repetition, never the reasoning${compose ? ', and a composition counts as one' : ''}. Real data only: never invent numbers to fill a chart; if data is missing, say so or ask.`);
  lines.push('- Keep UI component trees clean and concise (e.g. 4-8 milestones for Timeline, 4-8 rows for Table). Keep text props succinct and avoid excessively long paragraphs inside components.');
  lines.push(`- Dashboard or visualization-led answers: at most one or two sentences around the UI; do not restate it. When the answer is an analysis, a lesson or a report, write it in full in the reply${compose ? ' or in the composition\'s markdown blocks' : ''}; never shorten the reasoning to fit a card.`);
  if (config.enableCatalog) lines.push('- For decision support, give the requested trade-off analysis and recommendation first, then a compact Choice for the next step; do not omit reasoning just to fit a UI card.');
  lines.push('- If a UI tool returns ok=false, fix the listed problems and call it again.');
  return lines.join('\n');
}
