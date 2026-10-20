// Render a recorded demo (frames + track.json from record-features.mjs) into an
// MP4 whose virtual camera follows the interaction: it eases toward the area
// being used, keeps the cursor in view, holds still between actions and pulls
// back to the whole page while a reply streams in. Waits for the model are
// fast-forwarded (a badge shows the speed). The cursor, click ripples and
// captions are drawn on top.
//
//   node scripts/demo/camera.mjs <demo-dir> <out.mp4>
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import { launchBrowser, run } from '../e2e/dsh-web.mjs'

const OUT_W = 1280
const OUT_H = 720
const FPS = 30

/** Compositor page: everything runs in the browser, one canvas per output frame. */
const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="c" width="${OUT_W}" height="${OUT_H}"></canvas>
<script>
const W = ${OUT_W}, H = ${OUT_H}, FPS = ${FPS}
const ctx = document.getElementById('c').getContext('2d')
async function render() {
  const track = await (await fetch('/track.json')).json()
  const { view, frames, events } = track
  const t0 = frames[0].t, tEnd = Math.max(frames.at(-1).t, events.at(-1)?.t ?? 0) + 1.2
  // Model waits: each plays at a speed that fits it into at most MAX_WAIT seconds.
  const MAX_WAIT = 4
  const waits = []
  for (const e of events) {
    if (e.type === 'wait') waits.push({ from: e.t, to: tEnd })
    if (e.type === 'waited' && waits.length) waits.at(-1).to = e.t
  }
  for (const w of waits) w.speed = Math.max(1, (w.to - w.from) / MAX_WAIT)
  const speedAt = t => waits.find(w => t >= w.from && t < w.to)?.speed ?? 1
  const times = []
  for (let t = Math.max(t0, events[0]?.t ?? t0); t < tEnd; t += speedAt(t) / FPS) times.push(t)
  const total = times.length
  const cursors = events.filter(e => e.type === 'cursor')
  const clicks = events.filter(e => e.type === 'click')
  const keys = events.filter(e => e.type === 'key')
  const captions = events.filter(e => e.type === 'caption')
  const focuses = events.filter(e => e.type === 'focus')
  const aspect = W / H
  const full = { cx: view.width / 2, cy: view.height / 2, w: view.width }
  // Camera target for a focus area: fit it (with margin) at 16:9, never smaller than 520px wide.
  function targetOf(f) {
    if (!f || f.wide) return { ...full }
    let w = Math.max(f.w * 1.12, f.h * 1.12 * aspect, 520)
    w = Math.min(w, view.width)
    return { cx: f.x + f.w / 2, cy: f.y + f.h / 2, w }
  }
  function clamp(cam) {
    const h = cam.w / aspect
    cam.cx = Math.min(Math.max(cam.cx, cam.w / 2), view.width - cam.w / 2)
    cam.cy = Math.min(Math.max(cam.cy, h / 2), view.height - h / 2)
    return cam
  }
  const latest = (list, t) => { let r; for (const e of list) { if (e.t <= t) r = e; else break } return r }
  function cursorAt(t) {
    let a, b
    for (const e of cursors) { if (e.t <= t) a = e; else { b = e; break } }
    if (!a) return undefined
    if (!b || b.t - a.t > 0.25) return a
    const k = (t - a.t) / (b.t - a.t)
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
  }
  let cam = { ...full }
  let frameIdx = -1, bitmap
  for (let i = 0; i < total; i++) {
    const t = times[i]
    const speed = speedAt(t)
    // Source frame: the latest screencast frame at or before t.
    let fi = frameIdx < 0 ? 0 : frameIdx
    if (frames[fi].t > t && fi > 0) fi = 0
    while (fi + 1 < frames.length && frames[fi + 1].t <= t) fi++
    if (fi !== frameIdx) {
      frameIdx = fi
      bitmap?.close?.()
      bitmap = await createImageBitmap(await (await fetch('/frames/' + frames[fi].file)).blob())
    }
    // Camera: ease toward the focus area; keep the cursor inside the inner 80%.
    const target = targetOf(latest(focuses, t))
    const cur = cursorAt(t)
    if (cur && target.w < view.width) {
      const hw = target.w * 0.4, hh = target.w / aspect * 0.4
      if (cur.x < target.cx - hw) target.cx = cur.x + hw
      if (cur.x > target.cx + hw) target.cx = cur.x - hw
      if (cur.y < target.cy - hh) target.cy = cur.y + hh
      if (cur.y > target.cy + hh) target.cy = cur.y - hh
    }
    clamp(target)
    const k = i === 0 ? 1 : 1 - Math.exp(-Math.min(speed, 3) / FPS / 0.32)
    cam = clamp({ cx: cam.cx + (target.cx - cam.cx) * k, cy: cam.cy + (target.cy - cam.cy) * k, w: cam.w + (target.w - cam.w) * k })
    const ch = cam.w / aspect
    const sx = cam.cx - cam.w / 2, sy = cam.cy - ch / 2
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    ctx.imageSmoothingQuality = 'high'
    // Screencast frames may come at CSS or device pixels; measure instead of assuming.
    const scale = bitmap.width / view.width
    ctx.drawImage(bitmap, sx * scale, sy * scale, cam.w * scale, ch * scale, 0, 0, W, H)
    const z = W / cam.w
    const map = p => ({ x: (p.x - sx) * z, y: (p.y - sy) * z })
    // Click ripples.
    for (const c of clicks) {
      const age = t - c.t
      if (age < 0 || age > 0.5) continue
      const p = map(c)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 8 + age * 70 * Math.min(z, 1.6), 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(77,107,254,' + (0.85 * (1 - age / 0.5)) + ')'
      ctx.lineWidth = 3
      ctx.stroke()
    }
    // Cursor (classic arrow), scaled gently with the zoom.
    if (cur) {
      const p = map(cur), s = Math.min(1.5, Math.max(1, z * 0.85))
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s)
      ctx.beginPath()
      ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.2, 13); ctx.lineTo(7.3, 19.6); ctx.lineTo(10, 18.4); ctx.lineTo(7, 11.9); ctx.lineTo(12.4, 11.9); ctx.closePath()
      ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4
      ctx.fill(); ctx.shadowBlur = 0; ctx.stroke()
      ctx.restore()
    }
    if (speed > 1.5) pill('⏩ ×' + Math.round(speed) + '  model answering', W - 24, 36, 'right', 18)
    // Key presses show as a small keycap for a moment.
    const kp = latest(keys, t)
    if (kp && t - kp.t < 0.6) pill(({ ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', Enter: '⏎ Enter' })[kp.key] ?? kp.key, W - 24, H - 84, 'right', 20)
    // Caption.
    const cap = latest(captions, t)
    if (cap) {
      const age = t - cap.t
      ctx.globalAlpha = Math.min(1, age / 0.3)
      pill(cap.text, W / 2, H - 40, 'center', 22)
      ctx.globalAlpha = 1
    }
    const blob = await new Promise(r => document.getElementById('c').toBlob(r, 'image/jpeg', 0.92))
    await fetch('/out/' + String(i).padStart(5, '0') + '.jpg', { method: 'POST', body: blob })
  }
  return total
}
function pill(text, x, y, align, size) {
  ctx.font = '600 ' + size + 'px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'
  const w = ctx.measureText(text).width + size * 1.4, h = size * 1.9
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  ctx.fillStyle = 'rgba(15,17,21,.86)'
  ctx.beginPath(); ctx.roundRect(left, y - h / 2, w, h, h / 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillText(text, left + size * 0.7, y + 1)
}
</script>`

export async function renderDemo(dir, outFile) {
  const outFrames = path.join(dir, 'out')
  rmSync(outFrames, { recursive: true, force: true })
  mkdirSync(outFrames, { recursive: true })
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/out/')) {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => { writeFileSync(path.join(outFrames, path.basename(req.url)), Buffer.concat(chunks)); res.end('ok') })
      return
    }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(PAGE); return }
    if (req.url === '/track.json') { res.setHeader('Content-Type', 'application/json'); res.end(readFileSync(path.join(dir, 'track.json'))); return }
    if (req.url.startsWith('/frames/')) { res.setHeader('Content-Type', 'image/jpeg'); res.end(readFileSync(path.join(dir, 'frames', path.basename(req.url)))); return }
    res.writeHead(404).end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const browser = await launchBrowser(puppeteer, { defaultViewport: { width: OUT_W, height: OUT_H } })
  try {
    const page = await browser.newPage()
    page.on('pageerror', e => console.error('compositor:', e.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.evaluate(() => render(), { timeout: 0 })
  } finally {
    await browser.close()
    server.close()
  }
  run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(outFrames, '%05d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', outFile])
  return outFile
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dir, outFile] = process.argv.slice(2)
  if (!dir || !outFile) { console.error('usage: node scripts/demo/camera.mjs <demo-dir> <out.mp4>'); process.exit(2) }
  console.log(await renderDemo(path.resolve(dir), path.resolve(outFile)))
}
