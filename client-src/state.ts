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

/**
 * A state bag has no prototype. Keys are user-controlled (`Form` field names,
 * which the model writes), so `constructor`, `toString` and `__proto__` are
 * ordinary keys here: a plain `{}` would answer `bag.constructor` with the
 * Object constructor and `bag['__proto__'] = v` would set the prototype
 * instead of storing a value.
 */
function emptyBag(): Bag {
  return Object.create(null) as Bag
}

/** Copy `source`'s own enumerable keys onto a fresh prototype-less bag. */
function toBag(source: Record<string, unknown> | undefined): Bag {
  const bag = emptyBag()
  if (!source || typeof source !== 'object' || Array.isArray(source)) return bag
  for (const key of Object.keys(source)) define(bag, key, source[key])
  return bag
}

/** Define one own key, including `__proto__`, as plain data. */
function define(bag: Bag, key: string, value: unknown): void {
  Object.defineProperty(bag, key, { value, enumerable: true, writable: true, configurable: true })
}

/** Read one own value; the prototype chain must never answer for a bag. */
function readOwn(bag: Bag, key: string): unknown {
  return Object.hasOwn(bag, key) ? bag[key] : undefined
}

/**
 * Root identity of a UI: the tool call that owns it. A composition block is
 * addressed as `<root>#<blockId>` (see `blockUiId`), so several blocks of one
 * answer share a root.
 */
export function rootCallId(callId: string): string {
  const at = callId.indexOf('#')
  return at > 0 ? callId.slice(0, at) : callId
}

/**
 * Keys carry their own visibility. A key prefixed with `<nodeId>:` (table page,
 * open tab, form values, a widget's state) is private to that component; any
 * other key is a shared variable (`threshold`, `rate`) stored under the root
 * call id, so every block of one answer reads and writes the same value.
 */
function scopeOf(callId: string, key: string): string {
  return key.includes(':') ? callId : rootCallId(callId)
}

function storage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}

function load(callId: string): Bag {
  const hit = memory.get(callId)
  if (hit) return hit
  let bag: Bag = emptyBag()
  try {
    const raw = storage()?.getItem(PREFIX + callId)
    const parsed = raw ? JSON.parse(raw) as unknown : undefined
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const stored = (parsed as { v?: unknown }).v
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) bag = toBag(stored as Record<string, unknown>)
    }
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
  return readOwn(load(scopeOf(callId, key)), key) as T | undefined
}

/** Never interpret unavailable or corrupt recovery storage as a missing launch. */
export function getPersistentUiState<T>(callId: string, key: string): T | undefined {
  return readOwn(readPersistentBag(scopeOf(callId, key)), key) as T | undefined
}

function readPersistentBag(callId: string): Bag {
  const s = storage()
  if (!s) throw new Error('Browser storage is unavailable')
  const raw = s.getItem(PREFIX + callId)
  if (raw === null) return emptyBag()
  const bag = (JSON.parse(raw) as { v?: unknown } | null)?.v
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) throw new Error('Invalid recovery state')
  return toBag(bag as Record<string, unknown>)
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
  const scope = scopeOf(callId, key)
  let persisted: Bag = {}
  if (requirePersistence) {
    try { persisted = readPersistentBag(scope) } catch { return false }
  }
  const prev = toBag({ ...persisted, ...load(scope) })
  const next = toBag(prev)
  define(next, key, value)
  let json: string
  try { json = JSON.stringify(next) } catch { return false }
  if (json.length > MAX_STATE_CHARS) return false
  if (requirePersistence && !persist(scope, next)) return false
  memory.set(scope, next)
  if (!requirePersistence) persist(scope, next)
  touch(scope)
  for (const l of [...(listeners.get(scope) ?? [])]) l()
  return true
}

/** Global, monotonically increasing write clock: `uiStateRevision` never goes back. */
let clock = 0
/** Last write tick per storage scope (root id for shared keys, call id for private ones). */
const changedAt = new Map<string, number>()

function touch(scope: string): void {
  changedAt.set(scope, ++clock)
}

/**
 * Revision of everything a component under `callId` can see: its own private
 * keys and the shared keys of its root. Subscribing to it re-renders a surface
 * whenever a form field in any block broadcasts a new shared value.
 */
export function uiStateRevision(callId: string): number {
  return Math.max(changedAt.get(rootCallId(callId)) ?? 0, changedAt.get(callId) ?? 0)
}

/**
 * Shared keys live under the root id, so a listener attached to a block must
 * hear the root's writes (and its own); a root listener hears only itself.
 */
function subscribe(callId: string, l: () => void): () => void {
  const ids = callId === rootCallId(callId) ? [callId] : [callId, rootCallId(callId)]
  for (const id of ids) {
    let set = listeners.get(id)
    if (!set) listeners.set(id, set = new Set())
    set.add(l)
  }
  return () => { for (const id of ids) listeners.get(id)?.delete(l) }
}

/** `useUiState`-style subscription to {@link uiStateRevision}. */
export function useUiStateRevision(callId: string | undefined): number {
  const id = callId ?? ''
  const sub = useCallback((l: () => void) => subscribe(id, l), [id])
  return useSyncExternalStore(sub, () => uiStateRevision(id), () => uiStateRevision(id))
}

/**
 * `useState` whose value lives in the call's state bag. With no `callId`
 * (e.g. a test or an anonymous surface) the value lives under the empty id.
 */
export function useUiState<T>(callId: string | undefined, key: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const id = callId ?? ''
  const scope = scopeOf(id, key)
  const sub = useCallback((l: () => void) => subscribe(id, l), [id])
  const stored = useSyncExternalStore(sub, () => readOwn(load(scope), key), () => readOwn(load(scope), key)) as T | undefined
  const value = stored === undefined ? (typeof initial === 'function' ? (initial as () => T)() : initial) : stored
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const prev = (readOwn(load(scope), key) as T | undefined) ?? (typeof initial === 'function' ? (initial as () => T)() : initial)
    setUiState(id, key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
  // `initial` is only a fallback for a missing value; it need not be fresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, scope])
  return [value, set]
}

/** Test hook: forget in-memory state (storage is left alone). */
export function resetUiStateMemory(): void {
  memory.clear()
  changedAt.clear()
}
