// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en } from '../client-src/locales.ts'
import { getUiState, resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { WidgetView } from '../client-src/widget/WidgetView.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(el: React.ReactElement) {
  act(() => root.render(el))
}

/** Unmount and mount again on the same host (Turn-tail move or page reload). */
function remount(el: React.ReactElement) {
  act(() => root.unmount())
  root = createRoot(host)
  render(el)
}

function base(sendPrompt: (text: string) => Promise<void> = vi.fn(async () => {})) {
  return { callId: 'c1', toolName: 'ui_render', t, sendPrompt }
}

function setInputValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const settled = (callId: string, name: string, args: unknown) => ({
  kind: 'tool-result' as const, callId, call: { name, argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true },
})

const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)

const TREE = {
  title: 'Trip',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', props: { title: 'Kyoto' }, children: ['stat', 'tbl', 'btn'] },
    { id: 'stat', type: 'Stat', props: { label: 'Days', value: 3 } },
    { id: 'tbl', type: 'Table', props: { columns: ['Day', 'Cost'], rows: [['Mon', 30], ['Tue', 10]], sortable: true } },
    { id: 'btn', type: 'Button', props: { label: 'Cheaper', prompt: 'Make it cheaper' } },
  ],
}

const WIDGET = {
  title: 'Wave',
  initialHeight: 300,
  placeholderMessages: ['Drawing'],
  css: '#c{color:red}',
  html: '<div id="c">wave</div>',
  jsFunctions: 'function draw(){}',
  jsExpressions: ['draw()'],
}

describe('catalog interactions and state', () => {
  const PLOT = {
    root: 'p',
    components: [{ id: 'p', type: 'Plot', props: { functions: [{ expr: 'a*x^2' }], xMin: -2, xMax: 2, yMin: -10, yMax: 10, params: [{ name: 'a', min: -3, max: 3, step: 0.5, value: 1 }] } }],
  }

  it('redraws a Plot locally when its slider moves (no message to the model) and keeps the value', () => {
    const send = vi.fn(async () => {})
    const view = <RenderView {...base(send)} callId="p1" phase="result" block={settled('p1', 'ui_render', PLOT)} />
    render(view)
    const path = () => host.querySelector('.diui-plot path')!.getAttribute('d')
    const before = path()
    act(() => setInputValue(host.querySelector('.diui-param input[type=range]') as HTMLInputElement, '-2'))
    expect(path()).not.toBe(before)
    expect(host.querySelector('.diui-param-value')!.textContent).toBe('-2')
    expect(send).not.toHaveBeenCalled()
    expect(getUiState('p1', 'p:params')).toEqual({ a: -2 })
    remount(view)
    expect((host.querySelector('.diui-param input[type=range]') as HTMLInputElement).value).toBe('-2')
  })

  it('keeps form values and the submitted lock across remounts', async () => {
    const send = vi.fn(async () => {})
    const args = { root: 'f', components: [{ id: 'f', type: 'Form', props: { title: 'Sphere', fields: [{ name: 'R', label: 'Radius', type: 'range', min: 0.5, max: 3, step: 0.5, default: 1 }] } }] }
    const view = <RenderView {...base(send)} callId="f1" phase="result" block={settled('f1', 'ui_render', args)} />
    render(view)
    act(() => setInputValue(host.querySelector('input[type=range]') as HTMLInputElement, '2.5'))
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(send).toHaveBeenCalledWith('Form "Sphere" submitted:\n{\n  "R": 2.5\n}')
    remount(view)
    expect((host.querySelector('input[type=range]') as HTMLInputElement).value).toBe('2.5')
    expect((host.querySelector('button[type=submit]') as HTMLButtonElement).disabled).toBe(true)
    expect(host.textContent).toContain('Submitted')
  })

  it('ignores a double click while a send is in flight', async () => {
    let release!: () => void
    const send = vi.fn(() => new Promise<void>((r) => { release = r }))
    render(<RenderView {...base(send)} callId="b1" phase="result" block={settled('b1', 'ui_render', TREE)} />)
    const cheaper = button('Cheaper')!
    await act(async () => { cheaper.click(); cheaper.click() })
    expect(send).toHaveBeenCalledTimes(1)
    expect(cheaper.disabled).toBe(true)
    expect(host.textContent).toContain('Sending')
    await act(async () => { release() })
    expect(host.textContent).toContain('Sent to the conversation')
  })

  it('keeps the table sort across remounts', () => {
    const view = <RenderView {...base()} callId="s2" phase="result" block={settled('s2', 'ui_render', TREE)} />
    render(view)
    act(() => (host.querySelectorAll('th button')[1] as HTMLButtonElement).click())
    const firstCol = () => [...host.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent)
    expect(firstCol()).toEqual(['Tue', 'Mon'])
    remount(view)
    expect(firstCol()).toEqual(['Tue', 'Mon'])
  })

  it('moves between tabs with the keyboard', () => {
    const args = { root: 't', components: [{ id: 't', type: 'Tabs', props: { labels: ['A', 'B', 'C'] }, children: ['a', 'b', 'c'] }, { id: 'a', type: 'Text', props: { text: 'first' } }, { id: 'b', type: 'Text', props: { text: 'second' } }, { id: 'c', type: 'Text', props: { text: 'third' } }] }
    render(<RenderView {...base()} callId="t1" phase="result" block={settled('t1', 'ui_render', args)} />)
    const list = host.querySelector('[role=tablist]')!
    act(() => { list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
    expect(host.querySelector('[role=tabpanel]')!.textContent).toBe('third')
    expect(document.activeElement?.textContent).toBe('C')
    act(() => { list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })) })
    expect(host.querySelector('[role=tabpanel]')!.textContent).toBe('first')
    expect([...host.querySelectorAll('[role=tab]')].map(tab => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('renders Timeline natively and Math/Mermaid in sandboxed frames', () => {
    const args = { root: 's', components: [
      { id: 's', type: 'Stack', children: ['tl', 'm', 'd'] },
      { id: 'tl', type: 'Timeline', props: { items: [{ title: 'Design', time: 'Q1' }, { title: 'Ship', time: 'Q2', tone: 'success' }] } },
      { id: 'm', type: 'Math', props: { tex: 'x^2+y^2+z^2=2Rz' } },
      { id: 'd', type: 'Mermaid', props: { code: 'flowchart LR\n A-->B' } },
    ] }
    render(<RenderView {...base()} callId="l1" phase="result" block={settled('l1', 'ui_render', args)} />)
    expect([...host.querySelectorAll('.diui-timeline-title')].map(e => e.textContent)).toEqual(['Design', 'Ship'])
    const frames = [...host.querySelectorAll('.diui-lib iframe')]
    expect(frames).toHaveLength(2)
    for (const f of frames) expect(f.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(frames[0]!.getAttribute('srcdoc')).toContain('katex@0.16.11')
    expect(frames[1]!.getAttribute('srcdoc')).toContain('mermaid@11.4.1')
  })

  it('keeps the finished part of a stopped UI and offers to regenerate it', async () => {
    const send = vi.fn(async () => {})
    const raw = JSON.stringify(TREE)
    const cut = raw.slice(0, raw.indexOf('{"id":"tbl"') + 20)
    render(<RenderView {...base(send)} callId="s1" phase="result" block={{ kind: 'tool-result', callId: 's1', call: { name: 'ui_render', argsRaw: cut }, content: [{ type: 'text', text: 'interrupted' }], isError: true, error: { name: 'ToolError', code: 'interrupted' } }} />)
    expect(host.querySelector('.diui-shell')!.getAttribute('data-state')).toBe('stopped')
    expect(host.textContent).toContain(en['render.stopped'])
    expect(host.textContent).toContain('Kyoto')
    expect(host.querySelectorAll('.diui-shimmer')).toHaveLength(0)
    await act(async () => { button('Regenerate')!.click() })
    expect(send).toHaveBeenCalledWith('Generating the UI "Trip" was interrupted. Please generate the complete UI again.')
  })
})

describe('widget lifecycle', () => {
  const frameToken = (frame: HTMLIFrameElement) => /var TOKEN = "([0-9a-f]+)"/.exec(frame.getAttribute('srcdoc') ?? '')![1]!
  const fromFrame = (frame: HTMLIFrameElement, data: Record<string, unknown>, token = frameToken(frame)) => {
    window.dispatchEvent(new MessageEvent('message', { data: { ...data, __diui: token }, source: frame.contentWindow }))
  }

  it('finalizes the streaming preview frame in place instead of rebuilding it', async () => {
    const raw = JSON.stringify(WIDGET)
    const props = { ...base(), toolName: 'ui_render_widget', callId: 'w5' }
    render(<WidgetView {...props} phase="preparing" block={{ phase: 'preparing', callId: 'w5' }} useToolCallArgumentsPartial={() => raw.slice(0, raw.indexOf('"jsFunctions"'))} />)
    await act(async () => { await new Promise(r => setTimeout(r, 150)) })
    const frame = host.querySelector('iframe')!
    const doc = frame.getAttribute('srcdoc')
    expect(frame.dataset.mode).toBe('preview')
    const posted = vi.spyOn(frame.contentWindow!, 'postMessage')
    await act(async () => { fromFrame(frame, { type: 'ready', final: false }) })
    expect(posted.mock.calls.at(-1)![0]).toMatchObject({ type: 'html', html: '<div id="c">wave</div>' })
    render(<WidgetView {...props} phase="start" block={{ phase: 'start', callId: 'w5', argsRaw: raw }} useToolCallArgumentsPartial={() => ''} />)
    expect(host.querySelector('iframe')).toBe(frame)
    expect(frame.getAttribute('srcdoc')).toBe(doc)
    expect(frame.dataset.mode).toBe('final')
    expect(posted.mock.calls.at(-1)![0]).toMatchObject({ type: 'final', html: WIDGET.html, code: { functions: WIDGET.jsFunctions, expressions: WIDGET.jsExpressions } })
  })

  it('ignores messages without the frame token or from another window', async () => {
    const send = vi.fn(async () => {})
    const props = { ...base(send), toolName: 'ui_render_widget', callId: 'w9' }
    render(<WidgetView {...props} phase="result" block={settled('w9', 'ui_render_widget', WIDGET)} />)
    const frame = host.querySelector('iframe')!
    await act(async () => {
      fromFrame(frame, { type: 'state', state: { data: { forged: true } } }, 'not-the-token')
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'state', state: { data: { forged: true } }, __diui: frameToken(frame) }, source: window }))
    })
    expect(getUiState('w9', 'widget')).toBeUndefined()
  })

  it('persists widget state the frame reports and hands it back on rebuild', async () => {
    const props = { ...base(), toolName: 'ui_render_widget', callId: 'w6' }
    const view = <WidgetView {...props} phase="result" block={settled('w6', 'ui_render_widget', WIDGET)} />
    render(view)
    await act(async () => { fromFrame(host.querySelector('iframe')!, { type: 'state', state: { data: { n: 2 }, controls: { a: '1.5' } } }) })
    expect(getUiState('w6', 'widget')).toEqual({ data: { n: 2 }, controls: { a: '1.5' } })
    remount(view)
    expect(host.querySelector('iframe')!.getAttribute('srcdoc')).toContain('"state":{"data":{"n":2},"controls":{"a":"1.5"}}')
  })

  it('surfaces script errors with reload and ask-to-fix actions', async () => {
    const send = vi.fn(async () => {})
    const props = { ...base(send), toolName: 'ui_render_widget', callId: 'w7' }
    render(<WidgetView {...props} phase="result" block={settled('w7', 'ui_render_widget', WIDGET)} />)
    const frame = host.querySelector('iframe')!
    await act(async () => { fromFrame(frame, { type: 'error', kind: 'runtime', message: 'THREE is not defined' }) })
    expect(host.textContent).toContain('1 script error(s)')
    expect(button('Reload')).toBeDefined()
    await act(async () => { button('Ask to fix')!.click() })
    expect((send.mock.calls[0] as unknown as [string])[0]).toContain('- runtime: THREE is not defined')
  })

  it('reloads the frame on request', async () => {
    const props = { ...base(), toolName: 'ui_render_widget', callId: 'w10' }
    render(<WidgetView {...props} phase="result" block={settled('w10', 'ui_render_widget', WIDGET)} />)
    const frame = host.querySelector('iframe')!
    const doc = frame.getAttribute('srcdoc')
    await act(async () => { fromFrame(frame, { type: 'error', kind: 'runtime', message: 'boom' }) })
    act(() => button('Reload')!.click())
    expect(host.textContent).not.toContain('script error')
    // Same token and inputs, so the rebuilt document is equal; the srcdoc attribute is re-applied by React.
    expect(host.querySelector('iframe')!.getAttribute('srcdoc')).toBe(doc)
  })

  it('keeps a static preview when generation stops mid-widget', () => {
    const raw = JSON.stringify(WIDGET)
    const cut = raw.slice(0, raw.indexOf('"html"') + 15)
    render(<WidgetView {...base()} toolName="ui_render_widget" callId="w8" phase="result" block={{ kind: 'tool-result', callId: 'w8', call: { name: 'ui_render_widget', argsRaw: cut }, content: [], isError: true, error: { name: 'ToolError', code: 'interrupted' } }} />)
    expect(host.querySelector('.diui-shell')!.getAttribute('data-state')).toBe('stopped')
    expect(host.textContent).toContain(en['widget.stopped'])
    const frame = host.querySelector('iframe')!
    expect(frame.dataset.mode).toBe('preview')
    expect(frame.getAttribute('srcdoc')).not.toContain('id="ui-code"')
    expect(button('Regenerate')).toBeDefined()
  })
})
