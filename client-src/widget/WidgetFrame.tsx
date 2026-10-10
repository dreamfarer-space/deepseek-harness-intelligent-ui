import { useEffect, useMemo, useRef, useState } from 'react'
import { BridgeError, BridgeGuard, readFrameMessage } from '../bridge.ts'
import type { WidgetPolicy } from '../policy.ts'
import { onThemeChange, readTheme } from '../theme.ts'
import { buildFrameDocument, themeCss } from './frame.ts'
import { processPartialHtml } from './partial-html.ts'

/** Last known height per call, so the final frame opens at the preview's size. */
const heights = new Map<string, number>()

function token(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export interface WidgetFrameProps {
  callId: string
  mode: 'preview' | 'final'
  css: string
  html: string
  jsFunctions?: string
  jsExpressions?: readonly string[]
  initialHeight?: number
  policy: WidgetPolicy
  title: string
  sendPrompt: (text: string) => Promise<void>
  onSent?: (ok: boolean, reason?: string) => void
  onErrors?: (errors: readonly string[]) => void
}

/**
 * One sandboxed widget iframe. In `preview` mode the document holds css +
 * bootstrap and body html is morphed in by postMessage as it streams; in
 * `final` mode the full document (with code) is built once.
 */
export function WidgetFrame(props: WidgetFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null)
  const tok = useMemo(token, [])
  const [theme, setTheme] = useState(() => readTheme())
  const [height, setHeight] = useState(() => heights.get(props.callId) ?? clampHeight(props.initialHeight ?? 160, props.policy.maxHeight))
  const ready = useRef(false)
  const latestHtml = useRef(props.html)
  const errors = useRef<string[]>([])
  // Policies arrive as fresh objects (defaults while running, result meta once
  // settled); key by value so an equal policy never rebuilds the document.
  const policyKey = JSON.stringify(props.policy)
  const policy = useMemo(() => props.policy, [policyKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const guard = useMemo(() => new BridgeGuard({ policy }), [policy])
  const live = useRef(props)
  live.current = props

  // The document only changes when its static inputs change; preview html streams via postMessage.
  const srcDoc = useMemo(() => buildFrameDocument({
    token: tok,
    mode: props.mode,
    css: props.css,
    html: props.mode === 'final' ? props.html : '',
    jsFunctions: props.jsFunctions,
    jsExpressions: props.jsExpressions,
    theme,
    policy,
  // theme is applied live after mount; rebuilding on theme change would reset widget state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tok, props.mode, props.css, props.mode === 'final' ? props.html : '', props.jsFunctions, props.jsExpressions, policy])

  const post = (msg: Record<string, unknown>) => {
    ref.current?.contentWindow?.postMessage({ ...msg, __diui: tok }, '*')
  }

  useEffect(() => { ready.current = false; errors.current = [] }, [srcDoc])

  useEffect(() => onThemeChange(() => {
    const next = readTheme()
    setTheme(next)
    post({ type: 'theme', css: themeCss(next) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tok])

  // Stream preview html.
  useEffect(() => {
    latestHtml.current = props.html
    if (props.mode === 'preview' && ready.current) post({ type: 'html', html: processPartialHtml(props.html) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.html, props.mode])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const frame = ref.current
      if (!frame || ev.source !== frame.contentWindow) return
      const msg = readFrameMessage(ev.data, tok)
      if (!msg) return
      const p = live.current
      switch (msg.type) {
        case 'ready':
          ready.current = true
          if (p.mode === 'preview') post({ type: 'html', html: processPartialHtml(latestHtml.current) })
          break
        case 'resize': {
          const h = clampHeight(msg.height, p.policy.maxHeight)
          heights.set(p.callId, h)
          setHeight(h)
          break
        }
        case 'error':
          if (p.mode === 'final') {
            errors.current = [...errors.current, `${msg.kind}: ${msg.message}`].slice(-20)
            p.onErrors?.(errors.current)
          }
          break
        case 'rpc':
          void handleRpc(msg.id, msg.method, msg.params)
          break
      }
    }
    const handleRpc = async (id: number, method: string, params: Record<string, unknown>) => {
      const p = live.current
      try {
        if (p.mode !== 'final') throw new BridgeError('unavailable', 'the widget is still generating')
        if (method === 'sendPrompt') {
          const text = guard.admitPrompt(params.text)
          await p.sendPrompt(text)
          p.onSent?.(true)
          post({ type: 'rpc-result', id, ok: true, value: { accepted: true } })
        } else if (method === 'openLink') {
          const url = guard.admitLink(params.url)
          window.open(url, '_blank', 'noopener,noreferrer')
          post({ type: 'rpc-result', id, ok: true, value: { opened: true } })
        } else {
          throw new BridgeError('unavailable', `unknown bridge method ${method}`)
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        if (method === 'sendPrompt') p.onSent?.(false, reason)
        post({ type: 'rpc-result', id, ok: false, error: reason })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tok, guard])

  return (
    <iframe
      ref={ref}
      className="diui-frame"
      title={props.title}
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{ height }}
      data-mode={props.mode}
    />
  )
}

function clampHeight(h: number, max: number): number {
  return Math.max(50, Math.min(max, Math.round(h)))
}
