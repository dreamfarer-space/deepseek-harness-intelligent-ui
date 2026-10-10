import { describe, expect, it } from 'vitest'
import { BridgeGuard, formatFormSubmission, readFrameMessage } from '../client-src/bridge.ts'
import { DEFAULT_POLICY, policyFromMeta } from '../client-src/policy.ts'
import { buildFrameDocument, codePayload, contentSecurityPolicy, escapeForRawText, jsonForScript, safeOrigins } from '../client-src/widget/frame.ts'

const theme = { '--ui-text': '#111', '--ui-bad': 'x', '--ui-evil': 'red;}</style><script>' }

describe('frame document', () => {
  it('builds a CSP from https origins only and blocks network by default', () => {
    expect(safeOrigins(['https://esm.sh/x', 'http://a.com', 'javascript:alert(1)', 'nope', 'https://esm.sh'])).toEqual(['https://esm.sh'])
    const csp = contentSecurityPolicy(DEFAULT_POLICY)
    expect(csp).toMatch(/default-src 'none'/)
    expect(csp).toMatch(/connect-src 'none'/)
    expect(csp).toMatch(/script-src 'unsafe-inline' 'unsafe-eval' blob: https:\/\/esm\.sh https:\/\/cdn\.jsdelivr\.net/)
    expect(contentSecurityPolicy({ ...DEFAULT_POLICY, allowNetwork: true })).toMatch(/connect-src https:\/\/esm\.sh/)
    expect(contentSecurityPolicy({ ...DEFAULT_POLICY, cdn: [], allowNetwork: true })).toMatch(/connect-src 'none'/)
  })

  it('keeps generated text from escaping its element', () => {
    expect(escapeForRawText('a</style><script>', 'style')).toBe('a<\\/style><script>')
    expect(jsonForScript({ x: '</script><b>' })).not.toMatch(/<\/script/)
    expect(JSON.parse(jsonForScript({ x: '</script> ' }))).toEqual({ x: '</script> ' })
  })

  it('embeds code only in final mode and filters theme declarations', () => {
    const base = { token: 'tok', css: 'p{}', html: '<p>hi</p>', jsFunctions: 'function f(){}', jsExpressions: ['f()'], theme, policy: DEFAULT_POLICY }
    const final = buildFrameDocument({ ...base, mode: 'final' })
    expect(final).toContain('<div id="ui-root"><p>hi</p></div>')
    expect(final).toContain('id="ui-code"')
    expect(final).toContain('"tok"')
    expect(final).toContain('--ui-text:#111;')
    expect(final).not.toContain('--ui-evil')
    expect(final).toContain('<script type="importmap">')
    const preview = buildFrameDocument({ ...base, mode: 'preview', html: '' })
    expect(preview).not.toContain('id="ui-code"')
    expect(buildFrameDocument({ ...base, mode: 'final', policy: { ...DEFAULT_POLICY, cdn: [] } })).not.toContain('importmap')
  })
})

describe('frame runtime', () => {
  const base = { token: 'tok', css: '', html: '<p>x</p>', policy: DEFAULT_POLICY }
  it('carries the color scheme, persisted state and the UI runtime', () => {
    const dark = buildFrameDocument({ ...base, mode: 'final', theme: { '--ui-text': '#eee', '--ui-scheme': 'dark' }, state: { controls: { r: '2' } } })
    expect(dark).toContain('color-scheme:dark;')
    expect(dark).toContain('doc.dataset.theme = "dark"')
    expect(dark).toContain('"state":{"controls":{"r":"2"}}')
    expect(dark).toContain('window.UI')
    expect(dark).toContain('prefers-reduced-motion')
    const light = buildFrameDocument({ ...base, mode: 'preview', theme: {} })
    expect(light).toContain('color-scheme:light;')
    expect(light).not.toContain('id="ui-code"')
  })

  it('emits a bootstrap that is valid JavaScript', () => {
    const doc = buildFrameDocument({ ...base, mode: 'final', theme: {} })
    const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!)
    const bootstrap = scripts.find(s => s.includes('window.UI'))!
    expect(() => new Function(bootstrap)).not.toThrow()
    expect(bootstrap).toContain('/rgba?\\(([\\d.]+)')
  })

  it('builds the code payload a preview frame is finalized with', () => {
    expect(codePayload({ jsFunctions: 'function f(){}', jsExpressions: ['f()'] })).toEqual({ functions: 'function f(){}', expressions: ['f()'], state: null })
  })
})

describe('bridge guard', () => {
  it('refuses sends during the arm window, then rate-limits', () => {
    let now = 1000
    const guard = new BridgeGuard({ policy: DEFAULT_POLICY, now: () => now })
    expect(() => guard.admitPrompt('hi')).toThrow(/user action/)
    now += 1000
    expect(guard.admitPrompt('  hi  ')).toBe('hi')
    expect(() => guard.admitPrompt('again')).toThrow(/too often/)
    now += 2000
    expect(guard.admitPrompt('again')).toBe('again')
  })

  it('validates text and links', () => {
    const guard = new BridgeGuard({ policy: { ...DEFAULT_POLICY, sendPromptMaxChars: 5, openLinkOrigins: ['https://ok.dev'] }, armDelayMs: 0 })
    expect(() => guard.admitPrompt('')).toThrow(/non-empty/)
    expect(() => guard.admitPrompt('123456')).toThrow(/exceeds 5/)
    expect(() => guard.admitLink('http://ok.dev')).toThrow(/https/)
    expect(() => guard.admitLink('https://evil.dev')).toThrow(/not an allowed origin/)
    expect(guard.admitLink('https://ok.dev/a?b=1')).toBe('https://ok.dev/a?b=1')
  })

  it('reads only well-formed messages carrying the frame token', () => {
    expect(readFrameMessage({ __diui: 'x', type: 'ready' }, 'tok')).toBeUndefined()
    expect(readFrameMessage({ __diui: 'tok', type: 'resize', height: 'big' }, 'tok')).toBeUndefined()
    expect(readFrameMessage({ __diui: 'tok', type: 'resize', height: 300 }, 'tok')).toEqual({ type: 'resize', height: 300 })
    expect(readFrameMessage({ __diui: 'tok', type: 'rpc', id: 1, method: 'sendPrompt', params: { text: 'a' } }, 'tok'))
      .toEqual({ type: 'rpc', id: 1, method: 'sendPrompt', params: { text: 'a' } })
    expect(readFrameMessage('junk', 'tok')).toBeUndefined()
    expect(readFrameMessage({ __diui: 'tok', type: 'ready', final: true }, 'tok')).toEqual({ type: 'ready', final: true })
    expect(readFrameMessage({ __diui: 'tok', type: 'state', state: { a: 1 } }, 'tok')).toEqual({ type: 'state', state: { a: 1 } })
    expect(readFrameMessage({ __diui: 'tok', type: 'state', state: [1] }, 'tok')).toBeUndefined()
    expect(readFrameMessage({ __diui: 'tok', type: 'state', state: { a: 1 } }, 'other')).toBeUndefined()
  })

  it('formats form submissions and reads policy meta defensively', () => {
    expect(formatFormSubmission('Trip', undefined, { days: 3 })).toBe('Form "Trip" submitted:\n{\n  "days": 3\n}')
    expect(formatFormSubmission(undefined, 'Plan it:', {})).toBe('Plan it:\n{}')
    expect(policyFromMeta(undefined)).toBe(DEFAULT_POLICY)
    expect(policyFromMeta({ policy: { maxHeight: 900, cdn: 'x' } })).toMatchObject({ maxHeight: 900, cdn: DEFAULT_POLICY.cdn })
  })
})
