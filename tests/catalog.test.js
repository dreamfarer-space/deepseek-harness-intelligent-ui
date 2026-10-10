import { describe, expect, it } from 'vitest'
import { catalogReference, COMPONENT_TYPES, validateProps, validateTree } from '../src/catalog/catalog.js'

const tree = (components, root = 'root') => ({ root, components })

describe('validateTree', () => {
  it('accepts a nested dashboard', () => {
    const r = validateTree(tree([
      { id: 'root', type: 'Card', props: { title: 'Sales' }, children: ['g', 't'] },
      { id: 'g', type: 'Grid', props: { columns: 2 }, children: ['s1', 's2'] },
      { id: 's1', type: 'Stat', props: { label: 'Revenue', value: '$1.2M', delta: '+4%', trend: 'up' } },
      { id: 's2', type: 'Stat', props: { label: 'Orders', value: 1200 } },
      { id: 't', type: 'Table', props: { columns: ['Region', 'Revenue'], rows: [['EU', 1], ['US', 2]], sortable: true } },
    ]))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.count).toBe(5)
    expect(r.types).toMatchObject({ Stat: 2, Card: 1 })
  })

  it('reports unknown types, bad props and unknown fields with paths', () => {
    const r = validateTree(tree([
      { id: 'root', type: 'Stack', children: ['a', 'b'], extra: 1 },
      { id: 'a', type: 'Sparkle', props: {} },
      { id: 'b', type: 'Progress', props: { value: '50', colour: 'red' } },
    ]))
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/root\)\.extra: unknown field/)
    expect(r.errors.join('\n')).toMatch(/unknown component type "Sparkle"/)
    expect(r.errors.join('\n')).toMatch(/\(b\)\.props\.value: expected finite number, got string/)
    expect(r.errors.join('\n')).toMatch(/\(b\)\.props\.colour: unknown prop/)
  })

  it('rejects duplicate ids, dangling children, two parents, cycles and a missing root', () => {
    expect(validateTree(tree([{ id: 'root', type: 'Divider' }, { id: 'root', type: 'Divider' }])).errors.join()).toMatch(/duplicate id/)
    expect(validateTree(tree([{ id: 'root', type: 'Stack', children: ['x'] }])).errors.join()).toMatch(/unknown id "x"/)
    expect(validateTree(tree([
      { id: 'root', type: 'Stack', children: ['a', 'b'] },
      { id: 'a', type: 'Stack', children: ['c'] },
      { id: 'b', type: 'Stack', children: ['c'] },
      { id: 'c', type: 'Divider' },
    ])).errors.join()).toMatch(/c: has two parents/)
    expect(validateTree(tree([
      { id: 'root', type: 'Stack', children: ['a'] },
      { id: 'a', type: 'Stack', children: ['b'] },
      { id: 'b', type: 'Stack', children: ['a'] },
    ])).ok).toBe(false)
    expect(validateTree(tree([{ id: 'x', type: 'Divider' }], 'root')).errors.join()).toMatch(/root: unknown id/)
  })

  it('rejects children on leaf components and warns about orphans', () => {
    const r = validateTree(tree([
      { id: 'root', type: 'Text', props: { text: 'hi' }, children: ['x'] },
      { id: 'x', type: 'Divider' },
    ]))
    expect(r.errors.join()).toMatch(/Text cannot have children/)
    const orphan = validateTree(tree([{ id: 'root', type: 'Divider' }, { id: 'lost', type: 'Divider' }]))
    expect(orphan.ok).toBe(true)
    expect(orphan.warnings.join()).toMatch(/lost/)
  })

  it('checks chart, form and tabs semantics', () => {
    expect(validateProps('Chart', { kind: 'bar', labels: ['a', 'b'], series: [{ name: 's', values: [1] }] }).join())
      .toMatch(/has 1 values but labels has 2/)
    expect(validateProps('Chart', { kind: 'pie', labels: ['a'], series: [{ name: 's', values: [1] }, { name: 't', values: [2] }] }).join())
      .toMatch(/exactly one series/)
    expect(validateProps('Form', { fields: [{ name: 'a', label: 'A', type: 'select' }, { name: 'a', label: 'B', type: 'text' }] }).join())
      .toMatch(/select field needs options.*duplicate field name|duplicate field name.*select field needs options/)
    expect(validateTree(tree([
      { id: 'root', type: 'Tabs', props: { labels: ['One', 'Two'] }, children: ['a'] },
      { id: 'a', type: 'Divider' },
    ])).errors.join()).toMatch(/2 labels but 1 children/)
  })

  it('checks Plot expressions and parameters, range fields and the new components', () => {
    const plot = (props) => validateProps('Plot', props).join('\n')
    expect(plot({ functions: [{ expr: 'a*sin(x)' }], params: [{ name: 'a', min: 0, max: 2, value: 1 }] })).toBe('')
    expect(plot({ functions: [{ expr: 'a*sin(x)' }] })).toMatch(/unknown variable "a"/)
    expect(plot({ functions: [{ expr: 'eval(x)' }] })).toMatch(/unknown function "eval"/)
    expect(plot({ functions: [{ expr: 'x' }], params: [{ name: 'pi', min: 0, max: 1, value: 0 }] })).toMatch(/"pi" is reserved/)
    expect(plot({ functions: [{ expr: 'x' }], params: [{ name: 'k', min: 0, max: 1, value: 5 }] })).toMatch(/within \[min, max\]/)
    expect(plot({ functions: [{ expr: 'x' }], params: [{ name: '1k', min: 0, max: 1, value: 0 }] })).toMatch(/must be an identifier/)
    expect(plot({ functions: [{ expr: 'x' }], xMin: 2, xMax: 1 })).toMatch(/xMin must be less than xMax/)
    expect(validateProps('Form', { fields: [{ name: 'r', label: 'R', type: 'range' }] }).join()).toMatch(/range field needs numeric min < max/)
    expect(validateProps('Form', { fields: [{ name: 'r', label: 'R', type: 'range', min: 0, max: 5, step: 0.5, default: 1 }] })).toEqual([])
    expect(validateProps('Timeline', { items: [{ title: 'Kickoff', time: 'Mon', tone: 'success' }] })).toEqual([])
    expect(validateProps('Math', { tex: 'x^2+y^2+z^2=2Rz' })).toEqual([])
    expect(validateProps('Mermaid', { code: 'flowchart LR\n A-->B' })).toEqual([])
    expect(validateProps('Math', {}).join()).toMatch(/tex: required/)
  })

  it('rejects malformed payloads', () => {
    expect(validateTree(null).ok).toBe(false)
    expect(validateTree({ root: 'r', components: [] }).errors.join()).toMatch(/non-empty array/)
    expect(validateTree({ root: 'r', components: [42] }).errors.join()).toMatch(/expected object/)
  })
})

describe('catalogReference', () => {
  it('documents every component with its required props', () => {
    const ref = catalogReference()
    for (const type of COMPONENT_TYPES) expect(ref).toContain(`- ${type}`)
    expect(ref).toMatch(/Chart \{kind: bar\|line\|area\|pie, labels: scalar\[\], series: \[\{name: string, values: number\[\]\}\]/)
    expect(ref).toMatch(/Card \(children\)/)
  })
})
