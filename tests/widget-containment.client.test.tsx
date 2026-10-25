import { channelFor, connectFrame, frameToken, fromFrame } from './fixtures/widget-channel.ts'
// @vitest-environment jsdom
// Containment of a widget that navigates its own frame (#19).
//
// jsdom drives the component's transferred endpoint and load listener.
// Real document navigation and MessagePort teardown run in e2e:security.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WidgetFrame } from '../client-src/widget/WidgetFrame.tsx'
import { DEFAULT_POLICY } from '../client-src/policy.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let el: HTMLDivElement, root: Root
beforeEach(() => { localStorage.clear(); el = document.createElement('div'); document.body.append(el); root = createRoot(el) })
afterEach(() => { act(() => root.unmount()); el.remove() })

const frameOf = () => el.querySelector('iframe')
const strayedNotice = () => el.querySelector('[data-widget-strayed]')

/**
 * Let the frame's own mount `load` happen. jsdom (like Chrome) fires it once the
 * `srcdoc` document is ready; the component treats the first load as its own
 * and only a later one as "the widget navigated away".
 */
const settleMount = () => act(async () => { await new Promise(r => setTimeout(r, 5)) })
/** The `load` a browser fires when the widget navigated the frame away. */
const strayLoad = () => act(() => { frameOf()!.dispatchEvent(new Event('load')) })

function renderWidget(extra: Record<string, unknown> = {}) {
  act(() => root.render(
    <WidgetFrame callId="w" mode="final" title="Widget" policy={DEFAULT_POLICY} css="" html="<p>x</p>"
      sendPrompt={vi.fn(async () => {})} strayedMessage="left the sandbox" {...extra} />,
  ))
  return frameOf()!
}

describe('widget frame containment', () => {
  it('keeps streaming into the frame on the normal lifecycle', async () => {
    // Preview mode is the live-streaming path: the frame reports `ready` and the
    // host posts html into it. That is exactly what the guard must not disturb.
    renderWidget({ mode: 'preview' })
    const frame = frameOf()!
    await settleMount()
    expect(strayedNotice()).toBeNull()

    const spy = channelFor(frame).postMessage
    await act(async () => {
      fromFrame(frame, { type: 'ready', final: false })
    })
    expect(spy).toHaveBeenCalled()
    const [msg] = spy.mock.calls.at(-1)!
    expect(msg).toMatchObject({ type: 'html', __diui: frameToken(frame) })
    expect(frameOf()).toBe(frame)
    expect(frame.isConnected).toBe(true)
  })

  it('removes the frame and stops addressing it once the widget navigates away', async () => {
    const onErrors = vi.fn()
    renderWidget({ onErrors })
    const frame = frameOf()!
    await settleMount()
    expect(frameOf()).toBe(frame)

    strayLoad()

    expect(strayedNotice()).toBeTruthy()
    expect(strayedNotice()!.textContent).toContain('left the sandbox')
    // The foreign document is destroyed rather than left on screen under the
    // widget's title, and the host can no longer reach it.
    expect(el.querySelector('iframe')).toBeNull()
    expect(onErrors).toHaveBeenCalledWith([])
  })

  it('leaves no addressable frame for host data to reach', async () => {
    renderWidget()
    const frame = frameOf()!
    await settleMount()
    const spy = channelFor(frame).postMessage
    strayLoad()

    // Containment is enforced by removing the element: the foreign document is
    // destroyed, so even a message the host tries to send finds no window.
    // (`post` also refuses early for the window before React commits.)
    expect(frame.isConnected).toBe(false)
    expect(el.querySelector('iframe')).toBeNull()
    act(() => { document.body.style.setProperty('--dsw-alias-label-primary', '#123456') })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(spy).not.toHaveBeenCalled()
  })

  it('ignores further loads and keeps a single notice', async () => {
    renderWidget()
    await settleMount()
    strayLoad()
    expect(strayedNotice()).toBeTruthy()
    // The element is already unmounted; a repeated load must be inert.
    expect(() => { el.dispatchEvent(new Event('load')) }).not.toThrow()
    expect(el.querySelectorAll('[data-widget-strayed]')).toHaveLength(1)
  })

  it('rebuilds cleanly after an explicit reload (generation change)', async () => {
    renderWidget({ generation: 0 })
    await settleMount()
    strayLoad()
    expect(strayedNotice()).toBeTruthy()

    // A reload builds a brand-new document: the guard must re-arm for it.
    renderWidget({ generation: 1 })
    expect(strayedNotice()).toBeNull()
    expect(frameOf()).toBeInstanceOf(HTMLIFrameElement)

    await settleMount()
    expect(frameOf()).toBeInstanceOf(HTMLIFrameElement)
    expect(strayedNotice()).toBeNull()

    strayLoad()
    expect(strayedNotice()).toBeTruthy()
  })

  it('does not treat the pre-mount state as a stray navigation', () => {
    renderWidget()
    expect(frameOf()).toBeInstanceOf(HTMLIFrameElement)
    expect(strayedNotice()).toBeNull()
  })

  it('survives real streaming and theme sends through its bound port', async () => {
    renderWidget({ mode: 'preview' })
    const frame = frameOf()!
    await settleMount()
    const port = channelFor(frame)
    act(() => fromFrame(frame, { type: 'ready', final: false }))
    for (let i = 0; i < 5; i++) renderWidget({ mode: 'preview', html: `<p>chunk ${i}</p>` })
    expect(port.postMessage.mock.calls.filter(([m]) => m.type === 'html')).toHaveLength(6)
    expect(port.postMessage.mock.calls.at(-1)![0].html).toContain('chunk 4')
    expect(strayedNotice()).toBeNull()
    expect(frameOf()).toBe(frame)
  })

  it('accepts one handshake and refuses wrong source, wrong token and window RPCs', () => {
    renderWidget()
    const frame = frameOf()!
    const wrongSource = connectFrame(frame, frameToken(frame), window)
    const wrongToken = connectFrame(frame, 'wrong')
    expect(wrongSource.start).not.toHaveBeenCalled()
    expect(wrongToken.start).not.toHaveBeenCalled()
    const port = channelFor(frame)
    const duplicate = connectFrame(frame)
    expect(duplicate.close).toHaveBeenCalledOnce()
    act(() => window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow, data: { type: 'resize', __diui: frameToken(frame), height: 900 },
    })))
    expect(frame.style.height).not.toBe('900px')
    act(() => fromFrame(frame, { type: 'resize', height: 900 }))
    expect(frame.style.height).toBe('900px')
    expect(port.start).toHaveBeenCalledOnce()
  })

  it.each(['generation', 'policy'])('really replaces srcdoc on a %s-only rebuild and rejects stale ports', key => {
    renderWidget({ generation: 0 })
    const frame = frameOf()!, doc = frame.srcdoc, tok = frameToken(frame)
    const oldPort = channelFor(frame)
    renderWidget(key === 'generation' ? { generation: 1 } : { policy: { ...DEFAULT_POLICY, sendPromptMaxChars: 4001 } })
    expect(frameOf()).toBe(frame)
    expect(frame.srcdoc).not.toBe(doc)
    expect(frameToken(frame)).not.toBe(tok)
    expect(oldPort.close).toHaveBeenCalled()
    const fresh = channelFor(frame)
    act(() => oldPort.onmessage?.(new MessageEvent('message', { data: { type: 'resize', __diui: tok, height: 999 } })))
    expect(frame.style.height).not.toBe('999px')
    act(() => fromFrame(frame, { type: 'resize', height: 777 }))
    expect(frame.style.height).toBe('777px')
    expect(fresh.start).toHaveBeenCalledOnce()
  })

  it('discards async RPC results after a rebuild and closes channels on unmount', async () => {
    let resolve!: () => void
    const sendPrompt = vi.fn(() => new Promise<void>(r => { resolve = r }))
    renderWidget({ generation: 0, sendPrompt })
    const frame = frameOf()!
    const old = channelFor(frame)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)
    try {
      act(() => fromFrame(frame, { type: 'rpc', id: 1, method: 'sendPrompt', params: { text: 'hello' } }))
      expect(sendPrompt).toHaveBeenCalledOnce()
      renderWidget({ generation: 1, sendPrompt })
      const fresh = channelFor(frameOf()!)
      await act(async () => resolve())
      expect(old.postMessage).not.toHaveBeenCalled()
      expect(fresh.postMessage).not.toHaveBeenCalled()
      act(() => root.render(null))
      expect(fresh.close).toHaveBeenCalled()
    } finally { vi.restoreAllMocks() }
  })
})
