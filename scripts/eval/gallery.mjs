// Put the browser-stage screenshots on one uniform canvas for the README
// gallery: every image comes out 1200×750 whatever its source shape (wide
// cards, tall cards, the portrait phone shot), in the demo video's style.
//
// Usage: node scripts/eval/gallery.mjs <screenshots-dir> <out-dir>
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { findChrome } from '../e2e/dsh-web.mjs'

const [src, out] = process.argv.slice(2)
if (!src || !out) {
  console.error('usage: node scripts/eval/gallery.mjs <screenshots-dir> <out-dir>')
  process.exit(2)
}
const W = 1200, H = 750, PAD = 44

mkdirSync(out, { recursive: true })
// Replace the previous gallery (screenshots only; the video, GIF and licence notes stay).
for (const f of readdirSync(out)) if (f.endsWith('.png')) rmSync(path.join(out, f))

const shots = readdirSync(src).filter(f => f.endsWith('.png') && !f.includes('failure'))
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: W, height: H } })
try {
  const page = await browser.newPage()
  for (const file of shots) {
    const data = `data:image/png;base64,${readFileSync(path.join(src, file)).toString('base64')}`
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
      body { display: grid; place-items: center; background: linear-gradient(135deg, #fff1fb 0%, #eef0ff 45%, #e3f6ff 100%); }
      .frame { max-width: ${W - PAD * 2}px; max-height: ${H - PAD * 2}px; border-radius: 22px; border: 3px solid #22305f; background: #fff;
        box-shadow: 0 8px 0 #22305f, 0 24px 48px rgba(54, 81, 216, .18); overflow: hidden; display: flex; }
      img { display: block; max-width: ${W - PAD * 2 - 6}px; max-height: ${H - PAD * 2 - 6}px; object-fit: contain; }
    </style></head><body><div class="frame"><img src="${data}"></div></body></html>`, { waitUntil: 'load' })
    await page.screenshot({ path: path.join(out, file) })
  }
} finally { await browser.close() }
console.log(`${shots.length} screenshots → ${out} (${W}×${H} each)`)
if (!existsSync(out)) process.exitCode = 1
