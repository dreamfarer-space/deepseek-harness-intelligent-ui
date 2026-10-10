/**
 * Theme bridge: map the host's design tokens onto the small `--ui-*`
 * vocabulary that widgets and catalog components use, and notify on changes
 * (DSH switches themes by mutating attributes/classes on <html>).
 */

/** `--ui-*` name → host token candidates (first non-empty wins) + fallback for light/dark. */
const MAP: ReadonlyArray<readonly [string, readonly string[], string, string]> = [
  ['--ui-bg', ['--dsw-alias-bg-base'], '#ffffff', '#1b1b1f'],
  ['--ui-surface', ['--dsw-alias-bg-l1', '--dsw-alias-bg-layer-1'], '#f6f7f9', '#24252b'],
  ['--ui-text', ['--dsw-alias-label-primary'], '#1f2329', '#e8e9ed'],
  ['--ui-muted', ['--dsw-alias-label-tertiary', '--dsw-alias-label-secondary'], '#6b7280', '#9aa0aa'],
  ['--ui-border', ['--dsw-alias-border-l2', '--dsw-alias-border-l1'], '#e3e5e8', '#3a3b42'],
  ['--ui-accent', ['--dsw-alias-brand-primary', '--dsw-alias-state-business-primary'], '#4d6bfe', '#6f86ff'],
  ['--ui-accent-text', ['--dsw-alias-label-primary-inverted'], '#ffffff', '#ffffff'],
  ['--ui-success', ['--dsw-alias-state-success-primary'], '#16a34a', '#3ccf6e'],
  ['--ui-warning', ['--dsw-alias-state-warn-primary'], '#d97706', '#f2a33a'],
  ['--ui-error', ['--dsw-alias-state-error-primary'], '#dc2626', '#f26d6d'],
  ['--ui-radius', ['--dsw-radius-sm'], '8px', '8px'],
  ['--ui-font', ['--ds-font-family-sans', '--ds-font-family'], 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif', 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'],
  ['--ui-mono', ['--ds-font-family-code'], 'ui-monospace, SFMono-Regular, Consolas, monospace', 'ui-monospace, SFMono-Regular, Consolas, monospace'],
]

function isDark(style: CSSStyleDeclaration): boolean {
  const bg = style.getPropertyValue('--dsw-alias-bg-base').trim()
  const m = /^#([0-9a-f]{6})$/i.exec(bg) ?? /^#([0-9a-f]{3})$/i.exec(bg)
  if (m) {
    const hex = m[1]!.length === 3 ? m[1]!.split('').map(c => c + c).join('') : m[1]!
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    return 0.299 * r! + 0.587 * g! + 0.114 * b! < 128
  }
  const rgb = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(bg)
  if (rgb) return 0.299 * +rgb[1]! + 0.587 * +rgb[2]! + 0.114 * +rgb[3]! < 128
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve the current `--ui-*` values from the host document. */
export function readTheme(doc: Document = document): Record<string, string> {
  const style = getComputedStyle(doc.documentElement)
  const dark = isDark(style)
  const out: Record<string, string> = {}
  for (const [name, candidates, light, darkFallback] of MAP) {
    let value = ''
    for (const c of candidates) {
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
  obs.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'] })
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined
  mq?.addEventListener?.('change', listener)
  return () => { obs.disconnect(); mq?.removeEventListener?.('change', listener) }
}
