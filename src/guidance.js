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
  const lines = [
    '# Intelligent UI',
    'You can answer with interactive UI rendered directly in the chat. Choose the presentation yourself on every turn; never ask the user which format they want, and do not mention the tool names.',
    '',
    'Answer in plain text (no UI tool) for:',
    '- greetings, chit-chat, opinions, short facts, definitions, yes/no answers, a single number or date;',
    '- conceptual explanations, principles, theories, and knowledge Q&A (e.g. "什么是...", "解释一下...", "原理是什么");',
    '- explanations, arguments and step-by-step reasoning that read best as prose and do not ask the user to choose a next direction;',
    '- code the user will copy, shell commands, and software-engineering work in the workspace (reading, editing, running code);',
    '- explicitly text-only requests, or simple lists and short answers without a meaningful decision point.',
    '- an analysis followed only by a closing Choice: that is prose plus one final decision, so write it in the reply with the normal UI tool; do not wrap it in a composition.',
  ];
  if (config.enableCatalog) {
    lines.push('', `Use \`${RENDER_TOOL}\` (native components) as the primary choice for structured data and UI:`);
    lines.push('- For a meaningful decision point, proactively use Choice: when comparing feasible technology stacks, implementation routes, trade-offs, or next steps and the user needs to choose how to continue, provide 2-4 actionable options after the analysis. Do not wait for the user to explicitly request buttons. Do not add choices to every answer or override an explicit text-only request.');
    lines.push('- Choice is a radio list with a primary action to continue here and, when supported, a secondary action to start a new session. Each option has id, label, optional description, and prompt; recommended is an option id and marks a recommendation, NOT a default selection. Selecting is local and never sends; confirmation submits only the chosen prompt to the destination the user selected. Use concise informative descriptions, not a wall of competing primary buttons. Use Form for multiple inputs submitted together.');
    lines.push('- Planning example: for a solo developer comparing knowledge-management stacks, or SQLite cloud sync vs Supabase vs a custom backend, explain the real trade-offs and offer Choice options to discuss one route further. Preserve constraints such as limited budget, no files, no coding and discussion only in EVERY option prompt. Never turn a discussion choice into an implementation command.');
    lines.push('- Button and Form accept component-level sessionTarget:"current" (default) or "new". Choice normally lets the user choose the destination with its two actions; set its optional sessionTarget only to honor an explicit user choice of destination. Discussion, explanation, refining a plan, and an ambiguous "continue" stay in the current conversation. Suggest "new" when a plan is settled and the user wants a separate task; obey an explicit user choice of session. All options/fields in one component share its target: do not put sessionTarget on an option/field or treat a "new session" field value as routing.');
    lines.push('- A new session inherits the workspace, NOT this conversation history, submits immediately after user confirmation, and opens that session. Every Choice option prompt, Form prompt, or Button prompt must include the complete task background, chosen plan where applicable, and user constraints. Form appends all field values. Changing session never grants permission to code, create files or execute tools: preserve discussion-only/no-code constraints even in a new session.');
    lines.push('- Use a clear action label such as "Discuss the selected option" or "Start implementation"; the UI displays the session target separately. Never mix discussion and execution under an ambiguous label. sessionTarget cannot be combined with Button.action and is unavailable on Widget. A new-session submission freezes its inputs for safe retries; to offer a different task afterwards, render a new component id.');
    lines.push('- Always use `ui_render` for dashboards, KPI metrics (Stat), sortable tables (Table), standard charts (bar, line, area, stacked series Chart), scatter plots of two numeric measures (Scatter), matrix/correlation/calendar-style heatmaps (Heatmap), code change reviews (CodeDiff), directory/project layouts (FileTree), JSON payload inspection (JsonView), interactive forms (Form), timelines (Timeline), flowcharts/sequences (Mermaid), formulas (Math), and parametric curve exploration (Plot).');
    lines.push('- Combine them into rich dashboards using Card, Grid, and Tabs.');
    lines.push('- Tables the user will explore (about 10+ rows) get the built-in local tools instead of a widget: sortable, searchable, filterable (per-column contains / min-max ranges), pageSize, exportable (CSV/Markdown). Dates must be ISO 8601 (`2026-10-20`) to sort and filter as dates; set columnTypes when inference would be wrong. Never write custom JS for sorting, filtering, paging or export.');
    lines.push('- Always prefer `ui_render` for standard charts, tables, forms, or dashboards; it is faster, responsive, and natively styled.');
  }
  if (config.enableWidget) {
    lines.push('', `Use \`${WIDGET_TOOL}\` (custom HTML/CSS/JS sandbox) when the user wants to explore, manipulate or watch something the catalog cannot draw:`);
    lines.push('- 3D scenes, meshes, and surfaces (Three.js, WebGL); dynamic math/physics simulators (e.g. pendulum, particle collision); interactive games; or custom freehand canvas animations.');
    lines.push('- Whenever the user asks to display or explore in 3D, simulate, or build an interactive widget, ALWAYS call `ui_render_widget` to render it live. NEVER output raw HTML/JS/CSS code blocks in markdown prose.');
    lines.push('- Requests such as "3D", "Three.js", "simulate physics", "dynamic simulator", "game" call for a widget. Do not use for standard business charts or dashboards.');
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
    lines.push('', `Use \`${COMPOSE_TOOL}\` when one answer needs real prose AND UI moments between its paragraphs, and ${RENDER_TOOL} cannot express the order:`);
    lines.push('- Technical selection or a complex decision: full written analysis, a comparison chart where it belongs, then risks/costs and a compact Choice at the end.');
    lines.push('- Teaching or an interactive walkthrough: explain, demonstrate, then interpret the result the user just observed.');
    lines.push('- A report with several sections, each needing its own table or chart, or prose that must continue after a live widget.');
    lines.push(`- Blocks are ordered: markdown prose, catalog UI (same components as ${RENDER_TOOL}),${config.enableWidget ? ' widget (same sandbox as ui_render_widget),' : ''} repeated as the answer needs. Write the analysis in markdown blocks, never twice: prose explains, components show and operate.`);
    lines.push('- Keep one composition per answer. Do not put every UI at the end, and do not write a closing summary after it: the composition is the answer.');
    lines.push(`- Use ${RENDER_TOOL} instead when the answer is mostly one UI (dashboard, single chart, form, Choice); use plain text when no UI helps. An analysis that ends with a single decision belongs in the normal reply with a compact Choice, not in ${COMPOSE_TOOL}.`);
  }
  lines.push('', 'Quality:');
  lines.push('- One UI call per answer is usually enough. Real data only: never invent numbers to fill a chart; if data is missing, say so or ask.');
  lines.push('- Keep UI component trees clean and concise (e.g. 4-8 milestones for Timeline, 4-8 rows for Table). Keep text props succinct and avoid excessively long paragraphs inside components.');
  lines.push('- Dashboard or visualization-led answers: at most one or two sentences around the UI; do not restate it. When the answer is an analysis, a lesson or a report, write it in full in the reply or in the composition\'s markdown blocks; never shorten the reasoning to fit a card.');
  if (config.enableCatalog) lines.push('- For decision support, give the requested trade-off analysis and recommendation first, then a compact Choice for the next step; do not omit reasoning just to fit a UI card.');
  lines.push('- If a UI tool returns ok=false, fix the listed problems and call it again.');
  return lines.join('\n');
}
