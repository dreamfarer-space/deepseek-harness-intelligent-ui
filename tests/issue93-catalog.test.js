import { describe, expect, it } from 'vitest'
import { validateProps, validateTree } from '../src/catalog/catalog.js'
import { evaluateComputed } from '../src/catalog/computed.js'
import { applyPatch, snapshotOf } from '../src/catalog/patch.js'
import { validateComposition } from '../src/compose/compose.js'

/** One isolated root component, so a failure names only the component under test. */
const single = (type, props) => ({ root: 'root', components: [{ id: 'root', type, props }] })
const run = (type, props) => validateTree(single(type, props))
const accepts = (type, props) => run(type, props).ok
const problems = (type, props) => run(type, props).errors.join('\n')

// ---------------------------------------------------------------------------
// Package 1: Accordion, Steps, KeyValue, EmptyState
// ---------------------------------------------------------------------------

const accordionTree = (items, childIds) => ({
  root: 'acc',
  components: [
    { id: 'acc', type: 'Accordion', props: { items }, ...(childIds ? { children: childIds } : {}) },
    ...(childIds ?? []).map(id => ({ id, type: 'Text', props: { text: `Body ${id}` } })),
  ],
})

describe('Issue #93 package 1: Accordion', () => {
  const inline = [{ id: 'a', title: 'One', text: 'First body' }, { id: 'b', title: 'Two', text: 'Second body' }]

  it('accepts items with inline text and no children', () => {
    const r = validateTree(accordionTree(inline))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('accepts children[i] rendering items[i] when the counts match', () => {
    const r = validateTree(accordionTree([{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }], ['c1', 'c2']))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects an empty items array', () => {
    expect(problems('Accordion', { items: [] })).toMatch(/items: needs at least 1 item/)
  })

  it('rejects a duplicate item id', () => {
    const errs = problems('Accordion', { items: [{ id: 'dup', title: 'A', text: 'a' }, { id: 'dup', title: 'B', text: 'b' }] })
    expect(errs).toMatch(/items\[1\]\.id: duplicate item id "dup"/)
  })

  it('rejects a children count that does not match items', () => {
    const errs = validateTree(accordionTree([{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }], ['c1'])).errors.join('\n')
    expect(errs).toMatch(/Accordion has 2 items but 1 children/)
  })

  it('rejects an item without text when the Accordion has no children', () => {
    expect(problems('Accordion', { items: [{ id: 'a', title: 'One' }] })).toMatch(/items\[0\]\.text: required when Accordion has no children/)
  })
})

describe('Issue #93 package 1: Steps', () => {
  const items = [{ id: 's1', title: 'Plan' }, { id: 's2', title: 'Build' }, { id: 's3', title: 'Ship' }]

  it('accepts a zero-based current index', () => {
    expect(accepts('Steps', { items, current: 1 })).toBe(true)
  })

  it('accepts explicit per-step status without current', () => {
    const r = run('Steps', { items: [{ id: 's1', title: 'Plan', status: 'done' }, { id: 's2', title: 'Build', status: 'active' }] })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects current at or past items.length', () => {
    expect(problems('Steps', { items, current: 3 })).toMatch(/current: must be < items\.length \(3\)/)
  })

  it('rejects a non-integer current', () => {
    expect(problems('Steps', { items, current: 1.5 })).toMatch(/current: expected integer/)
  })

  it('rejects duplicate step ids', () => {
    expect(problems('Steps', { items: [{ id: 'x', title: 'A' }, { id: 'x', title: 'B' }] })).toMatch(/duplicate step id "x"/)
  })
})

describe('Issue #93 package 1: KeyValue', () => {
  it('accepts scalar values and a computed reference, with 1..3 columns', () => {
    for (const columns of [1, 2, 3]) {
      const r = run('KeyValue', { columns, items: [{ key: 'Region', value: 'EU' }, { key: 'Total', value: { $computed: 'total' } }] })
      expect(r.errors).toEqual([])
      expect(r.ok).toBe(true)
    }
  })

  it('rejects a blank key', () => {
    expect(problems('KeyValue', { items: [{ key: '   ', value: 1 }] })).toMatch(/items\[0\]\.key: must not be blank/)
  })

  it('rejects columns outside 1..3', () => {
    expect(problems('KeyValue', { columns: 4, items: [{ key: 'a', value: 1 }] })).toMatch(/columns: must be <= 3/)
    expect(problems('KeyValue', { columns: 0, items: [{ key: 'a', value: 1 }] })).toMatch(/columns: must be >= 1/)
    expect(problems('KeyValue', { columns: 2.5, items: [{ key: 'a', value: 1 }] })).toMatch(/columns: expected integer/)
  })

  it('rejects a malformed $computed id', () => {
    const errs = validateProps('KeyValue', { items: [{ key: 'Total', value: { $computed: 'not an id' } }] }).join('\n')
    expect(errs).toMatch(/\$computed/)
  })
})

describe('Issue #93 package 1: EmptyState', () => {
  it('accepts a plain empty state', () => {
    expect(run('EmptyState', { title: 'No results', description: 'Try another filter' }).ok).toBe(true)
  })

  it('accepts actionLabel with prompt', () => {
    const r = run('EmptyState', { title: 'No results', actionLabel: 'Retry', prompt: 'retry the search', sessionTarget: 'current' })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('accepts actionLabel with a registered action', () => {
    expect(run('EmptyState', { title: 'Offline', actionLabel: 'Reload', action: { actionId: 'reload', args: {} } }).ok).toBe(true)
  })

  it('rejects both prompt and action', () => {
    expect(problems('EmptyState', { title: 'No results', actionLabel: 'Go', prompt: 'p', action: { actionId: 'a', args: {} } }))
      .toMatch(/cannot use both prompt and action/)
  })

  it('requires actionLabel when prompt is set', () => {
    expect(problems('EmptyState', { title: 'No results', prompt: 'retry the search' }))
      .toMatch(/actionLabel: required when prompt or action is set/)
  })

  it('rejects sessionTarget without prompt', () => {
    expect(problems('EmptyState', { title: 'No results', actionLabel: 'Reload', action: { actionId: 'reload', args: {} }, sessionTarget: 'new' }))
      .toMatch(/sessionTarget: only supported with prompt/)
  })
})

// ---------------------------------------------------------------------------
// Package 2: FollowUp, Sources
// ---------------------------------------------------------------------------

describe('Issue #93 package 2: FollowUp', () => {
  const item = i => ({ id: `f${i}`, label: `Suggestion ${i}`, prompt: `Do thing ${i}` })
  const items = n => Array.from({ length: n }, (_, i) => item(i + 1))

  it('accepts 1..6 items', () => {
    expect(run('FollowUp', { items: items(1) }).ok).toBe(true)
    expect(run('FollowUp', { items: items(6) }).ok).toBe(true)
  })

  it('rejects more than 6 items', () => {
    expect(problems('FollowUp', { items: items(7) })).toMatch(/items: more than 6 items/)
  })

  it('rejects a blank label or prompt', () => {
    expect(problems('FollowUp', { items: [{ label: '  ', prompt: 'go' }] })).toMatch(/items\[0\]\.label: must not be blank/)
    expect(problems('FollowUp', { items: [{ label: 'More', prompt: '   ' }] })).toMatch(/items\[0\]\.prompt: must not be blank/)
  })

  it('rejects duplicate item ids', () => {
    expect(problems('FollowUp', { items: [{ id: 'x', label: 'A', prompt: 'a' }, { id: 'x', label: 'B', prompt: 'b' }] }))
      .toMatch(/duplicate item id "x"/)
  })
})

describe('Issue #93 package 2: Sources', () => {
  it('accepts https URLs and URL-less document references together', () => {
    const r = run('Sources', {
      items: [
        { id: 's1', title: 'MDN — Array', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array' },
        { id: 's2', title: 'Deep Learning', source: 'Goodfellow, Bengio & Courville, 2016', note: 'Chapter 6' },
      ],
    })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects an http:// URL', () => {
    expect(problems('Sources', { items: [{ title: 'Insecure', url: 'http://example.com/doc' }] }))
      .toMatch(/url: expected an https:\/\/ URL, got http:/)
  })

  it('rejects a URL with embedded credentials', () => {
    expect(problems('Sources', { items: [{ title: 'Creds', url: 'https://user:example@example.com/doc' }] }))
      .toMatch(/url: must not contain credentials/)
  })

  it('rejects more than 20 sources', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: `Source ${i}` }))
    expect(problems('Sources', { items })).toMatch(/items: more than 20 items/)
  })
})

// ---------------------------------------------------------------------------
// Package 3: Segmented, Choice, Form
// ---------------------------------------------------------------------------

describe('Issue #93 package 3: Segmented', () => {
  const options = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]

  it('accepts options, a matching defaultValue and a bindKey', () => {
    const r = run('Segmented', { bindKey: 'range', defaultValue: 'month', options })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('feeds computed formulas and {{bindKey}} templates inside validateTree', () => {
    const r = validateTree({
      root: 'stack',
      components: [
        { id: 'stack', type: 'Stack', children: ['seg', 'note', 'kv'] },
        { id: 'seg', type: 'Segmented', props: { bindKey: 'count', defaultValue: '1', options: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] } },
        { id: 'note', type: 'Text', props: { text: 'Selected {{count}} — doubled {{double}}' } },
        { id: 'kv', type: 'KeyValue', props: { items: [{ key: 'Doubled', value: { $computed: 'double' } }] } },
      ],
      computed: [{ id: 'double', expr: 'count * 2' }],
    })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects an unknown template id even when the bindKey exists', () => {
    const r = validateTree({
      root: 'stack',
      components: [
        { id: 'stack', type: 'Stack', children: ['seg', 'note'] },
        { id: 'seg', type: 'Segmented', props: { bindKey: 'count', options: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] } },
        { id: 'note', type: 'Text', props: { text: '{{counter}}' } },
      ],
      computed: [{ id: 'double', expr: 'count * 2' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/unknown computed id "counter"/)
  })

  it('rejects fewer than 2 options', () => {
    expect(problems('Segmented', { options: [{ value: 'a', label: 'A' }] })).toMatch(/options: needs at least 2 options/)
  })

  it('rejects a null or duplicate option value', () => {
    expect(problems('Segmented', { options: [{ value: null, label: 'A' }, { value: 'b', label: 'B' }] })).toMatch(/options\[0\]\.value: must not be null/)
    expect(problems('Segmented', { options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toMatch(/duplicate option value "a"/)
  })

  it('rejects a defaultValue that matches no option', () => {
    expect(problems('Segmented', { defaultValue: 'year', options })).toMatch(/defaultValue: must match one of options\[\]\.value/)
  })
})

describe('Issue #93 package 3: Choice (multi-select and chips)', () => {
  const options = [
    { id: 'a', label: 'Alpha', prompt: 'Do alpha' },
    { id: 'b', label: 'Beta', prompt: 'Do beta' },
    { id: 'c', label: 'Gamma', prompt: 'Do gamma' },
  ]

  it('accepts multiple: true with minSelect/maxSelect', () => {
    const r = run('Choice', { question: 'Which?', multiple: true, minSelect: 1, maxSelect: 2, options })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('accepts variant: chips with multiple', () => {
    expect(run('Choice', { question: 'Which?', multiple: true, variant: 'chips', options }).ok).toBe(true)
  })

  it('rejects minSelect/maxSelect when multiple is not true', () => {
    expect(problems('Choice', { question: 'Which?', minSelect: 1, options })).toMatch(/minSelect and maxSelect require multiple: true/)
    expect(problems('Choice', { question: 'Which?', maxSelect: 2, options })).toMatch(/minSelect and maxSelect require multiple: true/)
  })

  it('rejects minSelect > maxSelect', () => {
    expect(problems('Choice', { question: 'Which?', multiple: true, minSelect: 3, maxSelect: 2, options }))
      .toMatch(/minSelect must be <= maxSelect/)
  })

  it('rejects minSelect larger than options.length', () => {
    expect(problems('Choice', { question: 'Which?', multiple: true, minSelect: 5, maxSelect: 5, options }))
      .toMatch(/minSelect: exceeds options length \(3\)/)
  })
})

describe('Issue #93 package 3: Form switch / tags / daterange / select search', () => {
  const field = (over = {}) => ({ name: 'f', label: 'F', type: 'text', ...over })

  it('accepts switch, tags, daterange and a searchable select in one form', () => {
    const r = run('Form', {
      prompt: 'Submit the profile',
      fields: [
        { name: 'notify', label: 'Notify me', type: 'switch', default: true },
        { name: 'labels', label: 'Labels', type: 'tags', default: ['alpha', 'beta'], maxTags: 5 },
        { name: 'span', label: 'Window', type: 'daterange', default: { start: '2026-01-01', end: '2026-01-07' } },
        { name: 'region', label: 'Region', type: 'select', options: ['EU', 'US'], searchable: true },
      ],
    })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects an array default on a non-tags field', () => {
    expect(problems('Form', { fields: [field({ default: ['a'] })] })).toMatch(/default: array default is only valid for tags fields/)
  })

  it('rejects an object default on a non-daterange field', () => {
    expect(problems('Form', { fields: [field({ default: { start: '2026-01-01', end: '2026-01-02' } })] }))
      .toMatch(/default: object default is only valid for daterange fields/)
  })

  it('rejects a daterange default whose start is after its end', () => {
    expect(problems('Form', { fields: [field({ type: 'daterange', default: { start: '2026-03-05', end: '2026-03-01' } })] }))
      .toMatch(/default: start must be <= end/)
  })

  it('rejects maxTags on a non-tags field', () => {
    expect(problems('Form', { fields: [field({ maxTags: 3 })] })).toMatch(/maxTags: only supported on a tags field/)
  })

  it('evaluates tags as a count and daterange as a day span', () => {
    const spec = [{ id: 'tagCount', expr: 'labels * 1' }, { id: 'spanDays', expr: 'span * 1' }]
    const r = evaluateComputed(spec, {
      labels: ['alpha', 'beta', 'gamma'],
      span: { start: '2026-01-01', end: '2026-01-08' },
    })
    expect(r.errors).toEqual({})
    expect(r.values).toMatchObject({ tagCount: 3, spanDays: 7 })
  })
})

// ---------------------------------------------------------------------------
// Package 4: Calendar, Chart (hbar/radar), Audio
// ---------------------------------------------------------------------------

describe('Issue #93 package 4: Calendar', () => {
  const event = (over = {}) => ({ id: 'e1', title: 'Standup', start: '2026-03-02T09:00', end: '2026-03-02T09:30', ...over })

  it('accepts day, week and agenda views with an IANA timeZone', () => {
    for (const view of ['day', 'week', 'agenda']) {
      const r = run('Calendar', { view, timeZone: 'Asia/Shanghai', events: [event()] })
      expect(r.errors).toEqual([])
      expect(r.ok).toBe(true)
    }
    expect(run('Calendar', { timeZone: 'America/New_York', events: [event()] }).ok).toBe(true)
    expect(run('Calendar', { timeZone: 'UTC', events: [event()] }).ok).toBe(true)
  })

  it('accepts date-only and datetime events in one calendar', () => {
    const r = run('Calendar', {
      view: 'week',
      timeZone: 'Europe/Berlin',
      start: '2026-03-02',
      events: [
        { id: 'offsite', title: 'Offsite', start: '2026-03-03', end: '2026-03-04' },
        event({ id: 'standup' }),
      ],
    })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects an invalid IANA timeZone', () => {
    expect(problems('Calendar', { timeZone: 'Mars/Olympus', events: [event()] }))
      .toMatch(/timeZone: invalid IANA time zone "Mars\/Olympus"/)
  })

  it('rejects an event whose end is not after its start', () => {
    expect(problems('Calendar', { timeZone: 'UTC', events: [event({ end: '2026-03-02T09:00' })] }))
      .toMatch(/events\[0\]\.end: must be after start/)
  })

  it('rejects events spanning more than 31 days', () => {
    expect(problems('Calendar', { timeZone: 'UTC', events: [event({ start: '2026-01-01', end: '2026-03-15' })] }))
      .toMatch(/events: spans more than 31 days/)
  })

  it('rejects duplicate event ids', () => {
    expect(problems('Calendar', { timeZone: 'UTC', events: [event(), event({ start: '2026-03-02T10:00', end: '2026-03-02T10:30' })] }))
      .toMatch(/duplicate event id "e1"/)
  })
})

describe('Issue #93 package 4: Chart hbar and radar', () => {
  it('accepts an hbar chart', () => {
    const r = run('Chart', { kind: 'hbar', labels: ['EU', 'US', 'APAC'], series: [{ name: 'Revenue', values: [12, 30, 8] }] })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('accepts a radar chart with at least 3 labels', () => {
    expect(run('Chart', { kind: 'radar', labels: ['Speed', 'Cost', 'Quality'], series: [{ name: 'Vendor A', values: [3, 2, 5] }] }).ok).toBe(true)
  })

  it('rejects a radar chart with fewer than 3 labels', () => {
    expect(problems('Chart', { kind: 'radar', labels: ['Speed', 'Cost'], series: [{ name: 'Vendor A', values: [3, 2] }] }))
      .toMatch(/labels: a radar chart needs at least 3 labels/)
  })
})

describe('Issue #93 package 4: Audio', () => {
  it('accepts an https src and creditUrl', () => {
    const r = run('Audio', { src: 'https://cdn.example.com/talk.mp3', title: 'Keynote', credit: 'Example FM', creditUrl: 'https://example.com/episodes/1' })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('rejects an http:// src', () => {
    expect(problems('Audio', { src: 'http://cdn.example.com/talk.mp3' })).toMatch(/src: expected an https:\/\/ URL, got http:/)
  })

  it('rejects a credentialed creditUrl', () => {
    expect(problems('Audio', { src: 'https://cdn.example.com/talk.mp3', creditUrl: 'https://user:example@example.com/1' }))
      .toMatch(/creditUrl: must not contain credentials/)
  })
})

// ---------------------------------------------------------------------------
// Segmented bindKey across validateComposition and applyPatch
// ---------------------------------------------------------------------------

const segmentedTree = () => ({
  root: 'stack',
  components: [
    { id: 'stack', type: 'Stack', children: ['seg', 'note'] },
    { id: 'seg', type: 'Segmented', props: { bindKey: 'count', defaultValue: '1', options: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] } },
    { id: 'note', type: 'Text', props: { text: 'Window' } },
  ],
  computed: [{ id: 'double', expr: 'count * 2' }],
})

describe('Issue #93 Segmented bindKey linkage', () => {
  it('lets a sibling catalog block read the bindKey published by validateComposition', () => {
    const result = validateComposition({
      title: 'Window',
      blocks: [
        { id: 'intro', type: 'markdown', text: 'Pick a window.' },
        { id: 'picker', type: 'catalog', root: 'seg', components: [{ id: 'seg', type: 'Segmented', props: { bindKey: 'count', options: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] } }] },
        {
          id: 'viewer',
          type: 'catalog',
          root: 'note',
          components: [{ id: 'note', type: 'Text', props: { text: '{{count}} selected, doubled {{weekCount}}' } }],
          computed: [{ id: 'weekCount', expr: 'count * 2' }],
        },
      ],
    }, { lenientValidation: false })
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('rejects a sibling formula that names a value no block publishes', () => {
    const result = validateComposition({
      title: 'Window',
      blocks: [
        { id: 'picker', type: 'catalog', root: 'seg', components: [{ id: 'seg', type: 'Segmented', props: { bindKey: 'count', options: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] } }] },
        {
          id: 'viewer',
          type: 'catalog',
          root: 'note',
          components: [{ id: 'note', type: 'Text', props: { text: 'x' } }],
          computed: [{ id: 'broken', expr: 'missing * 2' }],
        },
      ],
    }, { lenientValidation: false })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/missing/)
  })

  it('applies a patch whose text template reads the Segmented bindKey or a computed id', () => {
    const v1 = snapshotOf('ui', segmentedTree())
    const r = applyPatch(v1, { uiId: 'ui', baseVersion: 1, ops: [{ op: 'setProps', id: 'note', props: { text: '{{count}} → {{double}}' } }] })
    expect(r.ok).toBe(true)
    expect(r.ui.version).toBe(2)
    expect(r.ui.components.find(n => n.id === 'note').props.text).toBe('{{count}} → {{double}}')
    expect(r.ui.computed).toEqual([{ id: 'double', expr: 'count * 2' }])
  })

  it('rejects a patch that introduces an undeclared template id', () => {
    const v1 = snapshotOf('ui', segmentedTree())
    const r = applyPatch(v1, { uiId: 'ui', baseVersion: 1, ops: [{ op: 'setProps', id: 'note', props: { text: '{{nope}}' } }] })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/unknown computed id "nope"/)
  })

  it('rejects a patch whose Segmented defaultValue matches no option', () => {
    const v1 = snapshotOf('ui', segmentedTree())
    const r = applyPatch(v1, { uiId: 'ui', baseVersion: 1, ops: [{ op: 'setProps', id: 'seg', props: { defaultValue: '3' } }] })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/defaultValue: must match one of options\[\]\.value/)
  })
})

// ---------------------------------------------------------------------------
// Package 5: lenient normalizations
// ---------------------------------------------------------------------------

describe('Issue #93 lenient normalizations', () => {
  const lenient = tree => validateTree(tree, { lenient: true })

  it('rejects KeyValue item.label strictly but normalizes it to key when lenient', () => {
    const strict = validateTree(single('KeyValue', { items: [{ label: 'Region', value: 'EU' }] }))
    expect(strict.ok).toBe(false)
    expect(strict.errors.join('\n')).toMatch(/items\[0\]\.label/)

    const r = lenient(single('KeyValue', { items: [{ label: 'Region', value: 'EU' }] }))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.normalized).toBe(true)
    expect(r.components[0].props.items[0]).toEqual({ key: 'Region', value: 'EU' })
    expect(r.warnings.join('\n')).toMatch(/items\[0\]\.label: normalized label to key/)
  })

  it('normalizes Steps item.text to description', () => {
    const r = lenient(single('Steps', { items: [{ id: 's1', title: 'Plan', text: 'Draft the scope' }] }))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.components[0].props.items[0]).toEqual({ id: 's1', title: 'Plan', description: 'Draft the scope' })
    expect(r.warnings.join('\n')).toMatch(/items\[0\]\.text: normalized text to description/)
  })

  it('normalizes EmptyState props.text to props.description', () => {
    const r = lenient(single('EmptyState', { title: 'No results', text: 'Try another filter' }))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.components[0].props).toEqual({ title: 'No results', description: 'Try another filter' })
    expect(r.warnings.join('\n')).toMatch(/props\.text: normalized EmptyState props\.text to props\.description/)
  })

  it('normalizes FollowUp props.options to props.items', () => {
    const r = lenient(single('FollowUp', { options: [{ id: 'f1', label: 'More detail', prompt: 'Explain the last section' }] }))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.components[0].props.items).toEqual([{ id: 'f1', label: 'More detail', prompt: 'Explain the last section' }])
    expect(r.components[0].props.options).toBeUndefined()
    expect(r.warnings.join('\n')).toMatch(/props\.options: normalized FollowUp props\.options to props\.items/)
  })

  it('normalizes Sources props.sources to props.items', () => {
    const r = lenient(single('Sources', { sources: [{ id: 's1', title: 'Deep Learning', source: 'Goodfellow, 2016' }] }))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.components[0].props.items).toEqual([{ id: 's1', title: 'Deep Learning', source: 'Goodfellow, 2016' }])
    expect(r.components[0].props.sources).toBeUndefined()
    expect(r.warnings.join('\n')).toMatch(/props\.sources: normalized Sources props\.sources to props\.items/)
  })

  it('normalizes Segmented props.items to props.options and keeps the bindKey linkage', () => {
    const r = validateTree({
      root: 'stack',
      components: [
        { id: 'stack', type: 'Stack', children: ['seg', 'note'] },
        { id: 'seg', type: 'Segmented', props: { bindKey: 'count', items: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] } },
        { id: 'note', type: 'Text', props: { text: '{{double}}' } },
      ],
      computed: [{ id: 'double', expr: 'count * 2' }],
    }, { lenient: true })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.components[1].props.options).toEqual([{ value: '1', label: 'One' }, { value: '2', label: 'Two' }])
    expect(r.components[1].props.items).toBeUndefined()
    expect(r.warnings.join('\n')).toMatch(/props\.items: normalized Segmented props\.items to props\.options/)
  })
})
