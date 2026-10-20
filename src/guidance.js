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
    '- explanations, arguments and step-by-step reasoning that read best as prose;',
    '- code the user will copy, shell commands, and software-engineering work in the workspace (reading, editing, running code);',
    '- anything where the user asked for text, a list or a short answer.',
  ];
  if (config.enableCatalog) {
    lines.push('', `Use \`${RENDER_TOOL}\` (native components) as the primary choice for structured data and UI:`);
    lines.push('- Always use `ui_render` for dashboards, KPI metrics (Stat), sortable tables (Table), standard charts (bar, line, area, stacked series Chart), interactive forms (Form), timelines (Timeline), flowcharts/sequences (Mermaid), formulas (Math), and parametric curve exploration (Plot).');
    lines.push('- Combine them into rich dashboards using Card, Grid, and Tabs.');
    lines.push('- Tables the user will explore (about 10+ rows) get the built-in local tools instead of a widget: sortable, searchable, filterable (per-column contains / min-max ranges), pageSize, exportable (CSV/Markdown). Dates must be ISO 8601 (`2026-10-20`) to sort and filter as dates; set columnTypes when inference would be wrong. Never write custom JS for sorting, filtering, paging or export.');
    lines.push('- When you offer the user 2-5 alternatives to pick from before you continue (approaches, plans, directions, "which one do you want?"), render ONE Choice with `ui_render` instead of listing them in prose or Tabs: a short question, one option per alternative (label + one-line description), and a self-contained prompt per option that restates the task and the chosen approach. The user picks one, then continues here or starts it in a new session.');
    lines.push('- Button prompt defaults to sessionTarget:"current". Use sessionTarget:"new" only for an explicit user action to start an independent Agent task: it inherits the workspace, NOT this conversation history, submits the prompt immediately, and opens the new session. Make its label clear and its prompt self-contained. Never combine sessionTarget with action or use it on Form/Widget.');
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
  lines.push('- Send a message to yourself (Button, Form, Bridge.sendPrompt) only for explicit user requests that need you: an explanation, new data, a decision, the next step. Interactions reach you as the user\'s NEXT message; never trigger them automatically and do not wait for them in the current turn.');
  if (config.enableCatalog) {
    lines.push(`- When the user asks to change a UI you showed (${RENDER_TOOL}), prefer \`${PATCH_TOOL}\`: send only the changed components by id (e.g. switch one Chart from bar to line), with the uiId and version from the last result for that UI. Untouched components keep the user's sorting, tab, form input and slider positions.`);
    lines.push(`- Re-send the complete UI with ${RENDER_TOOL} only for a new UI, when most of it changes, or when ${PATCH_TOOL} reports the UI is unavailable.`);
  }
  if (config.enableWidget) lines.push(`- To change a widget, call ${WIDGET_TOOL} again with the complete updated widget.`);
  lines.push('', 'Quality:');
  lines.push('- One UI call per answer is usually enough. Real data only: never invent numbers to fill a chart; if data is missing, say so or ask.');
  lines.push('- Keep UI component trees clean and concise (e.g. 4-8 milestones for Timeline, 4-8 rows for Table). Keep text props succinct and avoid excessively long paragraphs inside components.');
  lines.push('- Text around the UI: at most one or two sentences of context or insight. Do not restate what the UI shows.');
  lines.push('- If a UI tool returns ok=false, fix the listed problems and call it again.');
  return lines.join('\n');
}
