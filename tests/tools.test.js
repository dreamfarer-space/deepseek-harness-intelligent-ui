import { describe, expect, it } from 'vitest'
import { DEFAULTS, clientPolicy, resolveConfig } from '../src/config.js'
import { guidanceText } from '../src/guidance.js'
import { createRenderTool, RENDER_TOOL } from '../src/tools/render.js'
import { createWidgetTool, validateWidget, WIDGET_FIELDS, WIDGET_TOOL } from '../src/tools/widget.js'
import { uiPrompt } from '../src/commands.js'

const config = resolveConfig({})

describe('ui_render tool', () => {
  const tool = createRenderTool(config)

  it('acknowledges a valid tree with a model-facing summary', async () => {
    const value = await tool.execute({
      title: 'Plan',
      root: 'r',
      components: [{ id: 'r', type: 'List', props: { items: ['a', 'b'] } }],
    })
    expect(value.ok).toBe(true)
    expect(value.summary).toMatch(/"Plan" is now displayed/)
    expect(tool.output.render({}, value)[0].text).toBe(value.summary)
  })

  it('returns ok=false with fixable errors instead of throwing', async () => {
    const value = await tool.execute({ root: 'r', components: [{ id: 'r', type: 'Nope' }] })
    expect(value.ok).toBe(false)
    expect(value.errors.join()).toMatch(/unknown component type/)
    expect(tool.output.render({}, value)[0].text).toMatch(/- components\[0\]/)
  })

  it('persists the browser policy in presentationMeta', () => {
    expect(tool.output.presentationMeta({}, { ok: true, summary: '' })).toEqual({ ok: true, policy: clientPolicy(config) })
  })

  it('declares a schema inside the DSH JSON-schema subset (no $ref, object root)', () => {
    expect(tool.name).toBe(RENDER_TOOL)
    expect(tool.parameters.type).toBe('object')
    expect(JSON.stringify(tool.parameters)).not.toMatch(/\$ref|anyOf|allOf/)
  })
})

describe('ui_render_widget tool', () => {
  const tool = createWidgetTool(config)

  it('lists parameters in the streaming order', () => {
    expect(Object.keys(tool.parameters.properties)).toEqual(WIDGET_FIELDS)
    expect(tool.name).toBe(WIDGET_TOOL)
    expect(tool.description).toMatch(/PARAMETER ORDER IS CRITICAL/)
  })

  it('accepts a widget and rejects script tags, bad types and oversize payloads', async () => {
    expect((await tool.execute({ html: '<div id=x></div>', css: '#x{}', jsExpressions: ['1'] })).ok).toBe(true)
    expect(validateWidget({ html: '<script>alert(1)</script>' }, config).join()).toMatch(/must not contain <script>/)
    expect(validateWidget({ html: 'x', jsExpressions: 'go()' }, config).join()).toMatch(/array of strings/)
    expect(validateWidget({ css: 'a{}' }, config).join()).toMatch(/html: required/)
    expect(validateWidget({ html: 'x'.repeat(DEFAULTS.maxWidgetBytes + 1) }, config).join()).toMatch(/limit is/)
  })

  it('mentions the configured CDN and network policy to the model', () => {
    const offline = createWidgetTool(resolveConfig({ cdnAllowlist: ['https://cdn.example'], allowNetwork: false }))
    expect(offline.description).toMatch(/https:\/\/cdn\.example/)
    expect(offline.description).toMatch(/Network requests .* are blocked/)
  })
})

describe('config and guidance', () => {
  it('rejects unknown keys', () => {
    expect(() => resolveConfig({ enableWidgets: true })).toThrow(/unknown config key "enableWidgets"/)
  })

  it('only mentions enabled tools', () => {
    expect(guidanceText({ enableCatalog: true, enableWidget: false })).toMatch(RENDER_TOOL)
    expect(guidanceText({ enableCatalog: true, enableWidget: false })).not.toMatch(WIDGET_TOOL)
    expect(guidanceText({ enableCatalog: false, enableWidget: false })).toBe('')
    expect(guidanceText({ enableCatalog: false, enableWidget: true })).not.toContain('Choice')
    expect(uiPrompt('show x', { enableCatalog: false, enableWidget: true })).toMatch(/using ui_render_widget;/)
  })

})
