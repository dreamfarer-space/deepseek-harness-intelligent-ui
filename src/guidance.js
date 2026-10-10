/**
 * System-prompt section: when to answer with UI and how. Adapted from
 * OpenIntelligentUI's agent prompt (apps/agent/src/prompt.py) and its
 * visualization router, rewritten as a self-routing policy (no external
 * router) for DeepSeek models.
 * @module dsh-intelligent-ui/guidance
 */
import { RENDER_TOOL } from './tools/render.js';
import { WIDGET_TOOL } from './tools/widget.js';

/** Placement right after MCP server instructions (3100) and before the tools SDK (5000). */
export const GUIDANCE_ORDER = 3200;

/**
 * @param {{ enableCatalog: boolean, enableWidget: boolean }} config
 * @returns {string} empty when no UI tool is enabled.
 */
export function guidanceText(config) {
  if (!config.enableCatalog && !config.enableWidget) return '';
  const lines = ['# Intelligent UI', 'You can answer with interactive UI rendered directly in the chat. Pick the presentation per turn:'];
  lines.push('- Plain text: conversational replies, short facts, explanations, code the user will copy, and anything a UI would not improve.');
  if (config.enableCatalog) {
    lines.push(`- \`${RENDER_TOOL}\`: structured content — comparisons and data (Table), numbers over categories/time (Chart), KPIs (Stat), options to choose from (Button), collecting several inputs (Form), grouped overviews (Card/Grid/Tabs). Cheap and reliable: prefer it whenever it fits.`);
  }
  if (config.enableWidget) {
    lines.push(`- \`${WIDGET_TOOL}\`: custom visuals the catalog cannot express — interactive simulations, animations, diagrams, maps, 3D, games, calculators with live feedback. Emit fields strictly in order (title, initialHeight, placeholderMessages, css, html, jsFunctions, jsExpressions). Keep it self-contained, responsive (width 100%), accessible, and styled with the --ui-* theme variables.`);
  }
  lines.push('Rules:');
  lines.push('- One UI call per answer is usually enough; update by calling again with the full new UI rather than describing changes.');
  lines.push('- Interactions (button clicks, form submissions, Bridge.sendPrompt) reach you as the user\'s NEXT message. Never trigger them automatically, and do not wait for them in the current turn.');
  lines.push('- Real data only: never invent numbers to fill a chart; if data is missing, say so or ask.');
  lines.push('- Do not repeat the UI\'s content in prose afterwards; one short sentence of context is enough.');
  lines.push('- If a UI tool returns ok=false, fix the listed problems and call it again.');
  return lines.join('\n');
}
