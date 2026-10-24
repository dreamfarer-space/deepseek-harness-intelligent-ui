// @vitest-environment jsdom
// Containment of a widget that navigates its own frame (#19).
//
// A CSP cannot stop a frame navigating itself (`navigate-to` never shipped) and
// the sandbox only withholds top-level navigation, so the host has to react to
// the resulting `load`. These tests drive the component's listener directly:
// jsdom does not perform real navigations, but it does fire `load` on the frame
// element — the same signal WidgetFrame relies on in a browser.
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
const tokenOf = (frame: HTMLIFrameElement) => JSON.parse(/var TOKEN = ("[^"]+")/.exec(frame.srcdoc)![1]!)
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
    const tok = tokenOf(frame)
    await settleMount()
    expect(strayedNotice()).toBeNull()

    const spy = vi.spyOn(frame.contentWindow!, 'postMessage')
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { __diui: tok, type: 'ready', final: false } }))
    })
    expect(spy).toHaveBeenCalled()
    const [msg] = spy.mock.calls.at(-1)!
    expect(msg).toMatchObject({ type: 'html', __diui: tok })
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
    const spy = vi.spyOn(frame.contentWindow!, 'postMessage')
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

  it('survives repeated host messages (the streaming and theme paths)', async () => {
    renderWidget({ mode: 'preview' })
    const frame = frameOf()!
    const tok = tokenOf(frame)
    await settleMount()

    // A streamed preview sends many `html` messages; a re-theme sends `theme`.
    // Neither replaces the document, so neither may strand the frame.
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { __diui: tok, type: 'html', html: `<p>chunk ${i}</p>` } }))
      }
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { __diui: tok, type: 'theme', css: ':root{--ui-text:#111}', scheme: 'dark' } }))
    })
    expect(strayedNotice()).toBeNull()
    expect(frameOf()).toBe(frame)
  })
})
