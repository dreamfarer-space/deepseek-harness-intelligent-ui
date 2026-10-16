/**
 * Partial UIs from stopped turns. When the user stops a turn while a UI tool
 * call is still streaming its arguments, DSH drops the unfinished call: no
 * `tool/call` or `tool/result` reaches the session log, and the streaming view
 * simply unmounts. The view stashes its last argument prefix here (per
 * session, mirrored to localStorage), and the Turn tail re-presents it beneath
 * the stopped turn as an "interrupted" card with whatever was already
 * generated and a Regenerate action.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

export interface InterruptedUi {
  readonly callId: string
  readonly toolName: string
  readonly argsRaw: string
  /** Browser epoch ms when the call was dropped. */
  readonly at: number
}

const PREFIX = 'diui:v1:interrupted:'
const MAX_PER_SESSION = 20
const MAX_ARGS_CHARS = 200_000
const EMPTY: readonly InterruptedUi[] = Object.freeze([])
const memory = new Map<string, readonly InterruptedUi[]>()
const listeners = new Map<string, Set<() => void>>()

function read(sessionId: string): readonly InterruptedUi[] {
  const hit = memory.get(sessionId)
  if (hit) return hit
  let list: readonly InterruptedUi[] = EMPTY
  try {
    const raw = localStorage.getItem(PREFIX + sessionId)
    const parsed = raw ? JSON.parse(raw) as unknown : undefined
    if (Array.isArray(parsed)) list = parsed.filter((x): x is InterruptedUi => !!x && typeof x.callId === 'string' && typeof x.argsRaw === 'string' && typeof x.at === 'number')
  } catch { /* unavailable */ }
  memory.set(sessionId, list)
  return list
}

/** Remember a UI call that was dropped mid-stream. */
export function stashInterrupted(sessionId: string, entry: InterruptedUi): void {
  if (!entry.argsRaw.trim() || entry.argsRaw.length > MAX_ARGS_CHARS) return
  const list = [...read(sessionId).filter(x => x.callId !== entry.callId), entry].slice(-MAX_PER_SESSION)
  memory.set(sessionId, list)
  try { localStorage.setItem(PREFIX + sessionId, JSON.stringify(list)) } catch { /* memory only */ }
  for (const l of [...(listeners.get(sessionId) ?? [])]) l()
}

export function useInterrupted(sessionId: string | undefined): readonly InterruptedUi[] {
  const id = sessionId ?? ''
  const subscribe = useCallback((l: () => void) => {
    let set = listeners.get(id)
    if (!set) listeners.set(id, set = new Set())
    set.add(l)
    return () => { set!.delete(l) }
  }, [id])
  return useSyncExternalStore(subscribe, () => (id ? read(id) : EMPTY), () => (id ? read(id) : EMPTY))
}

/**
 * Whether a dropped call belongs to a Turn, from the Turn's start/end event
 * times. A small tolerance absorbs host/browser clock offsets.
 */
export function inTurn(entry: InterruptedUi, start: number | undefined, end: number | undefined): boolean {
  if (start === undefined || start < 1e12) return false
  // The drop happens while the turn is open, so a later turn (e.g. the
  // Regenerate request, sent seconds after) starts after it and never claims it.
  return entry.at >= start - 500 && entry.at <= (end ?? Infinity) + 3000
}

/**
 * Stash this view's argument prefix if it unmounts while still preparing
 * (DSH dropped the call because the turn was stopped). If the call actually
 * completes elsewhere (e.g. the user switched sessions mid-stream), the Turn
 * tail ignores the stash because a real result with the same callId exists.
 */
export function useStashOnDrop(view: { phase: string; callId: string; toolName: string; sessionId?: string; controlled?: unknown }, partial: string): void {
  const last = useRef({ preparing: false, raw: '' })
  last.current = view.phase === 'preparing' ? { preparing: true, raw: partial || last.current.raw } : { preparing: false, raw: '' }
  const ids = useRef(view)
  ids.current = view
  useEffect(() => () => {
    const { preparing, raw } = last.current
    const { sessionId, callId, toolName } = ids.current
    if (!ids.current.controlled && preparing && raw && sessionId) stashInterrupted(sessionId, { callId, toolName, argsRaw: raw, at: Date.now() })
  }, [])
}

/** Test hook. */
export function resetInterruptedMemory(): void {
  memory.clear()
}
