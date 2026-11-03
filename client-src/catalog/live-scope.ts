/**
 * Which shared field keys are alive on the page right now.
 *
 * A composition block's patch snapshot carries a `scope` (the field keys the
 * whole answer may share) and, when a patch removes one of its own inputs,
 * `staleFields` (the keys that version no longer produces). Neither list can be
 * answered by one surface alone: a key this block retired may still be produced
 * by a sibling block, and a key another block retired must not be read back from
 * the shared pool as a phantom value.
 *
 * Every mounted surface that renders `Form` nodes registers the keys it
 * publishes and the keys its own version retired (see `collectBindings` and
 * `snapshot.staleFields`). A reader then treats a scope key as live when a
 * surface still publishes it, or when no live surface retired it.
 *
 * The registry is per UI root (the `ui_compose`/`ui_render` call id): two
 * answers never see each other's fields.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { rootCallId } from '../state.ts'

interface SurfaceEntry {
  root: string
  published: readonly string[]
  retired: readonly string[]
}

/** Keyed by a per-hook token, so two copies of one UI never evict each other. */
const surfaces = new Map<object, SurfaceEntry>()
const listeners = new Set<() => void>()
let revision = 0

function notify(): void {
  revision++
  for (const l of [...listeners]) l()
}

function same(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Record what one surface currently publishes. Idempotent: re-registering the
 * same keys notifies nobody, so a render/effect cycle always settles.
 * @param token
 * @param uiId
 * @param published
 * @param retired
 */
export function registerLiveSurface(token: object, uiId: string, published: readonly string[], retired: readonly string[]): void {
  const root = rootCallId(uiId)
  const prev = surfaces.get(token)
  if (prev && prev.root === root && same(prev.published, published) && same(prev.retired, retired)) return
  // Sorted, so registering the same set in another order is still a no-op.
  surfaces.set(token, { root, published: [...published].sort(), retired: [...retired].sort() })
  notify()
}

export function unregisterLiveSurface(token: object): void {
  if (surfaces.delete(token)) notify()
}

/** What the rest of the answer still produces / has retired for one root. */
export interface LiveScope {
  readonly published: ReadonlySet<string>
  readonly retired: ReadonlySet<string>
}

const EMPTY_STRINGS: readonly string[] = []

/** Union of every registered surface under `root` (this one included: a
 * surface's own retirement applies to itself). */
export function liveScopeOf(root: string | undefined): LiveScope {
  const published = new Set<string>()
  const retired = new Set<string>()
  if (root !== undefined) {
    for (const entry of surfaces.values()) {
      if (entry.root !== root) continue
      for (const key of entry.published) published.add(key)
      for (const key of entry.retired) retired.add(key)
    }
  }
  return { published, retired }
}

/** Revision of the registry; changes whenever a surface's keys change. */
export function liveScopeRevision(): number {
  return revision
}

/**
 * Register this surface's keys and return what this answer's surfaces publish
 * or retired (`liveScopeOf`). `published`/`retired` must be memoized.
 * @param uiId - the surface's UI id (`<callId>#<blockId>` or a plain call id).
 * @param published
 * @param retired
 */
export function useLiveScope(
  uiId: string | undefined,
  published: readonly string[],
  retired: readonly string[] = EMPTY_STRINGS,
): LiveScope {
  const token = useMemo(() => ({}), [])
  const subscribe = useCallback((l: () => void) => {
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  // Compare by content: a fresh array of the same keys must not re-register.
  const signature = `${[...published].sort().join('\u0000')}\u0001${[...retired].sort().join('\u0000')}`
  useEffect(() => {
    if (!uiId) { unregisterLiveSurface(token); return }
    registerLiveSurface(token, uiId, published, retired)
    return () => unregisterLiveSurface(token)
  // `published`/`retired` are summarised by `signature`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, uiId, signature])
  const current = useSyncExternalStore(subscribe, liveScopeRevision, liveScopeRevision)
  return useMemo(() => {
    void current
    return liveScopeOf(uiId === undefined ? undefined : rootCallId(uiId))
  }, [current, uiId])
}
