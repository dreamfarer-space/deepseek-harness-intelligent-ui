/**
 * Component linkage (Issue #84, Phase 2): a form control drives the rest of the
 * UI locally, with no message to the model.
 *
 * - shared state: a `bindKey` without a `<nodeId>:` prefix is one variable for
 *   the whole answer, so every block reads and writes the same value, while
 *   paging/sort/tab keys stay private to their own block;
 * - `computed`: the tree's formulas are re-evaluated on every broadcast and
 *   resolved into props (Progress value, chart series, `{{id}}` text);
 * - `Table.filterField`/`filterValue`: a computed threshold narrows rows.
 */
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { ComposeView } from '../client-src/compose/ComposeView.tsx'
import { matchesExpression } from '../client-src/catalog/Table.tsx'
import { en } from '../client-src/locales.ts'
import { getUiState, resetUiStateMemory, rootCallId, setUiState } from '../client-src/state.ts'
import { validateTree } from '../src/catalog/catalog.js'
import { applyPatch, snapshotOf } from '../src/catalog/patch.js'
import { createControlledRuntime } from '../src/controlled/runtime.js'
import { resetUiVersions } from '../client-src/versions.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  resetUiVersions()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

function render(el: React.ReactElement) {
  act(() => root.render(el))
}

/** Unmount and mount again on the same host (page reload / Turn-tail move). */
function remount(el: React.ReactElement) {
  act(() => root.unmount())
  root = createRoot(host)
  render(el)
}

/** Drive an `<input>` the way a user does, so React sees the change. */
function setInputValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const slider = () => host.querySelector('input[type=range]') as HTMLInputElement
const progressValue = () => host.querySelector('.diui-progress-track')!.getAttribute('aria-valuenow')
const progressWidth = () => (host.querySelector('.diui-progress-bar') as HTMLElement).style.width
/** Rendered bars as `"label · series: value"` (the SVG `<title>` of each rect). */
const barTitles = () => [...host.querySelectorAll('rect title')].map(el => el.textContent)
const tableRows = () => [...host.querySelectorAll('tbody tr')].map(tr =>
  [...tr.children].map(td => td.textContent).join('|'))

function settledView(callId: string, args: unknown, meta: Record<string, unknown> = { ok: true }) {
  return {
    kind: 'tool-result' as const, callId,
    call: { name: 'ui_render', argsRaw: JSON.stringify(args) },
    content: [], isError: false, meta,
  }
}

function base(callId: string, toolName = 'ui_render') {
  return { callId, toolName, t, sendPrompt: vi.fn(async () => {}), sendNewSessionPrompt: vi.fn(async () => {}) }
}

/** A settled `ui_compose` result carrying `args`. */
function composeResult(callId: string, args: unknown, name = 'ui_compose') {
  return {
    kind: 'tool-result' as const, callId,
    call: { name, argsRaw: JSON.stringify(args) },
    content: [], isError: false, meta: { ok: true },
  }
}

const SCORE_ROWS = [['Ann', 10], ['Bob', 40], ['Cy', 80], ['Di', 95]]

const DASHBOARD = {
  title: 'Threshold dashboard',
  root: 'stack',
  computed: [
    { id: 'pct', expr: 'threshold' },
    { id: 'half', expr: 'threshold / 2' },
    { id: 'pctLabel', expr: 'threshold / 100', format: { style: 'percent' } },
  ],
  components: [
    { id: 'stack', type: 'Stack', children: ['form', 'bar', 'label', 'chart'] },
    {
      id: 'form',
      type: 'Form',
      props: {
        title: 'Threshold',
        fields: [{ name: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 100, step: 1, default: 20, bindKey: 'threshold' }],
      },
    },
    { id: 'bar', type: 'Progress', props: { label: 'Score', max: 100, value: { $computed: 'pct' } } },
    { id: 'label', type: 'Text', props: { text: 'Threshold: {{pctLabel}}' } },
    {
      id: 'chart',
      type: 'Chart',
      props: {
        kind: 'bar', labels: ['Now', 'Half'],
        series: [{ name: 'Forecast', values: [{ $computed: 'pct' }, { $computed: 'half' }] }],
      },
    },
  ],
}

describe('shared state pool', () => {
  it('derives the root id of a block-scoped call id', () => {
    expect(rootCallId('call-1#block-2')).toBe('call-1')
    expect(rootCallId('call-1')).toBe('call-1')
    expect(rootCallId('#block')).toBe('#block')
  })

  it('shares keys without a prefix across blocks and keeps `<nodeId>:` keys private', () => {
    setUiState('compose#controls', 'threshold', 42)
    // Every block of the same answer reads the same variable, including the root.
    expect(getUiState('compose#report', 'threshold')).toBe(42)
    expect(getUiState('compose', 'threshold')).toBe(42)
    // A node's own interaction state never leaks into a sibling block.
    setUiState('compose#report', 'tbl:page', 3)
    expect(getUiState('compose#report', 'tbl:page')).toBe(3)
    expect(getUiState('compose#controls', 'tbl:page')).toBeUndefined()
    expect(getUiState('compose', 'tbl:page')).toBeUndefined()
    // Another answer is a different pool.
    expect(getUiState('other', 'threshold')).toBeUndefined()
  })
})

describe('RenderView linkage', () => {
  it('moves a Progress bar and a formatted text from a bound slider', () => {
    const view = <RenderView {...base('link-1')} phase="result" block={settledView('link-1', DASHBOARD)} />
    render(view)
    // The default (20) is already published, so the answer is linked before any input.
    expect(progressValue()).toBe('20')
    expect(progressWidth()).toBe('20%')
    expect(host.querySelector('.diui-text')!.textContent).toBe('Threshold: 20%')
    expect(barTitles()).toEqual(['Now · Forecast: 20', 'Half · Forecast: 10'])
    expect(getUiState('link-1', 'threshold')).toBe(20)

    act(() => setInputValue(slider(), '65'))
    expect(progressValue()).toBe('65')
    expect(progressWidth()).toBe('65%')
    expect(host.querySelector('.diui-text')!.textContent).toBe('Threshold: 65%')
    expect(barTitles()).toEqual(['Now · Forecast: 65', 'Half · Forecast: 32.5'])
    // The value lives in the shared pool, not in the form's private bag.
    expect(getUiState('link-1', 'threshold')).toBe(65)
    expect(getUiState('link-1', 'form:values')).toEqual({ threshold: 65 })

    remount(view)
    expect(progressValue()).toBe('65')
    expect(slider().value).toBe('65')
  })

  it('recomputes chart series on every drag', () => {
    const tree = {
      root: 'stack',
      computed: [{ id: 'doubled', expr: 'rate * 2' }, { id: 'offset', expr: 'rate + 10' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['chart', 'form'] },
        { id: 'chart', type: 'Chart', props: {
          kind: 'bar', labels: ['Q1', 'Q2'],
          series: [{ name: 'Forecast', values: [{ $computed: 'doubled' }, { $computed: 'offset' }] }],
        } },
        { id: 'form', type: 'Form', props: { fields: [{ name: 'rate', label: 'Rate', type: 'range', min: 0, max: 20, step: 1, default: 5, bindKey: 'rate' }] } },
      ],
    }
    render(<RenderView {...base('link-2')} phase="result" block={settledView('link-2', tree)} />)
    expect(barTitles()).toEqual(['Q1 · Forecast: 10', 'Q2 · Forecast: 15'])

    act(() => setInputValue(slider(), '8'))
    expect(barTitles()).toEqual(['Q1 · Forecast: 16', 'Q2 · Forecast: 18'])
    expect(getUiState('link-2', 'rate')).toBe(8)
  })

  it('filters table rows from a computed threshold, with no message to the model', () => {
    const sendPrompt = vi.fn(async () => {})
    const args = {
      root: 'stack',
      computed: [{ id: 'minScore', expr: 'threshold' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['form', 'tbl'] },
        { id: 'form', type: 'Form', props: { fields: [{ name: 'threshold', label: 'Min score', type: 'range', min: 0, max: 100, step: 5, default: 20, bindKey: 'threshold' }] } },
        { id: 'tbl', type: 'Table', props: { columns: ['Name', 'Score'], rows: SCORE_ROWS, filterField: 'Score', filterValue: '>= {{minScore}}' } },
      ],
    }
    render(<RenderView {...base('link-3')} sendPrompt={sendPrompt} phase="result" block={settledView('link-3', args)} />)
    expect(tableRows()).toEqual(['Bob|40', 'Cy|80', 'Di|95'])

    act(() => setInputValue(slider(), '90'))
    expect(tableRows()).toEqual(['Di|95'])

    act(() => setInputValue(slider(), '0'))
    expect(tableRows()).toEqual(['Ann|10', 'Bob|40', 'Cy|80', 'Di|95'])
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('leaves a formula-broken component empty instead of inventing a value', () => {
    const args = {
      root: 'bar',
      computed: [{ id: 'broken', expr: 'missing_field * 2' }],
      components: [{ id: 'bar', type: 'Progress', props: { label: 'Score', value: { $computed: 'broken' } } }],
    }
    render(<RenderView {...base('link-4')} phase="result" block={settledView('link-4', args)} />)
    expect(progressValue()).toBe('0')
    expect(progressWidth()).toBe('0%')
  })
})

describe('ComposeView cross-block linkage', () => {
  const BLOCKS = [
    { id: 'intro', type: 'markdown', text: '## Plan' },
    {
      id: 'controls', type: 'catalog', title: 'Controls', root: 'form',
      components: [
        { id: 'form', type: 'Form', props: {
          title: 'Threshold',
          fields: [{ name: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 100, step: 5, default: 30, bindKey: 'threshold' }],
        } },
      ],
    },
    { id: 'risks', type: 'markdown', text: 'Rows above the threshold follow.' },
    {
      id: 'report', type: 'catalog', title: 'Report', root: 'stack',
      // Reads a field published by the *controls* block.
      computed: [{ id: 'minScore', expr: 'threshold' }, { id: 'pct', expr: 'threshold' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['bar', 'tbl'] },
        { id: 'bar', type: 'Progress', props: { label: 'Threshold', max: 100, value: { $computed: 'pct' } } },
        { id: 'tbl', type: 'Table', props: { columns: ['Name', 'Score'], rows: SCORE_ROWS, filterField: 'Score', filterValue: '>= {{minScore}}' } },
      ],
    },
  ]
  const composeView = (callId = 'cmp-1') => (
    <ComposeView {...base(callId, 'ui_compose')} phase="result" block={composeResult(callId, { title: 'Route', blocks: BLOCKS })} />
  )

  it('drives a table and a progress bar in another block from block 1', () => {
    render(composeView())
    expect(progressValue()).toBe('30')
    expect(tableRows()).toEqual(['Bob|40', 'Cy|80', 'Di|95'])

    act(() => setInputValue(slider(), '85'))
    expect(progressValue()).toBe('85')
    expect(tableRows()).toEqual(['Di|95'])
    // One pool: the root id holds the variable, both block ids resolve to it.
    expect(getUiState('cmp-1', 'threshold')).toBe(85)
    expect(getUiState('cmp-1#controls', 'threshold')).toBe(85)
    expect(getUiState('cmp-1#report', 'threshold')).toBe(85)
    // Each form keeps its private values under its own block.
    expect(getUiState('cmp-1#controls', 'form:values')).toEqual({ threshold: 85 })
    expect(getUiState('cmp-1#report', 'form:values')).toBeUndefined()
  })

  it('keeps per-block interaction state isolated while sharing the variable', () => {
    render(composeView('cmp-2'))
    setUiState('cmp-2#report', 'tbl:page', 2)
    expect(getUiState('cmp-2#report', 'tbl:page')).toBe(2)
    expect(getUiState('cmp-2#controls', 'tbl:page')).toBeUndefined()
    act(() => setInputValue(slider(), '10'))
    expect(getUiState('cmp-2', 'threshold')).toBe(10)
    // The private key survived the shared write (separate bags).
    expect(getUiState('cmp-2#report', 'tbl:page')).toBe(2)
  })
})

describe('linkage filter expressions', () => {
  it('compares numbers when both sides are numeric', () => {
    expect(matchesExpression(50, '>= 50')).toBe(true)
    expect(matchesExpression(49, '>= 50')).toBe(false)
    expect(matchesExpression(50, '> 50')).toBe(false)
    expect(matchesExpression(10, '<= 10')).toBe(true)
    expect(matchesExpression(10, '< 10')).toBe(false)
    expect(matchesExpression(3, '== 3')).toBe(true)
    expect(matchesExpression(3, '!= 3')).toBe(false)
    // Numeric strings from an input still compare as numbers.
    expect(matchesExpression('75', '>= 50')).toBe(true)
  })

  it('falls back to case-insensitive substring matching without an operator', () => {
    expect(matchesExpression('Gold', 'gold')).toBe(true)
    expect(matchesExpression('Gold', 'sil')).toBe(false)
    expect(matchesExpression('Gold', '!= Silver')).toBe(true)
    expect(matchesExpression(null, '>= 5')).toBe(false)
    expect(matchesExpression(5, '')).toBe(true)
  })
})

/**
 * Regression suite for the review of Issue #84 Phase 2: each case failed
 * before the fix it describes (patch scope, form-level and aliased bindings,
 * unreachable forms, bound-table filters, failed chart values).
 */
describe('linkage review regressions', () => {
  const range = (name: string, extra: Record<string, unknown> = {}) =>
    ({ name, label: name, type: 'range', min: 0, max: 100, step: 1, default: 20, ...extra })

  it('keeps a composition block\'s sibling field scope after a patch', () => {
    const report = {
      root: 'p',
      computed: [{ id: 'total', expr: 'threshold' }],
      components: [{ id: 'p', type: 'Progress', props: { value: { $computed: 'total' } } }],
    }
    // `collectUis` records the sibling field names on the snapshot; the patch
    // must keep reading them from the shared pool.
    const ui = { ...snapshotOf('cmp#report', report), scope: ['threshold'] }
    const patched = applyPatch(ui, { uiId: 'cmp#report', baseVersion: 1, ops: [{ op: 'setProps', id: 'p', props: { max: 200 } }] })
    expect(patched.ok).toBe(true)
    setUiState('cmp#controls', 'threshold', 75)
    const block = settledView('patch-1', {}, { ok: true, ui: patched.ok ? patched.ui : undefined })
    render(<PatchView {...base('patch-1', 'ui_patch')} phase="result" block={block} />)
    expect(progressValue()).toBe('75')
  })

  it('publishes edits through a single-field form\'s bindKey', () => {
    const tree = {
      root: 'stack',
      computed: [{ id: 'total', expr: 'amount' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['form', 'bar'] },
        { id: 'form', type: 'Form', props: { title: 'Amount', bindKey: 'amount', fields: [range('qty')] } },
        { id: 'bar', type: 'Progress', props: { label: 'Amount', max: 100, value: { $computed: 'total' } } },
      ],
    }
    expect(validateTree(tree).ok).toBe(true)
    render(<RenderView {...base('form-key')} phase="result" block={settledView('form-key', tree)} />)
    expect(progressValue()).toBe('20')
    expect(getUiState('form-key', 'amount')).toBe(20)

    act(() => setInputValue(slider(), '70'))
    expect(progressValue()).toBe('70')
    expect(getUiState('form-key', 'amount')).toBe(70)
  })

  it('keeps a field name readable when the field also declares bindKey', () => {
    const tree = {
      root: 'stack',
      computed: [{ id: 'double', expr: 'qty * 2' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['form', 'bar'] },
        { id: 'form', type: 'Form', props: { fields: [range('qty', { bindKey: 'quantity' })] } },
        { id: 'bar', type: 'Progress', props: { label: 'Double', max: 200, value: { $computed: 'double' } } },
      ],
    }
    // The Host accepts both names in a formula, so the client must publish both.
    expect(validateTree(tree).ok).toBe(true)
    render(<RenderView {...base('field-alias')} phase="result" block={settledView('field-alias', tree)} />)
    expect(progressValue()).toBe('40')
    expect(getUiState('field-alias', 'quantity')).toBe(20)
    expect(getUiState('field-alias', 'qty')).toBe(20)

    act(() => setInputValue(slider(), '70'))
    expect(progressValue()).toBe('140')
    expect(getUiState('field-alias', 'quantity')).toBe(70)
    expect(getUiState('field-alias', 'qty')).toBe(70)
  })

  it('ignores a form that is not reachable from the root', () => {
    const tree = {
      root: 'bar',
      computed: [{ id: 'total', expr: 'qty * 2' }],
      components: [
        { id: 'bar', type: 'Progress', props: { label: 'Total', value: { $computed: 'total' } } },
        { id: 'orphan', type: 'Form', props: { fields: [range('qty')] } },
      ],
    }
    expect(validateTree(tree).ok).toBe(true)
    render(<RenderView {...base('orphan')} phase="result" block={settledView('orphan', tree)} />)
    // Nothing is on screen, so no value may be invented from the orphan default.
    expect(host.querySelector('input')).toBeNull()
    expect(progressValue()).toBe('0')
    expect(getUiState('orphan', 'qty')).toBeUndefined()
  })

  it('applies a declarative filter to a dataRef table', () => {
    const runtime = createControlledRuntime('s')
    runtime.registerData('board', 'checks', { columns: ['Name', 'Score'], rows: [['Low', 10], ['High', 90]] })
    const tree = {
      root: 'tbl',
      components: [{ id: 'tbl', type: 'Table', props: { dataRef: { id: 'checks', scope: 'board' }, filterField: 'Score', filterValue: '>= 50' } }],
    }
    expect(validateTree(tree).ok).toBe(true)
    render(<RenderView {...base('board')} sessionId="s" controlled={runtime} phase="result" block={settledView('board', tree)} />)
    expect(host.querySelector('tbody')!.textContent).toContain('High')
    expect(host.querySelector('tbody')!.textContent).not.toContain('Low')
    // Paging and counting follow the filtered rows.
    expect(host.textContent).toContain('(1)')
  })

  it('leaves a failed chart value as a gap instead of a zero data point', () => {
    const tree = {
      root: 'stack',
      computed: [{ id: 'bad', expr: 'qty / 0' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['form', 'chart'] },
        { id: 'form', type: 'Form', props: { fields: [range('qty')] } },
        { id: 'chart', type: 'Chart', props: {
          kind: 'bar', labels: ['Now'],
          series: [{ name: 'Result', values: [{ $computed: 'bad' }] }],
        } },
      ],
    }
    expect(validateTree(tree).ok).toBe(true)
    render(<RenderView {...base('bad-chart')} phase="result" block={settledView('bad-chart', tree)} />)
    expect(barTitles()).toEqual([])
    expect(host.textContent).not.toContain('Result: 0')
  })

  it('draws the values that resolved and skips only the missing ones', () => {
    const tree = {
      root: 'stack',
      computed: [{ id: 'good', expr: 'qty' }, { id: 'bad', expr: 'qty / 0' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['form', 'chart'] },
        { id: 'form', type: 'Form', props: { fields: [range('qty')] } },
        { id: 'chart', type: 'Chart', props: {
          kind: 'line', labels: ['A', 'B'],
          series: [{ name: 'S', values: [{ $computed: 'good' }, { $computed: 'bad' }] }],
        } },
      ],
    }
    render(<RenderView {...base('gap-chart')} phase="result" block={settledView('gap-chart', tree)} />)
    expect(barTitles()).toEqual([])
    const circles = [...host.querySelectorAll('circle title')].map(el => el.textContent)
    expect(circles).toEqual(['A · S: 20'])
    expect(host.innerHTML).not.toContain('B · S: 0')
  })
})
