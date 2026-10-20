// Test the extracted optional tarball in a fresh browser with every external URL blocked.
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import * as tar from 'tar'
import puppeteer from 'puppeteer-core'
import { gotoWithRetry, launchBrowser } from './dsh-web.mjs'
import { verifyOfflinePackage } from '../offline/verify.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const directory = await mkdtemp(path.join(tmpdir(), 'diui-offline-'))
const archive = path.join(root, 'dist/offline', `${pkg.name}-${pkg.version}-offline.tgz`)
let browser, server
try {
  await tar.x({ file: archive, cwd: directory, strip: 1 })
  const manifest = await verifyOfflinePackage(directory)
  const hostBundle = await build({
    stdin: { contents: "export {resolveConfig,clientPolicy} from './src/config.js'; export {createWidgetTool} from './src/tools/widget.js'", resolveDir: directory },
    bundle: true, write: false, platform: 'node', format: 'esm', nodePaths: [path.join(root, 'node_modules')],
  })
  const host = await import('data:text/javascript;base64,' + Buffer.from(hostBundle.outputFiles[0].contents).toString('base64'))
  const config = host.resolveConfig({ allowNetwork: true, cdnAllowlist: ['https://esm.sh'] })
  assert.deepEqual(host.clientPolicy(config).cdn, [])
  assert.equal(host.clientPolicy(config).allowNetwork, false)
  assert.match(host.createWidgetTool(config).description, /Offline resource pack:/)
  // Real corruption must fail before executing any bundle.
  const clientFile = path.join(directory, 'client/client.js')
  const clientBytes = await readFile(clientFile)
  await writeFile(clientFile, Buffer.concat([clientBytes, Buffer.from('\n/* tampered */')]))
  await assert.rejects(verifyOfflinePackage(directory), /Integrity mismatch: client\/client.js/)
  await writeFile(clientFile, clientBytes)
  const html = '<!doctype html><html><head><meta charset="utf-8"><script src="/renderer.js"></script></head><body><div id="app"></div></body></html>'
  server = http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname
    if (p === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html) }
    else if (p === '/renderer.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(path.join(directory, 'renderer/renderer.js'))) }
    else if (p === '/online.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(path.join(root, 'renderer/renderer.js'))) }
    else { res.writeHead(404).end() }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await launchBrowser(puppeteer, {
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(30_000)
  await page.setCacheEnabled(false)
  await page.setRequestInterception(true)
  const external = [], errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', request => {
    const url = request.url()
    if (/^https?:/.test(url) && new URL(url).origin !== origin) { external.push(url); request.abort() }
    else request.continue()
  })
  await gotoWithRetry(page, origin)
  assert.equal(await page.evaluate(() => DshIntelligentUiRenderer.resourceMode), 'offline')
  // Fully disconnect after the local host bundle is in memory, not just block CDN names.
  await page.setOfflineMode(true)
  await page.evaluate(() => {
    localStorage.setItem('secret', 'host-only')
    document.cookie = 'secret=host-only'
    window.rootRenderer = DshIntelligentUiRenderer.mount(document.getElementById('app'), { sendPrompt: async () => {} })
    rootRenderer.render({ kind: 'declarative', uiId: 'libs', version: 1, policy: { cdn: ['https://esm.sh'], allowNetwork: true }, definition: {
      root: 'box', components: [
        { id: 'box', type: 'Stack', props: {}, children: ['math', 'diagram'] },
        { id: 'math', type: 'Math', props: { tex: '\\frac{1}{2} + x^2' } },
        { id: 'diagram', type: 'Mermaid', props: { code: 'graph TD; A[Offline] --> B[Ready]' } },
      ],
    } })
  })
  const math = await (await page.waitForSelector('[data-kind="math"] iframe')).contentFrame()
  await math.waitForSelector('.katex .mfrac')
  // Font loading is part of the offline contract, not merely a successful JS import.
  assert.equal(await math.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px KaTeX_Main') }), true)
  const diagram = await (await page.waitForSelector('[data-kind="mermaid"] iframe')).contentFrame()
  await diagram.waitForSelector('#out svg')
  assert.match(await diagram.$eval('#out', el => el.textContent), /Offline/)
  await page.evaluate(() => rootRenderer.setTheme('dark'))
  await diagram.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await page.evaluate(() => {
    rootRenderer.render({ kind: 'widget', uiId: 'scene', version: 1, definition: {
      html: '<div id="scene" style="height:260px"></div><output id="status"></output>',
      jsExpressions: [`
        UI.three('#scene').then(function(api){
          var T=api.THREE;
          api.scene.add(new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial({color:0x4488ff})));
          api.render();
          document.getElementById('status').textContent='three-ready';
        });
      `],
    } })
  })
  const scene = await (await page.waitForSelector('.diui-remote-widget iframe')).contentFrame()
  await scene.waitForFunction(() => document.getElementById('status')?.textContent === 'three-ready')
  assert.ok(await scene.$('#scene canvas'), 'standard Three.js + OrbitControls scene must run')
  // Check all additional advertised imports and actual sandbox access denials.
  const isolation = await scene.evaluate(async () => {
    const result = {}
    for (const name of ['dom', 'cookie', 'storage']) {
      try {
        if (name === 'dom') result[name] = parent.document.body.innerHTML
        if (name === 'cookie') result[name] = document.cookie
        if (name === 'storage') result[name] = localStorage.getItem('secret')
      } catch (e) { result[name] = e.name }
    }
    const d3 = await import('d3'), chart = await import('chart.js/auto'), confetti = await import('canvas-confetti')
    result.libraries = [d3.sum([1, 2, 3]), typeof chart.default, typeof confetti.default]
    result.csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content
    try { await fetch('https://example.com/leak'); result.fetch = 'allowed' } catch { result.fetch = 'blocked' }
    try { await import('three/addons/loaders/GLTFLoader.js'); result.addon = 'allowed' } catch { result.addon = 'unsupported' }
    return result
  })
  assert.deepEqual(isolation.libraries, [6, 'function', 'function'])
  assert.deepEqual([isolation.dom, isolation.cookie, isolation.storage], ['SecurityError', 'SecurityError', 'SecurityError'])
  assert.equal(isolation.fetch, 'blocked'); assert.equal(isolation.addon, 'unsupported')
  assert.match(isolation.csp, /connect-src 'none'/)
  assert.ok(!isolation.csp.includes('https://'), 'offline CSP cannot contain CDN or host origins')
  assert.equal(await page.$eval('iframe', el => el.getAttribute('sandbox')), 'allow-scripts allow-forms')
  assert.deepEqual(external, [], 'offline libraries must make zero external HTTP requests')
  assert.deepEqual(errors, [], 'offline flow cannot leak uncaught browser errors')

  // Exercise the DSH CJS factory too, with the platform modules replaced by inert hosts.
  const loader = await browser.newPage()
  await loader.goto(origin)
  await loader.evaluate(code => {
    window.__ModuleLoader__ = { load({ factory }) {
      const inert = new Proxy(function(){}, { get: (_, key) => key === '__esModule' ? true : inert })
      factory(() => inert); window.clientFactoryLoaded = true
    } }
    ;(0, eval)(code)
  }, clientBytes.toString('utf8'))
  assert.equal(await loader.evaluate(() => window.clientFactoryLoaded), true)
  await loader.close()

  // Online users retain CDN loading with an explicit static fallback when CDN is blocked.
  await page.setOfflineMode(false)
  await page.goto(origin)
  await page.addScriptTag({ url: origin + '/online.js' })
  assert.equal(await page.evaluate(() => DshIntelligentUiRenderer.resourceMode), 'online')
  await page.evaluate(() => {
    DshIntelligentUiRenderer.mount(document.getElementById('app'), { sendPrompt: async () => {} }).render({
      kind: 'declarative', uiId: 'online', version: 1, definition: { root: 'math', components: [{ id: 'math', type: 'Math', props: { tex: 'x^2' } }] },
    })
  })
  const fallback = await (await page.waitForSelector('iframe')).contentFrame()
  await fallback.waitForFunction(() => document.getElementById('lib-status')?.textContent.includes('Static fallback:'))
  assert.equal(await fallback.$eval('#out', el => el.textContent), 'x^2')
  assert.ok(external.length, 'online bundle must still attempt its configured CDN')
  console.log(`Offline Chromium passed: Math + WOFF2, Mermaid + theme, Three.js + OrbitControls, D3/Chart/confetti, zero external requests, DOM/cookie/storage denial, CSP denial, online static fallback, tamper detection; ${manifest.packages.length} dependency records.`)
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(directory, { recursive: true, force: true })
}
