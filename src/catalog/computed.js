/**
 * Declarative computed fields for catalog UIs (Issue #84, Phase 1).
 *
 * A `ui_render` payload may carry a root-level `computed` array:
 *
 *   computed: [
 *     { id: 'subtotal', expr: 'price * qty', format: { style: 'currency', currency: 'USD' } },
 *     { id: 'tax', expr: 'subtotal * 0.08' },
 *     { id: 'total', expr: 'subtotal + tax' },
 *     { id: 'bulk', expr: 'qty >= 10' },
 *   ]
 *
 * The engine collects each formula's dependencies (its free identifiers),
 * topologically sorts the graph, detects cycles, evaluates one formula at a
 * time and formats the result. Errors are isolated per formula: a broken
 * formula (and everything downstream of it) is reported in `errors`, while
 * independent branches keep computing.
 *
 * Two traps this module exists to avoid:
 *
 * - **Hidden inputs must not leak.** A field gated away by `when` (passed in
 *   `hiddenFieldKeys`) is treated as empty, so a hidden price can never feed a
 *   phantom total. Because a missing operand makes arithmetic `NaN`, the
 *   formula is reported as an error instead of silently publishing 0.
 * - **No stale ordering.** Evaluation order comes from the dependency graph,
 *   not from the array order the model wrote, so forward references work.
 *
 * Everything here is pure: same inputs, same outputs, no `eval`.
 * @module deepseek-harness-intelligent-ui/catalog/computed
 */

import { compileExpression, CONSTANTS, FUNCTIONS } from './expr.js';

/** Legal computed id: an identifier of at most 64 characters. */
export const COMPUTED_ID = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Names a computed id may not use (math constants, function names, JS literals). */
export const COMPUTED_RESERVED = Object.freeze(new Set([
  ...Object.keys(CONSTANTS),
  ...Object.keys(FUNCTIONS),
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
]));

/** Hard cap on the number of computed entries in one UI. */
export const MAX_COMPUTED = 64;

/** Decimal/currency/percent styles a format may request. */
export const COMPUTED_FORMATS = Object.freeze(['decimal', 'currency', 'percent']);

/** Default locale for `Intl.NumberFormat`: fixed so Host output and browser output agree. */
const DEFAULT_LOCALE = 'en-US';

/** Default currency when `format.currency` is absent. */
const DEFAULT_CURRENCY = 'USD';

/** Recursion cap for prop resolution. */
const MAX_RESOLVE_DEPTH = 32;

/** Placeholder syntax inside any string prop: `{{computed_id}}`. */
const TEMPLATE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Dictionary with no prototype chain. Computed ids and field keys are model
 * input and may legally be named `constructor`, `toString` or `__proto__`; a
 * plain `{}` would answer those names from `Object.prototype` (so an error
 * would look present and a value absent) and `dict.__proto__ = x` would
 * replace the prototype instead of storing a value.
 * @template T
 * @returns {Record<string, T>}
 */
function dict() {
  return /** @type {Record<string, T>} */ (Object.create(null));
}

/**
 * Why `id` is not a legal computed id, or undefined when it is legal.
 * @param {unknown} id
 * @returns {string | undefined}
 */
export function computedIdProblem(id) {
  if (typeof id !== 'string') return 'expected an identifier string';
  if (!COMPUTED_ID.test(id)) return 'expected an identifier like "total" (letters, digits, _, at most 64 characters)';
  if (COMPUTED_RESERVED.has(id)) return `"${id}" is reserved`;
  return undefined;
}

/**
 * Free identifiers of an expression: variables only, excluding math constants
 * and function names (a name followed by `(` is a call, not a value).
 * @param {unknown} src
 * @returns {string[]} de-duplicated names in source order.
 */
export function extractIdentifiers(src) {
  if (typeof src !== 'string' || !src) return [];
  const out = new Set();
  // A single alternation so `1e5` is scanned as a number, never as `e5`.
  const re = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1] !== undefined) continue; // numeric literal
    const name = m[0];
    let j = m.index + name.length;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === '(') continue; // function call
    if (Object.hasOwn(CONSTANTS, name)) continue;
    out.add(name);
  }
  return [...out];
}

/**
 * Validate shape, ids and dependencies of a `computed` array.
 * @param {unknown} entries
 * @returns {{
 *   byId: Map<string, { id: string, expr: string, format?: object }>,
 *   deps: Map<string, string[]>,
 *   order: string[],
 *   errors: Record<string, string>,
 * }}
 */
function analyze(entries) {
  /** @type {Map<string, { id: string, expr: string, format?: object }>} */
  const byId = new Map();
  /** @type {Record<string, string>} */
  const errors = dict();
  /** @type {Map<string, string[]>} */
  const deps = new Map();
  /** @type {string[]} */
  const order = [];

  if (!Array.isArray(entries)) return { byId, deps, order, errors };

  entries.forEach((entry, i) => {
    const at = `computed[${i}]`;
    if (!isPlainObject(entry)) { errors[at] = 'expected an object'; return; }
    const id = entry.id;
    const problem = computedIdProblem(id);
    if (problem) { errors[at] = `id: ${problem}`; return; }
    if (byId.has(id)) { errors[at] = `duplicate computed id "${id}"; the first definition wins`; return; }
    if (typeof entry.expr !== 'string' || !entry.expr.trim()) { errors[id] = 'expr: expected a non-empty expression string'; return; }
    byId.set(id, entry);
  });

  for (const [id, entry] of byId) {
    deps.set(id, extractIdentifiers(entry.expr).filter(name => byId.has(name)));
  }

  // Iterative DFS would complicate cycle reporting; the graph is capped at
  // MAX_COMPUTED entries so recursion stays shallow.
  const state = new Map(); // 1 = on the stack, 2 = done
  const stack = [];
  const visit = (id) => {
    const seen = state.get(id);
    if (seen === 2) return;
    if (seen === 1) {
      const at = stack.indexOf(id);
      const cycle = [...stack.slice(at === -1 ? 0 : at), id];
      const message = `Cyclic dependency: ${cycle.join(' -> ')}`;
      for (const member of cycle.slice(0, -1)) if (!errors[member]) errors[member] = message;
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const dep of deps.get(id) ?? []) visit(dep);
    stack.pop();
    state.set(id, 2);
    order.push(id);
  };
  for (const id of byId.keys()) visit(id);

  return { byId, deps, order, errors };
}

/**
 * Topological order of a `computed` array plus any graph-level errors.
 * Cycle members are reported as `Cyclic dependency: a -> b -> a`.
 * @param {unknown} entries
 * @returns {{ order: string[], errors: Record<string, string>, deps: Record<string, string[]> }}
 */
export function resolveComputedOrder(entries) {
  const { order, errors, deps } = analyze(entries);
  /** @type {Record<string, string[]>} */
  const out = dict();
  for (const [id, list] of deps) out[id] = [...list];
  const outErrors = dict();
  for (const [id, message] of Object.entries(errors)) outErrors[id] = message;
  return { order, errors: outErrors, deps: out };
}

/**
 * Coerce one raw field value into something an expression can use. Numeric
 * strings from HTML inputs become numbers, empty strings become `undefined`
 * ("no value"), and `true`/`false` strings become booleans.
 * @param {unknown} raw
 * @returns {number | boolean | string | undefined}
 */
export function coerceFieldValue(raw) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return undefined;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
    if (text === 'true') return true;
    if (text === 'false') return false;
    return text;
  }
  return undefined;
}

/** @type {Map<string, Intl.NumberFormat>} */
const numberFormats = new Map();

function numberFormat(locale, options) {
  const key = `${locale}\u0000${JSON.stringify(options)}`;
  let fmt = numberFormats.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    if (numberFormats.size >= 50) {
      const oldest = numberFormats.keys().next();
      if (!oldest.done) numberFormats.delete(oldest.value);
    }
    numberFormats.set(key, fmt);
  }
  return fmt;
}

/**
 * Format one computed value. Numbers honour `format.style`
 * (`currency` | `percent` | `decimal`); `percent` follows `Intl` and multiplies
 * by 100, so `0.25` renders as `25%`. Booleans render as `true`/`false` and an
 * unusable format falls back to the plain string rather than throwing.
 * @param {number | boolean} value
 * @param {unknown} format
 * @returns {string}
 */
export function formatComputedValue(value, format) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (!isPlainObject(format)) return String(value);
  const style = COMPUTED_FORMATS.includes(format.style) ? format.style : 'decimal';
  const locale = typeof format.locale === 'string' && format.locale ? format.locale : DEFAULT_LOCALE;
  /** @type {Intl.NumberFormatOptions} */
  const options = { style };
  if (style === 'currency') options.currency = typeof format.currency === 'string' && format.currency ? format.currency : DEFAULT_CURRENCY;
  for (const key of ['minimumFractionDigits', 'maximumFractionDigits']) {
    const digits = format[key];
    if (Number.isInteger(digits) && digits >= 0 && digits <= 20) options[key] = digits;
  }
  if (Number.isInteger(options.minimumFractionDigits) && Number.isInteger(options.maximumFractionDigits)
    && options.minimumFractionDigits > options.maximumFractionDigits) {
    delete options.minimumFractionDigits;
  }
  try {
    return numberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Evaluate every computed entry against the current field values.
 *
 * @param {unknown} spec - the root `computed` array.
 * @param {Record<string, unknown>} [fields] - current form field values.
 * @param {Iterable<string> | string} [hiddenFieldKeys] - keys gated away by
 *   `when`; their values are treated as empty (never as 0).
 * @returns {{
 *   values: Record<string, number | boolean>,
 *   formatted: Record<string, string>,
 *   errors: Record<string, string>,
 * }}
 */
export function evaluateComputed(spec, fields = {}, hiddenFieldKeys = []) {
  /** @type {Record<string, number | boolean>} */
  const values = dict();
  /** @type {Record<string, string>} */
  const formatted = dict();
  /** @type {Record<string, string>} */
  const errors = dict();

  const hidden = hiddenFieldKeys instanceof Set
    ? hiddenFieldKeys
    : new Set(typeof hiddenFieldKeys === 'string' ? [hiddenFieldKeys] : Array.isArray(hiddenFieldKeys) ? hiddenFieldKeys : []);

  /** @type {Record<string, number | boolean | string>} */
  const fieldScope = dict();
  if (isPlainObject(fields)) {
    for (const [key, raw] of Object.entries(fields)) {
      if (hidden.has(key)) continue;
      const value = coerceFieldValue(raw);
      if (value !== undefined) fieldScope[key] = value;
    }
  }

  const { byId, deps, order, errors: graphErrors } = analyze(spec);
  Object.assign(errors, graphErrors);

  // Hidden keys stay in the scope signature (so a formula that reads one
  // compiles and then reports an empty operand) but never in the values.
  const variables = [...new Set([...Object.keys(isPlainObject(fields) ? fields : {}), ...hidden, ...byId.keys()])];

  for (const id of order) {
    if (errors[id]) continue;
    const entry = byId.get(id);
    if (!entry) continue;
    const failedDep = (deps.get(id) ?? []).find(dep => errors[dep]);
    if (failedDep) {
      errors[id] = `depends on failed computed "${failedDep}"`;
      continue;
    }
    let fn;
    try {
      fn = compileExpression(entry.expr, variables);
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : String(err);
      continue;
    }
    const scope = { ...fieldScope, ...values };
    let result;
    try {
      result = fn(scope);
    } catch (err) {
      errors[id] = err instanceof Error ? err.message : String(err);
      continue;
    }
    if (typeof result === 'number' && !Number.isFinite(result)) {
      errors[id] = 'expression did not produce a finite number; a referenced field is empty, hidden or not numeric';
      continue;
    }
    if (typeof result !== 'number' && typeof result !== 'boolean') {
      errors[id] = 'expression must produce a number or a boolean';
      continue;
    }
    values[id] = result;
    formatted[id] = formatComputedValue(result, entry.format);
  }

  return { values, formatted, errors };
}

/**
 * Replace `{{id}}` placeholders in a string with the formatted computed value.
 * Unknown ids are left untouched (validation reports them).
 * @param {string} text
 * @param {{ values?: Record<string, number | boolean>, formatted?: Record<string, string> }} result
 * @returns {string}
 */
export function interpolateTemplate(text, result) {
  if (typeof text !== 'string') return text;
  const values = result?.values ?? {};
  const formatted = result?.formatted ?? {};
  return text.replace(TEMPLATE, (match, id) => (Object.hasOwn(values, id) ? formatted[id] ?? String(values[id]) : match));
}

/**
 * @param {unknown} value
 * @param {{ values?: Record<string, number | boolean>, formatted?: Record<string, string> }} result
 * @param {number} depth
 * @returns {unknown}
 */
function resolveValue(value, result, depth) {
  if (depth > MAX_RESOLVE_DEPTH) return value;
  if (typeof value === 'string') return interpolateTemplate(value, result);
  if (Array.isArray(value)) return value.map(item => resolveValue(item, result, depth + 1));
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$computed') {
    const id = value.$computed;
    if (typeof id !== 'string') return undefined;
    const values = result?.values ?? {};
    return Object.hasOwn(values, id) ? values[id] : undefined;
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    // `out[key] = ...` would run the `__proto__` setter for a key JSON.parse
    // produced as an own property, turning unvalidated nested props into the
    // prototype of the copy. Define the property instead: same data, no chain.
    Object.defineProperty(out, key, {
      value: resolveValue(item, result, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return out;
}

/**
 * Return a copy of `node` whose props have computed values applied:
 *
 * - strings: `"Total: {{total}}"` → `"Total: $1,234.00"` (formatted value);
 * - `{"$computed": "id"}` anywhere in props/arrays → the raw value, for numeric
 *   slots such as `Progress.value` or `Chart.series[i].values[j]`.
 *
 * The input node is never mutated; an unknown or failed id resolves to
 * `undefined` so the component falls back instead of inventing a number.
 * @template {{ props?: unknown }} T
 * @param {T} node
 * @param {{ values?: Record<string, number | boolean>, formatted?: Record<string, string> }} computed
 * @returns {T}
 */
export function resolveComputedProps(node, computed) {
  if (!isPlainObject(node)) return node;
  const result = isPlainObject(computed) ? computed : {};
  // Spread defines own properties (it never runs a `__proto__` setter), so a
  // hostile own key stays a key; only `props` itself is rewritten.
  /** @type {Record<string, unknown>} */
  const out = { ...node };
  if (Object.hasOwn(out, 'props')) out.props = resolveValue(out.props, result, 0);
  return /** @type {T} */ (out);
}
