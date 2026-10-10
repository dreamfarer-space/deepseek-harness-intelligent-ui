import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Translate } from './types/dsh.ts'

/**
 * Return `value`, updating at most every `ms` while it keeps changing
 * (streaming arguments arrive per token; parsing every delta is wasteful).
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value)
  const latest = useRef(value)
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  latest.current = value
  useEffect(() => {
    const now = Date.now()
    const wait = ms - (now - last.current)
    if (wait <= 0) {
      last.current = now
      setShown(value)
      return
    }
    if (timer.current === undefined) {
      timer.current = setTimeout(() => {
        timer.current = undefined
        last.current = Date.now()
        setShown(latest.current)
      }, wait)
    }
  }, [value, ms])
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current) }, [])
  return shown
}

export type ShellState = 'generating' | 'ready' | 'error' | 'stopped'

/** The card chrome shared by both tool views. */
export function Shell(props: {
  kind: 'widget' | 'render'
  title: string
  state: ShellState
  status?: ReactNode
  actions?: ReactNode
  /** Banner between the head and the body (e.g. "generation stopped"). */
  notice?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="diui diui-shell" data-kind={props.kind} data-state={props.state} aria-busy={props.state === 'generating' || undefined}>
      <div className="diui-shell-head">
        <span className="diui-shell-icon" aria-hidden="true">{props.kind === 'widget' ? '◇' : '▦'}</span>
        <span className="diui-shell-title">{props.title}</span>
        {props.state === 'generating' && <span className="diui-dots" aria-hidden="true"><i /><i /><i /></span>}
        {props.status !== undefined && <span className="diui-shell-status" role="status" aria-live="polite">{props.status}</span>}
        {props.actions !== undefined && <span className="diui-shell-actions">{props.actions}</span>}
      </div>
      {props.notice !== undefined && <div className="diui-shell-notice" role="status">{props.notice}</div>}
      {props.children !== undefined && <div className="diui-shell-body">{props.children}</div>}
    </div>
  )
}

/** Collapsible failure detail (validation errors returned to the model). */
export function Problem(props: { message: string; detail?: string; t: Translate }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="diui-problem" role="status">
      <span>{props.message}</span>
      {props.detail && (
        <button type="button" className="diui-link" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? props.t('details.hide') : props.t('details.show')}
        </button>
      )}
      {open && props.detail && <pre className="diui-problem-detail">{props.detail}</pre>}
    </div>
  )
}

/** Skeleton with rotating status lines (widget placeholderMessages). */
export function Placeholder(props: { messages: readonly string[]; fallback: string; height?: number }) {
  const lines = props.messages.length ? props.messages : [props.fallback]
  const [i, setI] = useState(0)
  useEffect(() => {
    if (lines.length < 2) return
    const timer = setInterval(() => setI(n => n + 1), 1800)
    return () => clearInterval(timer)
  }, [lines.length])
  return (
    <div className="diui-placeholder" aria-live="polite" style={props.height ? { minHeight: Math.min(props.height, 480) } : undefined}>
      <div className="diui-skeleton" />
      <div className="diui-placeholder-text">{lines[i % lines.length]}</div>
    </div>
  )
}

/** Small text button used in shell headers. */
export function HeadButton(props: { label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="diui-head-button" onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.label}
    </button>
  )
}

/** Transient confirmation after an interaction was sent to the conversation. */
export function useFlash(): [string | undefined, (text: string) => void] {
  const [text, setText] = useState<string | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return [text, (next: string) => {
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setText(undefined), 4000)
  }]
}
