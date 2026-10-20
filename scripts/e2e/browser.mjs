// End-to-end driver for a running DSH Web (real DSH, real plugin, real browser).
// The model behind it is whatever DEEPSEEK_BASE_URL points at; with
// scripts/e2e/mock-deepseek.mjs the answers are scripted (see scenarios.mjs),
// so this validates rendering, streaming, interaction, persistence and
// isolation, not the model's own choice of presentation.
//
// Usage: node scripts/e2e/browser.mjs <dsh-web-url-with-token> <out-dir> <mock-log-file> [--record]
//   --record  also capture a screencast to <out-dir>/frames (+ frames.txt for ffmpeg concat)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { findChrome } from './dsh-web.mjs'

const [url, outDir, mockLog] = process.argv.slice(2)
const RECORD = process.argv.includes('--record')
if (!url || !outDir || !mockLog) {
  console.error('usage: node scripts/e2e/browser.mjs <url> <out-dir> <mock-log> [--record]')
  process.exit(2)
}
const shots = path.join(outDir, 'screenshots')
mkdirSync(shots, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const mock = () => readFileSync(mockLog, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(e => e.decision)

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  defaultViewport: { width: 1280, height: 860 },
  // Software WebGL so three.js renders in headless Chrome.
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
    // GitHub's Linux runners disallow the unprivileged user namespaces Chrome's sandbox needs.
    ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [])],
})
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
const pageErrors = []
const requestFailures = []
page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') pageErrors.push(`console.error: ${m.text().slice(0, 200)}`) })
page.on('requestfailed', req => {
  const target = new URL(req.url())
  requestFailures.push(`${target.origin}${target.pathname}: ${req.failure()?.errorText}`)
})

// ---- optional real-time screencast -------------------------------------------
const frames = []
let cdp
const framesDir = path.join(outDir, 'frames')
async function startRecording() {
  rmSync(framesDir, { recursive: true, force: true })
  mkdirSync(framesDir, { recursive: true })
  cdp = await page.target().createCDPSession()
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    const file = `f${String(frames.length).padStart(5, '0')}.jpg`
    frames.push({ file, t: metadata.timestamp })
    writeFileSync(path.join(framesDir, file), Buffer.from(data, 'base64'))
    try { await cdp.send('Page.screencastFrameAck', { sessionId }) } catch { /* closing */ }
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 })
}
async function stopRecording() {
  if (!cdp) return
  try { await cdp.send('Page.stopScreencast') } catch { /* closed */ }
  // ffmpeg concat list with real frame durations; long idle gaps are capped.
  const lines = []
  frames.forEach((f, i) => {
    const next = frames[i + 1]
    const d = next ? Math.min(1.2, Math.max(0.04, next.t - f.t)) : 1.5
    lines.push(`file '${f.file}'`, `duration ${d.toFixed(3)}`)
  })
  if (frames.length) lines.push(`file '${frames.at(-1).file}'`)
  writeFileSync(path.join(framesDir, 'frames.txt'), lines.join('\n'))
}

// ---- demo helpers: caption banner and a visible cursor -----------------------
async function caption(text) {
  if (!RECORD) return
  await page.evaluate((t) => {
    let el = document.getElementById('e2e-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'e2e-caption'
      el.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99999;background:rgba(15,17,21,.86);color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:7px 16px;border-radius:999px;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center'
      document.body.appendChild(el)
    }
    el.textContent = t
  }, text)
}
async function cursorAt(x, y) {
  if (!RECORD) return
  await page.evaluate((x, y) => {
    let el = document.getElementById('e2e-cursor')
    if (!el) {
      el = document.createElement('div')
      el.id = 'e2e-cursor'
      el.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(65,118,230,.35);border:2px solid #4176e6;pointer-events:none;transition:left .05s,top .05s'
      document.body.appendChild(el)
    }
    el.style.left = x + 'px'
    el.style.top = y + 'px'
  }, x, y)
}
async function moveMouse(x, y, steps = 1) {
  await page.mouse.move(x, y, { steps })
  await cursorAt(x, y)
}

// ---- DSH helpers ---------------------------------------------------------------
async function send(text) {
  const box = await page.waitForSelector('textarea, [contenteditable="true"]', { timeout: 15000 })
  await box.click()
  await page.keyboard.type(text, { delay: RECORD ? 18 : 0 })
  await page.keyboard.press('Enter')
}
const busy = () => page.evaluate(() => !!document.querySelector('button[aria-label="停止生成"], button[aria-label="Stop generating"]'))
async function waitIdle(timeout = 30000) {
  const end = Date.now() + timeout
  await sleep(400)
  while (Date.now() < end) {
    if (!(await busy())) { await sleep(500); if (!(await busy())) return true }
    await sleep(200)
  }
  return false
}
/** Live (non-pointer) shells: [kind, state, title]. */
const shells = () => page.$$eval('.diui-shell', s => s.filter(x => x.querySelector('.diui-shell-body')).map(x => [x.dataset.kind, x.dataset.state, x.querySelector('.diui-shell-title')?.textContent ?? '']))
async function frameByTitle(title) {
  const handles = await page.$$(`iframe.diui-frame[title="${title}"]`)
  const h = handles.at(-1)
  return h ? { handle: h, frame: await h.contentFrame() } : undefined
}
async function waitFor(fn, timeout = 15000, every = 150) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch { /* not yet */ }
    await sleep(every)
  }
  return undefined
}
async function shot(name) { await page.screenshot({ path: path.join(shots, name) }) }
async function shellShot(name, title) {
  const el = await page.evaluateHandle((t) => [...document.querySelectorAll('.diui-tail .diui-shell, .diui-shell')].filter(x => x.querySelector('.diui-shell-body') && x.querySelector('.diui-shell-title')?.textContent === t).at(-1), title)
  const box = el.asElement() && await el.asElement().boundingBox()
  if (box) await page.screenshot({ path: path.join(shots, name), clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: Math.min(1280, box.width + 24), height: Math.min(1600, box.height + 24) }, captureBeyondViewport: true })
}
async function scrollIntoView(selectorOrHandle) {
  const h = typeof selectorOrHandle === 'string' ? await page.$(selectorOrHandle) : selectorOrHandle
  await h?.evaluate(e => e.scrollIntoView({ block: 'center' }))
  await sleep(300)
}

// ================================================================================
try {
await page.goto(url, { waitUntil: 'networkidle2' })
await sleep(2000)
// First-run notice (DSH 0.1.x enables its Continue button only after a delay): wait for it to be clickable.
for (let i = 0; i < 40; i++) {
  const state = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^(继续|Continue)$/.test(x.textContent.trim()))
    if (!b) return 'none'
    if (b.disabled || b.getAttribute('aria-disabled') === 'true') return 'disabled'
    b.click()
    return 'clicked'
  })
  if (state === 'none' && i > 0) break
  await sleep(state === 'clicked' ? 600 : 500)
}
if (RECORD) await startRecording()
await shot('0-home.png')

// 1) Plain question → plain text, no UI.
await caption('1 · A plain question gets a plain answer — no UI')
const before = (await shells()).length
await send('What is the capital of France?')
// waitIdle() can return before a slow runner (macOS, DSH alpha) has even
// started the turn: wait for the answer itself, then for the turn to settle.
const paris = await waitFor(() => page.evaluate(() => document.body.innerText.includes('Paris')), 20000, 150)
await waitIdle()
check('1. plain Q&A answers in text without UI', paris && (await shells()).length === before, `answered=${!!paris} shells before=${before} after=${(await shells()).length}`)
await sleep(600)

// 2) Dashboard, streamed progressively.
await caption('2 · "Show me a sales dashboard" → a native dashboard streams in')
await page.evaluate(() => {
  const state = { parts: 0 }
  const observer = new MutationObserver(() => {
    for (const shell of document.querySelectorAll('.diui-shell[data-state=generating]')) {
      const parts = shell.querySelectorAll('.diui-stat').length
      if (parts > 0 && parts < 4) state.parts = parts
    }
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
  window.__e2eDashboardStream = { state, stop: () => observer.disconnect() }
})
await send('Show me a sales dashboard for this year')
const streamedParts = await waitFor(() => page.evaluate(() => window.__e2eDashboardStream.state.parts), 20000, 60)
if (streamedParts) writeFileSync(`${mockLog}.dashboard-preview`, 'observed')
if (streamedParts) await shot('1-render-streaming.png')
await page.evaluate(() => { window.__e2eDashboardStream.stop(); delete window.__e2eDashboardStream })
await waitIdle()
await sleep(400)
const dash = await page.evaluate(() => {
  const tail = [...document.querySelectorAll('.diui-tail .diui-shell')].at(-1)
  return tail && { stats: tail.querySelectorAll('.diui-stat').length, tabs: [...tail.querySelectorAll('[role=tab]')].map(t => t.textContent), bars: tail.querySelectorAll('.diui-chart-svg rect').length }
})
check('2a. dashboard streams progressively (partial components visible mid-stream)', streamedParts > 0, `stats visible mid-stream: ${streamedParts ?? 0}`)
check('2b. dashboard settles beneath the reply with KPIs, tabs and chart', dash && dash.stats === 4 && dash.tabs.length === 4 && dash.bars >= 8, JSON.stringify(dash))
await scrollIntoView('.diui-tail .diui-chart-svg')
const bar = await page.$('.diui-tail .diui-chart-svg rect:not(.diui-hover-band)')
const bb = await bar.boundingBox()
await moveMouse(bb.x + bb.width / 2, bb.y + bb.height / 2, 8)
await sleep(400)
const tip = await page.$eval('.diui-tail .diui-tooltip', e => e.textContent).catch(() => '')
check('2c. chart hover shows a tooltip (local, no model call)', /Online/.test(tip), tip)
await shot('2-render-ready.png')
await shellShot('3-dashboard.png', 'Quarterly sales (sample data)')
const tabClick = async (label) => {
  const h = await page.evaluateHandle(l => [...document.querySelectorAll('.diui-tail [role=tab]')].find(b => b.textContent === l), label)
  const b = await h.asElement().boundingBox()
  await moveMouse(b.x + b.width / 2, b.y + b.height / 2, 6)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await sleep(500)
}
await tabClick('Regions')
const growth = await page.evaluateHandle(() => [...document.querySelectorAll('.diui-tail th button')].find(b => b.textContent.startsWith('Growth')))
const gb = await growth.asElement().boundingBox()
await moveMouse(gb.x + gb.width / 2, gb.y + gb.height / 2, 6)
await page.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2)
await sleep(250)
await page.mouse.click(gb.x + gb.width / 2, gb.y + gb.height / 2)
await sleep(500)
const firstRegion = await page.$eval('.diui-tail tbody tr td', td => td.textContent)
check('2d. table sorts locally (descending growth → APAC first)', firstRegion === 'APAC', firstRegion)
await tabClick('Milestones')
check('2e. timeline renders', (await page.$$('.diui-tail .diui-timeline-item')).length === 4)
const callsBeforeLocal = mock().length

// 5) Form → agent → new UI.
await caption('3 · Form submit → the agent answers with a new UI')
await tabClick('Forecast')
await page.evaluate(() => {
  const form = [...document.querySelectorAll('.diui-tail form')].at(-1)
  const range = form.querySelector('input[type=range]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, '6')
  range.dispatchEvent(new Event('input', { bubbles: true }))
  const scenario = form.querySelectorAll('select')[1]
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(scenario, 'Optimistic')
  scenario.dispatchEvent(new Event('change', { bubbles: true }))
})
await sleep(500)
check('5a. local tab/sort/hover interactions made no model calls', mock().length === callsBeforeLocal, `calls ${callsBeforeLocal} → ${mock().length}`)
const submit = await page.$('.diui-tail form button[type=submit]')
const sb = await submit.boundingBox()
await moveMouse(sb.x + sb.width / 2, sb.y + sb.height / 2, 8)
await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
await sleep(300)
const lockedNow = await page.$eval('.diui-tail form button[type=submit]', b => b.disabled).catch(() => true)
await waitIdle()
const fc = mock().filter(e => e.decision === 'forecast').at(-1)
const forecastShell = (await shells()).find(s => s[2].startsWith('Forecast'))
check('5b. form submission reaches the agent with the values', fc && /"quarters": 6/.test(fc.lastText) && /"scenario": "Optimistic"/.test(fc.lastText), fc?.lastText.slice(0, 120))
check('5c. agent answers with a new UI; submit is locked against resubmission', forecastShell?.[1] === 'ready' && lockedNow, JSON.stringify(forecastShell))
await sleep(400)
await shot('4-form-sent.png')

// 11) Cross-turn in-place patch of the dashboard.
await caption('3b · "Switch the revenue chart to a line chart" → patched in place, state kept')
const DASH_TITLE = 'Quarterly sales (sample data)'
/** Live (bodied) copies of the dashboard and what the newest one shows. */
const dashboards = () => page.evaluate((title) => {
  // Ready copies only: the refused first attempt is an error card with the same title.
  const live = [...document.querySelectorAll('.diui-shell[data-state=ready]')].filter(s => s.querySelector('.diui-shell-body') && s.querySelector('.diui-shell-title')?.textContent === title)
  const s = live.at(-1)
  return {
    live: live.length,
    pointers: [...document.querySelectorAll('.diui-tail .diui-shell')].filter(x => !x.querySelector('.diui-shell-body') && x.querySelector('.diui-shell-title')?.textContent === title).length,
    status: s?.querySelector('.diui-shell-status')?.textContent ?? '',
    tab: s?.querySelector('[role=tab][aria-selected=true]')?.textContent ?? '',
    formLocked: !!s?.querySelector('form button[type=submit]:disabled'),
  }
}, DASH_TITLE)
const callsBeforePatch = mock().length
await send('Switch the revenue chart to a line chart')
await waitIdle()
const patchCalls = mock().slice(callsBeforePatch).map(e => e.decision)
const retry = mock().filter(e => e.decision === 'patch-retry').at(-1)
check('11a. an invalid patch is refused by the Host and the model retries', patchCalls.includes('patch') && /UI not changed[\s\S]*kind: expected one of/.test(retry?.toolResult ?? ''), `${patchCalls.join(' → ')} | ${retry?.toolResult?.slice(0, 160)}`)
const patchedDash = await dashboards()
check('11b. the patched dashboard replaces the old copy (one live copy, old one points to it)', patchedDash.live === 1 && patchedDash.pointers >= 1 && /Version 2|第 2 版/.test(patchedDash.status), JSON.stringify(patchedDash))
check('11c. untouched components keep their state (selected tab, submitted form)', patchedDash.tab === 'Forecast' && patchedDash.formLocked, JSON.stringify(patchedDash))
await tabClick('Revenue')
const lineChart = await page.evaluate((title) => {
  const shell = [...document.querySelectorAll('.diui-tail .diui-shell[data-state=ready]')].find(s => s.querySelector('.diui-shell-body') && s.querySelector('.diui-shell-title')?.textContent === title)
  const svg = shell?.querySelector('.diui-chart-svg')
  return svg && { bars: svg.querySelectorAll('rect[rx="2"]').length, lines: svg.querySelectorAll('path[fill=none]').length, title: svg.closest('.diui-chart')?.textContent.includes('(line)') }
}, DASH_TITLE)
check('11d. the chart changed from bar to line without re-sending the dashboard', lineChart && lineChart.bars === 0 && lineChart.lines >= 2 && lineChart.title, JSON.stringify(lineChart))
await shellShot('4b-dashboard-patched.png', DASH_TITLE)
await tabClick('Regions')
const keptSort = await page.$eval('.diui-tail tbody tr td', td => td.textContent)
check('11e. the table keeps its sort across the patch', keptSort === 'APAC', keptSort)
await tabClick('Forecast')

// 3/4) Three.js sphere with an R slider.
await caption('4 · "Plot x²+y²+z²=2Rz, let me change R" → a live Three.js widget')
const SPHERE_TITLE = 'Sphere x² + y² + z² = 2Rz'
// Observe inside the page before sending: screenshots and driver polling can
// miss the short final phase before the completed turn moves to its reply tail.
await page.evaluate(title => {
  let previewFrame
  const state = { previewSeen: false, finalizedSame: false }
  const isSphere = node => node instanceof HTMLIFrameElement && node.classList.contains('diui-frame') && node.title === title
  const observe = (node, wasPreview = false) => {
    if (!isSphere(node)) return
    if (!previewFrame && (wasPreview || node.dataset.mode === 'preview')) {
      previewFrame = node
      state.previewSeen = true
    }
    if (node === previewFrame && node.dataset.mode === 'final') state.finalizedSame = true
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') observe(record.target, record.attributeName === 'data-mode' && record.oldValue === 'preview')
    }
    document.querySelectorAll('iframe.diui-frame').forEach(node => observe(node))
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mode', 'title'], attributeOldValue: true })
  window.__e2eSphereTransition = { state, stop: () => observer.disconnect() }
}, SPHERE_TITLE)
await send('Plot the surface x²+y²+z²=2Rz in 3D and let me change R with a slider')
const previewSeen = await waitFor(() => page.evaluate(() => window.__e2eSphereTransition.state.previewSeen), 20000, 50)
if (previewSeen) writeFileSync(`${mockLog}.sphere-preview`, 'observed')
if (previewSeen) await shot('5-widget-preview.png')
const sameFrame = await waitFor(() => page.evaluate(() => window.__e2eSphereTransition.state.finalizedSame), 15000, 50)
await page.evaluate(() => { window.__e2eSphereTransition.stop(); delete window.__e2eSphereTransition })
check('4a. widget previews while streaming, then finalizes in the same iframe (no rebuild)', previewSeen && sameFrame, `preview=${previewSeen} final=${sameFrame}`)
await waitIdle()
await sleep(500)
let sphere = await frameByTitle(SPHERE_TITLE)
const ready3d = await waitFor(() => sphere.frame.evaluate(() => !!(window.__mesh && document.querySelector('#stage canvas'))), 30000)
check('4b. Three.js scene renders (WebGL canvas + mesh)', ready3d)
await scrollIntoView(sphere.handle)
await shot('6-widget-final.png')
const callsBeforeSlider = mock().length
const rBox = await sphere.frame.$eval('#r', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
const fBox = await sphere.handle.boundingBox()
// Drag the R slider with the real mouse from 1.0 to about 2.0.
const sx = fBox.x + rBox.x
const sy = fBox.y + rBox.y + rBox.h / 2
const frac = v => (v - 0.2) / (3 - 0.2)
await moveMouse(sx + rBox.w * frac(1), sy, 8)
await page.mouse.down()
for (let i = 1; i <= 12; i++) { await moveMouse(sx + rBox.w * (frac(1) + (frac(2) - frac(1)) * i / 12), sy); await sleep(40) }
await page.mouse.up()
await sleep(300)
// Land exactly on 2.0 for the assertions (slider steps are 0.1).
await sphere.frame.evaluate(() => { const r = document.getElementById('r'); if (r.value !== '2') { r.value = '2'; r.dispatchEvent(new Event('input', { bubbles: true })) } })
await sleep(400)
const s1 = await sphere.frame.evaluate(() => ({ R: document.getElementById('rv').textContent, scale: window.__mesh.scale.x, z: window.__mesh.position.z }))
check('3. R slider re-shapes x²+y²+z²=2Rz instantly in the browser (no model call)', s1.R === '2.0' && s1.scale === 2 && s1.z === 2 && mock().length === callsBeforeSlider, JSON.stringify(s1))
const cam = () => sphere.frame.evaluate(() => { const p = window.__view.camera.position, t = window.__view.controls.target; return { x: p.x, y: p.y, z: p.z, d: p.distanceTo(t) } })
const c0 = await cam()
const stage = await sphere.frame.$eval('#stage', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
const cx = fBox.x + stage.x + stage.w / 2
const cy = fBox.y + stage.y + stage.h / 2
await caption('4 · Drag to rotate, scroll to zoom — handled inside the widget')
await moveMouse(cx - 120, cy, 6)
await page.mouse.down()
for (let i = 1; i <= 20; i++) { await moveMouse(cx - 120 + i * 12, cy - i * 2); await sleep(30) }
await page.mouse.up()
await sleep(600)
const c1 = await cam()
for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(60) }
await sleep(700)
const c2 = await cam()
const rotated = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z) > 0.5
check('4c. Three.js scene rotates (drag) and zooms (wheel)', rotated && c2.d < c1.d - 0.2, `rotate Δ=${Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z).toFixed(2)} distance ${c1.d.toFixed(2)} → ${c2.d.toFixed(2)}`)
await shot('7-widget-rotated.png')
await caption('4 · "Explain this surface" sends the current R back to the agent')
const ask = await sphere.frame.$eval('#ask', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
await moveMouse(fBox.x + ask.x, fBox.y + ask.y, 10)
await page.mouse.click(fBox.x + ask.x, fBox.y + ask.y)
await waitIdle()
const ex = mock().filter(e => e.decision === 'explain-sphere').at(-1)
const answered = await page.evaluate(() => document.body.innerText.includes('sphere of radius 2'))
check('5d. Bridge.sendPrompt round-trip: widget button → agent → answer', ex && /R = 2/.test(ex.lastText) && answered, ex?.lastText)
await sleep(500)
await shot('8-widget-sent.png')

// 6) Several components keep their state.
await caption('5 · More UIs: math formula, live function plot, Mermaid diagram')
await send('Show a damped oscillation with adjustable parameters')
await waitIdle()
const plotOk = await waitFor(() => page.$eval('.diui-tail .diui-plot path', p => p.getAttribute('d').length > 100), 10000)
const mathFrame = await page.$('.diui-tail .diui-lib[data-kind=math] iframe')
const mermaidFrame = await page.$('.diui-tail .diui-lib[data-kind=mermaid] iframe')
const katex = await waitFor(async () => (await mathFrame.contentFrame()).evaluate(() => !!document.querySelector('.katex')), 20000)
const mermaidSvg = await waitFor(async () => (await mermaidFrame.contentFrame()).evaluate(() => !!document.querySelector('#out svg')), 25000)
check('6a. Math (KaTeX) and Mermaid render in sandboxed frames', katex && mermaidSvg, `katex=${!!katex} mermaid=${!!mermaidSvg}`)
await scrollIntoView('.diui-tail .diui-plot')
const omega = await page.evaluateHandle(() => [...document.querySelectorAll('.diui-tail .diui-param')].find(l => l.textContent.includes('ω')).querySelector('input'))
const ob = await omega.asElement().boundingBox()
const d0 = await page.$eval('.diui-tail .diui-plot path', p => p.getAttribute('d'))
await moveMouse(ob.x + ob.width * 0.35, ob.y + ob.height / 2, 6)
await page.mouse.down()
for (let i = 1; i <= 10; i++) { await moveMouse(ob.x + ob.width * (0.35 + i * 0.04), ob.y + ob.height / 2); await sleep(40) }
await page.mouse.up()
await sleep(400)
const d1 = await page.$eval('.diui-tail .diui-plot path', p => p.getAttribute('d'))
check('6b. Plot sliders redraw the curve locally', plotOk && d0 !== d1)
await shellShot('9-math.png', 'Damped oscillator')
sphere = await frameByTitle(SPHERE_TITLE)
const keptR = await sphere.frame.evaluate(() => ({ R: document.getElementById('r').value, scale: window.__mesh?.scale.x }))
const keptTab = await page.evaluate(() => [...document.querySelectorAll('.diui-tail [role=tab][aria-selected=true]')].map(t => t.textContent))
check('6c. earlier widgets/UIs keep their state while new ones arrive', keptR.R === '2' && keptTab.includes('Forecast'), `sphere=${JSON.stringify(keptR)} tabs=${JSON.stringify(keptTab)}`)

// 7) Interrupted generation.
await caption('6 · Stopping mid-generation keeps a static preview and offers to regenerate')
await send('Animate the solar system orbits')
await waitFor(() => page.$('iframe.diui-frame[title="Solar system orbits"][data-mode=preview]'), 20000, 100)
await sleep(1200)
await page.evaluate(() => document.querySelector('button[aria-label="停止生成"], button[aria-label="Stop generating"]')?.click())
await waitIdle()
await sleep(600)
const stopped = await page.evaluate(() => {
  const s = [...document.querySelectorAll('.diui-shell')].find(x => x.querySelector('.diui-shell-title')?.textContent === 'Solar system orbits' && x.querySelector('.diui-shell-body'))
  return s && { state: s.dataset.state, notice: s.querySelector('.diui-shell-notice')?.textContent ?? '', frame: s.querySelector('iframe')?.dataset.mode ?? null, regenerate: !!s.querySelector('.diui-head-button') }
})
check('7a. stopped generation degrades gracefully (static preview + notice + regenerate)', stopped && stopped.state === 'stopped' && stopped.regenerate, JSON.stringify(stopped))
await shot('10-stopped.png')
await page.evaluate(() => [...document.querySelectorAll('.diui-shell')].find(x => x.dataset.state === 'stopped')?.querySelector('.diui-head-button')?.click())
await waitIdle()
const regen = (await shells()).filter(s => s[2] === 'Solar system orbits' && s[1] === 'ready').length
check('7b. regenerate after interruption produces a complete widget', regen >= 1, `ready copies=${regen}`)

// 10) Isolation and message validation.
await caption('7 · Sandbox: no parent/storage/network access; forged messages ignored')
sphere = await frameByTitle(SPHERE_TITLE)
const iso = await sphere.frame.evaluate(async () => {
  const out = {}
  try { void parent.document.title; out.parentDom = 'accessible' } catch (e) { out.parentDom = e.name }
  try { void localStorage.length; out.storage = 'accessible' } catch (e) { out.storage = e.name }
  try { await fetch('https://esm.sh/'); out.fetch = 'allowed' } catch (e) { out.fetch = e.name }
  try { void document.cookie; out.cookie = document.cookie === '' ? 'empty' : 'readable' } catch (e) { out.cookie = e.name }
  out.origin = window.origin
  // Forged RPC without the frame token.
  parent.postMessage({ type: 'rpc', id: 99, method: 'sendPrompt', params: { text: 'FORGED-FROM-FRAME' } }, '*')
  return out
})
await page.evaluate(() => window.postMessage({ __diui: 'guess', type: 'rpc', id: 1, method: 'sendPrompt', params: { text: 'FORGED-FROM-PAGE' } }, '*'))
const sandboxAttr = await sphere.handle.evaluate(e => e.getAttribute('sandbox'))
await sleep(2500)
const forged = mock().some(e => /FORGED/.test(e.lastText))
check('10. iframe isolation and message validation', iso.parentDom === 'SecurityError' && iso.storage === 'SecurityError' && iso.fetch === 'TypeError' && iso.origin === 'null' && !/allow-same-origin/.test(sandboxAttr) && !forged, `${JSON.stringify(iso)} sandbox="${sandboxAttr}" forgedDelivered=${forged}`)

// 9) Dark theme and narrow layout.
await caption('8 · Dark theme and phone width — widgets follow the host theme')
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
// The host re-themes, then forwards the theme to each widget frame: poll for
// both instead of a fixed sleep (a slow macOS runner once measured too early).
const readDark = async () => {
  sphere = await frameByTitle(SPHERE_TITLE)
  const frame = await sphere.frame.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(), scheme: getComputedStyle(document.documentElement).colorScheme }))
  const host = await page.$eval('.diui-tail .diui-shell', e => getComputedStyle(e).backgroundColor)
  return { frame, host }
}
const isDark = ({ frame, host }) => frame.theme === 'dark' && frame.scheme === 'dark' && /^#1|rgb\(\s*[0-4]\d,/.test(frame.bg + host)
const dark = (await waitFor(async () => { const d = await readDark(); return isDark(d) && d }, 15000, 200)) || await readDark()
const { frame: darkFrame, host: darkHost } = dark
check('9a. dark theme reaches host cards and sandboxed widgets', isDark(dark), `${JSON.stringify(darkFrame)} host=${darkHost}`)
await scrollIntoView(sphere.handle)
await shot('11-dark.png')
await shellShot('11b-dark-dashboard.png', 'Quarterly sales (sample data)')
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
// Changing mobile/touch emulation reloads the page. Wait for the restored
// dashboard instead of measuring before DSH has replayed the session.
await waitFor(() => page.$('.diui-tail .diui-grid'), 30000)
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const overflow = await page.evaluate(() => [...document.querySelectorAll('.diui-shell')].filter(s => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().right > innerWidth + 1).length)
const gridCols = await page.$eval('.diui-tail .diui-grid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length).catch(() => -1)
check('9b. phone width: no horizontal overflow; KPI grid reflows', overflow === 0 && gridCols > 0 && gridCols <= 2, `overflowing=${overflow} kpiColumns=${gridCols}`)
await scrollIntoView('.diui-tail .diui-grid')
await shot('12-mobile-dark.png')
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
await scrollIntoView('.diui-tail .diui-grid')
await sleep(800)
await shot('13-mobile-light.png')
await page.setViewport({ width: 1280, height: 860 })
await sleep(800)

// 8) Reload: everything rebuilds from the session log + persisted UI state.
await caption('9 · Reload: UIs rebuild from the session log with their state')
await page.reload({ waitUntil: 'networkidle2' })
await sleep(3500)
const after = await shells()
sphere = await frameByTitle(SPHERE_TITLE)
const ready3dAfter = await waitFor(() => sphere.frame.evaluate(() => !!window.__mesh), 30000)
const restored = await sphere.frame.evaluate(() => ({ R: document.getElementById('r').value, scale: window.__mesh?.scale.x }))
const restoredUi = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.diui-tail [role=tab][aria-selected=true]')].map(t => t.textContent),
  formLocked: [...document.querySelectorAll('.diui-tail form button[type=submit]')].some(b => b.disabled),
  stopped: [...document.querySelectorAll('.diui-shell[data-state=stopped]')].length,
}))
check('8. reload restores UIs and their interaction state', ready3dAfter && restored.R === '2' && restored.scale === 2 && restoredUi.tabs.includes('Forecast') && restoredUi.formLocked && restoredUi.stopped === 1,
  `shells=${after.length} sphere=${JSON.stringify(restored)} ui=${JSON.stringify(restoredUi)}`)
const dashAfterReload = await dashboards()
check('11f. reload rebuilds the latest patched version only', dashAfterReload.live === 1 && /Version 2|第 2 版/.test(dashAfterReload.status) && dashAfterReload.tab === 'Forecast', JSON.stringify(dashAfterReload))
await scrollIntoView(sphere.handle)
await shot('14-reload.png')
// A native Button creates a fresh conversation and starts it without using the composer again.
await send('E2E show session launcher')
await waitIdle()
const launcher = await waitFor(async () => (await page.evaluateHandle(() =>
  [...document.querySelectorAll('.diui-tail .diui-button')].find(button =>
    button.textContent === 'Start independent Agent' && !button.disabled))).asElement(), 15000)
if (launcher) {
  await launcher.evaluate(button => { button.click(); button.click() })
  const navigated = await waitFor(() => page.evaluate(() =>
    document.body.innerText.includes('Independent Agent started automatically.') &&
    !document.body.innerText.includes('Start independent Agent')), 20000)
  const tasks = mock().filter(e => e.sessionTask)
  check('12. native Button starts one independent Agent and navigates without copied history',
    navigated && tasks.length === 1 && tasks[0].userMessageCount === 1, JSON.stringify(tasks))
} else {
  check('12. native Button starts one independent Agent and navigates without copied history', false, 'launcher unavailable')
}
await shot('15-new-session.png')
await caption('All checks done')
await sleep(1200)

await stopRecording()
const relevantErrors = pageErrors.filter(e => /diui|intelligent|ui_render/i.test(e))
check('no plugin errors in the page console', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' | '))
const report = { at: new Date().toISOString(), url: url.replace(/token=[^&]+/, 'token=…'), model: 'scripted mock (scripts/e2e/mock-deepseek.mjs)', results, pageErrors: pageErrors.slice(0, 30), decisions: mock().map(e => e.decision), frames: frames.length }
writeFileSync(path.join(outDir, 'e2e-report.json'), JSON.stringify(report, null, 2))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exitCode = failed.length ? 1 : 0
} catch (error) {
  await shot('failure.png').catch(() => {})
  const diagnostics = { pageErrors, requestFailures, results }
  writeFileSync(path.join(outDir, 'failure.json'), JSON.stringify(diagnostics, null, 2))
  console.error('Browser failure diagnostics:', JSON.stringify(diagnostics))
  throw error
} finally {
  await browser.close()
}
