import { useId, useMemo, useState, type PointerEvent } from 'react'
import { compileExpression } from '../../src/catalog/expr.js'
import { useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'
import { formatNumber, niceTicks, PALETTE } from './Chart.tsx'

export interface PlotParam { name: string; label?: string; min: number; max: number; step?: number; value: number }
export interface PlotProps {
  functions: readonly { expr: string; label?: string }[]
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  params?: readonly PlotParam[]
  title?: string
  xLabel?: string
  yLabel?: string
  height?: number
}

const W = 640
const PAD = { top: 12, right: 16, bottom: 34, left: 48 }
const SAMPLES = 480

type Fn = (scope: Record<string, number>) => number

/**
 * Sample one function over [x0, x1].
 * @returns points with `y = NaN` where the function is undefined.
 */
export function sample(fn: Fn, x0: number, x1: number, scope: Record<string, number>, n = SAMPLES): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  const s = { ...scope }
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    s.x = x
    let y: number
    try { y = fn(s) } catch { y = NaN }
    pts.push({ x, y: Number.isFinite(y) ? y : NaN })
  }
  return pts
}

/** A y-range that ignores asymptote spikes: 2nd–98th percentile, padded. */
export function autoRange(values: readonly number[]): [number, number] {
  const ys = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (ys.length === 0) return [-1, 1]
  let lo = ys[Math.floor(ys.length * 0.02)]!
  let hi = ys[Math.max(0, Math.ceil(ys.length * 0.98) - 1)]!
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.08
  return [lo - pad, hi + pad]
}

/** SVG path for sampled points, broken at gaps and off-scale jumps (asymptotes). */
export function plotPath(pts: readonly { x: number; y: number }[], sx: (x: number) => number, sy: (y: number) => number, y0: number, y1: number): string {
  const span = y1 - y0
  let d = ''
  let pen = false
  let prev: number | undefined
  for (const p of pts) {
    const out = !Number.isFinite(p.y) || p.y < y0 - span * 4 || p.y > y1 + span * 4
    const jump = prev !== undefined && Number.isFinite(p.y) && Math.abs(p.y - prev) > span * 3
    if (out || jump) { pen = false; prev = Number.isFinite(p.y) ? p.y : undefined; if (out) continue }
    const yc = Math.max(y0 - span, Math.min(y1 + span, p.y))
    d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(yc).toFixed(1)}`
    pen = true
    prev = p.y
  }
  return d
}

export function Plot(props: PlotProps & { callId?: string; nodeId: string; t: Translate }) {
  const params = props.params ?? []
  const defaults = useMemo(() => Object.fromEntries(params.map(p => [p.name, p.value])), [params])
  const [values, setValues] = useUiState<Record<string, number>>(props.callId, `${props.nodeId}:params`, defaults)
  const scope = useMemo(() => ({ ...defaults, ...values }), [defaults, values])
  const [hover, setHover] = useState<number | undefined>(undefined)
  const uid = useId()
  const names = params.map(p => p.name)
  const compiled = useMemo(() => props.functions.map((f) => {
    try { return { fn: compileExpression(f.expr, ['x', ...names]) as Fn } } catch (err) { return { error: err instanceof Error ? err.message : String(err) } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [props.functions, names.join(',')])

  const x0 = props.xMin ?? -10
  const x1 = props.xMax ?? 10
  const H = props.height ?? 300
  const series = compiled.map(c => ('fn' in c && c.fn ? sample(c.fn, x0, x1, scope) : []))
  const auto = autoRange(series.flatMap(s => s.map(p => p.y)))
  const y0 = props.yMin ?? auto[0]
  const y1 = props.yMax ?? auto[1]
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * iw
  const sy = (y: number) => PAD.top + ih - ((y - y0) / (y1 - y0)) * ih
  const xt = niceTicks(x0, x1, 8).filter(v => v >= x0 && v <= x1)
  const yt = niceTicks(y0, y1, 5).filter(v => v >= y0 && v <= y1)
  const label = (i: number) => props.functions[i]?.label || `y = ${props.functions[i]?.expr ?? ''}`

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0) return
    const vx = ((e.clientX - r.left) / r.width) * W
    const x = x0 + ((vx - PAD.left) / iw) * (x1 - x0)
    setHover(x >= x0 && x <= x1 ? x : undefined)
  }
  const at = (fnIndex: number, x: number) => {
    const c = compiled[fnIndex]
    if (!c || !('fn' in c) || !c.fn) return NaN
    try { return c.fn({ ...scope, x }) } catch { return NaN }
  }

  return (
    <figure className="diui-plot">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      <div className="diui-plot-stage">
        <svg
          className="diui-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={props.title ?? props.functions.map((_, i) => label(i)).join(', ')}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(undefined)}
        >
          {yt.map(v => (
            <g key={`y${v}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} className={v === 0 ? 'diui-axis-zero' : 'diui-grid'} />
              <text x={PAD.left - 6} y={sy(v)} dy="0.32em" textAnchor="end" className="diui-tick">{formatNumber(v)}</text>
            </g>
          ))}
          {xt.map(v => (
            <g key={`x${v}`}>
              <line y1={PAD.top} y2={H - PAD.bottom} x1={sx(v)} x2={sx(v)} className={v === 0 ? 'diui-axis-zero' : 'diui-grid'} />
              <text x={sx(v)} y={H - PAD.bottom + 16} textAnchor="middle" className="diui-tick">{formatNumber(v)}</text>
            </g>
          ))}
          {props.xLabel && <text x={W - PAD.right} y={H - 4} textAnchor="end" className="diui-tick">{props.xLabel}</text>}
          {props.yLabel && <text x={PAD.left} y={PAD.top - 2} className="diui-tick">{props.yLabel}</text>}
          <clipPath id={`${uid}-clip`}><rect x={PAD.left} y={PAD.top} width={iw} height={ih} /></clipPath>
          <g clipPath={`url(#${uid}-clip)`}>
            {series.map((pts, i) => (
              <path key={i} d={plotPath(pts, sx, sy, y0, y1)} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {hover !== undefined && (
              <>
                <line x1={sx(hover)} x2={sx(hover)} y1={PAD.top} y2={H - PAD.bottom} className="diui-crosshair" />
                {series.map((_, i) => {
                  const y = at(i, hover)
                  return Number.isFinite(y) && y >= y0 && y <= y1
                    ? <circle key={i} cx={sx(hover)} cy={sy(y)} r={4} fill={PALETTE[i % PALETTE.length]} className="diui-hover-dot" />
                    : null
                })}
              </>
            )}
          </g>
        </svg>
        {hover !== undefined && (
          <div className="diui-tooltip" style={{ left: `${(sx(hover) / W) * 100}%` }}>
            <div>x = {formatNumber(hover)}</div>
            {compiled.map((_, i) => {
              const y = at(i, hover)
              return <div key={i}><i style={{ background: PALETTE[i % PALETTE.length] }} />{Number.isFinite(y) ? formatNumber(y) : '—'}</div>
            })}
          </div>
        )}
      </div>
      <div className="diui-legend">
        {props.functions.map((_, i) => {
          const c = compiled[i]
          return (
            <span key={i} className="diui-legend-item" data-error={c && 'error' in c ? true : undefined} title={c && 'error' in c ? c.error : undefined}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />{label(i)}
            </span>
          )
        })}
      </div>
      {params.length > 0 && (
        <div className="diui-params">
          {params.map((p) => {
            const id = `${uid}-${p.name}`
            const v = scope[p.name] ?? p.value
            return (
              <label key={p.name} className="diui-param" htmlFor={id}>
                <span className="diui-param-name">{p.label ?? p.name}</span>
                <input
                  id={id}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step ?? (p.max - p.min) / 100}
                  value={v}
                  onChange={e => setValues(prev => ({ ...prev, [p.name]: Number(e.target.value) }))}
                />
                <output htmlFor={id} className="diui-param-value">{formatNumber(v)}</output>
              </label>
            )
          })}
          <button type="button" className="diui-link diui-param-reset" onClick={() => setValues(defaults)}>{props.t('plot.reset')}</button>
        </div>
      )}
    </figure>
  )
}
