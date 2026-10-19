// Install the extension as a separate package and traverse real DSH tool dispatch.
import assert from 'node:assert/strict';
import { cp, copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { installPlugin, start, startDshWeb, kill, findChrome } from './dsh-web.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = process.argv.indexOf('--spec');
const spec = arg < 0 ? root : path.resolve(process.argv[arg + 1]);
const folder = await mkdtemp(path.join(tmpdir(), 'diui-extension-dsh-'));
const dshHome = path.join(folder, 'dsh'), template = path.join(folder, 'companion'), log = path.join(folder, 'mock.log');
const webPort = Number(process.env.EXTENSION_WEB_PORT || 3287), mockPort = Number(process.env.EXTENSION_MOCK_PORT || 3288);
let mock, web, browser, page;
const errors = [];
try {
  await mkdir(dshHome);
  await cp(path.join(root, 'examples/component-extension'), template, { recursive: true });
  await copyFile(path.join(template, 'package.template.json'), path.join(template, 'package.json'));
  installPlugin(spec, dshHome);
  installPlugin(template, dshHome);
  mock = start(process.execPath, [path.join(root, 'scripts/e2e/mock-deepseek.mjs'), String(mockPort), log], { stdio: 'ignore' });
  web = await startDshWeb({ dshHome, port: webPort, mockPort });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
  page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
  await page.goto(web.url, { waitUntil: 'networkidle2' });
  // Fresh DSH profiles show a consent notice in front of the composer.
  for (let i = 0; i < 40; i++) {
    const state = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(b => /^(继续|Continue)$/.test(b.textContent.trim()));
      if (!button) return 'none';
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return 'disabled';
      button.click(); return 'clicked';
    });
    if (state === 'none' && i > 0) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const composer = await page.waitForSelector('textarea, [contenteditable="true"]');
  await composer.click(); await page.keyboard.type('Show a GitDiffViewer for the code changes'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.diui pre')].some(el => el.textContent.includes('+const gain = 2')));
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Stop generating"],button[aria-label="停止生成"]'));
  const rows = (await readFile(log, 'utf8')).trim().split('\n').map(s => JSON.parse(s));
  assert(rows.some(row => row.toolResult?.includes('example.git/GitDiffViewer')), 'Host accepted the external component');
  assert(!rows.some(row => row.toolResult?.includes('UI not rendered')), 'No schema disagreement between Host and browser');
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.diui pre')].some(el => el.textContent.includes('+const gain = 2')));
  assert.deepEqual(errors, []);
  assert(!web.output().split(/\r?\n/).some(line => /example-git-components/.test(line) && /error|fail|exception/i.test(line)), 'Companion boot has no errors');
  console.log('PASS external DSH companion: separate npm package, shared client registry, model SSE → ui_render → Host validation → native component, durable reload');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Catalog errors:', await page?.evaluate(() => [...document.querySelectorAll('.diui-node-error')].map(el => el.title)).catch(() => []));
  console.error('Module rows:', await page?.evaluate(() => window.__DSH_BOOT__?.modules?.filter(row => row.id.includes('intelligent-ui'))).catch(() => []));
  console.error('Page:', await page?.evaluate(() => document.body.innerText).catch(() => '') );
  console.error('Model log:', await readFile(log, 'utf8').catch(() => 'No model request'));
  console.error('DSH log:', web?.output().slice(-6000));
  throw error;
} finally {
  await browser?.close(); kill(web?.child); kill(mock);
  await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
