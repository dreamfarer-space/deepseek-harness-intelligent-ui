/** Browser-side policy: Host config persisted on each tool result's `meta.policy`. */
import { resourceMode } from './resources.ts'

export interface WidgetPolicy {
  cdn: readonly string[]
  allowNetwork: boolean
  maxHeight: number
  sendPromptMaxChars: number
  openLinkOrigins: readonly string[]
  /** Host-approved raster tile provider for Map; null draws the offline outline. */
  mapTiles: MapTiles | null
  /** False in the offline bundle: Image/Gallery/Video show placeholders, never fetch. */
  allowMedia: boolean
  /** Non-empty: the only origins Image/Gallery/Video may load from. */
  mediaOrigins: readonly string[]
}

export interface MapTiles { url: string; attribution: string; maxZoom: number }

/** Used while a call is still streaming (no result meta yet) and for malformed meta. */
export const DEFAULT_POLICY: WidgetPolicy = Object.freeze({
  cdn: ['https://esm.sh', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
  allowNetwork: false,
  maxHeight: 2400,
  sendPromptMaxChars: 4000,
  openLinkOrigins: [],
  mapTiles: null,
  allowMedia: resourceMode !== 'offline',
  mediaOrigins: [],
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
    // A replayed online policy cannot reopen network access in the offline bundle.
    mapTiles: resourceMode === 'offline' ? null : mapTilesFrom(p.mapTiles),
    allowMedia: resourceMode !== 'offline' && (typeof p.allowMedia === 'boolean' ? p.allowMedia : DEFAULT_POLICY.allowMedia),
    mediaOrigins: strings(p.mediaOrigins) ?? DEFAULT_POLICY.mediaOrigins,
  }
}

/** Same rules as the Host: https template with {z}/{x}/{y}; anything else means no tiles. */
function mapTilesFrom(v: unknown): MapTiles | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Record<string, unknown>
  if (typeof t.url !== 'string' || !/^https:\/\/[^/?#\s]+\/\S*$/.test(t.url) || !['{z}', '{x}', '{y}'].every(k => (t.url as string).includes(k))) return null
  const maxZoom = typeof t.maxZoom === 'number' && Number.isInteger(t.maxZoom) ? Math.max(1, Math.min(22, t.maxZoom)) : 19
  return { url: t.url, attribution: typeof t.attribution === 'string' ? t.attribution.slice(0, 300) : '', maxZoom }
}
