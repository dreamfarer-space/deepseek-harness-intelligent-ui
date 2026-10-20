import { useId, useMemo, type ReactNode } from 'react'
import { useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'
import { downloadText, exportFileName, toCsv, toMarkdown } from './export.ts'
import { Inline } from './inline.tsx'

export type Cell = string | number | boolean | null
export type ColumnType = 'text' | 'number' | 'date' | 'boolean'

/** Column filter: text contains, boolean equals, number/date inclusive range. */
type Filter = { text?: string; min?: string; max?: string; bool?: 'true' | 'false' }

/**
 * ISO 8601 date or date-time (`2026-10-20`, `2026-10-20T08:30`, `2026-10-20 08:30:00Z`)
 * to epoch ms. Other formats are not guessed: they are not dates.
 */
export function parseDate(v: Cell | undefined): number | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(v.trim())
  if (!m) return undefined
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3] ?? '01'}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}${m[7] ? m[7].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2') : 'Z'}`)
  return Number.isNaN(t) ? undefined : t
}

/** Explicit `columnTypes` win; otherwise a column whose present cells are all numbers (or all ISO dates) is typed so. */
export function inferTypes(columns: readonly string[], rows: readonly (readonly Cell[])[], declared?: readonly (ColumnType | undefined)[]): ColumnType[] {
  return columns.map((_, c) => {
    if (declared?.[c]) return declared[c]!
    const present = rows.map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '')
    if (present.length === 0) return 'text'
    if (present.every(v => typeof v === 'number')) return 'number'
    if (present.every(v => typeof v === 'boolean')) return 'boolean'
    if (present.every(v => parseDate(v) !== undefined)) return 'date'
    return 'text'
  })
}

function sortKey(v: Cell | undefined, type: ColumnType): number | string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (type === 'number') return typeof v === 'number' ? v : (Number.isFinite(Number(v)) ? Number(v) : undefined)
  if (type === 'date') return parseDate(v)
  if (type === 'boolean') return v === true ? 1 : v === false ? 0 : undefined
  return String(v)
}

/** Empty and unparseable values sort last in both directions. */
export function compareTyped(a: Cell | undefined, b: Cell | undefined, type: ColumnType, dir: 1 | -1): number {
  const x = sortKey(a, type)
  const y = sortKey(b, type)
  if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1
  const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })
  return d * dir
}

export function compareCells(a: Cell, b: Cell): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function matches(v: Cell | undefined, f: Filter, type: ColumnType): boolean {
  if (f.text) return v !== null && v !== undefined && String(v).toLowerCase().includes(f.text.toLowerCase())
  if (f.bool) return String(v) === f.bool
  if (f.min || f.max) {
    const k = type === 'date' ? parseDate(v) : typeof v === 'number' ? v : undefined
    if (k === undefined) return false
    const bound = (s: string | undefined) => !s ? undefined : type === 'date' ? parseDate(s) : Number(s)
    const lo = bound(f.min)
    const hi = bound(f.max)
    // A date-only upper bound includes that whole day.
    const hiIncl = hi !== undefined && type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(f.max ?? '') ? hi + 86_399_999 : hi
    return (lo === undefined || Number.isNaN(lo) || k >= lo) && (hiIncl === undefined || Number.isNaN(hiIncl) || k <= hiIncl)
  }
  return true
}

const active = (f: Filter | undefined) => !!f && !!(f.text || f.min || f.max || f.bool)

export interface TableProps {
  columns: string[]
  rows: Cell[][]
  caption?: string
  sortable?: boolean
  columnTypes?: (ColumnType | undefined)[]
  searchable?: boolean
  filterable?: boolean
  pageSize?: number
  exportable?: boolean
  t: Translate
  callId?: string
  nodeId: string
}

/**
 * Table with optional local search, per-column filters (AND), typed sorting,
 * paging and export. All of it runs in the browser; nothing is sent to the model.
 */
export function Table(props: TableProps) {
  const { t, columns } = props
  const key = (k: string) => `${props.nodeId}:${k}`
  const [stored, setSort] = useUiState<{ col: number; dir: 1 | -1 } | null>(props.callId, key('sort'), null)
  const [search, setSearch] = useUiState(props.callId, key('search'), '')
  const [filters, setFilters] = useUiState<Record<string, Filter>>(props.callId, key('filters'), {})
  const [showFilters, setShowFilters] = useUiState(props.callId, key('showFilters'), false)
  const [page, setPage] = useUiState(props.callId, key('page'), 0)
  const uid = useId()
  // A patch may drop columns; a sort on a column that no longer exists is void.
  const sort = stored && stored.col < columns.length ? stored : null
  const types = useMemo(() => inferTypes(columns, props.rows, props.columnTypes), [columns, props.rows, props.columnTypes])
  const view = useMemo(() => {
    const q = props.searchable ? search.trim().toLowerCase() : ''
    let rows = props.rows.filter(r =>
      (!q || r.some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))) &&
      (!props.filterable || columns.every((_, c) => !active(filters[c]) || matches(r[c], filters[c]!, types[c]!))))
    if (sort) rows = [...rows].sort((a, b) => compareTyped(a[sort.col], b[sort.col], types[sort.col]!, sort.dir))
    return rows
  }, [props.rows, props.searchable, props.filterable, search, filters, sort, types, columns])
  const size = props.pageSize && props.pageSize > 0 ? Math.floor(props.pageSize) : 0
  const pages = size ? Math.max(1, Math.ceil(view.length / size)) : 1
  const current = Math.min(page, pages - 1)
  const visible = size ? view.slice(current * size, (current + 1) * size) : view
  const narrowed = view.length !== props.rows.length
  const setFilter = (c: number, f: Filter) => { setFilters(prev => ({ ...prev, [c]: f })); setPage(0) }
  const exportAs = (kind: 'csv' | 'md') => {
    downloadText(exportFileName(props.caption, kind), kind === 'csv' ? toCsv(columns, view) : toMarkdown(columns, view), kind === 'csv' ? 'text/csv' : 'text/markdown')
  }
  const toolbar = props.searchable || props.filterable || props.exportable
  return (
    <div className="diui-datagrid">
      {toolbar && (
        <div className="diui-table-tools" role="toolbar" aria-label={props.caption ?? t('table.tools')}>
          {props.searchable && (
            <input type="search" className="diui-input" placeholder={t('table.search')} aria-label={t('table.search')}
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          )}
          {props.filterable && (
            <button type="button" className="diui-button" aria-expanded={showFilters} aria-controls={`${uid}-filters`} onClick={() => setShowFilters(v => !v)}>
              {t('table.filter')}{Object.values(filters).some(active) ? ` (${Object.values(filters).filter(active).length})` : ''}
            </button>
          )}
          {props.filterable && Object.values(filters).some(active) && (
            <button type="button" className="diui-button" onClick={() => { setFilters({}); setPage(0) }}>{t('table.clearFilters')}</button>
          )}
          {props.exportable && (
            <span className="diui-table-export">
              <button type="button" className="diui-button" onClick={() => exportAs('csv')} title={t('table.exportHint', { count: view.length })}>{t('table.exportCsv')}</button>
              <button type="button" className="diui-button" onClick={() => exportAs('md')} title={t('table.exportHint', { count: view.length })}>{t('table.exportMarkdown')}</button>
            </span>
          )}
          {narrowed && <span className="diui-note" role="status">{t('table.matching', { count: view.length, total: props.rows.length })}</span>}
        </div>
      )}
      <div className="diui-table-wrap">
        <table className="diui-table">
          {props.caption && <caption>{props.caption}</caption>}
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col" data-numeric={types[i] === 'number' || undefined} aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {props.sortable
                    ? <button type="button" className="diui-th-button" onClick={() => setSort(s => s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 })}>{c}<span className="diui-sort" aria-hidden="true">{sort?.col === i ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span></button>
                    : c}
                </th>
              ))}
            </tr>
            {props.filterable && showFilters && (
              <tr className="diui-filter-row" id={`${uid}-filters`}>
                {columns.map((c, i) => <th key={i}><FilterInput type={types[i]!} column={c} value={filters[i] ?? {}} onChange={f => setFilter(i, f)} t={t} /></th>)}
              </tr>
            )}
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={columns.length} className="diui-empty">{narrowed ? t('table.noMatch') : t('table.empty')}</td></tr>}
            {visible.map((r, i) => (
              <tr key={i}>{columns.map((_, c) => <td key={c} data-numeric={types[c] === 'number' || undefined}>{cellText(r[c])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {size > 0 && pages > 1 && (
        <nav className="diui-pager" aria-label={t('table.pages')}>
          <button type="button" className="diui-button" disabled={current === 0} onClick={() => setPage(current - 1)}>{t('table.prev')}</button>
          <span role="status">{t('table.page', { page: current + 1, pages, count: view.length })}</span>
          <button type="button" className="diui-button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>{t('table.next')}</button>
        </nav>
      )}
    </div>
  )
}

function FilterInput(props: { type: ColumnType; column: string; value: Filter; onChange: (f: Filter) => void; t: Translate }) {
  const { type, column, value, t } = props
  if (type === 'boolean') {
    return (
      <select className="diui-input" aria-label={t('table.filterColumn', { column })} value={value.bool ?? ''} onChange={e => props.onChange({ bool: (e.target.value || undefined) as Filter['bool'] })}>
        <option value="">{t('table.any')}</option><option value="true">✓</option><option value="false">✗</option>
      </select>
    )
  }
  if (type === 'number' || type === 'date') {
    const input = type === 'date' ? 'date' : 'number'
    return (
      <span className="diui-range-filter">
        <input type={input} className="diui-input" aria-label={t('table.filterMin', { column })} placeholder={t('table.min')} value={value.min ?? ''} onChange={e => props.onChange({ ...value, min: e.target.value || undefined })} />
        <input type={input} className="diui-input" aria-label={t('table.filterMax', { column })} placeholder={t('table.max')} value={value.max ?? ''} onChange={e => props.onChange({ ...value, max: e.target.value || undefined })} />
      </span>
    )
  }
  return <input type="search" className="diui-input" aria-label={t('table.filterColumn', { column })} placeholder={t('table.contains')} value={value.text ?? ''} onChange={e => props.onChange({ text: e.target.value || undefined })} />
}

export function cellText(v: Cell | undefined): ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  return typeof v === 'string' ? <Inline text={v} /> : String(v)
}

/** Export buttons for data that is filtered elsewhere (bound tables, charts). */
export function ExportButtons(props: { columns: readonly string[]; rows: readonly (readonly Cell[])[]; name?: string; t: Translate }) {
  const save = (kind: 'csv' | 'md') => downloadText(exportFileName(props.name, kind),
    kind === 'csv' ? toCsv(props.columns, props.rows) : toMarkdown(props.columns, props.rows), kind === 'csv' ? 'text/csv' : 'text/markdown')
  return (
    <span className="diui-table-export">
      <button type="button" className="diui-button" onClick={() => save('csv')}>{props.t('table.exportCsv')}</button>
      <button type="button" className="diui-button" onClick={() => save('md')}>{props.t('table.exportMarkdown')}</button>
    </span>
  )
}
