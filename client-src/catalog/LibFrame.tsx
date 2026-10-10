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

/** The first allowed CDN that hosts the libraries, or undefined. */
export function libSources(policy: WidgetPolicy): (typeof SOURCES)[string] | undefined {
  const allowed = safeOrigins(policy.cdn)
  const origin = Object.keys(SOURCES).find(o => allowed.includes(o))
  return origin ? SOURCES[origin] : undefined
}

/** Frame payload for one library render. Exported for tests. */
export function libPayload(kind: 'math' | 'mermaid', source: string, opts: { display?: boolean }, src: (typeof SOURCES)[string]) {
  const fallback = 'function fallback(e){var r=document.getElementById("out");r.className="src";r.textContent=SRC;if(e)console.warn(e)}'
  if (kind === 'math') {
    return {
      css: `@import url(${JSON.stringify(src.katexCss)});#ui-root{padding:4px 2px;overflow-x:auto}#out{color:var(--ui-text);font-size:1.12em}#out.inline{display:inline-block}.src{font-family:var(--ui-mono);white-space:pre-wrap;color:var(--ui-muted)}.katex-display{margin:.4em 0}`,
      html: `<div id="out" class="${opts.display === false ? 'inline' : ''}"></div>`,
      js: `var SRC=${JSON.stringify(source)};${fallback}
function render(){import(${JSON.stringify(src.katexJs)}).then(function(m){var k=m.default||m;k.render(SRC,document.getElementById("out"),{displayMode:${opts.display !== false},throwOnError:false,output:"htmlAndMathml"})}).catch(fallback)}`,
    }
  }
  return {
    css: '#ui-root{padding:8px;overflow-x:auto}#out{display:flex;justify-content:center}#out svg{max-width:100%;height:auto}.src{font-family:var(--ui-mono);white-space:pre-wrap;color:var(--ui-muted);display:block}',
    html: '<div id="out" role="img"></div>',
    js: `var SRC=${JSON.stringify(source)},n=0;${fallback}
function render(){import(${JSON.stringify(src.mermaid)}).then(function(m){var mm=m.default||m;function draw(){mm.initialize({startOnLoad:false,securityLevel:"strict",theme:UI.scheme==="dark"?"dark":"default",fontFamily:UI.css("font")});return mm.render("m"+(++n),SRC).then(function(r){document.getElementById("out").innerHTML=r.svg})}
UI.onTheme(function(){draw().catch(fallback)});return draw()}).catch(fallback)}`,
  }
}

export function LibFrame(props: {
  kind: 'math' | 'mermaid'
  source: string
  display?: boolean
  surfaceId: string
  policy: WidgetPolicy
  title: string
}) {
  const src = libSources(props.policy)
  const payload = useMemo(() => src && libPayload(props.kind, props.source, { display: props.display }, src),
    [src, props.kind, props.source, props.display])
  if (!payload) return <pre className="diui-code">{props.source}</pre>
  return (
    <div className="diui-lib" data-kind={props.kind}>
      <WidgetFrame
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
