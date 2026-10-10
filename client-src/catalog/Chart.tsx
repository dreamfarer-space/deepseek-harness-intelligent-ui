import { useState, type PointerEvent } from 'react'

/** Categorical palette readable on light and dark surfaces. */
export const PALETTE = ['#4d6bfe', '#22a06b', '#f2a33a', '#e5484d', '#8e6cef', '#12a5c4', '#e0569b', '#7fae2e', '#f07a2e', '#6b7a90', '#1aa89a', '#b25fe0']

export interface ChartSeries { name: string; values: readonly number[] }
export interface ChartProps {
  kind: 'bar' | 'line' | 'area' | 'pie'
  labels: readonly (string | number | boolean | null)[]
  series: readonly ChartSeries[]
  title?: string
  unit?: string
  stacked?: boolean
  height?: number
  emptyText: string
}

const W = 640
const PAD = { top: 12, right: 16, bottom: 36, left: 52 }

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) { max = min + 1; min = Math.min(0, min) }
  const span = max - min
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) ?? 10 * mag
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

export function formatNumber(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`
  return String(+v.toFixed(2))
}

export function Chart(props: ChartProps) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set())
  const [hover, setHover] = useState<number | undefined>(undefined)
  const series = props.series.filter((_, i) => !hidden.has(i))
  const n = props.labels.length
  if (n === 0 || props.series.length === 0) return <div className="diui-empty">{props.emptyText}</div>
  const H = props.height ?? 260
  const legend = (
    <div className="diui-legend">
      {props.series.map((s, i) => (
        <button
          key={i}
          type="button"
          className="diui-legend-item"
          data-off={hidden.has(i) || undefined}
          aria-pressed={!hidden.has(i)}
          onClick={() => props.kind !== 'pie' && setHidden((h) => {
            const next = new Set(h)
            if (next.has(i)) next.delete(i)
            else next.add(i)
            return next
          })}
        >
          <i style={{ background: PALETTE[i % PALETTE.length] }} />{s.name}
        </button>
      ))}
    </div>
  )
  return (
    <figure className="diui-chart">
      {props.title && <figcaption className="diui-chart-title">{props.title}</figcaption>}
      {props.kind === 'pie'
        ? <Pie {...props} height={H} />
        : (
            <div className="diui-plot-stage">
              <Cartesian {...props} series={series} height={H} colorOf={s => PALETTE[props.series.indexOf(s) % PALETTE.length]!} n={n} hover={hover} onHover={setHover} />
              {hover !== undefined && series.length > 0 && (
                <div className="diui-tooltip" style={{ left: `${((PAD.left + ((W - PAD.left - PAD.right) / n) * (hover + 0.5)) / W) * 100}%` }}>
                  <div className="diui-tooltip-head">{String(props.labels[hover] ?? '')}</div>
                  {series.map(s => (
                    <div key={s.name}><i style={{ background: PALETTE[props.series.indexOf(s) % PALETTE.length] }} />{s.name}: {formatNumber(s.values[hover] ?? 0)}{props.unit ? ` ${props.unit}` : ''}</div>
                  ))}
                </div>
              )}
            </div>
          )}
      {props.kind !== 'pie' && props.series.length > 1 && legend}
      {props.kind === 'pie' && <PieLegend labels={props.labels} values={props.series[0]?.values ?? []} unit={props.unit} />}
    </figure>
  )
}

function Cartesian(props: ChartProps & { height: number; n: number; colorOf: (s: ChartSeries) => string; hover?: number; onHover: (i: number | undefined) => void }) {
  const { series, n, height: H } = props
  const stacked = !!props.stacked && (props.kind === 'bar' || props.kind === 'area')
  let lo = 0
  let hi = 0
  for (let i = 0; i < n; i++) {
    let pos = 0
    let neg = 0
    for (const s of series) {
      const v = s.values[i] ?? 0
      if (stacked) { if (v >= 0) pos += v; else neg += v } else { hi = Math.max(hi, v); lo = Math.min(lo, v) }
    }
    if (stacked) { hi = Math.max(hi, pos); lo = Math.min(lo, neg) }
  }
  const ticks = niceTicks(lo, hi)
  const yMin = ticks[0]!
  const yMax = ticks[ticks.length - 1]!
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin)) * ih
  const band = iw / n
  const xc = (i: number) => PAD.left + band * i + band / 2
  const labelEvery = Math.max(1, Math.ceil(n / 12))
  const unit = props.unit ? ` ${props.unit}` : ''
  const marks: JSX.Element[] = []

  if (props.kind === 'bar') {
    const groupW = band * 0.72
    const barW = stacked ? groupW : groupW / Math.max(1, series.length)
    for (let i = 0; i < n; i++) {
      let pos = 0
      let neg = 0
      series.forEach((s, si) => {
        const v = s.values[i] ?? 0
        let from = 0
        let to = v
        if (stacked) {
          if (v >= 0) { from = pos; to = pos + v; pos = to } else { from = neg; to = neg + v; neg = to }
        }
        const x = PAD.left + band * i + (band - groupW) / 2 + (stacked ? 0 : si * barW)
        const top = y(Math.max(from, to))
        const h = Math.max(1, Math.abs(y(from) - y(to)))
        marks.push(
          <rect key={`${si}-${i}`} x={x} y={top} width={Math.max(1, barW - 2)} height={h} rx={2} fill={props.colorOf(s)}>
            <title>{`${String(props.labels[i])} · ${s.name}: ${v}${unit}`}</title>
          </rect>,
        )
      })
    }
  } else {
    const base = new Array<number>(n).fill(0)
    series.forEach((s, si) => {
      const pts = Array.from({ length: n }, (_, i) => {
        const v = s.values[i] ?? 0
        const top = stacked ? base[i]! + v : v
        return { x: xc(i), y: y(top), y0: y(stacked ? base[i]! : Math.max(yMin, Math.min(0, yMax))), v, i }
      })
      if (stacked) pts.forEach(p => { base[p.i] = base[p.i]! + p.v })
      const line = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
      const color = props.colorOf(s)
      if (props.kind === 'area') {
        const back = [...pts].reverse().map(p => `L${p.x.toFixed(1)},${p.y0.toFixed(1)}`).join('')
        marks.push(<path key={`a${si}`} d={`${line}${back}Z`} fill={color} opacity={0.18} />)
      }
      marks.push(<path key={`l${si}`} d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />)
      if (n <= 60) {
        pts.forEach(p => marks.push(
          <circle key={`p${si}-${p.i}`} cx={p.x} cy={p.y} r={3} fill={color}>
            <title>{`${String(props.labels[p.i])} · ${s.name}: ${p.v}${unit}`}</title>
          </circle>,
        ))
      }
    })
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0) return
    const vx = ((e.clientX - r.left) / r.width) * W
    const i = Math.floor((vx - PAD.left) / band)
    props.onHover(i >= 0 && i < n ? i : undefined)
  }
  return (
    <svg className="diui-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title ?? 'chart'} onPointerMove={onMove} onPointerLeave={() => props.onHover(undefined)}>
      {props.hover !== undefined && <rect x={PAD.left + band * props.hover} y={PAD.top} width={band} height={ih} className="diui-hover-band" />}
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'diui-axis-zero' : 'diui-grid'} />
          <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="diui-tick">{formatNumber(t)}</text>
        </g>
      ))}
      {props.labels.map((l, i) => i % labelEvery === 0 && (
        <text key={i} x={xc(i)} y={H - PAD.bottom + 16} textAnchor="middle" className="diui-tick">{truncate(String(l ?? ''), 14)}</text>
      ))}
      {marks}
    </svg>
  )
}

function Pie(props: ChartProps & { height: number }) {
  const values = (props.series[0]?.values ?? []).map(v => Math.max(0, v))
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return <div className="diui-empty">{props.emptyText}</div>
  const H = props.height
  const r = Math.min(H / 2 - 8, 120)
  const cx = W / 2
  const cy = H / 2
  let angle = -Math.PI / 2
  const unit = props.unit ? ` ${props.unit}` : ''
  return (
    <svg className="diui-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title ?? 'chart'}>
      {values.map((v, i) => {
        const a0 = angle
        const a1 = angle + (v / total) * Math.PI * 2
        angle = a1
        const large = a1 - a0 > Math.PI ? 1 : 0
        const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)]
        const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)]
        const d = values.filter(x => x > 0).length === 1
          ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`
          : `M${cx},${cy}L${p0[0]!.toFixed(1)},${p0[1]!.toFixed(1)}A${r},${r} 0 ${large} 1 ${p1[0]!.toFixed(1)},${p1[1]!.toFixed(1)}Z`
        return (
          <path key={i} d={d} fill={PALETTE[i % PALETTE.length]} className="diui-slice">
            <title>{`${String(props.labels[i])}: ${v}${unit} (${((v / total) * 100).toFixed(1)}%)`}</title>
          </path>
        )
      })}
    </svg>
  )
}

function PieLegend(props: { labels: ChartProps['labels']; values: readonly number[]; unit?: string }) {
  const total = props.values.reduce((a, b) => a + Math.max(0, b), 0) || 1
  return (
    <div className="diui-legend">
      {props.labels.map((l, i) => (
        <span key={i} className="diui-legend-item">
          <i style={{ background: PALETTE[i % PALETTE.length] }} />
          {String(l)} · {(((props.values[i] ?? 0) / total) * 100).toFixed(1)}%
        </span>
      ))}
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
