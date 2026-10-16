// Browser stage of the real-model evaluation: the real DeepSeek model inside a
// real DSH Web with this plugin installed into a throwaway DSH home, driven in
// Chrome. Unlike scripts/e2e (scripted answers), every UI here is whatever the
// model produced, so checks are about behaviour the user would see: does it
// render, respond, survive stop/resume and network trouble, and stay free of
// console errors. Each case starts a new conversation.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer-core'
import { DSH, capture, findChrome, freePorts, installPlugin, kill, startDshWeb } from '../e2e/dsh-web.mjs'
import { getApiKey } from '../test-real-model.mjs'
import { imageDiff, imageStats } from './png.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PORT = Number(process.env.E2E_REAL_WEB_PORT || 3281)
const STOP = 'button[aria-label="停止生成"], button[aria-label="Stop generating"]'
const CDN = ['esm.sh', 'cdn.jsdelivr.net', 'unpkg.com']
const TURN_TIMEOUT = 300000
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitFor(fn, timeout = 15000, every = 150) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch { /* not yet */ }
    await sleep(every)
  }
  return undefined
}

/** Screencast with caption, cursor and "sped up" marks for scripts/eval/edit-demo.mjs. */
class Recorder {
  constructor(page, dir, enabled) {
    Object.assign(this, { page, dir, enabled, frames: [], marks: [], cdp: undefined })
  }
  async start() {
    if (!this.enabled) return
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
    this.cdp = await this.page.target().createCDPSession()
    this.cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
      const file = `f${String(this.frames.length).padStart(5, '0')}.jpg`
      this.frames.push({ file, t: metadata.timestamp })
      writeFileSync(path.join(this.dir, file), Buffer.from(data, 'base64'))
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId }) } catch { /* closing */ }
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 })
  }
  async stop() {
    if (!this.cdp) return
    try { await this.cdp.send('Page.stopScreencast') } catch { /* closed */ }
    writeFileSync(path.join(this.dir, 'timeline.json'), JSON.stringify({ frames: this.frames, marks: this.marks }, null, 1))
  }
  mark(kind, label = '') { if (this.enabled) this.marks.push({ t: Date.now() / 1000, kind, label }) }
  async caption(text, sub = '') {
    if (!this.enabled) return
    this.mark('chapter', text)
    await this.page.evaluate((t, s) => {
      let el = document.getElementById('eval-caption')
      if (!el) {
        el = document.createElement('div')
        el.id = 'eval-caption'
        el.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;background:linear-gradient(135deg,rgba(17,24,39,.92),rgba(30,41,82,.92));color:#fff;font:600 15px/1.35 system-ui,"Microsoft YaHei",sans-serif;padding:8px 18px;border-radius:14px;pointer-events:none;box-shadow:0 8px 28px rgba(0,0,0,.28);max-width:86vw;text-align:center;letter-spacing:.2px'
        document.body.appendChild(el)
      }
      el.innerHTML = ''
      el.append(t)
      if (s) { const sm = document.createElement('div'); sm.style.cssText = 'font-weight:500;font-size:12px;opacity:.75;margin-top:2px'; sm.textContent = s; el.append(sm) }
    }, text, sub)
  }
  /** A live real-time stopwatch while the model works; the editor speeds these spans up. */
  async waiting(on) {
    if (!this.enabled) return
    this.mark(on ? 'fast' : 'normal')
    await this.page.evaluate((on) => {
      let el = document.getElementById('eval-wait')
      if (!on) { if (el) { clearInterval(el._iv); el.remove() } return }
      el = document.createElement('div')
      el.id = 'eval-wait'
      el.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;background:rgba(17,24,39,.88);color:#fff;font:600 13px/1.2 ui-monospace,Consolas,monospace;padding:8px 12px;border-radius:10px;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.25)'
      const t0 = performance.now()
      const tick = () => { el.textContent = `⏩ 模型生成中 · 真实耗时 ${((performance.now() - t0) / 1000).toFixed(1)} s` }
      tick()
      el._iv = setInterval(tick, 100)
      document.body.appendChild(el)
    }, on)
  }
  async cursor(x, y) {
    if (!this.enabled) return
    await this.page.evaluate((x, y) => {
      let el = document.getElementById('eval-cursor')
      if (!el) {
        el = document.createElement('div')
        el.id = 'eval-cursor'
        el.style.cssText = 'position:fixed;z-index:99999;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:rgba(77,107,254,.30);border:2px solid #4d6bfe;pointer-events:none;transition:left .06s,top .06s'
        document.body.appendChild(el)
      }
      el.style.left = x + 'px'
      el.style.top = y + 'px'
    }, x, y)
  }
}

/** Everything a case needs; one instance per run. */
class Session {
  constructor(page, rec, shots) {
    Object.assign(this, { page, rec, shots, errors: [] })
    // Widgets run in same-process srcdoc iframes, so Puppeteer reports their
    // errors as the page's too. Tag them: widget errors are judged by the
    // widget checks (the card shows them); host errors are counted in-page.
    page.on('pageerror', e => this.errors.push(`pageerror: ${e.message.slice(0, 300)}`))
    page.on('console', m => {
      if (m.type() !== 'error') return
      const widget = /^about:srcdoc|^blob:|^data:/.test(m.location()?.url ?? '')
      this.errors.push(`${widget ? 'widget ' : ''}console.error: ${m.text().slice(0, 300)}`)
    })
  }

  /** Record uncaught errors of the DSH page itself (not of widget frames). Call before navigating. */
  probeHostErrors() {
    return this.page.evaluateOnNewDocument(() => {
      if (window.top !== window) return
      window.__hostErrors = []
      addEventListener('error', e => window.__hostErrors.push(String(e.message).slice(0, 300)))
      addEventListener('unhandledrejection', e => window.__hostErrors.push(String(e.reason?.message ?? e.reason).slice(0, 300)))
    })
  }
  hostErrors() {
    return this.page.evaluate(() => window.__hostErrors?.slice() ?? [])
  }

  async move(x, y, steps = 8) {
    await this.page.mouse.move(x, y, { steps })
    await this.rec.cursor(x, y)
  }
  async click(handle) {
    await handle.evaluate(e => e.scrollIntoView({ block: 'center' }))
    await sleep(200)
    const b = await handle.boundingBox()
    await this.move(b.x + b.width / 2, b.y + b.height / 2)
    await this.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  }

  async dismissNotice() {
    for (let i = 0; i < 40; i++) {
      const state = await this.page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^(继续|Continue)$/.test(x.textContent.trim()))
        if (!b) return 'none'
        if (b.disabled || b.getAttribute('aria-disabled') === 'true') return 'disabled'
        b.click()
        return 'clicked'
      })
      if (state === 'none' && i > 0) return
      await sleep(500)
    }
  }

  /** Start a new conversation and prove it: no cards and the previous prompt gone from view. */
  async newConversation() {
    // The button's text also carries its shortcut hint ("新会话 Ctrl+Alt+N").
    const button = await this.page.evaluateHandle(() => [...document.querySelectorAll('button, a')].find(b => /^(新会话|New chat|New session)/.test(b.textContent.trim())))
    // At phone width the sidebar (and its button) is collapsed: use DSH's shortcut.
    if (await button.asElement()?.isVisible()) await this.click(button.asElement())
    else {
      await this.page.keyboard.down('Control'); await this.page.keyboard.down('Alt')
      await this.page.keyboard.press('KeyN')
      await this.page.keyboard.up('Alt'); await this.page.keyboard.up('Control')
    }
    const previous = this.lastPrompt?.slice(0, 24)
    const fresh = await waitFor(() => this.page.evaluate(p => !document.querySelector('.diui-shell') && !(p && document.body.innerText.includes(p)), previous), 15000)
    if (!fresh) throw new Error('could not start a new conversation')
    await sleep(600)
  }

  busy() { return this.page.evaluate(sel => !!document.querySelector(sel), STOP) }

  /**
   * Send a prompt and measure the turn in the page itself:
   * firstPreview — first UI card with content; streamDone — last moment a card
   * stopped generating; idle — the turn finished. Optionally wait for `ready`
   * (what "rendered" means for this case) to time browser-side execution.
   * `trigger` replaces typing `text` when a click starts the turn (form submit, regenerate).
   */
  async ask(text, { ready, interrupt, trigger } = {}) {
    if (text) this.lastPrompt = text
    const runFailures = () => this.page.evaluate(() => (document.body.innerText.match(/本轮运行失败|Run failed/g) || []).length)
    const failuresBefore = await runFailures()
    let infraError
    await this.page.evaluate(() => {
      const st = { t0: performance.now(), firstPreview: null, streamDone: null, idle: null, sawBusy: false, sawGenerating: false }
      const tick = () => {
        const now = performance.now()
        const live = [...document.querySelectorAll('.diui-shell')].filter(s => s.querySelector('.diui-shell-body'))
        const generating = live.some(s => s.dataset.state === 'generating')
        if (generating) {
          st.sawGenerating = true
          if (st.firstPreview === null) st.firstPreview = now
          st.streamDone = null
        } else if (st.sawGenerating && st.streamDone === null) st.streamDone = now
        const busy = !!document.querySelector('button[aria-label="停止生成"], button[aria-label="Stop generating"]')
        if (busy) { st.sawBusy = true; st.idle = null } else if (st.sawBusy && st.idle === null) st.idle = now
      }
      const observer = new MutationObserver(tick)
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'aria-label'] })
      const iv = setInterval(tick, 50)
      window.__evalTurn = { st, stop: () => { observer.disconnect(); clearInterval(iv); tick() } }
    })
    if (trigger) await trigger()
    else {
      const box = await this.page.waitForSelector('textarea, [contenteditable="true"]', { timeout: 15000 })
      await this.click(box)
      await this.page.keyboard.type(text, { delay: this.rec.enabled ? 22 : 0 })
      await sleep(this.rec.enabled ? 350 : 50)
      await this.page.keyboard.press('Enter')
    }
    await this.rec.waiting(true)
    // Poll `ready` from the start: native components render while streaming,
    // widgets only after the code arrives. Either way, the first moment counts.
    let readyAt = null
    let polling = !!ready
    const readyPoll = (async () => {
      while (polling) {
        try { if (await ready()) { readyAt = await this.page.evaluate(() => performance.now()); return } } catch { /* not yet */ }
        await sleep(100)
      }
    })()
    if (interrupt) await interrupt()
    const end = Date.now() + TURN_TIMEOUT
    let idle = false
    const clarifications = []
    let idleSince = Date.now()
    await sleep(1200)
    while (Date.now() < end) {
      // Idle is not done: DSH's agent may end a turn while its sub-agents still
      // research and render later. With a `ready` condition, wait for both.
      const quiet = await this.page.evaluate(() => window.__evalTurn.st.idle !== null || (!window.__evalTurn.st.sawBusy && performance.now() - window.__evalTurn.st.t0 > 15000))
      if (quiet && (!ready || readyAt !== null)) { idle = true; break }
      if (quiet && ready && Date.now() > idleSince + 240000) { idle = true; break }
      if (!quiet) idleSince = Date.now()
      // DSH reports a failed run (quota, auth, upstream error) in the turn: not a model result.
      if (await runFailures() > failuresBefore) {
        infraError = await this.page.evaluate(() => document.body.innerText.split(/\n/).filter(l => /本轮运行失败|Run failed|QUOTA|额度|HTTP \d{3}/i.test(l)).slice(-3).join(' · ').slice(0, 200))
        break
      }
      const asked = await this.answerClarification()
      if (asked) clarifications.push(asked)
      await sleep(250)
    }
    polling = false
    await readyPoll
    await this.rec.waiting(false)
    const st = await this.page.evaluate(() => { window.__evalTurn.stop(); return window.__evalTurn.st })
    const rel = v => (v === null || v === undefined ? undefined : Math.round(v - st.t0))
    const streamDone = st.streamDone ?? (st.sawGenerating ? st.idle : null)
    return {
      idle,
      timing: {
        firstPreviewMs: rel(st.firstPreview),
        generationMs: rel(streamDone),
        turnMs: rel(st.idle),
        browserExecMs: readyAt !== null && streamDone !== null ? Math.max(0, Math.round(readyAt - streamDone)) : undefined,
      },
      rendered: ready ? readyAt !== null : undefined,
      infraError,
      clarifications,
      subagents: await this.page.evaluate(() => Number(document.body.innerText.match(/(\d+)\s*个子智能体|(\d+)\s*sub-?agents?/i)?.slice(1).find(Boolean) ?? 0)),
    }
  }

  /**
   * DSH's agent may stop to ask the user a question (e.g. "no data in the
   * workspace: use sample data?"), which blocks the turn. Answer it the way a
   * user wanting the requested UI would, and report that it happened.
   * @returns {Promise<string | undefined>} the question text when one was answered.
   */
  async answerClarification() {
    // The question panel: the element holding both "skip" and "next"/"submit" buttons.
    const findPanel = () => this.page.evaluateHandle(() => {
      const label = b => b.textContent.trim()
      const skip = [...document.querySelectorAll('button')].find(b => /^(跳过|Skip)$/.test(label(b)))
      let el = skip
      while (el && ![...el.querySelectorAll('button')].some(b => /^(提交|Submit|下一题|Next)$/.test(label(b)))) el = el.parentElement
      return el ?? null
    })
    let panel = await findPanel()
    if (!panel.asElement()) return undefined
    const question = (await panel.evaluate(e => e.innerText)).split(/\n/).find(l => /[？?]/.test(l))?.trim().slice(0, 160) ?? 'clarifying question'
    await this.rec.caption('模型先反问：没有现成数据', '评测按真实用户的方式作答：每题选推荐项 ①')
    for (let page = 0; page < 8 && panel.asElement(); page++) {
      // Option rows carry a number badge; ① is the one the model recommends.
      const first = await panel.evaluateHandle(p => [...p.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === '1')?.parentElement ?? null)
      if (first.asElement()) await this.click(first.asElement())
      else {
        const box = await panel.evaluateHandle(p => p.querySelector('textarea, input[type=text], [contenteditable=true]'))
        if (box.asElement()) {
          await this.click(box.asElement())
          await this.page.keyboard.type('用示意数据即可，并标注为示意。', { delay: this.rec.enabled ? 30 : 0 })
        }
      }
      await sleep(this.rec.enabled ? 600 : 250)
      const next = await panel.evaluateHandle(p => {
        const buttons = [...p.querySelectorAll('button')].filter(b => !b.disabled)
        return buttons.find(b => /^(提交|Submit|下一题|Next)$/.test(b.textContent.trim())) ?? buttons.find(b => /^(跳过|Skip)$/.test(b.textContent.trim())) ?? null
      })
      if (!next.asElement()) break
      await this.click(next.asElement())
      await sleep(this.rec.enabled ? 900 : 500)
      panel = await findPanel()
    }
    return question
  }

  /**
   * The newest card with content (pointer cards have none) that contains
   * `selector`: a turn may render several cards, e.g. a chart and a data form.
   */
  latest(selector = '*') {
    return this.page.evaluateHandle(sel => [...document.querySelectorAll('.diui-shell')].filter(s => s.querySelector('.diui-shell-body') && s.querySelector(`.diui-shell-body ${sel}`)).at(-1) ?? null, selector)
  }
  /**
   * Evaluate over all cards of this conversation (each case starts a new one).
   * Card content only exists inside card bodies, so the document is the scope.
   */
  inCards(fn, ...args) {
    return this.page.$eval('body', fn, ...args)
  }
  async frame() {
    const h = await this.latest('iframe.diui-frame')
    const el = h.asElement() && await h.asElement().$('iframe.diui-frame')
    return el ? { handle: el, frame: await el.contentFrame() } : undefined
  }
  async shot(name, { card = false } = {}) {
    const file = path.join(this.shots, name)
    if (card) {
      const h = await this.latest(typeof card === 'string' ? card : '*')
      const el = h.asElement()
      if (el) {
        await el.evaluate(e => e.scrollIntoView({ block: 'start' }))
        // Hide DSH's fixed composer and the recording overlays so they do not cover the card.
        await this.page.evaluate(() => {
          for (const x of document.querySelectorAll('body *')) {
            if (x.closest('.diui-shell')) continue
            const pos = getComputedStyle(x).position
            if (pos === 'fixed' || pos === 'sticky') { x.dataset.evalHidden = x.style.visibility; x.style.visibility = 'hidden' }
          }
        })
        await sleep(400)
        const vp = this.page.viewport()
        // DSH scrolls the chat in its own container, which never paints beyond
        // the viewport: grow the viewport to fit a tall card, then restore it.
        const tall = await el.evaluate(e => e.getBoundingClientRect().height)
        if (!vp.isMobile && tall + 60 > vp.height) {
          await this.page.setViewport({ ...vp, height: Math.min(2400, Math.ceil(tall) + 120) })
          await el.evaluate(e => e.scrollIntoView({ block: 'start' }))
          await sleep(500)
        }
        const b = await el.boundingBox()
        try {
          await this.page.screenshot({ path: file, clip: { x: Math.max(0, b.x - 14), y: Math.max(0, b.y - 14), width: Math.min(vp.width - Math.max(0, b.x - 14), b.width + 28), height: Math.min(2400, b.height + 28) } })
        } finally {
          if (this.page.viewport().height !== vp.height) await this.page.setViewport(vp)
          await this.page.evaluate(() => document.querySelectorAll('[data-eval-hidden]').forEach(x => { x.style.visibility = x.dataset.evalHidden; delete x.dataset.evalHidden }))
        }
        return file
      }
    }
    await this.page.screenshot({ path: file })
    return file
  }
  async frameStats() {
    // A finished turn moves its card to the reply tail, which remounts the
    // iframe: wait for the (re)built document's canvas before measuring.
    const f = await waitFor(async () => { const x = await this.frame(); return x && await x.frame.$('canvas') ? x : undefined }, 20000, 200) ?? await this.frame()
    if (!f) return undefined
    const stage = await f.frame.$('canvas') || f.handle
    await stage.evaluate(e => e.scrollIntoView({ block: 'center' }))
    await sleep(300)
    return { buf: await stage.screenshot({ type: 'png' }), handle: stage }
  }
}

const check = (name, ok, detail = '', informational = false) => ({ name, ok: !!ok, ...(detail ? { detail: String(detail).slice(0, 300) } : {}), ...(informational ? { informational: true } : {}) })
/** Console errors from the host page that name the plugin (widget-frame output excluded). */
const pluginErrors = errs => errs.filter(e => e.startsWith('console.error') && /diui|intelligent|ui_render|ui_patch/i.test(e))

/** Shared checks for a widget that should draw a Three.js scene. */
async function threeChecks(s, label) {
  const shot = await s.frameStats()
  const stats = shot && imageStats(shot.buf)
  const scriptErrors = await s.inCards(e => e.querySelector('.diui-error-count')?.getAttribute('title') ?? '')
  const out = [
    check(`${label}: widget finalized with a WebGL canvas`, !!shot && (await shot.handle.evaluate(e => e.tagName)) === 'CANVAS'),
    check(`${label}: canvas is drawn, not blank`, stats && stats.stddev > 4 && stats.colors > 12, stats && `luminance σ=${stats.stddev}, colours=${stats.colors}`),
    check(`${label}: no widget script errors`, !scriptErrors, scriptErrors),
  ]
  return { checks: out, shot, stats }
}

/**
 * After a widget script error, take the user's recovery path: the card's
 * "Ask to fix" button sends the errors to the model. Informational: the case
 * already failed, this records whether the product recovers.
 */
async function tryRepair(s, label) {
  const fix = await s.page.evaluateHandle(() => [...document.querySelectorAll('.diui-shell .diui-head-button')].filter(b => /^(让模型修复|Ask to fix)$/.test(b.textContent.trim())).at(-1) ?? null)
  if (!fix.asElement()) return []
  await s.rec.caption('脚本出错 → 点击「让模型修复」', '错误信息回传给模型，由模型重新生成')
  // The fix may replace the widget in place or add a new card: either way the
  // newest scene must draw without script errors. Only count it once the turn ran.
  let started = false
  const turn = await s.ask(null, {
    trigger: async () => { await s.click(fix.asElement()); await waitFor(() => s.busy(), 10000, 100); started = true },
    ready: async () => started && !(await s.busy()) && (await threeChecks(s, 'x')).checks.every(c => c.ok),
  })
  return [check(`${label}: "Ask to fix" produced a working scene`, turn.rendered, `repair turn ${turn.timing.turnMs ?? '–'} ms`, true)]
}

/** Drag across the canvas and compare: an orbit-controlled scene must change. */
async function dragChanges(s, shot) {
  const b = await shot.handle.boundingBox()
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  await s.move(cx - 110, cy, 6)
  await s.page.mouse.down()
  for (let i = 1; i <= 18; i++) { await s.move(cx - 110 + i * 12, cy - i * 3, 1); await sleep(30) }
  await s.page.mouse.up()
  await sleep(700)
  const after = await shot.handle.screenshot({ type: 'png' })
  return imageDiff(shot.buf, after)
}

export const BROWSER_SCENARIOS = [
  {
    id: 'R-text', category: 'text', title: 'Plain question stays text',
    caption: ['① 纯文本问题', '不应触发任何 UI'],
    async run(s) {
      const before = await s.page.$$eval('.diui-shell', x => x.length)
      const turn = await s.ask('牛顿第三定律的内容是什么？请简要回答。')
      const after = await s.page.$$eval('.diui-shell', x => x.length)
      const answered = await s.page.evaluate(() => /作用力|反作用力/.test(document.body.innerText))
      return { turn, checks: [check('answered in text', answered), check('no UI card was created', after === before, `cards ${before} → ${after}`)] }
    },
  },
  {
    id: 'R-chart', category: 'chart-table', title: 'Multi-series bar chart',
    caption: ['② 多系列柱状图', '真实模型选择 ui_render 原生图表'],
    async run(s) {
      const turn = await s.ask('对比分析过去四个季度（Q1-Q4）中，线上电商与线下门店在营收上的多系列对比柱状图。',
        { ready: () => s.inCards(e => !!e.querySelector('.diui-chart-svg')) })
      const chart = await s.inCards(e => {
        const svg = e.querySelector('.diui-chart-svg')
        return svg && {
          bars: svg.querySelectorAll('rect:not(.diui-hover-band)').length,
          legend: [...e.querySelectorAll('.diui-legend-item')].map(l => l.textContent.trim()),
          ticks: [...svg.querySelectorAll('.diui-tick')].map(t => t.textContent.trim()),
        }
      })
      const checks = [
        check('a chart rendered', !!chart),
        check('two or more series in the legend (online + offline)', chart && chart.legend.length >= 2 && chart.legend.some(l => /线上|电商/.test(l)) && chart.legend.some(l => /线下|门店/.test(l)), chart && chart.legend.join(', ')),
        check('Q1-Q4 on the x axis', chart && ['Q1', 'Q2', 'Q3', 'Q4'].every(q => chart.ticks.some(t => t.includes(q))), chart && chart.ticks.join(' ')),
        check('at least 8 bars (4 quarters × 2 series)', chart && chart.bars >= 8, chart && `${chart.bars} bars`),
      ]
      if (chart) {
        const bar = await (await s.latest('.diui-chart-svg')).asElement()?.$('.diui-chart-svg rect:not(.diui-hover-band)')
        if (bar) {
          await bar.evaluate(e => e.scrollIntoView({ block: 'center' }))
          const b = await bar.boundingBox()
          await s.move(b.x + b.width / 2, b.y + b.height / 2)
          await sleep(500)
          const tip = await s.inCards(e => e.querySelector('.diui-tooltip')?.textContent ?? '')
          checks.push(check('hover shows a tooltip (local, no model call)', !!tip && !(await s.busy()), tip))
        }
      }
      return { turn, checks, screenshot: await s.shot('chart.png', { card: '.diui-chart-svg' }) }
    },
  },
  {
    id: 'R-table', category: 'chart-table', title: 'Sortable comparison table',
    caption: ['③ 可排序数据表', '点击表头在浏览器本地排序'],
    async run(s) {
      const turn = await s.ask('请列出一份主流新能源汽车关键性能指标的对比表（包含车型、续航里程、零百加速、售价、电池容量），要求可以按列排序。',
        { ready: () => s.inCards(e => e.querySelectorAll('.diui-table tbody tr').length > 0) })
      const rows = () => s.inCards(e => [...e.querySelectorAll('.diui-table tbody tr')].map(r => r.textContent))
      const before = await rows()
      const header = await (await s.latest('.diui-table')).asElement()?.$$('.diui-table th button')
      const checks = [check('table rendered with 3+ rows', before?.length >= 3, `${before?.length ?? 0} rows`), check('columns are sortable', header?.length >= 2)]
      if (header?.length >= 2) {
        await s.click(header[1])
        await sleep(400)
        await s.click(header[1])
        await sleep(500)
        const after = await rows()
        checks.push(check('clicking a header re-orders rows locally', JSON.stringify(after) !== JSON.stringify(before) && !(await s.busy())))
      }
      return { turn, checks, screenshot: await s.shot('table.png', { card: '.diui-table' }) }
    },
  },
  {
    id: 'R-form', category: 'form', title: 'Form submit → agent follow-up',
    caption: ['④ 表单交互回传', '填写并提交 → 模型基于提交值继续回答'],
    async run(s) {
      const turn = await s.ask('请帮我生成一个销售预测配置表单，包含预测区域、预测季度数、预测情景（乐观/基准/保守）。',
        { ready: () => s.inCards(e => !!e.querySelector('form.diui-form button[type=submit]:not([disabled])')) })
      const form = await (await s.latest('form.diui-form')).asElement()?.$('form.diui-form')
      if (!form) return { turn, checks: [check('form rendered', false)] }
      const fields = await form.$$('.diui-field')
      const submitted = {}
      for (const field of fields) {
        const label = await field.$eval('.diui-field-label', e => e.textContent)
        const type = await field.evaluate(e => e.dataset.type)
        const select = await field.$('select')
        if (select) {
          const options = await select.$$eval('option:not([disabled])', o => o.map(x => x.value))
          const want = /情景|场景|scenario/i.test(label) ? options.find(o => /乐观|optimistic/i.test(o))
            : /区域|地区|region/i.test(label) ? options.find(o => /apac|亚太/i.test(o)) ?? options[0]
              : /季度|quarter/i.test(label) ? options.find(o => /^\D*4\D*$|四/.test(o)) ?? options[0]
                : options[0]
          await s.click(select)
          await s.page.keyboard.press('Escape')
          await select.select(want)
          submitted[label] = want
        } else if (type === 'range') {
          const input = await field.$('input[type=range]')
          await s.click(input)
          // React tracks the native value setter; the event makes it re-render.
          const v = await input.evaluate((e, quarters) => {
            const min = Number(e.min || 0), max = Number(e.max || 100)
            const value = quarters && min <= 4 && 4 <= max ? 4 : Math.round((min + max) / 2)
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, String(value))
            e.dispatchEvent(new Event('input', { bubbles: true }))
            return String(value)
          }, /季度|quarter/i.test(label))
          submitted[label] = v
        } else if (type === 'number' || type === 'text' || type === 'textarea') {
          const input = await field.$('input, textarea')
          const v = /季度|quarter/i.test(label) ? '4' : type === 'number' ? '100' : '示例'
          await s.click(input)
          await input.evaluate(e => { e.select?.() })
          await s.page.keyboard.type(v, { delay: s.rec.enabled ? 60 : 0 })
          submitted[label] = v
        }
        await sleep(s.rec.enabled ? 250 : 0)
      }
      const region = Object.entries(submitted).find(([l]) => /区域|地区|region/i.test(l))?.[1]
      const scenario = Object.entries(submitted).find(([l]) => /情景|场景|scenario/i.test(l))?.[1]
      const checks = [check('form has region, quarter count and scenario fields', region && scenario && Object.keys(submitted).some(l => /季度|quarter/i.test(l)), JSON.stringify(submitted))]
      const pageText = () => s.page.evaluate(() => document.body.innerText)
      const count = (text, word) => (word ? text.split(word).length - 1 : 0)
      const before = await pageText()
      await s.rec.caption('④ 表单交互回传', `已填写：${Object.values(submitted).join(' / ')} → 提交`)
      const button = await form.$('button[type=submit]')
      // Submitting the form *is* the next user turn: measure it like a prompt.
      const second = await s.ask(null, { trigger: () => s.click(button) })
      const after = await pageText()
      const locked = await button.evaluate(b => b.disabled)
      // New mentions: one in the submission bubble, at least one more in the agent's reply or new UI.
      const added = { region: count(after, region) - count(before, region), scenario: count(after, scenario) - count(before, scenario) }
      checks.push(
        // The click must start an agent turn (a Form's own `prompt` replaces the "submitted" heading).
        check('submission reached the agent as a new turn', second.idle && second.timing.turnMs !== undefined, `turn ${second.timing.turnMs ?? 'not started'} ms`),
        check('follow-up uses the submitted region and scenario', added.region >= 2 && added.scenario >= 2, `new mentions ${JSON.stringify(added)} (${region} / ${scenario})`),
        check('submitted form locks against resubmission', locked),
      )
      return { turn, extraTurns: [second], checks, screenshot: await s.shot('form-followup.png') }
    },
  },
  {
    id: 'R-plot', category: 'math-plot', title: 'Function plot with sliders',
    caption: ['⑤ 数学函数 Plot', '拖动参数滑块，曲线在浏览器内实时重绘'],
    async run(s) {
      const turn = await s.ask('画一个阻尼振动函数曲线，提供振幅、阻尼系数和角频率的滑动条，让我滑动控制曲线实时变化。',
        { ready: () => s.inCards(e => (e.querySelector('.diui-plot path')?.getAttribute('d')?.length ?? 0) > 50 || !!e.querySelector('iframe.diui-frame[data-mode=final]')) })
      const native = await s.inCards(e => !!e.querySelector('.diui-plot'))
      const checks = []
      if (native) {
        const sliders = await (await s.latest('.diui-plot')).asElement().$$('.diui-param input[type=range]')
        checks.push(check('three parameter sliders', sliders.length >= 3, `${sliders.length} sliders`))
        const d0 = await s.inCards(e => e.querySelector('.diui-plot path').getAttribute('d'))
        if (sliders.length) {
          await sliders.at(-1).evaluate(e => e.scrollIntoView({ block: 'center' }))
          const bb = await sliders.at(-1).boundingBox()
          await s.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2)
          await s.page.mouse.down()
          for (let i = 1; i <= 12; i++) { await s.move(bb.x + bb.width * (0.3 + i * 0.04), bb.y + bb.height / 2, 1); await sleep(40) }
          await s.page.mouse.up()
          await sleep(400)
        }
        const d1 = await s.inCards(e => e.querySelector('.diui-plot path').getAttribute('d'))
        checks.push(check('dragging a slider redraws the curve without a model call', d0 !== d1 && !(await s.busy())))
      } else {
        const f = await s.frame()
        const ranges = f ? await f.frame.$$eval('input[type=range]', x => x.length) : 0
        checks.push(check('widget with three sliders', ranges >= 3, `${ranges} sliders`))
      }
      return { turn, checks, screenshot: await s.shot('plot.png', { card: '.diui-plot, .diui-shell-body iframe.diui-frame' }) }
    },
  },
  {
    id: 'R-three', category: 'threejs', title: 'Three.js 3D surface',
    caption: ['⑥ Three.js 3D 曲面', '沙箱 iframe 中渲染 WebGL，拖拽旋转'],
    async run(s) {
      const turn = await s.ask('请用交互式 3D 形式展示三维球面 x²+y²+z²=2Rz，让我可以旋转缩放观察。',
        { ready: async () => { const f = await s.frame(); return f && f.frame.evaluate(() => !!document.querySelector('canvas')) } })
      const { checks, shot } = await threeChecks(s, '3D sphere')
      const screenshot = await s.shot('three.png', { card: 'iframe.diui-frame' })
      const drawn = checks.every(c => c.ok)
      if (shot && drawn) {
        const diff = await dragChanges(s, shot)
        checks.push(check('dragging rotates the view (pixels change)', diff > 1, `mean Δ=${diff}`))
      }
      const screenshots = []
      if (!drawn) {
        checks.push(...await tryRepair(s, '3D sphere'))
        screenshots.push(await s.shot('three-repaired.png', { card: 'iframe.diui-frame' }))
      }
      return { turn, checks, screenshot, screenshots }
    },
  },
  {
    id: 'R-stop', category: 'stop-resume', title: 'Stop mid-stream, then regenerate',
    caption: ['⑦ 停止 / 恢复', '生成中途停止 → 保留预览 → 一键重新生成'],
    async run(s) {
      let stoppedAt = null
      const turn = await s.ask('使用 Three.js 做一个包含光影的可交互 3D 太阳系微型模型，行星公转且支持鼠标拖拽视角。', {
        interrupt: async () => {
          const generating = await waitFor(() => s.page.$('.diui-shell[data-state=generating] .diui-shell-body'), 120000, 100)
          if (!generating) return
          await sleep(2500)
          const stop = await s.page.$(STOP)
          if (stop) { await s.click(stop); stoppedAt = Date.now() }
        },
      })
      const stopped = await s.page.evaluate(() => {
        const sh = [...document.querySelectorAll('.diui-shell[data-state=stopped]')].filter(x => x.querySelector('.diui-shell-body')).at(-1)
        return sh && { notice: sh.querySelector('.diui-shell-notice')?.textContent ?? '', regenerate: !!sh.querySelector('.diui-head-button') }
      })
      const checks = [
        check('generation could be stopped mid-stream', stoppedAt !== null),
        check('stopped card keeps its preview with a notice and a regenerate button', stopped?.regenerate, JSON.stringify(stopped)),
      ]
      const screenshot = await s.shot('stopped.png', { card: true })
      if (!stopped?.regenerate) return { turn, checks, screenshot }
      await s.rec.caption('⑦ 停止 / 恢复', '点击「重新生成」')
      const regen = await s.page.evaluateHandle(() => [...document.querySelectorAll('.diui-shell[data-state=stopped]')].at(-1)?.querySelector('.diui-head-button'))
      const second = await s.ask(null, { trigger: () => s.click(regen.asElement()), ready: async () => { const f = await s.frame(); return f && f.frame.evaluate(() => !!document.querySelector('canvas')) } })
      const three = await threeChecks(s, 'regenerated scene')
      checks.push(check('regenerate produced a complete widget', second.rendered === true), ...three.checks)
      if (!three.checks.every(c => c.ok)) checks.push(...await tryRepair(s, 'regenerated scene'))
      return { turn, extraTurns: [second], checks, screenshot, screenshots: [await s.shot('regenerated.png', { card: 'iframe.diui-frame' })] }
    },
  },
  {
    id: 'R-patch', category: 'multi-turn', title: 'Two successive in-place edits',
    caption: ['⑧ 多轮连续修改', 'ui_patch 原地更新同一张卡片'],
    async run(s) {
      const turn = await s.ask('用柱状图对比 Q1-Q4 线上和线下两个渠道的销售额（线上 120、135、150、170；线下 90、95、88、100）。',
        { ready: () => s.inCards(e => !!e.querySelector('.diui-chart-svg')) })
      const state = () => s.page.evaluate(() => {
        const live = [...document.querySelectorAll('.diui-tail .diui-shell, .diui-shell')].filter(x => x.querySelector('.diui-shell-body') && x.querySelector('.diui-chart-svg'))
        const sh = live.at(-1)
        const svg = sh?.querySelector('.diui-chart-svg')
        return sh && {
          liveCopies: new Set(live).size,
          status: sh.querySelector('.diui-shell-status')?.textContent ?? '',
          bars: svg.querySelectorAll('rect[rx]').length,
          lines: svg.querySelectorAll('path[fill=none]').length,
          legend: [...sh.querySelectorAll('.diui-legend-item')].map(l => l.textContent.trim()),
        }
      })
      const v1 = await state()
      await s.rec.caption('⑧ 多轮连续修改', '第 2 轮：改成折线图')
      const t2 = await s.ask('把这个图改成折线图。', { ready: async () => (await state())?.lines >= 2 })
      const v2 = await state()
      await s.rec.caption('⑧ 多轮连续修改', '第 3 轮：新增「小程序」渠道')
      const t3 = await s.ask('再加一个“小程序”渠道，Q1-Q4 分别是 30、45、60、80，其他保持不变。', { ready: async () => (await state())?.legend.some(l => l.includes('小程序')) })
      const v3 = await state()
      return {
        turn,
        extraTurns: [t2, t3],
        checks: [
          check('initial bar chart with two series', v1 && v1.legend.length >= 2, JSON.stringify(v1)),
          check('edit 1: now a line chart', v2 && v2.lines >= 2 && v2.bars === 0, JSON.stringify(v2)),
          check('edit 2: third series "小程序" added, others kept', v3 && v3.legend.length >= 3 && v3.legend.some(l => l.includes('小程序')) && v1.legend.every(l => v3.legend.includes(l)), JSON.stringify(v3)),
          check('updated in place: one live card, version shown', v3 && v3.liveCopies === 1 && /版|Version/.test(v3.status), v3 && `${v3.liveCopies} live, "${v3.status}"`),
        ],
        screenshot: await s.shot('patched.png', { card: '.diui-chart-svg' }),
      }
    },
  },
  {
    id: 'R-weak', category: 'network', title: 'Weak network (Fast 3G, cache off)',
    caption: ['⑨ 弱网络', 'Fast 3G 限速 + 禁用缓存：three.js 从 CDN 慢速加载'],
    async run(s) {
      const cdp = await s.page.createCDPSession()
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await s.page.emulateNetworkConditions(PredefinedNetworkConditions['Fast 3G'])
      try {
        const turn = await s.ask('用 Three.js 画一个可以拖拽旋转的彩色立方体，带坐标轴。',
          { ready: async () => { const f = await s.frame(); return f && f.frame.evaluate(() => !!document.querySelector('canvas')) } })
        const { checks } = await threeChecks(s, 'cube on Fast 3G')
        const shot = await s.shot('weak-network.png', { card: 'iframe.diui-frame' })
        if (!checks.every(c => c.ok)) checks.push(...await tryRepair(s, 'cube on Fast 3G'))
        return { turn, checks: [check('turn completed on a slow connection', turn.idle), ...checks], screenshot: shot }
      } finally {
        await s.page.emulateNetworkConditions(null)
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
        await cdp.detach()
      }
    },
  },
  {
    id: 'R-offline', category: 'network', title: 'CDN unreachable (offline widgets)',
    caption: ['⑩ 无网络（CDN 不可达）', '组件库加载失败时应明确报错、不影响宿主页面'],
    async run(s) {
      const cdp = await s.page.createCDPSession()
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.setBlockedURLs', { urls: CDN.map(h => `*://${h}/*`) })
      const hostErrorsBefore = (await s.hostErrors()).length
      try {
        const turn = await s.ask('用 Three.js 画一个可以拖拽旋转的彩色立方体，带坐标轴。',
          { ready: () => s.inCards(e => !!e.querySelector('.diui-error-count') || !!e.querySelector('.diui-shell-notice')) })
        const surfaced = await s.inCards(e => e.querySelector('.diui-error-count')?.textContent ?? e.querySelector('.diui-shell-notice')?.textContent ?? '')
        const screenshot = await s.shot('offline.png', { card: true })
        await s.rec.caption('⑩ 无网络（CDN 不可达）', '宿主页面仍可继续对话')
        const next = await s.ask('好的，那请用一句话说明刚才为什么没有显示出来。')
        const reply = await s.page.evaluate(() => document.body.innerText.slice(-600))
        return {
          turn,
          extraTurns: [next],
          checks: [
            check('the failure is shown to the user on the card (not silent)', !!surfaced, surfaced),
            check('no uncaught errors in the host page', (await s.hostErrors()).length === hostErrorsBefore, (await s.hostErrors()).slice(hostErrorsBefore).join(' | ')),
            check('the conversation keeps working afterwards', next.idle && reply.length > 20),
          ],
          screenshot,
        }
      } finally {
        await cdp.send('Network.setBlockedURLs', { urls: [] })
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
        await cdp.detach()
      }
    },
  },
  {
    id: 'R-mobile', category: 'mobile', title: 'Dashboard at phone width',
    caption: ['⑪ 移动端', '390 px 手机宽度：无横向溢出，KPI 网格自动换行'],
    async run(s) {
      await s.page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      await sleep(2500)
      await s.dismissNotice()
      try {
        await s.newConversation()
        const turn = await s.ask('帮我生成一个2026年Q1公司业务运营监控看板，包含总收入、活跃用户、转化率、客单价等核心指标，并按不同业务线展示数据。',
          { ready: () => s.inCards(e => !!e.querySelector('.diui-stat')) })
        await sleep(600)
        const layout = await s.page.evaluate(() => ({
          overflowing: [...document.querySelectorAll('.diui-shell')].filter(x => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().right > innerWidth + 1).length,
          kpiColumns: (() => { const g = [...document.querySelectorAll('.diui-grid')].at(-1); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null })(),
          pageScroll: document.documentElement.scrollWidth > innerWidth + 1,
        }))
        const screenshot = await s.shot('mobile.png')
        return {
          turn,
          checks: [
            check('KPI tiles rendered', await s.inCards(e => e.querySelectorAll('.diui-stat').length >= 3)),
            check('no card overflows the phone width', layout.overflowing === 0 && !layout.pageScroll, JSON.stringify(layout)),
            check('KPI grid reflows to at most 2 columns', layout.kpiColumns === null || layout.kpiColumns <= 2, `columns=${layout.kpiColumns}`),
          ],
          screenshot,
        }
      } finally {
        await s.page.setViewport({ width: 1280, height: 800 })
        await sleep(2500)
        await s.dismissNotice()
      }
    },
  },
]

/**
 * @param {{ model: string, out: string, only?: string[], record?: boolean, dshHome?: string, log?: (s: string) => void }} opts
 */
export async function runBrowserStage({ model, out, only, record = false, dshHome, log = console.log }) {
  getApiKey() // fail before booting anything; DSH reads the key from the environment
  const version = capture(DSH, ['--version'])
  if (version.status !== 0) return { skipped: `DSH CLI not found (${DSH}); install @deepseek-ai/dsh or set DSH_BIN`, cases: [] }
  const dsh = String(version.stdout).trim()
  const home = path.resolve(dshHome || mkdtempSync(path.join(tmpdir(), 'dsh-real-eval-')))
  const shots = path.join(out, 'browser')
  mkdirSync(shots, { recursive: true })
  log(`dsh ${dsh} · installing this checkout into ${home}`)
  installPlugin(root, home)
  const web = await startDshWeb({
    dshHome: home, port: PORT,
    patches: [
      { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: { provider: 'deepseek-official', model } },
      { id: 'locale', name: '@deepseek-ai/dsh-client-locale', config: { preference: 'zh-CN' } },
      { id: 'ui-theme', name: '@deepseek-ai/dsh-client-ui-theme', config: { preference: 'light' } },
    ],
  })
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--lang=zh-CN',
      ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [])],
  })
  const cases = []
  try {
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
    const rec = new Recorder(page, path.join(out, 'frames'), record)
    const s = new Session(page, rec, shots)
    await s.probeHostErrors()
    await page.goto(web.url, { waitUntil: 'networkidle2' })
    await sleep(2000)
    await s.dismissNotice()
    const shownModel = (await page.evaluate(() => document.body.innerText.match(/DeepSeek-[\w.-]+/)?.[0])) ?? null
    await rec.start()
    for (const scenario of BROWSER_SCENARIOS.filter(x => !only || only.includes(x.id))) {
      const started = Date.now()
      const errorsBefore = s.errors.length
      const hostBefore = await s.hostErrors().catch(() => [])
      const record = { id: scenario.id, category: scenario.category, title: scenario.title, model: [model], modelLabel: shownModel }
      try {
        if (scenario.id !== 'R-mobile') await s.newConversation()
        await rec.caption(...scenario.caption)
        const r = await scenario.run(s)
        const consoleErrors = s.errors.slice(errorsBefore)
        const hostNow = await s.hostErrors().catch(() => [])
        // A reload (phone viewport) restarts the in-page list.
        const hostNew = hostNow.length >= hostBefore.length ? hostNow.slice(hostBefore.length) : hostNow
        const plugin = pluginErrors(consoleErrors)
        const checks = [...r.checks, check('turn finished', r.turn.idle),
          check('no uncaught errors in the DSH page', hostNew.length === 0, hostNew.slice(0, 3).join(' | ')),
          check('no plugin errors in the console', plugin.length === 0, plugin.slice(0, 3).join(' | '))]
        const infra = [r.turn, ...(r.extraTurns || [])].map(t => t.infraError).find(Boolean)
        const failed = checks.filter(c => !c.ok && !c.informational)
        Object.assign(record, {
          passed: !infra && failed.length === 0,
          ...(infra ? { infrastructure: true } : {}),
          reason: infra ? `infrastructure: DSH run failed (${infra})` : failed.length ? failed.map(c => c.name + (c.detail ? ` (${c.detail})` : '')).join('; ') : null,
          checks,
          timing: { ...r.turn.timing, caseMs: Date.now() - started, ...(r.extraTurns ? { followUps: r.extraTurns.map(t => t.timing) } : {}) },
          notes: checks.filter(c => c.informational).map(c => `${c.name}: ${c.ok ? 'yes' : 'no'}`),
          clarifications: [r.turn, ...(r.extraTurns || [])].flatMap(t => t.clarifications || []),
          subagents: Math.max(0, ...[r.turn, ...(r.extraTurns || [])].map(t => t.subagents || 0)),
          consoleErrors: consoleErrors.slice(0, 10),
          screenshots: [r.screenshot, ...(r.screenshots || [])].filter(Boolean).map(f => path.relative(out, f).replace(/\\/g, '/')),
        })
      } catch (err) {
        await s.shot(`${scenario.id}-failure.png`).catch(() => {})
        Object.assign(record, { passed: false, reason: `error: ${err.message.split('\n')[0]}`, checks: [], timing: { caseMs: Date.now() - started }, consoleErrors: s.errors.slice(errorsBefore, errorsBefore + 10) })
      }
      cases.push(record)
      log(`${record.passed ? 'PASS' : 'FAIL'}  [browser] ${record.id} ${record.title} (${(record.timing.caseMs / 1000).toFixed(1)}s)${record.reason ? ` — ${record.reason}` : ''}`)
    }
    await rec.caption('全部用例完成', `${cases.filter(c => c.passed).length}/${cases.length} 通过 · 模型 ${model}`)
    await sleep(record ? 2500 : 0)
    await rec.stop()
    return { cases, dsh, browser: await browser.version() }
  } finally {
    await browser.close()
    kill(web.child)
    freePorts([PORT])
    if (!dshHome) rmSync(home, { recursive: true, force: true, maxRetries: 3 })
  }
}
