import { describe, expect, it } from 'vitest'
import { Config, DEFAULTS, clientPolicy, resolveConfig } from '../src/config.js'
import { createWidgetTool } from '../src/tools/widget.js'
import { createComposeTool } from '../src/tools/compose.js'
import { createRenderTool } from '../src/tools/render.js'
import { createPatchTool } from '../src/tools/patch.js'

describe('config', () => {
  it('exposes only widget policy fields as live (volatile) settings', () => {
    const dict = Config.toJSON()
    const root = dict.refs[dict.uid]
    const volatile = Object.entries(root.dict)
      .filter(([, ref]) => dict.refs[ref].meta.volatile === true)
      .map(([key]) => key)
      .sort()
    expect(volatile).toEqual([
      'allowNetwork', 'cdnAllowlist', 'mapTileAttribution', 'mapTileMaxZoom', 'mapTileUrl', 'maxWidgetBytes', 'maxWidgetHeight', 'mediaAllowedOrigins', 'openLinkAllowedOrigins', 'sendPromptMaxChars',
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

  it('passes a usable tile template to the browser and drops anything else', () => {
    const tiles = (mapTileUrl, extra = {}) => clientPolicy(resolveConfig({ mapTileUrl, ...extra })).mapTiles
    expect(tiles('')).toBeNull()
    expect(tiles('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { mapTileAttribution: '© OpenStreetMap contributors', mapTileMaxZoom: 19 }))
      .toEqual({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', maxZoom: 19 })
    expect(tiles('http://tile.example/{z}/{x}/{y}.png')).toBeNull()
    expect(tiles('https://tile.example/{z}/{x}.png')).toBeNull()
    expect(tiles('javascript:alert(1)//{z}{x}{y}')).toBeNull()
  })

  it('falls back to defaults when a live reference is unset and rejects unknown keys', () => {
    expect(resolveConfig({ maxWidgetBytes: { get: () => undefined } }).maxWidgetBytes).toBe(DEFAULTS.maxWidgetBytes)
    expect(() => resolveConfig({ bogus: true })).toThrow(/unknown config key/)
  })
})


describe('live policy on registered tools', () => {
  it('revokes permissions in every subsequent result without rebuilding tools', () => {
    let allowNetwork = true
    let cdn = ['https://cdn.example']
    let origins = ['https://links.example']
    let maxHeight = 900
    let sendPromptMaxChars = 2000
    const config = resolveConfig({
      allowNetwork: { get: () => allowNetwork },
      cdnAllowlist: { get: () => cdn },
      openLinkAllowedOrigins: { get: () => origins },
      maxWidgetHeight: { get: () => maxHeight },
      sendPromptMaxChars: { get: () => sendPromptMaxChars },
    })
    const tools = [createWidgetTool(config), createComposeTool(config), createRenderTool(config), createPatchTool(config)]
    const previous = tools.map(tool => tool.output.presentationMeta({}, { ok: true, ui: {} }))
    for (const meta of previous) expect(meta.policy).toEqual({ cdn, allowNetwork: true, openLinkOrigins: origins, maxHeight: 900, sendPromptMaxChars: 2000, mapTiles: null, allowMedia: true, mediaOrigins: [] })
    for (const tool of tools.slice(0, 2)) {
      expect(tool.description).toContain('https://cdn.example')
      expect(tool.description).toContain('fetch() to those origins is allowed.')
    }
    allowNetwork = false
    cdn = []
    origins = []
    maxHeight = 500
    sendPromptMaxChars = 100
    for (const tool of tools) {
      for (const ok of [true, false]) expect(tool.output.presentationMeta({}, { ok, ui: {} }).policy).toEqual({
        cdn: [], allowNetwork: false, openLinkOrigins: [], maxHeight: 500, sendPromptMaxChars: 100, mapTiles: null, allowMedia: true, mediaOrigins: [],
      })
    }
    for (const tool of tools.slice(0, 2)) {
      expect(tool.description).not.toContain('https://cdn.example')
      expect(tool.description).toContain('fetch/XHR/WebSocket are blocked.')
    }
    // Historical receipts retain the policy they were created with.
    for (const meta of previous) expect(meta.policy.allowNetwork).toBe(true)
  })

  it('applies a new widget size limit to standalone and composed widgets', async () => {
    let limit = 400000
    const config = resolveConfig({ maxWidgetBytes: { get: () => limit } })
    const widget = createWidgetTool(config)
    const compose = createComposeTool(config)
    const args = { html: 'x'.repeat(10001) }
    const composition = { blocks: [{ id: 'w', type: 'widget', ...args }] }
    expect((await widget.execute(args)).ok).toBe(true)
    expect((await compose.execute(composition, { callId: 'c' })).ok).toBe(true)
    limit = 10000
    expect((await widget.execute(args)).ok).toBe(false)
    expect((await compose.execute(composition, { callId: 'c' })).ok).toBe(false)
  })
})
