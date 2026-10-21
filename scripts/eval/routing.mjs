// Paired presentation-routing cases (group F, issue #58). Each pair keeps the
// topic and changes only the task: explaining something vs. exploring it in the
// chat, code to copy vs. a project change vs. an inline widget, a Markdown table
// vs. a searchable one, a closing Choice vs. a sectioned composition. The two
// sides fail in opposite directions, so a prompt cannot pass a pair by always
// (or never) drawing UI.
//
// Categories make the two error rates readable in the report:
//   no-ui     the right answer has no UI tool: a failure is an unnecessary UI
//   needs-ui  the task needs UI in the chat: a failure is a missed or wrong UI
//   update    a follow-up must change the existing UI and respect the user
// The whole answer is judged, not just the tool name: the explanation, the code,
// the requested interaction and the user's data must actually be there.
import { composedProse, composedTrees, compositionInterleaves, renderedNodes } from './assertions.mjs'
import { COMPOSE, PATCH, RENDER, scoreTurn, touched, WIDGET } from './scoring.mjs'

const ok = (turn, name) => turn.calls.filter(c => c.ok && c.name === name).map(c => c.args)

/** Everything a turn showed: native nodes (rendered or composed), widgets (standalone or composed) and prose. */
export function shown(turn) {
  const compositions = ok(turn, COMPOSE)
  const trees = [...ok(turn, RENDER), ...compositions.flatMap(composedTrees)]
  const widgets = [...ok(turn, WIDGET), ...compositions.flatMap(c => c.blocks.filter(b => b?.type === 'widget'))]
  return {
    nodes: trees.flatMap(tree => renderedNodes(tree)),
    widgets,
    compositions,
    prose: [turn.text, ...compositions.map(composedProse)].join('\n\n'),
  }
}

const code = w => [w.jsFunctions, ...(w.jsExpressions || [])].filter(Boolean).join('\n')
const threeD = w => /UI\.three\s*\(|import\(\s*["']three["']\s*\)|getContext\(\s*["']webgl/.test(code(w))
const sliders = w => /<input[^>]*type\s*=\s*["']?range/i.test(String(w.html))
/** A fenced code block in the reply. */
export const fenced = text => /```[\s\S]*?```/.test(text)
/** A GitHub-flavoured Markdown table: a header row followed by a delimiter row. */
export const markdownTable = text => /^\s*\|.*\|\s*\r?\n\s*\|?\s*:?-{3,}:?\s*\|/m.test(text)

/** The user can drag a parameter in the chat: a Plot slider or a range input in a widget. */
export function interactive(view) {
  return view.nodes.some(n => n.type === 'Plot' && (n.props?.params ?? []).length >= 1) || view.widgets.some(sliders)
}

/** A text-only case: no UI tool, plus the answer's own content checks. */
function prose(id, title, prompt, checks = () => []) {
  return {
    id, group: 'F', category: 'no-ui', title, prompt,
    async run(convo) {
      const turn = await convo.turn(prompt)
      return { turns: [turn], checks: scoreTurn(turn, 'none', [['substantive text answer', turn.text.trim().length > 20, `${turn.text.length} chars`], ...checks(turn.text)]) }
    },
  }
}

/** A case that needs UI in the chat, judged on what was actually shown. */
function visual(id, title, prompt, expect, checks) {
  return {
    id, group: 'F', category: 'needs-ui', title, prompt,
    async run(convo) {
      const turn = await convo.turn(prompt)
      return { turns: [turn], checks: scoreTurn(turn, expect, checks(shown(turn), turn)) }
    },
  }
}

/** A table cell as a number: "2,189" and "2189 万" both read as 2189. */
const number = cell => Number(String(cell).replace(/[^\d.]/g, ''))

const CITIES = [
  ['北京', 2189, 16411], ['上海', 2487, 6341], ['广州', 1882, 7434], ['深圳', 1768, 1997],
  ['重庆', 3191, 82402], ['成都', 2140, 14335], ['杭州', 1252, 16850], ['武汉', 1377, 8569],
  ['西安', 1299, 10108], ['南京', 942, 6587], ['天津', 1364, 11966], ['苏州', 1291, 8657],
]

export const ROUTING_SCENARIOS = [
  // 1. Same knowledge topic: a definition vs. a request to drag the parameter.
  prose('F1a', 'Explain damping ratio (one sentence)', '一句话解释阻尼比是什么。', text => [['mentions damping', /阻尼|damping/i.test(text)]]),
  visual('F1b', 'Damping ratio with a slider', '解释一下阻尼比，并让我拖动阻尼比滑块，比较二阶系统在不同阻尼比下的阶跃响应。', [RENDER, WIDGET, COMPOSE], view => [
    ['a parameter the user can drag (Plot slider or range input)', interactive(view)],
    ['the explanation is there, not only the plot', /阻尼|damping/i.test(view.prose) && view.prose.trim().length > 40, `${view.prose.trim().length} chars of prose`],
  ]),

  // 2. A 3D keyword is not a request for a widget.
  prose('F2a', 'Explain Three.js concepts', '解释一下 Three.js 里场景（Scene）、相机（Camera）和渲染器（Renderer）分别是什么概念。', text => [['covers scene, camera and renderer', /scene|场景/i.test(text) && /camera|相机/i.test(text) && /renderer|渲染器/i.test(text)]]),
  visual('F2b', 'Rotatable 3D axes in the chat', '在对话里展示一个可以用鼠标拖拽旋转的三维坐标系，X/Y/Z 三个轴要有标签。', [WIDGET, COMPOSE], view => [
    ['a 3D widget (Three.js or WebGL)', view.widgets.some(threeD)],
  ]),

  // 3. Code to copy and a project change are not inline widgets.
  prose('F3a', 'Copyable Three.js setup code', '给我一段可以直接复制的 Three.js 初始化代码：创建场景、透视相机和渲染器，渲染一个旋转的立方体。', text => [
    ['a fenced code block with the camera setup', fenced(text) && /PerspectiveCamera/.test(text)],
  ]),
  // The API stage has no workspace tools: this only checks that no inline UI stands in for the project change.
  prose('F3b', 'Change a 3D component in the repo', '修改我仓库里 src/scene/Viewer.tsx 这个三维场景组件，把透视相机换成正交相机。', text => [
    ['addresses the camera change', /OrthographicCamera|正交/i.test(text)],
  ]),

  // 4. Explicit format wins; exploration of the user's own rows needs the data grid.
  prose('F4a', 'Markdown comparison table', '用 Markdown 表格比较 REST 和 GraphQL 两种 API 方案，比较 4 个维度。', text => [['a Markdown table in the reply', markdownTable(text)]]),
  visual('F4b', 'Searchable, sortable table of given data',
    `把这些城市数据做成一个可以搜索、按列排序的表格（城市 / 常住人口（万人）/ 面积（km²））：\n${CITIES.map(c => c.join(' ')).join('\n')}`,
    RENDER, view => {
      const tables = view.nodes.filter(n => n.type === 'Table')
      return [
        ['a Table with all 12 rows', tables.some(t => (t.props?.rows ?? []).length >= CITIES.length)],
        ['sortable', tables.some(t => t.props?.sortable === true)],
        ['searchable or filterable', tables.some(t => t.props?.searchable === true || t.props?.filterable === true)],
        ['the user\'s numbers, not invented ones', tables.some(t => CITIES.every(([city, people]) => (t.props?.rows ?? []).some(r => r.some(c => String(c).includes(city)) && r.some(c => [people, people * 10000].includes(number(c))))))],
      ]
    }),

  // 5. A formula stays in prose; a derivation with a plot between the steps is a composition.
  prose('F5a', 'Second-order transfer function', '写出二阶系统的标准传递函数。', text => [['natural frequency and damping ratio appear', /ω|omega/i.test(text) && /ζ|zeta|xi|ξ|阻尼/i.test(text)]]),
  visual('F5b', 'Derivation with a plot in the middle', '边推导二阶欠阻尼系统的阶跃响应，边在推导过程中插入一张可以调节阻尼比的响应曲线，最后根据曲线解释结果。', COMPOSE, view => [
    ['an adjustable response curve', interactive(view)],
    ['prose before and after the curve', view.compositions.some(compositionInterleaves)],
  ]),

  // 6. Explaining a game vs. playing one here.
  prose('F6a', 'What is a game loop', '解释一下游戏开发里的游戏循环（game loop）是什么。'),
  visual('F6b', 'Playable game in the chat', '在对话里做一个可以直接玩的贪吃蛇小游戏，用方向键控制。', [WIDGET, COMPOSE], view => [
    ['a widget that reads the arrow keys', view.widgets.some(w => /keydown|keyup/.test(code(w)) && /Arrow|keyCode|\b3[7-9]\b|\b40\b/.test(code(w)))],
    ['a running game loop', view.widgets.some(w => /requestAnimationFrame|setInterval|onFrame\s*\(|setTimeout/.test(code(w)))],
  ]),

  // 7. Analysis + one closing decision is a reply with a Choice; sections that each need a chart are a composition.
  visual('F7a', 'Analysis ending in a Choice', '分析一下个人博客用 Hugo、Next.js 和 WordPress 各自的优缺点，最后让我选一个继续深入讨论。', RENDER, (view, turn) => [
    ['a closing Choice with the options', view.nodes.some(n => n.type === 'Choice' && (n.props?.options ?? []).length >= 2)],
    ['the analysis is written in the reply', ['Hugo', 'Next', 'WordPress'].every(k => turn.text.includes(k)) && turn.text.trim().length > 150, `${turn.text.trim().length} chars`],
  ]),
  visual('F7b', 'Report with a chart after each section',
    '写一份博客方案对比报告，分三节：构建速度、生态规模、托管成本，每一节文字分析后各插入一张对应的柱状图。数据：构建 1000 页耗时 Hugo 2 秒、Next.js 60 秒、WordPress 无需构建（记为 0）；主题数量 Hugo 400、Next.js 200、WordPress 10000；每月托管成本 Hugo 0 元、Next.js 0 元、WordPress 30 元。',
    COMPOSE, view => {
      const blocks = view.compositions.at(-1)?.blocks ?? []
      const charts = blocks.filter(b => b?.type === 'catalog' && renderedNodes(b).some(n => n.type === 'Chart'))
      const proseBefore = blocks.every((b, i) => b?.type === 'markdown' || (i > 0 && blocks[i - 1]?.type === 'markdown'))
      return [
        ['three chart blocks, one per section', charts.length >= 3, `${charts.length} chart block(s)`],
        ['every UI block follows its own prose', blocks.length > 0 && proseBefore],
      ]
    }),

  // 8. A follow-up edits the existing UI and leaves the rest alone.
  {
    id: 'F8', group: 'F', category: 'update', title: 'Change only the chart, keep the table',
    prompt: '做一个看板：上面是 Q1-Q4 线上/线下销售额柱状图（线上 120、135、150、170；线下 90、95、88、100），下面是可以按区域筛选的门店明细表：A 店 华东 320，B 店 华东 280，C 店 华南 260，D 店 华南 190，E 店 华北 240，F 店 华北 150。',
    async run(convo) {
      const t1 = await convo.turn(this.prompt)
      const before = touched(convo, t1).at(-1)
      const nodes = before ? renderedNodes(before) : []
      const table = nodes.find(n => n.type === 'Table')
      const checks = scoreTurn(t1, RENDER, [['bar chart and table rendered', nodes.some(n => n.type === 'Chart' && n.props.kind === 'bar') && !!table]])
      if (!before || !table) return { turns: [t1], checks }
      const t2 = await convo.turn('只把柱状图改成折线图，表格和它的筛选保持不变。')
      const after = touched(convo, t2).find(ui => ui.uiId === before.uiId)
      const kept = after && renderedNodes(after).find(n => n.id === table.id)
      checks.push(...scoreTurn(t2, PATCH, [
        ['the chart is now a line chart', !!after && renderedNodes(after).some(n => n.type === 'Chart' && n.props.kind === 'line')],
        ['the table is untouched (same id and props, so its filter state survives)', !!kept && JSON.stringify(kept.props) === JSON.stringify(table.props)],
        ['patched the same UI in place', !!after && after.version > before.version],
      ]).map(([n, ...r]) => [`edit · ${n}`, ...r]))
      return { turns: [t1, t2], checks }
    },
  },

  // 9. An explicit restriction beats a 3D context from the turn before.
  {
    id: 'F9', group: 'F', category: 'no-ui', title: 'Text-only request after a 3D turn',
    prompt: '在对话里展示一个可以旋转的三维立方体。',
    async run(convo) {
      const t1 = await convo.turn(this.prompt)
      const t2 = await convo.turn('只解释原因，不画图、不改代码：为什么透视投影会让远处的物体看起来更小？')
      return {
        turns: [t1, t2],
        checks: [
          ['setup turn showed a widget', t1.calls.some(c => c.ok && (c.name === WIDGET || c.name === COMPOSE)), 'informational: only sets the context', true],
          ...scoreTurn(t2, 'none', [['explains the cause in text', /距离|远|视角|透视|distance|perspective/i.test(t2.text) && t2.text.trim().length > 40]]).map(([n, ...r]) => [`restricted turn · ${n}`, ...r]),
        ],
      }
    },
  },

  // 10. No data source: say so rather than draw invented numbers.
  prose('F10', 'Live data without a source', '给我画一张今天上证指数的实时分时走势图。', text => [
    ['says live data is not available here', /实时|无法|不能|没有|拿不到|获取不到|unable|real-?time|cannot/i.test(text)],
  ]),

  // English paraphrases of the same boundaries.
  prose('F11a', 'Explain Fourier series (en)', 'Briefly explain what a Fourier series is.', text => [['mentions sines/cosines or harmonics', /sin|cos|harmonic|frequenc/i.test(text)]]),
  visual('F11b', 'Fourier harmonics with a slider (en)', 'Let me add harmonics one at a time with a slider and watch a square wave take shape from its Fourier series.', [RENDER, WIDGET, COMPOSE], view => [
    ['a harmonic count the user can drag', interactive(view)],
  ]),
  prose('F12a', 'Mesh vs material (en)', 'In 3D graphics, what is the difference between a mesh and a material?', text => [['covers mesh and material', /mesh/i.test(text) && /material/i.test(text)]]),
  visual('F12b', 'Rotatable torus in the chat (en)', 'Show me, right here in the chat, a 3D torus I can rotate with the mouse, with a toggle between wireframe and solid.', [WIDGET, COMPOSE], view => [
    ['a 3D widget (Three.js or WebGL)', view.widgets.some(threeD)],
    ['a wireframe toggle', view.widgets.some(w => /wireframe/i.test(code(w) + w.html))],
  ]),
]
