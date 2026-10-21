import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-llm', () => ({
  createUserMessage: msg => ({ role: 'user', ...msg }),
}))

const plugin = await import('../src/plugin.js')

/** Effect-style registries like the real tools/commands/systemPrompt services. */
function registry(ctx, name) {
  const items = new Map()
  ctx.provide(name, {
    items,
    register(def) {
      const key = def.name
      items.set(key, def)
      return () => items.delete(key)
    },
    section(def) {
      items.set(def.name, def)
      return () => items.delete(def.name)
    },
  })
  return items
}

async function mount(config = {}, { systemPrompt = true } = {}) {
  const ctx = new Context()
  const tools = registry(ctx, 'tools')
  const commands = registry(ctx, 'commands')
  const sections = systemPrompt ? registry(ctx, 'systemPrompt') : new Map()
  const fork = await ctx.plugin(plugin, config)
  // The optional systemPrompt child plugin applies asynchronously.
  await new Promise(r => setTimeout(r, 0))
  return { ctx, fork, tools, commands, sections }
}

describe('plugin mount', () => {
  it('registers the UI tools, /ui and the guidance section', async () => {
    const { tools, commands, sections } = await mount()
    expect([...tools.keys()].sort()).toEqual(['ui_compose', 'ui_patch', 'ui_render', 'ui_render_widget'])
    expect([...commands.keys()]).toEqual(['ui'])
    expect([...sections.keys()]).toEqual(['intelligent-ui:guidance'])
    expect(sections.get('intelligent-ui:guidance').text).toMatch(/# Intelligent UI/)
  })

  it('honors feature flags', async () => {
    const { tools, commands, sections } = await mount({ enableWidget: false, injectGuidance: false })
    expect([...tools.keys()]).toEqual(['ui_render', 'ui_patch', 'ui_compose'])
    expect([...commands.keys()]).toEqual(['ui'])
    expect(sections.size).toBe(0)
  })

  it('does not offer composing without a UI capability, or when disabled', async () => {
    expect([...(await mount({ enableCatalog: false, enableWidget: false })).tools.keys()]).toEqual([])
    expect([...(await mount({ enableCompose: false })).tools.keys()].sort()).toEqual(['ui_patch', 'ui_render', 'ui_render_widget'])
  })

  it('still loads without a systemPrompt service', async () => {
    const { tools } = await mount({}, { systemPrompt: false })
    expect(tools.size).toBe(4)
  })

  it('/ui hands the request to the conversation model', async () => {
    const { commands } = await mount()
    const followup = vi.fn()
    const handler = commands.get('ui').handler
    expect(await handler({ agent: { followup }, rawInput: '' })).toMatchObject({ kind: 'error' })
    expect(await handler({ agent: { followup }, rawInput: 'compare sorts' })).toMatchObject({ kind: 'success' })
    expect(followup.mock.calls[0][0].content[0].text).toMatch(/^compare sorts\n\n\(Answer this with an interactive UI/)
  })
})
