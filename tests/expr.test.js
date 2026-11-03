import { describe, expect, it } from 'vitest'
import { checkExpression, clearExpressionCache, compileExpression, expressionCacheStats } from '../src/catalog/expr.js'

const ev = (src, scope = {}, vars = Object.keys(scope)) => compileExpression(src, vars)(scope)

describe('compileExpression', () => {
  it('evaluates arithmetic with the usual precedence', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('2 ^ 3 ^ 2')).toBe(512)
    expect(ev('2 ** 3')).toBe(8)
    expect(ev('-x^2', { x: 3 })).toBe(-9)
    expect(ev('2^-1')).toBe(0.5)
    expect(ev('7 % 4')).toBe(3)
    expect(ev('1.5e2 + .5')).toBe(150.5)
  })

  it('supports variables, constants, functions and implicit multiplication', () => {
    expect(ev('a*sin(b*x) + 1', { a: 2, b: 1, x: Math.PI / 2 })).toBeCloseTo(3)
    expect(ev('2x + 3(x - 1)', { x: 2 })).toBe(7)
    expect(ev('(x+1)(x-1)', { x: 3 })).toBe(8)
    expect(ev('2pi')).toBeCloseTo(2 * Math.PI)
    expect(ev('max(1, x, 3)', { x: 5 })).toBe(5)
    expect(ev('sqrt(R^2 - x^2)', { R: 5, x: 3 })).toBe(4)
    expect(ev('ln(e)')).toBe(1)
    expect(ev('log(100)')).toBe(2)
  })

  it('rejects anything that is not math', () => {
    expect(checkExpression('alert(1)', ['x'])).toMatch(/unknown function "alert"/)
    expect(checkExpression('constructor', ['x'])).toMatch(/unknown variable "constructor"/)
    expect(checkExpression('toString(x)', ['x'])).toMatch(/unknown function "toString"/)
    expect(checkExpression('__proto__', ['x'])).toMatch(/unknown variable/)
    expect(checkExpression('x.y', ['x'])).toMatch(/unexpected character/)
    expect(checkExpression('x[0]', ['x'])).toMatch(/unexpected character/)
    expect(checkExpression('"a"', ['x'])).toMatch(/unexpected character/)
    expect(checkExpression('y + 1', ['x'])).toMatch(/unknown variable "y"/)
    expect(checkExpression('sin(x', ['x'])).toMatch(/expected "\)"/)
    expect(checkExpression('atan2(x)', ['x'])).toMatch(/takes 2 argument/)
    expect(checkExpression('', ['x'])).toMatch(/empty/)
    expect(checkExpression('x'.repeat(501), ['x'])).toMatch(/longer than/)
    expect(checkExpression('1 2', [])).toMatch(/unexpected "2"/)
    expect(checkExpression('x^2 + 1', ['x'])).toBeUndefined()
  })
})

describe('comparisons and boolean logic', () => {
  it('compares numbers with < <= > >= == !=', () => {
    expect(ev('a < b', { a: 1, b: 2 })).toBe(true)
    expect(ev('a <= 2', { a: 2 })).toBe(true)
    expect(ev('a > 2', { a: 2 })).toBe(false)
    expect(ev('a >= 2.5', { a: 2 })).toBe(false)
    expect(ev('a == 2', { a: 2 })).toBe(true)
    expect(ev('a != 2', { a: 2 })).toBe(false)
    expect(ev('a == b', { a: true, b: 1 })).toBe(true)
    expect(ev('2 <= 2')).toBe(true)
  })

  it('applies the documented precedence: || < && < == < < < + < * < unary < ^', () => {
    expect(ev('1 + 2 * 3 > 6 && 4 == 4')).toBe(true)
    expect(ev('1 > 2 || 3 == 3')).toBe(true)
    expect(ev('2 * 3 == 6 && 3 > 2')).toBe(true)
    expect(ev('a > 1 || a < 0', { a: 0.5 })).toBe(false)
    expect(ev('-2 ^ 2')).toBe(-4)
    expect(ev('!(a > 1)', { a: 5 })).toBe(false)
    expect(ev('!a', { a: 0 })).toBe(true)
    expect(ev('!x + 1', { x: 0 })).toBe(2)
  })

  it('short-circuits && and ||', () => {
    expect(ev('0 && 1/0')).toBe(0)
    expect(ev('1 || 1/0')).toBe(1)
    expect(ev('a || 5', { a: 0 })).toBe(5)
    expect(ev('a && 5', { a: 0 })).toBe(0)
  })

  it('treats a missing operand as "no comparison" instead of 0', () => {
    expect(ev('a > 0', { a: undefined })).toBe(false)
    expect(ev('a == 0', { a: undefined })).toBe(false)
    expect(ev('a != 0', { a: undefined })).toBe(true)
    expect(ev('a > 0', { a: null })).toBe(false)
    expect(ev('a < 10', { a: Number.NaN })).toBe(false)
    expect(ev('a + b', { a: undefined, b: 1 })).toBeNaN()
  })

  it('rejects half-written operators and keeps valid logic expressions', () => {
    expect(checkExpression('a & b', ['a', 'b'])).toMatch(/unexpected character "&" at 2; use "==", "&&" or "\|\|"/)
    expect(checkExpression('a | b', ['a', 'b'])).toMatch(/unexpected character/)
    expect(checkExpression('a = b', ['a', 'b'])).toMatch(/unexpected character/)
    expect(checkExpression('a === b', ['a', 'b'])).toMatch(/unexpected character/)
    expect(checkExpression('a >', ['a'])).toMatch(/unexpected end of expression/)
    expect(checkExpression('a > 1 &&', ['a'])).toMatch(/unexpected end of expression/)
    expect(checkExpression('!(a > 1)', ['a'])).toBeUndefined()
    expect(checkExpression('a >= 1 && b != 2', ['a', 'b'])).toBeUndefined()
  })
})

describe('compiled-expression cache', () => {
  it('reuses the same closure and clears on demand', () => {
    clearExpressionCache()
    const first = compileExpression('x > 1', ['x'])
    expect(compileExpression('x > 1', ['x'])).toBe(first)
    const stats = expressionCacheStats()
    expect(stats).toMatchObject({ size: 1, hits: 1, misses: 1, limit: 500 })
    clearExpressionCache()
    expect(expressionCacheStats()).toMatchObject({ size: 0, hits: 0, misses: 0 })
  })
})
