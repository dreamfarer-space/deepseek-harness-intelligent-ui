/**
 * Interaction bridge: turns widget/catalog interactions into conversation
 * messages (OpenIntelligentUI's sendPrompt semantics — a queued user message,
 * never a blocking tool wait), with guards against runaway generated code.
 */
import type { WidgetPolicy } from './policy.ts'

/** Sends one user message into the session; resolves when the Host accepted it. */
export type PromptSink = (text: string) => Promise<void>

export interface BridgeGuardOptions {
  policy: WidgetPolicy
  /** ms after mount during which programmatic sends are refused (no auto-send on load). */
  armDelayMs?: number
  /** Minimum ms between two sends from the same surface. */
  minIntervalMs?: number
  now?: () => number
}

export class BridgeError extends Error {
  constructor(readonly code: 'empty' | 'too-long' | 'not-armed' | 'rate-limited' | 'unavailable' | 'bad-url' | 'origin', message: string) {
    super(message)
  }
}

/**
 * Per-surface guard (one per rendered widget or catalog card).
 */
export class BridgeGuard {
  private readonly armedAt: number
  private lastSend = -Infinity
  private readonly now: () => number
  private readonly minInterval: number

  constructor(private readonly opts: BridgeGuardOptions) {
    this.now = opts.now ?? (() => Date.now())
    this.armedAt = this.now() + (opts.armDelayMs ?? 1000)
    this.minInterval = opts.minIntervalMs ?? 2000
  }

  /**
   * Validate and admit one prompt.
   * @returns the normalized text to send.
   * @throws BridgeError when refused.
   */
  admitPrompt(raw: unknown): string {
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) throw new BridgeError('empty', 'sendPrompt needs non-empty text')
    if (text.length > this.opts.policy.sendPromptMaxChars) {
      throw new BridgeError('too-long', `sendPrompt text exceeds ${this.opts.policy.sendPromptMaxChars} characters`)
    }
    const t = this.now()
    if (t < this.armedAt) throw new BridgeError('not-armed', 'sendPrompt is only allowed in response to a user action, not on load')
    if (t - this.lastSend < this.minInterval) throw new BridgeError('rate-limited', 'sendPrompt called too often')
    this.lastSend = t
    return text
  }

  /**
   * Validate a link target.
   * @returns the normalized https URL.
   */
  admitLink(raw: unknown): string {
    let url: URL
    try { url = new URL(String(raw)) } catch { throw new BridgeError('bad-url', 'openLink needs an absolute https URL') }
    if (url.protocol !== 'https:') throw new BridgeError('bad-url', 'openLink only opens https URLs')
    const allowed = this.opts.policy.openLinkOrigins
    if (allowed.length > 0 && !allowed.some(o => { try { return new URL(o).origin === url.origin } catch { return false } })) {
      throw new BridgeError('origin', `openLink: ${url.origin} is not an allowed origin`)
    }
    return url.href
  }
}

/** Format a Form submission as the user message the model receives. */
export function formatFormSubmission(title: string | undefined, prompt: string | undefined, values: Record<string, unknown>): string {
  const head = prompt?.trim() || (title ? `Form "${title}" submitted:` : 'Form submitted:')
  return `${head}\n${JSON.stringify(values, null, 2)}`
}

/** Messages the frame bootstrap may post. */
export type FrameMessage =
  | { type: 'rpc'; id: number; method: string; params: Record<string, unknown> }
  | { type: 'resize'; height: number }
  | { type: 'error'; kind: string; message: string }
  | { type: 'ready' }

/** Narrow an untrusted postMessage payload. */
export function readFrameMessage(data: unknown, token: string): FrameMessage | undefined {
  if (!data || typeof data !== 'object') return undefined
  const m = data as Record<string, unknown>
  if (m.__diui !== token) return undefined
  switch (m.type) {
    case 'rpc':
      return typeof m.id === 'number' && typeof m.method === 'string'
        ? { type: 'rpc', id: m.id, method: m.method, params: (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown> }
        : undefined
    case 'resize':
      return typeof m.height === 'number' && Number.isFinite(m.height) ? { type: 'resize', height: m.height } : undefined
    case 'error':
      return { type: 'error', kind: String(m.kind ?? ''), message: String(m.message ?? '').slice(0, 500) }
    case 'ready':
      return { type: 'ready' }
    default:
      return undefined
  }
}
