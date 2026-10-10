/**
 * DeepSeek Harness Intelligent UI — browser half.
 *
 * Registers keyed `tool.call.toolview` entries for the two generative-UI
 * tools and wires their interactions into the session as queued user
 * messages (through the same Session face the composer uses, so the message
 * echoes in the transcript immediately).
 */
import { RENDER_TOOL } from '../src/tools/render.js'
import { WIDGET_TOOL } from '../src/tools/widget.js'
import { RenderView } from './catalog/RenderView.tsx'
import { en, NS, zh } from './locales.ts'
import { STYLES } from './styles.ts'
import { inlineView, TurnTail } from './TurnTail.tsx'
import { uiTurnDefinition } from './turn.ts'
import type { IntelligentUiInjected } from './types/dsh.ts'
import { WidgetView } from './widget/WidgetView.tsx'

export const inject = ['slots', 'locale', 'sessions', 'uiConversation']

/** The subset of the client Session face (dsh-api-session-controller) used here. */
interface SessionFace {
  beginSubmission?: (input: { mode: 'queue' | 'steer'; text: string; attachments: readonly unknown[] }) => { requestId: string; abandon: () => void }
  prompt: (content: { type: 'text'; text: string }[], mode: 'queue' | 'steer', signal?: AbortSignal, requestId?: string) => Promise<{ ok: boolean; error?: { message?: string } }>
}

interface ClientCtx {
  effect: (fn: () => (() => void) | void, label?: string) => void
  locale: { register: (ns: string, dicts: Record<string, Record<string, string>>) => () => void }
  slots: {
    inject: (name: string, fn: () => unknown) => void
    register: (entry: Record<string, unknown>, component: unknown) => unknown
  }
  sessions: { binding: (id: string) => { session: SessionFace } | undefined }
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
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'intelligent-ui: dictionaries')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.owner = 'dsh-intelligent-ui'
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'intelligent-ui: styles')

  const injected = (sessionId: string): IntelligentUiInjected => ({
    sendPrompt: text => promptSession(ctx.sessions, sessionId, text),
    sessionId,
  })

  for (const [key, view] of [[RENDER_TOOL, RenderView], [WIDGET_TOOL, WidgetView]] as const) {
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
