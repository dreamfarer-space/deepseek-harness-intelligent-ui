import { offlinePack } from '../resources.ts'
import { useMemo } from 'react'
import type { WidgetPolicy } from '../policy.ts'
import { safeOrigins } from '../widget/frame.ts'
import { WidgetFrame } from '../widget/WidgetFrame.tsx'

/**
 * Catalog components backed by a CDN library (KaTeX, Mermaid). They render in
 * the same opaque-origin sandbox as widgets, so no third-party code ever runs
 * in the DSH page and the host bundle stays small. If no allowed CDN serves
 * the library, or loading fails, the source text is shown instead.
 */

const KATEX = '0.16.11'
const MERMAID = '11.4.1'

/** Library URLs per CDN origin, in preference order. */
const SOURCES: Record<string, { katexJs: string; katexCss: string; mermaid: string }> = {
  'https://cdn.jsdelivr.net': {
    katexJs: `https://cdn.jsdelivr.net/npm/katex@${KATEX}/dist/katex.mjs`,
    katexCss: `https://cdn.jsdelivr.net/npm/katex@${KATEX}/dist/katex.min.css`,
    mermaid: `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID}/dist/mermaid.esm.min.mjs`,
  },
  'https://unpkg.com': {
    katexJs: `https://unpkg.com/katex@${KATEX}/dist/katex.mjs`,
    katexCss: `https://unpkg.com/katex@${KATEX}/dist/katex.min.css`,
    mermaid: `https://unpkg.com/mermaid@${MERMAID}/dist/mermaid.esm.min.mjs`,
  },
  'https://esm.sh': {
    katexJs: `https://esm.sh/katex@${KATEX}`,
    katexCss: `https://esm.sh/katex@${KATEX}/dist/katex.min.css`,
    mermaid: `https://esm.sh/mermaid@${MERMAID}`,
  },
}

const OFFLINE_SOURCES = { katexJs: 'katex', katexCss: '', mermaid: 'mermaid' }

/** The first allowed CDN that hosts the libraries, or undefined. */
export function libSources(policy: WidgetPolicy): (typeof SOURCES)[string] | undefined {
  if (offlinePack) return OFFLINE_SOURCES
  const allowed = safeOrigins(policy.cdn)
  const origin = Object.keys(SOURCES).find(o => allowed.includes(o))
  return origin ? SOURCES[origin] : undefined
}

const DEFAULT_DIAGRAM_LOADING = 'Rendering diagram…'
const MERMAID_LOADING_DELAY_MS = 180

interface MermaidModule {
  initialize: (opts: { startOnLoad: boolean; securityLevel: string; theme: string; fontFamily: string }) => void
  render: (id: string, source: string) => Promise<{ svg?: string } | undefined>
}

interface FrameUiApi {
  scheme: string
  css: (name: string) => string
  onTheme: (cb: () => void) => void
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

/**
 * Self-contained Mermaid lifecycle executed inside the opaque-origin iframe
 * (serialized via `.toString()`) and called directly in unit tests.
 * Must stay free of module-level imports or closure references.
 */
export function runMermaidFrame(
  doc: Document,
  ui: FrameUiApi,
  load: () => Promise<MermaidModule | { default?: MermaidModule }>,
  source: string,
  delayMs = 180,
): Promise<void> {
  var root = doc.getElementById('ui-root')
  var out = doc.getElementById('out')
  var status = doc.getElementById('lib-status')
  var loading = doc.getElementById('lib-loading')
  var seq = 0
  var settled = false
  var timer: ReturnType<typeof setTimeout> | null = null

  function setState(state: 'loading' | 'ready' | 'fallback') {
    if (root) root.setAttribute('data-lib-state', state)
  }

  function clearLoading() {
    settled = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (loading && loading.parentNode) {
      loading.parentNode.removeChild(loading)
    }
    loading = null
  }

  function fallback(e: unknown) {
    clearLoading()
    setState('fallback')
    if (out) {
      out.className = 'src'
      out.textContent = source
    }
    if (status) {
      var msg = e && typeof e === 'object' && 'message' in e ? (e as { message?: unknown }).message : ''
      status.textContent = 'Static fallback: library could not render. ' + (msg || '')
    }
    if (e) console.warn(e)
  }

  setState('loading')
  if (loading) {
    if (delayMs > 0) {
      timer = setTimeout(function () {
        timer = null
        if (!settled && loading) loading.hidden = false
      }, delayMs)
    } else {
      loading.hidden = false
    }
  }

  return Promise.resolve()
    .then(function () {
      return load()
    })
    .then(function (m) {
      var mm = (m && 'default' in m && m.default ? m.default : m) as MermaidModule
      function draw() {
        var mySeq = ++seq
        return Promise.resolve()
          .then(function () {
            mm.initialize({
              startOnLoad: false,
              securityLevel: 'strict',
              theme: ui.scheme === 'dark' ? 'dark' : 'default',
              fontFamily: ui.css('font'),
            })
            return mm.render('m' + mySeq, source)
          })
          .then(function (r) {
            if (mySeq !== seq) return
            if (!r || typeof r.svg !== 'string' || !r.svg) {
              throw new Error('Mermaid returned empty SVG')
            }
            clearLoading()
            if (out) {
              out.className = ''
              out.innerHTML = r.svg
            }
            if (status) status.textContent = ''
            setState('ready')
          })
          .catch(function (e) {
            if (mySeq !== seq) return
            fallback(e)
          })
      }

      ui.onTheme(function () {
        draw()
      })
      return draw()
    })
    .catch(function (e) {
      fallback(e)
    })
}

/** Frame payload for one library render. Exported for tests. */
export function libPayload(
  kind: 'math' | 'mermaid',
  source: string,
  opts: { display?: boolean; loadingText?: string },
  src: (typeof SOURCES)[string],
) {
  const fallback = 'function fallback(e){var r=document.getElementById("out");r.className="src";r.textContent=SRC;var status=document.getElementById("lib-status");status.textContent="Static fallback: library could not render. "+(e&&e.message||"");if(e)console.warn(e)}'
  const status = '<div id="lib-status" role="status" style="font-size:12px;color:var(--ui-muted)"></div>'
  if (kind === 'math') {
    return {
      css: `${offlinePack ? offlinePack.katexCss : `@import url(${JSON.stringify(src.katexCss)});`}#ui-root{padding:4px 2px;overflow-x:auto}#out{color:var(--ui-text);font-size:1.12em}#out.inline{display:inline-block}.src{font-family:var(--ui-mono);white-space:pre-wrap;color:var(--ui-muted)}.katex-display{margin:.4em 0}`,
      html: `<div id="out" class="${opts.display === false ? 'inline' : ''}"></div>${status}`,
      js: `var SRC=${JSON.stringify(source)};${fallback}
function render(){import(${JSON.stringify(src.katexJs)}).then(function(m){var k=m.default||m;k.render(SRC,document.getElementById("out"),{displayMode:${opts.display !== false},throwOnError:false,output:"htmlAndMathml"})}).catch(fallback)}`,
    }
  }
  const loadingText = typeof opts.loadingText === 'string' && opts.loadingText.trim()
    ? opts.loadingText
    : DEFAULT_DIAGRAM_LOADING
  return {
    css: [
      '#ui-root{padding:8px;overflow-x:auto}',
      '#out{display:flex;justify-content:center}',
      '#out svg{max-width:100%;height:auto}',
      '.src{font-family:var(--ui-mono);white-space:pre-wrap;color:var(--ui-muted);display:block}',
      '.lib-loading[hidden]{display:none}',
      '.lib-loading{display:flex;align-items:center;justify-content:center;gap:8px;min-height:min(160px,calc(100vh - 16px));color:var(--ui-muted);font-size:13px}',
      '.lib-spinner{width:14px;height:14px;flex:none;border-radius:50%;border:2px solid var(--ui-border);border-top-color:var(--ui-accent);animation:lib-spin .75s linear infinite}',
      '@keyframes lib-spin{to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion:reduce){.lib-spinner{animation:none;border-color:var(--ui-accent);opacity:.65}}',
    ].join(''),
    html: `<div id="lib-loading" class="lib-loading" role="status" aria-live="polite" hidden><span class="lib-spinner" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span></div><div id="out" role="img"></div>${status}`,
    js: `var SRC=${JSON.stringify(source)};function render(){return (${runMermaidFrame.toString()})(document,UI,function(){return import(${JSON.stringify(src.mermaid)})},SRC,${MERMAID_LOADING_DELAY_MS})}`,
  }
}

export function LibFrame(props: {
  kind: 'math' | 'mermaid'
  source: string
  display?: boolean
  loadingText?: string
  surfaceId: string
  policy: WidgetPolicy
  title: string
}) {
  const src = libSources(props.policy)
  const payload = useMemo(() => src && libPayload(props.kind, props.source, { display: props.display, loadingText: props.loadingText }, src),
    [src, props.kind, props.source, props.display, props.loadingText])
  if (!payload) return <div data-resource-status="static-fallback"><span role="status">Static fallback: no rendering library allowed.</span><pre className="diui-code">{props.source}</pre></div>
  return (
    <div className="diui-lib" data-kind={props.kind}>
      <WidgetFrame
        resourceLibraries={[props.kind === 'math' ? 'katex' : 'mermaid']}
        callId={props.surfaceId}
        mode="final"
        css={payload.css}
        html={payload.html}
        jsFunctions={payload.js}
        jsExpressions={['render()']}
        initialHeight={props.kind === 'math' ? 56 : 240}
        policy={props.policy}
        title={props.title}
        persist
        sendPrompt={() => Promise.reject(new Error('not available here'))}
      />
    </div>
  )
}
