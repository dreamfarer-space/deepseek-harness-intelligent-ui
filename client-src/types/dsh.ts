/**
 * The slice of the DSH client contracts this plugin consumes, declared
 * locally (the in-repo client packages ship no public type packages).
 * Source of truth: deepseek-harness packages/client/ui-tool/src/client/contract/slots.ts
 * and packages/client/ui-conversation/src/client/contract/records.ts.
 */
import type { ControlledRuntime } from '../controlled.ts'
import type { IntelligentUiKey } from '../locales.ts'

export interface ContentBlock { type: string; text?: string }

/** Optional additions are detected before a new-session action mutates the Host. */
export interface SessionFace {
  beginSubmission?: (input: { mode: 'queue' | 'steer'; text: string; attachments: readonly unknown[] }) => { requestId: string; abandon: () => void }
  prompt: (content: { type: 'text'; text: string }[], mode: 'queue' | 'steer', signal?: AbortSignal, requestId?: string) => Promise<{ ok: boolean; error?: { message?: string } }>
}
export interface SessionsFace {
  binding: (id: string) => { session: SessionFace } | undefined
  list?: { getSnapshot: () => { byId: Record<string, { cwd?: string }> } }
  create?: (options: { sessionId: string; workspaceId?: string; cwd?: string }) => Promise<string>
  using?: <T>(id: string, options: { source: 'controllerOperation' }, operation: (reference: { binding: { session: SessionFace } }) => T | Promise<T>) => Promise<T>
}
export interface WorkspacesFace {
  list: { getSnapshot: () => { phase: string; state: string; items: readonly { workspaceId: string; sessionIds: readonly string[] }[] } }
}
export interface UiWorkspaceFace { openSession: (id: string) => void | Promise<void> }

export interface PreparingToolCall { readonly phase: 'preparing'; readonly callId: string; readonly name?: string }
export interface StartedToolCall { readonly phase: 'start'; readonly callId: string; readonly argsRaw: string }
export interface ToolResultNode {
  readonly kind: 'tool-result'
  readonly callId: string
  readonly seq?: number
  readonly call: { name: string; argsRaw: string } | null
  readonly content: readonly ContentBlock[]
  readonly isError: boolean
  readonly error?: { name: string; code: string; reason?: string }
  readonly meta?: unknown
}

export type Translate = (key: IntelligentUiKey, vars?: Record<string, string | number>) => string

/** What our own slot `inject` adds (see index.ts). */
export interface IntelligentUiInjected {
  /** Queue one user message in this session. */
  sendPrompt: (text: string) => Promise<void>
  /** Explicit native Button/Form/Choice submission; never exposed to the Widget bridge. */
  sendNewSessionPrompt?: (text: string, uiId: string, nodeId: string) => Promise<void>
  /** The session this surface belongs to. */
  sessionId?: string
  controlled?: ControlledRuntime
}

interface CommonProps extends IntelligentUiInjected {
  callId: string
  toolName: string
  t: Translate
  /** Present on the tool slot; returns the raw argument prefix while preparing. */
  useToolCallArgumentsPartial?: () => string
}

export type ToolViewProps =
  | (CommonProps & { phase: 'preparing'; block: PreparingToolCall })
  | (CommonProps & { phase: 'start'; block: StartedToolCall })
  | (CommonProps & { phase: 'result'; block: ToolResultNode })

/** Raw arguments of a dispatched/settled call. */
export function argsRawOf(props: ToolViewProps): string {
  if (props.phase === 'start') return props.block.argsRaw
  if (props.phase === 'result') return props.block.call?.argsRaw ?? ''
  return ''
}

/** Result text blocks joined (validation errors live here when ok=false). */
export function resultText(block: ToolResultNode): string {
  return block.content.map(c => (c.type === 'text' ? c.text ?? '' : '')).join('\n').trim()
}

/** The turn was stopped before (or while) this call ran. */
export function interrupted(block: ToolResultNode): boolean {
  return block.error?.code === 'interrupted'
}

/** `meta.ok === false` marks a validation refusal (the model will retry). */
export function refused(block: ToolResultNode): boolean {
  const meta = block.meta as { ok?: unknown } | undefined
  return !!meta && typeof meta === 'object' && meta.ok === false
}
