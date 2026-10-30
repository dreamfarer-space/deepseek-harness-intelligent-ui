import type { WidgetPolicy } from '../policy.ts'

/** Why a media source is not loaded; the component shows a placeholder instead. */
export type MediaBlock = 'invalid' | 'blocked' | 'offline'
export type MediaCheck = { ok: true; url: string } | { ok: false; reason: MediaBlock }

/** Absolute https URL without credentials, or undefined. */
export function httpsUrl(raw: unknown): URL | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined
  } catch {
    return undefined
  }
}

/**
 * Decide whether the browser may request a media URL under the call's policy:
 * https only, never in the offline bundle, and only from `mediaOrigins` when set.
 */
export function checkMedia(raw: unknown, policy: Pick<WidgetPolicy, 'allowMedia' | 'mediaOrigins'>): MediaCheck {
  const url = httpsUrl(raw)
  if (!url) return { ok: false, reason: 'invalid' }
  if (!policy.allowMedia) return { ok: false, reason: 'offline' }
  if (policy.mediaOrigins.length && !policy.mediaOrigins.some(o => httpsUrl(o)?.origin === url.origin)) return { ok: false, reason: 'blocked' }
  return { ok: true, url: url.href }
}
