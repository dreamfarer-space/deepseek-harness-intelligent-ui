// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerComponentExtension, type ExtensionRenderContext } from '../client-src/catalog/extensions.tsx'
import { registerCatalogExtension, type CatalogExtension, type ExtensionHandle } from '../src/catalog/extensions.js'
import { manifest, definition } from '../examples/component-extension/manifest.js'
import { renderers } from '../examples/component-extension/renderers.js'
import { renderNode, type RenderEnv } from '../client-src/catalog/components.tsx'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { mount } from '../renderer-src/index.tsx'
import { DEFAULT_POLICY } from '../client-src/policy.ts'
import { en } from '../client-src/locales.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { createControlledRuntime } from '../src/controlled/runtime.js'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const m = manifest as CatalogExtension
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const t = ((key: keyof typeof en) => en[key]) as ToolViewProps['t']
const handles: ExtensionHandle[] = []
let element: HTMLDivElement, root: Root
beforeEach(() => { localStorage.clear(); element = document.createElement('div'); document.body.append(element); root = createRoot(element) })
afterEach(() => { act(() => { root.unmount(); for (const h of handles.splice(0)) h.dispose() }); element.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function install(rs: Record<string, (context: ExtensionRenderContext<any>) => React.ReactNode> = renderers) {
  let h!: ExtensionHandle
  act(() => { h = registerComponentExtension(m, rs); handles.push(h) })
  return h
}
function paint(tree = definition, extra: Partial<RenderEnv> = {}) {
  const env: RenderEnv = { nodes: new Map(tree.components.map(n => [n.id, n])), t, streaming: false, policy: DEFAULT_POLICY, send: vi.fn(async () => {}), ...extra }
  act(() => root.render(<>{renderNode(tree.root, env)}</>))
  return env
}
describe('browser catalog extensions', () => {
  it('renders the real example and refreshes existing DOM on disable, enable, uninstall and reinstall', () => {
    const h = install(); paint()
    expect(element.querySelector('pre')?.textContent).toContain('+const gain = 2;')
    act(() => h.setEnabled(false))
    expect(element.querySelector('pre')).toBeNull()
    expect(element.querySelector('.diui-node-error')).not.toBeNull()
    act(() => h.setEnabled(true))
    expect(element.querySelector('pre')).not.toBeNull()
    act(() => h.dispose())
    expect(element.querySelector('.diui-node-error')).not.toBeNull()
    install()
    expect(element.querySelector('pre')).not.toBeNull()
  })

  it('never runs unregistered, schema-invalid, missing-renderer or incompatible-version components', () => {
    paint(); expect(element.querySelector('.diui-node-error')).not.toBeNull()
    const render = vi.fn(() => <p>trusted render</p>)
    const h = install({ GitDiffViewer: render })
    render.mockClear()
    for (const tree of [
      { ...definition, components: [{ ...definition.components[0]!, props: { diff: 123 } }] },
      { ...definition, components: [{ ...definition.components[0]!, componentVersion: '2.0.0' }] },
    ]) {
      paint(tree as typeof definition)
      expect(element.querySelector('.diui-node-error')).not.toBeNull()
    }
    expect(render).not.toHaveBeenCalled()
    act(() => h.dispose())
    act(() => { handles.push(registerCatalogExtension(m)) })
    paint(); expect(element.querySelector('.diui-node-error')?.getAttribute('title')).toContain('renderer unavailable')
    expect(() => registerComponentExtension(m, {})).toThrow(/trusted renderer/)
  })

  it('isolates a renderer failure from its builtin siblings', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    install({ GitDiffViewer: () => { throw new Error('installation failure') } })
    const env: RenderEnv = { nodes: new Map([
      ['root', { id: 'root', type: 'Stack', children: ['diff', 'text'] }],
      ['diff', definition.components[0]!],
      ['text', { id: 'text', type: 'Text', props: { text: 'Still usable' } }],
    ]), streaming: false, t, send: vi.fn(), policy: DEFAULT_POLICY }
    act(() => root.render(<>{renderNode('root', env)}</>))
    expect(element.textContent).toContain('Component extension failed')
    expect(element.textContent).toContain('Still usable')
  })

  it('preserves hook state across streaming/final/patch transitions and unrelated registration', () => {
    install({ GitDiffViewer: ({ h }) => { const [count, setCount] = useState(0); return h('button', { onClick: () => setCount(n => n + 1) }, String(count)) } })
    paint(definition, { streaming: true })
    act(() => element.querySelector('button')!.click())
    paint(); expect(element.textContent).toBe('1')
    act(() => { handles.push(registerComponentExtension({ ...m, namespace: 'another.git' }, renderers)) })
    expect(element.textContent).toBe('1')
    paint({ ...definition, components: [{ ...definition.components[0]!, props: { diff: 'updated' } }] })
    expect(element.textContent).toBe('1')
  })

  it('uses completed streamed nodes and retains a safe stopped preview when generation is interrupted', () => {
    const sendPrompt = vi.fn(async () => {})
    install()
    const raw = JSON.stringify({ ...definition, components: [...definition.components, { id: 'tail', type: 'Text', props: { text: 'incomplete' } }] })
    const partial = raw.slice(0, raw.indexOf('{"id":"tail"') + 12)
    act(() => root.render(<RenderView t={t} callId="u" toolName="ui_render" sendPrompt={sendPrompt} phase="preparing" block={{ phase: 'preparing', callId: 'u' }} useToolCallArgumentsPartial={() => partial} />))
    expect(element.querySelector('pre')?.textContent).toContain('gain')
    expect(element.querySelector('details button')?.disabled).toBe(true)
    act(() => root.render(<RenderView t={t} callId="u" toolName="ui_render" sendPrompt={sendPrompt} phase="result" block={{ kind: 'tool-result', callId: 'u', call: { name: 'ui_render', argsRaw: partial }, content: [], isError: true, error: { code: 'interrupted' } }} />))
    expect(element.querySelector('pre')?.textContent).toContain('gain')
    expect(element.querySelector('details button')?.disabled).toBe(true)
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('renders a successful patch result through the same extension catalog', () => {
    install()
    const ui = { ...definition, uiId: 'u', version: 2 }
    act(() => root.render(<PatchView t={t} callId="p" toolName="ui_patch" sendPrompt={vi.fn()} phase="result" block={{ kind: 'tool-result', callId: 'p', call: { name: 'ui_patch', argsRaw: '{}' }, content: [], isError: false, meta: { ok: true, ui } }} />))
    expect(element.querySelector('pre')?.textContent).toContain('gain')
  })

  it('blocks preview/stopped actions, undeclared actions, forged events and callbacks from unloaded extensions', async () => {
    let context!: ExtensionRenderContext
    const h = install({ GitDiffViewer: ctx => { context = ctx; return null } })
    const env = paint(definition, { streaming: true })
    await expect(context.sendPrompt('x')).rejects.toThrow(/not ready/)
    paint(definition, { stopped: true })
    await expect(context.invokeAction('delete', {}, new Event('click'))).rejects.toThrow(/not ready/)
    paint(); await expect(context.invokeAction('delete', {}, new Event('click'))).rejects.toThrow(/not declared/)
    act(() => h.dispose())
    await expect(context.sendPrompt('x')).rejects.toThrow(/unavailable/)
    expect(env.send).not.toHaveBeenCalled()
    const withActions = { ...m, components: [{ ...m.components[0]!, actions: ['read'] }] }
    act(() => handles.push(registerComponentExtension(withActions, { GitDiffViewer: ctx => { context = ctx; return null } })))
    const runtime = createControlledRuntime('s')
    const run = vi.fn()
    runtime.registerAction('u', 'read', { schema: { type: 'object', properties: {}, additionalProperties: false }, effect: 'read', authorize: async () => true, run })
    paint(definition, { controlled: runtime, sessionId: 's', callId: 'u' })
    await expect(context.invokeAction('read', {}, new Event('click'))).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })

  it('revokes callbacks from a disposed installation even if the same renderer is reinstalled', async () => {
    let context!: ExtensionRenderContext
    const render = (ctx: ExtensionRenderContext) => { context = ctx; return null }
    const handle = install({ GitDiffViewer: render })
    const env = paint()
    const oldSend = context.sendPrompt
    act(() => handle.dispose())
    install({ GitDiffViewer: render })
    await expect(oldSend('stale')).rejects.toThrow(/unavailable/)
    expect(env.send).not.toHaveBeenCalled()
  })

  it('supports portable mounts and automatically degrades when the extension is uninstalled', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    const h = install()
    const el = document.createElement('div'); document.body.append(el)
    const renderer = mount(el, { sendPrompt: vi.fn() })
    try {
      act(() => renderer.render({ kind: 'declarative', uiId: 'portable', version: 1, definition }))
      expect(el.querySelector('pre')?.textContent).toContain('gain')
      act(() => h.dispose())
      expect(el.textContent).toContain('Unsupported or invalid UI definition')
    } finally { act(() => renderer.dispose()); el.remove() }
  })
})
