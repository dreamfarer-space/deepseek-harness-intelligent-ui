// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { compareTyped, inferTypes, parseDate } from '../client-src/catalog/Table.tsx'
import { exportFileName, toCsv, toMarkdown } from '../client-src/catalog/export.ts'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { validateProps } from '../src/catalog/catalog.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

const COLUMNS = ['Order', 'Date', 'Amount', 'Paid']
const ROWS = [
  ['A-1', '2026-03-02', 120, true],
  ['B-2', '2026-01-15', -40, false],
  ['C-3', null, 300, true],
  ['D-4', '2025-12-31', 75.5, false],
  ['E-5', '2026-02-10', null, true],
]

function view(props: Record<string, unknown> = {}) {
  const args = { root: 'g', components: [{ id: 'g', type: 'Table', props: { columns: COLUMNS, rows: ROWS, caption: 'Orders', ...props } }] }
  return <RenderView callId="c1" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
    block={{ kind: 'tool-result', callId: 'c1', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }} />
}
/** jsdom's Blob has no text(). */
const text = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsText(b) })
const render = (el: React.ReactElement) => act(() => root.render(el))
const column = (c: number) => [...host.querySelectorAll('tbody tr')].map(r => r.children[c]?.textContent)
const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith(label))
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('export helpers', () => {
  it('writes RFC 4180 CSV with a BOM and neutralises formula injection', () => {
    const csv = toCsv(['名称', 'Formula', 'n'], [
      ['东京, 日本', '=HYPERLINK("http://x")', -5],
      ['say "hi"', '+1', 3.5],
      ['line\nbreak', '@SUM(A1)', null],
      ['-minus text', '\tTAB', Number.NaN],
    ])
    expect(csv.startsWith('﻿名称,Formula,n\r\n')).toBe(true)
    expect(csv).toContain('"东京, 日本","\'=HYPERLINK(""http://x"")",-5')
    expect(csv).toContain('"say ""hi""",\'+1,3.5')
    expect(csv).toContain('"line\nbreak",\'@SUM(A1),\r\n')
    expect(csv).toContain("'-minus text,'\tTAB,\r\n")
  })
  it('escapes Markdown table syntax and never emits raw HTML from cells', () => {
    const md = toMarkdown(['a|b', 'c'], [['x|y', 'two\nlines'], ['<script>', null]])
    expect(md.split('\n').slice(0, 2)).toEqual(['| a\\|b | c |', '| --- | --- |'])
    expect(md).toContain('| x\\|y | two<br>lines |')
    expect(md).toContain('| <script> |  |')
  })
  it('makes portable file names', () => {
    expect(exportFileName('Q3: sales/region?', 'csv')).toBe('Q3 sales region.csv')
    expect(exportFileName(undefined, 'md')).toBe('data.md')
  })
})

describe('typed sorting', () => {
  it('parses ISO 8601 only', () => {
    expect(parseDate('2026-10-20')).toBe(Date.UTC(2026, 9, 20))
    expect(parseDate('2026-10-20T08:30')).toBe(Date.UTC(2026, 9, 20, 8, 30))
    expect(parseDate('2026-10-20 08:30:00+08:00')).toBe(Date.UTC(2026, 9, 20, 0, 30))
    expect(parseDate('10/20/2026')).toBeUndefined()
    expect(parseDate('2026-13-01')).toBeUndefined()
  })
  it('infers column types and keeps empty values last in both directions', () => {
    expect(inferTypes(COLUMNS, ROWS)).toEqual(['text', 'date', 'number', 'boolean'])
    expect(inferTypes(COLUMNS, ROWS, ['text', 'text'])).toEqual(['text', 'text', 'number', 'boolean'])
    expect(inferTypes(COLUMNS, ROWS, ['string'])).toEqual(['text', 'date', 'number', 'boolean'])
    const dates = ['2026-01-02', null, '2025-12-31', 'soon']
    expect([...dates].sort((a, b) => compareTyped(a, b, 'date', 1))).toEqual(['2025-12-31', '2026-01-02', null, 'soon'])
    expect([...dates].sort((a, b) => compareTyped(a, b, 'date', -1)).slice(0, 2)).toEqual(['2026-01-02', '2025-12-31'])
    expect(['10', '9', 'x'].sort((a, b) => compareTyped(a, b, 'number', 1))).toEqual(['9', '10', 'x'])
  })
})

describe('Table as a data grid', () => {
  it('sorts dates chronologically, not alphabetically', () => {
    render(view({ sortable: true }))
    act(() => { button('Date')!.click() })
    expect(column(1)).toEqual(['2025-12-31', '2026-01-15', '2026-02-10', '2026-03-02', '—'])
    act(() => { button('Date')!.click() })
    expect(column(1)).toEqual(['2026-03-02', '2026-02-10', '2026-01-15', '2025-12-31', '—'])
  })
  it('searches and filters locally with combined conditions, and survives a remount', () => {
    render(view({ searchable: true, filterable: true }))
    type(host.querySelector<HTMLInputElement>('input[type=search][aria-label="Search"]')!, 'a-1')
    expect(column(0)).toEqual(['A-1'])
    expect(host.textContent).toContain('1 of 5 rows')
    type(host.querySelector<HTMLInputElement>('input[aria-label="Search"]')!, '')
    act(() => { button('Filter')!.click() })
    type(host.querySelector<HTMLInputElement>('input[aria-label="Minimum Amount"]')!, '0')
    expect(column(0)).toEqual(['A-1', 'C-3', 'D-4'])
    type(host.querySelector<HTMLInputElement>('input[aria-label="Maximum Date"]')!, '2026-01-31')
    expect(column(0)).toEqual(['D-4'])
    act(() => { root.unmount() })
    root = createRoot(host)
    render(view({ searchable: true, filterable: true }))
    expect(column(0)).toEqual(['D-4'])
    act(() => { button('Clear filters')!.click() })
    expect(column(0)).toHaveLength(5)
  })
  it('filters booleans and shows a no-match state', () => {
    render(view({ filterable: true, searchable: true }))
    act(() => { button('Filter')!.click() })
    const sel = host.querySelector<HTMLSelectElement>('select[aria-label="Filter Paid"]')!
    act(() => { sel.value = 'false'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(column(0)).toEqual(['B-2', 'D-4'])
    type(host.querySelector<HTMLInputElement>('input[aria-label="Search"]')!, 'zzz')
    expect(host.textContent).toContain('No matching rows')
  })
  it('pages inline rows', () => {
    render(view({ pageSize: 2 }))
    expect(column(0)).toEqual(['A-1', 'B-2'])
    expect(host.textContent).toContain('Page 1 of 3 (5 rows)')
    act(() => { button('Next')!.click() })
    act(() => { button('Next')!.click() })
    expect(column(0)).toEqual(['E-5'])
    expect(button('Next')!.disabled).toBe(true)
  })
  it('exports exactly the filtered, sorted rows', async () => {
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' })
    URL.revokeObjectURL = vi.fn()
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download) })
    render(view({ exportable: true, filterable: true, sortable: true }))
    act(() => { button('Amount')!.click() })
    act(() => { button('Filter')!.click() })
    type(host.querySelector<HTMLInputElement>('input[aria-label="Filter Order"]')!, '-')
    act(() => { button('Export CSV')!.click() })
    act(() => { button('Export Markdown')!.click() })
    expect(clicks).toEqual(['Orders.csv', 'Orders.md'])
    const csv = await text(blobs[0]!)
    expect(csv.replace('﻿', '').trim().split('\r\n')).toEqual([
      'Order,Date,Amount,Paid', 'B-2,2026-01-15,-40,false', 'D-4,2025-12-31,75.5,false', 'A-1,2026-03-02,120,true', 'C-3,,300,true', 'E-5,2026-02-10,,true',
    ])
    expect(await text(blobs[1]!)).toContain('| B-2 | 2026-01-15 | -40 | false |')
  })
  it('validates the new props', () => {
    expect(validateProps('Table', { columns: COLUMNS, rows: ROWS, columnTypes: ['text', 'date'], searchable: true, filterable: true, exportable: true, pageSize: 10 })).toEqual([])
    expect(validateProps('Table', { columns: COLUMNS, rows: ROWS, columnTypes: ['money'] })).not.toEqual([])
    expect(validateProps('Table', { columns: ['a'], rows: [], columnTypes: ['text', 'text'] }).join()).toContain('columnTypes')
    expect(validateProps('Table', { dataRef: { id: 'd', scope: 's' }, searchable: true }).join()).toContain('dataRef')
  })
})

describe('Chart accessibility', () => {
  it('steps through categories with the keyboard and shows the tooltip', () => {
    const args = { root: 'c', components: [{ id: 'c', type: 'Chart', props: { kind: 'bar', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Sales', values: [1, 2, 3] }], unit: 'k' } }] }
    render(<RenderView callId="c2" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
      block={{ kind: 'tool-result', callId: 'c2', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }} />)
    const svg = host.querySelector<SVGSVGElement>('svg.diui-chart-svg')!
    expect(svg.getAttribute('tabindex')).toBe('0')
    const key = (k: string) => act(() => { svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
    key('ArrowRight')
    expect(host.querySelector('.diui-tooltip')?.textContent).toContain('Q1')
    key('End')
    expect(host.querySelector('.diui-tooltip')?.textContent).toContain('Sales: 3 k')
    key('Escape')
    expect(host.querySelector('.diui-tooltip')).toBeNull()
  })
  it('exports chart data as a table', async () => {
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const args = { root: 'c', components: [{ id: 'c', type: 'Chart', props: { kind: 'line', title: 'Trend', labels: ['Jan', 'Feb'], series: [{ name: 'A', values: [1, 2] }, { name: 'B', values: [3, 4] }], exportable: true } }] }
    render(<RenderView callId="c3" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
      block={{ kind: 'tool-result', callId: 'c3', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }} />)
    act(() => { button('Export CSV')!.click() })
    expect((await text(blobs[0]!)).replace('﻿', '').trim().split('\r\n')).toEqual([',A,B', 'Jan,1,3', 'Feb,2,4'])
  })
})
