/** Browser-side policy: Host config persisted on each tool result's `meta.policy`. */

export interface WidgetPolicy {
  cdn: readonly string[]
  allowNetwork: boolean
  maxHeight: number
  sendPromptMaxChars: number
  openLinkOrigins: readonly string[]
}

/** Used while a call is still streaming (no result meta yet) and for malformed meta. */
export const DEFAULT_POLICY: WidgetPolicy = Object.freeze({
  cdn: ['https://esm.sh', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
  allowNetwork: false,
  maxHeight: 2400,
  sendPromptMaxChars: 4000,
  openLinkOrigins: [],
})

const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? v as string[] : undefined

/**
 * Read `meta.policy` defensively; every field falls back to the default.
 * @param meta - persisted `result.meta` (any shape).
 */
export function policyFromMeta(meta: unknown): WidgetPolicy {
  const p = (meta && typeof meta === 'object' ? (meta as Record<string, unknown>).policy : undefined) as Record<string, unknown> | undefined
  if (!p || typeof p !== 'object') return DEFAULT_POLICY
  const num = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d
  return {
    cdn: strings(p.cdn) ?? DEFAULT_POLICY.cdn,
    allowNetwork: typeof p.allowNetwork === 'boolean' ? p.allowNetwork : DEFAULT_POLICY.allowNetwork,
    maxHeight: num(p.maxHeight, DEFAULT_POLICY.maxHeight),
    sendPromptMaxChars: num(p.sendPromptMaxChars, DEFAULT_POLICY.sendPromptMaxChars),
    openLinkOrigins: strings(p.openLinkOrigins) ?? DEFAULT_POLICY.openLinkOrigins,
  }
}
