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
 * @typedef {{ uiId: string, version: number, title?: string, root: string, components: UiNode[] }} UiSnapshot
 */

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const clone = v => JSON.parse(JSON.stringify(v));

/** Legacy built-ins alone accept props.children; extensions use their exact schema. */
function normalize(node) {
  if (Object.hasOwn(CATALOG, node.type) && isPlainObject(node.props) && 'children' in node.props) {
    if (node.children === undefined && Array.isArray(node.props.children)) node.children = node.props.children;
    delete node.props.children;
  }
  return node;
}

/**
 * Normalize a validated `ui_render` payload into a snapshot.
 * @param {string} uiId
 * @param {any} args - `ui_render` arguments that passed {@link validateTree}.
 * @returns {UiSnapshot}
 */
export function snapshotOf(uiId, args) {
  const tree = clone(args);
  const byId = new Map(tree.components.map(n => [n.id, normalize(n)]));
  return {
    uiId,
    version: 1,
    ...(typeof tree.title === 'string' && tree.title ? { title: tree.title } : {}),
    root: tree.root,
    components: reachable(tree.root, byId),
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
        if (op.props && 'children' in op.props) { problem = `${at}.props.children: children are not props; use insertChild/removeNode/replaceNode`; break; }
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
  // The whole next version passes the same checks as a fresh ui_render.
  const check = validateTree(clone({ ...(title ? { title } : {}), root: ui.root, components }));
  if (!check.ok) return fail(check.errors.slice(0, 40));
  const reached = new Set(components.map(n => n.id));
  const dropped = [...added].filter(id => !reached.has(id));
  const warnings = dropped.length ? [`new components not attached anywhere (dropped): ${dropped.join(', ')}`] : [];
  return {
    ok: true,
    ui: { uiId: ui.uiId, version: ui.version + 1, ...(title ? { title } : {}), root: ui.root, components },
    changed: [...changed].filter(id => reached.has(id)),
    warnings,
  };
}

/**
 * Rebuild the current version of every UI in one conversation from its message
 * history: each `ui_render` call that settled without error and validates, then
 * each settled `ui_patch` call in result order. Patches are deterministic, so
 * replaying them reproduces exactly the versions the user saw. Calls without a
 * result yet (including the one being executed) are ignored.
 * @param {readonly any[]} messages - `Session.deriveMessages()`.
 * @param {{ render: string, patch: string }} tools - tool names.
 * @returns {Map<string, UiSnapshot>}
 */
export function collectUis(messages, tools) {
  const calls = new Map();
  const uis = new Map();
  for (const m of messages) {
    if (m?.role === 'assistant' && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b?.type === 'tool-call' && (b.name === tools.render || b.name === tools.patch)) calls.set(b.id, b);
      }
      continue;
    }
    if (m?.role !== 'tool' || m.isError === true) continue;
    const call = calls.get(m.toolCallId);
    if (!call) continue;
    calls.delete(m.toolCallId);
    let args;
    try { args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments; } catch { continue; }
    if (call.name === tools.render) {
      if (validateTree(clone(args ?? null)).ok) uis.set(call.id, snapshotOf(call.id, args));
      continue;
    }
    const ui = isPlainObject(args) && typeof args.uiId === 'string' ? uis.get(args.uiId) : undefined;
    if (!ui) continue;
    const result = applyPatch(ui, args);
    if (result.ok) uis.set(ui.uiId, result.ui);
  }
  return uis;
}

/** Compact `id:Type` outline the model can address in its next patch. */
export function outline(ui, max = 80) {
  const parts = ui.components.slice(0, max).map(n => `${n.id}:${n.type}`);
  if (ui.components.length > max) parts.push(`… ${ui.components.length - max} more`);
  return parts.join(', ');
}
