// Real Chromium clicks exercise event-loop ordering that jsdom cannot model.
// Run after npm run build; set CHROME_PATH when Chrome is not installed globally.
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import puppeteer from 'puppeteer-core'
import { gotoWithRetry, launchBrowser } from './dsh-web.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const files = new Set([
  '/examples/controlled-dashboard.html', '/examples/controlled-checks.json',
  '/renderer/renderer.js', '/src/controlled/runtime.js',
])
const server = http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname
  if (!files.has(name)) { res.writeHead(404).end(); return }
  try {
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html'
    res.setHeader('Content-Type', type)
    res.end(await readFile(path.join(root, name)))
  } catch { res.writeHead(500).end() }
})
const downloads = await mkdtemp(path.join(tmpdir(), 'diui-controlled-'))
let browser
try {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  browser = await launchBrowser(puppeteer, {
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(30_000)
  const click = async label => {
    for (const button of await page.$$('button')) {
      if (await button.evaluate((el, text) => el.textContent === text, label)) { await button.click(); return }
    }
    throw new Error(`Missing button: ${label}`)
  }
  // The actual dashboard must export the current projection on each new click.
  const cdp = await page.createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  let downloadCount = 0
  cdp.on('Browser.downloadWillBegin', () => downloadCount++)
  await gotoWithRetry(page, url + '/examples/controlled-dashboard.html')
  await page.waitForSelector('button')
  await click('Export view')
  await page.waitForFunction(() => document.body.textContent.includes('"exportedRows":3'))
  await page.type('[aria-label="Search dataset"]', 'build')
  await click('Export view')
  await page.waitForFunction(() => document.body.textContent.includes('"exportedRows":1'))
  // Flush protocol events before observing their count.
  await cdp.send('Browser.getVersion')
  assert.equal(downloadCount, 2, 'each deliberate export must download the current rows')

  let confirmations = 0
  page.on('dialog', async dialog => {
    if (++confirmations === 1) await dialog.dismiss()
    else await dialog.accept()
  })
  await click('Retry build')
  await page.waitForFunction(() => document.body.textContent.includes('Action cancelled'))
  await click('Retry build')
  await page.waitForFunction(() => document.body.textContent.includes('Success: {"check":"build"'))
  assert.equal(confirmations, 2, 'cancelling must allow a later confirmation')

  // Mount a controlled widget and an uncertain native write in a fresh page.
  await gotoWithRetry(page, url + '/examples/controlled-dashboard.html')
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="widget"></div><div id="native"></div>'
    const { mount, createControlledRuntime } = DshIntelligentUiRenderer
    const runtime = createControlledRuntime('browser-test')
    const schema = { type: 'object', properties: {}, additionalProperties: false }
    window.actionRuns = 0; window.writeRuns = 0
    runtime.registerAction('widget', 'read', {
      schema, effect: 'read', authorize: async () => true,
      run: async () => ({ runs: ++window.actionRuns }),
    })
    runtime.registerAction('native', 'uncertain', {
      schema, effect: 'write', authorize: async () => true, confirm: async () => true,
      run: async () => {
        window.writeRuns++
        throw new Error('uncertain backend response')
      },
    })
    const host = { sessionId: 'browser-test', controlled: runtime, sendPrompt: async () => {} }
    mount(document.getElementById('widget'), host).render({
      kind: 'widget', uiId: 'widget', version: 1, definition: {
        html: '<button id="go">Go</button><button id="later">Later</button><output id="result"></output>',
        jsExpressions: [`
          window.attempt = function(label) {
            return Bridge.invokeAction({actionId:'read',args:{}}).then(
              v => document.getElementById('result').textContent = label + ':success:' + v.runs,
              e => document.getElementById('result').textContent = label + ':error:' + e.message
            );
          };
          document.getElementById('go').onclick = function(e) {
            window.trustedClick = e.isTrusted;
            attempt('click');
          };
          document.getElementById('later').onclick = function() {
            setTimeout(function(){ attempt('timer'); }, 0);
          };
          attempt('mount');
        `],
      },
    })
    mount(document.getElementById('native'), host).render({
      kind: 'declarative', uiId: 'native', version: 1, definition: {
        root: 'b', components: [{ id: 'b', type: 'Button', props: { label: 'Uncertain write', action: { actionId: 'uncertain', args: {} } } }],
      },
    })
  })
  const frame = await (await page.waitForSelector('#widget iframe')).contentFrame()
  await frame.waitForFunction(() => document.getElementById('result')?.textContent.includes('mount:error:'))
  await frame.click('#go')
  assert.equal(await frame.evaluate(() => window.trustedClick), true)
  await page.waitForSelector('[aria-label="Requested action"]')
  assert.equal(await page.evaluate(() => window.actionRuns), 0, 'iframe click only stages the request')
  await click('Run action')
  await frame.waitForFunction(() => document.getElementById('result').textContent === 'click:success:1')
  await frame.click('#later')
  await frame.waitForFunction(() => document.getElementById('result').textContent.includes('timer:error:'))
  await frame.evaluate(() => document.getElementById('go').click())
  await frame.waitForFunction(() => document.getElementById('result').textContent.includes('click:error:'))
  assert.equal(await page.$('[aria-label="Requested action"]'), null, 'timer/synthetic calls must not stage actions')
  assert.equal(await page.evaluate(() => window.actionRuns), 1)

  await click('Uncertain write')
  await page.waitForFunction(() => document.getElementById('native').textContent.includes('uncertain backend response'))
  await click('Uncertain write')
  await page.waitForFunction(() => !document.querySelector('#native button').disabled)
  assert.equal(await page.evaluate(() => window.writeRuns), 1, 'an uncertain write must retain its receipt')
  console.log('Controlled Chromium regressions passed: real click + parent approval, mount/timer/synthetic denial, repeated filtered export, cancel then approve, uncertain-write deduplication.')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  await rm(downloads, { recursive: true, force: true })
}
