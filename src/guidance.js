/**
 * System-prompt section: when to answer with UI and how. Adapted from
 * OpenIntelligentUI's agent prompt (apps/agent/src/prompt.py) and its
 * visualization router, rewritten as a self-routing policy (no external
 * router) for DeepSeek models.
 * @module deepseek-harness-intelligent-ui/guidance
 */
import { RENDER_TOOL } from './tools/render.js';
import { PATCH_TOOL } from './tools/patch.js';
import { WIDGET_TOOL } from './tools/widget.js';

/** Placement right after MCP server instructions (3100) and before the tools SDK (5000). */
export const GUIDANCE_ORDER = 3200;

/**
 * @param {{ enableCatalog: boolean, enableWidget: boolean }} config
 * @returns {string} empty when no UI tool is enabled.
 */
export function guidanceText(config) {
  if (!config.enableCatalog && !config.enableWidget) return '';
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
  ];
  if (config.enableCatalog) {
    lines.push('', `Use \`${RENDER_TOOL}\` (native components) as the primary choice for structured data and UI:`);
    lines.push('- For a meaningful decision point, proactively use ChoiceGroup: when comparing feasible technology stacks, implementation routes, trade-offs, or next steps and the user needs to choose how to continue, provide 2-4 actionable options after the analysis. Do not wait for the user to explicitly request buttons. Do not add choices to every answer or override an explicit text-only request.');
    lines.push('- ChoiceGroup is a radio list plus one confirmation button. Each option has id, label, optional description, and prompt; recommended is an option id and marks a recommendation, NOT a default selection. Selecting is local and never sends; confirmation submits only the chosen prompt to the current conversation. Use concise informative descriptions, not a wall of competing primary buttons.');
    lines.push('- Planning example: for a solo developer comparing knowledge-management stacks, or SQLite cloud sync vs Supabase vs a custom backend, explain the real trade-offs and offer ChoiceGroup options to discuss one route further. Preserve constraints such as limited budget, no files, no coding and discussion only in EVERY option prompt. Never turn a discussion choice into an implementation command.');
    lines.push('- Button prompt defaults to sessionTarget:"current". Discussion, explanation and refining a plan stay in the current conversation. Use sessionTarget:"new" only for an explicit user action to start an independent Agent task: it inherits the workspace, NOT this conversation history, submits the prompt immediately, and opens the new session. Label it clearly and include the selected plan and constraints in a self-contained prompt. Never mix discussion and execution under an ambiguous label; never combine sessionTarget with action or use it on ChoiceGroup/Form/Widget.');
    lines.push('- Always use `ui_render` for dashboards, KPI metrics (Stat), sortable tables (Table), standard charts (bar, line, area, stacked series Chart), interactive forms (Form), timelines (Timeline), flowcharts/sequences (Mermaid), formulas (Math), and parametric curve exploration (Plot).');
    lines.push('- Combine them into rich dashboards using Card, Grid, and Tabs.');
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
  lines.push('', 'Quality:');
  lines.push('- One UI call per answer is usually enough. Real data only: never invent numbers to fill a chart; if data is missing, say so or ask.');
  lines.push('- Keep UI component trees clean and concise (e.g. 4-8 milestones for Timeline, 4-8 rows for Table). Keep text props succinct and avoid excessively long paragraphs inside components.');
  lines.push('- Text around dashboards and visualizations: at most one or two sentences; do not restate the UI.');
  if (config.enableCatalog) lines.push('- For decision support, give the requested trade-off analysis and recommendation first, then a compact ChoiceGroup for the next step; do not omit reasoning just to fit a UI card.');
  lines.push('- If a UI tool returns ok=false, fix the listed problems and call it again.');
  return lines.join('\n');
}
