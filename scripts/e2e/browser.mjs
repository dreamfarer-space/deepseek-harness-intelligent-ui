// End-to-end driver: dashboard (ui_render) → form submit → widget (ui_render_widget) → Bridge.sendPrompt → reload.
// Usage: node scripts/e2e/browser.mjs <dsh-web-url-with-token> <screenshot-dir> <mock-log-file>
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const [url, shots, mockLog] = process.argv.slice(2)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, defaultViewport: { width: 1280, height: 900 } })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error' || /intelligent|diui/i.test(m.text())) errors.push(`console.${m.type()}: ${m.text()}`) })
await page.goto(url, { waitUntil: 'networkidle2' })
await sleep(2500)
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^(继续|Continue)$/.test(b.textContent.trim()))?.click())
await sleep(800)
await page.screenshot({ path: `${shots}/0-home.png` })

async function send(text) {
  const box = await page.waitForSelector('textarea, [contenteditable="true"]', { timeout: 15000 })
  await box.click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}
const mock = () => readFileSync(mockLog, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(e => e.decision)

// 1) Declarative UI, streamed
await send('Compare sorting algorithms in a dashboard')
let midShot = false
for (let i = 0; i < 60; i++) {
  await sleep(250)
  const state = await page.$eval('.diui-shell', el => el.dataset.state).catch(() => null)
  if (state === 'generating' && !midShot) { await page.screenshot({ path: `${shots}/1-render-streaming.png` }); midShot = true }
  if (state === 'ready') break
}
await sleep(2500)
console.log('TAIL after render turn', JSON.stringify(await page.$$eval('.diui-tail .diui-shell', s => s.map(x => [x.dataset.kind, x.dataset.state]))))
const render = await page.evaluate(() => ({
  shells: [...document.querySelectorAll('.diui-shell')].map(s => [s.dataset.kind, s.dataset.state]),
  stats: [...document.querySelectorAll('.diui-stat-label')].map(e => e.textContent),
  rows: document.querySelectorAll('.diui-table tbody tr').length,
  tabs: [...document.querySelectorAll('.diui-tab')].map(e => e.textContent),
}))
console.log('RENDER', JSON.stringify(render), 'midStreamSeen=', midShot)
await page.screenshot({ path: `${shots}/2-render-ready.png` })

// chart tab, then form tab + submit
const tab = async (label) => page.evaluate(l => [...document.querySelectorAll('.diui-tab')].find(b => b.textContent === l)?.click(), label)
await tab('Chart'); await sleep(300)
console.log('CHART paths', await page.$$eval('.diui-chart-svg path', p => p.length))
await page.screenshot({ path: `${shots}/3-chart.png` })
await tab('Try it'); await sleep(300)
await page.evaluate(() => document.querySelector('.diui-form button[type=submit]').click())
await sleep(3000)
console.log('AFTER FORM mock:', JSON.stringify(mock().slice(-2).map(e => [e.decision, e.lastText.slice(0, 90)])))
await page.screenshot({ path: `${shots}/4-form-sent.png` })

// 2) Sandboxed widget, streamed
await send('Build a sine wave widget')
let previewSeen = false
for (let i = 0; i < 80; i++) {
  await sleep(250)
  const modes = await page.$$eval('iframe.diui-frame', fs => fs.map(f => f.dataset.mode))
  if (modes.includes('preview') && !previewSeen) { previewSeen = true; await page.screenshot({ path: `${shots}/5-widget-preview.png` }) }
  if (modes.includes('final')) break
}
await sleep(2000)
console.log('TAIL', JSON.stringify(await page.$$eval('.diui-tail .diui-shell', s => s.map(x => [x.dataset.kind, x.dataset.state]))), 'POINTERS', await page.$$eval('.diui-shell', s => s.filter(x => !x.querySelector('.diui-shell-body')).length))
const frameHandle = await page.$('.diui-tail iframe.diui-frame[data-mode=final]') ?? await page.$('iframe.diui-frame[data-mode=final]')
const frame = await frameHandle.contentFrame()
const inner = await frame.evaluate(() => ({ h3: document.querySelector('h3')?.textContent, av: document.getElementById('av')?.textContent, canvas: !!document.querySelector('canvas') }))
const height = await frameHandle.evaluate(f => f.style.height)
console.log('WIDGET previewSeen=', previewSeen, JSON.stringify(inner), 'height=', height)
await page.screenshot({ path: `${shots}/6-widget-final.png` })
await frame.evaluate(() => { const a = document.getElementById('a'); a.value = '1.5'; a.dispatchEvent(new Event('input')) })
await sleep(1200)
await frame.evaluate(() => document.getElementById('ask').click())
await sleep(3000)
console.log('AFTER WIDGET CLICK mock:', JSON.stringify(mock().slice(-2).map(e => [e.decision, e.lastText.slice(0, 90)])))
await page.screenshot({ path: `${shots}/7-widget-sent.png` })

// 3) Reload: cards rebuild from the session log
await page.reload({ waitUntil: 'networkidle2' })
await sleep(4000)
console.log('AFTER RELOAD shells', JSON.stringify(await page.$$eval('.diui-shell', s => s.map(x => [x.dataset.kind, x.dataset.state]))))
await page.screenshot({ path: `${shots}/8-reload.png` })
console.log('MOCK SUMMARY', JSON.stringify(mock().map(e => [e.decision, e.uiTools.join('+'), e.guidance])))
console.log('ERRORS', JSON.stringify(errors.slice(0, 20)))
await browser.close()
