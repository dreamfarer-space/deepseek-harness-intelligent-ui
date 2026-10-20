// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { WidgetFrame } from '../client-src/widget/WidgetFrame.tsx'
import { createControlledRuntime } from '../src/controlled/runtime.js'
import { DEFAULT_POLICY } from '../client-src/policy.ts'
import { en } from '../client-src/locales.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { buildFrameDocument } from '../client-src/widget/frame.ts'
import { JSDOM } from 'jsdom'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let el: HTMLDivElement, root: Root
beforeEach(() => { localStorage.clear(); el = document.createElement('div'); document.body.append(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove() })
const t = ((k: keyof typeof en) => en[k]) as ToolViewProps['t']
const ctx = { sessionId: 's', uiId: 'board' }, ref = { id: 'checks', scope: 'board' }
const data = { columns: ['Check', 'Minutes', 'Status'], rows: [['build', 8, 'failed'], ['lint', 2, 'passed'], ['unit', 4, 'failed']] }
const schema = { type: 'object', properties: { check: { type: 'string' } }, required: ['check'], additionalProperties: false }
function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
describe('controlled UI integration', () => {
  it('links Table search/filter/sort/page with Chart without sending model messages or persisting data', () => {
    const runtime = createControlledRuntime('s'), sendPrompt = vi.fn(async () => {})
    runtime.registerData('board', 'checks', data)
    const args = { root: 'root', components: [
      { id: 'root', type: 'Stack', children: ['table', 'chart'] },
      { id: 'table', type: 'Table', props: { dataRef: ref, pageSize: 1 } },
      { id: 'chart', type: 'Chart', props: { kind: 'bar', dataRef: ref, labelColumn: 0, valueColumns: [1] } },
    ] }
    act(() => root.render(<RenderView sessionId="s" controlled={runtime} sendPrompt={sendPrompt} callId="board" toolName="ui_render" t={t} phase="result" block={{ kind: 'tool-result', callId: 'board', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }} />))
    const labels = () => el.querySelector('.diui-chart')?.textContent
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(labels()).toContain('build'); expect(labels()).toContain('lint')
    act(() => setValue(el.querySelector('input')!, 'unit'))
    expect(el.querySelector('tbody')?.textContent).toContain('unit')
    expect(labels()).toContain('unit'); expect(labels()).not.toContain('lint')
    act(() => runtime.setView(ctx, ref, { search: '', filterColumn: 2, filterValue: 'failed', sortColumn: 1 }))
    expect(el.querySelector('tbody')?.textContent).toContain('unit')
    expect(labels()).not.toContain('lint')
    act(() => [...el.querySelectorAll('button')].find(b => b.textContent === 'Next')!.click())
    expect(el.querySelector('tbody')?.textContent).toContain('build')
    act(() => runtime.releaseScope('board'))
    expect(el.textContent).toContain('Data unavailable')
    expect(sendPrompt).not.toHaveBeenCalled(); expect(localStorage.length).toBe(0)
  })
  it('shows a graceful fallback when the host has no registry and rejects synthetic action clicks', async () => {
    const runtime = createControlledRuntime('s'), run = vi.fn(async () => ({ ok: true }))
    runtime.registerAction('board', 'retry', { schema, effect: 'read', authorize: async () => true, run })
    const args = { root: 'b', components: [{ id: 'b', type: 'Button', props: { label: 'Retry', action: { actionId: 'retry', args: { check: 'build' } } } }] }
    const props = { sessionId: 's', sendPrompt: vi.fn(async () => {}), callId: 'board', toolName: 'ui_render', t, phase: 'result' as const, block: { kind: 'tool-result' as const, callId: 'board', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } } }
    act(() => root.render(<RenderView {...props} />))
    await act(async () => el.querySelector('button')!.click())
    expect(el.textContent).toContain('Actions are unavailable')
    act(() => root.render(<RenderView {...props} controlled={runtime} />))
    await act(async () => el.querySelector('button')!.click())
    expect(el.textContent).toContain('trusted user click'); expect(run).not.toHaveBeenCalled()
  })
  it('keeps raw iframe action RPCs behind native approval and refuses forged frame sources/tokens', async () => {
    const runtime = createControlledRuntime('s'), run = vi.fn(async () => ({ ok: true }))
    runtime.registerAction('board', 'retry', { schema, effect: 'read', authorize: async () => true, run })
    act(() => root.render(<WidgetFrame sessionId="s" controlled={runtime} callId="board" mode="final" title="Widget" policy={DEFAULT_POLICY} css="" html="<p>test</p>" sendPrompt={vi.fn()} />))
    const frame = el.querySelector('iframe')!, tok = /var TOKEN = ("[^"]+")/.exec(frame.srcdoc)![1]!
    const rpc = { __diui: JSON.parse(tok), type: 'rpc', id: 1, method: 'invokeAction', params: { actionId: 'retry', args: { check: 'build' }, requestId: 'once' } }
    await act(async () => window.dispatchEvent(new MessageEvent('message', { source: window, data: rpc })))
    expect(el.querySelector('[aria-label="Requested action"]')).toBeNull()
    await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { ...rpc, __diui: 'wrong' } })))
    expect(el.querySelector('[aria-label="Requested action"]')).toBeNull()
    await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: rpc })))
    expect(el.textContent).toContain('Run action'); expect(run).not.toHaveBeenCalled()
    await act(async () => [...el.querySelectorAll('button')].find(b => b.textContent === 'Run action')!.click())
    expect(el.textContent).toContain('trusted user click'); expect(run).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { __diui: JSON.parse(tok), type: 'state', state: { private: data } } })))
    expect(localStorage.length).toBe(0)
  })
  it('rejects widget bridge actions on mount, timer and synthetic clicks while preserving prompt/link APIs', async () => {
    const html = buildFrameDocument({ token: 'test', mode: 'final', css: '', html: '<button id="go">Go</button>', theme: {}, policy: DEFAULT_POLICY })
    // Run only the bootstrap; no network/CDN or generated code.
    const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]!).find(s => s.includes('window.UI'))!
    const dom = new JSDOM('<button id="go">Go</button>', { runScripts: 'outside-only', url: 'https://example.test' })
    try {
      dom.window.ResizeObserver = class { observe() {} disconnect() {} } as any
      dom.window.eval(bootstrap)
      const bridge = (dom.window as any).Bridge
      expect(typeof bridge.sendPrompt).toBe('function'); expect(typeof bridge.openLink).toBe('function'); expect(typeof bridge.readData).toBe('function')
      await expect(bridge.invokeAction({ actionId: 'retry', args: {} })).rejects.toThrow(/user click/)
      await new Promise<void>(resolve => dom.window.setTimeout(() => { void expect(bridge.invokeAction({ actionId: 'retry', args: {} })).rejects.toThrow(/user click/).then(() => resolve()) }, 0))
      let result: Promise<unknown> | undefined
      dom.window.document.querySelector('button')!.addEventListener('click', () => { result = bridge.invokeAction({ actionId: 'retry', args: {} }) })
      dom.window.document.querySelector('button')!.click()
      await expect(result).rejects.toThrow(/user click/)
    } finally { dom.window.close() }
  })
})

it('forwards the registry to turn-tail renders and ui_patch snapshots', async () => {
  const { TurnTail } = await import('../client-src/TurnTail.tsx')
  const { PatchView } = await import('../client-src/catalog/PatchView.tsx')
  const runtime = createControlledRuntime('s')
  runtime.registerData('board', 'checks', data)
  const args = { root: 't', components: [{ id: 't', type: 'Table', props: { dataRef: ref } }] }
  const block = { kind: 'tool-result' as const, callId: 'board', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }
  const common = { sessionId: 's', controlled: runtime, sendPrompt: vi.fn(async () => {}), t }
  act(() => root.render(<TurnTail {...common} seq={9} turn={{ data: { get: () => ({ results: [block] }) } }} />))
  expect(el.querySelector('tbody')?.textContent).toContain('build')
  const patch = { ...block, callId: 'p', call: { name: 'ui_patch', argsRaw: '{}' }, meta: { ok: true, ui: { ...args, uiId: 'board', version: 2 } } }
  act(() => root.render(<PatchView {...common} callId="p" toolName="ui_patch" phase="result" block={patch} />))
  expect(el.querySelector('tbody')?.textContent).toContain('build')
})

it('does not persist interrupted controlled definitions', () => {
  const runtime = createControlledRuntime('s')
  act(() => root.render(<RenderView sessionId="s" controlled={runtime} sendPrompt={vi.fn()} callId="private" toolName="ui_render" t={t} phase="preparing" block={{ phase: 'preparing', callId: 'private' }} useToolCallArgumentsPartial={() => '{"root":"t","components":['} />))
  act(() => root.render(null))
  expect(localStorage.length).toBe(0)
})

it('resolves the optional registry through real Cordis contexts without breaking legacy hosts', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const client = await import('../client-src/index.ts')
  for (const withProvider of [false, true]) {
    const ctx = new Context(), runtime = createControlledRuntime('s')
    const entries: Record<string, any>[] = []
    ctx.provide('slots', { inject: (_: string, fn: () => unknown) => fn(), register: (entry: Record<string, any>) => { entries.push(entry) } })
    ctx.provide('locale', { register: () => () => {} })
    ctx.provide('sessions', { binding: () => undefined })
    ctx.provide('uiConversation', { events: { register: () => {} } })
    if (withProvider) ctx.provide('intelligentUiControlled', { forSession: (id: string) => id === 's' ? runtime : undefined })
    const plugin = await ctx.plugin(client)
    try {
      expect(entries).toHaveLength(5)
      expect(() => entries[0]!.inject('s')).not.toThrow()
      expect(entries[0]!.inject('s').controlled).toBe(withProvider ? runtime : undefined)
      expect(entries[0]!.inject('other').controlled).toBeUndefined()
    } finally { await plugin.dispose() }
  }
})
