import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import https from 'node:https'
import { deflateSync } from 'node:zlib'
import { callChat, getApiKey, config, pluginTools, PROMPT_VERSION } from '../scripts/test-real-model.mjs'
import { checkedCalls, checkChartEdits, checkNativeCase, checkUpdatedTable, composeChecks, composedProse, compositionInterleaves, fillForecastForm, incorporatesSubmission, nativeChecks, widgetChecks } from '../scripts/eval/assertions.mjs'
import { Conversation } from '../scripts/eval/conversation.mjs'
import { API_SCENARIOS, runApiStage } from '../scripts/eval/api-stage.mjs'
import { ASSERTION_VERSION } from '../scripts/eval/assertions.mjs'
import { assertNoSecrets, percentile, redact, summarize, timing, toMarkdown } from '../scripts/eval/report.mjs'
import { imageDiff, imageStats } from '../scripts/eval/png.mjs'

const tree = (type, props) => ({ root: 'r', components: [{ id: 'r', type, props }] })
const call = (id, args, name = 'ui_render') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const table = (sizes = null, price = 100) => tree('Table', {
  columns: ['Model', 'Price', ...(sizes ? ['屏幕尺寸'] : [])],
  rows: ['A', 'B', 'C'].map((m, i) => [`Model ${m}`, price + i, ...(sizes ? [sizes[i]] : [])]),
})
const chart = (kind = 'bar', series = [{ name: '线上电商', values: [1, 2, 3, 4] }, { name: '线下门店', values: [4, 3, 2, 1] }]) =>
  tree('Chart', { kind, labels: ['Q1', 'Q2', 'Q3', 'Q4'], series })
const { _note, ...historicalB3 } = JSON.parse(readFileSync(new URL('./fixtures/historical-b3.json', import.meta.url), 'utf8'))

/** A scripted model for the API stage: each call returns the next message. */
function scripted(...messages) {
  let i = 0
  return vi.fn(async () => ({ message: { role: 'assistant', content: null, ...messages[Math.min(i++, messages.length - 1)] }, model: 'deepseek-flash', fingerprint: 'fp_test', ms: 10 }))
}

describe('real-model evaluation assertions', () => {
  it('rejects a schema-valid form in place of the requested multi-series chart', () => {
    const args = tree('Form', { fields: [{ name: 'revenue', label: 'Revenue', type: 'number' }] })
    checkedCalls({ tool_calls: [call('form', args)] }, config)
    expect(checkNativeCase('B3', args)).toMatch(/missing/)
    expect(checkNativeCase('B3', chart())).toBeNull()
    const single = chart('bar', [{ name: '线上电商', values: [1, 2, 3, 4] }])
    expect(checkNativeCase('B3', single)).toMatch(/missing/)
  })

  it('keeps failing the historical B3 answer that the old evaluator passed', async () => {
    // Schema-valid: the old evaluator only checked this.
    expect(() => checkedCalls({ tool_calls: [call('b3', historicalB3)] }, config)).not.toThrow()
    const failed = nativeChecks('B3', historicalB3).filter(([, ok]) => !ok).map(([name]) => name)
    expect(failed).toEqual(['bar Chart rendered', 'four quarters Q1-Q4 on the x axis', 'online and offline series with 4 values each'])
    // And through the real API stage, with the plugin's real tool execute().
    const chat = scripted({ tool_calls: [call('b3', historicalB3)] }, { content: 'Shown above.' })
    const [b3] = await runApiStage({ chat, tools: pluginTools, ids: ['B3'], log: () => {} })
    expect(b3).toMatchObject({ id: 'B3', passed: false, schema: { firstAttemptValid: true } })
    expect(b3.reason).toMatch(/bar Chart rendered/)
  })

  it('does not score orphan components that the user cannot see', () => {
    const args = tree('Text', { text: 'No table displayed' })
    args.components.push({ id: 'orphan', type: 'Table', props: { columns: ['x'], rows: [[1]], sortable: true } })
    checkedCalls({ tool_calls: [call('orphan', args)] }, config)
    expect(checkNativeCase('B2', args)).toMatch(/missing/)
  })

  it('checks quarters, series names and Plot slider wiring, not just component types', () => {
    const wrongAxis = chart(); wrongAxis.components[0].props.labels = ['Jan', 'Feb', 'Mar', 'Apr']
    expect(nativeChecks('B3', wrongAxis).find(([n]) => /quarters/.test(n))[1]).toBe(false)
    const plot = (exprs, names = ['A', 'k', 'w']) => tree('Plot', {
      functions: exprs.map(expr => ({ expr })),
      params: names.map(name => ({ name, min: 0, max: 2, value: 1 })),
    })
    expect(nativeChecks('C2', plot(['A*exp(-k*x)*sin(w*x)'])).every(([, ok]) => ok)).toBe(true)
    const unused = nativeChecks('C2', plot(['A*exp(-k*x)*sin(x)']))
    expect(unused.find(([n]) => /every slider/.test(n))[1]).toBe(false)
  })

  it('accepts real-model wording and equivalent presentations, but not loose ones', () => {
    const stats = labels => ({ root: 'g', components: [{ id: 'g', type: 'Grid', children: labels.map((_, i) => `s${i}`) }, ...labels.map((label, i) => ({ id: `s${i}`, type: 'Stat', props: { label, value: 1 } }))] })
    expect(nativeChecks('B1', stats(['总收入（Q1）', '月活用户（3月）', '整体转化率', '客单价（ARPU）']))[0][1]).toBe(true)
    expect(nativeChecks('B1', stats(['Revenue', 'MAU', 'Conversion', 'AOV']))[0][1]).toBe(true)
    expect(nativeChecks('B1', stats(['总收入', 'Daumier', '转化率', '客单价']))[0][1]).toBe(false)
    const cars = columns => tree('Table', { sortable: true, columns, rows: [['a'], ['b'], ['c']] })
    expect(nativeChecks('B2', cars(['车型', 'CLTC 续航 (km)', '零百加速 (s)', '指导价 (万元)', '电池容量 (kWh)']))[1][1]).toBe(true)
    expect(nativeChecks('B2', cars(['车型', '续航', '零百加速', '电池容量']))[1][1]).toBe(false)
    const quarters = labels => { const c = chart(); c.components[0].props.labels = labels; return nativeChecks('B3', c)[1][1] }
    expect([['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'], ['2025Q1', '2025Q2', '2025Q3', '2025Q4'], ['第一季度', '第二季度', '第三季度', '第四季度']].map(quarters)).toEqual([true, true, true])
    expect(quarters(['Q1', 'Q2', 'Q3', 'Q5'])).toBe(false)
    const mermaid = code => tree('Mermaid', { code })
    expect(nativeChecks('B5', mermaid('flowchart LR\n A["2017 奠基"] --> B["2021 规划"] --> C["2023 VLA"] --> D["2025 落地"]'))[0][1]).toBe(true)
    expect(nativeChecks('B5', mermaid('flowchart LR\n A["2025"] --> B["2017"] --> C["2020"] --> D["2023"]'))[0][1]).toBe(false)
    expect(nativeChecks('B5', mermaid('flowchart LR\n A --> B --> C --> D'))[0][1]).toBe(false)
  })

  it('checks widgets for Three.js, animation and controls', () => {
    const three = { html: '<div id="stage"></div>', jsFunctions: 'async function init(){ const v = await UI.three("#stage"); v.onFrame(() => {}) }', jsExpressions: ['init()'] }
    expect(widgetChecks('C3', three).every(([, ok]) => ok)).toBe(true)
    const flat = { html: '<canvas></canvas>', jsExpressions: ['draw()'] }
    expect(widgetChecks('C1', flat)[0][1]).toBe(false)
    const pendulum = { html: '<button>开始/暂停</button><input type="range" id="len"> 摆长 <input type="range"> 重力', jsExpressions: ['requestAnimationFrame(step)'] }
    expect(widgetChecks('C4', pendulum).every(([, ok]) => ok)).toBe(true)
  })

  it('requires the submitted values and fills forms by meaning', () => {
    expect(incorporatesSubmission({ content: 'A generic analysis '.repeat(30) }, [])).toBe(false)
    expect(incorporatesSubmission({ content: 'APAC results for four quarters' }, [])).toBe(false)
    expect(incorporatesSubmission({ content: 'APAC，四个季度，乐观情景' }, [])).toBe(true)
    expect(incorporatesSubmission({}, [{ args: { title: 'APAC, 4 quarters, Optimistic' } }])).toBe(true)
    expect(incorporatesSubmission({ content: '华北 4 个季度 乐观' }, [], '华东')).toBe(false)
    const form = { fields: [
      { name: 'region', label: '预测区域', type: 'select', options: ['全国', '华东'] },
      { name: 'n', label: '预测季度数', type: 'number' },
      { name: 'scenario', label: '预测情景', type: 'select', options: ['乐观', '基准', '保守'] },
    ] }
    expect(fillForecastForm(form)).toEqual({ values: { region: '全国', n: 4, scenario: '乐观' }, missing: [], region: '全国' })
    expect(fillForecastForm({ fields: [form.fields[1]] }).missing).toEqual(['region', 'scenario'])
  })

  it('requires correct per-model screen sizes and retains prior table values', () => {
    const before = table()
    expect(checkUpdatedTable(before, table(['6.1 寸', 6.7, '6.5 inches']))).toBe(true)
    expect(checkUpdatedTable(before, table([6.7, 6.1, 6.5]))).toBe(false)
    expect(checkUpdatedTable(before, table([6.1, 6.7, 6.5], 999))).toBe(false)
    const missing = table([6.1, 6.7, 6.5]); missing.components[0].props.rows.pop()
    expect(checkUpdatedTable(before, missing)).toBe(false)
  })

  it('scores successive chart edits against the original series', () => {
    const added = { name: '小程序', values: [30, 45, 60, 80] }
    const good = chart('line', [...chart().components[0].props.series, { name: '小程序', values: added.values }])
    expect(checkChartEdits(chart(), good, { kind: 'line', added }).every(([, ok]) => ok)).toBe(true)
    const altered = chart('line', [{ name: '线上电商', values: [9, 9, 9, 9] }, chart().components[0].props.series[1]])
    expect(checkChartEdits(chart(), altered, { kind: 'line' }).map(([, ok]) => ok)).toEqual([true, false])
  })

  it('scores composed answers on their catalog blocks and on how prose surrounds them', () => {
    const blocks = [
      { id: 'intro', type: 'markdown', text: 'Trade-offs first. 阻尼 解释。' },
      { id: 'chart', type: 'catalog', root: 'c', components: [{ id: 'c', type: 'Chart', props: { kind: 'bar', labels: ['Local', 'Supabase', 'Custom'], series: [{ name: 'Cost', values: [0, 25, 60] }] } }] },
      { id: 'outro', type: 'markdown', text: 'Next steps.' },
      { id: 'choice', type: 'catalog', root: 'p', components: [{ id: 'p', type: 'Choice', props: { question: 'Which?', options: [{ id: 'a', label: 'A', prompt: 'a' }, { id: 'b', label: 'B', prompt: 'b' }] } }] },
    ]
    const checks = composeChecks('E1', { blocks })
    expect(checks.every(([, ok]) => ok)).toBe(true)
    expect(compositionInterleaves({ blocks })).toBe(true)
    expect(compositionInterleaves({ blocks: [blocks[0], blocks[1]] })).toBe(false)
    expect(compositionInterleaves({ blocks: [blocks[1], blocks[0]] })).toBe(false)
    expect(composedProse({ blocks })).toBe(blocks[0].text + String.fromCharCode(10, 10) + blocks[2].text)
    expect(composeChecks('E1', { blocks: [{ id: 'only', type: 'catalog', root: 'c', components: blocks[1].components }] }).find(([n]) => /prose before/.test(n))[1]).toBe(false)
    // Composition calls are accepted by the history checker once their blocks validate.
    expect(() => checkedCalls({ tool_calls: [call('comp', { blocks }, 'ui_render')] }, config)).toThrow(/validateTree failed/)
    expect(() => checkedCalls({ tool_calls: [call('comp', { blocks }, 'ui_compose')] }, config)).not.toThrow()
    expect(() => checkedCalls({ tool_calls: [call('comp', { blocks: [{ id: 'x', type: 'markdown', text: '' }] }, 'ui_compose')] }, config)).toThrow(/validateComposition/)
  })

  it('refuses malformed tool calls', () => {
    expect(() => checkedCalls({ tool_calls: [call('one', table()), call('one', table())] }, config)).toThrow(/unique/)
    expect(() => checkedCalls({ tool_calls: [call('bad', { root: 'absent', components: [] })] }, config)).toThrow(/validateTree/)
    expect(() => checkedCalls({ tool_calls: [call('bad', {}, 'unknown')] }, config)).toThrow(/Unexpected tool/)
  })

  it('rejects tail-only UI in the interleaved analysis and teaching scenarios', async () => {
    const turn = { calls: [{ name: 'ui_render', ok: true, args: table() }],
      text: '阻尼衰减与欠阻尼现象。'.repeat(30), exhausted: false }
    for (const id of ['E1', 'E2']) {
      const { checks } = await API_SCENARIOS.find(s => s.id === id).run({ turn: async () => turn })
      expect(checks.find(([name]) => name === 'tool: ui_compose')[1]).toBe(false)
    }
  })
})

describe('API stage conversation', () => {
  it('offers the plugin\'s four tools and a stable prompt version', () => {
    expect(pluginTools.map(t => t.name)).toEqual(['ui_render', 'ui_patch', 'ui_render_widget', 'ui_compose'])
    expect(PROMPT_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })

  it('runs the real tools: acknowledges every call, patches in place and lets the model retry a refused call', async () => {
    const chat = scripted(
      { tool_calls: [call('t1', table())] },
      { content: 'Here is the table.' },
      // An invalid patch first (unknown component id), then a valid one.
      { tool_calls: [call('p1', { uiId: 't1', baseVersion: 1, ops: [{ op: 'setProps', id: 'nope', props: {} }] }, 'ui_patch')] },
      { tool_calls: [call('p2', { uiId: 't1', baseVersion: 1, ops: [{ op: 'setProps', id: 'r', props: table(['6.1', '6.7', '6.5']).components[0].props }] }, 'ui_patch')] },
      { content: 'Updated.' },
    )
    const convo = new Conversation(chat, pluginTools)
    const first = await convo.turn('table please')
    expect(first.calls.map(c => [c.name, c.ok])).toEqual([['ui_render', true]])
    const tool = convo.messages.find(m => m.role === 'tool')
    expect(tool).toMatchObject({ tool_call_id: 't1' })
    expect(tool.content).toMatch(/uiId t1, version 1/)
    const second = await convo.turn('add screen sizes')
    expect(second.calls.map(c => [c.name, c.ok])).toEqual([['ui_patch', false], ['ui_patch', true]])
    expect(convo.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(['t1', 'p1', 'p2'])
    const ui = convo.uis().get('t1')
    expect(ui.version).toBe(2)
    expect(checkUpdatedTable(table(), ui)).toBe(true)
  })

  it('rescores a saved run from its transcript without calling the model', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-eval-replay-'))
    try {
      const live = scripted({ tool_calls: [call('t1', table())] }, { content: 'Here is the table.' },
        { tool_calls: [call('p1', { uiId: 't1', baseVersion: 1, ops: [{ op: 'setProps', id: 'r', props: table(['6.1', '6.7', '6.5']).components[0].props }] }, 'ui_patch')] }, { content: 'Updated.' })
      const [first] = await runApiStage({ chat: live, tools: pluginTools, ids: ['D2'], transcripts: dir, log: () => {} })
      const offline = vi.fn(async () => { throw new Error('the model must not be called') })
      const [again] = await runApiStage({ chat: offline, tools: pluginTools, ids: ['D2'], transcripts: dir, replay: new Map([['D2-1', first]]), log: () => {} })
      expect(offline).not.toHaveBeenCalled()
      expect(again.checks).toEqual(first.checks)
      expect(again).toMatchObject({ passed: true, model: ['deepseek-flash'], timing: { apiCallsMs: first.timing.apiCallsMs, caseMs: first.timing.caseMs } })
      // Cases missing from the replay map are skipped, not re-run live.
      expect(await runApiStage({ chat: offline, tools: pluginTools, ids: ['D3'], transcripts: dir, replay: new Map(), log: () => {} })).toEqual([])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('records first-attempt schema validity separately from recovery', async () => {
    const chat = scripted(
      { tool_calls: [call('bad', { root: 'absent', components: [] })] },
      { tool_calls: [call('good', chart())] },
      { content: 'Done.' },
    )
    const [b3] = await runApiStage({ chat, tools: pluginTools, ids: ['B3'], log: () => {} })
    expect(b3.schema).toMatchObject({ firstAttemptValid: false, invalidCalls: 1, recovered: true })
    expect(b3.passed).toBe(false)
    expect(b3.checks.find(c => /first attempt/.test(c.name))).toMatchObject({ ok: false })
    expect(b3.model).toEqual(['deepseek-flash'])
  })
})

describe('paired routing cases', () => {
  const routing = API_SCENARIOS.filter(s => s.group === 'F')
  const single = routing.filter(s => !['F8', 'F9'].includes(s.id))
  const run = (id, turn) => API_SCENARIOS.find(s => s.id === id).run({ turn: async () => turn })
  const failed = checks => checks.filter(([, ok, , info]) => !ok && !info).map(([name]) => name)
  const ui = (name, args) => ({ name, ok: true, args })
  const plot = tree('Plot', { functions: [{ expr: '1 - exp(-z*x)' }], params: [{ name: 'z', min: 0, max: 2, value: 0.5 }] })
  const three = { title: 'axes', html: '<div class="ui-stage" id="stage"></div>', jsFunctions: 'async function init(){ const v = await UI.three("#stage") }', jsExpressions: ['init()'] }
  // A reply that satisfies every text-side content check, so only the tool choice decides.
  const prose = ['Hugo、Next.js 和 WordPress 的取舍，阻尼 damping，scene 场景、camera 相机、renderer 渲染器，ω 与 ζ，',
    'sin/cos harmonics，mesh 与 material，正交 OrthographicCamera，实时数据无法获取，远处物体因透视距离变小。',
    '\n\n| 维度 | REST | GraphQL |\n| --- | --- | --- |\n| 取数 | 多端点 | 单端点 |\n\n```js\nnew THREE.PerspectiveCamera(75, 1, 0.1, 100)\n```'].join('')

  it('pairs every case with its opposite and keeps ids unique', () => {
    expect(new Set(routing.map(s => s.id)).size).toBe(routing.length)
    const pairs = Map.groupBy(single.filter(s => /[ab]$/.test(s.id)), s => s.id.slice(0, -1))
    for (const [pair, cases] of pairs) {
      expect(cases.map(c => c.id).sort(), pair).toEqual([`${pair}a`, `${pair}b`])
      // F3 contrasts two deliveries outside the chat UI, F7 two arrangements of UI; every other pair straddles the line.
      if (!['F3', 'F7'].includes(pair)) expect(new Set(cases.map(c => c.category)), pair).toEqual(new Set(['no-ui', 'needs-ui']))
    }
    expect(routing.every(s => ['no-ui', 'needs-ui', 'update'].includes(s.category))).toBe(true)
  })

  it('fails a policy that never draws UI on the needs-ui side and one that always does on the no-ui side', async () => {
    for (const s of single) {
      const never = failed((await run(s.id, { calls: [], text: prose, exhausted: false })).checks)
      const always = failed((await run(s.id, { calls: [ui('ui_render', plot), ui('ui_render_widget', three)], text: prose, exhausted: false })).checks)
      if (s.category === 'no-ui') {
        expect(never, s.id).toEqual([])
        const own = { F3b: 'no inline widget or composition in place of the project change', F10: 'no chart, table or widget drawn without data' }
        expect(always, s.id).toContain(own[s.id] ?? 'tool: none')
      } else {
        expect(never.some(n => n.startsWith('tool:')), s.id).toBe(true)
      }
    }
  })

  it('judges the delivered interaction and data, not just the tool name', async () => {
    expect(failed((await run('F1b', { calls: [ui('ui_render', plot)], text: '阻尼比 ζ 决定二阶系统阶跃响应是否振荡以及衰减快慢：ζ 越大越平稳但更慢，ζ 越小超调越大、越容易振荡。', exhausted: false })).checks)).toEqual([])
    expect(failed((await run('F1b', { calls: [ui('ui_render', plot)], text: '', exhausted: false })).checks)).toEqual(['the explanation is there, not only the plot'])
    expect(failed((await run('F2b', { calls: [ui('ui_render_widget', three)], text: '', exhausted: false })).checks)).toEqual([])
    const canvasOnly = { ...three, jsFunctions: 'function init(){ UI.canvas("#stage", () => {}) }' }
    expect(failed((await run('F2b', { calls: [ui('ui_render_widget', canvasOnly)], text: '', exhausted: false })).checks)).toEqual(['a 3D widget (Three.js or WebGL)'])

    const cities = [['北京', 2189, 16411], ['上海', 2487, 6341], ['广州', 1882, 7434], ['深圳', 1768, 1997], ['重庆', 3191, 82402], ['成都', 2140, 14335],
      ['杭州', 1252, 16850], ['武汉', 1377, 8569], ['西安', 1299, 10108], ['南京', 942, 6587], ['天津', 1364, 11966], ['苏州', 1291, 8657]]
    const grid = rows => tree('Table', { columns: ['城市', '人口（万）', '面积'], rows, sortable: true, searchable: true })
    expect(failed((await run('F4b', { calls: [ui('ui_render', grid(cities))], text: '', exhausted: false })).checks)).toEqual([])
    expect(failed((await run('F4b', { calls: [ui('ui_render', grid(cities.map(([c, p, a]) => [c, p + 1, a])))], text: '', exhausted: false })).checks))
      .toEqual(['the user\'s numbers, not invented ones'])
  })

  it('accepts a note about a repo change but not a widget standing in for it', async () => {
    const note = tree('Alert', { tone: 'info', text: '这个会话没有文件工具，把 Viewer.tsx 贴给我即可改成 OrthographicCamera。' })
    expect(failed((await run('F3b', { calls: [ui('ui_render', note)], text: '换成 OrthographicCamera 需要改相机和 resize 逻辑。', exhausted: false })).checks)).toEqual([])
    expect(failed((await run('F3b', { calls: [ui('ui_render_widget', three)], text: '正交相机演示如上。', exhausted: false })).checks)).toEqual(['no inline widget or composition in place of the project change'])
  })

  it('lets a missing-data answer offer next steps but not draw sample data', async () => {
    const options = tree('Choice', { question: '怎么继续？', options: [{ id: 'a', label: '给我接入行情 API 的代码', prompt: '给我接入行情 API 的代码' }, { id: 'b', label: '解释分时图怎么看', prompt: '解释分时图怎么看' }] })
    const text = '我无法获取今天的实时行情数据，不能编造点位。'
    expect(failed((await run('F10', { calls: [ui('ui_render', options)], text, exhausted: false })).checks)).toEqual([])
    expect(failed((await run('F10', { calls: [ui('ui_render', chart('line'))], text, exhausted: false })).checks)).toEqual(['no chart, table or widget drawn without data'])
    expect(failed((await run('F10', { calls: [ui('ui_render_widget', three)], text, exhausted: false })).checks)).toEqual(['no chart, table or widget drawn without data'])
  })

  it('keeps a closing Choice in the reply and wants a chart after each section of a report', async () => {
    const choice = tree('Choice', { question: '继续哪个？', options: [{ id: 'h', label: 'Hugo', prompt: '深入 Hugo' }, { id: 'n', label: 'Next.js', prompt: '深入 Next.js' }] })
    const analysis = 'Hugo 构建快、Next.js 灵活、WordPress 生态大。'.repeat(8)
    expect(failed((await run('F7a', { calls: [ui('ui_render', choice)], text: analysis, exhausted: false })).checks)).toEqual([])
    const wrapped = { blocks: [{ id: 'a', type: 'markdown', text: analysis }, { id: 'c', type: 'catalog', ...choice }] }
    expect(failed((await run('F7a', { calls: [ui('ui_compose', wrapped)], text: '', exhausted: false })).checks)).toContain('tool: ui_render')

    const bar = id => ({ id, type: 'catalog', root: 'r', components: [{ id: 'r', type: 'Chart', props: { kind: 'bar', labels: ['Hugo', 'Next.js', 'WordPress'], series: [{ name: 'v', values: [1, 2, 3] }] } }] })
    const md = id => ({ id, type: 'markdown', text: '分析。' })
    const sectioned = { blocks: [md('m1'), bar('c1'), md('m2'), bar('c2'), md('m3'), bar('c3')] }
    expect(failed((await run('F7b', { calls: [ui('ui_compose', sectioned)], text: '', exhausted: false })).checks)).toEqual([])
    const stacked = { blocks: [md('m1'), md('m2'), md('m3'), bar('c1'), bar('c2'), bar('c3')] }
    expect(failed((await run('F7b', { calls: [ui('ui_compose', stacked)], text: '', exhausted: false })).checks)).toEqual(['every UI block follows its own prose'])
  })

  it('wants the chart patched in place with the table untouched, and text after a restriction', async () => {
    const dashboard = {
      root: 'g', components: [
        { id: 'g', type: 'Stack', children: ['ch', 'tb'] },
        { id: 'ch', type: 'Chart', props: { kind: 'bar', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: '线上', values: [120, 135, 150, 170] }, { name: '线下', values: [90, 95, 88, 100] }] } },
        { id: 'tb', type: 'Table', props: { columns: ['门店', '区域', '销售额'], rows: [['A 店', '华东', 320], ['B 店', '华东', 280]], filterable: true } },
      ],
    }
    const patched = scripted(
      { tool_calls: [call('d1', dashboard)] }, { content: '看板如上。' },
      { tool_calls: [call('p1', { uiId: 'd1', baseVersion: 1, ops: [{ op: 'setProps', id: 'ch', props: { kind: 'line' } }] }, 'ui_patch')] }, { content: '已改为折线图。' },
    )
    const [ok] = await runApiStage({ chat: patched, tools: pluginTools, ids: ['F8'], log: () => {} })
    expect(ok.reason).toBeNull()
    const line = { ...dashboard, components: dashboard.components.map(c => (c.id === 'ch' ? { ...c, props: { ...c.props, kind: 'line' } } : c)) }
    const rerendered = scripted({ tool_calls: [call('d1', dashboard)] }, { content: '看板如上。' }, { tool_calls: [call('d2', line)] }, { content: '已改为折线图。' })
    const [lost] = await runApiStage({ chat: rerendered, tools: pluginTools, ids: ['F8'], log: () => {} })
    expect(lost.passed).toBe(false)
    expect(lost.reason).toMatch(/edit · tool: ui_patch/)

    const restricted = scripted({ tool_calls: [call('w1', three, 'ui_render_widget')] }, { content: '立方体如上。' }, { tool_calls: [call('w2', three, 'ui_render_widget')] }, { content: '远处物体透视后变小。' })
    const [drew] = await runApiStage({ chat: restricted, tools: pluginTools, ids: ['F9'], log: () => {} })
    expect(drew.reason).toMatch(/restricted turn · tool: none/)
  })

  it('records token usage when the API reports it', async () => {
    const chat = vi.fn(async () => ({ message: { role: 'assistant', content: 'Euler: e^{iπ} + 1 = 0 links five constants.' }, model: 'deepseek-flash', fingerprint: null, ms: 5, usage: { prompt: 900, completion: 40 } }))
    const [a1] = await runApiStage({ chat, tools: pluginTools, ids: ['A1'], log: () => {} })
    expect(a1.tokens).toEqual({ prompt: 900, completion: 40 })
  })
})

describe('report helpers', () => {
  it('computes nearest-rank percentiles and per-category success rates', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5)
    expect(percentile([], 50)).toBeUndefined()
    expect(timing([100, undefined, 300])).toEqual({ n: 2, p50: 100, p95: 300, max: 300 })
    const s = summarize([{ category: 'form', passed: true }, { category: 'form', passed: false }, { category: 'text', passed: true }])
    expect(s).toMatchObject({ total: 3, passed: 2, failed: 1, byCategory: { form: { total: 2, passed: 1, successRate: 0.5 } } })
  })

  it('keeps quota and outage errors out of the model success rate', async () => {
    const chat = vi.fn(async () => { throw new Error('DeepSeek API returned HTTP 402') })
    const [a1] = await runApiStage({ chat, tools: pluginTools, ids: ['A1'], log: () => {} })
    expect(a1).toMatchObject({ passed: false, infrastructure: true, reason: 'infrastructure: DeepSeek API returned HTTP 402' })
    const s = summarize([a1, { category: 'text', passed: true }])
    expect(s).toMatchObject({ total: 1, passed: 1, failed: 0, successRate: 1, infrastructureErrors: 1 })
  })

  it('redacts keys, URL tokens and home paths, and refuses to write leaked secrets', () => {
    const secret = 'sk-0123456789abcdef0123'
    const out = redact({ a: `key ${secret}`, b: ['http://127.0.0.1:3281/?token=abc123def'], c: `${homedir()}/x`, d: 'Bearer abcdefghijklmnop', e: 'custom-secret-value' }, ['custom-secret-value'])
    expect(JSON.stringify(out)).not.toMatch(/0123456789abcdef|abc123def|abcdefghijklmnop|custom-secret-value/)
    expect(out.c).toBe('~/x')
    expect(() => assertNoSecrets(`{"x":"${secret}"}`)).toThrow(/credential/)
    expect(() => assertNoSecrets('{"x":"my-own-key-1"}', ['my-own-key-1'])).toThrow(/credential/)
    expect(() => assertNoSecrets('{"x":"[redacted]"}', ['my-own-key-1'])).not.toThrow()
  })

  it('renders separate layers and the historical snapshot in Markdown', () => {
    const md = toMarkdown({
      command: 'node scripts/run-real-model-suite.mjs', generatedAt: '2026-10-15T00:00:00Z',
      model: { requested: 'deepseek-flash', reported: ['deepseek-flash'] }, versions: { assertions: ASSERTION_VERSION, prompt: 'abc' }, environment: {},
      layers: {
        mockE2E: { testedAt: '2026-10-14T00:00:00Z', summary: summarize([{ category: 'mock', passed: true }]) },
        api: { summary: summarize([{ category: 'chart-table', passed: false }]), timing: { apiCallMs: timing([1]), caseMs: timing([1]) }, cases: [{ id: 'B3', title: 'Chart', category: 'chart-table', passed: false, reason: 'bar Chart rendered', tool: { actual: ['ui_render'] }, schema: { firstAttemptValid: true }, timing: { apiMs: 1 } }] },
      },
      history: [{ file: 'docs/history/x.json', note: 'historical' }],
    })
    expect(md).toMatch(/Mock E2E.*scripted.*1\/1/)
    expect(md).toMatch(/Real model · API.*0\/1/)
    expect(md).toMatch(/Real model · browser \| .* \| not run/)
    expect(md).toMatch(/B3 Chart \| chart-table \| ❌/)
    expect(md).toMatch(/\[docs\/history\/x\.json\]\(history\/x\.json\) — historical/)
  })

  it('tells a drawn canvas from a blank one in PNG screenshots', () => {
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
    const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]) }
    const png = pixel => {
      const w = 16, h = 16, rows = []
      for (let y = 0; y < h; y++) { const row = [y % 2] /* filters 0 and 1 */; for (let x = 0; x < w; x++) row.push(...pixel(x, y)); if (y % 2) for (let i = row.length - 1; i > 3; i--) row[i] = (row[i] - row[i - 3] + 256) & 255; rows.push(...row) }
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
      return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))])
    }
    const blank = png(() => [250, 250, 250])
    const scene = png((x, y) => [x * 16, y * 16, (x * y) & 255])
    expect(imageStats(blank)).toMatchObject({ width: 16, height: 16, stddev: 0, colors: 1 })
    expect(imageStats(scene).stddev).toBeGreaterThan(4)
    expect(imageStats(scene).colors).toBeGreaterThan(12)
    expect(imageDiff(blank, blank)).toBe(0)
    expect(imageDiff(blank, scene)).toBeGreaterThan(50)
  })
})

describe('real-model API client and command', () => {
  const suite = fileURLToPath(new URL('../scripts/run-real-model-suite.mjs', import.meta.url))

  it('imports without credentials and reads the current environment key without a fixed file path', () => {
    expect(getApiKey({ DEEPSEEK_API_KEY: '  test-key  ' })).toBe('test-key')
    expect(() => getApiKey({})).toThrow(/Set DEEPSEEK_API_KEY/)
    expect(() => getApiKey({ DEEPSEEK_API_KEY: '  ' })).toThrow(/Set DEEPSEEK_API_KEY/)
  })

  it('fails without credentials or with invalid options before writing any report', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-eval-'))
    const report = path.join(dir, 'report.json')
    try {
      for (const [args, message] of [
        [['A'], /Set DEEPSEEK_API_KEY/],
        [['all', '--stage', 'browser'], /Set DEEPSEEK_API_KEY/],
        [['typo'], /Category must be/],
        [['all', '--stage', 'api,nope'], /--stage must be/],
        [['A', '--repeat', '0'], /--repeat must be/],
      ]) {
        const result = spawnSync(process.execPath, [suite, ...args, '--report', report], { env: { ...process.env, DEEPSEEK_API_KEY: '' }, encoding: 'utf8' })
        expect(result.status, args.join(' ')).toBe(1)
        expect(result.stderr).toMatch(message)
      }
      expect(existsSync(report)).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('runs the command offline: failures exit nonzero, layers stay separate and the key never reaches the report', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-eval-'))
    const preload = path.join(dir, 'mock-api.mjs')
    // Stub only the HTTP boundary; execute the real CLI, scoring and report writer.
    writeFileSync(preload, `
      import https from 'node:https';
      import { EventEmitter } from 'node:events';
      https.request = (_url, options, cb) => {
        const req = new EventEmitter(); req.write = () => {}; req.setTimeout = () => {};
        req.end = () => queueMicrotask(() => {
          const res = new EventEmitter(); res.statusCode = 200;
          cb(res); req.emit('response', res);
          // Echo the key back the way a careless upstream might.
          res.emit('data', JSON.stringify({ model: 'deepseek-flash', system_fingerprint: 'fp_x', choices: [{ message: { role: 'assistant', content: 'A sufficiently long plain text answer for an offline test. ' + options.headers.Authorization } }] }));
          res.emit('end');
        });
        return req;
      };
    `)
    const report = path.join(dir, 'docs', 'real-model-eval-report.json')
    mkdirSync(path.dirname(report))
    writeFileSync(report, JSON.stringify({ layers: { api: { cases: [{ id: 'stale', passed: true }] } } }))
    try {
      for (const [category, code, summary] of [
        ['A', 0, { total: 4, passed: 4, failed: 0 }],
        ['B', 1, { total: 5, passed: 0, failed: 5 }],
      ]) {
        const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, suite, category, '--out', path.join(dir, 'out')], {
          cwd: dir, env: { ...process.env, DEEPSEEK_API_KEY: 'offline-test-key-123' }, encoding: 'utf8',
        })
        expect(result.status, result.stderr).toBe(code)
        const text = readFileSync(report, 'utf8')
        expect(text).not.toContain('offline-test-key-123')
        const saved = JSON.parse(text)
        expect(saved).toMatchObject({ reportVersion: 3, model: { requested: 'deepseek-flash', reported: ['deepseek-flash'], fingerprints: ['fp_x'] }, versions: { assertions: ASSERTION_VERSION, prompt: PROMPT_VERSION } })
        expect(saved.layers.api.summary).toMatchObject(summary)
        expect(saved.layers.api.cases.some(c => c.id === 'stale')).toBe(false)
        expect(saved.layers.browser).toBeUndefined()
        expect(saved.layers.mockE2E).toBeDefined()
        expect(saved.history[0].file).toMatch(/^docs\/history\//)
        expect(saved.layers.api.cases[0].timing.apiMs).toBeGreaterThanOrEqual(0)
        expect(readFileSync(path.join(dir, 'docs', 'real-model-eval.md'), 'utf8')).toMatch(/Real-model Generative UI evaluation/)
      }
      const b = JSON.parse(readFileSync(report, 'utf8')).layers.api.cases[0]
      expect(b.reason).toMatch(/tool: ui_render/)
      // A layer that was not re-run is carried over only on request, and marked.
      const withBrowser = JSON.parse(readFileSync(report, 'utf8'))
      withBrowser.layers.browser = { testedAt: '2026-10-15T00:00:00Z', summary: { total: 1, passed: 1, failed: 0, successRate: 1, byCategory: {} }, timing: {}, cases: [] }
      writeFileSync(report, JSON.stringify(withBrowser))
      const run = extra => spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, suite, 'A', '--out', path.join(dir, 'out'), ...extra], {
        cwd: dir, env: { ...process.env, DEEPSEEK_API_KEY: 'offline-test-key-123' }, encoding: 'utf8',
      })
      expect(run(['--keep-other-layers']).status).toBe(0)
      const kept = JSON.parse(readFileSync(report, 'utf8'))
      expect(kept.layers.browser).toMatchObject({ carriedOver: true, testedAt: '2026-10-15T00:00:00Z' })
      expect(kept.provenance.map(p => p.command.split(' ').slice(2).join(' '))).toEqual([`B --out ${path.join(dir, 'out')}`, `A --out ${path.join(dir, 'out')} --keep-other-layers`])
      // A partial rerun with --keep-other-layers replaces only its own cases.
      const full = JSON.parse(readFileSync(report, 'utf8')).layers.api
      expect(run(['--only', 'A2', '--keep-other-layers']).status).toBe(0)
      const merged = JSON.parse(readFileSync(report, 'utf8')).layers.api
      expect(merged.cases.map(c => c.id)).toEqual(['A1', 'A2', 'A3', 'A4'])
      expect(merged.summary).toMatchObject({ total: 4, passed: 4 })
      expect(merged.cases[0].testedAt).toBe(full.testedAt)
      expect(merged.cases[1].testedAt).toBe(merged.partialRerunAt)
      // --append adds samples instead: A2 now has two runs, both counted.
      expect(run(['--only', 'A2', '--keep-other-layers', '--append']).status).toBe(0)
      const appended = JSON.parse(readFileSync(report, 'utf8')).layers.api
      expect(appended.cases.map(c => `${c.id}#${c.run}`)).toEqual(['A1#1', 'A2#1', 'A2#2', 'A3#1', 'A4#1'])
      expect(appended.summary.total).toBe(5)
      expect(run([]).status).toBe(0)
      expect(JSON.parse(readFileSync(report, 'utf8')).layers.browser).toBeUndefined()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('uses the environment key, reports unreachable hosts and rejects HTTP errors without echoing secrets', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-secret')
    let response = { choices: [{ message: { role: 'assistant', content: 'OK' } }] }
    let status = 200
    let timeout
    let failWith
    const request = vi.spyOn(https, 'request').mockImplementation((_url, options, callback) => {
      expect(options.headers.Authorization).toBe('Bearer test-secret')
      const req = new EventEmitter()
      req.setTimeout = (ms, fn) => { timeout = { ms, fn } }
      req.write = () => {}
      req.destroy = err => req.emit('error', err)
      req.end = () => queueMicrotask(() => {
        if (failWith) return req.emit('error', failWith)
        const res = new EventEmitter(); res.statusCode = status
        callback(res); req.emit('response', res)
        res.emit('data', JSON.stringify(response)); res.emit('end')
      })
      return req
    })
    try {
      await expect(callChat([{ role: 'user', content: 'hello' }])).resolves.toMatchObject({ content: 'OK' })
      expect(timeout.ms).toBe(120000)
      response = { choices: [] }
      await expect(callChat([])).rejects.toThrow(/no assistant message/)
      status = 401; response = { error: 'test-secret' }
      await expect(callChat([])).rejects.toThrow('DeepSeek API returned HTTP 401')
      failWith = Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443 test-secret'), { code: 'ECONNREFUSED' })
      await expect(callChat([])).rejects.toThrow(/^DeepSeek API unreachable: ECONNREFUSED$/)
    } finally { request.mockRestore(); vi.unstubAllEnvs() }
  })
})
