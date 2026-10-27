import { describe, expect, it } from 'vitest'
import { Config, DEFAULTS, clientPolicy, resolveConfig } from '../src/config.js'

describe('config', () => {
  it('exposes only widget policy fields as live (volatile) settings', () => {
    const dict = Config.toJSON()
    const root = dict.refs[dict.uid]
    const volatile = Object.entries(root.dict)
      .filter(([, ref]) => dict.refs[ref].meta.volatile === true)
      .map(([key]) => key)
      .sort()
    expect(volatile).toEqual([
      'allowNetwork', 'cdnAllowlist', 'maxWidgetBytes', 'maxWidgetHeight', 'openLinkAllowedOrigins', 'sendPromptMaxChars',
    ])
  })

  it('resolves schema defaults, including volatile references', () => {
    expect({ ...resolveConfig(Config({})) }).toEqual(DEFAULTS)
  })

  it('reads volatile values at use time so settings edits apply without remounting', () => {
    let height = 600
    let origins = ['https://example.com']
    const config = resolveConfig({
      maxWidgetHeight: { get: () => height },
      openLinkAllowedOrigins: { get: () => origins },
    })
    expect(clientPolicy(config)).toMatchObject({ maxHeight: 600, openLinkOrigins: ['https://example.com'] })
    height = 900
    origins = []
    expect(clientPolicy(config)).toMatchObject({ maxHeight: 900, openLinkOrigins: [] })
  })

  it('falls back to defaults when a live reference is unset and rejects unknown keys', () => {
    expect(resolveConfig({ maxWidgetBytes: { get: () => undefined } }).maxWidgetBytes).toBe(DEFAULTS.maxWidgetBytes)
    expect(() => resolveConfig({ bogus: true })).toThrow(/unknown config key/)
  })
})
