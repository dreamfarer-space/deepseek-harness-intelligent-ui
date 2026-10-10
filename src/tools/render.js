/**
 * `ui_render`: declarative generative UI. The model sends a flat component
 * list; the Web client renders it natively inside the tool card. execute()
 * only validates and acknowledges — interactions come back later as ordinary
 * user messages, so the agent never blocks on the UI.
 * @module deepseek-harness-intelligent-ui/tools/render
 */
import { catalogReference, COMPONENT_TYPES, validateTree } from '../catalog/catalog.js';
import { clientPolicy } from '../config.js';

export const RENDER_TOOL = 'ui_render';

/**
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
export function createRenderTool(config) {
  const policy = clientPolicy(config);
  return {
    name: RENDER_TOOL,
    description: [
      'Show the user an interactive UI (cards, tables, charts, KPI stats, tabs, timelines, function plots with live sliders, math formulas, Mermaid diagrams, buttons, forms) rendered natively in the chat.',
      'Use it when structured or visual presentation answers better than prose: comparisons, data, dashboards, processes, formulas, functions to explore, choices, input collection.',
      'Sorting, tabs, chart hover and Plot sliders work locally in the browser; only Button clicks and Form submissions reach you.',
      'Send a FLAT list of components; containers reference children by id; `root` is the top component id.',
      'Button clicks and Form submissions arrive later as the user\'s next message — do not wait for them in this turn.',
      'After calling, add at most one short sentence; do not repeat the UI content in text.',
      'Components:',
      catalogReference(),
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional card title shown above the UI.' },
        root: { type: 'string', description: 'id of the top-level component.' },
        components: {
          type: 'array',
          description: 'All components, parents before children is recommended (renders progressively while streaming).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique id.' },
              type: { type: 'string', enum: [...COMPONENT_TYPES] },
              props: { type: 'object', description: 'Props for this component type (see the component list).' },
              children: { type: 'array', items: { type: 'string' }, description: 'Child component ids (containers only).' },
            },
            required: ['id', 'type'],
          },
        },
      },
      required: ['root', 'components'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
        },
        required: ['ok', 'summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.ok ? value.summary : `${value.summary}\n${(value.errors || []).map(e => `- ${e}`).join('\n')}` }],
      presentationMeta: (_args, value) => ({ ok: value.ok, policy }),
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const result = validateTree(args);
      if (!result.ok) {
        return {
          ok: false,
          summary: `UI not rendered: ${result.errors.length} problem(s). Fix them and call ui_render again.`,
          errors: result.errors.slice(0, 40),
        };
      }
      const kinds = Object.entries(result.types).map(([t, n]) => (n > 1 ? `${n}x ${t}` : t)).join(', ');
      const title = typeof args.title === 'string' && args.title ? ` "${args.title}"` : '';
      const warn = result.warnings.length ? ` Warning: ${result.warnings.join('; ')}.` : '';
      return {
        ok: true,
        summary: `UI${title} is now displayed to the user (${result.count} components: ${kinds}).${warn} User interactions will arrive as new user messages.`,
      };
    },
  };
}
