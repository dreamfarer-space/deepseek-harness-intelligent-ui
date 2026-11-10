import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'
import { PALETTE, useLayoutWidth } from './Chart.tsx'

export interface CalendarEvent { id: string; title: string; start: string; end: string; group?: string; note?: string; location?: string }
export interface CalendarProps {
  title?: string
  view?: 'day' | 'week' | 'agenda'
  timeZone: string
  start?: string
  events: CalendarEvent[]
  callId?: string
  nodeId: string
  t: Translate
}

/** Pixels per hour in the day grid. */
const HOUR_H = 36
/** Below this width the grid is unreadable and the agenda takes over. */
const NARROW_W = 380

type View = 'day' | 'week' | 'agenda'
const VIEWS: readonly View[] = ['day', 'week', 'agenda']

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
/** A trailing `Z` or `+HH:mm` means the instant is absolute, not wall-clock. */
const ABSOLUTE = /(?:Z|[+-]\d{2}:?\d{2})$/

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))

/** A wall-clock moment inside `timeZone`: the date it falls on and its minute of day. */
interface Moment { date: string; min: number }

/** One event resolved into the calendar's own time zone. */
interface Resolved {
  ev: CalendarEvent
  allDay: boolean
  start: Moment
  end: Moment
}

/** Calendar day arithmetic on plain `YYYY-MM-DD` strings (no zone involved). */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!) + n * 86400000)
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/** The absolute instant behind an ISO string with an offset or `Z`. */
function instantOf(raw: string): number | undefined {
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : undefined
}

/**
 * The date and minute of day an instant falls on inside `timeZone`.
 * The zone is explicit: nothing is guessed from the host's own locale.
 */
function inZone(ms: number, timeZone: string): Moment | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms))
    const get = (type: string) => parts.find(p => p.type === type)?.value
    const year = get('year')
    const month = get('month')
    const day = get('day')
    if (!year || !month || !day) return undefined
    const hour = Number(get('hour') ?? 0)
    const minute = Number(get('minute') ?? 0)
    return { date: `${year}-${month}-${day}`, min: (hour || 0) * 60 + (minute || 0) }
  } catch {
    return undefined
  }
}

/**
 * Resolve one event into the calendar's time zone.
 * A date-only event is all-day. A timed event without an offset is a
 * wall-clock time *in* `timeZone`, so it is read as written; with an offset
 * (or `Z`) it is an absolute instant, converted into `timeZone`.
 */
function resolve(ev: CalendarEvent, timeZone: string): Resolved | undefined {
  const startRaw = String(ev.start ?? '').trim()
  const endRaw = String(ev.end ?? '').trim()
  if (!startRaw) return undefined
  if (DATE_ONLY.test(startRaw)) {
    const endDate = DATE_ONLY.test(endRaw) ? endRaw : startRaw
    return { ev, allDay: true, start: { date: startRaw, min: 0 }, end: { date: endDate, min: 1440 } }
  }
  const m = DATE_TIME.exec(startRaw)
  if (!m) return undefined
  let start: Moment | undefined
  if (ABSOLUTE.test(startRaw)) {
    const ms = instantOf(startRaw)
    if (ms !== undefined) start = inZone(ms, timeZone)
  } else start = { date: `${m[1]}-${m[2]}-${m[3]}`, min: Number(m[4]) * 60 + Number(m[5]) }
  if (!start) return undefined
  let end: Moment
  if (DATE_ONLY.test(endRaw)) end = { date: endRaw, min: 1440 }
  else {
    const em = DATE_TIME.exec(endRaw)
    if (!em) end = { date: start.date, min: Math.min(1440, start.min + 30) }
    else if (ABSOLUTE.test(endRaw)) {
      const ms = instantOf(endRaw)
      end = ms === undefined ? { date: start.date, min: Math.min(1440, start.min + 30) } : (inZone(ms, timeZone) ?? { date: start.date, min: Math.min(1440, start.min + 30) })
    } else end = { date: `${em[1]}-${em[2]}-${em[3]}`, min: Number(em[4]) * 60 + Number(em[5]) }
  }
  // A range that ends before it starts (or on an earlier day) still needs a
  // visible length, otherwise the event would collapse to nothing.
  if (end.date < start.date || (end.date === start.date && end.min <= start.min)) end = { date: start.date, min: Math.min(1440, start.min + 30) }
  return { ev, allDay: false, start, end }
}

function fmtTime(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(Math.round(min % 60))}`
}

/** Human range of an event, in the calendar's own time zone. */
function rangeOf(r: Resolved): string {
  if (r.allDay) return r.start.date === r.end.date ? r.start.date : `${r.start.date} – ${r.end.date}`
  if (r.start.date === r.end.date) return `${r.start.date} ${fmtTime(r.start.min)}–${fmtTime(r.end.min)}`
  return `${r.start.date} ${fmtTime(r.start.min)} – ${r.end.date} ${fmtTime(r.end.min)}`
}

/** Short label for a column or a list row. */
function shortRange(r: Resolved): string {
  if (r.allDay) return r.start.date === r.end.date ? r.start.date : `${r.start.date} – ${r.end.date}`
  if (r.start.date === r.end.date) return `${fmtTime(r.start.min)}–${fmtTime(r.end.min)}`
  return `${r.start.date} ${fmtTime(r.start.min)} – ${r.end.date} ${fmtTime(r.end.min)}`
}

/** Weekday + date for a day column header. */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y!, m! - 1, d!)))
  } catch {
    return date
  }
}

/** One timed event as it sits inside a single day column. */
interface Slot { r: Resolved; startMin: number; endMin: number }

/**
 * Split the events of one day into side-by-side columns so that overlapping
 * events never cover each other. Events that touch (one ends exactly when
 * the next begins) share no column.
 */
function splitColumns(slots: Slot[]): { slot: Slot; col: number; total: number }[] {
  const sorted = [...slots].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const out: { slot: Slot; col: number; total: number }[] = []
  let i = 0
  while (i < sorted.length) {
    const cluster: Slot[] = []
    let clusterEnd = -1
    while (i < sorted.length && (cluster.length === 0 || sorted[i]!.startMin < clusterEnd)) {
      cluster.push(sorted[i]!)
      clusterEnd = Math.max(clusterEnd, sorted[i]!.endMin)
      i++
    }
    const ends: number[] = []
    const colOf = new Map<string, number>()
    for (const slot of cluster) {
      let c = ends.findIndex(e => e <= slot.startMin)
      if (c === -1) { c = ends.length; ends.push(slot.endMin) } else ends[c] = slot.endMin
      colOf.set(slot.r.ev.id, c)
    }
    for (const slot of cluster) out.push({ slot, col: colOf.get(slot.r.ev.id) ?? 0, total: ends.length || 1 })
  }
  return out
}

/**
 * Read-only schedule: a week (or one day) laid out by real duration, or an
 * agenda list on a narrow screen. Times are always rendered in the calendar's
 * own `timeZone`; picking an event only reads the data that was handed in.
 */
export function Calendar(props: CalendarProps) {
  const { t } = props
  const stageRef = useRef<HTMLElement>(null)
  const width = useLayoutWidth(stageRef, 640, 260)
  const defaultView: View = props.view ?? 'week'
  const [view, setView] = useUiState<View>(props.callId, `${props.nodeId}:view`, defaultView)
  const [selectedId, setSelectedId] = useUiState<string | null>(props.callId, `${props.nodeId}:selected`, null)
  const [hiddenGroups, setHiddenGroups] = useUiState<string[]>(props.callId, `${props.nodeId}:hiddenGroups`, [])
  const [picked, setPicked] = useState(false)

  const resolved = useMemo(
    () => props.events.map(ev => resolve(ev, props.timeZone)).filter((r): r is Resolved => !!r),
    [props.events, props.timeZone],
  )
  const groups = useMemo(() => {
    const seen: string[] = []
    for (const r of resolved) if (r.ev.group && !seen.includes(r.ev.group)) seen.push(r.ev.group)
    return seen
  }, [resolved])
  const hiddenList = Array.isArray(hiddenGroups) ? hiddenGroups : []
  const colorOf = (r: Resolved) => (r.ev.group ? PALETTE[groups.indexOf(r.ev.group) % PALETTE.length]! : PALETTE[0]!)
  const visible = resolved.filter(r => !r.ev.group || !hiddenList.includes(r.ev.group))

  // The view is the user's own choice once they touch the toggle; until then
  // a narrow card falls back to the agenda.
  const explicit = picked || view !== defaultView
  const effectiveView: View = view === 'agenda' || (!explicit && width < NARROW_W) ? 'agenda' : view

  const earliest = resolved.reduce<string | undefined>(
    (min, r) => (min === undefined || r.start.date < min ? r.start.date : min),
    undefined,
  )
  const firstDay = props.start && DATE_ONLY.test(props.start) ? props.start : earliest
  const days = useMemo(() => {
    if (!firstDay) return []
    const count = effectiveView === 'day' ? 1 : 7
    return Array.from({ length: count }, (_, i) => addDays(firstDay, i))
  }, [firstDay, effectiveView])

  const allDayOf = (date: string) => visible.filter(r => r.allDay && r.start.date <= date && date <= r.end.date)
  // Minimum 24 minutes (~14.4px at 36px/hour) matches the 14px minimum button height so
  // splitColumns never puts two short back-to-back events into overlapping boxes.
  const timedOf = (date: string): Slot[] => visible
    .filter(r => !r.allDay && r.start.date <= date && date <= r.end.date && !(date === r.end.date && date > r.start.date && r.end.min === 0))
    .map(r => {
      const s = r.start.date === date ? r.start.min : 0
      const e = r.end.date === date ? r.end.min : 1440
      return { r, startMin: s, endMin: Math.min(1440, Math.max(e, s + 24)) }
    })

  // The visible hours cover every timed event segment across the visible days, never fewer than 8..18.
  const [startHour, endHour] = useMemo(() => {
    let lo = 8
    let hi = 18
    for (const d of days) {
      for (const slot of timedOf(d)) {
        lo = Math.min(lo, Math.floor(slot.startMin / 60))
        hi = Math.max(hi, Math.ceil(slot.endMin / 60))
      }
    }
    return [Math.max(0, Math.min(23, lo)), Math.max(1, Math.min(24, hi))]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, visible])
  const gridH = (endHour - startHour) * HOUR_H

  const selected = resolved.find(r => r.ev.id === selectedId)
  // Picking an event only reads the data that was handed in; the model is never
  // asked for anything.
  const choose = (id: string) => setSelectedId(id)

  const agenda = [...visible].sort((a, b) =>
    a.start.date === b.start.date ? a.start.min - b.start.min : a.start.date < b.start.date ? -1 : 1)

  const views = (
    <div className="diui-calendar-views" role="group">
      {VIEWS.map(v => (
        <button
          key={v}
          type="button"
          className="diui-calendar-view-btn"
          aria-pressed={effectiveView === v}
          onClick={() => { setPicked(true); setView(v) }}
        >
          {t(`calendar.${v}`)}
        </button>
      ))}
    </div>
  )

  const grid = (
    <div
      className="diui-calendar-grid"
      style={{
        '--diui-cal-days': String(Math.max(1, days.length)),
        '--diui-cal-hour-h': `${HOUR_H}px`,
        gridTemplateColumns: `48px repeat(${Math.max(1, days.length)}, minmax(0, 1fr))`,
      } as CSSProperties}
    >
      <div />
      {days.map(d => <div key={d} className="diui-calendar-head-cell">{dayLabel(d)}</div>)}
      <div className="diui-calendar-allday-label">{t('calendar.allDay')}</div>
      {days.map(d => (
        <div key={d} className="diui-calendar-allday-cell">
          {allDayOf(d).map(r => (
            <button
              key={r.ev.id}
              type="button"
              className="diui-calendar-allday-pill"
              data-selected={r.ev.id === selectedId ? '' : undefined}
              style={{ color: colorOf(r) }}
              onClick={() => choose(r.ev.id)}
            >
              {r.ev.title}
            </button>
          ))}
        </div>
      ))}
      <div className="diui-calendar-hours">
        {Array.from({ length: endHour - startHour }, (_, i) => (
          <div key={i} className="diui-calendar-hour-label" style={{ height: HOUR_H }}>{pad2(startHour + i)}:00</div>
        ))}
      </div>
      {days.map(d => (
        <div key={d} className="diui-calendar-day-col" style={{ height: gridH }}>
          {splitColumns(timedOf(d)).map(({ slot, col, total }) => {
            const top = ((slot.startMin - startHour * 60) / 60) * HOUR_H
            const h = Math.max(14, ((slot.endMin - slot.startMin) / 60) * HOUR_H)
            const on = slot.r.ev.id === selectedId
            return (
              <button
                key={slot.r.ev.id}
                type="button"
                className="diui-calendar-event"
                data-selected={on ? '' : undefined}
                style={{
                  top: `${top}px`,
                  height: `${h}px`,
                  left: `${(col / total) * 100}%`,
                  width: `${100 / total}%`,
                  color: colorOf(slot.r),
                }}
                onClick={() => choose(slot.r.ev.id)}
              >
                <span className="diui-calendar-event-title">{slot.r.ev.title}</span>
                <span className="diui-calendar-event-time">{fmtTime(slot.startMin)}–{fmtTime(slot.endMin)}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )

  const agendaList = (
    <ul className="diui-calendar-agenda">
      {agenda.map(r => (
        <li key={r.ev.id}>
          <button
            type="button"
            className="diui-calendar-agenda-item"
            data-selected={r.ev.id === selectedId ? '' : undefined}
            onClick={() => choose(r.ev.id)}
          >
            <span className="diui-calendar-agenda-time">{shortRange(r)}</span>
            <span className="diui-calendar-agenda-title">{r.ev.title}</span>
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <figure className="diui-calendar" ref={stageRef}>
      {props.title && <figcaption className="diui-calendar-title">{props.title}</figcaption>}
      <div className="diui-calendar-bar">
        {views}
        <span className="diui-calendar-tz">{props.timeZone}</span>
      </div>
      {resolved.length === 0
        ? <div className="diui-empty">{t('calendar.empty')}</div>
        : effectiveView === 'agenda'
          ? agendaList
          : grid}
      {groups.length > 0 && (
        <div className="diui-legend">
          {groups.map((g, i) => (
            <button
              key={g}
              type="button"
              className="diui-legend-item"
              aria-pressed={!hiddenGroups.includes(g)}
              data-off={hiddenGroups.includes(g) ? '' : undefined}
              onClick={() => setHiddenGroups(h => (h.includes(g) ? h.filter(x => x !== g) : [...h, g]))}
            >
              <i style={{ background: PALETTE[i % PALETTE.length] }} />{g}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="diui-calendar-detail" role="status">
          <strong>{selected.ev.title}</strong>
          <span className="diui-calendar-detail-time">{rangeOf(selected)} · {props.timeZone}</span>
          {selected.ev.group && <span className="diui-badge">{selected.ev.group}</span>}
          {selected.ev.location && <span className="diui-calendar-detail-location">{selected.ev.location}</span>}
          {selected.ev.note && <span className="diui-calendar-detail-note">{selected.ev.note}</span>}
        </div>
      )}
    </figure>
  )
}
