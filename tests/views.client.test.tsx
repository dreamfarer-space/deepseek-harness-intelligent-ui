// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en } from '../client-src/locales.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { WidgetView } from '../client-src/widget/WidgetView.tsx'
import { promptSession } from '../client-src/index.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
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

const TREE = {
  title: 'Trip',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', props: { title: 'Kyoto' }, children: ['stat', 'tbl', 'form', 'btn'] },
    { id: 'stat', type: 'Stat', props: { label: 'Days', value: 3 } },
    { id: 'tbl', type: 'Table', props: { columns: ['Day', 'Cost'], rows: [['Mon', 30], ['Tue', 10]], sortable: true } },
    { id: 'form', type: 'Form', props: { title: 'Budget', fields: [{ name: 'max', label: 'Max', type: 'number', default: 100 }] } },
    { id: 'btn', type: 'Button', props: { label: 'Cheaper', prompt: 'Make it cheaper' } },
  ],
}

function base(sendPrompt = vi.fn(async () => {})) {
  return { callId: 'c1', toolName: 'ui_render', t, sendPrompt }
}

describe('RenderView', () => {
  it('renders streamed components progressively while preparing', () => {
    const raw = JSON.stringify(TREE)
    const cut = raw.indexOf('{"id":"tbl"')
    render(<RenderView {...base()} phase="preparing" block={{ phase: 'preparing', callId: 'c1' }} useToolCallArgumentsPartial={() => raw.slice(0, cut)} />)
    expect(host.textContent).toContain('Kyoto')
    expect(host.textContent).toContain('Days')
    expect(host.querySelectorAll('.diui-shimmer').length).toBeGreaterThan(0)
    expect(host.querySelector('table')).toBeNull()
  })

  it('renders the settled tree and sorts the table', () => {
    render(<RenderView {...base()} phase="result" block={{ kind: 'tool-result', callId: 'c1', call: { name: 'ui_render', argsRaw: JSON.stringify(TREE) }, content: [], isError: false, meta: { ok: true } }} />)
    const cells = () => [...host.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent)
    expect(cells()).toEqual(['Mon', 'Tue'])
    const costHeader = [...host.querySelectorAll('th button')][1] as HTMLButtonElement
    act(() => costHeader.click())
    expect(cells()).toEqual(['Tue', 'Mon'])
  })

  it('sends button clicks and form submissions as user messages', async () => {
    const send = vi.fn(async () => {})
    render(<RenderView {...base(send)} phase="result" block={{ kind: 'tool-result', callId: 'c1', call: { name: 'ui_render', argsRaw: JSON.stringify(TREE) }, content: [], isError: false, meta: { ok: true } }} />)
    const button = [...host.querySelectorAll('button')].find(b => b.textContent === 'Cheaper')!
    await act(async () => { button.click() })
    expect(send).toHaveBeenLastCalledWith('Make it cheaper')
    expect(host.textContent).toContain('Sent to the conversation')
    await new Promise(r => setTimeout(r, 1050))
    const form = host.querySelector('form')!
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(send).toHaveBeenLastCalledWith('Form "Budget" submitted:\n{\n  "max": 100\n}')
    expect((host.querySelector('form button[type=submit]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows validation refusals and malformed args without crashing', () => {
    render(<RenderView {...base()} phase="result" block={{ kind: 'tool-result', callId: 'c1', call: { name: 'ui_render', argsRaw: '{}' }, content: [{ type: 'text', text: 'UI not rendered\n- root: bad' }], isError: false, meta: { ok: false } }} />)
    expect(host.textContent).toContain(en['render.invalid'])
    render(<RenderView {...base()} phase="start" block={{ phase: 'start', callId: 'c1', argsRaw: '{"root":' }} />)
    expect(host.textContent).toContain(en['render.malformed'])
  })

  it('marks invalid nodes inline in a settled tree', () => {
    const args = { root: 'r', components: [{ id: 'r', type: 'Stack', children: ['p'] }, { id: 'p', type: 'Progress', props: { value: 'x' } }] }
    render(<RenderView {...base()} phase="start" block={{ phase: 'start', callId: 'c1', argsRaw: JSON.stringify(args) }} />)
    expect(host.querySelector('.diui-node-error')?.textContent).toBe('Component p (Progress) has invalid props')
  })
})

const WIDGET = {
  title: 'Wave',
  initialHeight: 300,
  placeholderMessages: ['Drawing'],
  css: '#c{color:red}',
  html: '<div id="c">wave</div>',
  jsFunctions: 'function draw(){}',
  jsExpressions: ['draw()'],
}

describe('WidgetView', () => {
  it('shows placeholder messages until css completes, then a preview frame', async () => {
    const raw = JSON.stringify(WIDGET)
    const props = { ...base(), toolName: 'ui_render_widget', phase: 'preparing' as const, block: { phase: 'preparing' as const, callId: 'w1' } }
    render(<WidgetView {...props} useToolCallArgumentsPartial={() => raw.slice(0, raw.indexOf('"css"') + 10)} />)
    expect(host.textContent).toContain('Drawing')
    expect(host.querySelector('iframe')).toBeNull()
    render(<WidgetView {...props} useToolCallArgumentsPartial={() => raw.slice(0, raw.indexOf('"html"') + 12)} />)
    // Streaming args are throttled (150 ms) before re-parsing.
    await act(async () => { await new Promise(r => setTimeout(r, 200)) })
    const frame = host.querySelector('iframe')!
    expect(frame.dataset.mode).toBe('preview')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(frame.getAttribute('srcdoc')).not.toContain('id="ui-code"')
  })

  it('renders the final sandboxed document with code and keeps it across start→result', () => {
    const argsRaw = JSON.stringify(WIDGET)
    const props = { ...base(), toolName: 'ui_render_widget', callId: 'w3' }
    render(<WidgetView {...props} phase="start" block={{ phase: 'start', callId: 'w3', argsRaw }} />)
    const first = host.querySelector('iframe')!
    const doc = first.getAttribute('srcdoc')!
    expect(first.dataset.mode).toBe('final')
    expect(doc).toContain('<div id="ui-root"><div id="c">wave</div></div>')
    expect(doc).toContain('function draw(){}')
    expect(doc).not.toContain('allow-same-origin')
    render(<WidgetView {...props} phase="result" block={{ kind: 'tool-result', callId: 'w3', call: { name: 'ui_render_widget', argsRaw }, content: [], isError: false, meta: { ok: true, policy: { cdn: ['https://esm.sh', 'https://cdn.jsdelivr.net', 'https://unpkg.com'], allowNetwork: false, maxHeight: 2400, sendPromptMaxChars: 4000, openLinkOrigins: [] } } }} />)
    const second = host.querySelector('iframe')!
    expect(second).toBe(first)
    expect(second.getAttribute('srcdoc')).toBe(doc)
  })

  it('shows refused widgets as a problem', () => {
    render(<WidgetView {...base()} toolName="ui_render_widget" phase="result" block={{ kind: 'tool-result', callId: 'w4', call: { name: 'ui_render_widget', argsRaw: '{"html":"<script>"}' }, content: [{ type: 'text', text: 'no' }], isError: false, meta: { ok: false } }} />)
    expect(host.textContent).toContain(en['widget.invalid'])
    expect(host.querySelector('iframe')).toBeNull()
  })
})

describe('promptSession', () => {
  it('echoes then prompts with the submission id; abandons on throw', async () => {
    const prompt = vi.fn(async () => ({ ok: true }))
    const abandon = vi.fn()
    const session = { beginSubmission: vi.fn(() => ({ requestId: 'r1', abandon })), prompt }
    await promptSession({ binding: () => ({ session }) }, 's1', 'hi')
    expect(session.beginSubmission).toHaveBeenCalledWith({ mode: 'queue', text: 'hi', attachments: [] })
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'hi' }], 'queue', undefined, 'r1')
    prompt.mockRejectedValueOnce(new Error('net'))
    await expect(promptSession({ binding: () => ({ session }) }, 's1', 'hi')).rejects.toThrow('net')
    expect(abandon).toHaveBeenCalled()
    prompt.mockResolvedValueOnce({ ok: false, error: { message: 'busy' } } as never)
    await expect(promptSession({ binding: () => ({ session }) }, 's1', 'hi')).rejects.toThrow('busy')
    await expect(promptSession({ binding: () => undefined }, 's1', 'hi')).rejects.toThrow(/not open/)
  })
})
