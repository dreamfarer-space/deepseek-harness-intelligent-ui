import { getUiState, setUiState } from './state.ts'
import type { SessionsFace, WorkspacesFace, UiWorkspaceFace } from './types/dsh.ts'

interface Launch {
  sessionId: string
  requestId?: string
  text: string
  workspaceId?: string
  cwd?: string
  created: boolean
  accepted: boolean
}

/** One sender per client root; inline, turn-tail and patched copies share a lock. */
export function createNewSessionSender(
  sessions: SessionsFace,
  services: () => { workspaces?: WorkspacesFace; uiWorkspace?: UiWorkspaceFace },
) {
  const pending = new Map<string, Promise<void>>()
  return (sourceId: string, text: string, uiId: string, nodeId: string): Promise<void> => {
    const key = `newSession:${JSON.stringify([sourceId, nodeId])}`
    const lock = JSON.stringify([uiId, key])
    const running = pending.get(lock)
    if (running) return running
    const launch = async () => {
      const { uiWorkspace, workspaces } = services()
      if (typeof sessions.create !== 'function' || typeof sessions.using !== 'function' ||
          typeof uiWorkspace?.openSession !== 'function') {
        throw new Error('This DSH host does not support creating and opening Agent sessions')
      }
      let state = getUiState<Launch>(uiId, key)
      // Durable: a launch whose identity could be lost on reload must not start,
      // or a retry after the reload would create and run a second session.
      const save = () => {
        if (!setUiState(uiId, key, { ...state }, { durable: true })) {
          throw new Error('Browser storage is unavailable, so a retry after reload could start the task twice; enable site storage and try again')
        }
      }
      if (!state) {
        const snapshot = workspaces?.list?.getSnapshot()
        if (workspaces && (!snapshot || snapshot.phase !== 'ready' || snapshot.state === 'error')) {
          throw new Error('Workspace metadata is not ready; retry after it has loaded')
        }
        const workspaceId = snapshot?.items.find(w => w.sessionIds.includes(sourceId))?.workspaceId
        const cwd = sessions.list?.getSnapshot().byId[sourceId]?.cwd
        if (!workspaceId && !cwd) throw new Error('Cannot determine the source session workspace')
        state = { sessionId: crypto.randomUUID(), text, created: false, accepted: false,
          ...(workspaceId ? { workspaceId } : { cwd }) }
        // Persist before create: an uncertain response retries the same identity.
        save()
      }
      if (state.text !== text) throw new Error(`This button already targets session ${state.sessionId} with a different prompt`)
      try {
        if (!state.created) {
          let id: string
          try {
            id = await sessions.create({ sessionId: state.sessionId,
              ...(state.workspaceId ? { workspaceId: state.workspaceId } : { cwd: state.cwd }) })
          } catch (err) {
            // A create whose response (or `created` save) was lost: the persisted id already exists.
            if (!sessions.list?.getSnapshot().byId[state.sessionId]) throw err
            id = state.sessionId
          }
          state = { ...state, sessionId: id, created: true }
          save()
        }
        await sessions.using(state.sessionId, { source: 'controllerOperation' }, async ({ binding }) => {
          const session = binding.session
          if (!state!.accepted) {
            if (typeof session.prompt !== 'function') throw new Error('This DSH session cannot accept prompts')
            const submission = !state!.requestId
              ? session.beginSubmission?.({ mode: 'queue', text, attachments: [] })
              : undefined
            state = { ...state!, requestId: state!.requestId ?? submission?.requestId ?? crypto.randomUUID() }
            try {
              // A retry keeps the RPC identity, including after a lost acceptance response.
              save()
              const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, state.requestId)
              if (!result.ok) throw new Error(result.error?.message ?? 'The prompt was not accepted')
            } catch (err) {
              submission?.abandon()
              throw err
            }
            state = { ...state, accepted: true }
            save()
          }
          await uiWorkspace.openSession(state!.sessionId)
        })
      } catch (err) {
        const stage = state.accepted ? 'Prompt accepted; could not open' : state.created ? 'Could not submit prompt to' : 'Could not create'
        throw new Error(`${stage} session ${state.sessionId}. Retry this button to resume. ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const task = launch().finally(() => { pending.delete(lock) })
    pending.set(lock, task)
    return task
  }
}
