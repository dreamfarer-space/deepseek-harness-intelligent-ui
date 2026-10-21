// Record the per-feature demo videos used in the README, live in the DeepSeek
// Harness desktop app with a real model.
//
//   1. Start the desktop app with remote debugging, the plugin installed and the
//      model you want selected in the composer:
//        "DeepSeek Harness.exe" --remote-debugging-port=9333
//   2. node scripts/demo/record-features.mjs [--out <dir>] [--only choice,grid,charts,code]
//        [--cdp http://127.0.0.1:9333] [--model "Deepseek-V4.1-Flash"]
//
// Each demo opens a new session, asks a question whose data is in the prompt,
// waits for the real answer and then uses whatever the model rendered. If the
// expected component is missing it retries in a new session. Approval requests
// are rejected: the demos never let the agent touch the workspace. For every
// demo the raw screencast frames and a track of cursor, clicks, keys, captions
// and camera focus are saved, and scripts/demo/camera.mjs renders the video.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { renderDemo } from './camera.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const out = path.resolve(arg('--out', path.join(root, 'e2e-shots', 'demos')))
const only = arg('--only', 'choice,grid,charts,code').split(',')
const CDP = arg('--cdp', process.env.DSH_DESKTOP_CDP || 'http://127.0.0.1:9333')
const MODEL = arg('--model', 'Deepseek-V4.1-Flash')
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---- track: everything the camera renderer needs ------------------------------
let page, view, track, cdp, framesDir, frameCount
const now = () => Date.now() / 1000
const mark = e => track?.events.push({ t: now(), ...e })

async function startScreencast(name) {
  framesDir = path.join(out, name, 'frames')
  rmSync(path.join(out, name), { recursive: true, force: true })
  mkdirSync(framesDir, { recursive: true })
  track = { name, view, frames: [], events: [] }
  frameCount = 0
  cdp = await page.createCDPSession()
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    const file = `f${String(frameCount++).padStart(5, '0')}.jpg`
    track.frames.push({ file, t: metadata.timestamp })
    writeFileSync(path.join(framesDir, file), Buffer.from(data, 'base64'))
    try { await cdp.send('Page.screencastFrameAck', { sessionId }) } catch { /* stopping */ }
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 })
}
async function stopScreencast() {
  await sleep(400)
  await cdp.send('Page.stopScreencast').catch(() => {})
  await cdp.detach().catch(() => {})
  writeFileSync(path.join(out, track.name, 'track.json'), JSON.stringify(track))
}

// ---- interaction helpers that also write the track ------------------------------
let cursor
const caption = text => mark({ type: 'caption', text })
const wide = () => mark({ type: 'focus', wide: true })
async function focus(target, pad = 20) {
  const box = typeof target?.boundingBox === 'function' ? await target.boundingBox() : target
  if (box) mark({ type: 'focus', x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 })
}
async function moveTo(x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16))
  const from = { ...cursor }
  for (let i = 1; i <= steps; i++) {
    const k = i / steps
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
    cursor = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e }
    await page.mouse.move(cursor.x, cursor.y)
    mark({ type: 'cursor', ...cursor })
    await sleep(ms / steps)
  }
}
async function centerOf(handle) {
  let b = await handle.boundingBox()
  if (!b) { await handle.evaluate(e => e.scrollIntoView?.({ block: 'center' })).catch(() => {}); await sleep(400); b = await handle.boundingBox() }
  return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
/** Elements the model's layout hides (a closed tab, a collapsed node) are skipped. */
async function hover(handle, ms) { const c = handle && await centerOf(handle); if (c) await moveTo(c.x, c.y, ms); return !!c }
async function click(handle, ms) {
  if (!handle || !(await hover(handle, ms))) return false
  await sleep(120)
  mark({ type: 'click', ...cursor })
  await page.mouse.down(); await sleep(70); await page.mouse.up()
  return true
}
async function key(name, times = 1, gap = 380) { for (let i = 0; i < times; i++) { mark({ type: 'key', key: name }); await page.keyboard.press(name); await sleep(gap) } }
async function scrollTo(handle, block = 'center') {
  if (!handle) return
  await handle.evaluate((e, block) => e.scrollIntoView({ block, behavior: 'smooth' }), block)
  await sleep(1000)
}
const $last = async sel => (await page.$$(sel)).at(-1)
async function byText(sel, re, within) {
  const h = await page.evaluateHandle((sel, src, flags, scope) => [...(scope ?? document).querySelectorAll(sel)].reverse().find(e => new RegExp(src, flags).test(e.textContent.trim())), sel, re.source, re.flags, within ?? null)
  return h.asElement()
}

// ---- DSH desktop ------------------------------------------------------------------
const busy = () => page.evaluate(() => !!document.querySelector('[aria-label*="Stop"],[aria-label*="停止"]'))
const approval = () => byText('button', /^(Reject|拒绝)$/)
async function waitIdle(timeout = 240_000) {
  const end = Date.now() + timeout
  await sleep(1200)
  mark({ type: 'wait' })
  try { return await idle(end) } finally { mark({ type: 'waited' }) }
}
async function idle(end) {
  while (Date.now() < end) {
    const reject = await approval()
    if (reject) { console.log('  rejecting an approval request'); await click(reject, 400); await sleep(800); continue }
    if (!(await busy())) { await sleep(900); if (!(await busy()) && !(await approval())) return }
    await sleep(400)
  }
  throw new Error('the model did not finish in time')
}
async function newSession() {
  await click(await byText('button', /^New Session/), 500)
  await page.waitForSelector('[contenteditable="true"], textarea', { timeout: 20000 })
  await sleep(1200)
  const model = await page.evaluate(() => document.body.innerText)
  if (!model.includes(MODEL)) throw new Error(`the composer does not show the model "${MODEL}"; select it in the app first`)
}
async function ask(text) {
  const box = await page.waitForSelector('[contenteditable="true"], textarea')
  await click(box, 500)
  // Type the first words visibly, then insert the rest (the data) at once.
  const head = text.slice(0, 26)
  await page.keyboard.type(head, { delay: 45 })
  // A newline would send the message: insert line by line with Shift+Enter between.
  const lines = text.slice(head.length).split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) { await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift') }
    if (lines[i]) await page.keyboard.sendCharacter(lines[i])
  }
  await sleep(600)
  mark({ type: 'key', key: 'Enter' })
  await page.keyboard.press('Enter')
  wide()
  await waitIdle()
  await sleep(800)
}
/** Ask until the answer contains `selector` (the model chooses the components). */
async function askFor(selector, prompt, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    if (i > 1) { console.log(`  no ${selector} yet; asking again in a new session`); await newSession() }
    // Only a component rendered by this answer counts, not one from an earlier turn.
    const before = (await page.$$(`.diui-shell ${selector}`)).length
    await ask(prompt)
    let all = await page.$$(`.diui-shell ${selector}`)
    if (all.length > before) return all.at(-1)
    // Tabs only mount the active panel: look behind the other tabs too.
    if (await reveal(selector)) { all = await page.$$(`.diui-shell ${selector}`); if (all.length > before) return all.at(-1) }
  }
  throw new Error(`the model did not render ${selector}`)
}

/** Find a component in the latest answer; if the model put it in Tabs, click through the tabs to reveal it. */
async function reveal(selector) {
  const visible = async () => {
    for (const h of (await page.$$(`.diui-shell ${selector}`)).reverse()) if (await h.boundingBox()) return h
  }
  let found = await visible()
  if (found) return found
  for (const tab of await page.$$('.diui-shell .diui-tab')) {
    if (await tab.evaluate(t => t.getAttribute('aria-selected') === 'true')) continue
    await scrollTo(tab)
    await focus(await tab.evaluateHandle(t => t.closest('.diui-tabs') ?? t.parentElement))
    await click(tab, 500)
    await sleep(700)
    if ((found = await visible())) return found
  }
}

const NO_TOOLS = '只在对话里回答，不要读写文件，也不要运行命令。'

// ---- the demos ---------------------------------------------------------------------
const DEMOS = {
  async choice() {
    await newSession()
    await startScreencast('choice')
    caption('Choice: pick one, then continue here or start it in a new session')
    let card = await askFor('.diui-choice', `${NO_TOOLS}这个周末我想花半天学一个新技术，给我几个方向让我选，选好后你再给出具体计划。`)
    await scrollTo(card)
    await focus(card)
    await sleep(1200)
    const options = await card.$$('.diui-choice-option')
    await click(options[1] ?? options[0])
    await sleep(800)
    caption('Continue in this session: the picked option becomes your next message')
    await click(await byText('button', /^(Continue in this session|在当前会话中继续)$/, card))
    wide()
    await waitIdle()
    await sleep(2500)
    await newSession()
    caption('Or start the picked option in a fresh session in the same workspace')
    card = await askFor('.diui-choice', `${NO_TOOLS}下班后想用一个晚上做个小项目练手，给我几个方向让我选，选好后再给出步骤。`)
    await scrollTo(card)
    await focus(card)
    await sleep(1000)
    const again = await card.$$('.diui-choice-option')
    await click(again[2] ?? again.at(-1))
    await sleep(700)
    await click(await byText('button', /^(Start new session|新开会话)$/, card))
    wide()
    caption('New session: a self-contained prompt, no copied history')
    await sleep(2500)
    await waitIdle()
    await sleep(2500)
    await stopScreencast()
  },

  async grid() {
    await newSession()
    await startScreencast('grid')
    caption('Table as a data grid: sorting, search, filters and export run in the browser')
    const rows = [
      ['SO-1041', '2026-07-02', 'Aster GmbH', 'Berlin', 1240, '已付'], ['SO-1042', '2026-07-05', 'Blue Fern', 'Lisbon', 318.5, '已付'],
      ['SO-1043', '2026-07-09', 'Cobalt Labs', 'Berlin', 86, '未付'], ['SO-1044', '2026-07-14', 'Driftwood', 'Oslo', 2210, '已付'],
      ['SO-1045', '2026-07-21', 'Ember & Co', 'Madrid', 640, '未付'], ['SO-1046', '2026-08-01', 'Fjord AS', 'Oslo', 455, '已付'],
      ['SO-1047', '2026-08-06', 'Granite', 'Berlin', 1980, '已付'], ['SO-1048', '2026-08-12', 'Harbor Inc', 'Lisbon', 72.25, '未付'],
      ['SO-1049', '2026-08-19', 'Ivy Studio', 'Madrid', 1510, '已付'], ['SO-1050', '2026-08-28', 'Juniper', 'Berlin', 390, '已付'],
      ['SO-1051', '2026-09-03', 'Kestrel', 'Oslo', 2875, '未付'], ['SO-1052', '2026-09-11', 'Lumen', 'Madrid', 120, '已付'],
      ['SO-1053', '2026-09-17', 'Moss & Sons', 'Lisbon', 930, '已付'], ['SO-1054', '2026-09-29', 'Nimbus', 'Berlin', 1630, '未付'],
    ].map(r => r.join(', ')).join('；')
    const grid = await askFor('.diui-datagrid', `${NO_TOOLS}这是 Q3 的订单（订单号, 日期, 客户, 城市, 金额 EUR, 付款状态）：${rows}。请做成我可以自己排序、搜索、按列筛选、分页和导出 CSV 的表格。`)
    await scrollTo(grid, 'start')
    await focus(grid)
    await sleep(1000)
    caption('Typed sorting: dates by date, amounts by value')
    const headers = await grid.$$('th .diui-th-button')
    const dateHead = await byText('th .diui-th-button', /日期|Date/, grid)
    const amountHead = await byText('th .diui-th-button', /金额|Amount/, grid)
    for (const h of [dateHead, dateHead, amountHead, amountHead]) { if (h) { await click(h, 450); await sleep(800) } }
    if (!dateHead && headers[1]) { await click(headers[1]); await sleep(800) }
    const search = await grid.$('.diui-table-tools input[type=search]')
    if (search) {
      caption('Search across all columns')
      await click(search)
      await page.keyboard.type('Berlin', { delay: 110 })
      await sleep(1500)
      await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace')
      await sleep(600)
    }
    const filter = await byText('.diui-table-tools button', /^(Filter|筛选)/, grid)
    if (filter) {
      caption('Per-column filters combine: amount at least 500, unpaid only')
      await click(filter)
      await sleep(700)
      await focus(grid)
      const types = await grid.$$eval('.diui-filter-row th', ths => ths.map(th => th.querySelector('input[type=number]') ? 'number' : th.querySelector('input[type=date]') ? 'date' : th.querySelector('select') ? 'bool' : 'text'))
      const amountCol = types.findIndex(t => t === 'number')
      if (amountCol >= 0) {
        await click(await grid.$(`.diui-filter-row th:nth-child(${amountCol + 1}) input`))
        await page.keyboard.type('500', { delay: 150 })
        await sleep(900)
      }
      const textCols = await grid.$$('.diui-filter-row th input[type=search]')
      const statusInput = textCols.at(-1)
      const boolSelect = await grid.$('.diui-filter-row select')
      if (boolSelect) { await click(boolSelect); await boolSelect.select('false') }
      else if (statusInput) { await click(statusInput); await page.keyboard.type('未付', { delay: 160 }) }
      await sleep(1600)
    }
    const next = await byText('.diui-pager button', /^(Next|下一页)$/, grid)
    if (next && !(await next.evaluate(b => b.disabled))) { caption('Paging'); await click(next); await sleep(1000) }
    caption('Export exactly the filtered, sorted rows (CSV is formula-safe)')
    await click(await byText('.diui-table-export button', /CSV/, grid))
    await sleep(2200)
    await stopScreencast()
  },

  async charts() {
    await newSession()
    await startScreencast('charts')
    caption('Scatter and Heatmap: inspect by hover, tap or keyboard')
    const prompt = `${NO_TOOLS}帮我分析两组数据：用散点图看第 1 组价格和评分的关系，用热力图看第 2 组工单分布。1) 8 款产品的价格(元)和评分：A 29/3.8，B 49/4.1，C 59/4.0，D 99/4.5，E 129/4.4，F 159/4.7，G 199/4.6，H 249/4.8，看价格和评分的关系；2) 客服每天各时段的工单数（行是时段 08-10,10-12,12-14,14-16,16-18，列是周一到周日）：[3,4,6,5,4,1,0],[8,12,11,10,9,2,null],[14,18,17,15,13,4,1],[11,15,14,16,12,3,1],[6,9,8,7,10,2,0]，null 表示没有统计。`
    // Scatter's accessible name ends with "N points"; a line chart's circles do not count.
    const scatterSvg = await askFor('svg.diui-chart-svg[aria-label$=" points"]', prompt)
    const scatterFig = await scatterSvg.evaluateHandle(s => s.closest('figure'))
    await scrollTo(scatterFig)
    await focus(scatterFig)
    await sleep(900)
    const points = await scatterSvg.$$('circle')
    for (const p of points.slice(0, 7)) { await hover(p, 420); await sleep(420) }
    const legend = await scatterFig.$$('.diui-legend-item')
    if (legend.length > 1) { caption('Legend toggles a series'); await click(legend[0]); await sleep(1000); await click(legend[0]); await sleep(700) }
    const heat = await $last('.diui-shell svg.diui-chart-svg:has(pattern)')
    if (heat) {
      const fig = await heat.evaluateHandle(s => s.closest('figure'))
      await scrollTo(fig)
      await focus(fig)
      caption('Heatmap: missing data is hatched, never shown as 0')
      const cells = await heat.$$('rect')
      for (const i of [0, 8, 15, 16, 13, 22]) { if (cells[i]) { await hover(cells[i], 400); await sleep(480) } }
      caption('Keyboard: focus the chart, then use the arrow keys')
      await moveTo(view.width - 60, view.height - 70, 400)
      await heat.evaluate(s => s.focus())
      await key('ArrowRight', 3, 420)
      await key('ArrowDown', 2, 420)
      await sleep(900)
    }
    await stopScreencast()
  },

  async code() {
    await newSession()
    await startScreencast('code')
    caption('CodeDiff, FileTree and JsonView: code is shown as text, never executed')
    const before = 'export function total(items) {\n  let sum = 0\n  for (let i = 0; i < items.length; i++) {\n    sum += prices[items[i].sku]\n  }\n  return sum\n}\n\nexport function receipt(items) {\n  const lines = items.map(i => i.sku)\n  lines.push("Total: " + total(items).toFixed(2))\n  return lines.join("\\n")\n}'
    const after = 'export function total(items, { discount = 0 } = {}) {\n  const sum = items.reduce((acc, it) => acc + prices[it.sku] * it.qty, 0)\n  return sum * (1 - discount)\n}\n\nexport function receipt(items) {\n  const lines = items.map(i => `${i.qty} x ${i.sku}`)\n  lines.push("Total: " + total(items).toFixed(2))\n  return lines.join("\\n")\n}'
    const prompt = `${NO_TOOLS}帮我评审 src/checkout.js 的这次重构，把改动直观地展示出来。旧版：\n${before}\n新版：\n${after}\n这次改动的文件有：src/checkout.js（修改）、test/checkout.test.js（新增）、test/fixtures/cart.json（新增）、legacy/cart-v1.js（删除）、README.md（修改），也用文件树展示。测试用的购物车数据是 {"id":"cart_8812","currency":"EUR","discount":0.1,"items":[{"sku":"A","qty":2,"price":10},{"sku":"B","qty":1,"price":24.5}],"customer":{"id":7,"name":"Ann","loyalty-tier":"gold"}}，请把它也展示成可折叠的 JSON。`
    const diff = await askFor('.diui-diff', prompt)
    await scrollTo(diff, 'start')
    await focus(diff)
    await sleep(1500)
    const more = await byText('.diui-diff-skip', /unchanged|未改动/, diff)
    if (more) { caption('Unchanged context is collapsed; expand it when you need it'); await click(more); await sleep(1300) }
    const heads = await diff.$$('.diui-diff-head')
    if (heads[0]) { await click(heads[0]); await sleep(900); await click(heads[0]); await sleep(800) }
    const tree = await reveal('.diui-tree')
    if (tree) {
      await scrollTo(tree)
      await focus(tree)
      caption('FileTree: folders, status badges and notes')
      for (const t of (await tree.$$('.diui-tree-toggle')).slice(-2)) { await click(t); await sleep(900) }
    }
    const json = await reveal('.diui-json')
    if (json) {
      await scrollTo(json)
      await focus(json)
      caption('JsonView: expand nodes, copy a JSONPath or a value')
      const toggles = await json.$$('.diui-tree-toggle')
      for (const t of toggles.slice(1, 3)) { await click(t); await sleep(800) }
      const leaf = await byText('.diui-json-row', /"name"/, json)
      if (leaf) {
        await hover(leaf, 500)
        await sleep(500)
        await click(await leaf.$('.diui-json-copy'))
      }
      await sleep(1600)
    }
    await stopScreencast()
  },
}

// ---- main -------------------------------------------------------------------------
const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null, protocolTimeout: 300_000 })
try {
  page = (await browser.pages()).find(p => p.url().startsWith('dsh-app://'))
  if (!page) throw new Error(`no DeepSeek Harness window found at ${CDP}`)
  await page.bringToFront()
  view = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  cursor = { x: view.width / 2, y: view.height - 60 }
  mkdirSync(out, { recursive: true })
  for (const name of only) {
    console.log(`recording ${name}`)
    await DEMOS[name]()
    console.log(`  → ${await renderDemo(path.join(out, name), path.join(out, `${name}.mp4`))}`)
  }
} finally {
  await browser.disconnect()
}
