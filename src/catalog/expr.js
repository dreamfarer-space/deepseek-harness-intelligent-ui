/**
 * Safe math-expression compiler shared by the Host (`ui_render` validation of
 * `Plot` expressions) and the browser (`Plot` rendering). It never uses
 * `eval`/`Function`: source text is tokenized, parsed by recursive descent and
 * compiled to closures over a fixed function table, so a model-written
 * expression can only compute numbers.
 *
 * Grammar: numbers, identifiers (variables, `pi`, `e`), calls to the functions
 * in {@link FUNCTIONS}, `+ - * / % ^ **`, unary minus, parentheses, and
 * implicit multiplication after a number or `)` (`2x`, `3(x+1)`, `(x+1)(x-1)`).
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

const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E, tau: 2 * Math.PI });

/** Own-property lookup: names like `constructor` must not reach the prototype chain. */
const own = (table, name) => (Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined);

/** Longest accepted expression source. */
export const MAX_EXPR_LENGTH = 500;

/**
 * @param {string} src
 * @returns {{ t: 'num' | 'id' | 'op' | '(' | ')' | ',', v: string | number, at: number }[]}
 */
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]), at: i }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0], at: i }); i += id[0].length; continue; }
    if (src.startsWith('**', i)) { out.push({ t: 'op', v: '^', at: i }); i += 2; continue; }
    if ('+-*/%^'.includes(c)) { out.push({ t: 'op', v: c, at: i }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c, v: c, at: i }); i++; continue; }
    if (c === '·' || c === '×') { out.push({ t: 'op', v: '*', at: i }); i++; continue; }
    throw new SyntaxError(`unexpected character ${JSON.stringify(c)} at ${i}`);
  }
  return out;
}

/**
 * Compile an expression.
 * @param {string} src - expression text, e.g. `"a*sin(b*x) + 1"`.
 * @param {readonly string[]} variables - names the expression may read.
 * @returns {(scope: Record<string, number>) => number}
 * @throws {SyntaxError} with a readable message on any problem.
 */
export function compileExpression(src, variables) {
  if (typeof src !== 'string' || !src.trim()) throw new SyntaxError('empty expression');
  if (src.length > MAX_EXPR_LENGTH) throw new SyntaxError(`longer than ${MAX_EXPR_LENGTH} characters`);
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

  // expr := term (('+'|'-') term)*
  function expr() {
    let left = term();
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = tokens[p++].v;
      const a = left; const b = term();
      left = op === '+' ? s => a(s) + b(s) : s => a(s) - b(s);
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
        const a = left; const b = unary();
        left = tok.v === '*' ? s => a(s) * b(s) : tok.v === '/' ? s => a(s) / b(s) : s => a(s) % b(s);
        continue;
      }
      const prev = tokens[p - 1];
      if (tok && (tok.t === 'id' || tok.t === '(' || tok.t === 'num') && prev && (prev.t === 'num' || prev.t === ')') && !(tok.t === 'num' && prev.t === 'num')) {
        const a = left; const b = unary();
        left = s => a(s) * b(s);
        continue;
      }
      return left;
    }
  }
  // unary := ('-'|'+') unary | power
  function unary() {
    const tok = peek();
    if (tok?.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      p++;
      const a = unary();
      return tok.v === '-' ? s => -a(s) : a;
    }
    return power();
  }
  // power := atom ('^' unary)?   (right-associative, binds tighter than unary minus on its left)
  function power() {
    const base = atom();
    if (peek()?.t === 'op' && peek().v === '^') {
      p++;
      const exp = unary();
      return s => base(s) ** exp(s);
    }
    return base;
  }
  function atom() {
    const tok = tokens[p++];
    if (!tok) fail('unexpected end of expression');
    if (tok.t === 'num') { const v = tok.v; return () => v; }
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
        if (args.length === 1) { const a = args[0]; return s => impl(a(s)); }
        if (args.length === 2) { const [a, b] = args; return s => impl(a(s), b(s)); }
        return s => impl(...args.map(a => a(s)));
      }
      if (vars.has(name)) return s => s[name];
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
