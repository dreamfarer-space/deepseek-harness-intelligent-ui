// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { libPayload, libSources, runMermaidFrame } from '../client-src/catalog/LibFrame.tsx'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en, zh } from '../client-src/locales.ts'
import { DEFAULT_POLICY } from '../client-src/policy.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { mount } from '../renderer-src/index.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setupFrameDom(loadingText?: string) {
  const src = libSources(DEFAULT_POLICY)!
  const payload = libPayload('mermaid', 'flowchart LR\n  A-->B', { loadingText }, src)
  document.body.innerHTML = `<div id="ui-root">${payload.html}</div>`
  return payload
}

function createFakeUi(scheme: 'light' | 'dark' = 'light') {
  const listeners: Array<() => void> = []
  return {
    ui: {
      scheme,
      css: () => 'sans-serif',
      onTheme(cb: () => void) {
        listeners.push(cb)
      },
    },
    triggerTheme(next: 'light' | 'dark') {
      this.ui.scheme = next
      for (const cb of [...listeners]) cb()
    },
  }
}

describe('catalog Mermaid LibFrame loading state', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    document.body.innerHTML = ''
    localStorage.clear()
    resetUiStateMemory()
  })

  afterEach(() => {
    vi.useRealTimers()
    warnSpy.mockRestore()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('skips showing loading indicator on fast render (<180ms) and leaves no loading text behind', async () => {
    setupFrameDom('Rendering diagram…')
    const { ui } = createFakeUi()
    const loadGate = deferred<{ initialize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> }>()
    const mm = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({ svg: '<svg data-testid="fast">Fast</svg>' })),
    }

    const done = runMermaidFrame(document, ui, () => loadGate.promise, 'flowchart LR\n  A-->B')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('loading')
    expect(document.getElementById('lib-loading')?.hidden).toBe(true)

    await vi.advanceTimersByTimeAsync(100)
    expect(document.getElementById('lib-loading')?.hidden).toBe(true)

    loadGate.resolve(mm)
    await done

    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.querySelector('#out svg')?.getAttribute('data-testid')).toBe('fast')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('ready')
    expect(document.body.textContent).not.toContain('Rendering diagram…')

    await vi.advanceTimersByTimeAsync(300)
    expect(document.getElementById('lib-loading')).toBeNull()
  })

  it('shows localized loading state after 180ms and removes it once SVG renders', async () => {
    setupFrameDom('正在渲染图表…')
    const { ui } = createFakeUi()
    const renderGate = deferred<{ svg: string }>()
    const mm = {
      initialize: vi.fn(),
      render: vi.fn(() => renderGate.promise),
    }

    const done = runMermaidFrame(document, ui, async () => mm, 'flowchart LR\n  A-->B')
    expect(document.getElementById('lib-loading')?.hidden).toBe(true)

    await vi.advanceTimersByTimeAsync(180)
    const loadingEl = document.getElementById('lib-loading')
    expect(loadingEl).not.toBeNull()
    expect(loadingEl?.hidden).toBe(false)
    expect(loadingEl?.textContent).toContain('正在渲染图表…')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('loading')

    renderGate.resolve({ svg: '<svg data-testid="slow">Slow</svg>' })
    await done

    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.querySelector('#out svg')?.getAttribute('data-testid')).toBe('slow')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('ready')
    expect(document.body.textContent).not.toContain('正在渲染图表…')
  })

  it('cleans loading and restores Static fallback contract across failure modes', async () => {
    const source = 'graph TD\n  A-->B'

    // 1. Fast failure (<180ms)
    setupFrameDom()
    await runMermaidFrame(document, createFakeUi().ui, async () => { throw new Error('network error') }, source)
    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.getElementById('out')?.className).toBe('src')
    expect(document.getElementById('out')?.textContent).toBe(source)
    expect(document.getElementById('lib-status')?.textContent).toContain('Static fallback:')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('fallback')

    // 2. Slow failure (>=180ms after loading becomes visible)
    setupFrameDom()
    const slowLoad = deferred<{ initialize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> }>()
    const slowDone = runMermaidFrame(document, createFakeUi().ui, () => slowLoad.promise, source)
    await vi.advanceTimersByTimeAsync(180)
    expect(document.getElementById('lib-loading')?.hidden).toBe(false)
    slowLoad.reject(new Error('timeout'))
    await slowDone
    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.getElementById('out')?.textContent).toBe(source)
    expect(document.getElementById('lib-status')?.textContent).toContain('Static fallback: library could not render. timeout')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('fallback')

    // 3. Synchronous throw in mm.initialize()
    setupFrameDom()
    await runMermaidFrame(document, createFakeUi().ui, async () => ({
      initialize() { throw new Error('bad config') },
      render: async () => ({ svg: '<svg></svg>' }),
    }), source)
    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.getElementById('out')?.textContent).toBe(source)
    expect(document.getElementById('lib-status')?.textContent).toContain('bad config')

    // 4. Empty SVG returned
    setupFrameDom()
    await runMermaidFrame(document, createFakeUi().ui, async () => ({
      initialize: vi.fn(),
      render: async () => ({ svg: '' }),
    }), source)
    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.getElementById('out')?.textContent).toBe(source)
    expect(document.getElementById('lib-status')?.textContent).toContain('Static fallback:')
  })

  it('keeps existing SVG on theme redraw and discards stale concurrent render results/errors', async () => {
    setupFrameDom()
    const fake = createFakeUi('light')
    const r1 = deferred<{ svg: string }>()
    const r2 = deferred<{ svg: string }>()
    const r3 = deferred<{ svg: string }>()
    const renders = [r1, r2, r3]
    let callIdx = 0
    const mm = {
      initialize: vi.fn(),
      render: vi.fn(() => renders[callIdx++]!.promise),
    }

    const initialDone = runMermaidFrame(document, fake.ui, async () => mm, 'graph LR; A-->B')
    r1.resolve({ svg: '<svg data-theme="light">V1</svg>' })
    await initialDone
    expect(document.querySelector('#out svg')?.getAttribute('data-theme')).toBe('light')

    // First theme change (seq=2), followed immediately by second theme change (seq=3) before seq=2 settles
    fake.triggerTheme('dark')
    expect(document.getElementById('lib-loading')).toBeNull()
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('ready')
    expect(document.querySelector('#out svg')?.getAttribute('data-theme')).toBe('light')

    fake.triggerTheme('light')
    r3.resolve({ svg: '<svg data-theme="light-v3">V3</svg>' })
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('#out svg')?.getAttribute('data-theme')).toBe('light-v3')

    // Stale seq=2 rejects late — must not overwrite V3 or enter fallback
    r2.reject(new Error('stale error'))
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('#out svg')?.getAttribute('data-theme')).toBe('light-v3')
    expect(document.getElementById('ui-root')?.getAttribute('data-lib-state')).toBe('ready')
    expect(document.getElementById('lib-status')?.textContent).toBe('')
  })

  it('preserves 4-arg backward compatibility, escapes HTML in loadingText, and ships required CSS rules', () => {
    const src = libSources(DEFAULT_POLICY)!
    const defaultPayload = libPayload('mermaid', 'graph TD; A-->B', {}, src)
    expect(defaultPayload.html).toContain('Rendering diagram…')
    expect(defaultPayload.css).toContain('.lib-loading[hidden]{display:none}')
    expect(defaultPayload.css).toContain('min(160px,calc(100vh - 16px))')
    expect(defaultPayload.css).toContain('prefers-reduced-motion:reduce')

    const xssPayload = libPayload('mermaid', 'graph TD; A-->B', { loadingText: '<img src=x onerror=1>' }, src)
    expect(xssPayload.html).not.toContain('<img')
    expect(xssPayload.html).toContain('&lt;img src=x onerror=1&gt;')
  })

  it('passes localized loadingText in RenderView and PortableRenderer srcdoc', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)

    const makeT = (dict: typeof en) =>
      ((key: keyof typeof en, vars?: Record<string, string | number>) =>
        dict[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

    const makeBlock = (callId: string) => ({
      kind: 'tool-result' as const,
      callId,
      call: {
        name: 'ui_render',
        argsRaw: JSON.stringify({
          root: 'd',
          components: [{ id: 'd', type: 'Mermaid', props: { code: 'flowchart LR\n  A-->B' } }],
        }),
      },
      content: [],
      isError: false,
      meta: { ok: true },
    })

    act(() => {
      root.render(<RenderView key="m1" callId="m1" toolName="ui_render" t={makeT(en)} sendPrompt={async () => {}} phase="result" block={makeBlock('m1')} />)
    })
    expect(host.querySelector('.diui-lib iframe')?.getAttribute('srcdoc')).toContain(en['lib.diagramLoading'])

    act(() => {
      root.render(<RenderView key="m2" callId="m2" toolName="ui_render" t={makeT(zh)} sendPrompt={async () => {}} phase="result" block={makeBlock('m2')} />)
    })
    expect(host.querySelector('.diui-lib iframe')?.getAttribute('srcdoc')).toContain(zh['lib.diagramLoading'])

    act(() => root.unmount())

    const portableZh = mount(host, { locale: 'zh', sendPrompt: async () => {} })
    act(() => {
      portableZh.render({
        kind: 'declarative',
        uiId: 'p-mermaid-zh',
        version: 1,
        definition: {
          root: 'd',
          components: [{ id: 'd', type: 'Mermaid', props: { code: 'flowchart LR\n  A-->B' } }],
        },
      })
    })
    expect(host.querySelector('.diui-lib iframe')?.getAttribute('srcdoc')).toContain(zh['lib.diagramLoading'])
    act(() => portableZh.dispose())

    const portableEn = mount(host, { locale: 'en', sendPrompt: async () => {} })
    act(() => {
      portableEn.render({
        kind: 'declarative',
        uiId: 'p-mermaid-en',
        version: 1,
        definition: {
          root: 'd',
          components: [{ id: 'd', type: 'Mermaid', props: { code: 'flowchart LR\n  A-->B' } }],
        },
      })
    })
    expect(host.querySelector('.diui-lib iframe')?.getAttribute('srcdoc')).toContain(en['lib.diagramLoading'])

    act(() => portableEn.dispose())
    host.remove()
  })
})
