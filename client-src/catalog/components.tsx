import { useId, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { newRequestId, projectData } from '../../src/controlled/runtime.js'
import { contextOf, type ControlledEnv, type DataRef } from '../controlled.ts'
import { componentEntry, validateProps, validateComponentVersion } from '../../src/catalog/catalog.js'
import { resolveComputedProps } from '../../src/catalog/computed.js'
import { subscribeCatalog } from '../../src/catalog/extensions.js'
import { fieldInitialValue, type BoundField, type ComputedContext } from './computed-context.ts'
import { ExtensionBoundary, ExtensionSurface, extensionRenderer } from './extensions.tsx'
import { BridgeGuard, formatFormSubmission } from '../bridge.ts'
import type { WidgetPolicy } from '../policy.ts'
import { getUiState, setPersistentUiState, setUiState, useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'
import { Chart, formatNumber, type ChartProps } from './Chart.tsx'
import { Inline } from './inline.tsx'
import { LibFrame } from './LibFrame.tsx'
import { Plot, type PlotProps } from './Plot.tsx'
import { CodeDiff, FileTree, JsonView } from './CodeView.tsx'
import { Heatmap, Scatter, type HeatmapProps, type ScatterProps } from './Scatter.tsx'
import { GeoMap, type GeoMapProps } from './GeoMap.tsx'
import { Gallery, PhotoImage, type Photo } from './Photo.tsx'
import { Video, type VideoProps } from './Video.tsx'
import { Audio, type AudioProps } from './Audio.tsx'
import { Calendar, type CalendarProps } from './Calendar.tsx'
import { Accordion, EmptyState, FollowUp, KeyValue, Segmented, Sources, Steps } from './Structure.tsx'
import { ExportButtons, Table, matchesExpression, type Cell } from './Table.tsx'

export { compareCells } from './Table.tsx'

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
  /**
   * Resolved `computed` values of this surface, recomputed on every shared-state
   * broadcast. Absent when the tree declares no `computed` array.
   */
  computed?: ComputedContext
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
  // Components consume resolved props: `{"$computed":"pct"}` becomes 85 and
  // `{{total}}` becomes its formatted text, in this node and its children.
  const shaped = env.computed ? resolveComputedProps(node, env.computed) : node
  const kids = entry?.children
    ? (node.children ?? []).map(c => renderNode(c, env, depth + 1, nextTrail))
    : []
  if (renderer) return <ExtensionBoundary key={`${node.type}:${node.componentVersion}:${entry.generation}`}><ExtensionSurface renderer={renderer} node={shaped} env={env}>{kids}</ExtensionSurface></ExtensionBoundary>
  return <Component key={id} node={shaped} env={env}>{kids}</Component>
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
    case 'Grid': {
      const gap = typeof p.gap === 'number' && Number.isFinite(p.gap) && p.gap >= 0 && p.gap <= 64 ? p.gap : undefined
      return <div className="diui-grid" style={{ ['--diui-cols' as string]: Math.round(p.columns), ...(gap !== undefined ? { gap } : {}) }}>{children}</div>
    }
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
      // A computed value can be missing (formula error): fall back to 0, never NaN.
      const value = typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0
      const pct = Math.max(0, Math.min(100, (value / max) * 100))
      return (
        <div className="diui-progress" data-tone={p.tone ?? 'default'} data-value={value}>
          {p.label && <div className="diui-progress-label"><span>{p.label}</span><span>{Math.round(pct)}%</span></div>}
          <div className="diui-progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
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
      return <Table columns={p.columns} rows={p.rows} caption={p.caption} sortable={p.sortable} columnTypes={p.columnTypes}
        searchable={p.searchable} filterable={p.filterable} pageSize={p.pageSize} exportable={p.exportable}
        filterField={p.filterField} filterValue={p.filterValue} t={env.t} callId={env.callId} nodeId={node.id} />
    case 'Chart': {
      if (p.dataRef) return <BoundData kind="Chart" props={p} env={env} nodeId={node.id} />
      // A computed series value resolves to a number; a formula that failed
      // leaves the slot empty instead of inventing a data point.
      const series = Array.isArray(p.series) ? p.series as ChartProps['series'] : []
      const labels = Array.isArray(p.labels) ? p.labels as Cell[] : []
      return (
        <div className="diui-chart-block">
          <Chart {...(p as ChartProps)} labels={labels} series={series} emptyText={env.t('chart.empty')} />
          {p.exportable && <ExportButtons columns={['', ...series.map(x => x.name)]} name={p.title}
            rows={labels.map((l, i) => [l, ...series.map(x => x.values[i] ?? null)])} t={env.t} />}
        </div>
      )
    }
    case 'Scatter':
      return <Scatter {...(p as ScatterProps)} emptyText={env.t('chart.empty')} missingText={count => env.t('chart.missingPoints', { count })} />
    case 'Heatmap':
      return <Heatmap {...(p as HeatmapProps)} emptyText={env.t('chart.empty')} noDataText={env.t('chart.noData')} />
    case 'CodeDiff':
      return <CodeDiff files={p.files} title={p.title} context={p.context} t={env.t} callId={env.callId} nodeId={node.id} />
    case 'FileTree':
      return <FileTree entries={p.entries} title={p.title} expandDepth={p.expandDepth} t={env.t} callId={env.callId} nodeId={node.id} />
    case 'JsonView':
      return <JsonView data={p.data} title={p.title} expandDepth={p.expandDepth} t={env.t} callId={env.callId} nodeId={node.id} />
    case 'Map':
      return <GeoMap {...(p as Omit<GeoMapProps, 'tiles' | 'nodeId' | 't'>)} tiles={env.policy.mapTiles} callId={env.callId} nodeId={node.id} t={env.t} />
    case 'Image':
      return <PhotoImage {...(p as Photo & { height?: number; fit?: 'cover' | 'contain' })} policy={env.policy} t={env.t} />
    case 'Gallery':
      return <Gallery images={p.images as Photo[]} title={p.title} columns={p.columns} policy={env.policy} t={env.t} />
    case 'Video':
      return <Video key={p.src} {...(p as VideoProps)} policy={env.policy} t={env.t} />
    case 'Button':
      if (p.action) return <ControlledButton label={p.label} action={p.action} env={env} />
      return <ActionButton label={p.label} prompt={p.prompt} variant={p.variant} sessionTarget={p.sessionTarget} env={env} nodeId={node.id} />
    case 'Choice':
      return <Choice props={p as ChoiceProps} env={env} nodeId={node.id} />
    case 'Form':
      return <Form props={p} env={env} nodeId={node.id} />
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
    case 'Accordion':
      return <Accordion title={p.title} multiple={p.multiple} items={p.items} env={env} nodeId={node.id}>{children}</Accordion>
    case 'Steps':
      return <Steps title={p.title} current={p.current} items={p.items} env={env} />
    case 'KeyValue':
      return <KeyValue title={p.title} columns={p.columns} items={p.items} env={env} />
    case 'EmptyState': {
      let actionNode: ReactNode
      if (p.action && typeof p.actionLabel === 'string') {
        actionNode = <ControlledButton label={p.actionLabel} action={p.action} env={env} />
      } else if (typeof p.prompt === 'string' && typeof p.actionLabel === 'string') {
        actionNode = <ActionButton label={p.actionLabel} prompt={p.prompt} variant="primary" sessionTarget={p.sessionTarget} env={env} nodeId={node.id} />
      }
      return <EmptyState title={p.title} description={p.description} tone={p.tone} actionNode={actionNode} />
    }
    case 'FollowUp':
      return <FollowUpCard props={p} env={env} nodeId={node.id} />
    case 'Sources':
      return <Sources title={p.title} items={p.items} env={env} />
    case 'Segmented':
      return <Segmented label={p.label} title={p.title} bindKey={p.bindKey} defaultValue={p.defaultValue} options={p.options} env={env} nodeId={node.id} />
    case 'Calendar':
      return <Calendar {...(p as Omit<CalendarProps, 'callId' | 'nodeId' | 't'>)} callId={env.callId} nodeId={node.id} t={env.t} />
    case 'Audio':
      return <Audio key={p.src} {...(p as AudioProps)} policy={env.policy} t={env.t} />
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
function useSessionSend(env: RenderEnv, nodeId: string, target?: SessionTarget, freeze = false, launchNodeId = nodeId) {
  const key = `${nodeId}:launchPrompt`
  const [launchText] = useUiState<string | { text: string; nodeId: string } | undefined>(env.callId, key, undefined)
  const isNew = target === 'new' || (freeze && launchText !== undefined)
  const [send, busy, note] = useSend({
    ...env,
    send: async text => {
      const frozen = freeze ? getUiState<string | { text: string; nodeId: string }>(env.callId ?? '', key) : undefined
      if (target !== 'new' && frozen === undefined) return env.send(text)
      if (!env.sendNewSession) throw new Error(env.t('session.unavailable'))
      // Validate before freezing; the surface still applies its own admission/rate guard.
      const payload = new BridgeGuard({ policy: env.policy, armDelayMs: 0, minIntervalMs: 0 }).admitPrompt((typeof frozen === 'string' ? frozen : frozen?.text) ?? text)
      const actionId = typeof frozen === 'string' ? nodeId : frozen?.nodeId ?? launchNodeId
      if (freeze && !setPersistentUiState(env.callId ?? '', key, { text: payload, nodeId: actionId })) {
        throw new Error(env.t('session.recoveryUnavailable'))
      }
      await env.sendNewSession(payload, actionId)
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

function FollowUpCard({ props, env, nodeId }: { props: Record<string, any>; env: RenderEnv; nodeId: string }) {
  const [sendHere, busyHere, noteHere] = useSend(env)
  const [sendNew, busyNew, noteNew] = useSend({
    ...env,
    send: async text => {
      if (!env.sendNewSession) throw new Error(env.t('session.unavailable'))
      const payload = new BridgeGuard({ policy: env.policy, armDelayMs: 0, minIntervalMs: 0 }).admitPrompt(text)
      await env.sendNewSession(payload, nodeId)
    },
  }, true)
  const [lastTarget, setLastTarget] = useState<SessionTarget>('current')
  const onSendItem = async (item: { id?: string; label: string; prompt: string; sessionTarget?: SessionTarget }, _index: number) => {
    const target: SessionTarget = item.sessionTarget === 'new' ? 'new' : 'current'
    setLastTarget(target)
    return (target === 'new' ? sendNew : sendHere)(item.prompt)
  }
  return (
    <FollowUp
      title={props.title}
      items={props.items}
      env={env}
      nodeId={nodeId}
      onSendItem={onSendItem}
      busy={busyHere || busyNew}
      note={lastTarget === 'new' ? noteNew : noteHere}
    />
  )
}

interface ChoiceOption { id?: string; label: string; description?: string; prompt: string }
interface ChoiceProps {
  question: string
  options: ChoiceOption[]
  recommended?: string
  submitLabel?: string
  sessionTarget?: SessionTarget
  multiple?: boolean
  minSelect?: number
  maxSelect?: number
  variant?: 'cards' | 'chips'
}

function Choice({ props, env, nodeId }: { props: ChoiceProps; env: RenderEnv; nodeId: string }) {
  // Numeric selections and launch ids preserve existing id-less Choice cards.
  const [picked, setPicked] = useUiState<string | number | null>(env.callId, `${nodeId}:picked`, null)
  const [pickedMulti, setPickedMulti] = useUiState<(string | number)[]>(env.callId, `${nodeId}:pickedMulti`, [])
  const [done, setDone] = useUiState<SessionTarget | null>(env.callId, `${nodeId}:done`, null)
  const isMulti = props.multiple === true
  const index = props.options.findIndex((option, i) => typeof picked === 'string' ? option.id === picked : i === picked)
  const option = props.options[index]
  const multiKeys = Array.isArray(pickedMulti) ? pickedMulti : []
  const selectedIndices = props.options.flatMap((opt, i) => (
    multiKeys.some(k => typeof k === 'string' ? opt.id === k : i === k) ? [i] : []
  ))
  const selectedOptions = selectedIndices.map(i => props.options[i]!)
  const minReq = props.minSelect ?? 1
  const maxReq = props.maxSelect ?? props.options.length
  const hasValidSelection = isMulti
    ? (selectedOptions.length >= minReq && selectedOptions.length <= maxReq)
    : Boolean(option)
  const launchSuffix = isMulti
    ? selectedOptions.map((o, idx) => o.id ?? selectedIndices[idx]).join('+')
    : String(option?.id ?? index)
  const [sendHere, busyHere, noteHere] = useSend(env)
  const { send: sendNew, busy: busyNew, note: noteNew, frozen } =
    useSessionSend(env, nodeId, 'new', true, `${nodeId}#${launchSuffix}`)
  const [last, setLast] = useState<SessionTarget | null>(null)
  const inFlight = useRef(false)
  const uid = useId()
  const locked = done !== null || busyHere || busyNew || env.streaming || !!env.stopped
  const primaryTarget: SessionTarget = frozen || props.sessionTarget === 'new' ? 'new' : 'current'
  const go = async (target: SessionTarget) => {
    if (inFlight.current || locked || (!hasValidSelection && !frozen)) return
    if (target === 'current' && getUiState(env.callId ?? '', `${nodeId}:launchPrompt`) !== undefined) return
    const promptPayload = isMulti ? selectedOptions.map(o => o.prompt).join('\n\n') : (option?.prompt ?? '')
    inFlight.current = true
    setLast(target)
    try {
      if (await (target === 'new' ? sendNew : sendHere)(promptPayload)) setDone(target)
    } finally { inFlight.current = false }
  }
  const toggleMulti = (item: ChoiceOption, i: number) => {
    const key = item.id ?? i
    setPickedMulti(prev => {
      const list = Array.isArray(prev) ? prev : []
      const exists = list.some(k => typeof k === 'string' ? item.id === k : i === k)
      if (exists) return list.filter(k => !(typeof k === 'string' ? item.id === k : i === k))
      if (selectedOptions.length >= maxReq) return list
      return [...list, key]
    })
  }
  const label = done ? env.t(done === 'new' ? 'session.started' : 'choice.sent')
    : frozen ? targetLabel(env.t('session.retry'), env, true)
    : props.sessionTarget ? targetLabel(props.submitLabel ?? env.t('choice.continue'), env, primaryTarget === 'new')
    : props.submitLabel ? targetLabel(props.submitLabel, env, false) : env.t('choice.continue')
  const note = done ? env.t(done === 'new' ? 'session.started' : 'choice.sent')
    : last === 'new' ? noteNew : noteHere
  return (
    <form className="diui-choice" onSubmit={event => { event.preventDefault(); void go(primaryTarget) }}>
      <fieldset disabled={locked || frozen} aria-describedby={`${uid}-hint`}>
        <legend className="diui-choice-question">{props.question}</legend>
        <div className="diui-choice-options" role={isMulti ? 'group' : 'radiogroup'} data-variant={props.variant ?? 'cards'}>
          {props.options.map((item, i) => {
            const isChecked = isMulti ? selectedIndices.includes(i) : i === index
            const atCap = isMulti && !isChecked && selectedOptions.length >= maxReq
            return (
              <label key={item.id ?? i} className="diui-choice-option" data-selected={isChecked || undefined}>
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name={`${uid}-choice`}
                  value={item.id ?? i}
                  checked={isChecked}
                  disabled={atCap}
                  aria-describedby={item.description ? `${uid}-${i}-description` : undefined}
                  onChange={() => (isMulti ? toggleMulti(item, i) : setPicked(item.id ?? i))}
                />
                <span className="diui-choice-text">
                  <span className="diui-choice-label">{item.label}
                    {item.id !== undefined && item.id === props.recommended &&
                      <span className="diui-choice-recommended">{env.t('choice.recommended')}</span>}
                  </span>
                  {item.description && <span className="diui-choice-desc" id={`${uid}-${i}-description`}>{item.description}</span>}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
      <div className="diui-choice-actions">
        <button type="submit" className="diui-button diui-choice-submit" data-variant="primary"
          disabled={locked || (!hasValidSelection && !frozen)} aria-busy={busyHere || busyNew || undefined}>{label}</button>
        {!props.sessionTarget && !frozen && env.sendNewSession &&
          <button type="button" className="diui-button" data-variant="secondary" disabled={locked || !hasValidSelection}
            aria-busy={busyNew || undefined} onClick={() => { void go('new') }}>{env.t('choice.newSession')}</button>}
        <span className="diui-note" role="status" aria-live="polite">{note}</span>
      </div>
      <span className="diui-choice-hint" id={`${uid}-hint`}>{env.t(frozen ? 'session.retryHint' : isMulti ? 'choice.multiHint' : 'choice.hint')}</span>
    </form>
  )
}


interface FieldSpec { name: string; label: string; type: string; options?: string[]; required?: boolean; placeholder?: string; default?: unknown; min?: number; max?: number; step?: number; maxTags?: number; searchable?: boolean; bindKey?: string }

function initialValue(f: FieldSpec): unknown {
  return fieldInitialValue(f as BoundField)
}

function TagsFieldInput(props: { id: string; field: FieldSpec; value: readonly string[]; disabled: boolean; env: RenderEnv; onChange: (next: string[]) => void }) {
  const { id, field, value, disabled, env, onChange } = props
  const [draft, setDraft] = useState('')
  const [dup, setDup] = useState<string | null>(null)
  const maxTags = field.maxTags ?? 20
  const commitTokens = (raw: string) => {
    const parts = raw.split(/[,，;\n\r]+/).map(s => s.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    let duplicateFound: string | null = null
    for (const token of parts) {
      if (next.includes(token)) {
        duplicateFound = token
        continue
      }
      if (next.length < maxTags) next.push(token)
    }
    setDup(duplicateFound)
    if (next.length !== value.length) onChange(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault()
      if (draft.trim()) {
        commitTokens(draft)
        setDraft('')
      }
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      setDup(null)
      onChange(value.slice(0, -1))
    }
  }
  return (
    <div className="diui-tags-wrap">
      <div className="diui-tags" data-duplicate={dup ? 'true' : undefined}>
        {value.map(tag => (
          <span key={tag} className="diui-tag-chip">
            <span>{tag}</span>
            <button type="button" className="diui-tag-remove" disabled={disabled}
              aria-label={env.t('form.tagRemove', { tag })}
              onClick={() => { setDup(null); onChange(value.filter(t => t !== tag)) }}>×</button>
          </span>
        ))}
        <input
          id={id}
          name={field.name}
          type="text"
          className="diui-tag-input"
          disabled={disabled || value.length >= maxTags}
          placeholder={value.length >= maxTags ? env.t('form.tagMax', { max: maxTags }) : (field.placeholder ?? env.t('form.tagPlaceholder'))}
          value={draft}
          onChange={e => {
            const v = e.target.value
            setDup(null)
            if (/[,，;\n]/.test(v)) {
              commitTokens(v)
              setDraft('')
            } else {
              setDraft(v)
            }
          }}
          onKeyDown={onKeyDown}
          onBlur={() => { if (draft.trim()) { commitTokens(draft); setDraft('') } }}
          onPaste={e => {
            const text = e.clipboardData?.getData('text')
            if (text && /[,，;\n\r]/.test(text)) {
              e.preventDefault()
              commitTokens(text)
            }
          }}
        />
      </div>
      {dup && <span className="diui-note" role="status">{env.t('form.tagDuplicate', { tag: dup })}</span>}
    </div>
  )
}

function SelectFieldInput(props: { common: { id: string; name: string; required?: boolean; disabled: boolean }; field: FieldSpec; value: string; env: RenderEnv; onChange: (val: string) => void }) {
  const { common, field, value, env, onChange } = props
  const options = field.options ?? []
  const searchable = field.searchable === true || options.length >= 15
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => o === value || o.toLowerCase().includes(q)) : options
  const selectEl = (
    <select {...common} value={value} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>{field.placeholder ?? env.t('form.choose')}</option>
      {filtered.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  if (!searchable) return selectEl
  return (
    <div className="diui-select-wrap">
      <input
        type="search"
        className="diui-input diui-select-search"
        aria-label={env.t('form.selectSearch')}
        placeholder={env.t('form.selectSearch')}
        disabled={common.disabled}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {selectEl}
    </div>
  )
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
  // Linkage: a field with `bindKey` — or one a computed formula reads — publishes
  // its value to the shared state pool, so a Progress/Chart/Table anywhere in the
  // same answer recomputes on every keystroke and drag. Internal form values stay
  // under `${nodeId}:values`, untouched by other blocks.
  const live = env.computed?.liveKeys
  // A form-level bindKey names the value of a single-field form; it publishes
  // like a field binding, even when the field declares no bindKey of its own.
  const formKey = typeof props.bindKey === 'string' && props.bindKey !== '' && fields.length === 1 ? props.bindKey : undefined
  /**
   * Shared-state keys one field publishes. The field's own `bindKey` is an
   * explicit binding and always publishes; a bare `name` publishes only when a
   * formula reads it (so same-named fields in other forms do not collide); a
   * single-field form adds its form-level `bindKey`. A field that declares
   * `bindKey` keeps its `name` as an alias, because the Host accepts either
   * name in a formula.
   */
  const keysOf = (f: FieldSpec): string[] => {
    const keys: string[] = []
    if (typeof f.bindKey === 'string' && f.bindKey !== '') keys.push(f.bindKey)
    if (live?.has(f.name) && !keys.includes(f.name)) keys.push(f.name)
    if (formKey !== undefined && !keys.includes(formKey)) keys.push(formKey)
    return keys
  }
  const publishes = (f: FieldSpec) => keysOf(f).length > 0
  const publish = (f: FieldSpec, v: unknown) => {
    for (const key of keysOf(f)) setUiState(env.callId ?? '', key, v)
  }
  useEffect(() => {
    for (const f of fields) {
      for (const key of keysOf(f)) {
        // Seed once: a stored value (an earlier run, or a sibling block) wins.
        if (getUiState(env.callId ?? '', key) !== undefined) continue
        setUiState(env.callId ?? '', key, values[f.name])
      }
    }
  // The values object changes on every edit; the guard above keeps this a one-time seed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, env.callId, live])
  const set = (name: string, v: unknown) => {
    setValues(prev => ({ ...prev, [name]: v }))
    const f = fields.find(x => x.name === name)
    if (f && publishes(f)) publish(f, v)
  }
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || done || env.streaming || env.stopped) return
    const out: Record<string, unknown> = Object.create(null)
    const setOut = (key: string, val: unknown) => {
      Object.defineProperty(out, key, { value: val, enumerable: true, configurable: true, writable: true })
    }
    for (const f of fields) {
      const v = values[f.name]
      if (f.type === 'tags') {
        const list = Array.isArray(v) ? v.map(String).filter(Boolean) : []
        if (f.required && list.length === 0) return
        setOut(f.name, list)
      } else if (f.type === 'daterange') {
        const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as { start?: string; end?: string }) : { start: '', end: '' }
        const start = String(r.start ?? '')
        const end = String(r.end ?? '')
        if (f.required && (!start || !end)) return
        if (start && end && start > end) return
        setOut(f.name, { start, end })
      } else if (f.type === 'checkbox' || f.type === 'switch') {
        if (f.type === 'switch' && f.required && v !== true) return
        setOut(f.name, v === true)
      } else if (f.type === 'number' || f.type === 'range') {
        setOut(f.name, v === '' || v === undefined ? null : Number(v))
      } else {
        setOut(f.name, v)
      }
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
            input = <SelectFieldInput common={common} field={f} value={String(v ?? '')} env={env} onChange={val => set(f.name, val)} />
            break
          case 'checkbox':
            input = <input {...common} required={false} type="checkbox" checked={v === true} onChange={e => set(f.name, e.target.checked)} />
            break
          case 'switch':
            input = (
              <button id={id} type="button" role="switch" aria-checked={v === true} disabled={common.disabled}
                className="diui-switch" onClick={() => set(f.name, !(v === true))}>
                <span className="diui-switch-thumb" aria-hidden="true" />
              </button>
            )
            break
          case 'tags':
            input = (
              <TagsFieldInput
                id={id}
                field={f}
                value={Array.isArray(v) ? v.map(String) : []}
                disabled={common.disabled}
                env={env}
                onChange={next => set(f.name, next)}
              />
            )
            break
          case 'daterange': {
            const rangeVal = v && typeof v === 'object' && !Array.isArray(v) ? (v as { start?: string; end?: string }) : { start: '', end: '' }
            const start = String(rangeVal.start ?? '')
            const end = String(rangeVal.end ?? '')
            input = (
              <div className="diui-daterange" role="group" aria-label={f.label}>
                <input
                  id={id}
                  name={`${f.name}.start`}
                  type="date"
                  aria-label={env.t('form.dateStart')}
                  required={f.required}
                  disabled={common.disabled}
                  max={end || undefined}
                  value={start}
                  onChange={e => set(f.name, { start: e.target.value, end })}
                />
                <span aria-hidden="true">–</span>
                <input
                  id={`${id}-end`}
                  name={`${f.name}.end`}
                  type="date"
                  aria-label={env.t('form.dateEnd')}
                  required={f.required}
                  disabled={common.disabled}
                  min={start || undefined}
                  value={end}
                  onChange={e => set(f.name, { start, end: e.target.value })}
                />
              </div>
            )
            break
          }
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
    const { columns, rows: allRows } = projectData(entry) as { columns: string[]; rows: Cell[][] }
    const set = (patch: Record<string, unknown>) => runtime.setView(ctx, ref, patch)
    if (kind === 'Chart') {
      const cols = p.valueColumns as number[]
      if (p.labelColumn >= columns.length || cols.some(c => c >= columns.length) || allRows.some(r => cols.some(c => typeof r[c] !== 'number'))) throw new Error('Chart columns must reference numeric data')
      const series = cols.map(c => ({ name: columns[c]!, values: allRows.map(r => r[c] as number) }))
      return <div className="diui-chart-block">
        <Chart {...p as ChartProps} labels={allRows.map(r => r[p.labelColumn] ?? null)} series={series} emptyText={env.t('chart.empty')} />
        {p.exportable && <ExportButtons columns={[columns[p.labelColumn]!, ...series.map(x => x.name)]} rows={allRows.map(r => [r[p.labelColumn] ?? null, ...cols.map(c => r[c] ?? null)])} name={p.title} t={env.t} />}
      </div>
    }
    // Linkage filter: a computed `filterValue` (">= {{threshold}}") narrows the
    // bound rows before paging, counting and export — the same rule an inline
    // Table follows, instead of silently showing every row.
    const filterField = typeof p.filterField === 'string' ? p.filterField : undefined
    const filterValue = typeof p.filterValue === 'string' ? p.filterValue : ''
    let rows = allRows
    if (filterField !== undefined && filterValue.trim() !== '') {
      const col = columns.indexOf(filterField)
      if (col < 0) throw new Error(`filterField must name one of the data columns (${columns.join(', ')})`)
      rows = rows.filter(r => matchesExpression(r[col], filterValue))
    }
    const size = p.pageSize ?? 20, pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.min(entry.view.page, pages - 1)
    return <div>
      <label>Search <input aria-label="Search dataset" value={entry.view.search} onChange={e => set({ search: e.target.value, page: 0 })} /></label>
      <label>Filter <select aria-label="Filter column" value={entry.view.filterColumn} onChange={e => set({ filterColumn: Number(e.target.value), page: 0 })}><option value={-1}>All columns</option>{columns.map((c, i) => <option key={i} value={i}>{c}</option>)}</select></label>
      {entry.view.filterColumn >= 0 && <input aria-label="Filter value" value={entry.view.filterValue} onChange={e => set({ filterValue: e.target.value, page: 0 })} />}
      <label>Sort <select aria-label="Sort dataset" value={entry.view.sortColumn} onChange={e => set({ sortColumn: Number(e.target.value), page: 0 })}><option value={-1}>Original order</option>{columns.map((c, i) => <option key={i} value={i}>{c}</option>)}</select></label>
      <button type="button" onClick={() => set({ descending: !entry.view.descending })}>{entry.view.descending ? 'Descending' : 'Ascending'}</button>
      {p.exportable && <ExportButtons columns={columns} rows={rows} name={p.caption} t={env.t} />}
      <Table columns={columns} rows={rows.slice(page * size, (page + 1) * size)} caption={p.caption} columnTypes={p.columnTypes} t={env.t} callId={env.callId} nodeId={nodeId} />
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
