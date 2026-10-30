// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { project } from '../client-src/catalog/GeoMap.tsx'
import { worldLand } from '../client-src/catalog/map-land.ts'
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
afterEach(() => { act(() => root.unmount()); host.remove() })

const TILES = { url: 'https://tiles.example/{z}/{x}/{y}.png', attribution: '© Example tiles', maxZoom: 18 }

function show(props: Record<string, unknown>, policy?: Record<string, unknown>, callId = 'm1') {
  const args = { root: 'n', components: [{ id: 'n', type: 'Map', props }] }
  act(() => root.render(<RenderView callId={callId} toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
    block={{ kind: 'tool-result', callId, call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true, ...(policy ? { policy } : {}) } }} />))
}
const stage = () => host.querySelector<HTMLDivElement>('.diui-map-stage')!
const marker = (id: string) => host.querySelector<SVGGElement>(`[data-marker="${id}"]`)
const cx = (id: string) => Number(marker(id)!.querySelector('circle')!.getAttribute('cx'))
const press = (k: string) => act(() => { stage().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
const click = (el: Element) => act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })

const KYOTO = {
  title: 'Kyoto day trip',
  markers: [
    { id: 'inari', lat: 34.9671, lon: 135.7727, label: 'Fushimi Inari', group: 'Morning', note: 'Go **early**' },
    { id: 'kiyo', lat: 34.9949, lon: 135.785, label: 'Kiyomizu-dera', group: 'Morning' },
    { id: 'arashi', lat: 35.0094, lon: 135.6668, label: 'Arashiyama', group: 'Afternoon' },
  ],
  routes: [{ label: 'Itinerary sketch', dashed: true, points: [[34.9671, 135.7727], [34.9949, 135.785], [35.0094, 135.6668]] }],
}

describe('Map validation', () => {
  it('accepts markers and [lat, lon] routes', () => {
    expect(validateProps('Map', KYOTO)).toEqual([])
    expect(validateProps('Map', { routes: [{ points: [[0, 0], [10, 10]] }] })).toEqual([])
  })

  it('rejects out-of-range, swapped and malformed coordinates with a hint', () => {
    expect(validateProps('Map', { markers: [{ id: 'a', lat: 135.7, lon: 34.9, label: 'x' }] }).join()).toMatch(/lat: must be <= 90/)
    expect(validateProps('Map', { routes: [{ points: [[135.7, 34.9], [1, 2]] }] }).join()).toMatch(/not \[lon, lat\]/)
    expect(validateProps('Map', { routes: [{ points: [[1, 2]] }] }).join()).toMatch(/at least 2 points/)
    expect(validateProps('Map', { routes: [{ points: [[1, 2, 3], [1, 2]] }] }).join()).toMatch(/expected \[lat, lon\]/)
    expect(validateProps('Map', { markers: [{ id: 'a', lat: Number.NaN, lon: 0, label: 'x' }] }).join()).toMatch(/finite number/)
  })

  it('needs content, unique ids and a real selection', () => {
    expect(validateProps('Map', {}).join()).toMatch(/at least one marker or route/)
    const dup = { markers: [{ id: 'a', lat: 0, lon: 0, label: 'x' }, { id: 'a', lat: 1, lon: 1, label: 'y' }] }
    expect(validateProps('Map', dup).join()).toMatch(/duplicate marker id/)
    expect(validateProps('Map', { ...KYOTO, selected: 'nope' }).join()).toMatch(/selected: must reference a marker id/)
    expect(validateProps('Map', { ...KYOTO, basemap: 'satellite' }).join()).toMatch(/basemap/)
  })
})

describe('Map rendering', () => {
  it('ships an offline world outline', () => {
    const land = worldLand()
    expect(land.length).toBeGreaterThan(100)
    for (const ring of land) for (const [lon, lat] of ring) {
      expect(Math.abs(lon)).toBeLessThanOrEqual(180)
      expect(Math.abs(lat)).toBeLessThanOrEqual(90)
    }
    expect(project(0, 0)).toEqual([0.5, 0.5])
  })

  it('draws the offline outline, markers, a dashed route, legend and place list without network', () => {
    show(KYOTO)
    expect(stage().dataset.basemap).toBe('outline')
    expect(host.querySelector('.diui-map-land')!.getAttribute('d')!.length).toBeGreaterThan(1000)
    expect(host.querySelectorAll('img').length).toBe(0)
    expect(host.querySelector('.diui-map-attrib')!.textContent).toBe(en['map.outline'])
    expect(host.querySelectorAll('.diui-map-marker')).toHaveLength(3)
    expect(host.querySelector('.diui-map-route')!.hasAttribute('data-dashed')).toBe(true)
    expect([...host.querySelectorAll('.diui-legend-item')].map(b => b.textContent)).toEqual(['Morning', 'Afternoon'])
    expect([...host.querySelectorAll('.diui-map-item')].map(b => b.textContent)).toEqual(['Fushimi Inari', 'Kiyomizu-dera', 'Arashiyama'])
    expect(stage().getAttribute('aria-label')).toBe('Map: Kyoto day trip')
    // Fitted around the data: every marker lands inside the frame.
    for (const id of ['inari', 'kiyo', 'arashi']) expect(cx(id)).toBeGreaterThan(0)
  })

  it('selects a place from the list or the marker and remembers it across remounts', () => {
    show(KYOTO)
    click(host.querySelectorAll('.diui-map-item')[0]!)
    const detail = host.querySelector('.diui-map-detail')!
    expect(detail.textContent).toContain('Fushimi Inari')
    expect(detail.textContent).toContain('34.9671°N, 135.7727°E')
    expect(detail.querySelector('strong + span')!.textContent).toBe('Morning')
    expect(detail.innerHTML).toContain('<strong>early</strong>')
    expect(marker('inari')!.hasAttribute('data-selected')).toBe(true)
    const width = Number(host.querySelector('.diui-map-overlay')!.getAttribute('width'))
    expect(cx('inari')).toBeCloseTo(width / 2, 0)
    click(host.querySelector('[aria-label="Zoom in"]')!)
    expect(cx('inari')).toBeCloseTo(width / 2, 0)
    act(() => root.unmount())
    root = createRoot(host)
    show(KYOTO)
    expect(host.querySelector('.diui-map-detail')!.textContent).toContain('Fushimi Inari')
    press('Escape')
    expect(host.querySelector('.diui-map-detail')).toBeNull()
    press('0')
    click(marker('arashi')!)
    expect(host.querySelector('.diui-map-detail')!.textContent).toContain('Arashiyama')
  })

  it('zooms with buttons and keys and pans with arrow keys', () => {
    show(KYOTO)
    const spread = () => cx('kiyo') - cx('arashi')
    const before = spread()
    click(host.querySelector('[aria-label="Zoom out"]')!)
    expect(spread()).toBeCloseTo(before / 2, 0)
    press('+')
    expect(spread()).toBeCloseTo(before, 0)
    const x = cx('inari')
    press('ArrowRight')
    expect(cx('inari')).toBeCloseTo(x - 80, 0)
    press('0')
    expect(spread()).toBeCloseTo(before, 0)
  })

  it('hides a group from the legend', () => {
    show(KYOTO)
    click(host.querySelectorAll('.diui-legend-item')[0]!)
    expect(marker('inari')).toBeNull()
    expect(marker('arashi')).not.toBeNull()
  })

  it('fits places across the antimeridian the short way round', () => {
    show({ markers: [{ id: 'w', lat: -17, lon: 179, label: 'Fiji W' }, { id: 'e', lat: -17, lon: -179, label: 'Fiji E' }] })
    const width = Number(host.querySelector('.diui-map-overlay')!.getAttribute('width'))
    // Centred on 180°: west of the line on the left, east on the right, both in frame.
    expect(cx('w')).toBeGreaterThan(0)
    expect(cx('w')).toBeLessThan(width / 2)
    expect(cx('e')).toBeGreaterThan(width / 2)
    expect(cx('e')).toBeLessThan(width)
    expect((cx('w') + cx('e')) / 2).toBeCloseTo(width / 2, 0)
  })

  it('uses the Host tile provider with attribution and falls back to the outline when tiles fail', () => {
    show(KYOTO, { mapTiles: TILES })
    expect(stage().dataset.basemap).toBe('tiles')
    const imgs = [...host.querySelectorAll<HTMLImageElement>('img.diui-map-tile')]
    expect(imgs.length).toBeGreaterThan(0)
    for (const img of imgs) expect(img.getAttribute('src')).toMatch(/^https:\/\/tiles\.example\/\d+\/\d+\/\d+\.png$/)
    expect(host.querySelector('.diui-map-attrib')!.textContent).toBe('© Example tiles')
    act(() => { for (const img of imgs.slice(0, 4)) img.dispatchEvent(new Event('error')) })
    expect(stage().dataset.basemap).toBe('outline')
    expect(host.querySelector('.diui-map-notice')!.textContent).toBe(en['map.tilesFailed'])
  })

  it('keeps tiles once any tile loaded, and basemap "outline" never requests tiles', () => {
    show(KYOTO, { mapTiles: TILES })
    const imgs = [...host.querySelectorAll<HTMLImageElement>('img.diui-map-tile')]
    act(() => { imgs[0]!.dispatchEvent(new Event('load')); for (const img of imgs.slice(1, 6)) img.dispatchEvent(new Event('error')) })
    expect(stage().dataset.basemap).toBe('tiles')
    act(() => root.unmount())
    root = createRoot(host)
    show({ ...KYOTO, basemap: 'outline' }, { mapTiles: TILES }, 'm2')
    expect(host.querySelectorAll('img').length).toBe(0)
  })

  it('ignores an unsafe tile template from replayed metadata', () => {
    show(KYOTO, { mapTiles: { url: 'http://tiles.example/{z}/{x}/{y}.png', attribution: '', maxZoom: 18 } })
    expect(stage().dataset.basemap).toBe('outline')
  })
})
