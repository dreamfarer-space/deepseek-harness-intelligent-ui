// Tests the actual React WidgetFrame, not a copy of its containment algorithm.
import { buildWidgetHarness } from './build-frame-module.mjs'

export async function auditContainment({ page, check, EVIL, HOST, held }) {
  await page.goto(HOST + '/')
  await page.addScriptTag({ content: await buildWidgetHarness() })
  const mount = async extra => {
    await page.evaluate(extra => window.widgetMount(extra), extra)
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow)
    const handle = await page.$('iframe')
    const w = await handle.contentFrame()
    await w.waitForFunction(() => window.Bridge && document.readyState === 'complete')
    // Drain the port's initial ready/resize and the element's initial load.
    await page.evaluate(() => new Promise(r => setTimeout(r, 80)))
    await page.evaluate(() => {
      window.auditLoads = 1
      document.querySelector('iframe').addEventListener('load', () => window.auditLoads++)
    })
    return w
  }
  const snapshot = () => page.evaluate(() => ({
    loads: window.auditLoads, connected: !!document.querySelector('iframe'),
    notice: !!document.querySelector('[data-widget-strayed]'),
  }))

  let w = await mount()
  await w.evaluate(evil => { location.href = evil + '/component-nav' }, EVIL)
  await page.waitForSelector('[data-widget-strayed]')
  let state = await snapshot()
  check('6a. real WidgetFrame removes a navigated document', state.notice && !state.connected, JSON.stringify(state))

  w = await mount({ mode: 'preview', html: '<input id="keep" value="initial"><p id="stream">first</p>' })
  await w.waitForSelector('#stream')
  await w.evaluate(() => { window.auditContinuity = 'same-document' })
  await page.evaluate(() => window.widgetPatch({ html: '<input id="keep" value="initial"><p id="stream">second</p>' }))
  await w.waitForFunction(() => document.querySelector('#stream')?.textContent === 'second')
  await page.evaluate(() => {
    document.body.style.setProperty('--dsw-alias-label-primary', '#123456')
    window.widgetPatch({ mode: 'final', html: '<input id="keep" value="initial"><p id="stream">final</p>', jsExpressions: ["document.body.dataset.ran='yes'"] })
  })
  await w.waitForFunction(() => document.body.dataset.ran === 'yes' && UI.css('text') === '#123456')
  state = await snapshot()
  check('6b. real streaming, finalization and theme updates keep one live document',
    state.loads === 1 && state.connected && !state.notice && await w.evaluate(() => window.auditContinuity === 'same-document'), JSON.stringify(state))

  // These two rebuilds used to produce byte-identical srcdoc, resetting the
  // load counter without actually navigating. A subsequent escape was ignored.
  for (const [name, patch] of [
    ['generation', { generation: 1 }],
    ['policy', { policy: { allowNetwork: false, cdn: [], maxHeight: 2400, sendPromptMaxChars: 4001, openLinkOrigins: [] } }],
    ['css', { css: 'p{color:blue}' }],
  ]) {
    await mount()
    const oldDoc = await page.$eval('iframe', f => f.srcdoc)
    await page.evaluate(patch => window.widgetPatch(patch), patch)
    await page.waitForFunction(() => window.auditLoads >= 2)
    const newDoc = await page.$eval('iframe', f => f.srcdoc)
    w = await (await page.$('iframe')).contentFrame()
    await w.waitForFunction(() => !!window.Bridge && document.readyState === 'complete')
    const rebuilt = await snapshot()
    await w.evaluate(evil => { location.href = evil + '/rebuilt-nav' }, EVIL)
    await page.waitForSelector('[data-widget-strayed]')
    check(`6c. ${name} rebuild really loads and rearms containment`,
      oldDoc !== newDoc && rebuilt.connected && !rebuilt.notice && !(await snapshot()).connected, JSON.stringify(rebuilt))
  }

  w = await mount()
  await w.evaluate(() => { document.open(); document.write('<p>rewritten</p>'); document.close() }).catch(() => {})
  await page.waitForSelector('[data-widget-strayed]')
  check('6d. real WidgetFrame removes a document.write replacement', !(await snapshot()).connected)

  // The foreign document runs scripts but holds an image request indefinitely:
  // no second load event. The host resolves an in-flight RPC, updates theme and
  // HTML, and must not address the replacement window with any payload.
  w = await mount()
  await page.evaluate(() => new Promise(r => setTimeout(r, 1100))) // bridge arm delay
  const token = await page.$eval('iframe', f => JSON.parse(/var TOKEN = ("[^"]+")/.exec(f.srcdoc)[1]))
  await w.evaluate(token => {
    for (const credential of [undefined, 'wrong', token]) parent.postMessage({
      type: 'rpc', __diui: credential, id: 1, method: 'sendPrompt', params: { text: 'FORGED' },
    }, '*')
  }, token)
  await page.evaluate(() => new Promise(r => setTimeout(r, 80)))
  check('6h. raw window RPCs are rejected even with the correct document token',
    await page.evaluate(() => !window.promptPending))
  await w.evaluate(() => { void Bridge.sendPrompt('pending prompt').catch(() => {}) })
  await page.waitForFunction(() => window.promptPending === true)
  await w.evaluate(evil => { location.href = evil + '/held-page' }, EVIL)
  await page.waitForFunction(() => document.querySelector('iframe') !== null)
  const foreign = await (await page.$('iframe')).contentFrame()
  await foreign.waitForFunction(() => window.__msgs && document.querySelector('#foreign-ready'))
  await page.evaluate(() => {
    window.resolvePrompt()
    document.body.style.setProperty('--dsw-alias-label-primary', '#abcdef')
    window.widgetPatch({ html: '<p>HOST-PRIVATE-HTML</p>' })
  })
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)))
  const delayed = await snapshot()
  const received = await foreign.evaluate(() => window.__msgs)
  check('6e. delayed-load foreign document receives no host RPC, HTML or theme messages',
    delayed.loads === 1 && delayed.connected && !delayed.notice && received.length === 0 && held.length > 0,
    JSON.stringify({ ...delayed, received, heldRequests: held.length }))
  // Prove the receiver is live and would catch the old wildcard path.
  await page.evaluate(() => document.querySelector('iframe').contentWindow.postMessage({ positiveControl: true }, '*'))
  await foreign.waitForFunction(() => window.__msgs.length === 1)
  check('6f. delayed-load receiver observes a deliberate wildcard positive control',
    await foreign.evaluate(() => window.__msgs[0].includes('positiveControl')))
  await Promise.all(held.splice(0).map(req => req.respond({ status: 200, contentType: 'image/png', body: '' }).catch(() => {})))
  await page.waitForSelector('[data-widget-strayed]')
  check('6g. completing the delayed load removes the foreign UI', !(await snapshot()).connected)
}
