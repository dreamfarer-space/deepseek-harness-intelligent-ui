// 小鲸: an original chibi whale-girl mascot for the demo video (an unofficial
// fan character, not DeepSeek branding). Pure SVG, drawn from parameters so
// every video frame is deterministic: pose, expression and time t (seconds)
// drive blinking, bobbing, the swaying tail and the spout.

const C = {
  ink: '#22305f',
  hood: '#4d6bfe',
  hoodDark: '#3651d8',
  hoodLight: '#7d95ff',
  belly: '#eef3ff',
  hair: '#3a55e6',
  hairDark: '#2a3fb8',
  skin: '#ffe9df',
  skinShade: '#f8d3c6',
  blush: '#ff9fb0',
  dress: '#ffffff',
  dressShade: '#dfe7ff',
  collar: '#4d6bfe',
  bow: '#ff7a93',
  eye: '#1d2b6b',
  eyeLight: '#5b7cff',
  water: '#8fd3ff',
}

/** Smooth 0→1→0 pulse of `width` seconds every `period` seconds. */
const pulse = (t, period, width, offset = 0) => {
  const p = ((t + offset) % period + period) % period
  return p < width ? Math.sin((p / width) * Math.PI) : 0
}

function eyes(kind, blink) {
  if (kind === 'oops') {
    // > <
    return `<g stroke="${C.eye}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M100 168 l18 10 l-18 10"/><path d="M200 168 l-18 10 l18 10"/></g>`
  }
  if (kind === 'happy') {
    // ^ ^
    return `<g stroke="${C.eye}" stroke-width="6" stroke-linecap="round" fill="none">
      <path d="M96 182 q16 -20 32 0"/><path d="M172 182 q16 -20 32 0"/></g>`
  }
  const sy = Math.max(0.08, 1 - blink)
  const one = (cx) => `<g transform="translate(${cx} 178) scale(1 ${sy.toFixed(3)})">
      <ellipse rx="17" ry="22" fill="${C.eye}"/>
      <ellipse rx="17" ry="22" fill="url(#eyeGrad)"/>
      <ellipse cx="-6" cy="-9" rx="6.5" ry="7.5" fill="#fff"/>
      <circle cx="6" cy="8" r="3.2" fill="#fff" opacity=".85"/>
    </g>`
  const lashes = `<g stroke="${C.eye}" stroke-width="3.5" stroke-linecap="round" fill="none">
      <path d="M93 160 q20 -12 40 0"/><path d="M167 160 q20 -12 40 0"/></g>`
  return one(113) + one(187) + (sy > 0.5 ? lashes : '')
}

function mouth(kind, talk) {
  switch (kind) {
    case 'o': return `<ellipse cx="150" cy="216" rx="8" ry="${(9 + talk * 3).toFixed(1)}" fill="#c9455f"/>`
    case 'cat': return `<path d="M136 210 q7 9 14 0 q7 9 14 0" stroke="${C.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
    case 'wavy': return `<path d="M134 214 q4 -5 8 0 q4 5 8 0 q4 -5 8 0 q4 5 8 0" stroke="${C.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
    default: {
      const h = 10 + talk * 7
      return `<path d="M136 208 q14 ${h.toFixed(1)} 28 0 z" fill="#c9455f" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M142 ${(209 + h * 0.45).toFixed(1)} q8 ${(h * 0.35).toFixed(1)} 16 0" fill="#ff93a6"/>`
    }
  }
}

/**
 * Arms per pose: `back` is drawn behind the head, `front` over it (raised
 * gestures). Limbs are an outlined stroke, so every pose shares one look.
 * `w` is a 0..1 wave phase.
 */
function arms(pose, w) {
  const limb = (d, hx, hy) => `<path d="${d}" stroke="${C.ink}" stroke-width="25" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" stroke="${C.dress}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${hx}" cy="${hy}" r="13" fill="${C.skin}" stroke="${C.ink}" stroke-width="4"/>`
  const restL = limb('M118 274 Q98 298 92 322', 90, 330)
  const restR = limb('M182 274 Q202 298 208 322', 210, 330)
  switch (pose) {
    case 'wave': {
      const a = -14 + w * 28
      return { back: restL, front: `<g transform="rotate(${a.toFixed(1)} 184 272)">${limb('M184 272 Q236 254 250 208', 252, 200)}</g>` }
    }
    case 'point':
      return { back: restL, front: limb('M182 278 Q140 304 86 296', 80, 295) + `<path d="M68 294 h-16" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>` }
    case 'think':
      return { back: restL, front: limb('M182 278 Q218 262 190 244', 182, 240) }
    case 'cheer': {
      const up = (w * 10).toFixed(1)
      return { back: '', front: `<g transform="translate(0 -${up})">${limb('M118 270 Q72 252 54 200', 50, 192)}${limb('M182 270 Q228 252 246 200', 250, 192)}</g>` }
    }
    case 'oops':
      return { back: '', front: limb('M118 272 Q78 264 74 226', 74, 218) + limb('M182 272 Q222 264 226 226', 226, 218) }
    case 'sign':
      return { back: '', front: `<g>
        <rect x="58" y="252" width="184" height="96" rx="18" fill="#fff" stroke="${C.ink}" stroke-width="5"/>
        <rect x="66" y="260" width="168" height="80" rx="12" fill="#eef3ff"/>
        <text x="150" y="292" text-anchor="middle" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-weight="800" font-size="24" fill="${C.hoodDark}">真实模型</text>
        <text x="150" y="324" text-anchor="middle" font-family="'Microsoft YaHei','PingFang SC',sans-serif" font-weight="800" font-size="24" fill="${C.bow}">实测！</text>
        <circle cx="70" cy="300" r="13" fill="${C.skin}" stroke="${C.ink}" stroke-width="4"/>
        <circle cx="230" cy="300" r="13" fill="${C.skin}" stroke="${C.ink}" stroke-width="4"/></g>` }
    default:
      return { back: restL + restR, front: '' }
  }
}

/**
 * @param {{ pose?: 'idle'|'wave'|'point'|'think'|'cheer'|'oops'|'sign', expr?: 'normal'|'happy'|'oops', mouth?: 'smile'|'o'|'cat'|'wavy', t?: number, talking?: boolean, width?: number }} o
 */
export function mascot({ pose = 'idle', expr = 'normal', mouth: m = 'smile', t = 0, talking = false, width = 300 } = {}) {
  const bob = Math.sin(t * 2.4) * 4 + (pose === 'cheer' ? -Math.abs(Math.sin(t * 6)) * 10 : 0)
  const blink = expr === 'normal' ? pulse(t, 3.4, 0.16, 0.7) : 0
  const tail = Math.sin(t * 3.1) * 10
  const wave = (Math.sin(t * 7) + 1) / 2
  const talk = talking ? (Math.sin(t * 17) + 1) / 2 : 0
  const spout = pulse(t, 2.6, 1.1)
  const height = Math.round(width * 4 / 3)
  const limbs = arms(pose, wave)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="${width}" height="${height}" overflow="visible">
  <defs>
    <linearGradient id="eyeGrad" x1="0" y1="-1" x2="0" y2="1">
      <stop offset="0" stop-color="${C.eye}" stop-opacity="0"/><stop offset="1" stop-color="${C.eyeLight}"/>
    </linearGradient>
    <linearGradient id="hoodGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.hoodLight}"/><stop offset=".6" stop-color="${C.hood}"/><stop offset="1" stop-color="${C.hoodDark}"/>
    </linearGradient>
    <radialGradient id="shadow"><stop offset="0" stop-color="#3b4fbf" stop-opacity=".22"/><stop offset="1" stop-color="#3b4fbf" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="150" cy="392" rx="${(92 - bob).toFixed(1)}" ry="12" fill="url(#shadow)"/>
  <g transform="translate(0 ${bob.toFixed(2)})">
    <!-- whale tail behind -->
    <g transform="rotate(${tail.toFixed(1)} 206 318)">
      <path d="M200 320 q40 0 58 -28" stroke="${C.hood}" stroke-width="22" fill="none" stroke-linecap="round"/>
      <path d="M254 296 q-6 -30 -30 -40 q24 -2 36 18 q10 -22 36 -20 q-22 12 -26 40 z" fill="url(#hoodGrad)" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    <!-- legs -->
    <g stroke="${C.ink}" stroke-width="4" stroke-linejoin="round">
      <rect x="122" y="336" width="20" height="36" rx="8" fill="${C.skin}"/>
      <rect x="158" y="336" width="20" height="36" rx="8" fill="${C.skin}"/>
      <path d="M116 366 h30 q4 16 -6 18 h-22 q-8 -4 -2 -18 z" fill="${C.hood}"/>
      <path d="M154 366 h30 q6 14 -2 18 h-22 q-10 -2 -6 -18 z" fill="${C.hood}"/>
    </g>
    <!-- dress -->
    <path d="M112 258 q38 -14 76 0 l30 86 q-68 22 -136 0 z" fill="${C.dress}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M90 334 q60 18 120 0 l8 10 q-68 22 -136 0 z" fill="${C.dressShade}"/>
    <path d="M96 326 q12 8 24 0 q12 8 24 0 q12 8 24 0 q12 8 24 0 q12 8 24 0" stroke="${C.collar}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- sailor collar + bow -->
    <path d="M114 256 q36 34 72 0 l8 18 q-44 34 -88 0 z" fill="${C.collar}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M121 266 q29 22 58 0" stroke="#fff" stroke-width="3" fill="none"/>
    <g transform="translate(150 284)" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round">
      <path d="M0 0 l-22 -12 v24 z" fill="${C.bow}"/><path d="M0 0 l22 -12 v24 z" fill="${C.bow}"/>
      <circle r="6" fill="#ff5d7c"/>
    </g>
    ${limbs.back}
    <!-- back hair -->
    <path d="M58 186 q-6 70 30 92 q-4 -40 8 -60 z M242 186 q6 70 -30 92 q4 -40 -8 -60 z" fill="${C.hair}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <!-- face -->
    <ellipse cx="150" cy="176" rx="88" ry="80" fill="${C.skin}" stroke="${C.ink}" stroke-width="4"/>
    <ellipse cx="150" cy="232" rx="54" ry="12" fill="${C.skinShade}" opacity=".5"/>
    ${eyes(expr, blink)}
    <ellipse cx="94" cy="208" rx="15" ry="8" fill="${C.blush}" opacity=".7"/>
    <ellipse cx="206" cy="208" rx="15" ry="8" fill="${C.blush}" opacity=".7"/>
    ${mouth(m, talk)}
    ${expr === 'oops' ? `<path d="M232 120 q12 18 0 28 q-12 -10 0 -28 z" fill="${C.water}" stroke="${C.ink}" stroke-width="3"/>` : ''}
    <!-- bangs -->
    <path d="M64 162 q4 -60 86 -66 q82 6 86 66 q-14 -14 -26 -18 q2 14 -6 24 q-10 -22 -30 -30 q0 16 -10 24 q-8 -20 -18 -26 q-6 18 -22 24 q0 -16 -8 -26 q-18 10 -24 28 q-8 -10 -6 -24 q-12 6 -22 22 z" fill="${C.hair}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M104 116 q22 -14 46 -14" stroke="#8ea3ff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>
    <!-- whale hood -->
    <path d="M50 158 q-6 -96 100 -104 q106 8 100 104 q-18 -58 -100 -62 q-82 4 -100 62 z" fill="url(#hoodGrad)" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M56 150 q10 -40 50 -54" stroke="#fff" stroke-width="4" fill="none" opacity=".35" stroke-linecap="round"/>
    <path d="M62 158 q88 -40 176 0" stroke="${C.belly}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M66 160 q84 -34 168 0" stroke="${C.hoodDark}" stroke-width="2" fill="none" stroke-dasharray="2 10" stroke-linecap="round"/>
    <!-- hood fins -->
    <path d="M58 122 q-30 -6 -40 16 q22 -4 38 6 z" fill="${C.hood}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M242 122 q30 -6 40 16 q-22 -4 -38 6 z" fill="${C.hood}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <!-- hood eye + smile (the whale) -->
    <circle cx="96" cy="96" r="5.5" fill="${C.ink}"/><circle cx="94" cy="94" r="1.8" fill="#fff"/>
    <path d="M82 112 q10 8 22 2" stroke="${C.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- spout -->
    <g transform="translate(150 54)" opacity="${(0.35 + spout * 0.65).toFixed(2)}">
      <path d="M0 0 v-${(14 + spout * 10).toFixed(1)}" stroke="${C.water}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="-14" cy="${(-18 - spout * 10).toFixed(1)}" r="${(6 + spout * 2).toFixed(1)}" fill="${C.water}" stroke="${C.ink}" stroke-width="3"/>
      <circle cx="0" cy="${(-28 - spout * 12).toFixed(1)}" r="${(7 + spout * 2).toFixed(1)}" fill="${C.water}" stroke="${C.ink}" stroke-width="3"/>
      <circle cx="14" cy="${(-18 - spout * 10).toFixed(1)}" r="${(6 + spout * 2).toFixed(1)}" fill="${C.water}" stroke="${C.ink}" stroke-width="3"/>
    </g>
    ${limbs.front}
  </g>
</svg>`
}
