import { beforeEach, describe, expect, it } from 'vitest'
import { clearExpressionCache, compileExpression, expressionCacheStats } from '../src/catalog/expr.js'
import {
  COMPUTED_RESERVED,
  coerceFieldValue,
  computedIdProblem,
  evaluateComputed,
  extractIdentifiers,
  formatComputedValue,
  resolveComputedOrder,
  resolveComputedProps,
} from '../src/catalog/computed.js'

const count = (obj) => Object.keys(obj).length

describe('dependency order', () => {
  it('sorts a chain declared backwards (d = c * 2 before c = a + b)', () => {
    const spec = [
      { id: 'd', expr: 'c * 2' },
      { id: 'c', expr: 'a + b' },
    ]
    expect(resolveComputedOrder(spec).order).toEqual(['c', 'd'])
    expect(resolveComputedOrder(spec).deps).toEqual({ c: [], d: ['c'] })

    const result = evaluateComputed(spec, { a: 2, b: 3 })
    expect(result.values).toEqual({ c: 5, d: 10 })
    expect(result.formatted).toEqual({ c: '5', d: '10' })
    expect(result.errors).toEqual({})
  })

  it('computes a three-step chain from form values, coercing numeric strings', () => {
    const spec = [
      { id: 'subtotal', expr: 'unit_price * quantity' },
      { id: 'tax', expr: 'subtotal * 0.08' },
      { id: 'total', expr: 'subtotal + tax' },
    ]
    const result = evaluateComputed(spec, { unit_price: '12.50', quantity: '4' })
    expect(result.values.subtotal).toBe(50)
    expect(result.values.tax).toBeCloseTo(4)
    expect(result.values.total).toBeCloseTo(54)
    expect(result.errors).toEqual({})
  })

  it('ignores function names and constants when collecting dependencies', () => {
    expect(extractIdentifiers('max(a, b) * 2 + pi + 1e5')).toEqual(['a', 'b'])
    expect(extractIdentifiers('sin(x) + x1 + _y + tau')).toEqual(['x', 'x1', '_y'])
    expect(extractIdentifiers('(a + 1) > b && !flag')).toEqual(['a', 'b', 'flag'])
  })
})

describe('cycle detection', () => {
  it('reports a two-node cycle and computes nothing', () => {
    const result = evaluateComputed([
      { id: 'a', expr: 'b + 1' },
      { id: 'b', expr: 'a + 1' },
    ], {})
    expect(result.values).toEqual({})
    expect(result.errors.a).toBe('Cyclic dependency: a -> b -> a')
    expect(result.errors.b).toBe('Cyclic dependency: a -> b -> a')
  })

  it('reports a self-reference as a one-node cycle', () => {
    const result = evaluateComputed([{ id: 'a', expr: 'a + 1' }], {})
    expect(result.errors.a).toBe('Cyclic dependency: a -> a')
    expect(count(result.values)).toBe(0)
  })

  it('keeps independent branches alive next to a cycle', () => {
    const result = evaluateComputed([
      { id: 'a', expr: 'b' },
      { id: 'b', expr: 'a' },
      { id: 'ok', expr: 'x * 2' },
    ], { x: 3 })
    expect(result.values).toEqual({ ok: 6 })
    expect(result.errors.a).toMatch(/Cyclic dependency/)
    expect(result.errors.b).toMatch(/Cyclic dependency/)
  })
})

describe('error isolation', () => {
  it('marks a broken formula and its downstream, and still computes siblings', () => {
    const result = evaluateComputed([
      { id: 'bad', expr: 'missing + 1' },
      { id: 'child', expr: 'bad * 2' },
      { id: 'good', expr: 'a + 1' },
    ], { a: 1 })
    expect(result.values).toEqual({ good: 2 })
    expect(result.errors.bad).toMatch(/unknown variable "missing"/)
    expect(result.errors.child).toBe('depends on failed computed "bad"')
    expect(result.errors.good).toBeUndefined()
  })

  it('rejects duplicate ids and malformed specs without throwing', () => {
    const result = evaluateComputed([
      { id: 'a', expr: '1 + 1' },
      { id: 'a', expr: '2 + 2' },
      { id: '1bad', expr: '3 + 3' },
      { id: 'b', expr: '1 +' },
    ], {})
    // Shape problems are reported by position, so the first `a` still evaluates.
    expect(result.values).toEqual({ a: 2 })
    expect(result.errors['computed[1]']).toMatch(/duplicate computed id/)
    expect(result.errors['computed[2]']).toMatch(/^id: .*identifier/)
    expect(result.errors.b).toMatch(/unexpected end of expression/)
    expect(evaluateComputed(undefined, {})).toEqual({ values: {}, formatted: {}, errors: {} })
  })

  it('never lets a non-finite or non-numeric result masquerade as a value', () => {
    const result = evaluateComputed([
      { id: 'div', expr: 'a / b' },
      { id: 'text', expr: 'c' },
    ], { a: 1, b: 0, c: 'abc' })
    expect(result.errors.div).toMatch(/did not produce a finite number/)
    expect(result.values.div).toBeUndefined()
    expect(result.errors.text).toMatch(/number or a boolean/)
    expect(result.values.text).toBeUndefined()
  })
})

describe('comparison and boolean formulas', () => {
  it('evaluates comparisons and logic against field values', () => {
    const result = evaluateComputed([
      { id: 'flag', expr: 'a > 10 && b <= 20' },
      { id: 'other', expr: 'a > 100 || b < 100' },
      { id: 'notEmpty', expr: '!(qty == 0)' },
      { id: 'same', expr: 'a == 11' },
      { id: 'diff', expr: 'a != 11' },
    ], { a: 11, b: 20, qty: 0 })
    expect(result.values).toEqual({ flag: true, other: true, notEmpty: false, same: true, diff: false })
    expect(result.formatted.flag).toBe('true')
  })
})

describe('hidden fields (dsh-genui P1)', () => {
  it('treats a when-gated field as empty instead of reusing its value', () => {
    const spec = [
      { id: 'total', expr: 'price * qty' },
      { id: 'doubled', expr: 'qty * 2' },
    ]
    const visible = evaluateComputed(spec, { price: 100, qty: 2 })
    expect(visible.values.total).toBe(200)

    const gated = evaluateComputed(spec, { price: 100, qty: 2 }, ['price'])
    expect(gated.values).toEqual({ doubled: 4 })
    expect(gated.formatted.total).toBeUndefined()
    expect(gated.errors.total).toMatch(/did not produce a finite number/)
  })

  it('accepts a Set and ignores keys that never appeared in the payload', () => {
    const result = evaluateComputed(
      [{ id: 'x', expr: 'discount * 2' }, { id: 'y', expr: 'qty + 1' }],
      { qty: 4 },
      new Set(['discount']),
    )
    expect(result.values).toEqual({ y: 5 })
    expect(result.errors.x).toMatch(/did not produce a finite number/)
  })

  it('lets a formula opt into a fallback for a hidden field', () => {
    const result = evaluateComputed([{ id: 'total', expr: '(price || 0) * qty' }], { price: 100, qty: 3 }, ['price'])
    expect(result.values.total).toBe(0)
  })
})

describe('formatting', () => {
  it('formats currency, percent and decimal with Intl', () => {
    const result = evaluateComputed([
      { id: 'money', expr: 'price * qty', format: { style: 'currency', currency: 'USD' } },
      { id: 'ratio', expr: 'qty / 8', format: { style: 'percent', maximumFractionDigits: 1 } },
      { id: 'avg', expr: '(a + b) / 2', format: { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 } },
      { id: 'plain', expr: '1 / 3' },
    ], { price: 12.5, qty: 2, a: 1, b: 2 })
    expect(result.formatted.money).toBe('$25.00')
    expect(result.formatted.ratio).toBe('25%')
    expect(result.formatted.avg).toBe('1.50')
    expect(result.formatted.plain).toBe(String(1 / 3))
    expect(result.errors).toEqual({})
  })

  it('falls back to the plain string instead of throwing on a bad format', () => {
    expect(formatComputedValue(12, { style: 'money' })).toBe('12')
    expect(formatComputedValue(12, { style: 'currency', currency: 'not-a-code' })).toBe('12')
    expect(formatComputedValue(true, { style: 'currency' })).toBe('true')
    expect(coerceFieldValue('')).toBeUndefined()
    expect(coerceFieldValue(' 7 ')).toBe(7)
    expect(coerceFieldValue('true')).toBe(true)
  })
})

describe('resolveComputedProps', () => {
  const result = evaluateComputed([
    { id: 'total', expr: 'price * qty', format: { style: 'currency' } },
    { id: 'bulk', expr: 'qty >= 10' },
  ], { price: 10, qty: 4 })

  it('interpolates {{id}} with the formatted value and $computed with the raw value', () => {
    const node = {
      id: 'bar',
      type: 'Progress',
      props: {
        label: 'Total: {{total}} (bulk: {{bulk}})',
        value: { $computed: 'total' },
        max: 100,
        series: [{ name: 'now', values: [{ $computed: 'total' }, 5] }],
        nested: { note: 'x {{ total }} y' },
      },
    }
    const out = resolveComputedProps(node, result)
    expect(out.props.value).toBe(40)
    expect(out.props.label).toBe('Total: $40.00 (bulk: false)')
    expect(out.props.series[0].values).toEqual([40, 5])
    expect(out.props.nested.note).toBe('x $40.00 y')
    expect(out.props.max).toBe(100)
    // The input is never mutated.
    expect(node.props.value).toEqual({ $computed: 'total' })
    expect(node.props.label).toBe('Total: {{total}} (bulk: {{bulk}})')
  })

  it('leaves unknown references unresolved instead of inventing a value', () => {
    const out = resolveComputedProps({
      id: 't',
      type: 'Text',
      props: { text: '{{missing}}', value: { $computed: 'missing' } },
    }, result)
    expect(out.props.text).toBe('{{missing}}')
    expect(out.props.value).toBeUndefined()
  })

  it('passes non-prop fields through untouched', () => {
    const out = resolveComputedProps({ id: 't', type: 'Text', children: ['a'] }, result)
    expect(out).toEqual({ id: 't', type: 'Text', children: ['a'] })
    expect(resolveComputedProps(null, result)).toBeNull()
  })
})

describe('expression cache', () => {
  beforeEach(() => clearExpressionCache())

  it('returns the same closure for the same source and variable set', () => {
    const first = compileExpression('a + b', ['a', 'b'])
    const again = compileExpression('a + b', ['a', 'b'])
    expect(again).toBe(first)
    const stats = expressionCacheStats()
    expect(stats).toMatchObject({ size: 1, misses: 1, hits: 1, limit: 500 })
  })

  it('keys on the variable set, not on its order', () => {
    const a = compileExpression('a * 2', ['a', 'b'])
    expect(compileExpression('a * 2', ['b', 'a'])).toBe(a)
    expect(expressionCacheStats().misses).toBe(1)
  })

  it('reuses compiled formulas across evaluateComputed calls', () => {
    const spec = [{ id: 'total', expr: 'price * qty' }, { id: 'flag', expr: 'qty > 1' }]
    evaluateComputed(spec, { price: 1, qty: 1 })
    const afterFirst = expressionCacheStats()
    expect(afterFirst.misses).toBe(2)
    evaluateComputed(spec, { price: 2, qty: 3 })
    const afterSecond = expressionCacheStats()
    expect(afterSecond.misses).toBe(2)
    expect(afterSecond.hits).toBe(2)
  })

  it('evicts the least recently used entry past the limit', () => {
    for (let i = 0; i < 500; i++) compileExpression(`1 + ${i}`, [])
    const oldest = compileExpression('1 + 0', []) // hit: 0 becomes the newest entry
    compileExpression('1 + 500', []) // evicts the true oldest (1), not 0
    expect(expressionCacheStats()).toMatchObject({ size: 500, limit: 500 })
    const hitsBefore = expressionCacheStats().hits
    expect(compileExpression('1 + 0', [])).toBe(oldest)
    expect(expressionCacheStats().hits).toBe(hitsBefore + 1)
  })
})

describe('ids', () => {
  it('rejects malformed and reserved ids', () => {
    expect(computedIdProblem('total')).toBeUndefined()
    expect(computedIdProblem('_a1')).toBeUndefined()
    expect(computedIdProblem('1total')).toMatch(/identifier/)
    expect(computedIdProblem('has space')).toMatch(/identifier/)
    expect(computedIdProblem('x'.repeat(65))).toMatch(/identifier/)
    expect(computedIdProblem('pi')).toMatch(/reserved/)
    expect(computedIdProblem('sin')).toMatch(/reserved/)
    expect(computedIdProblem(42)).toMatch(/identifier string/)
    expect(COMPUTED_RESERVED.has('tau')).toBe(true)
  })
})

/**
 * Regression suite for the review of Issue #84: a JSON `__proto__` key must
 * stay data, and legal ids that collide with `Object.prototype` members must
 * behave like any other id.
 */
describe('prototype-safe dictionaries', () => {
  it('resolves a JSON __proto__ prop as data, never as the props prototype', () => {
    const node = JSON.parse('{"id":"b","type":"Button","props":{"label":"Go","prompt":"safe","__proto__":{"action":{"actionId":"privileged","args":{}}}}}')
    const out = resolveComputedProps(node, { values: {}, formatted: {} })
    expect(Object.getPrototypeOf(out.props)).toBe(Object.prototype)
    // The inherited `action` a prototype switch would create must not exist.
    expect(out.props.action).toBeUndefined()
    expect(Object.hasOwn(out.props, '__proto__')).toBe(true)
    expect(out.props.__proto__).toEqual({ action: { actionId: 'privileged', args: {} } })
  })

  it('never mutates the shared Object.prototype', () => {
    const node = JSON.parse('{"id":"b","type":"Button","props":{"label":"Go","prompt":"safe","__proto__":{"action":{"actionId":"x","args":{}}}}}')
    resolveComputedProps(node, { values: {}, formatted: {} })
    expect(({}).action).toBeUndefined()
    expect(Object.hasOwn(Object.prototype, 'action')).toBe(false)
  })

  it('treats constructor/toString/__proto__ as ordinary computed ids', () => {
    for (const id of ['constructor', 'toString', '__proto__']) {
      const result = evaluateComputed([{ id, expr: '2' }])
      expect(Object.hasOwn(result.values, id)).toBe(true)
      expect(result.values[id]).toBe(2)
      // An inherited member must not read as an already-reported error.
      expect(Object.hasOwn(result.errors, id)).toBe(false)
    }
  })

  it('reports a real error for a prototype-named id instead of skipping it', () => {
    const result = evaluateComputed([{ id: 'constructor', expr: 'missing * 2' }])
    expect(result.errors.constructor).toMatch(/unknown variable|null|finite number/)
    expect(Object.hasOwn(result.values, 'constructor')).toBe(false)
  })

  it('keeps __proto__ in the dependency table', () => {
    const graph = resolveComputedOrder([{ id: '__proto__', expr: '2' }, { id: 'child', expr: '__proto__ + 1' }])
    expect(graph.order).toEqual(['__proto__', 'child'])
    expect(Object.hasOwn(graph.deps, '__proto__')).toBe(true)
    expect(graph.deps.__proto__).toEqual([])
    expect(graph.deps.child).toEqual(['__proto__'])
  })

  it('reads a field named like a prototype member as a number', () => {
    const result = evaluateComputed([{ id: 'total', expr: 'constructor * 2' }], { constructor: 21 })
    expect(result.values.total).toBe(42)
  })
})
