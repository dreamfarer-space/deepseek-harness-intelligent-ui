// API stage of the real-model evaluation: the real DeepSeek model, the
// plugin's real tool definitions and execute(), no browser. It measures
// whether the model picks the right tool, emits valid arguments on the first
// attempt, and puts the requested components and data in what is rendered.
import fs from 'node:fs'
import path from 'node:path'
import { outline } from '../../src/catalog/patch.js'
import { Conversation } from './conversation.mjs'
import { chartsOf, checkChartEdits, checkUpdatedTable, composeChecks, composedProse, composedTrees, compositionInterleaves, fillForecastForm, incorporatesSubmission, nativeChecks, renderedNodes, widgetChecks } from './assertions.mjs'

const RENDER = 'ui_render'
const WIDGET = 'ui_render_widget'
const PATCH = 'ui_patch'
const COMPOSE = 'ui_compose'

/** UIs whose current version changed during `turn` (rendered or patched). */
function touched(convo, turn) {
  const ids = new Set(turn.calls.filter(c => c.ok && (c.name === RENDER || c.name === PATCH)).map(c => (c.name === RENDER ? c.id : c.args.uiId)))
  return [...convo.uis().values()].filter(ui => ids.has(ui.uiId))
}

const lastWidget = turn => turn.calls.filter(c => c.ok && c.name === WIDGET).at(-1)?.args

/** Score one turn: tool choice, first-attempt schema validity, then the case's own checks. */
function scoreTurn(turn, expect, checks) {
  const uiCalls = turn.calls.filter(c => c.name.startsWith('ui_'))
  const accepted = [].concat(expect)
  const okTools = uiCalls.filter(c => c.ok).map(c => c.name)
  const toolOk = accepted.includes('none') ? uiCalls.length === 0 : okTools.some(n => accepted.includes(n))
  const first = uiCalls[0]
  return [
    [`tool: ${accepted.join(' or ')}`, toolOk, uiCalls.map(c => `${c.name}${c.ok ? '' : ' (refused)'}`).join(' → ') || 'no tool'],
    ...(first ? [['arguments valid on the first attempt', first.ok, first.ok ? '' : first.errors.slice(0, 3).join('; ')]] : []),
    ...(turn.exhausted ? [['turn finished within the step limit', false, 'model kept calling tools']] : []),
    ...checks,
  ]
}

export const API_SCENARIOS = [
  ...[
    ['A1', '什么是欧拉公式？请简述其数学意义。'],
    ['A2', '解释一下什么是卡尔曼滤波，用通俗语言说明其基本原理。'],
    ['A3', '牛顿第三定律的内容是什么？'],
    ['A4', '请简要解释机械臂运动学中的奇异点概念。'],
  ].map(([id, prompt]) => ({
    id, group: 'A', category: 'text', title: 'Plain answer', prompt,
    async run(convo) {
      const turn = await convo.turn(prompt)
      return { turns: [turn], checks: scoreTurn(turn, 'none', [['substantive text answer', turn.text.trim().length > 20, `${turn.text.length} chars`]]) }
    },
  })),
  ...[
    ['B1', 'chart-table', 'Dashboard', '帮我生成一个2026年Q1公司业务运营监控看板，包含总收入、活跃用户、转化率、客单价等核心指标，并按不同业务线展示数据。'],
    ['B2', 'chart-table', 'Sortable table', '请列出一份主流新能源汽车关键性能指标的对比表（包含车型、续航里程、零百加速、售价、电池容量），要求可以按列排序。'],
    ['B3', 'chart-table', 'Multi-series chart', '对比分析过去四个季度（Q1-Q4）中，线上电商与线下门店在营收上的多系列对比柱状图。'],
    ['B4', 'form', 'Interactive form', '设计一个产品功能满意度与用户需求反馈表单，包含用户身份类型、评分滑块、改进意见分类以及是否接收后续邮件通知。'],
    ['B5', 'chart-table', 'Timeline', '梳理一份具身智能与大模型融合发展的关键技术里程碑时间线，展示代表性成果与阶段。'],
  ].map(([id, category, title, prompt]) => ({
    id, group: 'B', category, title, prompt,
    async run(convo) {
      const turn = await convo.turn(prompt)
      const ui = touched(convo, turn).at(-1)
      const checks = ui ? nativeChecks(id, ui) : [['a UI was rendered', false]]
      return { turns: [turn], checks: scoreTurn(turn, RENDER, checks) }
    },
  })),
  {
    id: 'C1', group: 'C', category: 'threejs', title: '3D sphere', prompt: '请用交互式 3D 形式展示三维球面 x²+y²+z²=2Rz，让我可以旋转缩放观察。',
    async run(convo) {
      const turn = await convo.turn(this.prompt)
      const w = lastWidget(turn)
      return { turns: [turn], checks: scoreTurn(turn, WIDGET, w ? widgetChecks('C1', w) : [['a widget was rendered', false]]) }
    },
  },
  {
    id: 'C2', group: 'C', category: 'math-plot', title: 'Slider plot', prompt: '画一个阻尼振动函数曲线，提供振幅、阻尼系数和角频率的滑动条，让我滑动控制曲线实时变化。',
    async run(convo) {
      const turn = await convo.turn(this.prompt)
      const ui = touched(convo, turn).at(-1)
      const w = lastWidget(turn)
      const checks = ui && renderedNodes(ui).some(n => n.type === 'Plot') ? nativeChecks('C2', ui) : w ? widgetChecks('C2', w) : [['a Plot or widget was rendered', false]]
      return { turns: [turn], checks: scoreTurn(turn, [RENDER, WIDGET], checks) }
    },
  },
  {
    id: 'C3', group: 'C', category: 'threejs', title: 'Three.js solar system', prompt: '使用 Three.js 做一个包含光影的可交互 3D 太阳系微型模型，行星公转且支持鼠标拖拽视角。',
    async run(convo) {
      const turn = await convo.turn(this.prompt)
      const w = lastWidget(turn)
      return { turns: [turn], checks: scoreTurn(turn, WIDGET, w ? widgetChecks('C3', w) : [['a widget was rendered', false]]) }
    },
  },
  {
    id: 'C4', group: 'C', category: 'widget', title: 'Pendulum simulator', prompt: '做一个单摆运动的动态物理模拟器，支持启动暂停和摆长重力参数调节。',
    async run(convo) {
      const turn = await convo.turn(this.prompt)
      const w = lastWidget(turn)
      return { turns: [turn], checks: scoreTurn(turn, WIDGET, w ? widgetChecks('C4', w) : [['a widget was rendered', false]]) }
    },
  },
  {
    id: 'E1', group: 'E', category: 'compose', title: 'Analysis with an interleaved chart',
    prompt: '帮我做一个技术选型分析：单人开发者、预算有限、需要离线可用，在本地 SQLite、Supabase 和自建后端之间选择。请先给出完整分析，中间放一个成本对比图表，最后给出下一步选项。',
    async run(convo) {
      const turn = await convo.turn(this.prompt)
      const call = turn.calls.filter(c => c.ok && (c.name === COMPOSE || c.name === RENDER)).at(-1)
      if (!call) return { turns: [turn], checks: scoreTurn(turn, [COMPOSE, RENDER], [['an analysis was rendered', false]]) }
      const checks = call.name === COMPOSE
        ? composeChecks('E1', call.args)
        : [
            ['full written analysis in the reply', (turn.text ?? '').trim().length > 120, `${(turn.text ?? '').trim().length} chars`],
            ['a cost comparison chart', renderedNodes(call.args).some(n => n.type === 'Chart' && n.props?.kind === 'bar')],
            ['a next-step Choice', renderedNodes(call.args).some(n => n.type === 'Choice')],
          ]
      return { turns: [turn], checks: scoreTurn(turn, [COMPOSE, RENDER], checks) }
    },
  },
  {
    id: 'E2', group: 'E', category: 'compose', title: 'Teaching walkthrough',
    prompt: '用图文结合的方式教我理解阻尼振动：先解释原理，再给我一个可以拖动参数观察的曲线，最后解释不同阻尼比下的现象差异。',
    async run(convo) {
      const turn = await convo.turn(this.prompt)
      const call = turn.calls.filter(c => c.ok && (c.name === COMPOSE || c.name === RENDER)).at(-1)
      if (!call) return { turns: [turn], checks: scoreTurn(turn, [COMPOSE, RENDER], [['an explanation was rendered', false]]) }
      const trees = call.name === COMPOSE ? composedTrees(call.args) : [call.args]
      const plots = trees.flatMap(tree => renderedNodes(tree)).filter(n => n.type === 'Plot')
      const prose = call.name === COMPOSE ? composedProse(call.args) : (turn.text ?? '')
      const checks = [
        ['prose explains the principle (before the interactive part)', /阻尼|damping|衰减/i.test(prose) && prose.trim().length > 80, `${prose.trim().length} chars`],
        ['an interactive Plot with parameter sliders', plots.some(p => (p.props?.params ?? []).length >= 2)],
        ['prose interprets the result after the UI', /欠阻尼|过阻尼|临界|underdamped|overdamped|critical/i.test(prose)],
        ...(call.name === COMPOSE ? [['the prose surrounds the UI rather than following it', compositionInterleaves(call.args)]] : []),
      ]
      return { turns: [turn], checks: scoreTurn(turn, [COMPOSE, RENDER], checks) }
    },
  },
  {
    id: 'D1', group: 'D', category: 'form', title: 'Form submit → follow-up', prompt: '请帮我生成一个销售预测配置表单，包含预测区域、预测季度数、预测情景（乐观/基准/保守）。',
    async run(convo) {
      const t1 = await convo.turn(this.prompt)
      const ui = touched(convo, t1).at(-1)
      const form = ui && renderedNodes(ui).find(n => n.type === 'Form')
      const checks1 = scoreTurn(t1, RENDER, [['Form rendered', !!form]])
      if (!form) return { turns: [t1], checks: checks1 }
      const { values, missing, region } = fillForecastForm(form.props)
      checks1.push(['form has region, quarter count and scenario fields', !missing.length, missing.length ? `missing: ${missing.join(', ')}` : ''])
      if (missing.length) return { turns: [t1], checks: checks1 }
      // Exactly what the browser sends on submit (client-src/bridge.ts formatFormSubmission).
      const head = form.props.prompt?.trim() || (form.props.title ? `Form "${form.props.title}" submitted:` : 'Form submitted:')
      const t2 = await convo.turn(`${head}\n${JSON.stringify(values, null, 2)}`)
      const used = incorporatesSubmission({ content: t2.text }, t2.calls.filter(c => c.ok), region)
      return { turns: [t1, t2], checks: [...checks1, [`follow-up uses the submitted values (${region} / 4 quarters / optimistic)`, used]] }
    },
  },
  {
    id: 'D2', group: 'D', category: 'multi-turn', title: 'Add a table column',
    prompt: '帮我生成一个展示三款手机（Model A, Model B, Model C）价格和电池容量的表格。',
    async run(convo) {
      const t1 = await convo.turn(this.prompt)
      const before = touched(convo, t1).at(-1)
      const checks1 = scoreTurn(t1, RENDER, [['Table rendered', !!before && renderedNodes(before).some(n => n.type === 'Table')]])
      if (!before) return { turns: [t1], checks: checks1 }
      const t2 = await convo.turn('请在这个表格中增加一列“屏幕尺寸”，并将 Model A 的屏幕尺寸设为 6.1 寸，Model B 为 6.7 寸，Model C 为 6.5 寸。')
      const after = touched(convo, t2)
      return {
        turns: [t1, t2],
        checks: [...checks1, ...scoreTurn(t2, [PATCH, RENDER], [
          ['screen sizes added per model, prior values kept', after.some(ui => checkUpdatedTable(before, ui))],
          ['updated in place (ui_patch on the same UI)', after.some(ui => ui.uiId === before.uiId && ui.version > 1), 'informational: a full re-render also passes the case', true],
        ])],
      }
    },
  },
  {
    id: 'D3', group: 'D', category: 'multi-turn', title: 'Two successive chart edits',
    prompt: '用柱状图对比 Q1-Q4 线上和线下两个渠道的销售额（线上 120、135、150、170；线下 90、95、88、100）。',
    async run(convo) {
      const t1 = await convo.turn(this.prompt)
      const v1 = touched(convo, t1).at(-1)
      const checks = scoreTurn(t1, RENDER, [['bar chart with two series rendered', chartsOf(v1).some(n => n.props.kind === 'bar' && n.props.series.length >= 2)]])
      if (!chartsOf(v1).length) return { turns: [t1], checks }
      const t2 = await convo.turn('把这个图改成折线图。')
      const v2 = touched(convo, t2).at(-1)
      checks.push(...scoreTurn(t2, [PATCH, RENDER], checkChartEdits(v1, v2, { kind: 'line' })).map(([n, ...r]) => [`edit 1 · ${n}`, ...r]))
      const added = { name: '小程序', values: [30, 45, 60, 80] }
      const t3 = await convo.turn('再加一个“小程序”渠道，Q1-Q4 分别是 30、45、60、80，其他保持不变。')
      const v3 = touched(convo, t3).at(-1)
      checks.push(...scoreTurn(t3, [PATCH, RENDER], checkChartEdits(v1, v3, { kind: 'line', added })).map(([n, ...r]) => [`edit 2 · ${n}`, ...r]))
      return { turns: [t1, t2, t3], checks }
    },
  },
]

export const API_GROUPS = ['A', 'B', 'C', 'D', 'E']

/**
 * A chat that answers with the assistant messages of a saved transcript, in
 * order. Tool execution is deterministic plugin code, so replaying a run
 * through the current assertions re-judges exactly what the model produced,
 * without calling the API. Timing and model identity come from the transcript
 * (or, for older transcripts, from the case as it was reported).
 */
export function replayChat(file, prior = {}) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  const messages = Array.isArray(saved) ? saved : saved.messages
  const replies = messages.filter(m => m.role === 'assistant')
  const meta = Array.isArray(saved) ? replies.map((_, i) => ({ ms: prior.timing?.apiCallsMs?.[i] ?? 0, model: prior.model?.[0] ?? 'unknown', fingerprint: prior.fingerprint?.[0] ?? null })) : saved.api
  let i = 0
  return async () => {
    if (i >= replies.length) throw new Error(`replay diverged: ${file} has only ${replies.length} model replies`)
    const { role, content, tool_calls } = replies[i]
    return { message: { role, content, ...(tool_calls ? { tool_calls } : {}) }, ...meta[i++] }
  }
}

/**
 * Run the API scenarios.
 * @param {{ chat: Function, tools: any[], groups?: string[], ids?: string[], repeat?: number, transcripts?: string, replay?: Map<string, any>, log?: (s: string) => void }} opts
 *   transcripts: directory for each case's full conversation (debugging; not part of the report).
 *   replay: rescore instead of calling the model: `${id}-${run}` → the previously reported case;
 *     each conversation is read back from `transcripts`.
 */
export async function runApiStage({ chat, tools, groups = API_GROUPS, ids, repeat = 1, transcripts, replay, log = console.log }) {
  const cases = []
  const selected = API_SCENARIOS.filter(s => groups.includes(s.group) && (!ids || ids.includes(s.id)))
  for (let run = 1; run <= repeat; run++) {
    for (const scenario of selected) {
      const started = performance.now()
      const key = `${scenario.id}-${run}`
      if (replay && !replay.has(key)) continue
      const metas = []
      const source = replay ? replayChat(path.join(transcripts, `${key}.json`), replay.get(key)) : chat
      const convo = new Conversation(async messages => { const r = await source(messages); metas.push({ ms: r.ms, model: r.model, fingerprint: r.fingerprint }); return r }, tools)
      const record = { id: scenario.id, run, category: scenario.category, title: scenario.title, prompt: scenario.prompt }
      try {
        const { turns, checks } = await scenario.run(convo)
        const scored = checks.map(([name, ok, detail = '', informational = false]) => ({ name, ok: !!ok, ...(detail ? { detail: String(detail).slice(0, 300) } : {}), ...(informational ? { informational: true } : {}) }))
        const failed = scored.filter(c => !c.ok && !c.informational)
        const calls = turns.flatMap(t => t.calls)
        const ui = calls.filter(c => c.name.startsWith('ui_'))
        const apiMs = turns.flatMap(t => t.api.map(a => a.ms))
        Object.assign(record, {
          passed: failed.length === 0,
          reason: failed.length ? failed.map(c => c.name + (c.detail ? ` (${c.detail})` : '')).join('; ') : null,
          checks: scored,
          tool: { actual: ui.map(c => c.name + (c.ok ? '' : '✗')) },
          schema: { firstAttemptValid: ui.length ? ui[0].ok : null, invalidCalls: ui.filter(c => !c.ok).length, recovered: ui.some(c => !c.ok) && ui.at(-1)?.ok === true, errors: ui.filter(c => !c.ok).flatMap(c => c.errors).slice(0, 5) },
          model: [...new Set(turns.flatMap(t => t.api.map(a => a.model)))],
          fingerprint: [...new Set(turns.flatMap(t => t.api.map(a => a.fingerprint)).filter(Boolean))],
          turns: turns.length,
          modelCalls: apiMs.length,
          timing: { apiMs: apiMs.reduce((a, b) => a + b, 0), apiCallsMs: apiMs, caseMs: replay ? replay.get(key).timing.caseMs : Math.round(performance.now() - started) },
          uis: [...convo.uis().values()].map(ui => ({ title: ui.title, version: ui.version, components: outline(ui, 30) })),
          widgets: calls.filter(c => c.ok && c.name === WIDGET).map(c => ({ title: c.args.title, htmlChars: c.args.html.length, jsChars: (c.args.jsFunctions || '').length + (c.args.jsExpressions || []).join('').length })),
          textSnippet: turns.at(-1).text.slice(0, 160),
        })
      } catch (err) {
        // Quota, auth, rate limits, outages: the model was never measured.
        const infrastructure = /HTTP (40[12]|429|5\d\d)|unreachable|timed out/.test(err.message)
        Object.assign(record, { passed: false, ...(infrastructure ? { infrastructure } : {}), reason: `${infrastructure ? 'infrastructure' : 'error'}: ${err.message}`, checks: [], timing: { caseMs: Math.round(performance.now() - started) } })
      }
      if (transcripts && !replay) {
        fs.mkdirSync(transcripts, { recursive: true })
        fs.writeFileSync(path.join(transcripts, `${key}.json`), JSON.stringify({ messages: convo.messages, api: metas }, null, 2))
      }
      cases.push(record)
      log(`${record.passed ? 'PASS' : 'FAIL'}  [api] ${record.id}${repeat > 1 ? ` #${run}` : ''} ${record.title} (${(record.timing.caseMs / 1000).toFixed(1)}s)${record.reason ? ` — ${record.reason}` : ''}`)
    }
  }
  return cases
}
