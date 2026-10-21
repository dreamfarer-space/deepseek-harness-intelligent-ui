/**
 * Per-call UI state that survives remounts. A generated UI is mounted more
 * than once over its life: inline while streaming, again beneath the reply
 * when the Turn ends (see turn.ts), and again after a page reload. Interaction
 * state (form values, a submitted flag, the open tab, slider positions, widget
 * `UI.state`) is kept here keyed by tool call id, in memory and mirrored to
 * localStorage so a reload restores it.
 *
 * Storage is best-effort: it can be unavailable (private mode, quota) and the
 * UI must work without it. Entries are bounded in size and count.
 */
import { useCallback, useSyncExternalStore } from 'react'

const PREFIX = 'diui:v1:'
/** Longest JSON a single call's state may serialize to. */
export const MAX_STATE_CHARS = 100_000
/** Oldest entries are evicted beyond this many stored calls. */
const MAX_ENTRIES = 200

type Bag = Record<string, unknown>

const memory = new Map<string, Bag>()
const listeners = new Map<string, Set<() => void>>()

function storage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}

function load(callId: string): Bag {
  const hit = memory.get(callId)
  if (hit) return hit
  let bag: Bag = {}
  try {
    const raw = storage()?.getItem(PREFIX + callId)
    const parsed = raw ? JSON.parse(raw) as unknown : undefined
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) bag = (parsed as { v?: Bag }).v ?? {}
  } catch { /* corrupt or unavailable */ }
  memory.set(callId, bag)
  return bag
}

function persist(callId: string, bag: Bag): boolean {
  const s = storage()
  if (!s) return false
  try {
    const key = PREFIX + callId
    const json = JSON.stringify({ t: Date.now(), v: bag })
    s.setItem(key, json)
    if (s.getItem(key) !== json) return false
  } catch { return false }
  // Cleanup failure must not invalidate an otherwise successful recovery write.
  try { evict(s) } catch { /* retry cleanup on a later write */ }
  return true
}

function evict(s: Storage): void {
  const keys: { key: string; t: number }[] = []
  for (let i = 0; i < s.length; i++) {
    const key = s.key(i)
    if (!key?.startsWith(PREFIX)) continue
    let t = 0
    try { t = (JSON.parse(s.getItem(key) ?? '{}') as { t?: number }).t ?? 0 } catch { /* unreadable */ }
    keys.push({ key, t })
  }
  if (keys.length <= MAX_ENTRIES) return
  keys.sort((a, b) => a.t - b.t)
  for (const { key } of keys.slice(0, keys.length - MAX_ENTRIES)) s.removeItem(key)
}

/** Read one value of a call's state. */
export function getUiState<T>(callId: string, key: string): T | undefined {
  return load(callId)[key] as T | undefined
}

/** Never interpret unavailable or corrupt recovery storage as a missing launch. */
export function getPersistentUiState<T>(callId: string, key: string): T | undefined {
  return readPersistentBag(callId)[key] as T | undefined
}

function readPersistentBag(callId: string): Bag {
  const s = storage()
  if (!s) throw new Error('Browser storage is unavailable')
  const raw = s.getItem(PREFIX + callId)
  if (raw === null) return {}
  const bag = (JSON.parse(raw) as { v?: Bag } | null)?.v
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) throw new Error('Invalid recovery state')
  return bag
}

/**
 * Write one value. Values must be JSON-serializable; a write that would push
 * the call's state past {@link MAX_STATE_CHARS} is refused.
 * @returns whether the value was stored in memory; persistence is best-effort.
 */
export function setUiState(callId: string, key: string, value: unknown, options?: { durable?: boolean }): boolean {
  return writeUiState(callId, key, value, options?.durable ?? false)
}

/** Recovery state must reach localStorage before it can authorize an external action. */
export function setPersistentUiState(callId: string, key: string, value: unknown): boolean {
  return writeUiState(callId, key, value, true)
}

function writeUiState(callId: string, key: string, value: unknown, requirePersistence: boolean): boolean {
  let persisted: Bag = {}
  if (requirePersistence) {
    try { persisted = readPersistentBag(callId) } catch { return false }
  }
  const prev = { ...persisted, ...load(callId) }
  const next = { ...prev, [key]: value }
  let json: string
  try { json = JSON.stringify(next) } catch { return false }
  if (json.length > MAX_STATE_CHARS) return false
  if (requirePersistence && !persist(callId, next)) return false
  memory.set(callId, next)
  if (!requirePersistence) persist(callId, next)
  for (const l of [...(listeners.get(callId) ?? [])]) l()
  return true
}

function subscribe(callId: string, l: () => void): () => void {
  let set = listeners.get(callId)
  if (!set) listeners.set(callId, set = new Set())
  set.add(l)
  return () => { set!.delete(l) }
}

/**
 * `useState` whose value lives in the call's state bag. With no `callId`
 * (e.g. a test or an anonymous surface) the value lives under the empty id.
 */
export function useUiState<T>(callId: string | undefined, key: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const id = callId ?? ''
  const sub = useCallback((l: () => void) => subscribe(id, l), [id])
  const stored = useSyncExternalStore(sub, () => load(id)[key], () => load(id)[key]) as T | undefined
  const value = stored === undefined ? (typeof initial === 'function' ? (initial as () => T)() : initial) : stored
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const prev = (load(id)[key] as T | undefined) ?? (typeof initial === 'function' ? (initial as () => T)() : initial)
    setUiState(id, key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
  // `initial` is only a fallback for a missing value; it need not be fresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key])
  return [value, set]
}

/** Test hook: forget in-memory state (storage is left alone). */
export function resetUiStateMemory(): void {
  memory.clear()
}
