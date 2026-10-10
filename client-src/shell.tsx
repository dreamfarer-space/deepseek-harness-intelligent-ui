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

export type ShellState = 'generating' | 'ready' | 'error'

/** The card chrome shared by both tool views. */
export function Shell(props: {
  kind: 'widget' | 'render'
  title: string
  state: ShellState
  status?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="diui diui-shell" data-kind={props.kind} data-state={props.state}>
      <div className="diui-shell-head">
        <span className="diui-shell-icon" aria-hidden="true">{props.kind === 'widget' ? '◇' : '▦'}</span>
        <span className="diui-shell-title">{props.title}</span>
        {props.state === 'generating' && <span className="diui-dots" aria-hidden="true"><i /><i /><i /></span>}
        {props.status !== undefined && <span className="diui-shell-status">{props.status}</span>}
      </div>
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
        <button type="button" className="diui-link" onClick={() => setOpen(o => !o)}>
          {open ? props.t('details.hide') : props.t('details.show')}
        </button>
      )}
      {open && props.detail && <pre className="diui-problem-detail">{props.detail}</pre>}
    </div>
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
