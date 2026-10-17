/**
 * Build the srcdoc for a widget frame. The frame is an opaque-origin sandbox
 * (`sandbox="allow-scripts allow-forms"`, never `allow-same-origin`), so the
 * only channel to the host is postMessage, gated by a per-frame token.
 *
 * Layout of the document (after OpenIntelligentUI's frame-content.ts):
 * CSP meta → importmap → theme variables → base design CSS → widget css →
 * bootstrap (bridge, resize, morph, UI runtime) → body markup → code payload
 * (final only).
 *
 * A frame opened in `preview` mode is finalized in place: the host posts a
 * `final` message with the complete html and code, the bootstrap morphs the
 * markup and runs the code. The iframe is never rebuilt between streaming and
 * the finished widget, so there is no blank flash or height jump.
 */
import { offlinePack, resourceMode } from '../resources.ts'
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
  /** Persisted widget state (`UI.state` + auto-captured control values), final mode only. */
  state?: unknown
  /** Internal catalog frames embed only the library they use. */
  resourceLibraries?: readonly string[]
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
  const cdn = offlinePack ? '' : safeOrigins(policy.cdn).join(' ')
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
  const scheme = theme['--ui-scheme'] === 'dark' ? 'dark' : 'light'
  return `:root{${decls}color-scheme:${scheme};}`
}

/** `light` or `dark`, from a resolved theme. */
export function schemeOf(theme: Readonly<Record<string, string>>): 'light' | 'dark' {
  return theme['--ui-scheme'] === 'dark' ? 'dark' : 'light'
}

/** Minimal design system so unstyled widgets still look native (cf. OIUI design-system). */
export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color:var(--ui-text);font:14px/1.5 var(--ui-font);-webkit-font-smoothing:antialiased}
#ui-root{padding:12px}
h1,h2,h3,h4{margin:0 0 .5em;line-height:1.25}
h3{font-size:16px}
p{margin:0 0 .75em}
a{color:var(--ui-accent)}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer;border:1px solid var(--ui-border);background:var(--ui-surface);border-radius:var(--ui-radius);padding:6px 12px;transition:border-color .15s,background .15s}
button:hover:not(:disabled){border-color:var(--ui-accent)}
button:disabled{opacity:.55;cursor:default}
button[aria-busy=true]{cursor:progress}
button.primary,button[data-variant=primary]{background:var(--ui-accent);border-color:var(--ui-accent);color:var(--ui-accent-text)}
:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
input,select,textarea{border:1px solid var(--ui-border);background:var(--ui-bg);border-radius:var(--ui-radius);padding:6px 8px;max-width:100%}
input[type=range]{padding:0;accent-color:var(--ui-accent);border:0;background:transparent}
input[type=checkbox],input[type=radio]{accent-color:var(--ui-accent)}
code,pre{font-family:var(--ui-mono)}
table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid var(--ui-border);padding:6px 8px;text-align:left}
svg,canvas,img,video{max-width:100%}
.ui-row{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
.ui-card{border:1px solid var(--ui-border);border-radius:var(--ui-radius);background:var(--ui-surface);padding:12px}
.ui-muted{color:var(--ui-muted)}
.ui-control{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ui-muted)}
.ui-control output,.ui-control b{color:var(--ui-text);font-variant-numeric:tabular-nums;min-width:3ch}
.ui-stage{position:relative;width:100%;height:360px;border-radius:var(--ui-radius);overflow:hidden;background:var(--ui-surface);touch-action:none}
.ui-stage canvas{display:block;width:100%;height:100%}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
`

/**
 * The bootstrap that runs inside the frame. Plain ES2019, no imports.
 * Placeholders: __TOKEN__ (JSON string), __MAX__ (number), __SCHEME__ (JSON string).
 */
const BOOTSTRAP = `
(function(){
  var TOKEN = __TOKEN__, MAX = __MAX__, seq = 0, pending = {}, finalized = false;
  var doc = document.documentElement;
  doc.dataset.theme = __SCHEME__;
  function post(msg){ msg.__diui = TOKEN; parent.postMessage(msg, '*'); }
  function call(method, params){
    return new Promise(function(resolve, reject){
      var id = ++seq; pending[id] = { resolve: resolve, reject: reject };
      post({ type: 'rpc', id: id, method: method, params: params || {} });
    });
  }
  // A send is tied to the control that triggered it: that control is marked
  // busy until the host answers, so double clicks cannot queue duplicates.
  function busy(promise){
    var el = document.activeElement;
    if (!el || el === document.body || !/^(BUTTON|INPUT)$/.test(el.tagName) || el.disabled) return promise;
    el.disabled = true; el.setAttribute('aria-busy', 'true');
    function done(){ el.disabled = false; el.removeAttribute('aria-busy'); }
    promise.then(done, done);
    return promise;
  }
  // Convenience guard only; execution authority remains in the parent native UI.
  var actionClick = null;
  document.addEventListener('click', function(e){
    actionClick = e.isTrusted ? e : null;
  }, true);
  var remote = {
    sendPrompt: function(p){ return busy(call('sendPrompt', typeof p === 'string' ? { text: p } : p)); },
    readData: function(dataRef){ return call('readData', { dataRef: dataRef }); },
    invokeAction: function(p){
      // Native dispatch can run microtasks between capture and target listeners.
      // eventPhase remains nonzero during dispatch, and is zero in later timers.
      if (!actionClick || !actionClick.eventPhase) return Promise.reject(new Error('Explicit user click required'));
      actionClick = null;
      return busy(call('invokeAction', p));
    },
    openLink: function(p){ return call('openLink', typeof p === 'string' ? { url: p } : p); }
  };
  window.Bridge = remote;
  // OpenIntelligentUI / websandbox compatibility.
  window.Websandbox = { connection: { remote: remote } };

  // ---- UI runtime: state, theme, canvas and three.js helpers -------------
  var themeListeners = [], stateTimer = 0, colorCtx = null;
  function parseColor(v){
    if (!v) return null;
    if (!colorCtx) colorCtx = document.createElement('canvas').getContext('2d');
    colorCtx.fillStyle = '#010203'; colorCtx.fillStyle = v;
    var f = colorCtx.fillStyle;
    if (f === '#010203' && !/^#010203$/i.test(v)) return null;
    var m = /^#([0-9a-f]{6})$/i.exec(f);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
    m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(f);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  }
  var UI = window.UI = {
    resourceMode: __RESOURCE_MODE__,
    state: {},
    controls: {},
    reducedMotion: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    get scheme(){ return doc.dataset.theme === 'dark' ? 'dark' : 'light'; },
    css: function(name){
      return getComputedStyle(doc).getPropertyValue(name.indexOf('--') === 0 ? name : '--ui-' + name).trim();
    },
    // Theme tokens may be any CSS color syntax (and borders are translucent).
    // Return an opaque #rrggbb that three.js, d3 and canvas code all accept:
    // translucent colors are composited over the theme background.
    color: function(name, fallback){
      var v = UI.css(name);
      if (!v) return fallback || '';
      var c = parseColor(v);
      if (!c) return fallback || v;
      if (c[3] < 1) {
        var bg = parseColor(UI.css('bg')) || (UI.scheme === 'dark' ? [21, 21, 23, 1] : [255, 255, 255, 1]);
        c = [0, 1, 2].map(function(i){ return c[i] * c[3] + bg[i] * (1 - c[3]); });
      }
      return '#' + [0, 1, 2].map(function(i){ return ('0' + Math.round(c[i]).toString(16)).slice(-2); }).join('');
    },
    onTheme: function(cb){
      themeListeners.push(cb);
      return function(){ themeListeners = themeListeners.filter(function(x){ return x !== cb; }); };
    },
    setState: function(patch){
      if (patch && typeof patch === 'object') for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) UI.state[k] = patch[k];
      saveSoon();
      return UI.state;
    },
    canvas: function(el, draw){
      if (typeof el === 'string') el = document.querySelector(el);
      var ctx = el.getContext('2d'), w = 0, h = 0;
      function redraw(){
        var r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height || el.height || 150));
        if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        try { draw(ctx, w, h); } catch (e) { report('canvas', e); }
      }
      new ResizeObserver(redraw).observe(el);
      UI.onTheme(redraw);
      redraw();
      return { redraw: redraw, ctx: ctx };
    },
    three: function(el, opts){
      opts = opts || {};
      if (typeof el === 'string') el = document.querySelector(el);
      return Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function(mods){
        var THREE = mods[0], OrbitControls = mods[1].OrbitControls;
        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.appendChild(renderer.domElement);
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(opts.fov || 45, 1, 0.01, 1000);
        var p = opts.camera || [4, 3, 5]; camera.position.set(p[0], p[1], p[2]);
        var controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = !UI.reducedMotion;
        // Decorative spin is skipped for users who ask for reduced motion.
        controls.autoRotate = !!opts.autoRotate && !UI.reducedMotion;
        var t = opts.target || [0, 0, 0]; controls.target.set(t[0], t[1], t[2]);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 2.4));
        var sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(5, 8, 6); scene.add(sun);
        var fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-6, -4, -3); scene.add(fill);
        var frameCbs = [], dirty = true, animating = !!opts.animate;
        function size(){
          var r = el.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height || 360);
          renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
        }
        new ResizeObserver(size).observe(el); size();
        controls.addEventListener('change', function(){ dirty = true; });
        var clock = new THREE.Clock();
        function loop(){
          requestAnimationFrame(loop);
          var moving = controls.update(), dt = clock.getDelta();
          if (animating && frameCbs.length) { frameCbs.forEach(function(cb){ try { cb(dt); } catch (e) { report('frame', e); } }); dirty = true; }
          if (dirty || moving) { dirty = false; renderer.render(scene, camera); }
        }
        loop();
        var api = {
          THREE: THREE, scene: scene, camera: camera, renderer: renderer, controls: controls,
          render: function(){ dirty = true; },
          onFrame: function(cb){ frameCbs.push(cb); animating = true; },
          setAnimating: function(on){ animating = !!on; }
        };
        UI.onTheme(function(){ dirty = true; });
        return api;
      });
    }
  };

  // Auto-captured control values (inputs/selects/textareas with an id) and
  // UI.state are posted to the host, which persists them per widget; a
  // re-rendered or reloaded widget gets them back before its code runs.
  function controlValue(el){ return el.type === 'checkbox' || el.type === 'radio' ? !!el.checked : el.value; }
  function trackable(el){
    return el && el.id && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== 'password' && el.type !== 'file' && !el.hasAttribute('data-no-persist');
  }
  function saveSoon(){
    if (!finalized) return;
    clearTimeout(stateTimer);
    stateTimer = setTimeout(function(){
      try { post({ type: 'state', state: JSON.parse(JSON.stringify({ data: UI.state, controls: UI.controls })) }); } catch (e) { report('state', e); }
    }, 250);
  }
  function onControl(ev){ var el = ev.target; if (!trackable(el)) return; UI.controls[el.id] = controlValue(el); saveSoon(); }
  document.addEventListener('input', onControl, true);
  document.addEventListener('change', onControl, true);
  function restoreControls(dispatch){
    Object.keys(UI.controls).forEach(function(id){
      var el = document.getElementById(id), v = UI.controls[id];
      if (!trackable(el) || controlValue(el) === v) return;
      if (typeof v === 'boolean') el.checked = v; else el.value = v;
      if (dispatch) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }

  function morph(html){
    var root = document.getElementById('ui-root');
    try { Idiomorph.morph(root, html, { morphStyle: 'innerHTML' }); } catch (e) { root.innerHTML = html; }
  }
  window.addEventListener('message', function(ev){
    if (ev.source !== parent) return;
    var m = ev.data;
    if (!m || m.__diui !== TOKEN) return;
    if (m.type === 'rpc-result' && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error || 'rejected'));
    } else if (m.type === 'html' && !finalized) {
      morph(m.html);
    } else if (m.type === 'final' && !finalized) {
      morph(m.html || '');
      run(m.code || {});
    } else if (m.type === 'theme') {
      var s = document.getElementById('ui-theme'); if (s) s.textContent = m.css;
      doc.dataset.theme = m.scheme === 'dark' ? 'dark' : 'light';
      themeListeners.slice().forEach(function(cb){ try { cb(UI.scheme); } catch (e) { report('onTheme', e); } });
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
  function run(code){
    finalized = true;
    var st = code.state && typeof code.state === 'object' ? code.state : {};
    if (st.data && typeof st.data === 'object') UI.state = st.data;
    if (st.controls && typeof st.controls === 'object') UI.controls = st.controls;
    restoreControls(false);
    var indirect = eval;
    if (code.functions) { try { indirect(code.functions); } catch (e) { report('jsFunctions', e); } }
    (code.expressions || []).forEach(function(x, i){ try { indirect(x); } catch (e) { report('jsExpressions[' + i + ']', e); } });
    // Controls created by the code itself, or reset by it, get their saved value back.
    restoreControls(true);
    post({ type: 'ready', final: true }); measure();
  }
  function boot(){
    var el = document.getElementById('ui-code');
    if (!el) { post({ type: 'ready', final: false }); return; }
    var code; try { code = JSON.parse(el.textContent); } catch (e) { report('payload', e); return; }
    run(code);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
`

/** The code payload a final frame runs (embedded in the document or posted to a preview frame). */
export function codePayload(input: Pick<FrameInput, 'jsFunctions' | 'jsExpressions' | 'state'>): Record<string, unknown> {
  return { functions: input.jsFunctions ?? '', expressions: input.jsExpressions ?? [], state: input.state ?? null }
}

/** Blob modules are created by the opaque-origin frame itself. No host URL enters CSP. */
function offlineImportMap(libraries?: readonly string[]): string {
  const modules = Object.fromEntries(Object.entries(offlinePack!.modules)
    .filter(([name]) => !libraries || libraries.includes(name)))
  return `<script>(function(){var modules=${jsonForScript(modules)},imports={};
Object.keys(modules).forEach(function(name){var m=modules[name],url=URL.createObjectURL(new Blob([m.source],{type:'text/javascript'}));m.imports.forEach(function(key){imports[key]=url})});
var map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:imports});document.currentScript.after(map);
})();</script>`
}

/** @returns the complete srcdoc for one frame. */
export function buildFrameDocument(input: FrameInput): string {
  const cdn = safeOrigins(input.policy.cdn)
  const imports = !offlinePack && cdn.includes('https://esm.sh') ? IMPORTS : {}
  const bootstrap = BOOTSTRAP
    .replace('__RESOURCE_MODE__', JSON.stringify(resourceMode))
    .replace('__TOKEN__', JSON.stringify(input.token))
    .replace('__MAX__', String(Math.max(50, Math.floor(input.policy.maxHeight))))
    .replace('__SCHEME__', JSON.stringify(schemeOf(input.theme)))
  const code = input.mode === 'final'
    ? `<script type="application/json" id="ui-code">${jsonForScript(codePayload(input))}</script>`
    : ''
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(input.policy).replace(/"/g, '&quot;')}">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    offlinePack ? offlineImportMap(input.resourceLibraries) : '',
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
