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

/** Record a settled version; older or repeated notes are ignored (replays fold twice). */
export function noteUiVersion(uiId: string, version: number, title?: string): void {
  const prev = latest.get(uiId)
  if (prev && prev.version >= version) return
  latest.set(uiId, { version, title: title ?? prev?.title })
  for (const l of [...(listeners.get(uiId) ?? [])]) l()
}

export function latestUiVersion(uiId: string): UiVersion | undefined {
  return latest.get(uiId)
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
}
