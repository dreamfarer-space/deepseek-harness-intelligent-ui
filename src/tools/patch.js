/**
 * `ui_patch`: update a UI shown earlier in this conversation in place, by
 * component id, instead of re-sending the whole tree. execute() rebuilds the
 * UI's current version from the session's own history (see catalog/patch.js),
 * applies the operations atomically and returns the complete next version in
 * `presentationMeta`, so the browser renders it without replaying anything and
 * a reload reproduces it from the durable `tool/result`.
 * @module deepseek-harness-intelligent-ui/tools/patch
 */
import { componentTypes } from '../catalog/catalog.js';
import { applyPatch, collectUis, outline, PATCH_LIMITS, PATCH_OPS } from '../catalog/patch.js';
import { clientPolicy } from '../config.js';
import { COMPOSE_TOOL } from '../compose/constants.js';
import { RENDER_TOOL } from './render.js';

export const PATCH_TOOL = 'ui_patch';

const nodeSchema = () => ({
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique new component id.' },
    type: { type: 'string', enum: componentTypes() },
    componentVersion: { type: 'string', description: 'Required exact extension version; omit for built-ins.' },
    props: { type: 'object' },
    children: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'type'],
});

/**
 * The UIs of the calling conversation, or an explanation why there are none.
 * @param {any} exec - ToolRunContext.
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
function conversationUis(exec, config) {
  const session = exec?.agent?.session;
  if (!session || typeof session.deriveMessages !== 'function') return undefined;
  return collectUis(session.deriveMessages(), {
    render: RENDER_TOOL,
    patch: PATCH_TOOL,
    ...(config.enableCompose !== false ? { compose: COMPOSE_TOOL, config } : {}),
  });
}

/**
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
export function createPatchTool(config) {
  const policy = clientPolicy(config);
  return {
    name: PATCH_TOOL,
    description: [
      `Change a UI that ${RENDER_TOOL}, ${COMPOSE_TOOL} (a catalog block's uiId is "block:<block id>") or an earlier ${PATCH_TOOL} already showed in THIS conversation, in place, without re-sending the whole UI.`,
      'Address it by its uiId and the version you are changing (both are in the tool result that showed it); address components by their ids.',
      'Components you do not touch keep their content and the user\'s state (table sort, selected tab, form input, slider positions).',
      'Operations, applied in order and all-or-nothing:',
      '- setProps {id, props, unset?}: merge props into a component (e.g. {"id":"chart","props":{"kind":"line"}}); unset lists prop names to remove.',
      '- replaceNode {id, node:{type, props, children?}, nodes?}: replace one component\'s type/props/children, keeping its id (its state resets).',
      '- insertChild {parent, id, index?, nodes}: add the new component `id` (defined in `nodes`, with any descendants) under `parent`, at `index` (default: last).',
      '- removeNode {id}: remove a component and everything under it (not the root). Keep Tabs labels in step with their children in the same patch.',
      `On ok=false nothing changed; fix the listed problems and retry. A stale baseVersion means the UI changed: patch the current version. Use ${RENDER_TOOL} instead for a new UI, a different root, or when most of the UI changes. Widgets (ui_render_widget) cannot be patched; render them again.`,
    ].join('\n'),
    get parameters() { return {
      type: 'object',
      properties: {
        uiId: { type: 'string', description: 'uiId of the UI to change, from the tool result that showed it.' },
        baseVersion: { type: 'integer', description: 'The UI version this patch is based on (1 after ui_render; each patch result reports the new version).' },
        title: { type: 'string', description: 'Optional new card title.' },
        ops: {
          type: 'array',
          description: `1-${PATCH_LIMITS.ops} operations, applied in order.`,
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: [...PATCH_OPS] },
              id: { type: 'string', description: 'Target component id (insertChild: the new child id).' },
              props: { type: 'object', description: 'setProps: props to merge.' },
              unset: { type: 'array', items: { type: 'string' }, description: 'setProps: prop names to remove.' },
              node: {
                type: 'object',
                description: 'replaceNode: the replacement (same id).',
                properties: {
                  type: { type: 'string', enum: componentTypes() },
                  componentVersion: { type: 'string', description: 'Required exact extension version; omit for built-ins.' },
                  props: { type: 'object' },
                  children: { type: 'array', items: { type: 'string' } },
                },
                required: ['type'],
              },
              parent: { type: 'string', description: 'insertChild: the container to insert into.' },
              index: { type: 'integer', description: 'insertChild: position among the parent\'s children.' },
              nodes: { type: 'array', items: nodeSchema(), description: 'insertChild/replaceNode: new components (flat list, children by id).' },
            },
            required: ['op'],
          },
        },
      },
      required: ['uiId', 'baseVersion', 'ops'],
    }; },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
          code: { type: 'string' },
          ui: { type: 'object' },
        },
        required: ['ok', 'summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.ok ? value.summary : `${value.summary}\n${(value.errors || []).map(e => `- ${e}`).join('\n')}` }],
      // The complete next version travels to the browser; the model only sees the summary.
      presentationMeta: (_args, value) => (value.ok ? { ok: true, policy, ui: value.ui } : { ok: false, policy, ...(value.code ? { code: value.code } : {}) }),
    },
    // Exclusive: patches of one UI must apply in a single, replayable order.
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const refuse = (errors, code = 'invalid') => ({
        ok: false,
        code,
        summary: `UI not changed: ${errors.length} problem(s). The user still sees the previous version.`,
        errors,
      });
      if (typeof args !== 'object' || args === null || typeof args.uiId !== 'string' || args.uiId === '') {
        return refuse(['uiId: expected the uiId of a UI shown earlier in this conversation']);
      }
      const uis = conversationUis(exec, config);
      if (!uis) return refuse([`${PATCH_TOOL} is only available inside a conversation; call ${RENDER_TOOL} with the complete UI`], 'unavailable');
      const ui = uis.get(args.uiId);
      if (!ui) {
        const known = [...uis.values()].slice(-5).map(u => `${u.uiId} (v${u.version}${u.title ? ` "${u.title}"` : ''})`);
        return refuse([`uiId: no UI ${JSON.stringify(args.uiId)} in this conversation${known.length ? `; known: ${known.join(', ')}` : ''}. If it is no longer available, call ${RENDER_TOOL} with the complete UI.`], 'unknown');
      }
      const result = applyPatch(ui, args);
      if (!result.ok) return refuse(result.errors, result.code);
      const next = result.ui;
      const title = next.title ? ` "${next.title}"` : '';
      const warn = result.warnings.length ? ` Warning: ${result.warnings.join('; ')}.` : '';
      return {
        ok: true,
        summary: `UI${title} updated in place: uiId ${next.uiId}, now version ${next.version} (changed: ${result.changed.join(', ') || 'title'}).${warn} Components: ${outline(next)}.`,
        ui: next,
      };
    },
  };
}
