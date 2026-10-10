/**
 * Build the srcdoc for a widget frame. The frame is an opaque-origin sandbox
 * (`sandbox="allow-scripts allow-forms"`, never `allow-same-origin`), so the
 * only channel to the host is postMessage, gated by a per-frame token.
 *
 * Layout of the document (after OpenIntelligentUI's frame-content.ts):
 * CSP meta → importmap → theme variables → base design CSS → widget css →
 * bootstrap (bridge, resize, morph) → body markup → code payload (final only).
 */
import IDIOMORPH_SOURCE from 'idiomorph-source'
import type { WidgetPolicy } from '../policy.ts'

export interface FrameInput {
  token: string
  mode: 'preview' | 'final'
  css: string
  html: string
  jsFunctions?: string
  jsExpressions?: readonly string[]
  theme: Readonly<Record<string, string>>
  policy: WidgetPolicy
}

/** Bare-specifier aliases for popular libraries, served from esm.sh when allowed. */
const IMPORTS: Record<string, string> = {
  three: 'https://esm.sh/three@0.169.0',
  'three/addons/': 'https://esm.sh/three@0.169.0/examples/jsm/',
  d3: 'https://esm.sh/d3@7.9.0',
  'chart.js/auto': 'https://esm.sh/chart.js@4.4.4/auto',
  gsap: 'https://esm.sh/gsap@3.12.5',
  'canvas-confetti': 'https://esm.sh/canvas-confetti@1.9.3',
}

/** Origins must be plain https origins to enter the CSP; anything else is dropped. */
export function safeOrigins(list: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of list) {
    try {
      const u = new URL(raw)
      if (u.protocol === 'https:' && u.origin !== 'null') out.push(u.origin)
    } catch { /* not a URL */ }
  }
  return [...new Set(out)]
}

export function contentSecurityPolicy(policy: WidgetPolicy): string {
  const cdn = safeOrigins(policy.cdn).join(' ')
  const connect = policy.allowNetwork && cdn ? cdn : "'none'"
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob: ${cdn}`.trim(),
    `style-src 'unsafe-inline' ${cdn}`.trim(),
    `img-src data: blob: ${cdn}`.trim(),
    `font-src data: ${cdn}`.trim(),
    `media-src data: blob: ${cdn}`.trim(),
    `connect-src ${connect}`,
    'worker-src blob:',
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/** Escape text so it can sit inside an HTML <script>/<style> element without closing it. */
export function escapeForRawText(text: string, tag: 'script' | 'style'): string {
  return text.replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1')
}

/** U+2028/U+2029 are line terminators inside a <script> element's JS but legal in JSON strings. */
const LINE_SEPARATORS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g')

/** JSON that is safe inside a <script type="application/json"> element. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(LINE_SEPARATORS, c => '\\u' + c.charCodeAt(0).toString(16))
}

function themeCss(theme: Readonly<Record<string, string>>): string {
  const decls = Object.entries(theme)
    .filter(([k, v]) => /^--ui-[a-z-]+$/.test(k) && !/[;{}<]/.test(v))
    .map(([k, v]) => `${k}:${v};`).join('')
  return `:root{${decls}}`
}

/** Minimal design system so unstyled widgets still look native (cf. OIUI design-system). */
export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color:var(--ui-text);font:14px/1.5 var(--ui-font);-webkit-font-smoothing:antialiased}
#ui-root{padding:12px}
h1,h2,h3,h4{margin:0 0 .5em;line-height:1.25}
p{margin:0 0 .75em}
a{color:var(--ui-accent)}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;border:1px solid var(--ui-border);background:var(--ui-surface);border-radius:var(--ui-radius);padding:6px 12px}
button:hover{border-color:var(--ui-accent)}
button.primary,button[data-variant=primary]{background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-accent-text)}
input,select,textarea{border:1px solid var(--ui-border);background:var(--ui-bg);border-radius:var(--ui-radius);padding:6px 8px}
input[type=range]{padding:0;accent-color:var(--ui-accent)}
code,pre{font-family:var(--ui-mono)}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid var(--ui-border);padding:6px 8px;text-align:left}
svg{max-width:100%}
`

/**
 * The bootstrap that runs inside the frame. Plain ES2019, no imports.
 * Placeholders: __TOKEN__ (JSON string), __MAX__ (number).
 */
const BOOTSTRAP = `
(function(){
  var TOKEN = __TOKEN__, MAX = __MAX__, seq = 0, pending = {};
  function post(msg){ msg.__diui = TOKEN; parent.postMessage(msg, '*'); }
  function call(method, params){
    return new Promise(function(resolve, reject){
      var id = ++seq; pending[id] = { resolve: resolve, reject: reject };
      post({ type: 'rpc', id: id, method: method, params: params || {} });
    });
  }
  var remote = {
    sendPrompt: function(p){ return call('sendPrompt', typeof p === 'string' ? { text: p } : p); },
    openLink: function(p){ return call('openLink', typeof p === 'string' ? { url: p } : p); }
  };
  window.Bridge = remote;
  // OpenIntelligentUI / websandbox compatibility.
  window.Websandbox = { connection: { remote: remote } };
  window.addEventListener('message', function(ev){
    if (ev.source !== parent) return;
    var m = ev.data;
    if (!m || m.__diui !== TOKEN) return;
    if (m.type === 'rpc-result' && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || 'rejected'));
    } else if (m.type === 'html') {
      var root = document.getElementById('ui-root');
      try { Idiomorph.morph(root, m.html, { morphStyle: 'innerHTML' }); } catch (e) { root.innerHTML = m.html; }
    } else if (m.type === 'theme') {
      var s = document.getElementById('ui-theme'); if (s) s.textContent = m.css;
    }
  });
  function report(kind, e){
    var msg = e && (e.message || String(e)) || 'error';
    post({ type: 'error', kind: kind, message: String(msg).slice(0, 500) });
  }
  window.addEventListener('error', function(e){ report('runtime', e.error || e.message); });
  window.addEventListener('unhandledrejection', function(e){ report('promise', e.reason); });
  var last = 0;
  function measure(){
    var h = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    h = Math.max(50, Math.min(MAX, h));
    if (h !== last) { last = h; post({ type: 'resize', height: h }); }
  }
  new ResizeObserver(measure).observe(document.documentElement);
  window.addEventListener('load', measure);
  function run(){
    var el = document.getElementById('ui-code');
    if (!el) { post({ type: 'ready' }); return; }
    var code; try { code = JSON.parse(el.textContent); } catch (e) { report('payload', e); return; }
    var indirect = eval;
    if (code.functions) { try { indirect(code.functions); } catch (e) { report('jsFunctions', e); } }
    (code.expressions || []).forEach(function(x, i){ try { indirect(x); } catch (e) { report('jsExpressions[' + i + ']', e); } });
    post({ type: 'ready' }); measure();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
`

/** @returns the complete srcdoc for one frame. */
export function buildFrameDocument(input: FrameInput): string {
  const cdn = safeOrigins(input.policy.cdn)
  const imports = cdn.includes('https://esm.sh') ? IMPORTS : {}
  const bootstrap = BOOTSTRAP
    .replace('__TOKEN__', JSON.stringify(input.token))
    .replace('__MAX__', String(Math.max(50, Math.floor(input.policy.maxHeight))))
  const code = input.mode === 'final'
    ? `<script type="application/json" id="ui-code">${jsonForScript({ functions: input.jsFunctions ?? '', expressions: input.jsExpressions ?? [] })}</script>`
    : ''
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(input.policy).replace(/"/g, '&quot;')}">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    Object.keys(imports).length ? `<script type="importmap">${jsonForScript({ imports })}</script>` : '',
    `<style id="ui-theme">${escapeForRawText(themeCss(input.theme), 'style')}</style>`,
    `<style>${BASE_CSS}</style>`,
    `<style id="ui-css">${escapeForRawText(input.css, 'style')}</style>`,
    `<script>${escapeForRawText(IDIOMORPH_SOURCE, 'script')}</script>`,
    `<script>${bootstrap}</script>`,
    '</head><body>',
    `<div id="ui-root">${input.html}</div>`,
    code,
    '</body></html>',
  ].join('')
}

/** Theme CSS text for a live theme update message. */
export { themeCss }
