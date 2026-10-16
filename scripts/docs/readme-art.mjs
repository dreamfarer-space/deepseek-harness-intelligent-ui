// Generates the animated README illustrations (en + zh).
// Usage: npm run docs:art   (writes docs/assets/readme/*.svg)
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const out = path.resolve(process.argv[2] || 'docs/assets/readme')
mkdirSync(out, { recursive: true })

const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif`
const MONO = `ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace`
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const C = {
  bg0: '#0a0f1f', bg1: '#141b3c', panel: '#111833', panel2: '#18213f', line: '#2a3563',
  text: '#e8ecff', dim: '#97a1c9', mute: '#5f6a98',
  blue: '#4d6bfe', cyan: '#22d3ee', violet: '#a78bfa', green: '#34d399', amber: '#fbbf24', red: '#f87171', pink: '#f472b6',
}

const baseStyle = `
  text { font-family: ${SANS}; }
  .mono { font-family: ${MONO}; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`

const frame = (w, h, body, { title, desc, style = '', defs = '' }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.bg0}"/><stop offset="1" stop-color="${C.bg1}"/>
  </linearGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${C.cyan}"/><stop offset=".5" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.violet}"/>
  </linearGradient>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity=".035"/>
  </pattern>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  ${defs}
</defs>
<style>${baseStyle}${style}</style>
<rect width="${w}" height="${h}" rx="20" fill="url(#bg)"/>
<rect width="${w}" height="${h}" rx="20" fill="url(#grid)"/>
${body}
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="19.5" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
</svg>
`

// ───────────────────────────── hero ─────────────────────────────
function hero(L) {
  const W = 1280, H = 400
  const cx = 720, cy = 44, cw = 520, ch = 312
  const bars = [[22, 14], [30, 16], [38, 18], [48, 20]] // [online, retail] heights
  const barSvg = bars.map(([a, b], i) => {
    const x = cx + 48 + i * 66, base = cy + 278
    return `<rect class="bar b${i}" x="${x}" y="${base - a - b}" width="30" height="${b}" rx="3" fill="${C.violet}"/>
      <rect class="bar b${i}" x="${x}" y="${base - a}" width="30" height="${a}" rx="3" fill="${C.blue}"/>
      <text x="${x + 15}" y="${base + 14}" text-anchor="middle" font-size="10" fill="${C.mute}">Q${i + 1}</text>`
  }).join('\n')
  const stats = [[L.kpi1, '$2.4M', C.cyan, '+18%'], [L.kpi2, '1,284', C.violet, '+9%'], [L.kpi3, '62%', C.green, '+4pt']]
  const statSvg = stats.map(([label, v, col, d], i) => {
    const x = cx + 24 + i * 162, y = cy + 116
    return `<g class="pop s${i}">
      <rect x="${x}" y="${y}" width="148" height="66" rx="10" fill="${C.panel2}" stroke="${C.line}"/>
      <text x="${x + 14}" y="${y + 22}" font-size="11" fill="${C.dim}">${esc(label)}</text>
      <text x="${x + 14}" y="${y + 50}" font-size="22" font-weight="700" fill="${C.text}">${v}</text>
      <text x="${x + 134}" y="${y + 50}" font-size="11" text-anchor="end" font-weight="600" fill="${col}">${d}</text>
    </g>`
  }).join('\n')
  // wireframe sphere (widget) in the chart card corner
  const sx = cx + 430, sy = cy + 245
  const sphere = `<g class="pop s4">
      <rect x="${sx - 62}" y="${sy - 52}" width="124" height="104" rx="10" fill="#0c1230" stroke="${C.line}"/>
      <text x="${sx - 52}" y="${sy - 36}" font-size="9" fill="${C.mute}" class="mono">iframe · three.js</text>
      <circle cx="${sx}" cy="${sy + 6}" r="34" fill="none" stroke="${C.cyan}" stroke-opacity=".9"/>
      <ellipse cx="${sx}" cy="${sy + 6}" rx="34" ry="11" fill="none" stroke="${C.cyan}" stroke-opacity=".45"/>
      <ellipse cx="${sx}" cy="${sy + 6}" rx="34" ry="24" fill="none" stroke="${C.cyan}" stroke-opacity=".25"/>
      ${[0, 1, 2].map(k => `<ellipse cx="${sx}" cy="${sy + 6}" ry="34" rx="34" fill="none" stroke="${C.cyan}" stroke-opacity=".6"><animate attributeName="rx" values="34;0;34" dur="4s" begin="${-k * 4 / 3}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/></ellipse>`).join('')}
    </g>`
  const body = `
<circle class="orb o1" cx="210" cy="90" r="160" fill="${C.blue}" opacity=".22" filter="url(#glow)"/>
<circle class="orb o2" cx="1100" cy="330" r="190" fill="${C.violet}" opacity=".16" filter="url(#glow)"/>

<g transform="translate(64 0)">
  <rect x="0" y="70" width="${L.pillW}" height="28" rx="14" fill="#ffffff" fill-opacity=".06" stroke="#ffffff" stroke-opacity=".12"/>
  <circle cx="16" cy="84" r="4" fill="${C.green}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
  <text x="28" y="88.5" font-size="13" fill="${C.dim}">${esc(L.pill)}</text>
  <text x="0" y="164" font-size="58" font-weight="800" fill="url(#brand)" letter-spacing="-1">Intelligent UI</text>
  <text x="2" y="204" font-size="22" font-weight="600" fill="${C.text}">${esc(L.sub)}</text>
  <text x="2" y="240" font-size="15" fill="${C.dim}">${esc(L.tag1)}</text>
  <text x="2" y="263" font-size="15" fill="${C.dim}">${esc(L.tag2)}</text>
  <g transform="translate(0 296)">
    <rect width="590" height="44" rx="10" fill="#060a18" stroke="${C.line}"/>
    <text x="18" y="27.5" font-size="13.5" class="mono" fill="${C.green}">$</text>
    <text x="34" y="27.5" font-size="13.5" class="mono" fill="${C.text}">dsh plugin --profile web add <tspan fill="${C.cyan}">deepseek-harness-intelligent-ui</tspan></text>
    <rect class="caret" x="488" y="14" width="8" height="17" fill="${C.text}"/>
  </g>
</g>

<g>
  <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="14" fill="${C.panel}" stroke="${C.line}"/>
  <path d="M${cx} ${cy + 34}h${cw}" stroke="${C.line}"/>
  <circle cx="${cx + 20}" cy="${cy + 17}" r="5" fill="#ff5f57"/><circle cx="${cx + 38}" cy="${cy + 17}" r="5" fill="#febc2e"/><circle cx="${cx + 56}" cy="${cy + 17}" r="5" fill="#28c840"/>
  <text x="${cx + cw / 2}" y="${cy + 21.5}" text-anchor="middle" font-size="12" fill="${C.mute}">DSH Web</text>

  <g class="pop s-user">
    <rect x="${cx + cw - 24 - L.askW}" y="${cy + 50}" width="${L.askW}" height="32" rx="16" fill="${C.blue}"/>
    <text x="${cx + cw - 24 - L.askW / 2}" y="${cy + 70.5}" text-anchor="middle" font-size="13" fill="#fff">${esc(L.ask)}</text>
  </g>
  <g class="pop s-tool">
    <rect x="${cx + 24}" y="${cy + 90}" width="118" height="20" rx="10" fill="${C.blue}" fill-opacity=".15"/>
    <text x="${cx + 34}" y="${cy + 104}" font-size="11" class="mono" fill="${C.cyan}">◆ ui_render</text>
  </g>
  ${statSvg}
  <g class="pop s3">
    <rect x="${cx + 24}" y="${cy + 194}" width="${cw - 48 - 136}" height="104" rx="10" fill="${C.panel2}" stroke="${C.line}"/>
  </g>
  ${barSvg}
  ${sphere}
</g>`
  const style = `
  .orb { animation: breathe 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .o2 { animation-delay: -3s; }
  @keyframes breathe { 50% { opacity: .08; transform: scale(1.12); } }
  .caret { animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .pop { opacity: 0; animation: pop 9s ease-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes pop { 0% { opacity: 0; transform: translateY(8px); } 6%, 90% { opacity: 1; transform: none; } 97%, 100% { opacity: 0; } }
  .s-user { animation-delay: .2s; } .s-tool { animation-delay: .9s; }
  .s0 { animation-delay: 1.3s; } .s1 { animation-delay: 1.6s; } .s2 { animation-delay: 1.9s; }
  .s3 { animation-delay: 2.3s; } .s4 { animation-delay: 3.6s; }
  .bar { transform-box: fill-box; transform-origin: bottom; transform: scaleY(0); animation: grow 9s cubic-bezier(.2,.8,.2,1) infinite; }
  @keyframes grow { 0% { transform: scaleY(0); opacity: 1; } 8%, 88% { transform: scaleY(1); opacity: 1; } 95%, 100% { transform: scaleY(1); opacity: 0; } }
  .b0 { animation-delay: 2.5s; } .b1 { animation-delay: 2.7s; } .b2 { animation-delay: 2.9s; } .b3 { animation-delay: 3.1s; }
  `
  return frame(W, H, body, { title: L.title, desc: L.desc, style })
}

// ───────────────────────────── routing ─────────────────────────────
function routing(L) {
  const W = 1200, H = 470
  const P = { x: 40, y: 175, w: 190, h: 90 }
  const A = { x: 320, y: 155, w: 230, h: 130 }
  const lanes = [
    { y: 50, col: C.dim, name: L.text, code: '', sub: L.textSub },
    { y: 175, col: C.cyan, name: 'ui_render', code: true, sub: L.catSub },
    { y: 300, col: C.violet, name: 'ui_render_widget', code: true, sub: L.widSub },
  ]
  const LX = 660, LW = 300, LH = 90
  const OX = 1010
  // SMIL motion paths must be continuous, so build one continuous path per lane
  const mpaths = lanes.map(l => `M${P.x + P.w} ${P.y + P.h / 2} L${A.x + A.w} ${A.y + A.h / 2} C ${A.x + A.w + 60} ${A.y + A.h / 2}, ${LX - 60} ${l.y + LH / 2}, ${LX} ${l.y + LH / 2} L${OX + 20} ${l.y + LH / 2}`)
  const dur = 7.5
  const laneSvg = lanes.map((l, i) => {
    const begin = i * dur / 3
    return `
  <path d="M${A.x + A.w} ${A.y + A.h / 2} C ${A.x + A.w + 60} ${A.y + A.h / 2}, ${LX - 60} ${l.y + LH / 2}, ${LX} ${l.y + LH / 2}" fill="none" stroke="${l.col}" stroke-opacity=".35" stroke-width="2"/>
  <path d="M${LX + LW} ${l.y + LH / 2} H${OX}" fill="none" stroke="${l.col}" stroke-opacity=".35" stroke-width="2"/>
  <g>
    <rect x="${LX}" y="${l.y}" width="${LW}" height="${LH}" rx="14" fill="${C.panel}" stroke="${l.col}" stroke-opacity=".45"/>
    <rect x="${LX}" y="${l.y}" width="${LW}" height="${LH}" rx="14" fill="none" stroke="${l.col}" stroke-width="2.5" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.12;.18;.3;.36;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
    </rect>
    <text x="${LX + 22}" y="${l.y + 38}" font-size="19" font-weight="700" fill="${l.col === C.dim ? C.text : l.col}" ${l.code ? 'class="mono"' : ''}>${esc(l.name)}</text>
    <text x="${LX + 22}" y="${l.y + 64}" font-size="13.5" fill="${C.dim}">${esc(l.sub)}</text>
  </g>`
  }).join('\n')
  // dots are drawn beneath the opaque agent box so they never cross its text
  const dotSvg = lanes.map((l, i) => {
    const begin = i * dur / 3
    return `
  <circle r="6" fill="${l.col === C.dim ? '#ffffff' : l.col}" opacity="0">
    <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${mpaths[i]}" keyPoints="0;1;1" keyTimes="0;.36;1" calcMode="linear"/>
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.35;.36;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>
  </circle>`
  }).join('\n')
  const body = `
<text x="40" y="34" font-size="13" font-weight="700" fill="${C.mute}" letter-spacing="2">${esc(L.heading)}</text>

<path d="M${P.x + P.w} ${P.y + P.h / 2} H${A.x}" stroke="${C.blue}" stroke-opacity=".5" stroke-width="2"/>
<g>
  <rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="14" fill="${C.panel}" stroke="${C.line}"/>
  <text x="${P.x + 20}" y="${P.y + 36}" font-size="13" fill="${C.mute}">${esc(L.you)}</text>
  <text x="${P.x + 20}" y="${P.y + 62}" font-size="16" font-weight="600" fill="${C.text}">${esc(L.prompt)}</text>
</g>
${laneSvg}
${dotSvg}
<g>
  <rect x="${A.x}" y="${A.y}" width="${A.w}" height="${A.h}" rx="18" fill="${C.panel}"/>
  <rect x="${A.x}" y="${A.y}" width="${A.w}" height="${A.h}" rx="18" fill="${C.blue}" fill-opacity=".14" stroke="${C.blue}" stroke-width="1.5"/>
  <rect x="${A.x}" y="${A.y}" width="${A.w}" height="${A.h}" rx="18" fill="none" stroke="${C.blue}" stroke-width="6" opacity=".25" filter="url(#glow)" class="pulse"/>
  <text x="${A.x + A.w / 2}" y="${A.y + 44}" text-anchor="middle" font-size="20" font-weight="700" fill="${C.text}">${esc(L.agent)}</text>
  <text x="${A.x + A.w / 2}" y="${A.y + 72}" text-anchor="middle" font-size="13" fill="${C.dim}">${esc(L.agentSub)}</text>
  <text x="${A.x + A.w / 2}" y="${A.y + 100}" text-anchor="middle" font-size="12" class="mono" fill="${C.cyan}">src/guidance.js</text>
</g>
<g>
  <rect x="${OX}" y="50" width="150" height="340" rx="14" fill="${C.panel}" stroke="${C.line}"/>
  <text x="${OX + 75}" y="80" text-anchor="middle" font-size="15" font-weight="700" fill="${C.text}">${esc(L.chat)}</text>
  <rect x="${OX + 18}" y="98" width="114" height="10" rx="5" fill="${C.dim}" opacity=".35"/>
  <rect x="${OX + 18}" y="116" width="84" height="10" rx="5" fill="${C.dim}" opacity=".35"/>
  <rect x="${OX + 18}" y="192" width="114" height="64" rx="8" fill="${C.cyan}" fill-opacity=".12" stroke="${C.cyan}" stroke-opacity=".5"/>
  ${[0, 1, 2].map(k => `<rect x="${OX + 30 + k * 32}" y="${236 - (k + 1) * 10}" width="20" height="${(k + 1) * 10 + 8}" rx="2" fill="${C.cyan}" opacity=".7"/>`).join('')}
  <rect x="${OX + 18}" y="316" width="114" height="62" rx="8" fill="${C.violet}" fill-opacity=".12" stroke="${C.violet}" stroke-opacity=".5"/>
  <circle cx="${OX + 75}" cy="347" r="20" fill="none" stroke="${C.violet}"/>
  <ellipse cx="${OX + 75}" cy="347" rx="20" ry="20" fill="none" stroke="${C.violet}" opacity=".6"><animate attributeName="rx" values="20;2;20" dur="3s" repeatCount="indefinite"/></ellipse>
</g>

<path class="dash" d="M${OX + 75} 392 V420 H${A.x + A.w / 2} V${A.y + A.h + 4}" fill="none" stroke="${C.amber}" stroke-width="2" stroke-dasharray="6 6" marker-end="url(#arrA)"/>
<text x="${(OX + A.x + A.w / 2) / 2 + 70}" y="446" text-anchor="middle" font-size="13.5" fill="${C.amber}">${esc(L.back)}</text>

<g transform="translate(40 330)">
  <rect width="230" height="96" rx="14" fill="${C.green}" fill-opacity=".08" stroke="${C.green}" stroke-opacity=".5"/>
  <g transform="translate(36 48)">
    <circle r="18" fill="none" stroke="${C.green}" stroke-opacity=".3" stroke-width="3"/>
    <path d="M0 -18 A18 18 0 0 1 18 0" fill="none" stroke="${C.green}" stroke-width="3" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.4s" repeatCount="indefinite"/>
    </path>
  </g>
  <text x="68" y="40" font-size="14" font-weight="700" fill="${C.green}">${esc(L.local)}</text>
  <text x="68" y="62" font-size="12" fill="${C.dim}">${esc(L.local1)}</text>
  <text x="68" y="80" font-size="12" fill="${C.dim}">${esc(L.local2)}</text>
</g>`
  const defs = `<marker id="arrA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.amber}"/></marker>`
  const style = `
  .dash { animation: flow 1s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -12; } }
  .pulse { animation: pulse 2.5s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .6; } }
  `
  return frame(W, H, body, { title: L.title, desc: L.desc, style, defs })
}

// ───────────────────────────── widget streaming ─────────────────────────────
function stream(L) {
  const W = 1200, H = 440, T = 10 // seconds per loop
  const fields = ['title', 'initialHeight', 'placeholderMessages', 'css', 'html', 'jsFunctions', 'jsExpressions']
  const fw = [70, 110, 170, 60, 70, 110, 120]
  let x = 40
  const chips = fields.map((f, i) => {
    const s = `<g class="chip c${i}"><rect x="${x}" y="64" width="${fw[i]}" height="30" rx="8" fill="${C.panel2}" stroke="${C.line}"/>
      <rect class="chipfill c${i}" x="${x}" y="64" width="${fw[i]}" height="30" rx="8" fill="${[C.dim, C.dim, C.amber, C.pink, C.cyan, C.violet, C.violet][i]}" fill-opacity=".18" stroke="${[C.dim, C.dim, C.amber, C.pink, C.cyan, C.violet, C.violet][i]}"/>
      <text x="${x + fw[i] / 2}" y="83.5" text-anchor="middle" font-size="12.5" class="mono" fill="${C.text}">${f}</text></g>`
    x += fw[i] + 12
    return s
  }).join('')
  const trackEnd = x - 12
  // stage frame
  const F = { x: 40, y: 140, w: 700, h: 270 }
  const phases = [
    { cls: 'ph0', label: L.ph0, col: C.amber, note: L.ph0n },
    { cls: 'ph1', label: L.ph1, col: C.cyan, note: L.ph1n },
    { cls: 'ph2', label: L.ph2, col: C.violet, note: L.ph2n },
  ]
  const sx = F.x + 520, sy = F.y + 160
  const body = `
<text x="40" y="40" font-size="13" font-weight="700" fill="${C.mute}" letter-spacing="2">${esc(L.heading)}</text>
${chips}
<rect x="40" y="104" width="${trackEnd - 40}" height="4" rx="2" fill="${C.line}"/>
<rect class="progress" x="40" y="104" width="${trackEnd - 40}" height="4" rx="2" fill="url(#brand)"/>

<g>
  <rect x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" rx="14" fill="${C.panel}" stroke="${C.line}"/>
  <path d="M${F.x} ${F.y + 34}h${F.w}" stroke="${C.line}"/>
  <text x="${F.x + 18}" y="${F.y + 22}" font-size="12" class="mono" fill="${C.mute}">&lt;iframe sandbox srcdoc&gt;</text>
  <text x="${F.x + F.w - 18}" y="${F.y + 22}" font-size="12" text-anchor="end" fill="${C.text}" font-weight="600">${esc(L.wtitle)}</text>

  <g class="L0">
    ${[0, 1, 2].map(k => `<rect x="${F.x + 30}" y="${F.y + 70 + k * 34}" width="${[420, 340, 380][k]}" height="16" rx="8" fill="${C.line}" class="shimmer"/>`).join('')}
    <text x="${F.x + 30}" y="${F.y + 200}" font-size="14" fill="${C.amber}">✎ ${esc(L.placeholder)}</text>
  </g>

  <g class="L1">
    <text class="m m0" x="${F.x + 30}" y="${F.y + 74}" font-size="20" font-weight="700" fill="${C.text}">${esc(L.wh)}</text>
    <g class="m m1">
      <text x="${F.x + 30}" y="${F.y + 110}" font-size="13" fill="${C.dim}">R</text>
      <rect x="${F.x + 52}" y="${F.y + 102}" width="300" height="6" rx="3" fill="${C.line}"/>
      <rect x="${F.x + 52}" y="${F.y + 102}" width="150" height="6" rx="3" fill="${C.cyan}"/>
      <circle class="knob" cx="${F.x + 202}" cy="${F.y + 105}" r="9" fill="#fff"/>
    </g>
    <g class="m m2">
      <rect x="${F.x + 30}" y="${F.y + 130}" width="200" height="34" rx="8" fill="${C.panel2}" stroke="${C.line}"/>
      <text x="${F.x + 46}" y="${F.y + 152}" font-size="13" fill="${C.text}">${esc(L.btn)}</text>
    </g>
    <g class="m m3">
      <rect x="${sx - 110}" y="${sy - 100}" width="220" height="200" rx="12" fill="#0c1230" stroke="${C.line}"/>
    </g>
  </g>

  <g class="L2">
    <circle cx="${sx}" cy="${sy}" r="64" fill="none" stroke="${C.violet}"/>
    <ellipse cx="${sx}" cy="${sy}" rx="64" ry="20" fill="none" stroke="${C.violet}" stroke-opacity=".5"/>
    <ellipse cx="${sx}" cy="${sy}" rx="64" ry="44" fill="none" stroke="${C.violet}" stroke-opacity=".3"/>
    ${[0, 1, 2, 3].map(k => `<ellipse cx="${sx}" cy="${sy}" rx="64" ry="64" fill="none" stroke="${C.violet}" stroke-opacity=".7"><animate attributeName="rx" values="64;0;64" dur="3.2s" begin="${-k * 0.8}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/></ellipse>`).join('')}
    <rect x="${F.x + 30}" y="${F.y + 186}" width="${L.runW}" height="26" rx="13" fill="${C.green}" fill-opacity=".15" stroke="${C.green}"/>
    <text x="${F.x + 44}" y="${F.y + 203.5}" font-size="12" fill="${C.green}">● ${esc(L.running)}</text>
  </g>
</g>

<g transform="translate(780 140)">
  ${phases.map((p, i) => `
  <g transform="translate(0 ${i * 92})">
    <rect width="380" height="78" rx="14" fill="${C.panel}" stroke="${C.line}"/>
    <rect class="hl ${p.cls}" width="380" height="78" rx="14" fill="${p.col}" fill-opacity=".1" stroke="${p.col}" stroke-width="1.5"/>
    <circle cx="30" cy="39" r="14" fill="${p.col}" fill-opacity=".2" stroke="${p.col}"/>
    <text x="30" y="44" text-anchor="middle" font-size="13" font-weight="700" fill="${p.col}">${i + 1}</text>
    <text x="58" y="33" font-size="15" font-weight="700" fill="${C.text}">${esc(p.label)}</text>
    <text x="58" y="56" font-size="12.5" fill="${C.dim}">${esc(p.note)}</text>
  </g>`).join('')}
</g>`
  // timeline (fraction of T): 0-.25 placeholder, .25-.6 morph, .6-.95 final, then fade
  const style = `
  .progress { transform-box: fill-box; transform-origin: left; animation: prog ${T}s linear infinite; }
  @keyframes prog { 0% { transform: scaleX(0); } 85% { transform: scaleX(1); } 100% { transform: scaleX(1); } }
  .chipfill { opacity: 0; animation: chip ${T}s linear infinite; }
  @keyframes chip { 0% { opacity: 0; } 2%, 94% { opacity: 1; } 100% { opacity: 0; } }
  ${fields.map((_, i) => `.chipfill.c${i} { animation-delay: ${(i * 0.85 / 7 * T + 0.1).toFixed(2)}s; }`).join(' ')}
  .chipfill { animation-fill-mode: backwards; }
  .L0 { animation: l0 ${T}s infinite; }
  @keyframes l0 { 0%, 26% { opacity: 1; } 30%, 100% { opacity: 0; } }
  .L1 { animation: l1 ${T}s infinite; }
  @keyframes l1 { 0%, 26% { opacity: 0; } 30%, 94% { opacity: 1; } 100% { opacity: 0; } }
  .L2 { animation: l2 ${T}s infinite; }
  @keyframes l2 { 0%, 60% { opacity: 0; } 64%, 94% { opacity: 1; } 100% { opacity: 0; } }
  .m { animation: m ${T}s infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes m { 0%, 28% { opacity: 0; transform: translateY(6px); } 33%, 94% { opacity: 1; transform: none; } 100% { opacity: 0; } }
  .m1 { animation-delay: .7s; } .m2 { animation-delay: 1.4s; } .m3 { animation-delay: 2.1s; }
  .knob { animation: knob ${T}s ease-in-out infinite; }
  @keyframes knob { 0%, 66% { transform: none; } 76% { transform: translateX(90px); } 86% { transform: translateX(-40px); } 94% { transform: none; } }
  .shimmer { animation: sh 1.2s ease-in-out infinite alternate; }
  @keyframes sh { from { opacity: .45; } to { opacity: 1; } }
  .hl { opacity: 0; }
  .ph0 { animation: h0 ${T}s infinite; } @keyframes h0 { 0%, 26% { opacity: 1; } 30%, 100% { opacity: 0; } }
  .ph1 { animation: h1 ${T}s infinite; } @keyframes h1 { 0%, 26% { opacity: 0; } 30%, 60% { opacity: 1; } 64%, 100% { opacity: 0; } }
  .ph2 { animation: h2 ${T}s infinite; } @keyframes h2 { 0%, 60% { opacity: 0; } 64%, 94% { opacity: 1; } 100% { opacity: 0; } }
  `
  return frame(W, H, body, { title: L.title, desc: L.desc, style })
}

// ───────────────────────────── sandbox ─────────────────────────────
function sandbox(L) {
  const W = 1200, H = 460
  const I = { x: 60, y: 90, w: 520, h: 330 }
  const S = { x: 84, y: 150, w: 472, h: 250 }
  const Wd = { x: 120, y: 220, w: 200, h: 120 }
  const targets = [
    ['parent.document', 'SecurityError'],
    ['localStorage', 'SecurityError'],
    ['document.cookie', 'SecurityError'],
    ['fetch(…)', L.blocked],
  ]
  const tY = k => 104 + k * 50
  const attack = targets.map((t, k) => {
    const y0 = Wd.y + 30 + k * 20, y1 = tY(k) + 18
    const p = `M${Wd.x + Wd.w} ${y0} C ${Wd.x + Wd.w + 160} ${y0}, ${I.x + I.w - 120} ${y1}, ${I.x + I.w} ${y1}`
    const d = 2.4, b = k * 0.6
    return `
  <path d="${p}" fill="none" stroke="${C.red}" stroke-opacity=".25" stroke-dasharray="4 5"/>
  <circle r="5" fill="${C.red}" opacity="0">
    <animateMotion dur="${d}s" begin="${b}s" repeatCount="indefinite" path="${p}" keyPoints="0;1;1" keyTimes="0;.6;1" calcMode="linear"/>
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.59;.6;1" dur="${d}s" begin="${b}s" repeatCount="indefinite"/>
  </circle>
  <g transform="translate(${I.x + I.w} ${y1})" opacity="0">
    <circle r="12" fill="${C.red}" fill-opacity=".25" stroke="${C.red}"/>
    <path d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5" stroke="${C.red}" stroke-width="2.4" stroke-linecap="round"/>
    <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.58;.62;.9;1" dur="${d}s" begin="${b}s" repeatCount="indefinite"/>
  </g>
  <g transform="translate(640 ${tY(k)})">
    <rect width="250" height="38" rx="10" fill="${C.panel}" stroke="${C.red}" stroke-opacity=".4"/>
    <text x="16" y="24" font-size="13" class="mono" fill="${C.text}">${esc(t[0])}</text>
    <text x="236" y="24" font-size="12" text-anchor="end" fill="${C.red}">✕ ${esc(t[1])}</text>
  </g>`
  }).join('')
  const G = { x: 640, y: 320, w: 250, h: 100 }
  const B = { x: 930, y: 320, w: 230, h: 100 }
  const okPath = `M${Wd.x + Wd.w / 2} ${Wd.y + Wd.h} V${G.y + G.h / 2 + 10} Q ${Wd.x + Wd.w / 2} ${G.y + G.h / 2 + 10 - 0} ${Wd.x + Wd.w / 2 + 20} ${G.y + G.h / 2 + 10} H${G.x} M${G.x + G.w} ${G.y + G.h / 2 + 10} H${B.x}`
  const okMotion = `M${Wd.x + Wd.w / 2} ${Wd.y + Wd.h} V${G.y + G.h / 2 + 10} H${B.x + 20}`
  const body = `
<text x="40" y="40" font-size="13" font-weight="700" fill="${C.mute}" letter-spacing="2">${esc(L.heading)}</text>
<text x="1160" y="40" font-size="13" text-anchor="end" fill="${C.dim}">${esc(L.host)}</text>

<rect x="${I.x}" y="${I.y}" width="${I.w}" height="${I.h}" rx="16" fill="${C.violet}" fill-opacity=".05" stroke="${C.violet}" stroke-width="1.5" stroke-dasharray="7 5" class="dash"/>
<text x="${I.x + 20}" y="${I.y + 26}" font-size="12.5" class="mono" fill="${C.violet}">&lt;iframe sandbox="allow-scripts allow-forms" srcdoc&gt;</text>
<text x="${I.x + 20}" y="${I.y + 46}" font-size="12" fill="${C.dim}">${esc(L.origin)}</text>

<rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" rx="12" fill="${C.pink}" fill-opacity=".05" stroke="${C.pink}" stroke-opacity=".6"/>
<text x="${S.x + 16}" y="${S.y + 22}" font-size="12" class="mono" fill="${C.pink}">CSP default-src 'none' · connect-src 'none'</text>
<text x="${S.x + 16}" y="${S.y + 40}" font-size="12" fill="${C.dim}">${esc(L.csp)}</text>

<path d="${okPath}" fill="none" stroke="${C.green}" stroke-opacity=".45" stroke-width="2"/>
${attack}

<g>
  <rect x="${Wd.x}" y="${Wd.y}" width="${Wd.w}" height="${Wd.h}" rx="12" fill="${C.panel2}" stroke="${C.cyan}"/>
  <text x="${Wd.x + 18}" y="${Wd.y + 30}" font-size="15" font-weight="700" fill="${C.text}">${esc(L.widget)}</text>
  <text x="${Wd.x + 18}" y="${Wd.y + 54}" font-size="12" class="mono" fill="${C.dim}">UI.three · UI.canvas</text>
  <text x="${Wd.x + 18}" y="${Wd.y + 74}" font-size="12" class="mono" fill="${C.dim}">UI.state · Bridge.*</text>
  <g transform="translate(${Wd.x + 170} ${Wd.y + 92})">
    <path d="M-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0" fill="none" stroke="${C.cyan}" stroke-width="2" stroke-dasharray="5 3.5">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite"/>
    </path>
  </g>
</g>

<g>
  <rect x="${G.x}" y="${G.y}" width="${G.w}" height="${G.h}" rx="14" fill="${C.green}" fill-opacity=".08" stroke="${C.green}"/>
  <text x="${G.x + 18}" y="${G.y + 28}" font-size="14" font-weight="700" fill="${C.green}">${esc(L.gate)}</text>
  <text x="${G.x + 18}" y="${G.y + 50}" font-size="12" fill="${C.dim}">${esc(L.gate1)}</text>
  <text x="${G.x + 18}" y="${G.y + 68}" font-size="12" fill="${C.dim}">${esc(L.gate2)}</text>
  <text x="${G.x + 18}" y="${G.y + 86}" font-size="12" fill="${C.dim}">${esc(L.gate3)}</text>
</g>
<g>
  <rect x="${B.x}" y="${B.y}" width="${B.w}" height="${B.h}" rx="14" fill="${C.blue}" fill-opacity=".12" stroke="${C.blue}"/>
  <text x="${B.x + 18}" y="${B.y + 28}" font-size="14" font-weight="700" fill="${C.text}">${esc(L.bridge)}</text>
  <text x="${B.x + 18}" y="${B.y + 50}" font-size="12" class="mono" fill="${C.cyan}">sendPrompt · openLink</text>
  <text x="${B.x + 18}" y="${B.y + 70}" font-size="12" fill="${C.dim}">${esc(L.rate1)}</text>
  <text x="${B.x + 18}" y="${B.y + 88}" font-size="12" fill="${C.dim}">${esc(L.rate2)}</text>
</g>
<g transform="translate(930 104)">
  <rect width="230" height="188" rx="14" fill="${C.panel}" stroke="${C.line}"/>
  <text x="18" y="30" font-size="14" font-weight="700" fill="${C.text}">${esc(L.dsh)}</text>
  <text x="18" y="54" font-size="12" fill="${C.dim}">${esc(L.dsh1)}</text>
  <text x="18" y="74" font-size="12" fill="${C.dim}">${esc(L.dsh2)}</text>
  <rect x="18" y="96" width="194" height="10" rx="5" fill="${C.line}"/>
  <rect x="18" y="116" width="150" height="10" rx="5" fill="${C.line}"/>
  <rect x="18" y="136" width="170" height="10" rx="5" fill="${C.line}"/>
  <text x="18" y="172" font-size="12" fill="${C.green}">🔒 ${esc(L.safe)}</text>
</g>

<g>
  <rect x="-9" y="-9" width="18" height="18" rx="4" fill="${C.green}">
    <animateMotion dur="3.6s" repeatCount="indefinite" path="${okMotion}" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="spline" keySplines=".4 0 .6 1;0 0 1 1"/>
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.74;.75;1" dur="3.6s" repeatCount="indefinite"/>
  </rect>
</g>`
  const style = `
  .dash { animation: flow 1.6s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -24; } }
  `
  return frame(W, H, body, { title: L.title, desc: L.desc, style })
}

const en = {
  hero: {
    title: 'DeepSeek Harness Intelligent UI', desc: 'A chat answer streams in as KPI cards, a stacked bar chart and a sandboxed 3D widget.',
    pill: 'DeepSeek Harness plugin · generative UI', pillW: 300,
    sub: 'Generative, interactive UI for DeepSeek Harness',
    tag1: 'The agent answers with text, native components or a sandboxed',
    tag2: 'live widget — streamed into the chat, interactive in the browser.',
    ask: 'Revenue by channel, Q1–Q4?', askW: 220,
    kpi1: 'Revenue', kpi2: 'Orders', kpi3: 'Online share',
  },
  routing: {
    title: 'How the agent decides', desc: 'Each turn the agent routes a prompt to plain text, ui_render or ui_render_widget. Local interactions never call the model; explicit actions go back to the agent.',
    heading: 'HOW THE AGENT DECIDES', you: 'You', prompt: 'Any prompt', agent: 'DSH agent', agentSub: 'routes every turn itself',
    text: 'Plain text', textSub: 'greetings, facts, code, coding work',
    catSub: 'native components, streamed JSON', widSub: 'sandboxed HTML / CSS / JS, live',
    chat: 'Chat', back: 'Button · Form · Bridge.sendPrompt → back to the agent',
    local: 'Local first', local1: 'sliders · rotate · zoom', local2: 'sort · tabs → no model call',
  },
  stream: {
    title: 'Widget streaming', desc: 'Widget fields stream in order; placeholders show until css is complete, partial HTML is morphed into a preview frame, then the same frame is finalized and the code runs.',
    heading: 'UI_RENDER_WIDGET · STREAMING CONTRACT', wtitle: 'Sphere explorer', placeholder: 'Sketching the sphere…',
    wh: 'x² + y² + z² = 2Rz', btn: 'Explain this surface', running: 'JS running · same iframe', runW: 176,
    ph0: 'Placeholder', ph0n: 'placeholderMessages until css is complete',
    ph1: 'Live preview', ph1n: 'partial html morphed in with idiomorph',
    ph2: 'Finalized in place', ph2n: 'final html + code run — no rebuild, no flash',
  },
  sandbox: {
    title: 'Security model', desc: 'Widgets run in an opaque-origin sandboxed iframe under a strict CSP. Access to the host page is blocked; only token-checked postMessage calls reach the rate-limited bridge.',
    heading: 'SECURITY MODEL', host: 'DSH Web page (host)', origin: 'no allow-same-origin → window.origin === "null"',
    csp: 'scripts, styles, fonts, images only from cdnAllowlist', widget: 'Widget code', blocked: 'blocked',
    gate: 'postMessage check', gate1: 'source === this frame', gate2: 'per-frame random token', gate3: 'shape-checked, size-limited',
    bridge: 'Host bridge', rate1: 'no send in the first 1 s', rate2: '≤ 1 per 2 s · max chars',
    dsh: 'DSH page', dsh1: 'session, cookies, storage,', dsh2: 'API — out of reach', safe: 'verified by the E2E suite',
  },
}
const zh = {
  hero: {
    title: 'DeepSeek Harness 智能界面', desc: '一条回答以指标卡、堆叠柱状图和沙箱三维组件的形式流式出现。',
    pill: 'DeepSeek Harness 插件 · 生成式 UI', pillW: 262,
    sub: '为 DeepSeek Harness 带来生成式、可交互的界面',
    tag1: 'Agent 自行选择用文本、原生组件或沙箱实时组件作答，',
    tag2: '界面随回答流式出现，交互在浏览器内即时响应。',
    ask: '按渠道看看 Q1–Q4 营收', askW: 196,
    kpi1: '营收', kpi2: '订单', kpi3: '线上占比',
  },
  routing: {
    title: 'Agent 如何选择呈现方式', desc: '每一轮由 Agent 把提问路由到纯文本、ui_render 或 ui_render_widget；本地交互不调用模型，显式操作才回到 Agent。',
    heading: 'AGENT 如何选择', you: '用户', prompt: '任意提问', agent: 'DSH Agent', agentSub: '每一轮自行决定',
    text: '纯文本', textSub: '寒暄、事实、代码、编程任务',
    catSub: '原生组件，JSON 流式渲染', widSub: '沙箱 HTML / CSS / JS 实时组件',
    chat: '对话', back: '按钮 · 表单 · Bridge.sendPrompt → 回到 Agent',
    local: '本地优先', local1: '滑块 · 旋转 · 缩放', local2: '排序 · 标签页 → 不调用模型',
  },
  stream: {
    title: '沙箱组件的流式渲染', desc: '组件字段按顺序流式到达；css 完成前显示占位文字，随后把部分 HTML morph 进预览 iframe，最后在同一个 iframe 内定稿并执行代码。',
    heading: 'UI_RENDER_WIDGET · 流式协议', wtitle: '球面探索', placeholder: '正在绘制球面…',
    wh: 'x² + y² + z² = 2Rz', btn: '解释这个曲面', running: 'JS 运行中 · 同一个 iframe', runW: 176,
    ph0: '占位', ph0n: 'css 完成前显示 placeholderMessages',
    ph1: '实时预览', ph1n: '部分 HTML 通过 idiomorph 实时 morph',
    ph2: '原地定稿', ph2n: '最终 HTML + 执行代码，不重建、不闪烁',
  },
  sandbox: {
    title: '安全模型', desc: '组件运行在不透明源的沙箱 iframe 中，并受严格 CSP 约束。访问宿主页面会被拦截，只有通过 token 校验的 postMessage 才能到达限流的 Bridge。',
    heading: '安全模型', host: 'DSH Web 页面（宿主）', origin: '不加 allow-same-origin → window.origin === "null"',
    csp: '脚本、样式、字体、图片只能来自 cdnAllowlist', widget: '组件代码', blocked: '已拦截',
    gate: 'postMessage 校验', gate1: '来源必须是该 iframe', gate2: '每个 iframe 独立随机 token', gate3: '格式校验，大小受限',
    bridge: '宿主 Bridge', rate1: '挂载后 1 秒内拒绝发送', rate2: '每 2 秒最多 1 次 · 限长',
    dsh: 'DSH 页面', dsh1: '会话、cookie、存储、', dsh2: 'API 均无法触及', safe: '由 E2E 测试实测验证',
  },
}

for (const [suffix, L] of [['', en], ['.zh', zh]]) {
  writeFileSync(path.join(out, `hero${suffix}.svg`), hero(L.hero))
  writeFileSync(path.join(out, `routing${suffix}.svg`), routing(L.routing))
  writeFileSync(path.join(out, `widget-streaming${suffix}.svg`), stream(L.stream))
  writeFileSync(path.join(out, `security${suffix}.svg`), sandbox(L.sandbox))
}
console.log('written to', out)
