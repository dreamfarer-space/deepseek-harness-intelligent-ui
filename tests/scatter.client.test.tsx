// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { LIMITS, validateProps } from '../src/catalog/catalog.js'

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
afterEach(() => { act(() => root.unmount()); host.remove() })

function show(type: string, props: Record<string, unknown>) {
  const args = { root: 'n', components: [{ id: 'n', type, props }] }
  act(() => root.render(<RenderView callId="s1" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
    block={{ kind: 'tool-result', callId: 's1', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }} />))
}
const svg = () => host.querySelector<SVGSVGElement>('svg.diui-chart-svg')!
const key = (k: string) => act(() => { svg().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
const tip = () => host.querySelector('.diui-tooltip')?.textContent ?? ''

const SCATTER = {
  title: 'Height vs weight', xLabel: 'Height', xUnit: 'cm', yLabel: 'Weight', yUnit: 'kg',
  series: [
    { name: 'Group A', points: [{ x: 170, y: 65, label: 'Ann' }, { x: 182.5, y: 80 }, { x: null, y: 70 }] },
    { name: 'Group B', points: [{ x: 160, y: 52 }, { x: 175, y: null }] },
  ],
}

describe('Scatter', () => {
  it('plots finite points on continuous axes and counts missing coordinates', () => {
    show('Scatter', SCATTER)
    expect(host.querySelectorAll('circle')).toHaveLength(3)
    expect(host.textContent).toContain('2 points without coordinates are not shown')
    expect(host.textContent).toContain('Height (cm)')
    expect(svg().getAttribute('aria-label')).toBe('Height vs weight: 3 points')
  })
  it('steps through points in x order with the keyboard', () => {
    show('Scatter', SCATTER)
    key('ArrowRight')
    expect(tip()).toContain('Group B')
    expect(tip()).toContain('Height: 160 cm')
    key('ArrowRight')
    expect(tip()).toContain('Ann')
    key('End')
    expect(tip()).toContain('Weight: 80 kg')
    key('Escape')
    expect(tip()).toBe('')
  })
  it('toggles series from the legend', () => {
    show('Scatter', SCATTER)
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Group B')!.click() })
    expect(host.querySelectorAll('circle')).toHaveLength(2)
  })
  it('shows an empty state when no point has both coordinates', () => {
    show('Scatter', { series: [{ name: 'S', points: [{ x: null, y: 1 }] }] })
    expect(host.textContent).toContain('No data')
  })
  it('validates numeric coordinates and the total point budget', () => {
    expect(validateProps('Scatter', SCATTER)).toEqual([])
    expect(validateProps('Scatter', { series: [{ name: 'S', points: [{ x: 'Mon', y: 1 }] }] }).join()).toContain('finite number or null')
    const many = Array.from({ length: LIMITS.scatterPoints / 2 + 1 }, (_, i) => ({ x: i, y: i }))
    expect(validateProps('Scatter', { series: [{ name: 'A', points: many }, { name: 'B', points: many }] }).join()).toContain(`at most ${LIMITS.scatterPoints}`)
  })
})

const HEAT = {
  title: 'Commits', unit: 'commits',
  xLabels: ['Mon', 'Tue', 'Wed'], yLabels: ['W1', 'W2'],
  values: [[0, 5, null], [2, 10, 1]],
}

describe('Heatmap', () => {
  it('draws missing cells hatched and keeps 0 as a value', () => {
    show('Heatmap', HEAT)
    const rects = [...host.querySelectorAll('rect')]
    expect(rects).toHaveLength(6)
    expect(rects[2]!.getAttribute('fill')).toBe('url(#diui-hatch)')
    expect(rects[0]!.getAttribute('fill')).not.toBe('url(#diui-hatch)')
    expect(Number(rects[0]!.getAttribute('fill-opacity'))).toBeLessThan(Number(rects[4]!.getAttribute('fill-opacity')))
    expect(host.querySelector('.diui-colorbar')?.textContent).toContain('No data')
  })
  it('moves a focus cell with arrow keys and reports value or no data', () => {
    show('Heatmap', HEAT)
    key('ArrowRight')
    expect(tip()).toContain('W1 · Mon')
    expect(tip()).toContain('0 commits')
    key('ArrowRight'); key('ArrowRight'); key('ArrowRight')
    expect(tip()).toContain('W1 · Wed')
    expect(tip()).toContain('No data')
    key('ArrowDown')
    expect(tip()).toContain('W2 · Wed')
  })
  it('centres a diverging scale on zero', () => {
    show('Heatmap', { ...HEAT, values: [[-4, 2, 0], [4, null, -1]], scale: 'diverging' })
    const fills = [...host.querySelectorAll('rect')].map(r => r.getAttribute('fill'))
    expect(fills[0]).not.toBe(fills[1])
    expect(host.querySelector('.diui-colorbar')?.textContent).toMatch(/^-4.*4/)
  })
  it('validates matrix shape, cell values and bounds', () => {
    expect(validateProps('Heatmap', HEAT)).toEqual([])
    expect(validateProps('Heatmap', { ...HEAT, values: [[1, 2, 3]] }).join()).toContain('has 1 rows')
    expect(validateProps('Heatmap', { ...HEAT, values: [[1, 2], [3, 4, 5]] }).join()).toContain('has 2 values')
    expect(validateProps('Heatmap', { ...HEAT, values: [[1, 'x', 3], [1, 2, 3]] }).join()).toContain('finite number or null')
    expect(validateProps('Heatmap', { ...HEAT, min: 5, max: 1 }).join()).toContain('min must be less than max')
  })
})
