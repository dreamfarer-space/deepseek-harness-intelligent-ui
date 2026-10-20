import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatNumber, niceTicks, PALETTE, useLayoutWidth } from './Chart.tsx'

const W = 640
const PAD = { top: 12, right: 16, bottom: 44, left: 56 }

type Num = number | null | undefined
export interface ScatterPoint { x: Num; y: Num; label?: string }
export interface ScatterSeries { name: string; points: readonly ScatterPoint[] }
export interface ScatterProps {
  series: readonly ScatterSeries[]
  title?: string
  xLabel?: string
  yLabel?: string
  xUnit?: string
  yUnit?: string
  height?: number
  emptyText: string
  missingText: (n: number) => string
}

interface Placed { s: number; p: number; x: number; y: number; label?: string }

const finite = (v: Num): v is number => typeof v === 'number' && Number.isFinite(v)
const withUnit = (v: number, unit?: string) => `${formatNumber(v)}${unit ? ` ${unit}` : ''}`

/** Continuous x/y scatter. Points without both coordinates are left out and counted. */
export function Scatter(props: ScatterProps) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set())
  const [active, setActive] = useState<number | undefined>(undefined)
  const all = useMemo(() => {
    const out: Placed[] = []
    let missing = 0
    props.series.forEach((s, si) => s.points.forEach((pt, pi) => {
      if (finite(pt.x) && finite(pt.y)) out.push({ s: si, p: pi, x: pt.x, y: pt.y, label: pt.label })
      else missing++
    }))
    return { points: out, missing }
  }, [props.series])
  const shown = useMemo(() => all.points.filter(p => !hidden.has(p.s)).sort((a, b) => a.x - b.x || a.y - b.y), [all, hidden])
  const stage = useRef<HTMLDivElement>(null)
  const W = useLayoutWidth(stage)
  if (all.points.length === 0) return <div className="diui-empty">{props.emptyText}</div>
  const H = props.height ?? 300
  const xs = all.points.map(p => p.x)
  const ys = all.points.map(p => p.y)
  const xt = niceTicks(Math.min(...xs), Math.max(...xs), W < 420 ? 3 : 5)
  const yt = niceTicks(Math.min(...ys), Math.max(...ys), H < 220 ? 3 : 5)
  const [x0, x1, y0, y1] = [xt[0]!, xt.at(-1)!, yt[0]!, yt.at(-1)!]
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const sx = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * iw
  const sy = (v: number) => PAD.top + ih - ((v - y0) / (y1 - y0)) * ih
  const cur = active !== undefined ? shown[Math.min(active, shown.length - 1)] : undefined
  const r = shown.length > 500 ? 2.5 : 4
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    const vx = ((e.clientX - box.left) / box.width) * W
    const vy = ((e.clientY - box.top) / box.height) * H
    let best = -1
    let dist = 24 * 24
    shown.forEach((p, i) => {
      const d = (sx(p.x) - vx) ** 2 + (sy(p.y) - vy) ** 2
      if (d < dist) { dist = d; best = i }
    })
    setActive(best >= 0 ? best : undefined)
  }
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!shown.length) return
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(shown.length - 1)
    else if (e.key === 'Escape') setActive(undefined)
    else if (step) setActive(a => a === undefined ? 0 : (a + step + shown.length) % shown.length)
    else return
    e.preventDefault()
  }
  const name = (p: Placed) => props.series[p.s]!.name
  return (
    <figure className="diui-chart">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      <div className="diui-plot-stage" ref={stage}>
        <svg
          className="diui-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0}
          aria-label={`${props.title ?? 'scatter'}: ${shown.length} points`}
          onPointerMove={pick} onPointerDown={pick} onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(undefined) }}
          onKeyDown={key} onBlur={() => setActive(undefined)}
        >
          {yt.map(t => (
            <g key={`y${t}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'diui-axis-zero' : 'diui-grid'} />
              <text x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="diui-tick">{formatNumber(t)}</text>
            </g>
          ))}
          {xt.map(t => (
            <g key={`x${t}`}>
              <line x1={sx(t)} x2={sx(t)} y1={PAD.top} y2={PAD.top + ih} className={t === 0 ? 'diui-axis-zero' : 'diui-grid'} />
              <text x={sx(t)} y={PAD.top + ih + 16} textAnchor="middle" className="diui-tick">{formatNumber(t)}</text>
            </g>
          ))}
          {(props.xLabel || props.xUnit) && <text x={PAD.left + iw / 2} y={H - 6} textAnchor="middle" className="diui-axis-label">{[props.xLabel, props.xUnit && `(${props.xUnit})`].filter(Boolean).join(' ')}</text>}
          {(props.yLabel || props.yUnit) && <text transform={`translate(12 ${PAD.top + ih / 2}) rotate(-90)`} textAnchor="middle" className="diui-axis-label">{[props.yLabel, props.yUnit && `(${props.yUnit})`].filter(Boolean).join(' ')}</text>}
          {shown.map((p, i) => (
            <circle key={`${p.s}-${p.p}`} cx={sx(p.x)} cy={sy(p.y)} r={i === active ? r + 2.5 : r} fill={PALETTE[p.s % PALETTE.length]} fillOpacity={0.75} stroke={i === active ? 'var(--ui-text)' : 'none'} />
          ))}
        </svg>
        {cur && (
          <div className="diui-tooltip" role="status" style={{ left: `${(sx(cur.x) / W) * 100}%`, top: `${(sy(cur.y) / H) * 100}%`, transform: 'translate(-50%, calc(-100% - 10px))' }}>
            {cur.label && <div className="diui-tooltip-head">{cur.label}</div>}
            <div><i style={{ background: PALETTE[cur.s % PALETTE.length] }} />{name(cur)}</div>
            <div>{props.xLabel ?? 'x'}: {withUnit(cur.x, props.xUnit)}</div>
            <div>{props.yLabel ?? 'y'}: {withUnit(cur.y, props.yUnit)}</div>
          </div>
        )}
      </div>
      {props.series.length > 1 && (
        <div className="diui-legend">
          {props.series.map((s, i) => (
            <button key={i} type="button" className="diui-legend-item" data-off={hidden.has(i) || undefined} aria-pressed={!hidden.has(i)}
              onClick={() => { setActive(undefined); setHidden(h => { const n = new Set(h); if (n.has(i)) n.delete(i); else n.add(i); return n }) }}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />{s.name}
            </button>
          ))}
        </div>
      )}
      {all.missing > 0 && <div className="diui-note">{props.missingText(all.missing)}</div>}
    </figure>
  )
}

export interface HeatmapProps {
  xLabels: readonly (string | number | boolean | null)[]
  yLabels: readonly (string | number | boolean | null)[]
  values: readonly (readonly Num[])[]
  title?: string
  unit?: string
  scale?: 'sequential' | 'diverging'
  min?: number
  max?: number
  showValues?: boolean
  emptyText: string
  noDataText: string
}

/** Category × category matrix. A missing cell (null) is drawn hatched and is never confused with 0. */
export function Heatmap(props: HeatmapProps) {
  const [active, setActive] = useState<{ r: number; c: number } | undefined>(undefined)
  const nx = props.xLabels.length
  const ny = props.yLabels.length
  const nums = props.values.flat().filter(finite)
  if (nx === 0 || ny === 0) return <div className="diui-empty">{props.emptyText}</div>
  const diverging = props.scale === 'diverging'
  const lo = props.min ?? (nums.length ? Math.min(...nums) : 0)
  const hi = props.max ?? (nums.length ? Math.max(...nums) : 1)
  const absMax = Math.max(Math.abs(lo), Math.abs(hi)) || 1
  const fillOf = (v: number) => {
    if (diverging) return { fill: v < 0 ? PALETTE[3]! : PALETTE[0]!, opacity: 0.08 + 0.92 * Math.min(1, Math.abs(v) / absMax) }
    const t = hi > lo ? (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) : 1
    return { fill: PALETTE[0]!, opacity: 0.08 + 0.92 * t }
  }
  const labelW = Math.min(150, 10 + Math.max(...props.yLabels.map(l => textWidth(truncate(String(l ?? ''), 18)))))
  const top = 8
  const cell = Math.max(10, Math.min(44, (W - labelW - 8) / nx))
  const rotate = nx > 8
  const bottom = rotate ? 14 + Math.min(70, Math.max(...props.xLabels.map(l => textWidth(truncate(String(l ?? ''), 12)))) * 0.65) : 26
  // The drawing keeps its natural width: a small matrix is not blown up on wide cards nor shrunk to unreadable text on phones.
  const VW = Math.ceil(labelW + cell * nx + (rotate ? 40 : 8))
  const H = Math.ceil(top + cell * ny + bottom)
  const showValues = props.showValues ?? nx * ny <= 120
  const cur = active && { ...active, v: props.values[active.r]?.[active.c] }
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key]
    if (e.key === 'Escape') { setActive(undefined); return }
    if (!d) return
    e.preventDefault()
    setActive(a => a ? { r: Math.min(ny - 1, Math.max(0, a.r + d[0]!)), c: Math.min(nx - 1, Math.max(0, a.c + d[1]!)) } : { r: 0, c: 0 })
  }
  const label = (l: unknown) => String(l ?? '')
  const value = (v: Num) => finite(v) ? `${formatNumber(v)}${props.unit ? ` ${props.unit}` : ''}` : props.noDataText
  return (
    <figure className="diui-chart">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      <div className="diui-plot-stage" style={{ maxWidth: VW }}>
        <svg className="diui-chart-svg" viewBox={`0 0 ${VW} ${H}`} role="img" tabIndex={0}
          aria-label={`${props.title ?? 'heatmap'}: ${ny} × ${nx}`} onKeyDown={key} onBlur={() => setActive(undefined)}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(undefined) }}>
          <defs>
            <pattern id="diui-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ui-muted)" strokeWidth="1.5" opacity="0.6" />
            </pattern>
          </defs>
          {props.yLabels.map((l, r) => <text key={`y${r}`} x={labelW - 6} y={top + cell * r + cell / 2} dy="0.32em" textAnchor="end" className="diui-tick">{truncate(label(l), 18)}</text>)}
          {props.xLabels.map((l, c) => (
            <text key={`x${c}`} transform={`translate(${labelW + cell * c + cell / 2} ${top + cell * ny + 10}) rotate(${rotate ? 40 : 0})`} textAnchor={rotate ? 'start' : 'middle'} dy="0.7em" className="diui-tick">{truncate(label(l), 12)}</text>
          ))}
          {props.yLabels.map((_, r) => props.xLabels.map((__, c) => {
            const v = props.values[r]?.[c]
            const on = active?.r === r && active.c === c
            const f = finite(v) ? fillOf(v) : undefined
            return (
              <g key={`${r}-${c}`} onPointerMove={() => setActive({ r, c })} onPointerDown={() => setActive({ r, c })}>
                <rect x={labelW + cell * c + 1} y={top + cell * r + 1} width={cell - 2} height={cell - 2} rx={2}
                  fill={f ? f.fill : 'url(#diui-hatch)'} fillOpacity={f ? f.opacity : 1}
                  stroke={on ? 'var(--ui-text)' : 'none'} strokeWidth={2} />
                {showValues && finite(v) && cell >= 22 && (
                  <text x={labelW + cell * c + cell / 2} y={top + cell * r + cell / 2} dy="0.32em" textAnchor="middle" className="diui-cell-value" data-strong={(f?.opacity ?? 0) > 0.6 || undefined}>{formatNumber(v)}</text>
                )}
              </g>
            )
          }))}
        </svg>
        {cur && (
          <div className="diui-tooltip" role="status" style={{ left: `${((labelW + cell * cur.c + cell / 2) / VW) * 100}%`, top: `${((top + cell * cur.r) / H) * 100}%`, transform: 'translate(-50%, calc(-100% - 4px))' }}>
            <div className="diui-tooltip-head">{label(props.yLabels[cur.r])} · {label(props.xLabels[cur.c])}</div>
            <div>{value(cur.v)}</div>
          </div>
        )}
      </div>
      <div className="diui-colorbar" aria-hidden="true">
        <span>{diverging ? formatNumber(-absMax) : formatNumber(lo)}</span>
        <i style={{ background: diverging
          ? `linear-gradient(90deg, ${PALETTE[3]}, transparent, ${PALETTE[0]})`
          : `linear-gradient(90deg, color-mix(in srgb, ${PALETTE[0]} 8%, transparent), ${PALETTE[0]})` }} />
        <span>{diverging ? formatNumber(absMax) : formatNumber(hi)}{props.unit ? ` ${props.unit}` : ''}</span>
        <span className="diui-colorbar-missing"><b />{props.noDataText}</span>
      </div>
    </figure>
  )
}

/** Approximate rendered width at 11px: CJK and other wide characters count double. */
function textWidth(s: string): number {
  let w = 0
  for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 11.5 : 6.6
  return w
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
