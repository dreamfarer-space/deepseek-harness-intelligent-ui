/**
 * `ui_render`: declarative generative UI. The model sends a flat component
 * list; the Web client renders it natively inside the tool card. execute()
 * only validates and acknowledges — interactions come back later as ordinary
 * user messages, so the agent never blocks on the UI.
 * @module deepseek-harness-intelligent-ui/tools/render
 */
import { catalogReference, componentTypes, validateTree } from '../catalog/catalog.js';
import { clientPolicy } from '../config.js';

export const RENDER_TOOL = 'ui_render';

/**
 * JSON schema for a root-level `computed` array, shared by `ui_render` and by
 * `ui_compose`'s catalog blocks so both tools publish one contract. The Host
 * accepts exactly this shape (`src/catalog/catalog.js`); a capability the
 * parameters never mention is one models do not use.
 * @param {string} [description] - tool-specific wording.
 */
export function computedParam(description) {
  return {
    type: 'array',
    description: description ?? 'Optional root-level formulas recomputed in the browser as the user edits: {id, expr, format?}. `id` is an identifier (must not repeat a Form field key); `expr` reads form values (field bindKey or name) and earlier computed ids; reference the result as {{id}} in text or {"$computed":"id"} in a numeric prop.',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifier of the value, e.g. "total". Unique within this UI.' },
        expr: { type: 'string', description: 'Arithmetic/boolean expression over form values and other computed ids, e.g. "subtotal * 0.08".' },
        format: {
          type: 'object',
          description: 'Optional display format for {{id}} placeholders.',
          properties: {
            style: { type: 'string', enum: ['decimal', 'currency', 'percent'], description: 'Number style; percent multiplies by 100.' },
            currency: { type: 'string', description: 'ISO 4217 code for the currency style, e.g. "USD".' },
            minimumFractionDigits: { type: 'number', description: '0-20.' },
            maximumFractionDigits: { type: 'number', description: '0-20.' },
            locale: { type: 'string', description: 'BCP 47 locale, e.g. "en-US" (default).' },
          },
        },
      },
      required: ['id', 'expr'],
    },
  };
}

/**
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
export function createRenderTool(config) {
  return {
    name: RENDER_TOOL,
    get description() { return [
      'Show the user an interactive UI (cards, tables, charts, KPI stats, tabs, timelines, function plots with live sliders, math formulas, Mermaid diagrams, buttons, forms) rendered natively in the chat.',
      'Use it when structured or visual presentation answers better than prose: comparisons, data, dashboards, processes, formulas, functions to explore, choices, input collection.',
      'Sorting, tabs, chart hover and Plot sliders work locally. Host-registered dataRef shares data and local queries between Table/Chart. Only prompt Buttons and Form submissions send model messages; action Buttons call the host allowlist.',
      'Local linkage: a Form field `bindKey` (or the field name) becomes a shared variable; a root-level `computed` array of {id, expr, format?} derives values from those variables and other computed ids, recomputed in the browser on every edit with no round trip. Reference one as {{id}} inside a text prop or as {"$computed":"id"} in a numeric prop (Progress.value, Chart series values, Table filterValue).',
      'Only reference dataRef scopes/ids and actionIds explicitly supplied by the host; never invent them. Unsupported hosts show an unavailable state. Send a FLAT list of components; containers reference children by id. The top-level `root` field is REQUIRED and holds the top component\'s id (e.g. {"root":"page","components":[{"id":"page",…}]}); naming a component "root" does not replace it.',
      'Button clicks and Form submissions arrive later as the user\'s next message — do not wait for them in this turn.',
      `A dashboard or single-UI answer is mostly the UI: after calling, add at most one short sentence and do not repeat the UI content. If the user asked for a full analysis, lesson or report, write that prose in the reply${config.enableCompose !== false ? ' (or use ui_compose to interleave it)' : ''}; never cut the reasoning short to fit the card.`,
      'Components:',
      catalogReference(),
    ].join('\n'); },
    get parameters() { return {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional card title shown above the UI.' },
        root: { type: 'string', description: 'REQUIRED: id of the top-level component. Always send it, before components.' },
        components: {
          type: 'array',
          description: 'All components, parents before children is recommended (renders progressively while streaming).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique id.' },
              type: { type: 'string', enum: componentTypes() },
              componentVersion: { type: 'string', description: 'Required for extension types: exact version from the catalog. Omit for built-ins.' },
              props: { type: 'object', description: 'Props for this component type (see the component list).' },
              children: { type: 'array', items: { type: 'string' }, description: 'Child component ids (containers only).' },
            },
            required: ['id', 'type'],
          },
        },
        computed: computedParam(),
      },
      required: ['root', 'components'],
    }; },
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
      presentationMeta: (_args, value) => ({ ok: value.ok, policy: clientPolicy(config) }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
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
      // The call id doubles as the UI's identity for later in-place patches.
      const handle = exec?.callId ? ` uiId ${exec.callId}, version 1 (change it later with ui_patch).` : '';
      return {
        ok: true,
        summary: `UI${title} is now displayed to the user (${result.count} components: ${kinds}).${warn}${handle} User interactions will arrive as new user messages.`,
      };
    },
  };
}
