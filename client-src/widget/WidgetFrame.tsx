import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  /** Shown instead of the frame after the widget navigates out of its sandbox. */
  strayedMessage?: string
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
  /** The widget navigated its frame away; the card must say so. */
  const [strayedNotice, setStrayedNotice] = useState(false)
  const ready = useRef(false)
  /** Whether the frame has received (or was built with) the final code. */
  const finalized = useRef(false)
  const errors = useRef<string[]>([])
  /**
   * Set once the frame has finished loading its own `srcdoc`. A second `load`
   * means the widget navigated the frame away (`location.href = …`), which no
   * CSP directive can block. The host then stops posting: the `WindowProxy`
   * survives navigation, so every later message would carry host data into the
   * foreign document. See docs/widget-csp-audit.md.
   */
  const strayed = useRef(false)
  /** The last element the load listener was attached to, so a rebuild re-attaches. */
  const watched = useRef<HTMLIFrameElement | null>(null)
  /** Whether the mount load of the *current* element has been seen. */
  const ownLoad = useRef(false)
  // Policies arrive as fresh objects (defaults while running, result meta once
  // settled); key by value so an equal policy never rebuilds the document.
  const resourceKey = JSON.stringify(props.resourceLibraries)
  const policyKey = JSON.stringify(props.policy)
  const policy = useMemo(() => props.policy, [policyKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const guard = useMemo(() => new BridgeGuard({ policy }), [policy])
  const live = useRef(props)
  live.current = props

  // Clear the containment notice whenever the document is rebuilt (new css,
  // policy or an explicit reload): the new frame gets a fresh lifecycle.
  // Declared before `srcDoc` so it runs in the same commit, and it is keyed on
  // the same inputs so it can never lag behind the document it belongs to.
  useEffect(() => {
    strayed.current = false
    ownLoad.current = false
    setStrayedNotice(false)
  }, [tok, props.css, policy, props.generation, resourceKey])

  // Built once per frame lifetime: later html/code/theme changes travel by
  // postMessage so widget state survives. Only a different css or policy, or
  // an explicit reload (generation), rebuilds the document.
  const srcDoc = useMemo(() => {
    const p = live.current
    pendingAction.current = false
    actionFlight.current = false
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
    // Never address a document that replaced the widget's own: it is opaque to
    // us, but contentWindow still forwards whatever the host sends it.
    if (strayed.current) return
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

  // Detect the widget navigating its own frame. The element keeps the same
  // WindowProxy, but the document behind it is now foreign, and neither CSP
  // (`navigate-to` never shipped) nor the sandbox blocks that hop — so the host
  // has to notice and stop posting, or it keeps feeding host data to whatever
  // page the widget chose.
  //
  // The signal is the frame's second `load`. Streaming morphs, theme updates and
  // ordinary DOM work never navigate, so they fire none. `document.open()`/
  // `write()` also fires one, but the widget contract has no use for it (the
  // bootstrap owns the document and morphs its `#ui-root`), and a rewrite that
  // replaces the bootstrap also destroys the `message` listener the bridge runs
  // on — so treating it as a stray document is correct, not merely strict.
  //
  // A callback ref, not an effect keyed on `srcDoc`: a rebuilt document (new
  // css, policy or an explicit reload) is a *new* element, so the guard has to
  // start over on it rather than stay armed from the previous one.
  const contain = () => {
    if (strayed.current) return
    strayed.current = true
    ready.current = false
    finalized.current = false
    errors.current = []
    setStrayedNotice(true)
    setAction(undefined)
    pendingAction.current = false
    actionFlight.current = false
    live.current.onErrors?.([])
  }

  const onFrameLoad = () => {
    if (strayed.current) return
    if (!ownLoad.current) { ownLoad.current = true; return }
    contain()
  }
  const onFrameLoadRef = useRef(onFrameLoad)
  onFrameLoadRef.current = onFrameLoad
  const stableLoad = useCallback(() => onFrameLoadRef.current(), [])
  const attachFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (watched.current) watched.current.removeEventListener('load', stableLoad)
    watched.current = frame
    ref.current = frame
    if (!frame) return
    // A fresh element means a fresh document lifecycle.
    strayed.current = false
    ownLoad.current = false
    frame.addEventListener('load', stableLoad)
  }, [stableLoad])

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
    } finally {
      // A rebuilt document may already have staged its own request; leave it.
      if (actionEpoch.current === epoch) { pendingAction.current = false; actionFlight.current = false; setAction(undefined) }
    }
  }
  return (<>
    {action && pendingAction.current && <div className="diui-card" role="group" aria-label="Requested action">
      <strong>{action.request.actionId}</strong><pre className="diui-code">{JSON.stringify(action.request.args, null, 2)}</pre>
      <button type="button" className="diui-button" onClick={e => { void finishAction(e.nativeEvent, true) }}>Run action</button>
      <button type="button" className="diui-button" onClick={e => { void finishAction(e.nativeEvent, false) }}>Cancel</button>
    </div>}
    {actionStatus && <span role="status">{actionStatus}</span>}
    {strayedNotice
      // Unmounting the element destroys the foreign document too, so nothing
      // keeps running or receiving in place of the widget.
      ? <div className="diui-card" role="alert" data-widget-strayed="true">{props.strayedMessage ?? 'The widget navigated to another page and was removed'}</div>
      : <iframe
        ref={attachFrame}
        className="diui-frame"
        title={props.title}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height }}
        data-mode={props.mode}
      />}
  </>)
}

function clampHeight(h: number, max: number): number {
  return Math.max(50, Math.min(max, Math.round(h)))
}
