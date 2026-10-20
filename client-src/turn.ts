/**
 * Turn-level presentation. DSH folds a finished Turn's tool calls into the
 * collapsed "process" disclosure, which would hide the generated UI exactly
 * when it is ready. Like ui-schedule's created-task card, this module
 * publishes each settled UI result against its Turn (a Conversation Node
 * Definition) so a `conversation.chat.turnTail` entry renders it beneath the
 * closing reply. Everything derives from durable `tool/call` + `tool/result`
 * events, so Session replay reproduces the cards.
 */
import { useSyncExternalStore } from 'react'
import { PATCH_TOOL } from '../src/tools/patch.js'
import { RENDER_TOOL } from '../src/tools/render.js'
import { WIDGET_TOOL } from '../src/tools/widget.js'
import { COMPOSE_TOOL } from '../src/compose/constants.js'
import { composeUiId, validateComposition } from '../src/compose/compose.js'
import type { ToolResultNode } from './types/dsh.ts'
import { noteUiVersion } from './versions.ts'

export const TURN_DATA_KEY = 'intelligent-ui'
const UI_TOOLS = new Set<string>([RENDER_TOOL, PATCH_TOOL, WIDGET_TOOL, COMPOSE_TOOL])

/** Settled UI results of one Turn, in settlement order. */
export interface UiTurnData {
  readonly results: readonly ToolResultNode[]
}

interface CallHead { readonly name: string; readonly argsRaw: string }
interface UiTurnState {
  readonly turn: number
  readonly calls: ReadonlyMap<string, CallHead>
  readonly results: readonly ToolResultNode[]
}

/** Minimal shape of the engine's match/context objects (ui-conversation contract). */
interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly surfaceOp?: string
  readonly data: any
}
interface MatchLike { readonly event: SessionEventLike }
interface ContextLike { readonly state: UiTurnState }

/** A result shows in the tail only when it rendered successfully. */
export function presentable(meta: unknown, isError: boolean): boolean {
  if (isError) return false
  return !(meta && typeof meta === 'object' && (meta as { ok?: unknown }).ok === false)
}

/** The snapshot a successful `ui_patch` result carries in its meta. */
export interface PatchedUi {
  readonly uiId: string
  readonly version: number
  readonly title?: string
  readonly root: string
  readonly components: readonly unknown[]
}

export function patchedUiOf(meta: unknown): PatchedUi | undefined {
  const ui = meta && typeof meta === 'object' ? (meta as { ui?: unknown }).ui : undefined
  if (!ui || typeof ui !== 'object') return undefined
  const u = ui as Partial<PatchedUi>
  return typeof u.uiId === 'string' && typeof u.version === 'number' && typeof u.root === 'string' && Array.isArray(u.components) ? u as PatchedUi : undefined
}

/** Feed the cross-Turn version registry from one presentable result. */
function noteVersion(callId: string, call: CallHead, meta: unknown): void {
  if (call.name === PATCH_TOOL) {
    const ui = patchedUiOf(meta)
    if (ui) noteUiVersion(ui.uiId, ui.version, ui.title)
    return
  }
  if (call.name !== RENDER_TOOL && call.name !== COMPOSE_TOOL) return
  let args: Record<string, unknown>
  try { args = JSON.parse(call.argsRaw) as Record<string, unknown> } catch { return }
  if (call.name === RENDER_TOOL) {
    noteUiVersion(callId, 1, typeof args.title === 'string' ? args.title : undefined)
    return
  }
  // Catalog blocks are independently patchable UIs; a failed composition registers none.
  const composed = validateComposition(args, {})
  if (!composed.ok) return
  for (const block of composed.blocks) {
    if (block.type === 'catalog') noteUiVersion(composeUiId(callId, block.id), 1, block.title)
  }
}

/** The Conversation Node Definition (accumulator only; publishes no view node). */
export const uiTurnDefinition = {
  kind: TURN_DATA_KEY,
  match: (event: SessionEventLike) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' as const }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' as const }
    if (event.type === 'tool/result' && event.surfaceOp === 'append') return { id: String(event.data.turn), role: 'update' as const }
    return null
  },
  start: (_context: unknown, match: MatchLike): UiTurnState => {
    if (match.event.type !== 'turn/start') throw new Error('intelligent-ui start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), results: [] }
  },
  update: (context: ContextLike, match: MatchLike): UiTurnState => {
    const { event } = match
    if (event.type === 'tool/call') {
      if (!UI_TOOLS.has(event.data.name)) return context.state
      const calls = new Map(context.state.calls)
      calls.set(String(event.data.callId), { name: event.data.name, argsRaw: event.data.arguments })
      return { ...context.state, calls }
    }
    if (event.type !== 'tool/result') return context.state
    const message = event.data.message
    const callId = String(message.source.callId)
    const call = context.state.calls.get(callId)
    if (!call || !presentable(event.data.meta, message.isError === true)) return context.state
    noteVersion(callId, call, event.data.meta)
    const node: ToolResultNode = {
      kind: 'tool-result',
      callId,
      call,
      content: message.content,
      isError: false,
      meta: event.data.meta,
      seq: event.seq,
    } as ToolResultNode
    return { ...context.state, results: [...context.state.results, node] }
  },
  buildLocationData: (context: { state: UiTurnState | undefined }, scope: string, previous: any) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (previous?.kind === 'turn' && previous.turn === context.state.turn && previous.key === TURN_DATA_KEY
      && previous.value.results === context.state.results) return previous
    return { kind: 'turn', turn: context.state.turn, key: TURN_DATA_KEY, value: { results: context.state.results } }
  },
}

/** Turn-tail owner props (ui-chat TurnTailOwnerProps, structurally). */
export interface TurnTailOwner {
  readonly turn: {
    readonly start?: { readonly time: number }
    readonly end?: { readonly seq: number; readonly time?: number }
    readonly data: { get: (key: string) => unknown }
  }
  readonly seq: number
}

/** Results to show beneath one closing Turn; bounded by the Turn's end. */
export function selectTurnResults(owner: TurnTailOwner): readonly ToolResultNode[] {
  const data = owner.turn.data.get(TURN_DATA_KEY) as UiTurnData | undefined
  if (!data) return []
  const bound = owner.turn.end?.seq ?? owner.seq
  return data.results.filter(r => ((r as unknown as { seq: number }).seq ?? 0) <= bound)
}

/**
 * Calls whose UI is currently shown in a Turn tail. The inline tool view
 * collapses to a one-line pointer for those, so a folded duplicate never keeps
 * a second live widget running.
 */
class Presented {
  private readonly counts = new Map<string, number>()
  private readonly listeners = new Set<() => void>()
  private version = 0
  add(callId: string): () => void {
    this.counts.set(callId, (this.counts.get(callId) ?? 0) + 1)
    this.bump()
    return () => {
      const n = (this.counts.get(callId) ?? 1) - 1
      if (n <= 0) this.counts.delete(callId)
      else this.counts.set(callId, n)
      this.bump()
    }
  }
  has(callId: string): boolean { return this.counts.has(callId) }
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  snapshot = () => this.version
  private bump() { this.version++; for (const l of [...this.listeners]) l() }
}

export const presented = new Presented()

/** Whether the Turn tail currently shows this call's UI. */
export function usePresentedBelow(callId: string): boolean {
  useSyncExternalStore(presented.subscribe, presented.snapshot, presented.snapshot)
  return presented.has(callId)
}
