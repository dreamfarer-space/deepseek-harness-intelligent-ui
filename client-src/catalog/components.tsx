import { useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { newRequestId, projectData } from '../../src/controlled/runtime.js'
import { contextOf, type ControlledEnv, type DataRef } from '../controlled.ts'
import { componentEntry, validateProps, validateComponentVersion } from '../../src/catalog/catalog.js'
import { subscribeCatalog } from '../../src/catalog/extensions.js'
import { ExtensionBoundary, ExtensionSurface, extensionRenderer } from './extensions.tsx'
import { BridgeGuard, formatFormSubmission } from '../bridge.ts'
import type { WidgetPolicy } from '../policy.ts'
import { getUiState, setPersistentUiState, useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'
import { Chart, formatNumber, type ChartProps } from './Chart.tsx'
import { Inline } from './inline.tsx'
import { LibFrame } from './LibFrame.tsx'
import { Plot, type PlotProps } from './Plot.tsx'

export interface UiNode { id: string; type: string; componentVersion?: string; props?: Record<string, unknown>; children?: string[] }

export interface RenderEnv extends ControlledEnv {
  nodes: ReadonlyMap<string, UiNode>
  /** Still streaming: unknown children render as shimmer, invalid nodes are skipped quietly. */
  streaming: boolean
  /** Generation stopped: unfinished nodes are left out (no endless shimmer). */
  stopped?: boolean
  t: Translate
  /** Send an interaction; resolves/rejects with the bridge outcome. */
  send: (text: string) => Promise<void>
  sendNewSession?: (text: string, nodeId: string) => Promise<void>
  /** Tool call id: interaction state (tabs, sort, form values, sliders) persists under it. */
  callId?: string
  /** CDN/network policy for library-backed components (Math, Mermaid). */
  policy: WidgetPolicy
}

/** Render one node by id (recursively). */
export function renderNode(id: string, env: RenderEnv, depth = 0, trail: ReadonlySet<string> = new Set()): ReactNode {
  return <CatalogNode key={id} id={id} env={env} depth={depth} trail={trail} />
}

function CatalogNode({ id, env, depth, trail }: { id: string; env: RenderEnv; depth: number; trail: ReadonlySet<string> }): ReactNode {
  const node = env.nodes.get(id)
  const entry = useSyncExternalStore(subscribeCatalog, () => componentEntry(node?.type), () => componentEntry(node?.type))
  if (!node) {
    if (env.stopped) return null
    return env.streaming ? <div key={id} className="diui-shimmer" /> : <div key={id} className="diui-node-error">{env.t('node.missing', { id })}</div>
  }
  if (trail.has(id) || depth > 24) return null
  const errors = [...validateProps(node.type, node.props), ...validateComponentVersion(node.type, node.componentVersion)]
  const renderer = extensionRenderer(node.type)
  if (entry?.propsSchema && !renderer) errors.push('Extension renderer unavailable')
  if (errors.length) {
    // Invalid installed extensions fail visibly, including interrupted previews.
    if (env.streaming && !node.type.includes('/')) return env.stopped ? null : <div key={id} className="diui-shimmer" />
    return <div key={id} className="diui-node-error" title={errors.join('\n')}>{env.t('node.invalid', { id, type: node.type })}</div>
  }
  const nextTrail = new Set(trail).add(id)
  const kids = entry?.children
    ? (node.children ?? []).map(c => renderNode(c, env, depth + 1, nextTrail))
    : []
  if (renderer) return <ExtensionBoundary key={`${node.type}:${node.componentVersion}:${entry.generation}`}><ExtensionSurface renderer={renderer} node={node} env={env}>{kids}</ExtensionSurface></ExtensionBoundary>
  return <Component key={id} node={node} env={env}>{kids}</Component>
}

function Component({ node, env, children }: { node: UiNode; env: RenderEnv; children: ReactNode[] }) {
  const p = (node.props ?? {}) as Record<string, any>
  switch (node.type) {
    case 'Card':
      return (
        <section className="diui-card">
          {(p.title || p.subtitle) && (
            <header className="diui-card-head">
              {p.title && <h3 className="diui-card-title">{p.title}</h3>}
              {p.subtitle && <p className="diui-card-subtitle">{p.subtitle}</p>}
            </header>
          )}
          <div className="diui-stack" style={{ gap: 10 }}>{children}</div>
          {p.footer && <footer className="diui-card-foot"><Inline text={p.footer} /></footer>}
        </section>
      )
    case 'Stack':
      return (
        <div
          className="diui-stack"
          data-direction={p.direction ?? 'vertical'}
          style={{ gap: p.gap ?? 10, flexWrap: p.wrap ? 'wrap' : undefined, alignItems: alignOf(p.align) }}
        >
          {children}
        </div>
      )
    case 'Grid':
      return <div className="diui-grid" style={{ ['--diui-cols' as string]: Math.round(p.columns) }}>{children}</div>
    case 'Tabs':
      return <Tabs labels={p.labels} env={env} nodeId={node.id}>{children}</Tabs>
    case 'Text': {
      const Tag = p.variant === 'title' ? 'h2' : p.variant === 'heading' ? 'h4' : 'p'
      return <Tag className="diui-text" data-variant={p.variant ?? 'body'} data-tone={p.tone ?? 'default'}><Inline text={p.text} /></Tag>
    }
    case 'Code':
      return <pre className="diui-code" data-language={p.language}><code>{p.code}</code></pre>
    case 'Alert':
      return (
        <div className="diui-alert" data-tone={p.tone ?? 'info'} role="note">
          {p.title && <strong className="diui-alert-title">{p.title}</strong>}
          <div><Inline text={p.text} /></div>
        </div>
      )
    case 'Badge':
      return <span className="diui-badge" data-tone={p.tone ?? 'default'}>{p.text}</span>
    case 'Divider':
      return <hr className="diui-divider" />
    case 'Stat':
      return (
        <div className="diui-stat">
          <div className="diui-stat-label">{p.label}</div>
          <div className="diui-stat-value">{String(p.value ?? '')}</div>
          {p.delta && <div className="diui-stat-delta" data-trend={p.trend ?? 'flat'}>{p.trend === 'up' ? '▲ ' : p.trend === 'down' ? '▼ ' : ''}{p.delta}</div>}
          {p.hint && <div className="diui-stat-hint">{p.hint}</div>}
        </div>
      )
    case 'Progress': {
      const max = p.max && p.max > 0 ? p.max : 100
      const pct = Math.max(0, Math.min(100, (p.value / max) * 100))
      return (
        <div className="diui-progress" data-tone={p.tone ?? 'default'}>
          {p.label && <div className="diui-progress-label"><span>{p.label}</span><span>{Math.round(pct)}%</span></div>}
          <div className="diui-progress-track" role="progressbar" aria-valuenow={p.value} aria-valuemin={0} aria-valuemax={max}>
            <div className="diui-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }
    case 'List': {
      const Tag = p.ordered ? 'ol' : 'ul'
      return <Tag className="diui-list">{(p.items as string[]).map((it, i) => <li key={i}><Inline text={it} /></li>)}</Tag>
    }
    case 'Table':
      if (p.dataRef) return <BoundData kind="Table" props={p} env={env} nodeId={node.id} />
      return <Table columns={p.columns} rows={p.rows} caption={p.caption} sortable={p.sortable} env={env} nodeId={node.id} />
    case 'Chart':
      if (p.dataRef) return <BoundData kind="Chart" props={p} env={env} nodeId={node.id} />
      return <Chart {...(p as ChartProps)} emptyText={env.t('chart.empty')} />
    case 'Button':
      if (p.action) return <ControlledButton label={p.label} action={p.action} env={env} />
      return <ActionButton label={p.label} prompt={p.prompt} variant={p.variant} sessionTarget={p.sessionTarget} env={env} nodeId={node.id} />
    case 'Form':
      return <Form props={p} env={env} nodeId={node.id} />
    case 'ChoiceGroup':
      return <ChoiceGroup props={p as ChoiceProps} env={env} nodeId={node.id} />
    case 'Timeline':
      return (
        <ol className="diui-timeline">
          {(p.items as { title: string; time?: string; text?: string; tone?: string }[]).map((it, i) => (
            <li key={i} className="diui-timeline-item" data-tone={it.tone ?? 'default'}>
              <span className="diui-timeline-dot" aria-hidden="true" />
              <div className="diui-timeline-body">
                {it.time && <div className="diui-timeline-time">{it.time}</div>}
                <div className="diui-timeline-title"><Inline text={it.title} /></div>
                {it.text && <div className="diui-timeline-text"><Inline text={it.text} /></div>}
              </div>
            </li>
          ))}
        </ol>
      )
    case 'Plot':
      return <Plot {...(p as PlotProps)} callId={env.callId} nodeId={node.id} t={env.t} />
    case 'Math':
      return env.streaming
        ? <pre className="diui-code diui-src-preview">{p.tex}</pre>
        : <LibFrame kind="math" source={p.tex} display={p.display} surfaceId={`${env.callId ?? ''}:${node.id}`} policy={env.policy} title={env.t('lib.math')} />
    case 'Mermaid':
      return env.streaming
        ? <pre className="diui-code diui-src-preview">{p.code}</pre>
        : <LibFrame kind="mermaid" source={p.code} surfaceId={`${env.callId ?? ''}:${node.id}`} policy={env.policy} title={env.t('lib.diagram')} />
    default:
      return null
  }
}

function alignOf(a: unknown): string | undefined {
  return a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : typeof a === 'string' ? a : undefined
}

function Tabs(props: { labels: string[]; children: ReactNode[]; env: RenderEnv; nodeId: string }) {
  const [active, setActive] = useUiState(props.env.callId, `${props.nodeId}:tab`, 0)
  const uid = useId()
  const list = useRef<HTMLDivElement>(null)
  const count = Math.min(props.labels.length, Math.max(1, props.children.length))
  const index = Math.min(active, count - 1)
  // WAI-ARIA tabs: arrows/Home/End move and activate; only the active tab is in the tab order.
  const onKey = (e: KeyboardEvent) => {
    const next = e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : undefined
    if (next === undefined) return
    e.preventDefault()
    const i = (next + count) % count
    setActive(i)
    list.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[i]?.focus()
  }
  return (
    <div className="diui-tabs">
      <div className="diui-tablist" role="tablist" ref={list} onKeyDown={onKey}>
        {props.labels.slice(0, count).map((l, i) => (
          <button
            key={i}
            id={`${uid}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`${uid}-panel`}
            tabIndex={i === index ? 0 : -1}
            className="diui-tab"
            onClick={() => setActive(i)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="diui-tabpanel" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${index}`}>{props.children[index]}</div>
    </div>
  )
}

type Cell = string | number | boolean | null

function Table(props: { columns: string[]; rows: Cell[][]; caption?: string; sortable?: boolean; env: RenderEnv; nodeId: string }) {
  const [stored, setSort] = useUiState<{ col: number; dir: 1 | -1 } | null>(props.env.callId, `${props.nodeId}:sort`, null)
  // A patch may drop columns; a sort on a column that no longer exists is void.
  const sort = stored && stored.col < props.columns.length ? stored : null
  const rows = useMemo(() => {
    if (!sort) return props.rows
    const { col, dir } = sort
    return [...props.rows].sort((a, b) => compareCells(a[col] ?? null, b[col] ?? null) * dir)
  }, [props.rows, sort])
  const numeric = props.columns.map((_, c) => props.rows.length > 0 && props.rows.every(r => typeof r[c] === 'number' || r[c] === null || r[c] === undefined))
  return (
    <div className="diui-table-wrap">
      <table className="diui-table">
        {props.caption && <caption>{props.caption}</caption>}
        <thead>
          <tr>
            {props.columns.map((c, i) => (
              <th key={i} data-numeric={numeric[i] || undefined} aria-sort={sort?.col === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {props.sortable
                  ? <button type="button" className="diui-th-button" onClick={() => setSort(s => s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 })}>{c}<span className="diui-sort" aria-hidden="true">{sort?.col === i ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span></button>
                  : c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={props.columns.length} className="diui-empty">{props.env.t('table.empty')}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>{props.columns.map((_, c) => <td key={c} data-numeric={numeric[c] || undefined}>{cellText(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cellText(v: Cell | undefined): ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  return typeof v === 'string' ? <Inline text={v} /> : String(v)
}

export function compareCells(a: Cell, b: Cell): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function useSend(env: RenderEnv, newSession = false): [(text: string) => Promise<boolean>, boolean, string | undefined] {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | undefined>(undefined)
  // A ref, not state: a second click in the same frame must already see the send in flight.
  const inFlight = useRef(false)
  const send = async (text: string) => {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setNote(env.t('bridge.sending'))
    try {
      await env.send(text)
      setNote(env.t(newSession ? 'session.started' : 'bridge.sent'))
      return true
    } catch (err) {
      setNote(env.t('bridge.failed', { reason: err instanceof Error ? err.message : String(err) }))
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return [send, busy, note]
}

type SessionTarget = 'current' | 'new'

/** New-session forms/choices keep the first confirmed payload across retries and patches. */
function useSessionSend(env: RenderEnv, nodeId: string, target?: SessionTarget, freeze = false) {
  const key = `${nodeId}:launchPrompt`
  const [launchText] = useUiState<string | undefined>(env.callId, key, undefined)
  const isNew = target === 'new' || (freeze && launchText !== undefined)
  const [send, busy, note] = useSend({
    ...env,
    send: async text => {
      const frozen = freeze ? getUiState<string>(env.callId ?? '', key) : undefined
      if (target !== 'new' && frozen === undefined) return env.send(text)
      if (!env.sendNewSession) throw new Error(env.t('session.unavailable'))
      // Validate before freezing; the surface still applies its own admission/rate guard.
      const payload = new BridgeGuard({ policy: env.policy, armDelayMs: 0, minIntervalMs: 0 }).admitPrompt(frozen ?? text)
      if (freeze && !setPersistentUiState(env.callId ?? '', key, payload)) {
        throw new Error(env.t('session.recoveryUnavailable'))
      }
      await env.sendNewSession(payload, nodeId)
    },
  }, isNew)
  return { send, busy, note, isNew, frozen: freeze && launchText !== undefined }
}

function targetLabel(label: string, env: RenderEnv, isNew: boolean) {
  return `${label} · ${env.t(isNew ? 'session.targetNew' : 'session.targetCurrent')}`
}

function ActionButton(props: { label: string; prompt: string; variant?: string; sessionTarget?: SessionTarget; env: RenderEnv; nodeId: string }) {
  const [done, setDone] = useUiState(props.env.callId, `${props.nodeId}:sessionStarted`, false)
  const { send, busy, note, isNew } = useSessionSend(props.env, props.nodeId, props.sessionTarget)
  const click = async () => {
    if (isNew && done) return
    if (await send(props.prompt) && isNew) setDone(true)
  }
  return (
    <span className="diui-action">
      <button type="button" className="diui-button" data-variant={props.variant ?? 'secondary'} disabled={busy || props.env.streaming || (isNew && done)} aria-busy={busy || undefined} onClick={() => { void click() }}>
        {props.label}
      </button>
      {(note || (isNew && done)) && <span className="diui-note">{isNew && done ? props.env.t('session.started') : note}</span>}
    </span>
  )
}

interface ChoiceOption { id: string; label: string; description?: string; prompt: string }
interface ChoiceProps { title: string; options: ChoiceOption[]; recommended?: string; submitLabel?: string; sessionTarget?: SessionTarget }

function ChoiceGroup({ props, env, nodeId }: { props: ChoiceProps; env: RenderEnv; nodeId: string }) {
  const [selected, setSelected] = useUiState<string | undefined>(env.callId, `${nodeId}:choice`, undefined)
  const [done, setDone] = useUiState(env.callId, `${nodeId}:choiceSubmitted`, false)
  const { send, busy, note, isNew, frozen } = useSessionSend(env, nodeId, props.sessionTarget, true)
  const uid = useId()
  const choice = props.options.find(option => option.id === selected)
  const disabled = busy || done || env.streaming || !!env.stopped
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (disabled || (!choice && !frozen)) return
    if (await send(choice?.prompt ?? '')) setDone(true)
  }
  return (
    <form className="diui-choices" onSubmit={event => { void submit(event) }}>
      <fieldset disabled={disabled || frozen} aria-describedby={frozen && !done ? `${uid}-hint` : undefined}>
        <legend>{props.title}</legend>
        <div className="diui-choice-options">
          {props.options.map((option, index) => (
            <label key={option.id} className="diui-choice" data-selected={choice?.id === option.id || undefined}>
              <input type="radio" name={`${uid}-choice`} value={option.id} checked={choice?.id === option.id}
                aria-describedby={option.description ? `${uid}-${index}-description` : undefined}
                onChange={() => setSelected(option.id)} />
              <span className="diui-choice-content">
                <span className="diui-choice-heading"><span>{option.label}</span>
                  {props.recommended === option.id && <span className="diui-choice-recommended">{env.t('choice.recommended')}</span>}
                </span>
                {option.description && <span className="diui-choice-description" id={`${uid}-${index}-description`}>{option.description}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="diui-button diui-choice-submit" disabled={disabled || (!choice && !frozen)} aria-busy={busy || undefined}>
        {done ? env.t(isNew ? 'session.started' : 'form.submitted') : targetLabel(frozen ? env.t('session.retry') : props.submitLabel ?? env.t('choice.continue'), env, isNew)}
      </button>
      {frozen && !done && <span className="diui-choice-hint" id={`${uid}-hint`}>{env.t('session.retryHint')}</span>}
      <span className="diui-note" role="status" aria-live="polite">{note ?? (done ? env.t(isNew ? 'session.started' : 'form.submitted') : '')}</span>
    </form>
  )
}

interface FieldSpec { name: string; label: string; type: string; options?: string[]; required?: boolean; placeholder?: string; default?: Cell; min?: number; max?: number; step?: number }

function initialValue(f: FieldSpec): unknown {
  if (f.type === 'checkbox') return f.default === true
  if (f.type === 'range') return typeof f.default === 'number' ? f.default : ((f.min ?? 0) + (f.max ?? 100)) / 2
  if (f.default === undefined || f.default === null) return ''
  return f.type === 'number' ? Number(f.default) : String(f.default)
}

function Form({ props, env, nodeId }: { props: Record<string, any>; env: RenderEnv; nodeId: string }) {
  const fields = props.fields as FieldSpec[]
  const [stored, setValues] = useUiState<Record<string, unknown>>(env.callId, `${nodeId}:values`, () => Object.fromEntries(fields.map(f => [f.name, initialValue(f)])))
  // Fields a patch added start from their defaults; the user's input in the others is kept.
  const values = useMemo(() => ({ ...Object.fromEntries(fields.map(f => [f.name, initialValue(f)])), ...stored }), [fields, stored])
  const { send, busy, note, isNew, frozen } = useSessionSend(env, nodeId, props.sessionTarget, true)
  // Submitted forms stay locked across remounts and reloads.
  const [done, setDone] = useUiState(env.callId, `${nodeId}:submitted`, false)
  const uid = useId()
  const set = (name: string, v: unknown) => setValues(prev => ({ ...prev, [name]: v }))
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || done || env.streaming || env.stopped) return
    const out: Record<string, unknown> = {}
    for (const f of fields) {
      const v = values[f.name]
      out[f.name] = f.type === 'number' || f.type === 'range' ? (v === '' || v === undefined ? null : Number(v)) : v
    }
    if (await send(formatFormSubmission(props.title, props.prompt, out))) setDone(true)
  }
  return (
    <form className="diui-form" onSubmit={e => { void onSubmit(e) }}>
      {props.title && <h4 className="diui-form-title">{props.title}</h4>}
      {fields.map((f) => {
        const id = `${uid}-${f.name}`
        const v = values[f.name]
        const common = { id, name: f.name, required: f.required, disabled: busy || done || frozen || env.streaming || !!env.stopped }
        let input: ReactNode
        switch (f.type) {
          case 'textarea':
            input = <textarea {...common} rows={3} placeholder={f.placeholder} value={String(v ?? '')} onChange={e => set(f.name, e.target.value)} />
            break
          case 'select':
            input = (
              <select {...common} value={String(v ?? '')} onChange={e => set(f.name, e.target.value)}>
                <option value="" disabled>{f.placeholder ?? env.t('form.choose')}</option>
                {(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )
            break
          case 'checkbox':
            input = <input {...common} required={false} type="checkbox" checked={v === true} onChange={e => set(f.name, e.target.checked)} />
            break
          case 'range':
            input = (
              <span className="diui-range">
                <input {...common} type="range" min={f.min} max={f.max} step={f.step ?? 'any'} value={Number(v)} onChange={e => set(f.name, Number(e.target.value))} />
                <output htmlFor={id}>{formatNumber(Number(v))}</output>
              </span>
            )
            break
          default:
            input = (
              <input
                {...common}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                value={String(v ?? '')}
                onChange={e => set(f.name, e.target.value)}
              />
            )
        }
        return (
          <label key={f.name} className="diui-field" data-type={f.type} htmlFor={id}>
            <span className="diui-field-label">{f.label}{f.required && <span className="diui-required" title={env.t('form.required')}> *</span>}</span>
            {input}
          </label>
        )
      })}
      <div className="diui-form-actions">
        <button type="submit" className="diui-button" data-variant="primary" disabled={busy || done || env.streaming || !!env.stopped} aria-busy={busy || undefined}>
          {done ? env.t(isNew ? 'session.started' : 'form.submitted') : targetLabel(frozen ? env.t('session.retry') : props.submitLabel ?? env.t('form.submit'), env, isNew)}
        </button>
        {(note ?? (done ? env.t(isNew ? 'session.started' : 'form.submitted') : undefined)) && <span className="diui-note" role="status">{note ?? env.t(isNew ? 'session.started' : 'form.submitted')}</span>}
      </div>
      {frozen && !done && <span className="diui-note">{env.t('session.retryHint')}</span>}
    </form>
  )
}

/** Data/query state lives only in the trusted session registry, never localStorage. */
function BoundData({ kind, props: p, env, nodeId }: { kind: 'Table' | 'Chart'; props: Record<string, any>; env: RenderEnv; nodeId: string }) {
  const runtime = env.controlled
  useSyncExternalStore(runtime ? f => runtime.subscribe(f) : () => () => {}, runtime ? () => runtime.getRevision() : () => 0)
  try {
    if (!runtime) throw new Error('Data binding is unavailable in this host')
    const ref = p.dataRef as DataRef, ctx = contextOf(env)
    const entry = runtime.readData(ctx, ref)
    const { columns, rows } = projectData(entry) as { columns: string[]; rows: Cell[][] }
    const set = (patch: Record<string, unknown>) => runtime.setView(ctx, ref, patch)
    if (kind === 'Chart') {
      const cols = p.valueColumns as number[]
      if (p.labelColumn >= columns.length || cols.some(c => c >= columns.length) || rows.some(r => cols.some(c => typeof r[c] !== 'number'))) throw new Error('Chart columns must reference numeric data')
      return <Chart {...p as ChartProps} labels={rows.map(r => r[p.labelColumn] ?? null)} series={cols.map(c => ({ name: columns[c]!, values: rows.map(r => r[c] as number) }))} emptyText={env.t('chart.empty')} />
    }
    const size = p.pageSize ?? 20, pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.min(entry.view.page, pages - 1)
    return <div>
      <label>Search <input aria-label="Search dataset" value={entry.view.search} onChange={e => set({ search: e.target.value, page: 0 })} /></label>
      <label>Filter <select aria-label="Filter column" value={entry.view.filterColumn} onChange={e => set({ filterColumn: Number(e.target.value), page: 0 })}><option value={-1}>All columns</option>{columns.map((c, i) => <option key={i} value={i}>{c}</option>)}</select></label>
      {entry.view.filterColumn >= 0 && <input aria-label="Filter value" value={entry.view.filterValue} onChange={e => set({ filterValue: e.target.value, page: 0 })} />}
      <label>Sort <select aria-label="Sort dataset" value={entry.view.sortColumn} onChange={e => set({ sortColumn: Number(e.target.value), page: 0 })}><option value={-1}>Original order</option>{columns.map((c, i) => <option key={i} value={i}>{c}</option>)}</select></label>
      <button type="button" onClick={() => set({ descending: !entry.view.descending })}>{entry.view.descending ? 'Descending' : 'Ascending'}</button>
      <Table columns={columns} rows={rows.slice(page * size, (page + 1) * size)} caption={p.caption} env={env} nodeId={nodeId} />
      <button type="button" disabled={page === 0} onClick={() => set({ page: page - 1 })}>Previous</button><span role="status">{page + 1} / {pages} ({rows.length})</span><button type="button" disabled={page + 1 >= pages} onClick={() => set({ page: page + 1 })}>Next</button>
    </div>
  } catch (err) { return <div className="diui-node-error" role="alert">{err instanceof Error ? err.message : String(err)}</div> }
}

function ControlledButton({ label, action, env }: { label: string; action: { actionId: string; args: unknown }; env: RenderEnv }) {
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  const flight = useRef(false), receipt = useRef<{ fingerprint: string; id: string } | undefined>(undefined)
  const invoke = async (event: Event) => {
    if (flight.current) return
    flight.current = true; setBusy(true); setStatus('Loading…')
    const fingerprint = JSON.stringify(action)
    if (receipt.current?.fingerprint !== fingerprint) receipt.current = { fingerprint, id: newRequestId() }
    try {
      if (!env.controlled) throw new Error('Actions are unavailable in this host')
      const value = await env.controlled.invokeAction(contextOf(env), { ...action, requestId: receipt.current.id }, event)
      // A completed operation makes the next deliberate click a new request.
      // Keep the key after errors: execution may have reached the backend.
      receipt.current = undefined
      setStatus('Success: ' + JSON.stringify(value))
    } catch (err) { setStatus('Error: ' + (err instanceof Error ? err.message : String(err))) }
    finally { flight.current = false; setBusy(false) }
  }
  return <span className="diui-action"><button type="button" className="diui-button" disabled={busy || env.streaming} aria-busy={busy} onClick={e => { void invoke(e.nativeEvent) }}>{label}</button><span role="status">{status}</span></span>
}
