// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposeView, copyText } from '../client-src/compose/ComposeView.tsx'
import { readComposeBlocks as readBlocks } from '../client-src/compose/blocks.ts'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import { uiTurnDefinition } from '../client-src/turn.ts'
import type { ToolResultNode, ToolViewProps } from '../client-src/types/dsh.ts'
import { latestUiVersion, resetUiVersions } from '../client-src/versions.ts'
import { composeUiId } from '../src/compose/compose.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  resetUiVersions()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

const render = (el: React.ReactElement) => act(() => root.render(el))
function remount(el: React.ReactElement) {
  act(() => root.unmount())
  root = createRoot(host)
  render(el)
}

const TREE = { root: 'card', components: [
  { id: 'card', type: 'Card', props: { title: 'Chart' }, children: ['chart'] },
  { id: 'chart', type: 'Chart', props: { kind: 'bar', labels: ['Q1', 'Q2'], series: [{ name: 'Local', values: [3, 5] }] } },
] }
const WIDGET = { title: 'Simulator', css: '#stage{height:120px}', html: '<div id="stage">sim</div>', jsFunctions: 'function go(){}', jsExpressions: ['go()'] }
const BLOCKS = [
  { id: 'intro', type: 'markdown', text: '## Recommendation\n\nStart **local**, then grow.\n\n| Option | Cost |\n| --- | --- |\n| Local | low |' },
  { id: 'chart', type: 'catalog', title: 'Comparison', ...TREE },
  { id: 'risks', type: 'markdown', text: 'Risks follow the chart.' },
  { id: 'sim', type: 'widget', ...WIDGET },
]
const args = { title: 'Route decision', blocks: BLOCKS }
const settled = (extra: Partial<ToolResultNode> = {}): ToolResultNode => ({
  kind: 'tool-result', callId: 'comp-1', call: { name: 'ui_compose', argsRaw: JSON.stringify(args) },
  content: [], isError: false, meta: { ok: true }, ...extra,
})
const base = (sendPrompt = vi.fn(async () => {})) => ({ callId: 'comp-1', toolName: 'ui_compose', t, sendPrompt, sendNewSessionPrompt: vi.fn(async () => {}) })
const view = (extra: Partial<ToolResultNode> = {}) => <ComposeView {...base()} phase="result" block={settled(extra)} />

describe('ComposeView', () => {
  it('renders prose, catalog UI and widget in the model\'s order', () => {
    render(view())
    const compose = host.querySelector('.diui-compose')!
    const parts = [...compose.children]
    expect(parts.map(p => p.className)).toEqual(['diui-md', 'diui-render', 'diui-md', 'diui-compose-widget'])
    expect(parts[0]!.textContent).toContain('Recommendation')
    expect(parts[0]!.querySelector('strong')!.textContent).toBe('local')
    expect(parts[0]!.querySelector('table')!.textContent).toContain('Local')
    expect(parts[1]!.querySelector('.diui-chart-svg')).not.toBeNull()
    expect(parts[2]!.textContent).toContain('Risks follow the chart.')
    expect(parts[3]!.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(host.querySelector('.diui-shell-title')!.textContent).toBe('Route decision')
    expect(host.querySelector('.diui-shell-status')!.textContent).toBe('4 blocks')
  })

  it('shows only blocks that finished while the answer streams, and nothing half-parsed', async () => {
    const raw = JSON.stringify(args)
    const cut = raw.indexOf(',{"id":"risks"')
    render(<ComposeView {...base()} phase="preparing" block={{ phase: 'preparing', callId: 'comp-1' }} useToolCallArgumentsPartial={() => raw.slice(0, cut)} />)
    // Streaming arguments are throttled (100 ms) before re-parsing.
    await act(async () => { await new Promise(r => setTimeout(r, 150)) })
    expect(host.querySelectorAll('.diui-md')).toHaveLength(1)
    expect(host.querySelector('.diui-chart-svg')).not.toBeNull()
    expect(host.querySelector('.diui-compose-widget')).toBeNull()
    expect(host.querySelector('.diui-shell')!.getAttribute('data-state')).toBe('generating')
    // The widget arrives; the streaming frame stays a preview until the result.
    render(<ComposeView {...base()} phase="preparing" block={{ phase: 'preparing', callId: 'comp-1' }} useToolCallArgumentsPartial={() => raw} />)
    await act(async () => { await new Promise(r => setTimeout(r, 150)) })
    expect(host.querySelectorAll('.diui-md')).toHaveLength(2)
    expect(host.querySelector('iframe')!.dataset.mode).toBe('preview')
  })

  it('never executes raw HTML or dangerous links from the prose', () => {
    const hostile = { title: 'T', blocks: [{ id: 'x', type: 'markdown', text: [
      '<script>window.__xss=1</script>', '',
      '<img src=x onerror="window.__xss=1">', '',
      '[bad](javascript:alert(1)) [ok](https://example.com)', '',
      '![tracker](https://tracker.example/pixel.png)', '',
      '`<b>inline</b>`',
    ].join(String.fromCharCode(10)) }] }
    render(<ComposeView {...base()} phase="result" block={{ ...settled(), call: { name: 'ui_compose', argsRaw: JSON.stringify(hostile) } }} />)
    // Raw HTML is dropped entirely: it is neither rendered nor executed.
    expect(host.querySelector('script,img')).toBeNull()
    expect(host.textContent).not.toContain('window.__xss=1')
    expect(host.querySelector('.diui-md')!.querySelector('script')).toBeNull()
    const links = [...host.querySelectorAll('a')]
    // A javascript: target is refused by the URL policy and rendered without a link;
    // a remote image becomes a plain link instead of loading third-party content.
    expect(links.map(a => a.getAttribute('href'))).toEqual(['https://example.com/', 'https://tracker.example/pixel.png'])
    expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer')
    expect(links[0]!.getAttribute('target')).toBe('_blank')
    expect(host.textContent).toContain('bad')
    expect(host.querySelector('code')!.textContent).toBe('<b>inline</b>')
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
  })

  it('sends Choice confirmations from a catalog block as user messages', async () => {
    const send = vi.fn(async () => {})
    const choice = { blocks: [
      { id: 'analysis', type: 'markdown', text: 'Both routes work.' },
      { id: 'pick', type: 'catalog', root: 'c', components: [{ id: 'c', type: 'Choice', props: { question: 'Which route?', options: [
        { id: 'a', label: 'Local', prompt: 'Discuss local storage; do not code.' },
        { id: 'b', label: 'Cloud', prompt: 'Discuss cloud storage; do not code.' },
      ] } }] },
    ] }
    render(<ComposeView {...base(send)} phase="result" block={{ ...settled(), call: { name: 'ui_compose', argsRaw: JSON.stringify(choice) } }} />)
    act(() => host.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]!.click())
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(send).toHaveBeenCalledExactlyOnceWith('Discuss cloud storage; do not code.')
  })

  it('copies the prose in order and points at the UI blocks', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(view())
    expect(copyText(readBlocks(JSON.stringify(args), false))).toBe([
      '## Recommendation\n\nStart **local**, then grow.\n\n| Option | Cost |\n| --- | --- |\n| Local | low |',
      '[UI: Comparison]',
      'Risks follow the chart.',
      '[Widget: Simulator]',
    ].join('\n\n'))
    const button = [...host.querySelectorAll('button')].find(b => b.textContent === en['compose.copy'])!
    await act(async () => { button.click() })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]![0]).toContain('[UI: Comparison]')
    expect(host.textContent).toContain(en['compose.copied'])
  })

  it('keeps the finished part of a stopped answer and offers to regenerate', async () => {
    const send = vi.fn(async () => {})
    const raw = JSON.stringify(args)
    render(<ComposeView {...base(send)} phase="result" block={{ kind: 'tool-result', callId: 'comp-1', call: { name: 'ui_compose', argsRaw: raw.slice(0, raw.indexOf(',{"id":"risks"')) }, content: [{ type: 'text', text: 'interrupted' }], isError: true, error: { name: 'ToolError', code: 'interrupted' } }} />)
    expect(host.querySelector('.diui-shell')!.getAttribute('data-state')).toBe('stopped')
    expect(host.textContent).toContain(en['compose.stopped'])
    // Cut-off arguments are salvaged from the prefix: the finished blocks stay, the widget was never there.
    expect(host.querySelector('.diui-md')).not.toBeNull()
    expect(host.querySelector('.diui-compose-widget')).toBeNull()
    await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === en['action.regenerate'])!.click() })
    expect(send).toHaveBeenCalledWith('Generating the composed answer "Route decision" was interrupted. Please generate the complete answer again.')
  })

  it('shows refusals and malformed arguments without rendering anything', () => {
    render(<ComposeView {...base()} phase="result" block={{ ...settled(), content: [{ type: 'text', text: 'Composition not shown\n- blocks[1]: bad' }], meta: { ok: false } }} />)
    expect(host.textContent).toContain(en['compose.invalid'])
    expect(host.querySelector('.diui-compose')).toBeNull()
    render(<ComposeView {...base()} phase="start" block={{ phase: 'start', callId: 'comp-1', argsRaw: '{"blocks":' }} />)
    expect(host.textContent).toContain(en['compose.malformed'])
  })

  it('collapses a catalog block that a later ui_patch replaced', () => {
    const fold = (events: { type: string; data: any }[]) => {
      let state: any
      events.forEach((e, seq) => {
        const event = { ...e, seq, time: seq, surfaceOp: e.type === 'tool/result' ? 'append' : undefined }
        const m = uiTurnDefinition.match(event)
        if (!m) return
        state = m.role === 'start' ? uiTurnDefinition.start(undefined, { event }) : uiTurnDefinition.update({ state }, { event })
      })
      return state
    }
    fold([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'tool/call', data: { turn: 1, callId: 'comp-1', name: 'ui_compose', arguments: JSON.stringify(args) } },
      { type: 'tool/result', data: { turn: 1, message: { source: { callId: 'comp-1' }, content: [], isError: false }, meta: { ok: true } } },
    ])
    expect(latestUiVersion(composeUiId('comp-1', 'chart'))).toEqual({ version: 1, title: 'Comparison' })
    // A composition that failed validation registers no block UIs.
    let state: any
    const events = [
      { type: 'turn/start', data: { turn: 2 } },
      { type: 'tool/call', data: { turn: 2, callId: 'bad', name: 'ui_compose', arguments: JSON.stringify({ blocks: [{ id: 'c', type: 'catalog', root: 'r', components: [] }] }) } },
      { type: 'tool/result', data: { turn: 2, message: { source: { callId: 'bad' }, content: [], isError: false }, meta: { ok: true } } },
    ]
    events.forEach((e, seq) => {
      const event = { ...e, seq, time: seq, surfaceOp: e.type === 'tool/result' ? 'append' : undefined }
      const m = uiTurnDefinition.match(event)
      if (!m) return
      state = m.role === 'start' ? uiTurnDefinition.start(undefined, { event }) : uiTurnDefinition.update({ state }, { event })
    })
    expect(latestUiVersion(composeUiId('bad', 'c'))).toBeUndefined()
    // The live UI state (radio, sort) is keyed by the block identity, so it survives a remount.
    render(view())
    const radio = host.querySelector<HTMLInputElement>('.diui-chart-svg')
    expect(radio).not.toBeNull()
    remount(view())
    expect(host.querySelector('.diui-chart-svg')).not.toBeNull()
  })
})
