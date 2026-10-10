import { describe, expect, it } from 'vitest'
import { checkExpression, compileExpression } from '../src/catalog/expr.js'

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
