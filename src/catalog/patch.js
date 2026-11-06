/**
 * Incremental updates of an existing `ui_render` UI (`ui_patch`).
 *
 * A UI is identified by `uiId` (the call id of the `ui_render` that created
 * it) and versioned: the render is version 1 and every accepted patch adds
 * one. Components keep their ids across versions, so the browser keeps the
 * interaction state (sort, tab, form values, slider positions) of every
 * component a patch did not replace.
 *
 * Nothing is stored on the Host: {@link collectUis} replays this session's own
 * history (the messages the model sees), which makes the outcome deterministic
 * across restarts and confines patches to UIs of the same conversation.
 * @module deepseek-harness-intelligent-ui/catalog/patch
 */
import { composeUiId, compositionFieldKeys, validateComposition } from '../compose/compose.js';
import { CATALOG, LIMITS, validateTree } from './catalog.js';

export const PATCH_OPS = Object.freeze(['setProps', 'replaceNode', 'insertChild', 'removeNode']);

/** Upper bounds for one patch call. */
export const PATCH_LIMITS = Object.freeze({ ops: 50, nodesPerOp: LIMITS.components });

/** Allowed fields per op (besides `op`). */
const OP_FIELDS = Object.freeze({
  setProps: ['id', 'props', 'unset'],
  replaceNode: ['id', 'node', 'nodes'],
  insertChild: ['parent', 'id', 'index', 'nodes'],
  removeNode: ['id'],
});

/**
 * @typedef {{ id: string, type: string, props?: Record<string, unknown>, children?: string[] }} UiNode
 * @typedef {{ uiId: string, version: number, title?: string, root: string, components: UiNode[], computed?: unknown[], scope?: string[], computedIds?: string[], staleFields?: string[] }} UiSnapshot
 */

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const clone = v => JSON.parse(JSON.stringify(v));

/** Legacy built-ins alone accept props.children; extensions use their exact schema. */
function normalize(node) {
  if (Object.hasOwn(CATALOG, node.type) && isPlainObject(node.props) && Object.hasOwn(node.props, 'children')) {
    if (node.children === undefined && Array.isArray(node.props.children)) node.children = node.props.children;
    delete node.props.children;
  }
  return node;
}

/**
 * Normalize a validated `ui_render` payload into a snapshot.
 * @param {string} uiId
 * @param {any} args - `ui_render` arguments that passed {@link validateTree}.
 * @param {{ scope?: readonly string[], computedIds?: readonly string[] }} [extra] -
 *   answer-wide context of a composition block: the field keys its siblings
 *   publish and the computed ids they declare (a block patch may collide with
 *   neither, and the block itself cannot see them).
 * @returns {UiSnapshot}
 */
export function snapshotOf(uiId, args, extra = {}) {
  const tree = clone(args);
  const byId = new Map(tree.components.map(n => [n.id, normalize(n)]));
  const scope = Array.isArray(extra.scope) ? [...extra.scope] : undefined;
  const computedIds = Array.isArray(extra.computedIds) ? [...extra.computedIds] : undefined;
  return {
    uiId,
    version: 1,
    ...(typeof tree.title === 'string' && tree.title ? { title: tree.title } : {}),
    root: tree.root,
    components: reachable(tree.root, byId),
    // Formulas travel with the version: a patch must not drop them.
    ...(Array.isArray(tree.computed) ? { computed: tree.computed } : {}),
    ...(scope && scope.length ? { scope } : {}),
    ...(computedIds && computedIds.length ? { computedIds } : {}),
  };
}

/** Components reachable from `root`, parents before children (renders progressively). */
function reachable(root, byId) {
  const out = [];
  const seen = new Set();
  const walk = (id) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    out.push(node);
    for (const c of node.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Field keys published by the `Form` nodes of one tree: a field's `bindKey`
 * (with its `name` as an alias) and a single-field form's `bindKey`. The same
 * rule `compositionFieldKeys` and the renderer use, so a patch can tell which
 * shared values this block itself produced.
 * @param {readonly UiNode[]} components
 * @returns {Set<string>}
 */
function publishedFieldKeys(components) {
  const keys = new Set();
  for (const node of components ?? []) {
    if (!isPlainObject(node) || node.type !== 'Form' || !isPlainObject(node.props)) continue;
    const fields = Array.isArray(node.props.fields) ? node.props.fields.filter(isPlainObject) : [];
    for (const field of fields) {
      if (typeof field.bindKey === 'string' && field.bindKey) keys.add(field.bindKey);
      if (typeof field.name === 'string' && field.name) keys.add(field.name);
    }
    if (fields.length === 1 && typeof node.props.bindKey === 'string' && node.props.bindKey) keys.add(node.props.bindKey);
  }
  return keys;
}

/**
 * Check a new component definition (shape only; props are checked on the whole tree).
 * @returns {string | undefined} a problem, or undefined.
 */
function checkNewNode(node, at) {
  if (!isPlainObject(node)) return `${at}: expected a component object`;
  if (typeof node.id !== 'string' || node.id === '') return `${at}.id: expected non-empty string`;
  if (typeof node.type !== 'string') return `${at}(${node.id}).type: expected string`;
  if (node.children !== undefined && (!Array.isArray(node.children) || node.children.some(c => typeof c !== 'string'))) {
    return `${at}(${node.id}).children: expected array of component ids`;
  }
  const extra = Object.keys(node).find(k => !['id', 'type', 'componentVersion', 'props', 'children'].includes(k));
  return extra ? `${at}(${node.id}).${extra}: unknown field` : undefined;
}

/**
 * Apply one `ui_patch` call to the current snapshot. All-or-nothing: on any
 * problem the snapshot is left untouched and the errors say what to fix.
 * @param {UiSnapshot} ui - current version.
 * @param {any} args - `ui_patch` arguments.
 * @returns {{ ok: true, ui: UiSnapshot, changed: string[], warnings: string[] } | { ok: false, errors: string[], code: 'invalid' | 'stale' }}
 */
export function applyPatch(ui, args) {
  const fail = (errors, code = 'invalid') => ({ ok: false, errors, code });
  if (!isPlainObject(args)) return fail(['arguments: expected object']);
  for (const key of Object.keys(args)) {
    if (!['uiId', 'baseVersion', 'title', 'ops'].includes(key)) return fail([`${key}: unknown field`]);
  }
  if (!Number.isInteger(args.baseVersion)) return fail([`baseVersion: expected the integer version you are patching (current: ${ui.version})`]);
  if (args.baseVersion !== ui.version) {
    return fail([`baseVersion: UI ${JSON.stringify(ui.uiId)} is at version ${ui.version}, not ${args.baseVersion}; it changed since you read it. Re-derive the patch from version ${ui.version} and call ui_patch again with baseVersion ${ui.version}.`], 'stale');
  }
  if (args.title !== undefined && typeof args.title !== 'string') return fail(['title: expected string']);
  if (!Array.isArray(args.ops) || args.ops.length === 0) return fail(['ops: expected a non-empty array']);
  if (args.ops.length > PATCH_LIMITS.ops) return fail([`ops: more than ${PATCH_LIMITS.ops} operations; call ui_render with the complete UI instead`]);

  const nodes = new Map(clone(ui.components).map(n => [n.id, n]));
  const parentOf = new Map();
  for (const n of nodes.values()) for (const c of n.children ?? []) parentOf.set(c, n.id);
  const changed = new Set();
  const added = new Set();

  const addNodes = (list, at) => {
    if (list === undefined) return undefined;
    if (!Array.isArray(list)) return `${at}: expected array of new components`;
    if (list.length > PATCH_LIMITS.nodesPerOp) return `${at}: more than ${PATCH_LIMITS.nodesPerOp} components`;
    for (let j = 0; j < list.length; j++) {
      const problem = checkNewNode(list[j], `${at}[${j}]`);
      if (problem) return problem;
      if (nodes.has(list[j].id)) return `${at}[${j}].id: ${JSON.stringify(list[j].id)} already exists; give new components new ids, or use setProps/replaceNode on the existing one`;
      const node = normalize(clone(list[j]));
      nodes.set(node.id, node);
      added.add(node.id);
      changed.add(node.id);
    }
    // New components may reference each other; their parents are wired by the tree check below.
    for (const id of list.map(n => n.id)) for (const c of nodes.get(id).children ?? []) parentOf.set(c, id);
    return undefined;
  };
  const existing = (id, at) => {
    if (typeof id !== 'string' || id === '') return `${at}: expected a component id`;
    if (!nodes.has(id)) return `${at}: unknown component id ${JSON.stringify(id)} in UI ${JSON.stringify(ui.uiId)} version ${ui.version}`;
    return undefined;
  };

  for (let i = 0; i < args.ops.length; i++) {
    const op = args.ops[i];
    const at = `ops[${i}]`;
    if (!isPlainObject(op)) return fail([`${at}: expected object`]);
    if (!PATCH_OPS.includes(op.op)) return fail([`${at}.op: expected one of ${PATCH_OPS.join(' | ')}, got ${JSON.stringify(op.op)}`]);
    const extra = Object.keys(op).find(k => k !== 'op' && !OP_FIELDS[op.op].includes(k));
    if (extra) return fail([`${at}.${extra}: not a field of ${op.op} (allowed: ${OP_FIELDS[op.op].join(', ')})`]);
    let problem;
    switch (op.op) {
      case 'setProps': {
        problem = existing(op.id, `${at}.id`);
        if (problem) break;
        if (op.props === undefined && op.unset === undefined) { problem = `${at}: give props and/or unset`; break; }
        if (op.props !== undefined && !isPlainObject(op.props)) { problem = `${at}.props: expected object`; break; }
        if (op.props && Object.hasOwn(op.props, 'children')) { problem = `${at}.props.children: children are not props; use insertChild/removeNode/replaceNode`; break; }
        if (op.unset !== undefined && (!Array.isArray(op.unset) || op.unset.some(k => typeof k !== 'string'))) { problem = `${at}.unset: expected array of prop names`; break; }
        const node = nodes.get(op.id);
        const props = { ...(node.props ?? {}), ...clone(op.props ?? {}) };
        for (const k of op.unset ?? []) delete props[k];
        node.props = props;
        changed.add(op.id);
        break;
      }
      case 'replaceNode': {
        problem = existing(op.id, `${at}.id`);
        if (problem) break;
        if (!isPlainObject(op.node)) { problem = `${at}.node: expected { type, props, children }`; break; }
        if (op.node.id !== undefined && op.node.id !== op.id) { problem = `${at}.node.id: must equal ${JSON.stringify(op.id)} (a replaced component keeps its id; remove it and insert a new one to change ids)`; break; }
        problem = checkNewNode({ ...op.node, id: op.id }, `${at}.node`) ?? addNodes(op.nodes, `${at}.nodes`);
        if (problem) break;
        const prev = nodes.get(op.id);
        for (const c of prev.children ?? []) if (parentOf.get(c) === op.id) parentOf.delete(c);
        const next = normalize({ id: op.id, type: op.node.type, ...(op.node.componentVersion !== undefined ? { componentVersion: op.node.componentVersion } : {}), ...(op.node.props !== undefined ? { props: clone(op.node.props) } : {}), ...(op.node.children !== undefined ? { children: [...op.node.children] } : {}) });
        nodes.set(op.id, next);
        for (const c of next.children ?? []) parentOf.set(c, op.id);
        changed.add(op.id);
        break;
      }
      case 'insertChild': {
        problem = existing(op.parent, `${at}.parent`) ?? addNodes(op.nodes, `${at}.nodes`) ?? existing(op.id, `${at}.id`);
        if (problem) break;
        if (op.id === ui.root) { problem = `${at}.id: the root cannot be inserted as a child`; break; }
        if (parentOf.has(op.id)) {
          problem = `${at}.id: ${JSON.stringify(op.id)} already has a parent (${parentOf.get(op.id)}); removeNode it first or insert a new component`;
          break;
        }
        const parent = nodes.get(op.parent);
        const kids = [...(parent.children ?? [])];
        const index = op.index === undefined ? kids.length : op.index;
        if (!Number.isInteger(index) || index < 0 || index > kids.length) { problem = `${at}.index: expected an integer from 0 to ${kids.length}`; break; }
        kids.splice(index, 0, op.id);
        parent.children = kids;
        parentOf.set(op.id, op.parent);
        changed.add(op.parent);
        changed.add(op.id);
        break;
      }
      case 'removeNode': {
        problem = existing(op.id, `${at}.id`);
        if (problem) break;
        if (op.id === ui.root) { problem = `${at}.id: the root cannot be removed; replaceNode it or call ui_render with a new UI`; break; }
        const parentId = parentOf.get(op.id);
        const parent = parentId === undefined ? undefined : nodes.get(parentId);
        if (parent) {
          parent.children = (parent.children ?? []).filter(c => c !== op.id);
          changed.add(parentId);
        }
        parentOf.delete(op.id);
        nodes.delete(op.id);
        changed.delete(op.id);
        break;
      }
    }
    if (problem) return fail([problem]);
  }

  const title = args.title !== undefined ? args.title : ui.title;
  const components = reachable(ui.root, nodes);
  const computed = Array.isArray(ui.computed) ? ui.computed : undefined;
  // A composition block's formulas may also read fields a sibling block
  // publishes; `scope` carries those names (see collectUis).
  const scope = Array.isArray(ui.scope) ? ui.scope : undefined;
  const computedIds = Array.isArray(ui.computedIds) ? ui.computedIds : undefined;
  const before = publishedFieldKeys(ui.components);
  const after = publishedFieldKeys(components);
  // A patch may only (re)publish field keys the answer already knows: its own
  // previous keys or one `scope` declares. A brand-new name would join the
  // answer-wide pool without the Host being able to rule out a collision with
  // another block's `computed` id (this block cannot see its siblings) — the
  // resulting one-name-two-values state is exactly what ui_compose rejects.
  const introduced = [...after].filter(key => !before.has(key));
  // This block's own ids are checked against its own fields by validateTree
  // below (with the precise path); only a sibling's id is invisible here.
  const ownIds = new Set(Array.isArray(computed) ? computed.filter(isPlainObject).map(c => c.id).filter(id => typeof id === 'string') : []);
  const reserved = new Set((computedIds ?? []).filter(id => !ownIds.has(id)));
  for (const key of introduced) {
    if (reserved.has(key)) {
      return fail([`ops: the patched components publish field key ${JSON.stringify(key)}, but another block of this answer declares the computed id ${JSON.stringify(key)}; one name cannot be both a field and a formula. Pick a different field name.`]);
    }
    if (scope && !scope.includes(key)) {
      return fail([`ops: the patched components publish the new field key ${JSON.stringify(key)}; a block patch may only re-publish the field keys this answer already shares (${scope.length ? scope.join(', ') : 'none'}), because a new name can collide with a sibling block's computed id. Remove the field, reuse an existing key, or call ui_compose again with the complete answer.`]);
    }
  }
  // A block that removes (or renames) the form it published a shared value
  // through leaves a value no input of its own backs any more. `scope` stays
  // (a sibling block may publish the same key), but the browser is told which
  // keys this version no longer produces and must not resurrect their last
  // value as if the removed input were still there.
  const staleFields = scope ? scope.filter(key => before.has(key) && !after.has(key)) : [];
  const previous = Array.isArray(ui.staleFields) ? ui.staleFields.filter(key => scope?.includes(key) && !after.has(key)) : [];
  const retired = [...new Set([...previous, ...staleFields])];
  // The whole next version passes the same checks as a fresh ui_render.
  const check = validateTree(
    clone({ ...(title ? { title } : {}), root: ui.root, components, ...(computed ? { computed } : {}) }),
    scope ? { fields: scope } : undefined,
  );
  if (!check.ok) return fail(check.errors.slice(0, 40));
  const reached = new Set(components.map(n => n.id));
  const dropped = [...added].filter(id => !reached.has(id));
  const warnings = dropped.length ? [`new components not attached anywhere (dropped): ${dropped.join(', ')}`] : [];
  return {
    ok: true,
    ui: {
      uiId: ui.uiId, version: ui.version + 1, ...(title ? { title } : {}), root: ui.root, components,
      ...(computed ? { computed } : {}), ...(scope ? { scope } : {}),
      ...(computedIds ? { computedIds } : {}),
      ...(retired.length ? { staleFields: retired } : {}),
    },
    changed: [...changed].filter(id => reached.has(id)),
    warnings,
  };
}

const MAX_CALL_ARGUMENT_CHARS = 512_000;

/**
 * Parse raw tool call arguments (JSON string or pre-parsed plain object) within
 * a defensive size bound.
 * @param {unknown} raw
 * @returns {Record<string, any> | undefined}
 */
function parseCallArguments(raw) {
  if (typeof raw === 'string') {
    if (raw.length > MAX_CALL_ARGUMENT_CHARS) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : undefined;
    } catch { return undefined; }
  }
  return isPlainObject(raw) ? raw : undefined;
}

/**
 * Convert a Map or plain object into a null-prototype dictionary so keys like
 * `__proto__` or `constructor` remain inert own properties.
 * @param {Iterable<[string, any]>} entries
 * @returns {Record<string, any>}
 */
function toSafeRecord(entries) {
  const out = Object.create(null);
  for (const [k, v] of entries) {
    if (typeof k === 'string' && k !== '') out[k] = v;
  }
  return out;
}

/**
 * Apply one settled UI tool call (`ui_render`, `ui_compose`, `ui_patch`) to a
 * mutable Map of UI snapshots. Returns true when `uis` changed.
 * @param {Map<string, UiSnapshot>} uis
 * @param {string} callId
 * @param {string} name
 * @param {unknown} rawArgs
 * @param {{ content?: readonly any[], meta?: unknown }} outcome
 * @param {{ render: string, patch: string, compose?: string, config?: any }} tools
 */
function applySettledUiCall(uis, callId, name, rawArgs, outcome, tools) {
  const args = parseCallArguments(rawArgs);
  if (!args) return false;
  if (tools.compose !== undefined && name === tools.compose) {
    // deriveMessages omits presentationMeta, so accept either presentationMeta.ok === true
    // (session events / PTC dispatches) or the tool's positive text acknowledgment.
    const metaOk = isPlainObject(outcome.meta) && outcome.meta.ok === true;
    const textOk = Array.isArray(outcome.content) && outcome.content.some(b => b?.type === 'text' && b.text?.startsWith('Composed answer'));
    if (!metaOk && !textOk) return false;
    const config = tools.config ?? {};
    const composed = validateComposition(clone(args ?? null), config, {
      requireCatalog: config.enableCatalog !== false,
      requireWidget: config.enableWidget !== false,
    });
    if (!composed.ok) return false;
    const scope = [...compositionFieldKeys(composed.blocks)];
    // Every computed id of the answer, so a block patch can recognise a
    // field key that a *sibling* block already uses for a formula.
    const computedIds = [];
    for (const block of composed.blocks) {
      if (block.type !== 'catalog' || !Array.isArray(block.computed)) continue;
      for (const formula of block.computed) {
        if (isPlainObject(formula) && typeof formula.id === 'string') computedIds.push(formula.id);
      }
    }
    let changed = false;
    for (const block of composed.blocks) {
      if (block.type !== 'catalog') continue;
      const uiId = composeUiId(callId, block.id);
      uis.set(uiId, snapshotOf(uiId, {
        title: block.title, root: block.root, components: block.components,
        ...(Array.isArray(block.computed) ? { computed: block.computed } : {}),
      }, { scope, computedIds }));
      changed = true;
    }
    return changed;
  }
  if (name === tools.render) {
    if (!validateTree(clone(args ?? null)).ok) return false;
    uis.set(callId, snapshotOf(callId, args));
    return true;
  }
  if (name === tools.patch) {
    const ui = isPlainObject(args) && typeof args.uiId === 'string' ? uis.get(args.uiId) : undefined;
    if (!ui) return false;
    const result = applyPatch(ui, args);
    if (!result.ok) return false;
    uis.set(ui.uiId, result.ui);
    return true;
  }
  return false;
}

/**
 * Rebuild the current version of every UI in one conversation from its message
 * history: each `ui_render` call that settled without error and validates, then
 * each settled `ui_patch` call in result order. Patches are deterministic, so
 * replaying them reproduces exactly the versions the user saw. Calls without a
 * result yet (including the one being executed) are ignored.
 * Catalog blocks of `ui_compose` calls (`tools.compose`) join the same map under
 * their derived `<callId>#<blockId>` identity, so one patch protocol addresses both.
 * @param {readonly any[]} messages - `Session.deriveMessages()`.
 * @param {{ render: string, patch: string, compose?: string, config?: any }} tools - tool names.
 * @returns {Map<string, UiSnapshot>}
 */
export function collectUis(messages, tools) {
  const calls = new Map();
  const uis = new Map();
  const relevant = name => name === tools.render || name === tools.patch || (tools.compose !== undefined && name === tools.compose);
  for (const m of messages) {
    if (m?.role === 'assistant' && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b?.type === 'tool-call' && relevant(b.name)) calls.set(b.id, b);
      }
      continue;
    }
    if (m?.role !== 'tool' || m.isError === true) continue;
    const call = calls.get(m.toolCallId);
    if (!call) continue;
    calls.delete(m.toolCallId);
    applySettledUiCall(uis, call.id, call.name, call.arguments, { content: m.content }, tools);
  }
  return uis;
}

/**
 * Pure incremental fold over one committed DSH SessionEvent (`tool/call`,
 * `tool/result`, or `tool/ptc-dispatch` from the PTC executor). Returns the
 * exact same `state` reference when an event does not change pending calls or
 * settled UI snapshots.
 * @param {{ pending: Record<string, { name: string, arguments: unknown }>, uis: Record<string, UiSnapshot> }} state
 * @param {any} event
 * @param {{ render: string, patch: string, compose?: string, config?: any }} tools
 */
export function foldUiEvent(state, event, tools) {
  if (!isPlainObject(event) || !isPlainObject(event.data)) return state;
  const relevant = name => name === tools.render || name === tools.patch || (tools.compose !== undefined && name === tools.compose);
  const data = event.data;
  if (event.type === 'tool/call') {
    if (!relevant(data.name) || typeof data.callId !== 'string' || data.callId === '') return state;
    const nextPending = toSafeRecord(Object.entries(state.pending));
    nextPending[data.callId] = { name: data.name, arguments: data.arguments };
    return {
      pending: nextPending,
      uis: state.uis,
    };
  }
  if (event.type === 'tool/result') {
    if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') return state;
    const message = isPlainObject(data.message) ? data.message : {};
    const callId = isPlainObject(message.source) && typeof message.source.callId === 'string'
      ? message.source.callId
      : (typeof data.callId === 'string' ? data.callId : '');
    if (!callId || !Object.hasOwn(state.pending, callId)) return state;
    const call = state.pending[callId];
    const nextPending = toSafeRecord(Object.entries(state.pending));
    delete nextPending[callId];
    const failed = message.isError === true || data.isError === true || isPlainObject(data.error)
      || (isPlainObject(data.meta) && data.meta.ok === false);
    if (failed) return { pending: nextPending, uis: state.uis };
    const map = new Map(Object.entries(state.uis));
    const changed = applySettledUiCall(map, callId, call.name, call.arguments, { content: message.content, meta: data.meta }, tools);
    return {
      pending: nextPending,
      uis: changed ? toSafeRecord(map) : state.uis,
    };
  }
  if (event.type === 'tool/ptc-dispatch') {
    if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') return state;
    if (!relevant(data.name) || typeof data.subCallId !== 'string' || data.subCallId === '') return state;
    const failed = data.isError === true || isPlainObject(data.error)
      || (isPlainObject(data.meta) && data.meta.ok === false);
    if (failed) return state;
    const map = new Map(Object.entries(state.uis));
    const changed = applySettledUiCall(map, data.subCallId, data.name, data.arguments, { content: data.content, meta: data.meta }, tools);
    return changed ? { pending: state.pending, uis: toSafeRecord(map) } : state;
  }
  return state;
}

/**
 * Rebuild every UI snapshot from a sequence of DSH SessionEvents (including
 * PTC `tool/ptc-dispatch` sub-calls and pre-compaction turns).
 * @param {readonly any[]} events
 * @param {{ render: string, patch: string, compose?: string, config?: any }} tools
 * @returns {Map<string, UiSnapshot>}
 */
export function collectUisFromEvents(events, tools) {
  let state = { pending: Object.create(null), uis: Object.create(null) };
  for (const row of events ?? []) {
    const event = isPlainObject(row?.event) ? row.event : row;
    state = foldUiEvent(state, event, tools);
  }
  return new Map(Object.entries(state.uis));
}

/**
 * Host-only `SessionProjectionRegistry` unit definition (`ctx.sessionProjections`).
 * Folds committed `tool/call`, `tool/result` and `tool/ptc-dispatch` events
 * without calling deprecated synchronous Session event readers.
 * @param {{ render: string, patch: string, compose?: string, config?: any }} tools
 */
export function createUiSessionProjection(tools) {
  const isRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  return {
    key: 'intelligent-ui.catalog-uis',
    stateVersion: 1,
    stateSchema: {
      parse(value) {
        if (!isRecord(value) || !isRecord(value.pending) || !isRecord(value.uis)) {
          throw new Error('invalid intelligent-ui session projection state');
        }
        return value;
      },
    },
    init: () => ({ pending: Object.create(null), uis: Object.create(null) }),
    apply: (state, event) => foldUiEvent(state, event, tools),
  };
}

/** Compact `id:Type` outline the model can address in its next patch. */
export function outline(ui, max = 80) {
  const parts = ui.components.slice(0, max).map(n => `${n.id}:${n.type}`);
  if (ui.components.length > max) parts.push(`… ${ui.components.length - max} more`);
  return parts.join(', ');
}
