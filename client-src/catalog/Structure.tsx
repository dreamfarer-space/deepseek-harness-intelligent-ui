import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { getUiState, setUiState, useUiState } from '../state.ts'
import type { RenderEnv } from './components.tsx'
import { Inline } from './inline.tsx'
import { httpsUrl } from './media.ts'

/*
 * Structural widgets: disclosure lists, progress trails, dense key/value
 * summaries, empty states, follow-up chips, cited sources and small segmented
 * controls. Interaction state lives in the call's ui-state bag so a patch or a
 * remount keeps it; every string is React text, never HTML.
 */

interface AccordionItemSpec {
  id?: string
  title: string
  subtitle?: string
  text?: string
  badge?: string
  tone?: string
  defaultOpen?: boolean
}

/** Collapsible sections; one open at a time unless `multiple`. */
export function Accordion(props: { title?: string; multiple?: boolean; items: AccordionItemSpec[]; children: ReactNode[]; env: RenderEnv; nodeId: string }) {
  const { items, env } = props
  const keyOf = (it: AccordionItemSpec, i: number) => it.id ?? String(i)
  const defaults = items.flatMap((it, i) => (it.defaultOpen ? [keyOf(it, i)] : []))
  // A single-open accordion cannot honour several `defaultOpen` items: keep the first.
  const [open, setOpen] = useUiState<string[]>(env.callId, `${props.nodeId}:open`, props.multiple ? defaults : defaults.slice(0, 1))
  const uid = useId()
  const box = useRef<HTMLDivElement>(null)
  const openKeys = Array.isArray(open) ? open : []
  // WAI-ARIA accordion: arrows/Home/End move focus between headers (not expand).
  const nav = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    if (!items.length) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + step + items.length) % items.length
    box.current?.querySelectorAll<HTMLButtonElement>('.diui-accordion-trigger')[next]?.focus()
  }
  const toggle = (key: string) => {
    setOpen(prev => {
      const keys = Array.isArray(prev) ? prev : []
      return keys.includes(key) ? keys.filter(k => k !== key) : props.multiple ? [...keys, key] : [key]
    })
  }
  return (
    <div className="diui-accordion" ref={box}>
      {props.title && <h4 className="diui-accordion-title">{props.title}</h4>}
      {items.map((it, i) => {
        const key = keyOf(it, i)
        const isOpen = openKeys.includes(key)
        const triggerId = `${uid}-trigger-${i}`
        const panelId = `${uid}-panel-${i}`
        return (
          <div className="diui-accordion-item" data-open={isOpen || undefined} key={key}>
            <button type="button" className="diui-accordion-trigger" id={triggerId}
              aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(key)} onKeyDown={e => nav(e, i)}>
              <span className="diui-accordion-head">
                <span className="diui-accordion-label"><Inline text={it.title} /></span>
                {it.subtitle && <span className="diui-accordion-sub"><Inline text={it.subtitle} /></span>}
              </span>
              {it.badge && <span className="diui-badge" data-tone={it.tone ?? 'default'}>{it.badge}</span>}
              <span className="diui-accordion-caret" aria-hidden="true">▸</span>
            </button>
            <div id={panelId} role="region" aria-labelledby={triggerId} className="diui-accordion-panel" hidden={!isOpen}>
              {it.text && <div className="diui-text"><Inline text={it.text} /></div>}
              {props.children[i]}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type StepStatus = 'done' | 'active' | 'pending' | 'error'

const toneOfStatus: Record<StepStatus, string> = { done: 'success', active: 'info', pending: 'default', error: 'error' }

/** Ordered progress trail; `current` derives the statuses when none is given. */
export function Steps(props: { title?: string; current?: number; items: { id?: string; title: string; description?: string; status?: StepStatus }[]; env: RenderEnv }) {
  const { env } = props
  return (
    <div className="diui-steps-wrap">
      {props.title && <h4 className="diui-steps-title">{props.title}</h4>}
      <ol className="diui-steps">
        {props.items.map((it, i) => {
          const status: StepStatus = it.status
            ?? (props.current !== undefined
              ? (i < props.current ? 'done' : i === props.current ? 'active' : 'pending')
              : (i === 0 ? 'active' : 'pending'))
          return (
            <li className="diui-step" data-status={status} aria-current={status === 'active' ? 'step' : undefined} key={it.id ?? i}>
              <span className="diui-step-index" aria-hidden="true">{status === 'done' ? '✓' : status === 'error' ? '!' : i + 1}</span>
              <div className="diui-step-body">
                <div className="diui-step-head">
                  <span className="diui-step-title"><Inline text={it.title} /></span>
                  <span className="diui-badge" data-tone={toneOfStatus[status]}>{env.t(`steps.${status}`)}</span>
                </div>
                {it.description && <div className="diui-step-desc"><Inline text={it.description} /></div>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Dense key/value summary; `copyable` rows copy their rendered value. */
export function KeyValue(props: { title?: string; columns?: number; items: { key: string; value: string | number | boolean | null; hint?: string; tone?: string; copyable?: boolean }[]; env: RenderEnv }) {
  const { env } = props
  const [copied, setCopied] = useState<number | undefined>(undefined)
  const cols = Math.max(1, Math.min(3, Math.round(props.columns ?? 2)))
  const copy = (text: string, i: number) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(i), () => setCopied(undefined))
  }
  return (
    <div className="diui-kv">
      {props.title && <h4 className="diui-kv-title">{props.title}</h4>}
      <dl className="diui-kv-grid" style={{ ['--diui-kv-cols' as string]: cols }}>
        {props.items.map((it, i) => {
          const text = it.value === null || it.value === undefined ? '—' : String(it.value)
          return (
            <div className="diui-kv-item" data-tone={it.tone ?? 'default'} key={`${it.key}:${i}`}>
              <dt className="diui-kv-key">{it.key}</dt>
              <dd className="diui-kv-val-row">
                <span className="diui-kv-val">{text}</span>
                {it.copyable && <button type="button" className="diui-kv-copy" onClick={() => copy(text, i)}>{copied === i ? env.t('kv.copied') : env.t('kv.copy')}</button>}
              </dd>
              {it.hint && <div className="diui-kv-hint">{it.hint}</div>}
            </div>
          )
        })}
      </dl>
    </div>
  )
}

/** A quiet placeholder for "nothing here" — optionally with an action node. */
export function EmptyState(props: { title: string; description?: string; tone?: string; actionNode?: ReactNode }) {
  return (
    <div className="diui-empty-state" data-tone={props.tone ?? 'default'} role="status">
      <h4 className="diui-empty-state-title">{props.title}</h4>
      {props.description && <div className="diui-empty-state-desc"><Inline text={props.description} /></div>}
      {props.actionNode && <div className="diui-empty-state-actions">{props.actionNode}</div>}
    </div>
  )
}

interface FollowUpItem {
  id?: string
  label: string
  prompt: string
  sessionTarget?: 'current' | 'new'
}

/** Suggested next questions; each send is acknowledged and remembered. */
export function FollowUp(props: { title?: string; items: FollowUpItem[]; env: RenderEnv; nodeId: string; onSendItem: (item: FollowUpItem, index: number) => Promise<boolean>; busy: boolean; note?: string }) {
  const { env } = props
  const [sent, setSent] = useUiState<string[]>(env.callId, `${props.nodeId}:sent`, [])
  const sentKeys = Array.isArray(sent) ? sent : []
  const frozen = props.busy || env.streaming || !!env.stopped
  const send = async (it: FollowUpItem, i: number, key: string) => {
    if (frozen) return
    const ok = await props.onSendItem(it, i)
    // Only a confirmed send is remembered: a failed one stays clickable.
    if (ok) setSent(prev => {
      const keys = Array.isArray(prev) ? prev : []
      return keys.includes(key) ? keys : [...keys, key]
    })
  }
  return (
    <div className="diui-followup">
      {props.title && <div className="diui-followup-title">{props.title}</div>}
      <div className="diui-followup-list" role="group" aria-label={props.title ?? env.t('followup.title')}>
        {props.items.map((it, i) => {
          const key = it.id ?? String(i)
          const isSent = sentKeys.includes(key)
          return (
            <button key={key} type="button" className="diui-followup-chip" data-sent={isSent || undefined}
              disabled={props.busy || env.streaming || !!env.stopped || (it.sessionTarget === 'new' && isSent)}
              onClick={() => { void send(it, i, key) }}>
              <span aria-hidden="true">↗</span><span>{it.label}</span>
            </button>
          )
        })}
      </div>
      {props.note && <span className="diui-note" role="status">{props.note}</span>}
    </div>
  )
}

/** Cited sources: an https link when the URL is safe, plain text otherwise. */
export function Sources(props: { title?: string; items: { id?: string; title: string; url?: string; source?: string; note?: string }[]; env: RenderEnv }) {
  return (
    <div className="diui-sources">
      {props.title && <h4 className="diui-sources-title">{props.title}</h4>}
      <ol className="diui-sources-list">
        {props.items.map((it, i) => {
          const u = httpsUrl(it.url)
          return (
            <li className="diui-source-item" key={it.id ?? i}>
              <span className="diui-source-idx">[{i + 1}]</span>
              <div className="diui-source-body">
                {u
                  ? <a className="diui-source-link" href={u.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{it.title}</a>
                  : <span className="diui-source-title">{it.title}</span>}
                {it.source && <span className="diui-source-tag">{it.source}</span>}
                {it.note && <div className="diui-source-note">{it.note}</div>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

type SegValue = string | number | boolean

/**
 * A small exclusive control. Its own value lives under `${nodeId}:value`; with
 * `bindKey` it also mirrors a shared pool entry, so a Chart/Table/Progress
 * elsewhere in the answer recomputes on every change.
 */
export function Segmented(props: { label?: string; title?: string; bindKey?: string; defaultValue?: SegValue | null; options: { value: SegValue; label: string }[]; env: RenderEnv; nodeId: string }) {
  const { env, options } = props
  const bind = props.bindKey
  const initialVal: SegValue | undefined = props.defaultValue !== undefined && options.some(o => o.value === props.defaultValue)
    ? (props.defaultValue as SegValue)
    : options[0]?.value
  const [local, setLocal] = useUiState<SegValue | undefined>(env.callId, `${props.nodeId}:value`, initialVal)
  // A second subscription keeps the shared key live when a sibling block writes it.
  const [shared, setShared] = useUiState<SegValue | undefined>(env.callId, bind ?? `${props.nodeId}:unbound`, initialVal)
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!bind) return
    const current = getUiState(env.callId ?? '', bind)
    // Seed once or resynchronize if a patch removed the previously selected option.
    if (current !== undefined && options.some(o => o.value === current)) return
    setUiState(env.callId ?? '', bind, initialVal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bind, env.callId, options, initialVal])
  const raw = bind ? shared : local
  // A patch can drop the selected option: fall back to the declared initial value.
  const selected = options.some(o => o.value === raw) ? raw : initialVal
  const commit = (value: SegValue) => {
    setLocal(value)
    if (bind) setShared(value)
  }
  // WAI-ARIA radio group: arrows/Home/End select and move.
  const nav = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    if (!options.length) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (i + step + options.length) % options.length
    const opt = options[next]
    if (!opt) return
    commit(opt.value)
    track.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus()
  }
  return (
    <div className="diui-segmented">
      {(props.label ?? props.title) && <div className="diui-segmented-label">{props.label ?? props.title}</div>}
      <div className="diui-segmented-track" role="radiogroup" aria-label={props.label ?? props.title ?? 'Segmented control'} ref={track}>
        {options.map((opt, i) => {
          const checked = opt.value === selected
          return (
            <button key={`${String(opt.value)}:${i}`} type="button" role="radio" aria-checked={checked}
              tabIndex={checked ? 0 : -1} className="diui-segmented-btn" onClick={() => commit(opt.value)} onKeyDown={e => nav(e, i)}>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
