/**
 * Host-neutral native DSH event projection. Never infer UI data from text.
 * Only successful tool result metadata can authorize a render or atomic patch.
 */
import { validateTree } from '../catalog/catalog.js';

const MAX_ARGUMENT_CHARS = 480_000;
const TOOLS = new Set(['ui_render', 'ui_patch', 'ui_render_widget']);
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
    if (call.kind !== 'ui_patch' || !text(args.uiId) || !Number.isSafeInteger(args.baseVersion)) continue;
    const prior = latest.get(args.uiId);
    const next = meta.ui;
    if (!prior || prior.kind !== 'declarative' || prior.version !== args.baseVersion
      || !object(next) || next.uiId !== args.uiId || next.version !== prior.version + 1
      || !validTree(next)) continue;
    latest.set(prior.uiId, { ...prior, version: next.version, definition: next,
      title: typeof next.title === 'string' ? next.title : prior.title,
      policy: policy ?? prior.policy, turn: prior.turn, updatedTurn: turn ?? prior.updatedTurn, seq });
  }
  return [...latest.values()].sort((a, b) => a.seq - b.seq);
}
