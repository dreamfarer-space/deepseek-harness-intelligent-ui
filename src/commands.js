/**
 * `/ui <request>`: ask this conversation's model to answer with generative UI.
 * @module dsh-intelligent-ui/commands
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { RENDER_TOOL } from './tools/render.js';
import { WIDGET_TOOL } from './tools/widget.js';

/**
 * Build the followup text the model receives.
 * @param {string} request
 * @param {{ enableCatalog: boolean, enableWidget: boolean }} config
 */
export function uiPrompt(request, config) {
  const tools = [config.enableCatalog && RENDER_TOOL, config.enableWidget && WIDGET_TOOL].filter(Boolean).join(' or ');
  return `${request}\n\n(Answer this with an interactive UI using ${tools}; choose whichever fits best.)`;
}

/**
 * @param {any} commands - the `commands` service.
 * @param {ReturnType<import('./config.js').resolveConfig>} config
 * @returns {(() => void) | undefined} the command's effect disposer
 */
export function registerCommands(commands, config) {
  if (!config.enableCatalog && !config.enableWidget) return undefined;
  return commands.register({
    name: 'ui',
    description: 'Answer with interactive UI (cards, tables, charts, forms, live widgets)',
    input: { hint: '<what to show>' },
    handler: async ({ agent, rawInput }) => {
      const request = String(rawInput || '').trim();
      if (!request) return { kind: 'error', text: 'Usage: /ui <what to show>, e.g. /ui compare quicksort, mergesort and heapsort' };
      if (!agent || typeof agent.followup !== 'function') return { kind: 'error', text: 'Run /ui inside a conversation.' };
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: uiPrompt(request, config) }],
        source: { kind: 'user' },
      }));
      return { kind: 'success', text: '' };
    },
  });
}
