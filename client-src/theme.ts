/**
 * Theme bridge: map the host's design tokens onto the small `--ui-*`
 * vocabulary that widgets and catalog components use, and notify on changes.
 *
 * DSH Web defines its `--dsw-*` tokens on <body> (not <html>) and switches
 * light/dark by setting `color-scheme` on <html> (following the system theme
 * or the user's choice), so both elements are read and observed.
 */

/**
 * `--ui-*` name → host token candidates (first non-empty wins), light and dark
 * fallbacks, and optional dark-scheme candidates when the best token differs.
 */
const MAP: ReadonlyArray<readonly [string, readonly string[], string, string, (readonly string[])?]> = [
  ['--ui-bg', ['--dsw-alias-bg-base'], '#ffffff', '#151517'],
  ['--ui-surface', ['--dsw-alias-bg-module-platform', '--dsw-alias-bg-layer-1'], '#f5f6f7', '#232324', ['--dsw-alias-bg-layer-1']],
  ['--ui-text', ['--dsw-alias-label-primary'], '#0f1115', '#f9fafb'],
  ['--ui-muted', ['--dsw-alias-label-tertiary', '--dsw-alias-label-secondary'], '#81858c', '#adb2b8'],
  ['--ui-border', ['--dsw-alias-border-l2', '--dsw-alias-border-l1'], '#0000001a', '#ffffff1f'],
  ['--ui-accent', ['--dsw-alias-state-business-primary', '--dsw-alias-brand-primary'], '#4176e6', '#7aaaff'],
  ['--ui-accent-text', ['--dsw-alias-label-primary-inverted'], '#ffffff', '#151517'],
  ['--ui-success', ['--dsw-alias-state-success-primary'], '#22c55e', '#22c55e'],
  ['--ui-warning', ['--dsw-alias-state-warn-primary'], '#f59e0b', '#f59e0b'],
  ['--ui-error', ['--dsw-alias-state-error-primary'], '#ec1313', '#f25a5a'],
  ['--ui-radius', ['--dsw-radius-sm'], '8px', '8px'],
  ['--ui-font', ['--dsw-font-family', '--ds-font-family-sans'], 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif', 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'],
  ['--ui-mono', ['--ds-font-family-code'], 'ui-monospace, SFMono-Regular, Consolas, monospace', 'ui-monospace, SFMono-Regular, Consolas, monospace'],
]

function luminanceDark(color: string): boolean | undefined {
  const m = /^#([0-9a-f]{6})/i.exec(color) ?? /^#([0-9a-f]{3})\b/i.exec(color)
  if (m) {
    const hex = m[1]!.length === 3 ? m[1]!.split('').map(c => c + c).join('') : m[1]!
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    return 0.299 * r! + 0.587 * g! + 0.114 * b! < 128
  }
  const rgb = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(color)
  if (rgb) return 0.299 * +rgb[1]! + 0.587 * +rgb[2]! + 0.114 * +rgb[3]! < 128
  return undefined
}

/** Dark when the page declares a dark color-scheme, else by background luminance, else by system preference. */
export function isDarkScheme(doc: Document = document): boolean {
  const scheme = getComputedStyle(doc.documentElement).colorScheme || ''
  if (/\bdark\b/.test(scheme) && !/\blight\b/.test(scheme)) return true
  if (/\blight\b/.test(scheme) && !/\bdark\b/.test(scheme)) return false
  const tokens = getComputedStyle(doc.body ?? doc.documentElement)
  const byBg = luminanceDark(tokens.getPropertyValue('--dsw-alias-bg-base').trim())
  if (byBg !== undefined) return byBg
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve the current `--ui-*` values from the host document. */
export function readTheme(doc: Document = document): Record<string, string> {
  const style = getComputedStyle(doc.body ?? doc.documentElement)
  const dark = isDarkScheme(doc)
  const out: Record<string, string> = {}
  for (const [name, candidates, light, darkFallback, darkCandidates] of MAP) {
    let value = ''
    for (const c of dark && darkCandidates ? darkCandidates : candidates) {
      value = style.getPropertyValue(c).trim()
      if (value) break
    }
    out[name] = value || (dark ? darkFallback : light)
  }
  out['--ui-scheme'] = dark ? 'dark' : 'light'
  return out
}

/** CSS declarations for host-side catalog components (scoped to `.diui`). */
export function themeStyle(theme: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(theme)) if (k.startsWith('--ui-')) out[k] = v
  return out
}

/**
 * Observe host theme changes.
 * @returns unsubscribe
 */
export function onThemeChange(listener: () => void, doc: Document = document): () => void {
  const obs = new MutationObserver(listener)
  const attributeFilter = ['class', 'style', 'data-theme', 'data-color-scheme', 'data-ds-theme', 'data-ds-theme-source']
  obs.observe(doc.documentElement, { attributes: true, attributeFilter })
  if (doc.body) obs.observe(doc.body, { attributes: true, attributeFilter })
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined
  mq?.addEventListener?.('change', listener)
  return () => { obs.disconnect(); mq?.removeEventListener?.('change', listener) }
}
