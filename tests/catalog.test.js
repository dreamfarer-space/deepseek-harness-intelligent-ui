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

  it('tells the model how to fix an omitted root field', () => {
    const missing = validateTree({ components: [{ id: 'root', type: 'Text', props: { text: 'hi' } }] })
    expect(missing.ok).toBe(false)
    expect(missing.errors[0]).toMatch(/^root: missing. Add the top-level field "root" next to "components"/)
    expect(validateTree({ root: 5, components: [{ id: 'r', type: 'Text', props: { text: 'hi' } }] }).errors[0]).toBe('root: expected the id of the top-level component')
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
    expect(ref).toContain('Chart {kind: bar|line|area|pie, dataRef?: {id: string, scope: string}')
    expect(ref).toContain('labels?: scalar[], series?: [{name: string, values: number[]}]')
    expect(ref).toMatch(/Card \(children\)/)
  })
})

describe('root-level computed', () => {
  const withComputed = (computed) => ({
    root: 'root',
    computed,
    components: [
      { id: 'root', type: 'Stack', children: ['form', 'bar', 'note'] },
      {
        id: 'form', type: 'Form',
        props: {
          fields: [
            { name: 'price', label: 'Price', type: 'number' },
            { name: 'qty', label: 'Qty', type: 'range', min: 0, max: 10, bindKey: 'quantity' },
          ],
        },
      },
      { id: 'bar', type: 'Progress', props: { value: { $computed: 'total' } } },
      { id: 'note', type: 'Text', props: { text: 'Total: {{total}}' } },
    ],
  })

  it('accepts computed entries that reference form values and each other', () => {
    const r = validateTree(withComputed([
      { id: 'subtotal', expr: 'price * quantity' },
      { id: 'tax', expr: 'subtotal * 0.08 && quantity > 0' },
      { id: 'total', expr: 'subtotal + tax', format: { style: 'currency', currency: 'USD' } },
    ]))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('stays optional and tolerates references it cannot resolve without a computed array', () => {
    expect(validateTree(tree([{ id: 'root', type: 'Divider' }])).ok).toBe(true)
    expect(validateTree(tree([{ id: 'root', type: 'Progress', props: { value: { $computed: 'total' } } }])).ok).toBe(true)
  })

  it('rejects malformed ids, duplicates, reserved names and syntax errors', () => {
    const errors = (computed) => validateTree(withComputed(computed)).errors.join('\n')
    expect(errors([{ id: '1total', expr: 'price' }])).toMatch(/computed\[0\]\.id: expected an identifier/)
    expect(errors([{ id: 'bad id', expr: 'price' }])).toMatch(/computed\[0\]\.id: expected an identifier/)
    expect(errors([{ id: 'total', expr: 'price' }, { id: 'total', expr: 'qty' }])).toMatch(/duplicate computed id "total"/)
    expect(errors([{ id: 'pi', expr: '1' }])).toMatch(/"pi" is reserved/)
    expect(errors([{ id: 'total', expr: 'price +' }])).toMatch(/computed\[0\]\.expr: unexpected end of expression/)
    expect(errors([{ id: 'total', expr: 'nope * 2' }])).toMatch(/unknown variable "nope".*available: .*price/)
    expect(errors([{ id: 'total', expr: 'price', extra: 1 }])).toMatch(/computed\[0\]\.extra: unknown field/)
    expect(errors([{ id: 'total' }])).toMatch(/expr: expected a non-empty expression string/)
    expect(validateTree({ ...withComputed([]), computed: 'total' }).errors.join()).toMatch(/computed: expected an array/)
    expect(validateTree(withComputed(Array.from({ length: 65 }, (_, i) => ({ id: `c${i}`, expr: '1' })))).errors.join()).toMatch(/more than 64 entries/)
  })

  it('rejects unknown {{id}} and $computed references', () => {
    const r = validateTree({
      root: 'root',
      computed: [{ id: 'total', expr: '1 + 1' }],
      components: [
        { id: 'root', type: 'Stack', children: ['t', 'p'] },
        { id: 't', type: 'Text', props: { text: '{{missing}}' } },
        { id: 'p', type: 'Progress', props: { value: { $computed: 'missing' } } },
      ],
    })
    expect(r.errors.join('\n')).toMatch(/components\[1\]\(t\)\.props\.text: unknown computed id "missing" in \{\{missing\}\}/)
    expect(r.errors.join('\n')).toMatch(/components\[2\]\(p\)\.props\.value\.\$computed: unknown computed id "missing"/)
  })

  it('does not scan free-form code/math/mermaid content for templates', () => {
    const r = validateTree({
      root: 'root',
      computed: [{ id: 'total', expr: '1 + 1' }],
      components: [
        { id: 'root', type: 'Stack', children: ['code'] },
        { id: 'code', type: 'Code', props: { code: 'const x = "{{missing}}";' } },
      ],
    })
    expect(r.errors).toEqual([])
  })

  it('validates format style, currency and fraction digits', () => {
    const errors = (format) => validateTree(withComputed([{ id: 'total', expr: '1 + 1', format }])).errors.join('\n')
    expect(errors({ style: 'money' })).toMatch(/format\.style: expected one of decimal \| currency \| percent/)
    expect(errors({ style: 'currency', currency: 'usd' })).toMatch(/format\.currency: expected a 3-letter ISO 4217 code/)
    expect(errors({ style: 'decimal', maximumFractionDigits: 99 })).toMatch(/expected an integer 0-20/)
    expect(errors({ style: 'decimal', minimumFractionDigits: 3, maximumFractionDigits: 2 })).toMatch(/minimumFractionDigits must be <= maximumFractionDigits/)
    expect(errors({ style: 'percent', locale: 'en-US' })).toBe('')
  })

  it('rejects a computed id that collides with a form field key', () => {
    expect(validateTree(withComputed([{ id: 'quantity', expr: 'price' }])).errors.join())
      .toMatch(/"quantity" is also a form field key/)
  })

  it('rejects a form-level bindKey on a form with several fields', () => {
    const twoFields = { ...withComputed([{ id: 'total', expr: 'price' }]) }
    twoFields.components = twoFields.components.map(n => n.id === 'form'
      ? { ...n, props: { ...n.props, bindKey: 'order' } }
      : n)
    expect(validateTree(twoFields).errors.join())
      .toMatch(/\(form\)\.props\.bindKey: a form with 2 fields has no single value to bind/)
    // One field, one value: a form-level bindKey stays valid there.
    const oneField = { ...withComputed([{ id: 'total', expr: 'price' }]) }
    oneField.components = oneField.components.map(n => n.id === 'form'
      ? { ...n, props: { ...n.props, bindKey: 'order', fields: [{ name: 'price', label: 'Price', type: 'number' }] } }
      : n)
    expect(validateTree(oneField).ok).toBe(true)
  })
})

describe('computed-aware props', () => {
  it('accepts a literal or a $computed reference in numeric slots', () => {
    expect(validateProps('Progress', { value: 40 })).toEqual([])
    expect(validateProps('Progress', { value: { $computed: 'total' }, max: 100 })).toEqual([])
    expect(validateProps('Progress', { value: '50' }).join()).toMatch(/expected finite number, got string/)
    expect(validateProps('Progress', { value: { $computed: 5 } }).join()).toMatch(/\$computed: expected the id of a computed entry/)

    expect(validateProps('Chart', {
      kind: 'bar', labels: ['a', 'b'],
      series: [{ name: 's', values: [{ $computed: 'total' }, 3] }],
    })).toEqual([])
    expect(validateProps('Chart', {
      kind: 'bar', labels: ['a'],
      series: [{ name: 's', values: [{ $computed: 'total', extra: 1 }] }],
    }).join()).toMatch(/unknown prop/)
  })

  it('accepts Table filterField/filterValue', () => {
    expect(validateProps('Table', { columns: ['Region', 'Revenue'], rows: [['EU', 1]], filterField: 'Revenue', filterValue: '100' })).toEqual([])
    expect(validateProps('Table', { columns: ['Region'], rows: [['EU']], filterValue: '100' }).join()).toMatch(/filterValue: needs filterField/)
    expect(validateProps('Table', { columns: ['Region'], rows: [['EU']], filterField: 'Missing' }).join()).toMatch(/filterField: must name one of columns/)
  })

  it('accepts bindKey on a Form and on its fields', () => {
    expect(validateProps('Form', {
      bindKey: 'order',
      fields: [{ name: 'price', label: 'Price', type: 'number', bindKey: 'unit_price' }],
    })).toEqual([])
    expect(validateProps('Form', {
      fields: [
        { name: 'a', label: 'A', type: 'text', bindKey: 'same' },
        { name: 'b', label: 'B', type: 'text', bindKey: 'same' },
      ],
    }).join()).toMatch(/duplicate bindKey "same"/)
    expect(validateProps('Form', { bindKey: '2bad', fields: [{ name: 'a', label: 'A', type: 'text' }] }).join())
      .toMatch(/props\.bindKey: expected a field key like "qty"/)
  })

  it('documents the widened slots without changing their published types', () => {
    const ref = catalogReference()
    expect(ref).toContain('Progress {value: number, max?: number')
    expect(ref).toContain('series?: [{name: string, values: number[]}]')
    expect(ref).toMatch(/Form .*bindKey\?: string/)
  })
})

describe('Choice validation', () => {
  const options = [
    { id: 'local', label: 'Local first', prompt: 'Discuss local storage; do not code.' },
    { id: 'cloud', label: 'Managed cloud', description: 'Less infrastructure.', prompt: 'Discuss cloud storage; do not code.' },
  ]
  const validate = (props = {}) => validateProps('Choice', { question: 'Choose a route', options, ...props })

  it('accepts 2-8 options', () => {
    expect(validate({ recommended: 'local', submitLabel: 'Continue discussion' })).toEqual([])
    expect(validate({ options: Array.from({ length: 6 }, (_, i) => ({ ...options[0], id: String(i) })) })).toEqual([])
    expect(validate({ options: options.map(({ id, ...option }) => option) })).toEqual([])
    expect(validate({ options: [{ ...options[0], id: '  ' }, options[1]] }).join()).toMatch(/must not be blank/)
  })

  it('rejects too few or too many options, duplicate ids and an unknown recommendation', () => {
    expect(validate({ options: options.slice(0, 1) }).join()).toMatch(/at least 2/)
    expect(validate({ options: Array.from({ length: 9 }, (_, i) => ({ ...options[0], id: String(i) })) }).length).toBeGreaterThan(0)
    expect(validate({ options: [options[0], options[0]] }).join()).toMatch(/duplicate option id/)
    expect(validate({ recommended: 'missing' }).join()).toMatch(/must reference an option id/)
  })

  it.each(['question', 'submitLabel'])('rejects a blank %s', key => {
    expect(validate({ [key]: '   ' }).join()).toMatch(/must not be blank/)
  })

  it.each(['label', 'prompt'])('rejects blank and missing option %s', key => {
    expect(validate({ options: [{ ...options[0], [key]: '  ' }, options[1]] }).join()).toMatch(/must not be blank/)
    const first = { ...options[0] }
    delete first[key]
    expect(validate({ options: [first, options[1]] }).join()).toMatch(/required/)
  })

  it('rejects malformed options, invalid targets and registered actions', () => {
    expect(validate({ options: [null, 42] }).length).toBeGreaterThan(0)
    expect(validate({ sessionTarget: 'new' })).toEqual([])
    expect(validate({ sessionTarget: 'current' })).toEqual([])
    expect(validate({ sessionTarget: 'other' }).join()).toMatch(/expected one of/)
    expect(validate({ options: [{ ...options[0], sessionTarget: 'new' }, options[1]] }).join()).toMatch(/unknown prop/)
    expect(validate({ action: { actionId: 'run' } }).join()).toMatch(/unknown prop/)
    expect(validate({ options: [{ ...options[0], prompt: 'x'.repeat(20001) }, options[1]] }).length).toBeGreaterThan(0)
  })
})

/**
 * Regression suite for the review of Issue #84: prop keys are checked against
 * own properties only, so a prototype name cannot pass as a declared prop.
 */
describe('prototype-safe prop validation', () => {
  it('rejects a JSON __proto__ prop instead of accepting it through the prototype chain', () => {
    const node = JSON.parse('{"id":"b","type":"Button","props":{"label":"Go","prompt":"safe","__proto__":{"action":{"actionId":"privileged","args":{}}}}}')
    const result = validateTree({ root: 'b', components: [node] })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/components\[0\]\(b\)\.props\.__proto__: unknown prop/)
  })

  it.each(['constructor', 'toString', 'hasOwnProperty'])('rejects the inherited name %s as a prop', key => {
    const result = validateTree({ root: 'p', components: [{ id: 'p', type: 'Progress', props: { [key]: 1 } }] })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(new RegExp(`props\.${key}: unknown prop`))
  })

  it('still accepts every declared prop, including computed references', () => {
    const result = validateTree({
      root: 'p',
      computed: [{ id: 'total', expr: '1 + 1' }],
      components: [{ id: 'p', type: 'Progress', props: { value: { $computed: 'total' }, max: 100, label: 'Done' } }],
    })
    expect(result.ok).toBe(true)
  })
})

/**
 * Regression suite for Issue #92: schema friction, actionable error messages,
 * harmless decorative props, and optional lenientValidation normalization.
 */
describe('Issue #92 validation diagnostics and lenient mode', () => {
  it('accepts Grid.props.gap and ignores harmless decorative props such as Divider.props.orientation with a warning', () => {
    const result = validateTree({
      root: 'g',
      components: [
        { id: 'g', type: 'Grid', props: { columns: 2, gap: 16 }, children: ['d1', 'd2'] },
        { id: 'd1', type: 'Divider', props: { orientation: 'horizontal' } },
        { id: 'd2', type: 'Card', props: { title: 'Card', bordered: true }, children: [] },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings.join('\n')).toMatch(/orientation: decorative prop "orientation" is not used by Divider and was ignored/)
    expect(result.warnings.join('\n')).toMatch(/bordered: decorative prop "bordered" is not used by Card and was ignored/)
  })

  it('gives actionable schema guidance and suggested fixes on strict validation failures (Issue #92 cases ①–⑤)', () => {
    // ① Top-level props + missing id with key alias + Table missing rows
    const case1 = validateTree({
      root: 'g',
      components: [
        { key: 'missing_id', type: 'Text', props: { text: 'hi' } },
        { id: 'g', type: 'Grid', columns: 2, gap: 12 },
        { id: 'tb', type: 'Table', columns: ['A', 'B'] },
      ],
    })
    expect(case1.ok).toBe(false)
    const err1 = case1.errors.join('\n')
    expect(err1).toMatch(/found "key" \("missing_id"\); rename it to "id"/)
    expect(err1).toMatch(/columns: unknown field — "columns" is a Grid prop; nest it inside props/)
    expect(case1.fixes.join('\n')).toMatch(/move top-level props \(columns, gap\)/)

    // ② Choice options[].sessionTarget
    const case2 = validateTree({
      root: 'c',
      components: [{
        id: 'c',
        type: 'Choice',
        props: {
          question: 'Pick one',
          options: [
            { id: 'a', label: 'A', prompt: 'go A', sessionTarget: 'current' },
            { id: 'b', label: 'B', prompt: 'go B', sessionTarget: 'current' },
          ],
        },
      }],
    })
    expect(case2.ok).toBe(false)
    expect(case2.errors.join('\n')).toMatch(/sessionTarget belongs on Choice\.props/)
    expect(case2.fixes.join('\n')).toMatch(/move "sessionTarget" from options\[\*\] to Choice\.props/)

    // ④ Alert with props.items instead of props.text
    const case4 = validateTree({
      root: 'a',
      components: [{ id: 'a', type: 'Alert', props: { title: 'Note', items: ['line 1', 'line 2'] } }],
    })
    expect(case4.ok).toBe(false)
    expect(case4.errors.join('\n')).toMatch(/Alert uses props\.text \(string\)/)
    expect(case4.fixes.join('\n')).toMatch(/replace Alert props\.items with props\.text/)

    // ⑤ Timeline with children instead of props.items: reports root cause once without cascading unknown-id errors
    const case5 = validateTree({
      root: 'tl',
      components: [{ id: 'tl', type: 'Timeline', children: ['t1', 't2', 't3', 't4'] }],
    })
    expect(case5.ok).toBe(false)
    expect(case5.errors.join('\n')).toMatch(/Timeline cannot have children — use props\.items/)
    expect(case5.errors.join('\n')).not.toMatch(/unknown id "t1"/)
  })

  it('normalizes recoverable schema mistakes when lenient mode is enabled while still rejecting unrecoverable errors', () => {
    const args = {
      root: 'page',
      components: [
        { key: 'page', type: 'Stack', gap: 14, children: ['grid', 'choice', 'alert', 'tl'] },
        { id: 'grid', type: 'Grid', columns: 2, gap: 12, children: ['div'] },
        { id: 'div', type: 'Divider', props: { orientation: 'horizontal' } },
        {
          id: 'choice',
          type: 'Choice',
          props: {
            question: 'Next step?',
            options: [
              { id: 'o1', label: 'Run', prompt: 'Run now', sessionTarget: 'new' },
              { id: 'o2', label: 'Skip', prompt: 'Skip', sessionTarget: 'new' },
            ],
          },
        },
        { id: 'alert', type: 'Alert', props: { title: 'Checklist', items: ['Backup config', 'Verify port'] } },
        { id: 'tl', type: 'Timeline', children: ['t1', 't2'] },
        { id: 't1', type: 'Card', props: { title: 'Step 1', subtitle: '09:00' } },
        { id: 't2', type: 'Card', props: { title: 'Step 2', subtitle: '10:00' } },
      ],
    }
    const lenient = validateTree(args, { lenient: true })
    expect(lenient.ok).toBe(true)
    expect(lenient.normalized).toBe(true)
    expect(lenient.warnings.length).toBeGreaterThan(0)
    // Absorbed timeline child nodes are converted into Timeline.props.items and removed from components.
    const tl = args.components.find(c => c.id === 'tl')
    expect(tl.children).toBeUndefined()
    expect(tl.props.items).toEqual([
      { title: 'Step 1', time: '09:00' },
      { title: 'Step 2', time: '10:00' },
    ])
    const choice = args.components.find(c => c.id === 'choice')
    expect(choice.props.sessionTarget).toBe('new')
    expect(choice.props.options[0].sessionTarget).toBeUndefined()
    // Re-validating the normalized payload in strict mode succeeds cleanly.
    expect(validateTree(args).ok).toBe(true)

    // Unrecoverable errors (e.g. Table with columns at top level but still no rows/dataRef) still fail in lenient mode.
    const unrecoverable = validateTree({
      root: 'tb',
      components: [{ id: 'tb', type: 'Table', columns: ['Col1', 'Col2'] }],
    }, { lenient: true })
    expect(unrecoverable.ok).toBe(false)
    expect(unrecoverable.errors.join('\n')).toMatch(/needs columns and rows or dataRef/)

    // Timeline appearing before child nodes whose text prop is flattened at top-level or uses Alert.items still preserves child text.
    const orderedArgs = {
      root: 'tl',
      components: [
        { id: 'tl', type: 'Timeline', children: ['event', 'alertChild'] },
        { id: 'event', type: 'Text', props: {}, text: '发布上线' },
        { id: 'alertChild', type: 'Alert', props: { items: ['重要内容'] } },
      ],
    }
    expect(validateTree(orderedArgs, { lenient: true }).ok).toBe(true)
    expect(orderedArgs.components[0].props.items).toEqual([
      { title: '发布上线' },
      { title: '• 重要内容' },
    ])

    // Absorbed Timeline child node with an unknown prop still fails validation instead of silently dropping the error.
    const badTimelineChild = validateTree({
      root: 'tl',
      components: [
        { id: 'tl', type: 'Timeline', children: ['step'] },
        { id: 'step', type: 'Text', props: { text: '第一步', unexpected: 123 } },
      ],
    }, { lenient: true })
    expect(badTimelineChild.ok).toBe(false)
    expect(badTimelineChild.errors.join('\n')).toMatch(/unexpected: unknown prop/)

    // Absorbed Timeline child node with a duplicate id still fails with duplicate id instead of hiding it.
    const dupTimelineChild = validateTree({
      root: 'tl',
      components: [
        { id: 'tl', type: 'Timeline', children: ['step'] },
        { id: 'step', type: 'Text', props: { text: '第一条' } },
        { id: 'step', type: 'Text', props: { text: '第二条' } },
      ],
    }, { lenient: true })
    expect(dupTimelineChild.ok).toBe(false)
    expect(dupTimelineChild.errors.join('\n')).toMatch(/duplicate id "step"/)

    // Partially frozen nested option inside Choice does not throw in lenient mode.
    const frozenOption = Object.freeze({ id: 'o1', label: '继续', prompt: '继续执行', sessionTarget: 'new' })
    const partialFrozen = {
      root: 'c',
      components: [{
        id: 'c',
        type: 'Choice',
        props: {
          question: '下一步？',
          options: [frozenOption, { id: 'o2', label: '取消', prompt: '取消', sessionTarget: 'new' }],
        },
      }],
    }
    expect(validateTree(partialFrozen, { lenient: true }).ok).toBe(true)
    expect(partialFrozen.components[0].props.sessionTarget).toBe('new')

    // Missing id with empty string `id: ""` and `key: "x"` produces a valid suggested fix with `"id":"x"`.
    const emptyIdWithKey = validateTree({
      root: 'x',
      components: [{ id: '', key: 'x', type: 'Text', props: { text: 'hello' } }],
    })
    expect(emptyIdWithKey.fixes.join('\n')).toContain('"id":"x"')
  })
})
