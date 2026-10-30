import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { MapTiles } from '../policy.ts'
import { useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'
import { PALETTE, useLayoutWidth } from './Chart.tsx'
import { Inline } from './inline.tsx'
import { worldLand } from './map-land.ts'

const TILE = 256
const MAX_LAT = 85.0511287798
/** Outline-only limit: deep enough to separate places within a city (the scale bar stays exact). */
const OUTLINE_MAX_ZOOM = 16
const EARTH_CIRCUMFERENCE = 40075016.686

export interface MapMarker { id: string; lat: number; lon: number; label: string; group?: string; note?: string }
export interface MapRoute { points: readonly (readonly number[])[]; label?: string; dashed?: boolean }
export interface GeoMapProps {
  markers?: readonly MapMarker[]
  routes?: readonly MapRoute[]
  title?: string
  center?: { lat: number; lon: number }
  zoom?: number
  height?: number
  selected?: string
  basemap?: 'auto' | 'outline'
  tiles: MapTiles | null
  callId?: string
  nodeId: string
  t: Translate
}

/** Map view in Web Mercator world units: x, y in [0, 1], z a (fractional) zoom level. */
interface View { x: number; y: number; z: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const wrap = (x: number) => x - Math.floor(x)

/** WGS84 degrees → Web Mercator world units. */
export function project(lon: number, lat: number): [number, number] {
  const s = Math.sin((clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180)
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]
}

/** Smallest longitude interval holding every x (in world units), across the antimeridian. */
function xSpan(xs: readonly number[]): [number, number] {
  const sorted = xs.map(wrap).sort((a, b) => a - b)
  let gap = -1
  let start = 0
  sorted.forEach((x, i) => {
    const next = i === sorted.length - 1 ? sorted[0]! + 1 : sorted[i + 1]!
    if (next - x > gap) { gap = next - x; start = (i + 1) % sorted.length }
  })
  const west = sorted[start]!
  return [west, west + 1 - gap]
}

/** Draw a route the short way round, never across the whole world. */
function unwrapRoute(points: readonly (readonly number[])[]): [number, number][] {
  const out: [number, number][] = []
  for (const [lat, lon] of points) {
    let [x, y] = project(lon!, lat!)
    const prev = out.at(-1)
    if (prev) x += Math.round(prev[0] - x)
    out.push([x, y])
  }
  return out
}

function niceDistance(maxMeters: number): number {
  const p = 10 ** Math.floor(Math.log10(maxMeters))
  return [5, 2, 1].map(m => m * p).find(d => d <= maxMeters) ?? p
}

/**
 * Interactive Web Mercator map drawn locally: an offline world outline (or the
 * Host's tile basemap) under SVG routes and markers. Pan by dragging or arrow
 * keys, zoom with the buttons, +/−, double-click or Ctrl+wheel; the page scroll
 * is never captured. View and selection persist with the call's UI state.
 */
export function GeoMap(props: GeoMapProps) {
  const { t } = props
  const markers = props.markers ?? []
  const routes = props.routes ?? []
  const box = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const W = useLayoutWidth(box, 1600, 240)
  const H = props.height ?? 360
  const tiles = props.basemap === 'outline' ? null : props.tiles
  const [tileState, setTileState] = useState({ loaded: 0, failed: 0, url: '' })
  const tilesFailed = !!tiles && tileState.url === tiles.url && tileState.failed >= 4 && tileState.loaded === 0
  const active = tiles && !tilesFailed ? tiles : null
  const useTiles = !!active
  const maxZoom = active ? active.maxZoom : OUTLINE_MAX_ZOOM
  const minZoom = Math.max(0, Math.log2(H / TILE))

  const groups = useMemo(() => [...new Set(markers.map(m => m.group).filter((g): g is string => !!g))], [markers])
  const colorOf = (m: MapMarker) => m.group ? PALETTE[groups.indexOf(m.group) % PALETTE.length]! : PALETTE[0]!
  const [hiddenGroups, setHiddenGroups] = useState<ReadonlySet<string>>(new Set())
  const [selectedId, setSelected] = useUiState<string>(props.callId, `map:${props.nodeId}:selected`, props.selected ?? '')
  const selected = markers.find(m => m.id === selectedId)

  const fit = (): View => {
    if (props.center) {
      const [x, y] = project(props.center.lon, props.center.lat)
      return { x, y, z: clamp(props.zoom ?? 4, minZoom, maxZoom) }
    }
    const pts = [...markers.map(m => project(m.lon, m.lat)), ...routes.flatMap(r => unwrapRoute(r.points))]
    if (!pts.length) return { x: 0.5, y: 0.5, z: minZoom }
    const [x0, x1] = xSpan(pts.map(p => p[0]))
    const ys = pts.map(p => p[1])
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
    const pad = 48
    const fitZoom = Math.log2(Math.min((W - pad * 2) / Math.max((x1 - x0) * TILE, 1e-9), (H - pad * 2) / Math.max((y1 - y0) * TILE, 1e-9)))
    // One place (or several on the same spot): a neighbourhood with tiles, a region on the outline.
    const auto = x1 - x0 < 1e-7 && y1 - y0 < 1e-7 ? (useTiles ? 13 : 5) : fitZoom
    return { x: wrap((x0 + x1) / 2), y: (y0 + y1) / 2, z: clamp(props.zoom ?? auto, minZoom, maxZoom) }
  }
  const [stored, setStored] = useUiState<View | null>(props.callId, `map:${props.nodeId}:view`, null)
  const [live, setLive] = useState<View | null>(null)
  const raw = live ?? stored ?? fit()
  const z = clamp(raw.z, minZoom, maxZoom)
  const scale = TILE * 2 ** z
  const halfY = H / 2 / scale
  const view: View = { x: wrap(raw.x), y: halfY >= 0.5 ? 0.5 : clamp(raw.y, halfY, 1 - halfY), z }
  const commit = (next: View) => { setLive(null); setStored({ x: wrap(next.x), y: next.y, z: clamp(next.z, minZoom, maxZoom) }) }

  /** Screen position of a world point on the copy of the world nearest the centre. */
  const toScreen = (x: number, y: number): [number, number] =>
    [W / 2 + (x - view.x + Math.round(view.x - x)) * scale, H / 2 + (y - view.y) * scale]

  const zoomAt = (delta: number, px = W / 2, py = H / 2) => {
    const nz = clamp(view.z + delta, minZoom, maxZoom)
    const wx = view.x + (px - W / 2) / scale
    const wy = view.y + (py - H / 2) / scale
    const ns = TILE * 2 ** nz
    commit({ x: wx - (px - W / 2) / ns, y: wy - (py - H / 2) / ns, z: nz })
  }
  const pan = (dx: number, dy: number) => commit({ x: view.x + dx / scale, y: view.y + dy / scale, z: view.z })

  // React registers wheel listeners as passive; Ctrl/⌘+wheel must preventDefault to zoom the map instead of the page.
  const latest = useRef({ zoomAt })
  latest.current = { zoomAt }
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      latest.current.zoomAt(e.deltaY < 0 ? 0.5 : -0.5, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const drag = useRef<{ id: number; sx: number; sy: number; from: View; moved: boolean } | null>(null)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button,a,[data-marker]')) return
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, from: view, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    d.moved = true
    setLive({ x: d.from.x - dx / scale, y: d.from.y - dy / scale, z: d.from.z })
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved) commit(view)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 80
    switch (e.key) {
      case 'ArrowLeft': pan(-step, 0); break
      case 'ArrowRight': pan(step, 0); break
      case 'ArrowUp': pan(0, -step); break
      case 'ArrowDown': pan(0, step); break
      case '+': case '=': zoomAt(1); break
      case '-': case '_': zoomAt(-1); break
      case '0': case 'Home': commit(fit()); break
      case 'Escape': if (!selectedId) return; setSelected(''); break
      default: return
    }
    e.preventDefault()
  }
  /** Selecting a place centres it, so zooming afterwards stays on it; selecting it again clears. */
  const choose = (m: MapMarker) => {
    setSelected(m.id === selectedId ? '' : m.id)
    if (m.id === selectedId) return
    const [x, y] = project(m.lon, m.lat)
    commit({ x, y, z: view.z })
  }

  // Land outline in pixels at this zoom, drawn once per world copy on screen.
  const landPath = useMemo(() => {
    if (useTiles) return ''
    const s = TILE * 2 ** z
    return worldLand().map(ring => ring.map(([lon, lat], i) => {
      const [x, y] = project(lon, lat)
      return `${i ? 'L' : 'M'}${(x * s).toFixed(1)} ${(y * s).toFixed(1)}`
    }).join('') + 'Z').join('')
  }, [useTiles, z])
  const graticule = useMemo(() => {
    if (useTiles) return ''
    const s = TILE * 2 ** z
    const parts: string[] = []
    for (let lon = -180; lon <= 180; lon += 30) parts.push(`M${(((lon + 180) / 360) * s).toFixed(1)} 0V${s.toFixed(1)}`)
    for (let lat = -60; lat <= 60; lat += 30) parts.push(`M0 ${(project(0, lat)[1] * s).toFixed(1)}H${s.toFixed(1)}`)
    return parts.join('')
  }, [useTiles, z])
  const copies: number[] = []
  for (let k = Math.floor(view.x - W / 2 / scale); k <= Math.ceil(view.x + W / 2 / scale); k++) copies.push(k)

  const tileImgs: ReactNode[] = []
  if (active) {
    const url = active.url
    const tz = clamp(Math.round(z), 0, active.maxZoom)
    const n = 2 ** tz
    const ts = TILE * 2 ** (z - tz)
    const left = view.x * scale - W / 2
    const top = view.y * scale - H / 2
    for (let i = Math.floor(left / ts); i <= Math.floor((left + W) / ts); i++) {
      for (let j = Math.max(0, Math.floor(top / ts)); j <= Math.min(n - 1, Math.floor((top + H) / ts)); j++) {
        const tx = ((i % n) + n) % n
        const src = url.replace('{z}', String(tz)).replace('{x}', String(tx)).replace('{y}', String(j))
        tileImgs.push(<img key={`${tz}/${i}/${j}`} className="diui-map-tile" src={src} alt="" draggable={false} decoding="async"
          style={{ left: Math.round(i * ts - left), top: Math.round(j * ts - top), width: Math.ceil(ts) + 1, height: Math.ceil(ts) + 1 }}
          onLoad={() => setTileState(s => ({ url, loaded: (s.url === url ? s.loaded : 0) + 1, failed: s.url === url ? s.failed : 0 }))}
          onError={() => setTileState(s => ({ url, loaded: s.url === url ? s.loaded : 0, failed: (s.url === url ? s.failed : 0) + 1 }))} />)
      }
    }
  }

  const visible = markers.filter(m => !m.group || !hiddenGroups.has(m.group))
  const showLabels = visible.length <= 15
  const metersPerPx = (EARTH_CIRCUMFERENCE * Math.cos(Math.atan(Math.sinh(Math.PI * (1 - 2 * view.y))))) / scale
  const bar = niceDistance(metersPerPx * 96)
  const barPx = bar / metersPerPx
  const attribution = active ? (active.attribution || new URL(active.url).host) : t('map.outline')

  return (
    <figure className="diui-map" ref={box}>
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      <div
        ref={stage}
        className="diui-map-stage"
        style={{ height: H }}
        tabIndex={0}
        role="group"
        aria-roledescription="map"
        aria-label={props.title ? t('map.label', { title: props.title }) : t('map.untitled')}
        aria-describedby={`${props.nodeId}-map-hint`}
        data-basemap={useTiles ? 'tiles' : 'outline'}
        data-dragging={live ? '' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={e => {
          if ((e.target as Element).closest('button,a,[data-marker]')) return
          const r = e.currentTarget.getBoundingClientRect()
          zoomAt(1, e.clientX - r.left, e.clientY - r.top)
        }}
        onKeyDown={onKey}
      >
        {!useTiles && (
          <svg className="diui-map-base" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            {copies.map(k => (
              <g key={k} transform={`translate(${(W / 2 + (k - view.x) * scale).toFixed(1)} ${(H / 2 - view.y * scale).toFixed(1)})`}>
                <path className="diui-map-graticule" d={graticule} />
                <path className="diui-map-land" d={landPath} />
              </g>
            ))}
          </svg>
        )}
        {useTiles && <div className="diui-map-tiles" aria-hidden="true">{tileImgs}</div>}
        <svg className="diui-map-overlay" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {routes.map((r, i) => {
            const pts = unwrapRoute(r.points)
            const mean = pts.reduce((a, p) => a + p[0], 0) / pts.length
            const shift = Math.round(view.x - mean)
            const d = pts.map(([x, y], j) => `${j ? 'L' : 'M'}${(W / 2 + (x + shift - view.x) * scale).toFixed(1)} ${(H / 2 + (y - view.y) * scale).toFixed(1)}`).join('')
            return (
              <g key={i}>
                <path className="diui-map-route-halo" d={d} />
                <path className="diui-map-route" d={d} data-dashed={r.dashed ? '' : undefined} style={{ stroke: PALETTE[(Math.max(groups.length, 1) + i) % PALETTE.length] }}>
                  {r.label && <title>{r.label}</title>}
                </path>
              </g>
            )
          })}
          {visible.map(m => {
            const [sx, sy] = toScreen(...project(m.lon, m.lat))
            if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return null
            const on = m.id === selectedId
            return (
              <g key={m.id} data-marker={m.id} className="diui-map-marker" data-selected={on ? '' : undefined} onClick={() => choose(m)}>
                <circle cx={sx} cy={sy} r={on ? 8 : 6} style={{ fill: colorOf(m) }} />
                {(showLabels || on) && <text x={sx + 10} y={sy + 4}>{m.label}</text>}
                <title>{m.label}</title>
              </g>
            )
          })}
        </svg>
        <div className="diui-map-controls">
          <button type="button" className="diui-map-button" aria-label={t('map.zoomIn')} title={t('map.zoomIn')} disabled={view.z >= maxZoom} onClick={() => zoomAt(1)}>+</button>
          <button type="button" className="diui-map-button" aria-label={t('map.zoomOut')} title={t('map.zoomOut')} disabled={view.z <= minZoom} onClick={() => zoomAt(-1)}>−</button>
          <button type="button" className="diui-map-button" aria-label={t('map.reset')} title={t('map.reset')} onClick={() => commit(fit())}>⌂</button>
        </div>
        <div className="diui-map-scale" aria-hidden="true"><span style={{ width: Math.round(barPx) }} />{bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</div>
        <div className="diui-map-attrib">{attribution}</div>
      </div>
      <p className="diui-map-hint" id={`${props.nodeId}-map-hint`}>{t('map.hint')}</p>
      {tilesFailed && <p className="diui-map-notice" role="status">{t('map.tilesFailed')}</p>}
      {groups.length > 0 && (
        <div className="diui-legend">
          {groups.map((g, i) => (
            <button key={g} type="button" className="diui-legend-item" aria-pressed={!hiddenGroups.has(g)} data-off={hiddenGroups.has(g) ? '' : undefined} onClick={() => setHiddenGroups(h => {
              const next = new Set(h)
              if (!next.delete(g)) next.add(g)
              return next
            })}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />{g}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="diui-map-detail" role="status">
          <strong>{selected.label}</strong>
          {selected.group && <span className="diui-badge">{selected.group}</span>}
          <span className="diui-map-coords">{formatCoord(selected.lat, 'N', 'S')}, {formatCoord(selected.lon, 'E', 'W')}</span>
          {selected.note && <div><Inline text={selected.note} /></div>}
        </div>
      )}
      {markers.length > 0 && (
        <ul className="diui-map-list" aria-label={t('map.markers')}>
          {visible.map(m => (
            <li key={m.id}>
              <button type="button" className="diui-map-item" aria-pressed={m.id === selectedId} onClick={() => choose(m)}>
                <i style={{ background: colorOf(m) }} />{m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

function formatCoord(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`
}
