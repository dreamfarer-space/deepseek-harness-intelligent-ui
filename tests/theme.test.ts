// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readTheme } from '../client-src/theme.ts'
import { themeCss } from '../client-src/widget/frame.ts'

afterEach(() => {
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
})

describe('theme bridge', () => {
  it('reads DSH tokens from <body> and prefers the blue business accent', () => {
    document.body.style.setProperty('--dsw-alias-bg-base', '#fff')
    document.body.style.setProperty('--dsw-alias-brand-primary', '#0f1115')
    document.body.style.setProperty('--dsw-alias-state-business-primary', '#4176e6')
    document.body.style.setProperty('--dsw-alias-bg-module-platform', '#f5f6f7')
    const theme = readTheme()
    expect(theme['--ui-scheme']).toBe('light')
    expect(theme['--ui-accent']).toBe('#4176e6')
    expect(theme['--ui-surface']).toBe('#f5f6f7')
  })

  it('switches to dark tokens and fallbacks for a dark page', () => {
    document.body.style.setProperty('--dsw-alias-bg-base', '#151517')
    document.body.style.setProperty('--dsw-alias-bg-module-platform', '#353638')
    document.body.style.setProperty('--dsw-alias-bg-layer-1', '#232324')
    const theme = readTheme()
    expect(theme['--ui-scheme']).toBe('dark')
    expect(theme['--ui-surface']).toBe('#232324')
    expect(theme['--ui-text']).toBe('#f9fafb')
    expect(themeCss(theme)).toContain('color-scheme:dark;')
  })
})
