import { vi } from 'vitest'

export const frameToken = (frame: HTMLIFrameElement): string =>
  JSON.parse(/var TOKEN = ("[^"]+")/.exec(frame.srcdoc)![1]!)

// jsdom cannot execute a sandboxed srcdoc. Model only the transferred endpoint;
// real MessageChannel/document teardown is covered by the Chrome security suite.
export function connectFrame(frame: HTMLIFrameElement, token = frameToken(frame), source: Window = frame.contentWindow!) {
  const port = { postMessage: vi.fn(), close: vi.fn(), start: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null }
  window.dispatchEvent(new MessageEvent('message', {
    source, data: { type: 'connect', __diui: token }, ports: [port as unknown as MessagePort],
  }))
  return port
}
const channels = new WeakMap<HTMLIFrameElement, { token: string; port: ReturnType<typeof connectFrame> }>()
export function channelFor(frame: HTMLIFrameElement) {
  const token = frameToken(frame)
  let entry = channels.get(frame)
  if (!entry || entry.token !== token) {
    entry = { token, port: connectFrame(frame) }
    channels.set(frame, entry)
  }
  return entry.port
}
export function fromFrame(frame: HTMLIFrameElement, data: Record<string, unknown>, token = frameToken(frame)) {
  channelFor(frame).onmessage?.(new MessageEvent('message', { data: { ...data, __diui: token } }))
}
