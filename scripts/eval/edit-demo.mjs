// Cut the browser-stage screencast into a designed demo video narrated by the
// whale girl: ~30 poses from Sutera-Diffusus/dsh-whale-musume (MIT; see
// scripts/eval/demo/assets/whale/LICENSE). The recording itself is untouched
// except that marked non-content spans are cut and waiting-for-the-model spans
// are sped up; the page shows a real-time stopwatch during those spans and the
// sticker shows the speed factor, so the edit never hides how long generation
// took. Every frame is rendered deterministically from its time. Needs ffmpeg and Chrome.
//
// Usage: node scripts/eval/edit-demo.mjs <frames-dir> <report.json> <out-dir> [--gif-chapters ②,⑤,⑧]
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import { findChrome, run } from '../e2e/dsh-web.mjs'

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
// Recorder marks: `cut`…`uncut` is not content (new conversation, screenshots,
// viewport switches); `hold`…`unhold` shows a case's result and keeps real time.
const ranges = (open, close) => {
  const out = []
  for (const m of marks) {
    if (m.kind === open) out.push({ from: m.t, to: Infinity })
    else if (m.kind === close && out.length && out.at(-1).to === Infinity) out.at(-1).to = m.t
  }
  return out
}
const cuts = ranges('cut', 'uncut')
const holds = ranges('hold', 'unhold')
const inside = (list, t) => list.some(r => t >= r.from && t < r.to)

/** Width × height from a JPEG's frame header (reads only the first 64 KB). */
function jpegSize(file) {
  const fd = openSync(file, 'r')
  const b = Buffer.alloc(65536)
  const n = readSync(fd, b, 0, b.length, 0)
  closeSync(fd)
  for (let i = 2; i + 9 < n;) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return { w: 0, h: 0 }
}
// Element screenshots (canvas pixel checks) and temporarily enlarged viewports
// (tall-card screenshots) show up in the screencast as frames of other sizes,
// and its timestamps use a different clock than our marks. Keep only the two
// real viewports: desktop 1280×800 and the phone case's 390×844.
const VIEWPORTS = new Set(['1280x800', '390x844'])
const stray = f => { const { w, h } = jpegSize(path.join(framesDir, f.file)); return !VIEWPORTS.has(`${w}x${h}`) }
const chapterMarks = marks.filter(m => m.kind === 'chapter')
const chapterAt = t => chapterMarks.filter(c => c.t <= t).at(-1)?.label ?? ''

// Sped-up spans keep one frame per output frame: a high-rate screencast would
// otherwise stay long however much each frame is shortened.
const timed = []
let owed = 0
frames.forEach((f, i) => {
  if (inside(cuts, f.t) || stray(f)) return
  const next = frames[i + 1]
  // A frame lasts until the next one, but never into a cut.
  const end = next ? Math.min(next.t, cuts.find(r => r.from > f.t)?.from ?? Infinity) : f.t + 1.5
  const gap = end - f.t
  const speed = speedAt(f.t)
  const base = { file: f.file, label: chapterAt(f.t), speed, hold: inside(holds, f.t) }
  // A held result is a still screen: keep its real duration instead of capping idle gaps.
  if (speed === 1) { timed.push({ ...base, d: base.hold ? Math.max(1 / 60, gap) : Math.min(1.2, Math.max(1 / 60, gap)) }); owed = 0; return }
  owed += gap / speed
  if (owed >= 1 / FPS || !next || speedAt(next.t) === 1) { timed.push({ ...base, d: Math.max(1 / FPS, owed) }); owed = 0 }
})

// ---- the script: one chapter per browser case, narrated by the whale girl -------
const SCRIPT = {
  '①': { title: '纯文本问答', sub: '不该出界面的时候，就好好说话', line: '普通问题就用文字回答，\n不会乱弹界面♪', pose: 'idle' },
  '②': { title: '多系列柱状图', sub: '模型自己选择 ui_render', line: '要对比图？模型自己选了「ui_render」，\n柱状图马上画出来！', pose: 'point' },
  '③': { title: '可排序数据表', sub: '点表头，本地排序', line: '点一下表头就重新排序，\n全在浏览器本地完成哦♪', pose: 'point' },
  '④': { title: '表单交互回传', sub: '提交的值回到模型手里', line: '填好表单点提交，\n模型拿着你的数据接着干活！', pose: 'wave' },
  '⑤': { title: '数学函数 Plot', sub: '滑块拖动，曲线实时重绘', line: '拖动滑块，阻尼振动曲线\n实时变化♪不用再问模型！', pose: 'point' },
  '⑥': { title: 'Three.js 3D 曲面', sub: '沙箱 iframe 里的 WebGL', line: '3D 球面！在沙箱 iframe 里\n用 WebGL 渲染，可以拖着转♪', pose: 'wave' },
  '⑦': { title: '停止 / 恢复', sub: '中途停下，一键重新生成', line: '生成到一半也能停下来，\n再点「重新生成」就好啦', pose: 'point' },
  '⑧': { title: '多轮连续修改', sub: 'ui_patch 原地更新同一张卡片', line: '改成折线图、再加个系列——\n同一张卡片原地升级到第 3 版！', pose: 'cheer' },
  '⑨': { title: '弱网络', sub: 'Fast 3G + 禁用缓存', line: '网速很慢也没关系，\n慢慢加载照样能用♪', pose: 'think' },
  '⑩': { title: '无网络', sub: 'CDN 不可达', line: 'CDN 连不上？卡片会老实告诉你\n出错了，对话照常继续！', pose: 'oops' },
  '⑪': { title: '手机宽度', sub: '390 px 也要整整齐齐', line: '手机上也排得整整齐齐！', pose: 'cheer' },
}
// Chapter → browser case, and that case's real outcome (automated result,
// overturned by a failing manual review). Failed chapters get an honest line.
const CASE = { '①': 'R-text', '②': 'R-chart', '③': 'R-table', '④': 'R-form', '⑤': 'R-plot', '⑥': 'R-three', '⑦': 'R-stop', '⑧': 'R-patch', '⑨': 'R-weak', '⑩': 'R-offline', '⑪': 'R-mobile' }
const FAIL_LINES = {
  'R-chart': '图表画出来了…但卡片显示\n「生成已中断」，人工复核判为失败 ✗',
  'R-table': '模型跑去上网查了 5 分钟资料…\n表格没能按时出来，判为失败 ✗',
}
const outcome = num => {
  const id = CASE[num]
  const c = report.layers.browser?.cases?.find(x => x.id === id)
  const manualFail = (report.manualReview || []).some(r => r.id.split(' ')[0] === id && /^fail/.test(r.verdict))
  return { id, passed: !!c?.passed && !manualFail }
}
const OOPS = { line: '哎呀！模型写的脚本报错了…\n点「让模型修复」试试！', fixed: '修好啦！✨ 错误回传给模型改对了\n（首次生成仍记为失败）', pose: 'oops' }
const FAST_LINE = '模型认真思考中…\n帮你快进一下 ⏩'
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

/**
 * The illustration is a single still, so each narration pose is a motion
 * (as in the DSH whale-girl pet): float, talk-bob, think-sway, cheer-jump,
 * oops-droop (greyed, trembling), lean. `fx` adds a small effect overlay.
 */
// Poses (scripts/eval/demo/assets/whale/<name>.webp) for each beat; a beat
// cycles through its list so she never stands still in one picture.
const TALK = {
  '①': ['wink', 'idle-cute'], '②': ['curious', 'star'], '③': ['work-review', 'curious'], '④': ['meme-yes', 'wink'],
  '⑤': ['work-idea', 'star'], '⑥': ['running', 'work-debug'], '⑦': ['waiting', 'meme-peace'], '⑧': ['tail-swing', 'celebrate'],
  '⑨': ['weather-umbrella', 'waiting'], '⑩': ['weather-thunder', 'meme-omg'], '⑪': ['cool-shades', 'wink'],
}
const LOOKS = {
  hello: ['greet'], intro: ['idle-cute', 'star', 'wink'],
  think: ['thinking', 'running', 'work-review'], slowNet: ['weather-umbrella', 'waiting'],
  oops: ['meme-omg', 'meme-shock'], fixed: ['success', 'celebrate'],
  cheer: ['celebrate', 'levelup', 'achievement'], bye: ['greet', 'wink'],
  fail: { 'R-chart': ['meme-shock', 'failure'], 'R-table': ['work-deadline', 'failure'] },
  failDefault: ['failure', 'meme-cry'],
}
const POSE_PERIOD = 2.6, POSE_FADE = 0.35
/** Current pose, the one fading out, and the crossfade mix, `elapsed` seconds into a beat. */
function lookAt(looks, elapsed) {
  const e = Math.max(0, elapsed)
  const n = looks.length
  const i = Math.floor(e / POSE_PERIOD)
  const phase = e - i * POSE_PERIOD
  return { img: looks[i % n], prev: i > 0 && n > 1 && phase < POSE_FADE ? looks[(i - 1) % n] : null, mix: phase < POSE_FADE && i > 0 ? phase / POSE_FADE : 1 }
}

function petMotion(pose, t) {
  const S = Math.sin
  switch (pose) {
    case 'think': return { x: S(t * 2.4) * 8, y: S(t * 4.8) * 2, r: S(t * 2.4) * 6, s: 1, filter: '', fx: 'think' }
    case 'cheer': return { x: 0, y: -Math.abs(S(t * 5.5)) * 26, r: S(t * 11) * 4, s: 1.02, filter: 'saturate(1.08)', fx: 'sparkle' }
    case 'oops': return { x: S(t * 30) * 1.5, y: 6, r: -3 + S(t * 28) * 1.2, s: 0.98, filter: '', fx: 'sweat' }
    case 'sign': return { x: 0, y: S(t * 2) * 5, r: S(t * 3) * 7, s: 1, filter: '', fx: 'note' }
    case 'point': case 'wave': return { x: 0, y: -Math.abs(S(t * 4.5)) * 9, r: S(t * 2.2) * 3, s: 1, filter: '', fx: '' }
    default: return { x: 0, y: S(t * 2) * 6, r: 0, s: 1 + S(t * 2) * 0.012, filter: '', fx: '' }
  }
}

function introCard(t) {
  const s1 = pop(t, 0.2), s2 = pop(t, 0.7), s3 = pop(t, 1.2)
  return `<div style="position:absolute;left:70px;top:150px;width:720px">
      <div style="transform:scale(${s1.toFixed(3)});transform-origin:0 50%;margin-bottom:26px"><span class="chip" style="background:#ffe3ef">✦ DeepSeek Harness 插件</span><span class="chip" style="background:#e3e9ff">Intelligent UI</span></div>
      <div class="title" style="transform:translateY(${((1 - s2) * 40).toFixed(1)}px);opacity:${clamp(s2).toFixed(2)}">真实 <span class="b">DeepSeek</span> 模型<br>生成界面 <span class="p">实测！</span></div>
      <div style="margin-top:34px;transform:scale(${s3.toFixed(3)});transform-origin:0 50%">
        <span class="chip">🐳 ${esc(report.model.requested)}</span><span class="chip">📅 ${date}</span><span class="chip">DSH ${esc(report.environment.dsh ?? '')}</span><br>
        <span class="chip" style="background:#fff7d6">⏩ 等待片段已加速 · 右下角秒表为真实耗时</span>
      </div></div>`
}

function chapterCard(num, t) {
  const sc = SCRIPT[num]
  const b = pop(t, 0.05), ti = pop(t, 0.25), su = pop(t, 0.45)
  return `<div style="position:absolute;left:110px;top:200px;display:flex;align-items:center;gap:40px">
      <div class="badge" style="transform:scale(${b.toFixed(3)}) rotate(${((1 - clamp(b)) * -30).toFixed(1)}deg)">${num}</div>
      <div>
        <div class="title" style="font-size:72px;transform:translateX(${((1 - ti) * -60).toFixed(1)}px);opacity:${clamp(ti).toFixed(2)}">${esc(sc.title)}</div>
        <div style="margin-top:20px;transform:scale(${su.toFixed(3)});transform-origin:0 50%"><span class="chip" style="font-size:20px">${esc(sc.sub)}</span>${outcome(num).passed
          ? '<span class="chip" style="font-size:20px;background:#d3f9d8;color:#2b8a3e">✓ 通过</span>'
          : '<span class="chip" style="font-size:20px;background:#ffe3e3;color:#c92a2a">✗ 未通过</span>'}</div>
      </div></div>`
}

function outroCard(t) {
  const b = layers.browser
  // Automated passes that the manual screenshot review overturned.
  const overturned = (report.manualReview || []).filter(r => /^fail/.test(r.verdict) && b?.cases?.some(c => c.id === r.id.split(' ')[0] && c.passed)).length
  const card = (k, l, s, i) => `<div class="result" style="transform:scale(${pop(t, 0.5 + i * 0.25).toFixed(3)})"><div class="k">${k}</div><div class="v ${tone(l)}">${pass(l)}</div><div class="s">${s}</div></div>`
  return `<div style="position:absolute;left:70px;top:110px;width:820px">
      <div class="title" style="font-size:60px;transform:scale(${pop(t, 0.1).toFixed(3)});transform-origin:0 50%">实测结果 <span class="p">${date}</span></div>
      <div style="margin-top:36px">
        ${card('Mock E2E · 脚本化模型', layers.mockE2E, '渲染 / 交互 / 持久化管线', 0)}
        ${card('真实模型 · API 结构断言', layers.api, '选对工具 · 首次 Schema · 组件与数据', 1)}
        ${card('真实模型 · 浏览器运行', b, `首次预览 p50 ${sec(b?.timing?.firstPreviewMs?.p50)} · 生成 p50 ${sec(b?.timing?.generationMs?.p50)}${overturned ? `<br><b style="color:#d9480f">人工复核另有 ${overturned} 项失败</b>` : ''}`, 2)}
      </div>
      <div style="margin-top:40px;transform:scale(${pop(t, 1.4).toFixed(3)});transform-origin:0 50%">
        <span class="chip" style="background:#1f2b57;color:#fff;font-family:Consolas,monospace">$ npm run eval:real</span><span class="chip">报告：docs/real-model-eval.md</span>
      </div></div>`
}

/** Everything the stage needs for output time T. */
function frameState(T, files) {
  const scene = scenes.find(s => T >= s.start && T < s.end) ?? scenes.at(-1)
  const t = T - scene.start
  const index = scene.num ? ORDER.indexOf(scene.num) : scene.kind === 'outro' ? ORDER.length : -1
  const st = { t: T, scene: scene.kind === 'rec' ? 'rec' : 'card', total: ORDER.length, current: index, confetti: false }
  let m = { pose: 'idle' }
  let bubble = null, since = 0

  if (scene.kind === 'intro') {
    st.cardHtml = introCard(t)
    m = t < 3.2 ? { pose: 'wave', looks: LOOKS.hello } : { pose: 'sign', looks: LOOKS.intro }
    bubble = t < 3.2 ? '大家好♪\n今天用真实的 DeepSeek 模型\n实测 Intelligent UI 插件！' : '每张卡片都是模型\n当场生成的，不是回放哦！'
    since = t < 3.2 ? t - 0.8 : t - 3.2
    Object.assign(st, { mx: 860, my: 282, mw: 344, ms: pop(t, 0, 0.6), bubblePos: { left: '846px', top: '84px', width: '360px' } })
    if (t < 0.8) bubble = null
  } else if (scene.kind === 'card') {
    st.cardHtml = chapterCard(scene.num, t)
    const sc = SCRIPT[scene.num]
    const res = outcome(scene.num)
    m = res.passed ? { pose: 'wave', looks: TALK[scene.num].slice(0, 1) } : { pose: 'oops', looks: ['failure'] }
    Object.assign(st, { mx: 916, my: 286 + (1 - clamp(t / 0.5)) * 420, mw: 330, mr: Math.sin(T * 5) * 3 })
  } else if (scene.kind === 'outro') {
    st.cardHtml = outroCard(t)
    st.confetti = true
    const bye = t > OUTRO - 2.6
    m = bye ? { pose: 'wave', looks: LOOKS.bye } : { pose: 'cheer', looks: LOOKS.cheer }
    bubble = bye ? '感谢观看♪\n下次见！👋' : '全部测完啦！\n失败也如实写进了报告♪'
    since = bye ? t - (OUTRO - 2.6) : t - 0.6
    Object.assign(st, { mx: 916, my: 286, mw: 330 })
  } else {
    // recording
    const list = scene.frames
    let lo = 0, hi = list.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (list[mid].at <= T) lo = mid; else hi = mid - 1 }
    const f = list[lo]
    const sc = SCRIPT[scene.num]
    Object.assign(st, { src: files(f.file), chapter: `${scene.num} ${sc.title}`, fast: f.speed > 1, speed: Math.round(f.speed), winScale: 0.94 + 0.06 * pop(t, 0, 0.4), mx: 946, my: 336, mw: 324 })
    const oopsFrames = scene.num === '⑥' ? list.filter(x => x.label.startsWith('脚本出错')) : []
    // The script error is on screen just before the "脚本出错" caption; the
    // repaired scene shows early in the (long, sped-up) repair wait.
    const oopsAt = oopsFrames.length ? oopsFrames[0].at - 2.5 : Infinity
    const repair = oopsFrames.filter(x => x.speed > 1)
    const fixedAt = repair.length ? repair[0].at + 0.12 * repair.reduce((a, x) => a + x.d, 0) : Infinity
    const inOops = T >= oopsAt
    if (inOops && T >= fixedAt) {
      m = { pose: 'cheer', looks: LOOKS.fixed }
      bubble = OOPS.fixed
      since = T - fixedAt
    } else if (inOops && f.speed === 1) {
      m = { pose: 'oops', looks: LOOKS.oops }
      bubble = OOPS.line
      since = T - oopsAt
    } else if (f.speed > 1) {
      // Find where this fast run started, for the typewriter.
      let k = lo; while (k > 0 && list[k - 1].speed > 1) k--
      m = { pose: 'think', looks: scene.num === '⑨' ? LOOKS.slowNet : LOOKS.think }
      bubble = FAST_LINE
      since = T - list[k].at
    } else {
      // The chapter line, retyped after each fast run.
      let k = lo; while (k > 0 && list[k - 1].speed === 1) k--
      const res = outcome(scene.num)
      const failLine = !res.passed && scene.num !== '⑥' ? FAIL_LINES[res.id] ?? '这一项没通过…\n失败原因已写进报告 ✗' : null
      m = failLine ? { pose: 'oops', looks: LOOKS.fail[res.id] ?? LOOKS.failDefault } : { pose: sc.pose === 'oops' ? 'point' : sc.pose, looks: TALK[scene.num] }
      bubble = failLine ?? sc.line
      since = T - list[k].at
    }
  }
  st.bubble = bubble
  st.reveal = bubble ? since / Math.max(0.6, [...bubble].length * 0.045) : 0
  st.bubbleScale = bubble ? 0.85 + 0.15 * pop(since, 0, 0.3) : 1
  // Scene cards have no bubble: their beat starts with the card.
  st.pet = { ...petMotion(m.pose, T), ...lookAt(m.looks ?? ['idle-cute'], scene.kind === 'card' ? t : since), t: T }
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
    '-vf', 'fps=7,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=112:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', gif])
  console.log(`gif: ${gif}`)
}
writeFileSync(path.join(framesDir, 'scenes.json'), JSON.stringify(sceneTimes, null, 1))
if (!existsSync(mp4)) process.exitCode = 1
