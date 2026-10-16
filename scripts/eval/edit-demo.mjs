// Cut the browser-stage screencast into a demo video: waiting-for-the-model
// spans are sped up (the page shows a real-time stopwatch while they run, so
// the edit never hides how long generation took), and intro/outro cards are
// rendered from the report. Needs ffmpeg and Chrome.
//
// Usage: node scripts/eval/edit-demo.mjs <frames-dir> <report.json> <out-dir> [--gif-chapters ②,⑥,⑧]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { findChrome, run } from '../e2e/dsh-web.mjs'

const [framesDir, reportFile, outDir] = process.argv.slice(2)
if (!framesDir || !reportFile || !outDir) {
  console.error('usage: node scripts/eval/edit-demo.mjs <frames-dir> <report.json> <out-dir> [--gif-chapters ②,⑥]')
  process.exit(2)
}
const gifArg = process.argv.indexOf('--gif-chapters')
const GIF_CHAPTERS = gifArg > 0 ? process.argv[gifArg + 1].split(',') : undefined
const W = 1280, H = 800
/** A wait is shown in at most this many seconds of video (and at least 4× faster). */
const MAX_WAIT_S = 4.5

const { frames, marks } = JSON.parse(readFileSync(path.join(framesDir, 'timeline.json'), 'utf8'))
const report = JSON.parse(readFileSync(reportFile, 'utf8'))
mkdirSync(outDir, { recursive: true })

// ---- timing: real frame gaps, idle gaps capped, waits compressed --------------
const spans = []
for (const m of marks) {
  if (m.kind === 'fast') spans.push({ from: m.t, to: Infinity })
  else if (m.kind === 'normal' && spans.length && spans.at(-1).to === Infinity) spans.at(-1).to = m.t
}
for (const s of spans) s.speed = Math.max(4, (Math.min(s.to, frames.at(-1).t) - s.from) / MAX_WAIT_S)
const speedAt = t => spans.find(s => t >= s.from && t < s.to)?.speed ?? 1
const chapters = marks.filter(m => m.kind === 'chapter')
const chapterAt = t => chapters.filter(c => c.t <= t).at(-1)?.label ?? ''

// Sped-up spans keep one frame per output frame (1/30 s): a high-rate
// screencast would otherwise stay long however much each frame is shortened.
const OUT = 1 / 30
const timed = []
let owed = 0
frames.forEach((f, i) => {
  const next = frames[i + 1]
  const gap = next ? next.t - f.t : 1.5
  const speed = speedAt(f.t)
  if (speed === 1) { timed.push({ ...f, d: Math.min(1.2, Math.max(1 / 60, gap)), chapter: chapterAt(f.t) }); owed = 0; return }
  owed += gap / speed
  if (owed >= OUT || !next || speedAt(next.t) === 1) { timed.push({ ...f, d: Math.max(OUT, owed), chapter: chapterAt(f.t) }); owed = 0 }
})

// ---- intro / outro cards -------------------------------------------------------
const layers = report.layers
const pass = l => (l && !l.skipped ? `${l.summary.passed}/${l.summary.total}` : '—')
const ms = v => (v === undefined ? '—' : `${(v / 1000).toFixed(1)} s`)
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#0f172a;
    background:radial-gradient(1200px 600px at 15% 10%,#e0e7ff 0,transparent 60%),radial-gradient(900px 600px at 90% 90%,#dbeafe 0,transparent 55%),#f8fafc}
  .card{width:1040px;padding:56px 64px;border-radius:28px;background:rgba(255,255,255,.82);box-shadow:0 30px 80px rgba(30,41,82,.16);border:1px solid rgba(99,102,241,.15)}
  .kicker{font:700 15px/1 system-ui;letter-spacing:.18em;text-transform:uppercase;color:#4d6bfe}
  h1{font-size:46px;line-height:1.2;margin:18px 0 14px;letter-spacing:-.5px}
  p{font-size:20px;color:#475569;line-height:1.6}
  .chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
  .chip{padding:8px 14px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:15px;font-weight:600}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:30px}
  .tile{padding:22px;border-radius:18px;background:#fff;border:1px solid #e2e8f0}
  .tile b{display:block;font-size:40px;letter-spacing:-1px;margin:6px 0 4px}
  .tile span{font-size:14px;color:#64748b}
  .ok{color:#16a34a}.warn{color:#d97706}
  .foot{margin-top:24px;font-size:15px;color:#64748b}
</style></head><body><div class="card">${body}</div></body></html>`
const date = report.generatedAt.slice(0, 10)
const tone = l => (l && !l.skipped && l.summary.failed === 0 ? 'ok' : 'warn')
const intro = page(`
  <div class="kicker">DeepSeek Harness · Intelligent UI</div>
  <h1>真实模型 Generative UI<br>端到端评测演示</h1>
  <p>真实 DeepSeek 模型 + 真实 DSH Web + 真实浏览器：每张卡片都是模型当场生成的，不是脚本回放。</p>
  <div class="chips"><span class="chip">模型 ${report.model.requested}</span><span class="chip">${date}</span>${report.environment.dsh ? `<span class="chip">DSH ${report.environment.dsh}</span>` : ''}<span class="chip">等待生成的片段已加速 · 右下角为真实耗时</span></div>`)
const b = layers.browser
const outro = page(`
  <div class="kicker">本次评测结果 · ${date}</div>
  <h1>三层结果分别统计</h1>
  <div class="grid">
    <div class="tile"><span>Mock E2E（脚本化模型）</span><b class="${tone(layers.mockE2E)}">${pass(layers.mockE2E)}</b><span>渲染 / 交互 / 持久化管线</span></div>
    <div class="tile"><span>真实模型 · API 结构断言</span><b class="${tone(layers.api)}">${pass(layers.api)}</b><span>选对工具 · Schema · 组件与数据</span></div>
    <div class="tile"><span>真实模型 · 浏览器运行</span><b class="${tone(b)}">${pass(b)}</b><span>首次预览 p50 ${ms(b?.timing?.firstPreviewMs?.p50)} · 生成 p50 ${ms(b?.timing?.generationMs?.p50)}</span></div>
  </div>
  <p class="foot">完整报告：docs/real-model-eval.md · 一条命令复现：npm run eval:real</p>`)

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: W, height: H } })
try {
  const tab = await browser.newPage()
  for (const [name, html] of [['intro', intro], ['outro', outro]]) {
    await tab.setContent(html, { waitUntil: 'load' })
    await tab.screenshot({ path: path.join(framesDir, `${name}.jpg`), type: 'jpeg', quality: 95 })
  }
} finally { await browser.close() }

// ---- encode --------------------------------------------------------------------
function concat(name, list) {
  const lines = []
  for (const f of list) lines.push(`file '${f.file}'`, `duration ${f.d.toFixed(4)}`)
  lines.push(`file '${list.at(-1).file}'`)
  const file = path.join(framesDir, name)
  writeFileSync(file, lines.join('\n'))
  return file
}
const scale = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xf8fafc`
const card = (file, d) => ({ file, d })
const full = [card('intro.jpg', 3.2), ...timed, card('outro.jpg', 4.5)]
const total = full.reduce((a, f) => a + f.d, 0)
const mp4 = path.join(outDir, 'demo.mp4')
run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat('full.txt', full),
  '-vf', `${scale},fps=30,fade=t=in:st=0:d=0.5`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', mp4])
console.log(`video: ${mp4} (${total.toFixed(1)} s, ${spans.length} sped-up waits)`)

// Highlight GIF: selected chapters only, smaller and slower frame rate.
const picked = GIF_CHAPTERS ? timed.filter(f => GIF_CHAPTERS.some(c => f.chapter.startsWith(c))) : timed
if (picked.length) {
  const gif = path.join(outDir, 'demo.gif')
  // Image concat → an intermediate clip first: paletteuse is unreliable on mixed-size image input.
  const clip = path.join(framesDir, 'highlights.mp4')
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat('gif.txt', [card('intro.jpg', 2), ...picked]),
    '-vf', `${scale},fps=10`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', clip])
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip,
    '-vf', 'fps=8,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif])
  console.log(`gif: ${gif}`)
}
if (!existsSync(mp4)) process.exitCode = 1
