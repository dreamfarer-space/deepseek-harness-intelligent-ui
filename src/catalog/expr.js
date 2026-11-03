/**
 * Safe expression compiler shared by the Host (`ui_render` validation of
 * `Plot`/`computed` expressions) and the browser (`Plot` rendering, computed
 * fields). It never uses `eval`/`Function`: source text is tokenized, parsed by
 * recursive descent and compiled to closures over a fixed function table, so a
 * model-written expression can only compute numbers and booleans.
 *
 * Grammar (precedence from loose to tight):
 *
 *   expr       := or
 *   or         := and ('||' and)*
 *   and        := equality ('&&' equality)*
 *   equality   := comparison (('=='|'!=') comparison)*
 *   comparison := additive (('<'|'<='|'>'|'>=') additive)*
 *   additive   := term (('+'|'-') term)*
 *   term       := unary (('*'|'/'|'%'|implicit) unary)*
 *   unary      := ('-'|'+'|'!') unary | power
 *   power      := atom ('^' unary)?            (right-associative)
 *   atom       := number | variable | constant | call | '(' expr ')'
 *
 * Implicit multiplication is kept for compatibility after a number or `)`
 * (`2x`, `3(x+1)`, `(x+1)(x-1)`). Comparisons and logic yield booleans; a
 * comparison with a missing (undefined, null, NaN) or non-numeric operand is
 * `false` and `!=` is its negation, so an empty field never silently compares
 * as 0.
 *
 * @module deepseek-harness-intelligent-ui/catalog/expr
 */

/** Allowed functions and their arity (`-1` = one or more). */
export const FUNCTIONS = Object.freeze({
  sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan],
  asin: [1, Math.asin], acos: [1, Math.acos], atan: [1, Math.atan], atan2: [2, Math.atan2],
  sinh: [1, Math.sinh], cosh: [1, Math.cosh], tanh: [1, Math.tanh],
  exp: [1, Math.exp], ln: [1, Math.log], log: [1, Math.log10], log10: [1, Math.log10], log2: [1, Math.log2],
  sqrt: [1, Math.sqrt], cbrt: [1, Math.cbrt], abs: [1, Math.abs], sign: [1, Math.sign],
  floor: [1, Math.floor], ceil: [1, Math.ceil], round: [1, Math.round],
  min: [-1, Math.min], max: [-1, Math.max], pow: [2, Math.pow], hypot: [-1, Math.hypot],
});

/** Named constants a compiled expression may read. */
export const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E, tau: 2 * Math.PI });

/** Own-property lookup: names like `constructor` must not reach the prototype chain. */
const own = (table, name) => (Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined);

/** Longest accepted expression source. */
export const MAX_EXPR_LENGTH = 500;

/** Most compiled expressions kept in the LRU cache. */
export const EXPR_CACHE_LIMIT = 500;

/**
 * Two-character operators (`**` is an alias of `^`). Tried before the
 * one-character table so `<=` never scans as `<` followed by `=`.
 */
const TWO_CHAR_OPS = Object.freeze({
  '<=': '<=', '>=': '>=', '==': '==', '!=': '!=', '&&': '&&', '||': '||', '**': '^',
});
const ONE_CHAR_OPS = '+-*/%^<>!';

/**
 * @param {string} src
 * @returns {{ t: 'num' | 'id' | 'op' | '(' | ')' | ',', v: string | number, at: number }[]}
 */
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]), at: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0], at: i }); i += id[0].length; continue; }
    const pair = TWO_CHAR_OPS[src.slice(i, i + 2)];
    if (pair) { out.push({ t: 'op', v: pair, at: i }); i += 2; continue; }
    if (ONE_CHAR_OPS.includes(c)) { out.push({ t: 'op', v: c, at: i }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c, v: c, at: i }); i++; continue; }
    if (c === '·' || c === '×') { out.push({ t: 'op', v: '*', at: i }); i++; continue; }
    if (c === '=' || c === '&' || c === '|') {
      throw new SyntaxError(`unexpected character ${JSON.stringify(c)} at ${i}; use "==", "&&" or "||"`);
    }
    throw new SyntaxError(`unexpected character ${JSON.stringify(c)} at ${i}`);
  }
  return out;
}

/** Truthiness for the values an expression can see (`0`, `NaN`, `""`, null and undefined are false). */
function truthy(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v !== '';
  return v !== undefined && v !== null;
}

/** Numeric view of a comparable operand: booleans count as 1/0, anything missing is `undefined`. */
function operand(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

/** `==`: false whenever either side is missing or not numeric. */
function looseEqual(a, b) {
  const x = operand(a);
  const y = operand(b);
  if (x === undefined || y === undefined) return false;
  return x === y;
}

/** `<`-style ordering: false whenever either side is missing or not numeric. */
function ordered(a, b, test) {
  const x = operand(a);
  const y = operand(b);
  if (x === undefined || y === undefined) return false;
  return test(x, y);
}

const COMPARATORS = Object.freeze({
  '<': (x, y) => x < y,
  '<=': (x, y) => x <= y,
  '>': (x, y) => x > y,
  '>=': (x, y) => x >= y,
});

/**
 * Parse `src` into a closure. Not cached: {@link compileExpression} owns the
 * cache and calls this only on a miss.
 * @param {string} src
 * @param {readonly string[]} variables
 * @returns {(scope: Record<string, number | boolean | undefined>) => number | boolean}
 */
function parse(src, variables) {
  const vars = new Set(variables);
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const fail = (msg) => { throw new SyntaxError(msg); };
  const expect = (t) => {
    const tok = tokens[p];
    if (!tok || tok.t !== t) fail(`expected "${t}" ${tok ? `at ${tok.at}` : 'at end'}`);
    p++;
  };

  // expr := or
  const expr = () => or();

  // or := and ('||' and)*
  function or() {
    let left = and();
    while (peek()?.t === 'op' && peek().v === '||') {
      p++;
      const a = left;
      const b = and();
      left = (s) => { const v = a(s); return truthy(v) ? v : b(s); };
    }
    return left;
  }

  // and := equality ('&&' equality)*
  function and() {
    let left = equality();
    while (peek()?.t === 'op' && peek().v === '&&') {
      p++;
      const a = left;
      const b = equality();
      left = (s) => { const v = a(s); return truthy(v) ? b(s) : v; };
    }
    return left;
  }

  // equality := comparison (('=='|'!=') comparison)*
  function equality() {
    let left = comparison();
    while (peek()?.t === 'op' && (peek().v === '==' || peek().v === '!=')) {
      const op = tokens[p++].v;
      const a = left;
      const b = comparison();
      left = op === '==' ? (s) => looseEqual(a(s), b(s)) : (s) => !looseEqual(a(s), b(s));
    }
    return left;
  }

  // comparison := additive (('<'|'<='|'>'|'>=') additive)*
  function comparison() {
    let left = additive();
    while (peek()?.t === 'op' && Object.hasOwn(COMPARATORS, String(peek().v))) {
      const op = COMPARATORS[tokens[p++].v];
      const a = left;
      const b = additive();
      left = (s) => ordered(a(s), b(s), op);
    }
    return left;
  }

  // additive := term (('+'|'-') term)*
  function additive() {
    let left = term();
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = tokens[p++].v;
      const a = left;
      const b = term();
      left = op === '+' ? (s) => Number(a(s)) + Number(b(s)) : (s) => Number(a(s)) - Number(b(s));
    }
    return left;
  }

  // term := unary (('*'|'/'|'%'|implicit) unary)*
  function term() {
    let left = unary();
    for (;;) {
      const tok = peek();
      if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/' || tok.v === '%')) {
        p++;
        const a = left;
        const b = unary();
        left = tok.v === '*' ? (s) => Number(a(s)) * Number(b(s))
          : tok.v === '/' ? (s) => Number(a(s)) / Number(b(s))
            : (s) => Number(a(s)) % Number(b(s));
        continue;
      }
      const prev = tokens[p - 1];
      if (tok && (tok.t === 'id' || tok.t === '(' || tok.t === 'num') && prev && (prev.t === 'num' || prev.t === ')') && !(tok.t === 'num' && prev.t === 'num')) {
        const a = left;
        const b = unary();
        left = (s) => Number(a(s)) * Number(b(s));
        continue;
      }
      return left;
    }
  }

  // unary := ('-'|'+'|'!') unary | power
  function unary() {
    const tok = peek();
    if (tok?.t === 'op' && (tok.v === '-' || tok.v === '+' || tok.v === '!')) {
      p++;
      const a = unary();
      if (tok.v === '-') return (s) => -Number(a(s));
      if (tok.v === '!') return (s) => !truthy(a(s));
      return (s) => Number(a(s));
    }
    return power();
  }

  // power := atom ('^' unary)?   (right-associative, binds tighter than unary minus on its left)
  function power() {
    const base = atom();
    if (peek()?.t === 'op' && peek().v === '^') {
      p++;
      const exp = unary();
      return (s) => Number(base(s)) ** Number(exp(s));
    }
    return base;
  }

  function atom() {
    const tok = tokens[p++];
    if (!tok) fail('unexpected end of expression');
    if (tok.t === 'num') { const v = tok.v; return () => Number(v); }
    if (tok.t === '(') { const inner = expr(); expect(')'); return inner; }
    if (tok.t === 'id') {
      const name = String(tok.v);
      if (peek()?.t === '(') {
        const fn = own(FUNCTIONS, name);
        if (!fn) fail(`unknown function "${name}"; allowed: ${Object.keys(FUNCTIONS).join(', ')}`);
        p++;
        const args = [];
        if (peek()?.t !== ')') {
          args.push(expr());
          while (peek()?.t === ',') { p++; args.push(expr()); }
        }
        expect(')');
        const [arity, impl] = fn;
        if (arity >= 0 && args.length !== arity) fail(`${name}() takes ${arity} argument(s), got ${args.length}`);
        if (arity < 0 && args.length === 0) fail(`${name}() needs at least one argument`);
        if (args.length === 1) { const a = args[0]; return (s) => impl(Number(a(s))); }
        if (args.length === 2) { const [a, b] = args; return (s) => impl(Number(a(s)), Number(b(s))); }
        return (s) => impl(...args.map(a => Number(a(s))));
      }
      if (vars.has(name)) return (s) => s[name];
      const constant = own(CONSTANTS, name);
      if (constant !== undefined) return () => constant;
      fail(`unknown variable "${name}"; available: ${[...vars, ...Object.keys(CONSTANTS)].join(', ')}`);
    }
    fail(`unexpected "${tok.v}" at ${tok.at}`);
  }

  const fn = expr();
  if (p < tokens.length) fail(`unexpected "${tokens[p].v}" at ${tokens[p].at}`);
  return fn;
}

/**
 * LRU cache of compiled expressions. The key is the variable set (order-free)
 * plus the source, so `Plot` re-renders and repeated `computed` evaluations
 * reuse the same closures instead of re-tokenizing.
 * @type {Map<string, (scope: Record<string, number | boolean | undefined>) => number | boolean>}
 */
const cache = new Map();
let hits = 0;
let misses = 0;

function cacheKey(src, variables) {
  const names = [...new Set(variables)].sort();
  return `${names.join('\u0000')}\u0001${src}`;
}

/**
 * Compile an expression, memoized in an LRU cache of {@link EXPR_CACHE_LIMIT}
 * entries.
 * @param {string} src - expression text, e.g. `"a*sin(b*x) + 1"`.
 * @param {readonly string[]} [variables] - names the expression may read.
 * @returns {(scope: Record<string, number | boolean | undefined>) => number | boolean}
 * @throws {SyntaxError} with a readable message on any problem.
 */
export function compileExpression(src, variables = []) {
  if (typeof src !== 'string' || !src.trim()) throw new SyntaxError('empty expression');
  if (src.length > MAX_EXPR_LENGTH) throw new SyntaxError(`longer than ${MAX_EXPR_LENGTH} characters`);
  const names = Array.isArray(variables) ? variables : [];
  const key = cacheKey(src, names);
  const cached = cache.get(key);
  if (cached) {
    // Refresh recency: Map preserves insertion order, so re-insert as newest.
    cache.delete(key);
    cache.set(key, cached);
    hits++;
    return cached;
  }
  const fn = parse(src, names);
  misses++;
  cache.set(key, fn);
  if (cache.size > EXPR_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return fn;
}

/** Drop every cached closure (tests, and any catalog-wide reload). */
export function clearExpressionCache() {
  cache.clear();
  hits = 0;
  misses = 0;
}

/**
 * Cache counters, for tests and diagnostics.
 * @returns {{ size: number, limit: number, hits: number, misses: number }}
 */
export function expressionCacheStats() {
  return { size: cache.size, limit: EXPR_CACHE_LIMIT, hits, misses };
}

/**
 * Validate without throwing.
 * @param {string} src
 * @param {readonly string[]} variables
 * @returns {string | undefined} the error message, or undefined when valid.
 */
export function checkExpression(src, variables) {
  try {
    compileExpression(src, variables);
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
