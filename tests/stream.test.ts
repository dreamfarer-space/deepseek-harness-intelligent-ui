import { describe, expect, it } from 'vitest'
import { decodeStringPrefix, parseArgs, scanPartialObject } from '../client-src/stream/partial-json.ts'
import { processPartialHtml } from '../client-src/widget/partial-html.ts'

const FULL = JSON.stringify({
  title: 'Sine "wave"',
  initialHeight: 320,
  placeholderMessages: ['Drawing axes', 'Wiring sliders'],
  css: 'body{color:red}\n.a{}',
  html: '<div class="a">héllo 😀 <b>x</b></div>',
  jsFunctions: 'function go(){}',
  jsExpressions: ['go()', 'go(2)'],
})

describe('scanPartialObject', () => {
  it('never throws and agrees with JSON.parse on every prefix', () => {
    const full = JSON.parse(FULL) as Record<string, unknown>
    for (let i = 0; i <= FULL.length; i++) {
      const fields = scanPartialObject(FULL.slice(0, i))
      for (const [k, f] of Object.entries(fields)) {
        if (f.complete) expect(f.value).toEqual(full[k])
        else if (typeof f.value === 'string') expect((full[k] as string).startsWith(f.value)).toBe(true)
        else if (Array.isArray(f.value)) expect(full[k]).toEqual(expect.arrayContaining(f.value))
      }
    }
    const done = scanPartialObject(FULL)
    expect(Object.keys(done)).toEqual(Object.keys(full))
    expect(Object.values(done).every(f => f.complete)).toBe(true)
  })

  it('marks fields complete only once their value ends', () => {
    const cut = FULL.indexOf('"html"')
    const fields = scanPartialObject(FULL.slice(0, cut))
    expect(fields.css?.complete).toBe(true)
    expect(fields.html).toBeUndefined()
    const mid = scanPartialObject(FULL.slice(0, FULL.indexOf('héllo') + 3))
    expect(mid.html).toMatchObject({ complete: false, value: '<div class="a">hél' })
  })

  it('treats a number running to the end as incomplete', () => {
    expect(scanPartialObject('{"initialHeight": 32').initialHeight).toMatchObject({ complete: false })
    expect(scanPartialObject('{"initialHeight": 320,').initialHeight).toMatchObject({ complete: true, value: 320 })
  })

  it('exposes completed array items and the string tail', () => {
    const src = '{"jsExpressions": ["a()", "b(\\"x'
    const f = scanPartialObject(src).jsExpressions!
    expect(f).toMatchObject({ complete: false, value: ['a()'], completeItems: 1, partialItem: 'b("x' })
    const objs = scanPartialObject('{"root":"r","components":[{"id":"r","type":"Stack","children":["a"]},{"id":"a","ty')
    expect(objs.components?.value).toEqual([{ id: 'r', type: 'Stack', children: ['a'] }])
  })

  it('handles junk and non-objects', () => {
    expect(scanPartialObject('')).toEqual({})
    expect(scanPartialObject('[1,2]')).toEqual({})
    expect(scanPartialObject('{"a" 1}')).toEqual({})
    expect(parseArgs('[1]')).toBeUndefined()
    expect(parseArgs('{"a":1}')).toEqual({ a: 1 })
    expect(parseArgs('{"a":')).toBeUndefined()
  })
})

describe('decodeStringPrefix', () => {
  it('holds back cut escapes and lone surrogates', () => {
    expect(decodeStringPrefix('ab\\')).toBe('ab')
    expect(decodeStringPrefix('ab\\u00')).toBe('ab')
    expect(decodeStringPrefix('\\u00e9\\n\\t')).toBe('é\n\t')
    expect(decodeStringPrefix('x\\ud83d')).toBe('x')
    expect(decodeStringPrefix('x\\ud83d\\ude00')).toBe('x😀')
  })
})

describe('processPartialHtml', () => {
  it('drops an unfinished tag, entity, and comment', () => {
    expect(processPartialHtml('<div><span cla')).toBe('<div>')
    expect(processPartialHtml('<p>a &am')).toBe('<p>a ')
    expect(processPartialHtml('<p>a</p><!-- note')).toBe('<p>a</p>')
  })

  it('strips script/style/head blocks, even unterminated, and inline handlers', () => {
    expect(processPartialHtml('<p>a</p><script>alert(1)</script><b>b</b>')).toBe('<p>a</p><b>b</b>')
    expect(processPartialHtml('<p>a</p><style>p{color:red')).toBe('<p>a</p>')
    expect(processPartialHtml('<button onclick="x()" class=y>go</button>')).toBe('<button class=y>go</button>')
  })
})
