// Real browser check of the shipped extension template and public IIFE SDK.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import puppeteer from 'puppeteer-core';
import { gotoWithRetry, launchBrowser } from './dsh-web.mjs';
const routes = {
  '/': ['../../examples/component-extension/index.html', 'text/html'],
  '/manifest.js': ['../../examples/component-extension/manifest.js', 'text/javascript'],
  '/renderers.js': ['../../examples/component-extension/renderers.js', 'text/javascript'],
  '/renderer.js': ['../../renderer/renderer.js', 'text/javascript'],
};
const server = createServer(async (req, res) => {
  const route = routes[req.url];
  if (!route) { res.writeHead(404).end(); return; }
  try { res.writeHead(200, { 'Content-Type': route[1] }).end(await readFile(new URL(route[0], import.meta.url))); }
  catch { res.writeHead(500).end(); }
});
let browser;
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  browser = await launchBrowser(puppeteer, { args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const external = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:')) external.push(req.url()); });
  await gotoWithRetry(page, `http://127.0.0.1:${server.address().port}`);
  await page.waitForSelector('details pre');
  assert.match(await page.$eval('pre', el => el.textContent), /\+const gain = 2/);
  // The portable prompt bridge arms after 200ms, just like widget interactions.
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.click('details button');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Explain this Git diff');
  await page.click('#toggle');
  await page.waitForFunction(() => document.querySelector('#app').textContent.includes('Unsupported or invalid'));
  assert.equal(await page.$('details'), null);
  await page.click('#toggle'); await page.waitForSelector('details pre');
  await page.click('#uninstall');
  await page.waitForFunction(() => document.querySelector('#app').textContent.includes('Unsupported or invalid'));
  await page.click('#reinstall'); await page.waitForSelector('details pre');
  // An incompatible wire version never reaches the newly installed renderer.
  await page.evaluate(async () => {
    const { definition } = await import('/manifest.js');
    const invalid = structuredClone(definition); invalid.components[0].componentVersion = '2.0.0';
    const el = document.createElement('div'); el.id = 'skew'; document.body.append(el);
    window.DshIntelligentUiRenderer.mount(el, { sendPrompt: async () => {} }).render({ kind: 'declarative', uiId: 'skew', version: 1, definition: invalid });
  });
  await page.waitForFunction(() => document.querySelector('#skew').textContent.includes('Unsupported or invalid'));
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS extension template: render, real click, disable/enable, uninstall/reinstall, version skew, no external requests or browser exceptions');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
