import { useEffect, useMemo, useRef, useState } from 'react'
import { contextOf, type ControlledEnv, type ActionRequest } from '../controlled.ts'
import { BridgeError, BridgeGuard, readFrameMessage } from '../bridge.ts'
import type { WidgetPolicy } from '../policy.ts'
import { getUiState, setUiState } from '../state.ts'
import { onThemeChange, readTheme } from '../theme.ts'
import { buildFrameDocument, codePayload, schemeOf, themeCss } from './frame.ts'
import { processPartialHtml } from './partial-html.ts'

/** Last known height per call, so a re-mounted frame opens at its previous size. */
const heights = new Map<string, number>()

function token(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export interface WidgetFrameProps extends ControlledEnv {
  /** State/height key; one per rendered surface. */
  callId: string
  mode: 'preview' | 'final'
  css: string
  html: string
  jsFunctions?: string
  jsExpressions?: readonly string[]
  resourceLibraries?: readonly string[]
  initialHeight?: number
  policy: WidgetPolicy
  title: string
  sendPrompt: (text: string) => Promise<void>
  /** Persist control values / UI.state / height for this callId (default true). */
  persist?: boolean
  /** Bump to rebuild the frame from scratch (manual reload after script errors). */
  generation?: number
  onSending?: (sending: boolean) => void
  onSent?: (ok: boolean, reason?: string) => void
  onErrors?: (errors: readonly string[]) => void
}

/**
 * One sandboxed widget iframe. A frame first opened in `preview` mode holds
 * css + bootstrap, receives streamed body html by postMessage, and is
 * finalized in place when `mode` turns `final` (html + code are posted, the
 * document is not rebuilt). A frame first opened in `final` mode (replay,
 * reload) gets the complete document at once.
 */
export function WidgetFrame(props: WidgetFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null)
  const tok = useMemo(token, [])
  const persist = props.persist !== false && !props.controlled
  const theme = useRef(readTheme())
  const [height, setHeight] = useState(() => heights.get(props.callId)
    ?? (persist ? getUiState<number>(props.callId, 'height') : undefined)
    ?? clampHeight(props.initialHeight ?? 160, props.policy.maxHeight))
  const [action, setAction] = useState<{ id: number; request: ActionRequest } | undefined>(undefined)
  const pendingAction = useRef(false)
  const actionFlight = useRef(false)
  const actionEpoch = useRef(0)
  const [actionStatus, setActionStatus] = useState('')
  const ready = useRef(false)
  /** Whether the frame has received (or was built with) the final code. */
  const finalized = useRef(false)
  const errors = useRef<string[]>([])
  // Policies arrive as fresh objects (defaults while running, result meta once
  // settled); key by value so an equal policy never rebuilds the document.
  const resourceKey = JSON.stringify(props.resourceLibraries)
  const policyKey = JSON.stringify(props.policy)
  const policy = useMemo(() => props.policy, [policyKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const guard = useMemo(() => new BridgeGuard({ policy }), [policy])
  const live = useRef(props)
  live.current = props

  // Built once per frame lifetime: later html/code/theme changes travel by
  // postMessage so widget state survives. Only a different css or policy, or
  // an explicit reload (generation), rebuilds the document.
  const srcDoc = useMemo(() => {
    const p = live.current
    pendingAction.current = false
    actionEpoch.current++
    finalized.current = p.mode === 'final'
    ready.current = false
    errors.current = []
    return buildFrameDocument({
      resourceLibraries: p.resourceLibraries,
      token: tok,
      mode: p.mode,
      css: p.css,
      html: p.mode === 'final' ? p.html : '',
      jsFunctions: p.jsFunctions,
      jsExpressions: p.jsExpressions,
      theme: theme.current,
      policy,
      state: p.mode === 'final' && persist ? getUiState(p.callId, 'widget') : undefined,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tok, props.css, policy, props.generation, resourceKey])

  const post = (msg: Record<string, unknown>) => {
    ref.current?.contentWindow?.postMessage({ ...msg, __diui: tok }, '*')
  }

  const finalize = () => {
    const p = live.current
    if (finalized.current || !ready.current || p.mode !== 'final') return
    finalized.current = true
    post({ type: 'final', html: p.html, code: codePayload({ jsFunctions: p.jsFunctions, jsExpressions: p.jsExpressions, state: persist ? getUiState(p.callId, 'widget') : undefined }) })
  }

  useEffect(() => onThemeChange(() => {
    const next = readTheme()
    // DSH mutates <html>/<body> attributes for many reasons; only real token changes are sent.
    if (JSON.stringify(next) === JSON.stringify(theme.current)) return
    theme.current = next
    post({ type: 'theme', css: themeCss(next), scheme: schemeOf(next) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tok])

  // Stream preview html; switch to the final widget in place.
  useEffect(() => {
    if (props.mode === 'preview') {
      if (ready.current && !finalized.current) post({ type: 'html', html: processPartialHtml(props.html) })
    } else {
      finalize()
    }
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
          if (!msg.final) {
            if (p.mode === 'preview') post({ type: 'html', html: processPartialHtml(p.html) })
            else finalize()
          }
          break
        case 'resize': {
          const h = clampHeight(msg.height, p.policy.maxHeight)
          heights.set(p.callId, h)
          if (persist && finalized.current) setUiState(p.callId, 'height', h)
          setHeight(h)
          break
        }
        case 'state':
          if (persist && finalized.current) setUiState(p.callId, 'widget', msg.state)
          break
        case 'error':
          if (finalized.current) {
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
        if (!finalized.current || p.mode !== 'final') throw new BridgeError('unavailable', 'the widget is still generating')
        if (method === 'sendPrompt') {
          const text = guard.admitPrompt(params.text)
          p.onSending?.(true)
          try { await p.sendPrompt(text) } finally { p.onSending?.(false) }
          p.onSent?.(true)
          post({ type: 'rpc-result', id, ok: true, value: { accepted: true } })
        } else if (method === 'readData') {
          if (!p.controlled) throw new Error('Data binding unavailable')
          const entry = p.controlled.readData(contextOf(p), params.dataRef)
          post({ type: 'rpc-result', id, ok: true, value: entry.value })
        } else if (method === 'invokeAction') {
          if (!p.controlled) throw new Error('Actions unavailable')
          if (pendingAction.current) throw new Error('An action is already awaiting confirmation')
          const request = p.controlled.prepareAction(contextOf(p), params)
          pendingAction.current = true
          setAction({ id, request }); setActionStatus('')
          // Generated code never receives authority to execute. A native host control below does.
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
    return () => { window.removeEventListener('message', onMessage); pendingAction.current = false; setAction(undefined) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tok, guard])

  const finishAction = async (event: Event, accepted: boolean) => {
    if (!action || !pendingAction.current || actionFlight.current) return
    actionFlight.current = true
    const epoch = actionEpoch.current
    setActionStatus('Loading…')
    try {
      if (!accepted) throw new Error('Action cancelled')
      const p = live.current
      if (!p.controlled) throw new Error('Actions unavailable')
      const value = await p.controlled.invokeAction(contextOf(p), action.request, event)
      if (actionEpoch.current !== epoch) return
      post({ type: 'rpc-result', id: action.id, ok: true, value })
      setActionStatus('Success')
    } catch (err) {
      if (actionEpoch.current !== epoch) return
      const reason = err instanceof Error ? err.message : String(err)
      post({ type: 'rpc-result', id: action.id, ok: false, error: reason }); setActionStatus('Error: ' + reason)
    } finally { pendingAction.current = false; actionFlight.current = false; setAction(undefined) }
  }
  return (<>
    {action && pendingAction.current && <div className="diui-card" role="group" aria-label="Requested action">
      <strong>{action.request.actionId}</strong><pre className="diui-code">{JSON.stringify(action.request.args, null, 2)}</pre>
      <button type="button" className="diui-button" onClick={e => { void finishAction(e.nativeEvent, true) }}>Run action</button>
      <button type="button" className="diui-button" onClick={e => { void finishAction(e.nativeEvent, false) }}>Cancel</button>
    </div>}
    {actionStatus && <span role="status">{actionStatus}</span>}
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
  </>)
}

function clampHeight(h: number, max: number): number {
  return Math.max(50, Math.min(max, Math.round(h)))
}
