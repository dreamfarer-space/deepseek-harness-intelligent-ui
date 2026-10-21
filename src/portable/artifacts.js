/**
 * Host-neutral native DSH event projection. Never infer UI data from text.
 * Only successful tool result metadata can authorize a render or atomic patch.
 */
import { validateTree } from '../catalog/catalog.js';
import { splitComposeUiId, validateComposition } from '../compose/compose.js';
import { COMPOSE_TOOL } from '../compose/constants.js';

const MAX_ARGUMENT_CHARS = 480_000;
const TOOLS = new Set(['ui_render', 'ui_patch', 'ui_render_widget', COMPOSE_TOOL]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const clone = value => JSON.parse(JSON.stringify(value));

function argumentsOf(input) {
  if (typeof input === 'string' && input.length <= MAX_ARGUMENT_CHARS) {
    try { const parsed = JSON.parse(input); return object(parsed) ? parsed : undefined; }
    catch { return undefined; }
  }
  return undefined;
}
function validTree(input) {
  try { return object(input) && validateTree(clone(input)).ok; }
  catch { return false; }
}

/**
 * Project one session's native history and/or mux event records.
 * Events may be SessionEvent[] or session.history rows with an event field.
 * Correctness does not depend on input order; correlation follows callId.
 *
 * @param {readonly any[]} events
 * @param {{hostId:string,sessionId:string}} scope
 */
export function projectNativeUiEvents(events, { hostId, sessionId }) {
  if (!text(hostId) || !text(sessionId)) return [];
  const calls = new Map();
  const settled = [];
  const sorted = events.map(row => row?.event ?? row)
    .filter(event => object(event) && typeof event.seq === 'number')
    .sort((a, b) => a.seq - b.seq);
  for (const event of sorted) {
    const data = object(event.data) ? event.data : {};
    if (event.type === 'tool/call' && TOOLS.has(data.name) && text(data.callId)) {
      const args = argumentsOf(data.arguments);
      if (args) calls.set(data.callId, { kind: data.name, args, turn: data.turn });
      continue;
    }
    if (event.type !== 'tool/result') continue;
    const message = object(data.message) ? data.message : {};
    const id = object(message.source) ? message.source.callId : data.callId;
    if (!text(id)) continue;
    const call = calls.get(id);
    if (!call) continue;
    const meta = data.meta;
    if (!object(meta) || meta.ok !== true || message.isError === true || data.isError === true || object(data.error)) continue;
    settled.push({ id, call, meta, seq: event.seq });
  }
  const latest = new Map();
  const blockVersions = new Map();
  for (const { id, call, meta, seq } of settled.sort((a, b) => a.seq - b.seq)) {
    const args = call.args;
    const policy = object(meta.policy) ? meta.policy : undefined;
    const turn = call.turn === undefined ? undefined : String(call.turn);
    if (call.kind === 'ui_render' && validTree(args)) {
      if (latest.has(id)) continue;
      latest.set(id, { kind: 'declarative', hostId, sessionId, uiId: id, version: 1,
        title: typeof args.title === 'string' ? args.title : undefined,
        definition: args, policy, turn, seq });
      continue;
    }
    if (call.kind === 'ui_render_widget' && text(args.html)) {
      if (latest.has(id)) continue;
      latest.set(id, { kind: 'widget', hostId, sessionId, uiId: id, version: 1,
        title: typeof args.title === 'string' ? args.title : undefined,
        definition: args, policy, turn, seq });
      continue;
    }
    if (call.kind === COMPOSE_TOOL) {
      // The whole answer is one artifact; catalog blocks inside it stay patchable
      // through their derived `<callId>#<blockId>` identity in the latest snapshot.
      if (latest.has(id)) continue;
      const result = validateComposition(args, { maxWidgetBytes: MAX_ARGUMENT_CHARS }, {});
      if (!result.ok) continue;
      latest.set(id, { kind: 'composition', hostId, sessionId, uiId: id, version: 1,
        title: typeof args.title === 'string' ? args.title : undefined,
        definition: args, policy, turn, seq });
      for (const block of result.blocks) {
        if (block.type === 'catalog') blockVersions.set(`${id}#${block.id}`, 1);
      }
      continue;
    }
    if (call.kind !== 'ui_patch' || !text(args.uiId) || !Number.isSafeInteger(args.baseVersion)) continue;
    // A catalog block lives inside its composition artifact; its uiId addresses the block.
    const owner = splitComposeUiId(args.uiId)?.[0] ?? args.uiId;
    const prior = latest.get(owner);
    const next = meta.ui;
    const version = prior?.kind === 'composition' ? blockVersions.get(args.uiId) : prior?.version;
    if (!prior || version !== args.baseVersion
      || !object(next) || next.uiId !== args.uiId || next.version !== version + 1
      || !validTree(next)) continue;
    const block = compositionBlockOf(prior, args.uiId);
    if (prior.kind === 'declarative') {
      latest.set(prior.uiId, { ...prior, version: next.version, definition: next,
        title: typeof next.title === 'string' ? next.title : prior.title,
        policy: policy ?? prior.policy, turn: prior.turn, updatedTurn: turn ?? prior.updatedTurn, seq });
      continue;
    }
    if (prior.kind !== 'composition' || !block) continue;
    // A catalog block's patch replaces just that block inside the composition.
    const definition = {
      ...prior.definition,
      blocks: prior.definition.blocks.map(b => b !== block ? b : {
        ...b,
        ...(typeof next.title === 'string' ? { title: next.title } : {}),
        root: next.root,
        components: next.components,
      }),
    };
    blockVersions.set(args.uiId, next.version);
    latest.set(prior.uiId, { ...prior, version: prior.version + 1, definition,
      policy: policy ?? prior.policy, turn: prior.turn, updatedTurn: turn ?? prior.updatedTurn, seq });
  }
  return [...latest.values()].sort((a, b) => a.seq - b.seq);
}

/** The catalog block of a composition artifact that `<callId>#<blockId>` addresses. */
function compositionBlockOf(artifact, uiId) {
  const parts = splitComposeUiId(uiId);
  if (artifact.kind !== 'composition' || !parts || parts[0] !== artifact.uiId) return undefined;
  return Array.isArray(artifact.definition?.blocks)
    ? artifact.definition.blocks.find(b => object(b) && b.type === 'catalog' && b.id === parts[1])
    : undefined;
}
