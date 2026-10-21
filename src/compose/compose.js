/**
 * Composition protocol (`ui_compose`): one answer whose ordered blocks
 * interleave prose with the existing declarative catalog and the existing
 * sandboxed widget. No second component protocol: catalog blocks run through
 * {@link validateTree} and widget blocks through `validateWidget`.
 *
 * A composition is identified by the tool call id, exactly like `ui_render`.
 * Every catalog block becomes an addressable UI for the existing `ui_patch`
 * (derived id `<callId>#<blockId>`), so nothing about patching changes.
 * @module deepseek-harness-intelligent-ui/compose
 */
import { validateTree } from '../catalog/catalog.js';
import { validateWidget } from '../tools/widget.js';
import { COMPOSE_TOOL } from './constants.js';

export { COMPOSE_TOOL };

/** Upper bounds that keep one composed answer renderable and the tool result small. */
export const COMPOSE_LIMITS = Object.freeze({
  blocks: 24,
  markdownChars: 60_000,
  totalChars: 200_000,
  titleChars: 200,
  idChars: 64,
});

/** Block types a composition may contain. */
export const BLOCK_TYPES = Object.freeze(['markdown', 'catalog', 'widget']);

const isPlainObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Stable, addressable identity of a catalog block: derived from the composition
 * call id AND the block id, so two compositions may reuse block ids without
 * sharing state or patch targets. It is the block's `uiId` for `ui_patch`.
 * @param {string} callId - the `ui_compose` call id.
 * @param {string} blockId - the block's stable id.
 */
export function composeUiId(callId, blockId) {
  return `${callId}#${blockId}`;
}

/** Split a composition block uiId back into `[compositionCallId, blockId]`, or undefined. */
export function splitComposeUiId(uiId) {
  if (typeof uiId !== 'string') return undefined;
  const at = uiId.indexOf('#');
  return at > 0 && at < uiId.length - 1 ? [uiId.slice(0, at), uiId.slice(at + 1)] : undefined;
}

/** Block ids must be safe in an id, in a `ui_patch` target and in a copy label. */
const BLOCK_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** Fields a block may carry, per type (`id` is common to all). */
const BLOCK_FIELDS = Object.freeze({
  markdown: ['id', 'type', 'text'],
  catalog: ['id', 'type', 'title', 'root', 'components'],
  widget: ['id', 'type', 'title', 'initialHeight', 'placeholderMessages', 'css', 'html', 'jsFunctions', 'jsExpressions'],
});

/**
 * Which UI capabilities the model may use, from config.
 * @param {{ enableCatalog: boolean, enableWidget: boolean, enableCompose?: boolean }} config
 */
export function composeCapabilities(config) {
  return { catalog: config.enableCatalog === true, widget: config.enableWidget === true };
}

/** Whether `ui_compose` should be registered at all. */
export function composeEnabled(config) {
  return config.enableCompose !== false && (config.enableCatalog || config.enableWidget);
}

/**
 * Validate one composition. Pure and deterministic: the browser derives the
 * same identities from the same arguments, and the Host uses it for patches.
 * @param {unknown} args - `ui_compose` arguments.
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 * @param {{ requireCatalog?: boolean, requireWidget?: boolean }} [capabilities]
 * @returns {{ ok: boolean, errors: string[], warnings: string[], blocks: ComposeBlock[], stats: Record<string, number> }}
 */
export function validateComposition(args, config, capabilities = {}) {
  const errors = [];
  const warnings = [];
  const stats = { markdown: 0, catalog: 0, widget: 0, components: 0, markdownChars: 0 };
  if (!isPlainObject(args)) return { ok: false, errors: ['arguments: expected object'], warnings, blocks: [], stats };
  for (const key of Object.keys(args)) {
    if (key !== 'title' && key !== 'blocks') errors.push(`${key}: unknown field`);
  }
  if (args.title !== undefined) {
    if (typeof args.title !== 'string') errors.push('title: expected string');
    else if (args.title.length > COMPOSE_LIMITS.titleChars) errors.push(`title: longer than ${COMPOSE_LIMITS.titleChars} characters`);
  }
  if (!Array.isArray(args.blocks) || args.blocks.length === 0) {
    errors.push('blocks: expected a non-empty ordered array');
    return { ok: false, errors, warnings, blocks: [], stats };
  }
  if (args.blocks.length > COMPOSE_LIMITS.blocks) errors.push(`blocks: more than ${COMPOSE_LIMITS.blocks} blocks`);

  const seen = new Set();
  const blocks = [];
  let total = 0;
  args.blocks.forEach((block, i) => {
    const at = `blocks[${i}]`;
    if (!isPlainObject(block)) { errors.push(`${at}: expected object`); return; }
    if (typeof block.id !== 'string' || block.id === '') { errors.push(`${at}.id: expected a non-empty string`); return; }
    if (!BLOCK_ID.test(block.id)) {
      errors.push(`${at}.id: ${JSON.stringify(block.id)} must start with a letter and use only letters, digits, "_" or "-" (max ${COMPOSE_LIMITS.idChars})`);
      return;
    }
    if (seen.has(block.id)) { errors.push(`${at}.id: duplicate block id ${JSON.stringify(block.id)}`); return; }
    seen.add(block.id);
    if (!BLOCK_TYPES.includes(block.type)) {
      errors.push(`${at}.type: expected one of ${BLOCK_TYPES.join(' | ')}, got ${JSON.stringify(block.type)}`);
      return;
    }
    const allowed = BLOCK_FIELDS[block.type];
    for (const key of Object.keys(block)) {
      if (!allowed.includes(key)) errors.push(`${at}(${block.id}).${key}: unknown field for a ${block.type} block`);
    }
    if (block.type === 'catalog' && capabilities.requireCatalog === false) {
      errors.push(`${at}(${block.id}): catalog blocks are disabled on this host`);
      return;
    }
    if (block.type === 'widget' && capabilities.requireWidget === false) {
      errors.push(`${at}(${block.id}): widget blocks are disabled on this host`);
      return;
    }
    const entry = { id: block.id, type: block.type };
    if (block.type === 'markdown') {
      if (typeof block.text !== 'string') { errors.push(`${at}(${block.id}).text: expected string`); return; }
      if (!block.text.trim()) { errors.push(`${at}(${block.id}).text: must not be blank`); return; }
      if (block.text.length > COMPOSE_LIMITS.markdownChars) {
        errors.push(`${at}(${block.id}).text: ${block.text.length} characters; a markdown block holds at most ${COMPOSE_LIMITS.markdownChars}`);
        return;
      }
      stats.markdown++;
      stats.markdownChars += block.text.length;
      total += block.text.length;
      entry.text = block.text;
    } else if (block.type === 'catalog') {
      const tree = { root: block.root, components: block.components, ...(block.title !== undefined ? { title: block.title } : {}) };
      const result = validateTree(tree);
      for (const error of result.errors) errors.push(`${at}(${block.id}).${error}`);
      for (const warning of result.warnings) warnings.push(`${block.id}: ${warning}`);
      stats.catalog++;
      stats.components += result.count;
      total += JSON.stringify(tree).length;
      entry.title = typeof block.title === 'string' ? block.title : undefined;
      entry.root = block.root;
      entry.components = block.components;
    } else {
      const widgetArgs = {};
      for (const key of BLOCK_FIELDS.widget) if (key !== 'type' && block[key] !== undefined) widgetArgs[key] = block[key];
      for (const error of validateWidget(widgetArgs, config)) errors.push(`${at}(${block.id}).${error}`);
      stats.widget++;
      total += ['css', 'html', 'jsFunctions'].reduce((n, k) => n + (typeof block[k] === 'string' ? block[k].length : 0), 0)
        + (Array.isArray(block.jsExpressions) ? block.jsExpressions.join('').length : 0);
      for (const key of ['title', 'initialHeight', 'placeholderMessages', 'css', 'html', 'jsFunctions', 'jsExpressions']) {
        if (block[key] !== undefined) entry[key] = block[key];
      }
    }
    blocks.push(entry);
  });

  if (!stats.markdown && !stats.catalog && !stats.widget && errors.length === 0) errors.push('blocks: a composition needs at least one block');
  if (total > COMPOSE_LIMITS.totalChars) errors.push(`blocks: the composition is ${total} characters; the limit is ${COMPOSE_LIMITS.totalChars}`);
  return { ok: errors.length === 0, errors, warnings, blocks: errors.length ? [] : blocks, stats };
}

/**
 * Catalog trees of one composition, in block order.
 * @param {ComposeBlock[]} blocks - validated blocks.
 */
export function catalogTrees(blocks, callId) {
  return blocks.filter(b => b.type === 'catalog').map(b => ({ blockId: b.id, uiId: composeUiId(callId, b.id), tree: { root: b.root, components: b.components, ...(b.title ? { title: b.title } : {}) } }));
}

/**
 * The markdown a "copy the answer" action writes, in block order.
 * @param {ComposeBlock[]} blocks
 * @param {(text: string) => string} [placeholder] - text for non-markdown blocks.
 */
export function markdownOf(blocks, placeholder) {
  return blocks.map(block => {
    if (block.type === 'markdown') return block.text;
    if (block.type === 'catalog') return placeholder ? placeholder(`catalog:${block.id}`) : `[UI: ${block.title ?? block.id}]`;
    return placeholder ? placeholder(`widget:${block.id}`) : `[Widget: ${block.title ?? block.id}]`;
  }).join('\n\n');
}

/**
 * @typedef {{ id: string, type: 'markdown', text: string }
 *   | { id: string, type: 'catalog', title?: string, root: string, components: unknown[] }
 *   | { id: string, type: 'widget', title?: string, html: string, css?: string, jsFunctions?: string, jsExpressions?: string[], initialHeight?: number, placeholderMessages?: string[] }} ComposeBlock
 */
