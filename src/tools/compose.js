/**
 * `ui_compose`: one answer whose ordered blocks interleave markdown prose with
 * the existing declarative catalog and the existing sandboxed widget. The Host
 * validates the whole composition atomically; the browser renders the blocks in
 * order and re-presents the finished answer beneath the reply.
 *
 * Parameter order matters for streaming: `title` and `blocks` stream first and
 * each block is rendered as soon as it closes, so prose appears while the next
 * block is still being generated.
 * @module deepseek-harness-intelligent-ui/tools/compose
 */
import { catalogReference, componentTypes } from '../catalog/catalog.js';
import { clientPolicy } from '../config.js';
import { BLOCK_TYPES, COMPOSE_LIMITS, composeCapabilities, composeUiId, validateComposition } from '../compose/compose.js';
import { COMPOSE_TOOL } from '../compose/constants.js';
import { RESOURCE_MODE } from '../resource-mode.js';

/** Field order the streaming renderer depends on. */
export const COMPOSE_FIELDS = ['title', 'blocks'];

export { COMPOSE_TOOL };

/**
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
export function createComposeTool(config) {
  const policy = clientPolicy(config);
  const caps = composeCapabilities(config);
  const enabled = [caps.catalog ? 'catalog' : undefined, caps.widget ? 'widget' : undefined].filter(Boolean).join(' and ');
  const cdn = policy.cdn.length ? policy.cdn.join(', ') : '(none)';
  return {
    get name() { return COMPOSE_TOOL; },
    get description() { return [
      'Answer with ONE composed response whose ordered blocks interleave markdown prose with native UI and sandboxed widgets, so explanation can surround the interactive parts.',
      'Use it when the answer needs both substantial prose and one or more UI moments between its paragraphs: technical comparisons with a chart in the middle, a teaching walkthrough (explain → demonstrate → interpret), or a report with several sections. Do NOT use it for a pure dashboard (use ui_render) or for a plain prose answer.' + (caps.catalog ? ' An analysis that only ends in a Choice is a normal reply plus one ui_render Choice, not a composition.' : '') + ' One UI with prose around it, however long, is a normal reply plus that UI tool.',
      'Each block has a stable id and a type:',
      '- markdown {id, type:"markdown", text}: your prose for that position. Supports headings, lists, tables, quotes and fenced code; raw HTML is not rendered. Write the analysis here, not inside components.',
      ...(caps.catalog ? ['- catalog {id, type:"catalog", title?, root, components}: the same validated component tree as ui_render (see below). The user can interact with it locally; its uiId is "<composition uiId>#<block id>" and it accepts ui_patch.'] : []),
      ...(caps.widget ? ['- widget {id, type:"widget", title?, initialHeight?, placeholderMessages?, css, html, jsFunctions, jsExpressions}: the same sandboxed widget contract as ui_render_widget (emit those fields in that order inside the block).'] : []),
      `Only ${enabled} blocks are enabled on this host. ${caps.widget ? '' : 'Widgets are disabled here, so do not emit widget blocks. '}${caps.catalog ? '' : 'Native components are disabled here, so do not emit catalog blocks. '}`.trim(),
      'Rules:',
      '- Order blocks the way the answer should be read; alternate prose and UI instead of stacking every UI at the end.',
      '- Never repeat in prose what a component already shows; prose explains, components display and operate.',
      '- One composition per answer is usually enough. Interactions (Button/Form/Choice) arrive later as the user\'s next message; do not wait for them in this turn.',
      '- Do not write a closing summary after calling: the composition IS the answer.',
      ...(caps.widget ? [
        `Sandbox: no same-origin access. External resources only from ${cdn}.${policy.allowNetwork ? ' fetch() to those origins is allowed.' : ' Network requests are blocked.'} Use Bridge.sendPrompt only in response to an explicit user action.`,
        ...(RESOURCE_MODE === 'offline' ? ['Offline resource pack: only the bundled imports (three, d3, chart.js/auto, canvas-confetti, katex, mermaid) are available; no CDN URLs, fetch or external assets.'] : []),
      ] : []),
      ...(caps.catalog ? ['Components for catalog blocks (the same catalog as ui_render):', catalogReference()] : []),
    ].join('\n'); },
    get parameters() { return {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional short title for the composed answer.' },
        blocks: {
          type: 'array',
          description: `Ordered answer blocks (max ${COMPOSE_LIMITS.blocks}). Each block is rendered as soon as it closes.`,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable block id: letters, digits, "_" or "-", starting with a letter. A catalog block is addressable as "<composition call id>#<block id>".' },
              type: { type: 'string', enum: [...BLOCK_TYPES] },
              text: { type: 'string', description: 'markdown: the prose for this position.' },
              title: { type: 'string', description: 'catalog/widget: short title shown above the UI.' },
              root: { type: 'string', description: 'catalog: REQUIRED id of the top-level component. Always send it, before components.' },
              components: {
                type: 'array',
                description: 'catalog: flat component list, parents before children (same shape as ui_render).',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: componentTypes() },
                    componentVersion: { type: 'string' },
                    props: { type: 'object' },
                    children: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['id', 'type'],
                },
              },
              initialHeight: { type: 'number', description: 'widget: estimated height in px (100-1200).' },
              placeholderMessages: { type: 'array', items: { type: 'string' }, description: 'widget: 2-4 short status lines while generating.' },
              css: { type: 'string', description: 'widget: all CSS (no <style> in html).' },
              html: { type: 'string', description: 'widget: body markup only (no <script>).' },
              jsFunctions: { type: 'string', description: 'widget: function declarations, run once.' },
              jsExpressions: { type: 'array', items: { type: 'string' }, description: 'widget: statements run after jsFunctions.' },
            },
            required: ['id', 'type'],
          },
        },
      },
      required: ['blocks'],
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
      presentationMeta: (_args, value) => ({ ok: value.ok, policy }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = validateComposition(args, config, { requireCatalog: caps.catalog, requireWidget: caps.widget });
      if (!result.ok) {
        return {
          ok: false,
          summary: `Composition not shown: ${result.errors.length} problem(s). Fix them and call ${COMPOSE_TOOL} again.`,
          errors: result.errors.slice(0, 40),
        };
      }
      const title = typeof args.title === 'string' && args.title ? ` "${args.title}"` : '';
      const parts = [];
      if (result.stats.markdown) parts.push(`${result.stats.markdown} prose block(s)`);
      if (result.stats.catalog) parts.push(`${result.stats.catalog} native UI block(s), ${result.stats.components} component(s)`);
      if (result.stats.widget) parts.push(`${result.stats.widget} widget block(s)`);
      const warn = result.warnings.length ? ` Warning: ${result.warnings.slice(0, 5).join('; ')}.` : '';
      const uis = result.blocks.filter(b => b.type === 'catalog').map(b => `${composeUiId(exec?.callId ?? '<call>', b.id)} (version 1)`);
      const handle = exec?.callId
        ? ` Composition uiId ${exec.callId}.${uis.length ? ` Native blocks are patchable with ui_patch: ${uis.join(', ')}.` : ''}`
        : '';
      return {
        ok: true,
        summary: `Composed answer${title} is now displayed in order (${result.blocks.length} blocks: ${parts.join('; ')}).${warn}${handle} User interactions will arrive as new user messages.`,
      };
    },
  };
}
