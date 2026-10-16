// Cut the browser-stage screencast into a designed demo video, narrated by
// 小鲸 (an original, unofficial chibi whale-girl mascot; scripts/eval/demo/).
// The recording itself is untouched except that waiting-for-the-model spans are
// sped up; the page shows a real-time stopwatch during those spans, and the
// sticker shows the speed factor, so the edit never hides how long generation took.
// Every frame is rendered deterministically from its time. Needs ffmpeg and Chrome.
//
// Usage: node scripts/eval/edit-demo.mjs <frames-dir> <report.json> <out-dir> [--gif-chapters ②,⑤,⑧]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import { findChrome, run } from '../e2e/dsh-web.mjs'
import { mascot } from './demo/mascot.mjs'

const [framesDir, reportFile, outDir] = process.argv.slice(2)
if (!framesDir || !reportFile || !outDir) {
  console.error('usage: node scripts/eval/edit-demo.mjs <frames-dir> <report.json> <out-dir> [--gif-chapters ②,⑤,⑧]')
  process.exit(2)
}
const gifArg = process.argv.indexOf('--gif-chapters')
const GIF_CHAPTERS = gifArg > 0 ? process.argv[gifArg + 1].split(',') : undefined
const FPS = 30
/** A wait is shown in at most this many seconds of video (and at least 4× faster). */
const MAX_WAIT_S = 4.5

const { frames, marks } = JSON.parse(readFileSync(path.join(framesDir, 'timeline.json'), 'utf8'))
const report = JSON.parse(readFileSync(reportFile, 'utf8'))
mkdirSync(outDir, { recursive: true })

// ---- recording timeline: real frame gaps, idle gaps capped, waits compressed ----
const spans = []
for (const m of marks) {
  if (m.kind === 'fast') spans.push({ from: m.t, to: Infinity })
  else if (m.kind === 'normal' && spans.length && spans.at(-1).to === Infinity) spans.at(-1).to = m.t
}
for (const s of spans) s.speed = Math.max(4, (Math.min(s.to, frames.at(-1).t) - s.from) / MAX_WAIT_S)
const speedAt = t => spans.find(s => t >= s.from && t < s.to)?.speed ?? 1
const chapterMarks = marks.filter(m => m.kind === 'chapter')
const chapterAt = t => chapterMarks.filter(c => c.t <= t).at(-1)?.label ?? ''

// Sped-up spans keep one frame per output frame: a high-rate screencast would
// otherwise stay long however much each frame is shortened.
const timed = []
let owed = 0
frames.forEach((f, i) => {
  const next = frames[i + 1]
  const gap = next ? next.t - f.t : 1.5
  const speed = speedAt(f.t)
  const base = { file: f.file, label: chapterAt(f.t), speed }
  if (speed === 1) { timed.push({ ...base, d: Math.min(1.2, Math.max(1 / 60, gap)) }); owed = 0; return }
  owed += gap / speed
  if (owed >= 1 / FPS || !next || speedAt(next.t) === 1) { timed.push({ ...base, d: Math.max(1 / FPS, owed) }); owed = 0 }
})

// ---- the script: one chapter per browser case, narrated by 小鲸 ------------------
const SCRIPT = {
  '①': { title: '纯文本问答', sub: '不该出界面的时候，就好好说话', line: '普通问题就用文字回答，\n不会乱弹界面♪', pose: 'idle', mouth: 'smile' },
  '②': { title: '多系列柱状图', sub: '模型自己选择 ui_render', line: '要对比图？模型自己选了「ui_render」，\n柱状图马上画出来！', pose: 'point' },
  '③': { title: '可排序数据表', sub: '点表头，本地排序', line: '点一下表头就重新排序，\n全在浏览器本地完成哦♪', pose: 'point' },
  '④': { title: '表单交互回传', sub: '提交的值回到模型手里', line: '填好表单点提交，\n模型拿着你的数据接着干活！', pose: 'wave' },
  '⑤': { title: '数学函数 Plot', sub: '滑块拖动，曲线实时重绘', line: '拖动滑块，阻尼振动曲线\n实时变化♪不用再问模型！', pose: 'point', mouth: 'cat' },
  '⑥': { title: 'Three.js 3D 曲面', sub: '沙箱 iframe 里的 WebGL', line: '3D 球面！在沙箱 iframe 里\n用 WebGL 渲染，可以拖着转♪', pose: 'wave' },
  '⑦': { title: '停止 / 恢复', sub: '中途停下，一键重新生成', line: '生成到一半也能停下来，\n再点「重新生成」就好啦', pose: 'point' },
  '⑧': { title: '多轮连续修改', sub: 'ui_patch 原地更新同一张卡片', line: '改成折线图、再加个系列——\n同一张卡片原地升级到第 3 版！', pose: 'cheer', expr: 'happy' },
  '⑨': { title: '弱网络', sub: 'Fast 3G + 禁用缓存', line: '网速很慢也没关系，\n慢慢加载照样能用♪', pose: 'think', mouth: 'cat' },
  '⑩': { title: '无网络', sub: 'CDN 不可达', line: 'CDN 连不上？卡片会老实告诉你\n出错了，对话照常继续！', pose: 'oops', expr: 'oops', mouth: 'wavy' },
  '⑪': { title: '手机宽度', sub: '390 px 也要整整齐齐', line: '手机上也排得整整齐齐！', pose: 'cheer', expr: 'happy' },
}
const OOPS = { line: '哎呀！模型写的脚本报错了…\n点「让模型修复」试试！', fixed: '修好啦！✨\n错误回传给模型，它自己改对了', pose: 'oops', expr: 'oops', mouth: 'wavy' }
const FAST_LINE = '模型认真思考中…\n小鲸帮你快进一下 ⏩'
const numOf = label => (SCRIPT[label[0]] ? label[0] : label.startsWith('脚本出错') ? '⑥' : null)
const ORDER = Object.keys(SCRIPT)

// Group recording frames into chapters (sub-captions stay inside their chapter).
const groups = []
for (const f of timed) {
  const n = numOf(f.label)
  if (!n) continue // the closing "all done" frames: the outro covers that
  if (groups.at(-1)?.num !== n) groups.push({ num: n, frames: [] })
  groups.at(-1).frames.push(f)
}

// ---- scenes: intro → (card → recording) per chapter → outro ---------------------
const INTRO = 6.5, CARD = 1.9, OUTRO = 9
const scenes = [{ kind: 'intro', start: 0, end: INTRO }]
let cursor = INTRO
for (const g of groups) {
  scenes.push({ kind: 'card', num: g.num, start: cursor, end: cursor + CARD })
  cursor += CARD
  let at = cursor
  const list = g.frames.map(f => { const x = { ...f, at }; at += f.d; return x })
  scenes.push({ kind: 'rec', num: g.num, frames: list, start: cursor, end: at })
  cursor = at
}
scenes.push({ kind: 'outro', start: cursor, end: cursor + OUTRO })
const TOTAL = cursor + OUTRO

// ---- helpers ------------------------------------------------------------------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const backOut = x => { const c = 1.70158; const y = clamp(x) - 1; return 1 + (c + 1) * y * y * y + c * y * y }
const pop = (t, delay = 0, dur = 0.45) => backOut((t - delay) / dur)
const layers = report.layers
const pass = l => (l && !l.skipped ? `${l.summary.passed}/${l.summary.total}` : '—')
const tone = l => (l && !l.skipped && l.summary.failed === 0 ? 'ok' : 'warn')
const sec = v => (v === undefined ? '—' : `${(v / 1000).toFixed(1)} s`)
const date = report.generatedAt.slice(0, 10)
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const NOTE = '<div class="note">小鲸是本项目原创的非官方同人形象，与 DeepSeek 官方无关</div>'

function introCard(t) {
  const s1 = pop(t, 0.2), s2 = pop(t, 0.7), s3 = pop(t, 1.2)
  return `<div style="position:absolute;left:70px;top:150px;width:720px">
      <div style="transform:scale(${s1.toFixed(3)});transform-origin:0 50%;margin-bottom:26px"><span class="chip" style="background:#ffe3ef">✦ DeepSeek Harness 插件</span><span class="chip" style="background:#e3e9ff">Intelligent UI</span></div>
      <div class="title" style="transform:translateY(${((1 - s2) * 40).toFixed(1)}px);opacity:${clamp(s2).toFixed(2)}">真实 <span class="b">DeepSeek</span> 模型<br>生成界面 <span class="p">实测！</span></div>
      <div style="margin-top:34px;transform:scale(${s3.toFixed(3)});transform-origin:0 50%">
        <span class="chip">🐳 ${esc(report.model.requested)}</span><span class="chip">📅 ${date}</span><span class="chip">DSH ${esc(report.environment.dsh ?? '')}</span><br>
        <span class="chip" style="background:#fff7d6">⏩ 等待片段已加速 · 右下角秒表为真实耗时</span>
      </div></div>${NOTE}`
}

function chapterCard(num, t) {
  const sc = SCRIPT[num]
  const b = pop(t, 0.05), ti = pop(t, 0.25), su = pop(t, 0.45)
  return `<div style="position:absolute;left:110px;top:200px;display:flex;align-items:center;gap:40px">
      <div class="badge" style="transform:scale(${b.toFixed(3)}) rotate(${((1 - clamp(b)) * -30).toFixed(1)}deg)">${num}</div>
      <div>
        <div class="title" style="font-size:72px;transform:translateX(${((1 - ti) * -60).toFixed(1)}px);opacity:${clamp(ti).toFixed(2)}">${esc(sc.title)}</div>
        <div style="margin-top:20px;transform:scale(${su.toFixed(3)});transform-origin:0 50%"><span class="chip" style="font-size:20px">${esc(sc.sub)}</span></div>
      </div></div>`
}

function outroCard(t) {
  const b = layers.browser
  const card = (k, l, s, i) => `<div class="result" style="transform:scale(${pop(t, 0.5 + i * 0.25).toFixed(3)})"><div class="k">${k}</div><div class="v ${tone(l)}">${pass(l)}</div><div class="s">${s}</div></div>`
  return `<div style="position:absolute;left:70px;top:110px;width:820px">
      <div class="title" style="font-size:60px;transform:scale(${pop(t, 0.1).toFixed(3)});transform-origin:0 50%">实测结果 <span class="p">${date}</span></div>
      <div style="margin-top:36px">
        ${card('Mock E2E · 脚本化模型', layers.mockE2E, '渲染 / 交互 / 持久化管线', 0)}
        ${card('真实模型 · API 结构断言', layers.api, '选对工具 · 首次 Schema · 组件与数据', 1)}
        ${card('真实模型 · 浏览器运行', b, `首次预览 p50 ${sec(b?.timing?.firstPreviewMs?.p50)} · 生成 p50 ${sec(b?.timing?.generationMs?.p50)}`, 2)}
      </div>
      <div style="margin-top:40px;transform:scale(${pop(t, 1.4).toFixed(3)});transform-origin:0 50%">
        <span class="chip" style="background:#1f2b57;color:#fff;font-family:Consolas,monospace">$ npm run eval:real</span><span class="chip">报告：docs/real-model-eval.md</span>
      </div></div>${NOTE}`
}

/** Everything the stage needs for output time T. */
function frameState(T, files) {
  const scene = scenes.find(s => T >= s.start && T < s.end) ?? scenes.at(-1)
  const t = T - scene.start
  const index = scene.num ? ORDER.indexOf(scene.num) : scene.kind === 'outro' ? ORDER.length : -1
  const st = { t: T, scene: scene.kind === 'rec' ? 'rec' : 'card', total: ORDER.length, current: index, confetti: false }
  let m = { pose: 'idle', expr: 'normal', mouth: 'smile', talking: false }
  let bubble = null, since = 0

  if (scene.kind === 'intro') {
    st.cardHtml = introCard(t)
    m = t < 3.2 ? { pose: 'wave', expr: 'normal', mouth: 'smile', talking: t > 0.8 && t < 3 } : { pose: 'sign', expr: 'happy', mouth: 'smile' }
    bubble = t < 3.2 ? '大家好♪我是小鲸！🐳\n今天用真实的 DeepSeek 模型\n实测 Intelligent UI 插件！' : '每张卡片都是模型\n当场生成的，不是回放哦！'
    since = t < 3.2 ? t - 0.8 : t - 3.2
    Object.assign(st, { mx: 870, my: 300, mw: 320, ms: pop(t, 0, 0.6), bubblePos: { left: '846px', top: '84px', width: '360px' } })
    if (t < 0.8) bubble = null
  } else if (scene.kind === 'card') {
    st.cardHtml = chapterCard(scene.num, t)
    const sc = SCRIPT[scene.num]
    m = { pose: sc.pose === 'oops' ? 'oops' : 'wave', expr: sc.expr ?? 'normal', mouth: 'o', talking: false }
    Object.assign(st, { mx: 930, my: 300 + (1 - clamp(t / 0.5)) * 420, mw: 300, mr: Math.sin(T * 5) * 3 })
  } else if (scene.kind === 'outro') {
    st.cardHtml = outroCard(t)
    st.confetti = true
    const bye = t > OUTRO - 2.6
    m = bye ? { pose: 'wave', expr: 'normal', mouth: 'smile', talking: t < OUTRO - 1.2 } : { pose: 'cheer', expr: 'happy', mouth: 'smile', talking: t > 0.6 && t < 3 }
    bubble = bye ? '感谢观看♪\n下次见！👋' : '全部测完啦！\n失败也如实写进了报告♪'
    since = bye ? t - (OUTRO - 2.6) : t - 0.6
    Object.assign(st, { mx: 930, my: 300, mw: 300 })
  } else {
    // recording
    const list = scene.frames
    let lo = 0, hi = list.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (list[mid].at <= T) lo = mid; else hi = mid - 1 }
    const f = list[lo]
    const sc = SCRIPT[scene.num]
    Object.assign(st, { src: files(f.file), chapter: `${scene.num} ${sc.title}`, fast: f.speed > 1, speed: Math.round(f.speed), winScale: 0.94 + 0.06 * pop(t, 0, 0.4), mx: 966, my: 336, mw: 280 })
    const oopsFrames = scene.num === '⑥' ? list.filter(x => x.label.startsWith('脚本出错')) : []
    // The script error is on screen just before the "脚本出错" caption; the
    // repaired scene shows early in the (long, sped-up) repair wait.
    const oopsAt = oopsFrames.length ? oopsFrames[0].at - 2.5 : Infinity
    const repair = oopsFrames.filter(x => x.speed > 1)
    const fixedAt = repair.length ? repair[0].at + 0.12 * repair.reduce((a, x) => a + x.d, 0) : Infinity
    const inOops = T >= oopsAt
    if (inOops && T >= fixedAt) {
      m = { pose: 'cheer', expr: 'happy', mouth: 'smile', talking: T - fixedAt < 2 }
      bubble = OOPS.fixed
      since = T - fixedAt
    } else if (inOops && f.speed === 1) {
      m = { pose: OOPS.pose, expr: OOPS.expr, mouth: OOPS.mouth, talking: false }
      bubble = OOPS.line
      since = T - oopsAt
    } else if (f.speed > 1) {
      // Find where this fast run started, for the typewriter.
      let k = lo; while (k > 0 && list[k - 1].speed > 1) k--
      m = { pose: 'think', expr: 'normal', mouth: 'cat', talking: false }
      bubble = FAST_LINE
      since = T - list[k].at
    } else {
      // The chapter line, retyped after each fast run.
      let k = lo; while (k > 0 && list[k - 1].speed === 1) k--
      m = { pose: sc.pose, expr: sc.expr ?? 'normal', mouth: sc.mouth ?? 'smile', talking: T - list[k].at < 2.2 }
      bubble = sc.line
      since = T - list[k].at
    }
  }
  st.bubble = bubble
  st.reveal = bubble ? since / Math.max(0.6, [...bubble].length * 0.045) : 0
  st.bubbleScale = bubble ? 0.85 + 0.15 * pop(since, 0, 0.3) : 1
  st.mascot = mascot({ ...m, t: T, width: 300 })
  return st
}

// ---- render ----------------------------------------------------------------------
const outFrames = path.join(framesDir, 'composite')
rmSync(outFrames, { recursive: true, force: true })
mkdirSync(outFrames, { recursive: true })
const fileUrl = f => pathToFileURL(path.resolve(framesDir, f)).href
const count = Math.ceil(TOTAL * FPS)
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, defaultViewport: { width: 1280, height: 720 }, args: ['--allow-file-access-from-files'] })
const sceneTimes = []
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'demo', 'stage.html')).href)
  await page.evaluate(() => document.fonts.ready)
  // DEMO_PREVIEW=1.5,9,20 renders just those times to preview-*.png (for design checks).
  if (process.env.DEMO_PREVIEW) {
    for (const T of process.env.DEMO_PREVIEW.split(',').map(Number)) {
      await page.evaluate(st => window.renderFrame(st), frameState(T, fileUrl))
      await page.screenshot({ path: path.join(framesDir, `preview-${T}.png`) })
    }
    console.log(JSON.stringify(scenes.map(s => ({ kind: s.kind, num: s.num, start: +s.start.toFixed(1), end: +s.end.toFixed(1) }))))
    process.exit(0)
  }
  const started = Date.now()
  for (let i = 0; i < count; i++) {
    const T = i / FPS
    await page.evaluate(st => window.renderFrame(st), frameState(T, fileUrl))
    await page.screenshot({ path: path.join(outFrames, `c${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 })
    if (i % 300 === 0) console.log(`frame ${i}/${count} · ${((Date.now() - started) / 1000).toFixed(0)} s`)
  }
} finally { await browser.close() }
for (const s of scenes) if (s.num) sceneTimes.push({ num: s.num, kind: s.kind, start: s.start, end: s.end })

// ---- encode ------------------------------------------------------------------------
const mp4 = path.join(outDir, 'demo.mp4')
run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(outFrames, 'c%05d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', mp4])
console.log(`video: ${mp4} (${TOTAL.toFixed(1)} s, ${spans.length} sped-up waits)`)

// Highlight GIF: the intro plus the chosen chapters (card + recording).
if (GIF_CHAPTERS) {
  const ranges = [[0, INTRO], ...sceneTimes.filter(s => GIF_CHAPTERS.includes(s.num)).map(s => [s.start, s.end])]
  const select = ranges.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')
  const clip = path.join(framesDir, 'highlights.mp4')
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', `select='${select}',setpts=N/FRAME_RATE/TB`, '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', clip])
  const gif = path.join(outDir, 'demo.gif')
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip,
    '-vf', 'fps=8,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', gif])
  console.log(`gif: ${gif}`)
}
writeFileSync(path.join(framesDir, 'scenes.json'), JSON.stringify(sceneTimes, null, 1))
if (!existsSync(mp4)) process.exitCode = 1
