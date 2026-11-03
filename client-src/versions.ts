/**
 * Latest known version of each patchable UI, keyed by uiId (the call id of the
 * `ui_render` that created it). Fed from the durable `tool/result` events the
 * Turn accumulator folds (turn.ts), so live sessions and replays agree. A view
 * whose version is older than the latest collapses to a pointer: exactly one
 * live copy per UI, and the interaction state it shares with the newer copy
 * (state.ts, keyed by uiId) is never driven from two places.
 */
import { useCallback, useSyncExternalStore } from 'react'

export interface UiVersion { readonly version: number; readonly title?: string }

const latest = new Map<string, UiVersion>()
const listeners = new Map<string, Set<() => void>>()

/** Bumped on every recorded version, for surfaces that depend on all of them. */
let revision = 0
/** Listeners of {@link revision}: a composition's block list, not one UI. */
const revisionListeners = new Set<() => void>()

/** Record a settled version; older or repeated notes are ignored (replays fold twice). */
export function noteUiVersion(uiId: string, version: number, title?: string): void {
  const prev = latest.get(uiId)
  if (prev && prev.version >= version) return
  latest.set(uiId, { version, title: title ?? prev?.title })
  for (const l of [...(listeners.get(uiId) ?? [])]) l()
  revision++
  for (const l of [...revisionListeners]) l()
}

export function latestUiVersion(uiId: string): UiVersion | undefined {
  return latest.get(uiId)
}

/** Whether a UI has been superseded by a later version (its inline copy is a pointer). */
export function isSuperseded(uiId: string | undefined): boolean {
  if (!uiId) return false
  const hit = latest.get(uiId)
  return hit !== undefined && hit.version > 1
}

/** Revision of the whole registry: changes when any UI's latest version does. */
export function uiVersionsRevision(): number {
  return revision
}

/**
 * Subscribe to {@link uiVersionsRevision}. A composition uses it to learn that
 * one of its blocks was patched (and is now a pointer, not a live producer)
 * without running a hook per block.
 */
export function useUiVersionsRevision(): number {
  return useSyncExternalStore(
    (l: () => void) => { revisionListeners.add(l); return () => { revisionListeners.delete(l) } },
    uiVersionsRevision,
    uiVersionsRevision,
  )
}

/** Subscribe to one UI's latest version. */
export function useLatestUiVersion(uiId: string | undefined): UiVersion | undefined {
  const id = uiId ?? ''
  const subscribe = useCallback((l: () => void) => {
    let set = listeners.get(id)
    if (!set) listeners.set(id, set = new Set())
    set.add(l)
    return () => { set!.delete(l) }
  }, [id])
  return useSyncExternalStore(subscribe, () => latest.get(id), () => latest.get(id))
}

/** Test hook. */
export function resetUiVersions(): void {
  latest.clear()
  revision = 0
  for (const l of [...revisionListeners]) l()
}
