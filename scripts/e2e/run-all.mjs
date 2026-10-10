import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PROJECT_ROOT = 'D:/123pan/deepseek-harness-intelligent-ui'
const ASSETS_DIR = path.join(PROJECT_ROOT, 'docs/assets')
const SHOTS_DIR = path.join(ASSETS_DIR, 'screenshots')
const FRAMES_DIR = path.join(PROJECT_ROOT, 'dsh-temp-frames')
const DSH_HOME = 'D:/Hermes/cache/scratch/dsh-e2e'

mkdirSync(SHOTS_DIR, { recursive: true })
if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true, force: true })
mkdirSync(FRAMES_DIR, { recursive: true })

let mockProc = null
let dshProc = null

async function cleanup() {
  console.log('[cleanup] Terminating processes...')
  if (mockProc) {
    try { mockProc.kill('SIGKILL') } catch {}
  }
  if (dshProc) {
    try { dshProc.kill('SIGKILL') } catch {}
  }
  // Windows fallback: kill any orphan processes on port 3199 and 3181
  const killPort = (port) => {
    return new Promise((resolve) => {
      const p = spawn('powershell', ['-Command', `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`])
      p.on('close', resolve)
    })
  }
  await killPort(3199)
  await killPort(3181)
}

process.on('SIGINT', async () => { await cleanup(); process.exit(1) })
process.on('exit', () => {})

async function main() {
  await cleanup()

  console.log('[1/5] Starting mock DeepSeek server on 3199...')
  const mockLogPath = path.join(PROJECT_ROOT, 'e2e-mock.log')
  if (existsSync(mockLogPath)) rmSync(mockLogPath)

  mockProc = spawn(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts/e2e/mock-deepseek.mjs'),
    '3199',
    mockLogPath
  ], { stdio: 'inherit' })

  await sleep(1000)

  console.log('[2/5] Starting DSH Web on 3181 with DSH_HOME=' + DSH_HOME)
  const env = {
    ...process.env,
    DSH_HOME: DSH_HOME,
    DEEPSEEK_API_KEY: 'mock',
    DEEPSEEK_BASE_URL: 'http://127.0.0.1:3199',
  }

  // DSH launch command
  dshProc = spawn('dsh', ['--profile', 'web', '--no-open', '--port', '3181'], {
    env,
    shell: true,
  })

  let dshUrl = ''
  const urlPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DSH startup timeout after 60s')), 60000)
    dshProc.stdout.on('data', (data) => {
      const str = data.toString()
      process.stdout.write(`[dsh stdout] ${str}`)
      const m = str.match(/http:\/\/127\.0\.0\.1:3181\/\?token=[^\s\r\n"']+/)
      if (m) {
        clearTimeout(timeout)
        resolve(m[0])
      }
    })
    dshProc.stderr.on('data', (data) => {
      process.stderr.write(`[dsh stderr] ${data.toString()}`)
    })
    dshProc.on('close', (code) => {
      clearTimeout(timeout)
      reject(new Error(`DSH exited early with code ${code}`))
    })
  })

  dshUrl = await urlPromise
  console.log(`[3/5] DSH Web is ready at: ${dshUrl}`)
  await sleep(2000)

  console.log('[4/5] Launching Puppeteer browser with screencast recording...')
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    defaultViewport: { width: 1280, height: 900 }
  })

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message))
  page.on('console', m => {
    if (m.type() === 'error' || /intelligent|diui/i.test(m.text())) {
      errors.push(`console.${m.type()}: ${m.text()}`)
    }
  })

  // Start CDP screencast for video recording
  const cdp = await page.target().createCDPSession()
  await cdp.send('Page.startScreencast', {
    format: 'png',
    quality: 90,
    maxWidth: 1280,
    maxHeight: 900,
    everyNthFrame: 1
  })

  let frameCount = 0
  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId })
      const filePath = path.join(FRAMES_DIR, `frame_${String(frameCount++).padStart(5, '0')}.png`)
      writeFileSync(filePath, Buffer.from(data, 'base64'))
    } catch {}
  })

  console.log('Navigating to DSH page...')
  await page.goto(dshUrl, { waitUntil: 'networkidle2' })
  await sleep(2500)

  // Click Continue / 继续 if prompt appears
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^(继续|Continue)$/.test(b.textContent.trim()))?.click())
  await sleep(800)
  await page.screenshot({ path: path.join(SHOTS_DIR, '0-home.png') })
  console.log('Saved 0-home.png')

  async function send(text) {
    const box = await page.waitForSelector('textarea, [contenteditable="true"]', { timeout: 15000 })
    await box.click()
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }

  // 1) Test Declarative UI streaming
  console.log('Sending: Compare sorting algorithms in a dashboard')
  await send('Compare sorting algorithms in a dashboard')
  let midShot = false
  for (let i = 0; i < 60; i++) {
    await sleep(250)
    const state = await page.$eval('.diui-shell', el => el.dataset.state).catch(() => null)
    if (state === 'generating' && !midShot) {
      await page.screenshot({ path: path.join(SHOTS_DIR, '1-render-streaming.png') })
      midShot = true
      console.log('Saved 1-render-streaming.png')
    }
    if (state === 'ready') break
  }
  await sleep(2500)
  await page.screenshot({ path: path.join(SHOTS_DIR, '2-render-ready.png') })
  console.log('Saved 2-render-ready.png')

  // Tab: Chart
  const tab = async (label) => page.evaluate(l => [...document.querySelectorAll('.diui-tab')].find(b => b.textContent === l)?.click(), label)
  await tab('Chart')
  await sleep(1000)
  await page.screenshot({ path: path.join(SHOTS_DIR, '3-chart.png') })
  console.log('Saved 3-chart.png')

  // Tab: Try it & form submit
  await tab('Try it')
  await sleep(600)
  await page.evaluate(() => document.querySelector('.diui-form button[type=submit]').click())
  await sleep(3000)
  await page.screenshot({ path: path.join(SHOTS_DIR, '4-form-sent.png') })
  console.log('Saved 4-form-sent.png')

  // 2) Test Sandboxed live widget streaming
  console.log('Sending: Build a sine wave widget')
  await send('Build a sine wave widget')
  let previewSeen = false
  for (let i = 0; i < 80; i++) {
    await sleep(250)
    const modes = await page.$$eval('iframe.diui-frame', fs => fs.map(f => f.dataset.mode))
    if (modes.includes('preview') && !previewSeen) {
      previewSeen = true
      await page.screenshot({ path: path.join(SHOTS_DIR, '5-widget-preview.png') })
      console.log('Saved 5-widget-preview.png')
    }
    if (modes.includes('final')) break
  }
  await sleep(2500)
  await page.screenshot({ path: path.join(SHOTS_DIR, '6-widget-final.png') })
  console.log('Saved 6-widget-final.png')

  // Interact inside widget
  const frameHandle = (await page.$('.diui-tail iframe.diui-frame[data-mode=final]')) ?? (await page.$('iframe.diui-frame[data-mode=final]'))
  if (frameHandle) {
    const frame = await frameHandle.contentFrame()
    if (frame) {
      await frame.evaluate(() => {
        const a = document.getElementById('a')
        if (a) {
          a.value = '1.5'
          a.dispatchEvent(new Event('input'))
        }
      })
      await sleep(1200)
      await frame.evaluate(() => document.getElementById('ask')?.click())
      await sleep(3000)
    }
  }
  await page.screenshot({ path: path.join(SHOTS_DIR, '7-widget-sent.png') })
  console.log('Saved 7-widget-sent.png')

  // 3) Test Reload from persistent session log
  console.log('Testing reload session persistence...')
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(4000)
  await page.screenshot({ path: path.join(SHOTS_DIR, '8-reload.png') })
  console.log('Saved 8-reload.png')

  // Stop recording
  try { await cdp.send('Page.stopScreencast') } catch {}
  await sleep(1000)
  await browser.close()
  console.log(`Recorded ${frameCount} frames in total.`)

  console.log('[5/5] Encoding demo video (MP4) and GIF with ffmpeg...')
  const ffmpegCmd = 'ffmpeg'
  const videoPath = path.join(ASSETS_DIR, 'demo.mp4')
  const gifPath = path.join(ASSETS_DIR, 'demo.gif')

  // Run ffmpeg for MP4
  const framesPattern = path.join(FRAMES_DIR, 'frame_%05d.png').replace(/\\/g, '/')
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegCmd, [
      '-y',
      '-framerate', '10',
      '-i', framesPattern,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '22',
      '-preset', 'fast',
      videoPath
    ], { stdio: 'inherit' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg MP4 failed: ' + code)))
  })
  console.log(`Generated video: ${videoPath}`)

  // Run ffmpeg for GIF (optimized palette)
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegCmd, [
      '-y',
      '-i', videoPath,
      '-vf', 'fps=8,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
      gifPath
    ], { stdio: 'inherit' })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg GIF failed: ' + code)))
  })
  console.log(`Generated GIF: ${gifPath}`)

  // Clean up frames directory to save disk space
  try { rmSync(FRAMES_DIR, { recursive: true, force: true }) } catch {}

  console.log('ALL E2E TESTS PASSED AND ASSETS GENERATED SUCCESSFULLY!')
  await cleanup()
}

main().catch(async (err) => {
  console.error('Fatal error during E2E test:', err)
  await cleanup()
  process.exit(1)
})
