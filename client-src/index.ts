/**
 * DeepSeek Harness Intelligent UI — browser half.
 *
 * Registers keyed `tool.call.toolview` entries for the generative-UI
 * tools and wires their interactions into the session as queued user
 * messages (through the same Session face the composer uses, so the message
 * echoes in the transcript immediately).
 */
import { PATCH_TOOL } from '../src/tools/patch.js'
import { RENDER_TOOL } from '../src/tools/render.js'
import { WIDGET_TOOL } from '../src/tools/widget.js'
import { COMPOSE_TOOL } from '../src/compose/constants.js'
import { PatchView } from './catalog/PatchView.tsx'
import { RenderView } from './catalog/RenderView.tsx'
import { ComposeView } from './compose/ComposeView.tsx'
import { en, NS, zh } from './locales.ts'
import { STYLES } from './styles.ts'
import { inlineView, TurnTail } from './TurnTail.tsx'
import { uiTurnDefinition } from './turn.ts'
import type { IntelligentUiInjected, SessionFace, SessionsFace, WorkspacesFace, UiWorkspaceFace } from './types/dsh.ts'
import { createNewSessionSender } from './new-session.ts'
import { WidgetView } from './widget/WidgetView.tsx'

export const inject = ['slots', 'locale', 'sessions', 'uiConversation']

interface ClientCtx {
  /** Trusted companion plugin; absence leaves bindings/actions unavailable. */
  get?: (name: string) => unknown
  effect: (fn: () => (() => void) | void, label?: string) => void
  locale: { register: (ns: string, dicts: Record<string, Record<string, string>>) => () => void }
  slots: {
    inject: (name: string, fn: () => unknown) => void
    register: (entry: Record<string, unknown>, component: unknown) => unknown
  }
  sessions: SessionsFace
  uiConversation: { events: { register: (definition: unknown) => unknown } }
}

/**
 * Send one text message into a session, echoing it like a composer submission.
 * @throws when the session is not open in this tab or the Host rejects it.
 */
export async function promptSession(sessions: ClientCtx['sessions'], sessionId: string, text: string): Promise<void> {
  const session = sessions.binding(sessionId)?.session
  if (!session) throw new Error('this conversation is not open')
  const submission = session.beginSubmission?.({ mode: 'queue', text, attachments: [] })
  let result: Awaited<ReturnType<SessionFace['prompt']>>
  try {
    result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission?.requestId)
  } catch (err) {
    submission?.abandon()
    throw err
  }
  if (!result.ok) throw new Error(result.error?.message ?? 'the message was not accepted')
}

export function apply(ctx: ClientCtx): void {
  const sendNewSession = createNewSessionSender(ctx.sessions, () => ({
    workspaces: ctx.get?.('workspaces') as WorkspacesFace | undefined,
    uiWorkspace: ctx.get?.('uiWorkspace') as UiWorkspaceFace | undefined,
  }))
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'intelligent-ui: dictionaries')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.owner = 'deepseek-harness-intelligent-ui'
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'intelligent-ui: styles')

  const injected = (sessionId: string): IntelligentUiInjected => {
    // Cordis direct property reads require a declared dependency. get() is its
    // supported optional-service lookup and preserves legacy hosts without one.
    const provider = ctx.get?.('intelligentUiControlled') as { forSession: (id: string) => IntelligentUiInjected['controlled'] } | undefined
    return {
      controlled: provider?.forSession(sessionId),
      sendPrompt: text => promptSession(ctx.sessions, sessionId, text),
      sendNewSessionPrompt: (text, uiId, nodeId) => sendNewSession(sessionId, text, uiId, nodeId),
      sessionId,
    }
  }

  // ui_compose is only registered by Hosts that have a UI capability; the slot
  // key is harmless when the tool never appears in this session.
  const views = [[RENDER_TOOL, RenderView], [PATCH_TOOL, PatchView], [WIDGET_TOOL, WidgetView], [COMPOSE_TOOL, ComposeView]] as const
  for (const [key, view] of views) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key, locale: NS, inject: injected },
      inlineView(view),
    ))
  }

  // A finished Turn folds its tool calls away; re-present settled UIs beneath
  // the reply (same pattern as ui-schedule's created-task card).
  ctx.uiConversation.events.register(uiTurnDefinition)
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register(
    { name: 'conversation.chat.turnTail', id: 'intelligent-ui', order: 15, locale: NS, inject: injected },
    TurnTail,
  ))
}

export { createControlledRuntime } from '../src/controlled/runtime.js'

export { registerComponentExtension, CATALOG_API_VERSION } from './catalog/extensions.tsx'
export type { CatalogExtension, ComponentDefinition, ExtensionHandle, InferProps, ExtensionRenderContext, ExtensionRenderers } from './catalog/extensions.tsx'
