/** Trusted-host registry. Never expose this object or registration APIs to generated code. */
export const CONTROL_LIMITS = Object.freeze({ dataBytes: 512_000, argsBytes: 16_000, resultBytes: 64_000, resources: 64, receipts: 128 });
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function fail(message) { throw new Error(message); }
/** Random request id. crypto.randomUUID is missing outside secure contexts (plain-HTTP LAN hosts). */
export function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
function copy(value, max) {
  const check = (v, depth = 0) => {
    if (depth > 20) fail('JSON nesting exceeds limit');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!object(v) && !Array.isArray(v)) fail('Payload must be finite JSON');
    for (const item of Object.values(v)) check(item, depth + 1);
  };
  check(value);
  const raw = JSON.stringify(value);
  if (raw === undefined || new TextEncoder().encode(raw).length > max) fail('Payload exceeds limit or is not JSON');
  return JSON.parse(raw);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Strict bounded JSON Schema subset. Unknown keywords/types fail closed on registration. */
export function validateSchema(schema, value, definition = false, depth = 0) {
  if (depth > 12 || !object(schema)) fail('Invalid schema');
  const keys = { object: ['type', 'properties', 'required', 'additionalProperties'], array: ['type', 'items', 'maxItems'], string: ['type', 'maxLength', 'enum'], number: ['type', 'minimum', 'maximum', 'enum'], integer: ['type', 'minimum', 'maximum', 'enum'], boolean: ['type'], null: ['type'] }[schema.type];
  if (!keys || Object.keys(schema).some(k => !keys.includes(k))) fail('Unsupported schema keyword/type');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length > 100)) fail('Invalid enum');
  for (const k of ['maxLength', 'maxItems']) if (schema[k] !== undefined && (!Number.isSafeInteger(schema[k]) || schema[k] < 0)) fail('Invalid schema bound');
  for (const k of ['minimum', 'maximum']) if (schema[k] !== undefined && !Number.isFinite(schema[k])) fail('Invalid schema bound');
  if (schema.type === 'object') {
    if (!object(schema.properties) || schema.additionalProperties !== false || !Array.isArray(schema.required ?? []) || (schema.required ?? []).some(k => !own(schema.properties, k))) fail('Object schema requires properties and additionalProperties:false');
    for (const s of Object.values(schema.properties)) validateSchema(s, undefined, true, depth + 1);
  }
  if (schema.type === 'array') validateSchema(schema.items, undefined, true, depth + 1);
  if (definition) return;
  if (schema.type === 'object') {
    if (!object(value) || Object.keys(value).some(k => !own(schema.properties, k)) || (schema.required ?? []).some(k => !own(value, k))) fail('Arguments do not match schema');
    for (const [k, v] of Object.entries(value)) validateSchema(schema.properties[k], v, false, depth + 1);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 1000)) fail('Invalid array');
    value.forEach(v => validateSchema(schema.items, v, false, depth + 1));
  } else if (schema.type === 'null') { if (value !== null) fail('Expected null'); }
  else if (typeof value !== (schema.type === 'integer' ? 'number' : schema.type)) fail('Arguments do not match schema');
  if (typeof value === 'number' && (!Number.isFinite(value) || (schema.type === 'integer' && !Number.isSafeInteger(value)) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail('Invalid number');
  if (typeof value === 'string' && value.length > (schema.maxLength ?? 16000)) fail('String exceeds limit');
  if (schema.enum && !schema.enum.includes(value)) fail('Value is outside enum');
}

/** One registry per live session. All resources are scoped to a host-supplied UI id. */
export function createControlledRuntime(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) fail('Session id required');
  const data = new Map(), actions = new Map(), receipts = new Map(), listeners = new Set();
  let disposed = false, revision = 0;
  const notify = () => { revision++; for (const f of listeners) f(); };
  const active = () => { if (disposed) fail('Session disposed'); };
  const key = (scope, id) => JSON.stringify([scope, id]);
  const scopeOf = (ctx) => { active(); if (!ctx || ctx.sessionId !== sessionId || typeof ctx.uiId !== 'string' || !ctx.uiId) fail('Scope denied'); return ctx.uiId; };
  const resourceId = (scope, id) => { if (typeof scope !== 'string' || !scope || scope.length > 200 || typeof id !== 'string' || !id || id.length > 100) fail('Invalid resource id/scope'); };
  const limit = () => { active(); if (data.size + actions.size >= CONTROL_LIMITS.resources) fail('Resource limit'); };
  const runtime = {
    sessionId,
    subscribe(fn) { if (disposed) return () => {}; listeners.add(fn); return () => listeners.delete(fn); },
    getRevision() { return revision; },
    registerData(uiId, id, dataset) {
      limit(); resourceId(uiId, id);
      const value = freeze(copy(dataset, CONTROL_LIMITS.dataBytes));
      if (!Array.isArray(value.columns) || value.columns.length < 1 || value.columns.length > 24 || value.columns.some(c => typeof c !== 'string') || !Array.isArray(value.rows) || value.rows.length > 500 || value.rows.some(r => !Array.isArray(r) || r.length !== value.columns.length || r.some(c => !(c === null || ['string', 'boolean', 'number'].includes(typeof c))))) fail('Invalid dataset');
      const k = key(uiId, id); if (data.has(k)) fail('Duplicate data id');
      const entry = { value, view: freeze({ search: '', filterColumn: -1, filterValue: '', sortColumn: -1, descending: false, page: 0 }) };
      data.set(k, entry); notify();
      return () => { if (data.get(k) === entry) { data.delete(k); notify(); } };
    },
    readData(ctx, ref) {
      const scope = scopeOf(ctx);
      if (!object(ref) || ref.scope !== scope || typeof ref.id !== 'string') fail('Data scope denied');
      const entry = data.get(key(scope, ref.id)); if (!entry) fail('Data unavailable (expired or unregistered)');
      return Object.freeze({ value: entry.value, view: entry.view });
    },
    setView(ctx, ref, patch) {
      const entry = runtime.readData(ctx, ref);
      const view = { ...entry.view, ...copy(patch, 4000) };
      if (Object.keys(view).some(k => !['search','filterColumn','filterValue','sortColumn','descending','page'].includes(k)) || typeof view.search !== 'string' || typeof view.filterValue !== 'string' || typeof view.descending !== 'boolean' || ![view.filterColumn, view.sortColumn].every(n => Number.isInteger(n) && n >= -1 && n < entry.value.columns.length) || !Number.isSafeInteger(view.page) || view.page < 0) fail('Invalid local query');
      data.get(key(ctx.uiId, ref.id)).view = freeze(view); notify();
    },
    registerAction(uiId, id, spec) {
      limit(); resourceId(uiId, id); validateSchema(spec.schema, undefined, true);
      if (!['read', 'write'].includes(spec.effect) || typeof spec.run !== 'function' || typeof spec.authorize !== 'function' || (spec.effect === 'write' && typeof spec.confirm !== 'function')) fail('Action needs effect, authorize, run and write confirmation');
      const k = key(uiId, id); if (actions.has(k)) fail('Duplicate action id');
      const entry = { ...spec, schema: freeze(copy(spec.schema, 16000)) }; actions.set(k, entry);
      return () => { if (actions.get(k) === entry) actions.delete(k); };
    },
    prepareAction(ctx, request) {
      const scope = scopeOf(ctx);
      const safe = copy(request, CONTROL_LIMITS.argsBytes);
      if (!object(safe) || typeof safe.actionId !== 'string' || (safe.requestId !== undefined && (typeof safe.requestId !== 'string' || !safe.requestId || safe.requestId.length > 100))) fail('Invalid action request');
      const entry = actions.get(key(scope, safe.actionId)); if (!entry) fail('Unregistered action');
      validateSchema(entry.schema, safe.args);
      return freeze({ actionId: safe.actionId, args: safe.args, requestId: typeof safe.requestId === 'string' ? safe.requestId : newRequestId() });
    },
    async invokeAction(ctx, request, event) {
      const scope = scopeOf(ctx);
      // No widget-provided gesture flags. Only native events from the trusted parent UI.
      if (!(event instanceof Event) || !event.isTrusted || event.type !== 'click') fail('Explicit trusted user click required');
      if (!object(request) || typeof request.actionId !== 'string' || typeof request.requestId !== 'string' || !request.requestId || request.requestId.length > 100) fail('Invalid action request');
      const entry = actions.get(key(scope, request.actionId)); if (!entry) fail('Unregistered action');
      request = freeze(copy(request, CONTROL_LIMITS.argsBytes));
      ctx = freeze({ sessionId: ctx.sessionId, uiId: scope });
      const args = request.args; validateSchema(entry.schema, args);
      const receiptKey = key(scope, request.requestId), fingerprint = JSON.stringify([request.actionId, args]);
      const previous = receipts.get(receiptKey);
      if (previous) { if (previous.fingerprint !== fingerprint) fail('Idempotency key reused with different arguments'); return previous.promise; }
      if (receipts.size >= CONTROL_LIMITS.receipts) fail('Receipt limit reached; start a new surface/session');
      const context = freeze({ sessionId, uiId: scope, requestId: request.requestId });
      const assertLive = () => { scopeOf(ctx); if (actions.get(key(scope, request.actionId)) !== entry) fail('Action revoked'); };
      // Cache before any await: concurrent duplicate requests share one receipt.
      let started = false;
      const promise = Promise.resolve().then(async () => {
        assertLive(); if (await entry.authorize(context, args) !== true) fail('Action permission denied');
        assertLive(); if (entry.effect === 'write' && await entry.confirm(context, args) !== true) fail('Action cancelled');
        assertLive(); if (await entry.authorize(context, args) !== true) fail('Action permission denied');
        assertLive(); started = true;
        return copy(await entry.run(args, context), CONTROL_LIMITS.resultBytes);
      }).catch(error => {
        // Permission/approval failures cannot have applied the operation. Allow
        // another explicit click to recheck them, but retain uncertain run errors.
        if (!started && receipts.get(receiptKey)?.promise === promise) receipts.delete(receiptKey);
        throw error;
      });
      receipts.set(receiptKey, { fingerprint, promise }); return promise;
    },
    releaseScope(uiId) {
      for (const map of [data, actions, receipts]) for (const k of map.keys()) if (JSON.parse(k)[0] === uiId) map.delete(k);
      notify();
    },
    dispose() { if (disposed) return; disposed = true; data.clear(); actions.clear(); receipts.clear(); notify(); listeners.clear(); },
  };
  return runtime;
}
/** Pure local projection shared by table and chart. Paging is only a presentation concern. */
export function projectData(entry) {
  const { value, view } = entry;
  let rows = value.rows.filter(r => (!view.search || r.some(c => String(c ?? '').toLowerCase().includes(view.search.toLowerCase()))) && (view.filterColumn < 0 || String(r[view.filterColumn] ?? '') === view.filterValue));
  if (view.sortColumn >= 0) rows = [...rows].sort((a, b) => {
    const x = a[view.sortColumn], y = b[view.sortColumn];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * (view.descending ? -1 : 1);
  });
  return { columns: value.columns, rows };
}
