// Scripted DeepSeek Messages (Anthropic-style SSE) server for plumbing tests.
// It is a stand-in for the model: it picks a canned answer by keyword (see
// scenarios.mjs) and streams it exactly like the real API, so DSH's real
// streaming adapter, tool dispatch, session log and Web client all run.
// Usage: node scripts/e2e/mock-deepseek.mjs [port] [log-file]
import { createServer } from 'node:http'
import { appendFileSync, existsSync } from 'node:fs'
import { definition as EXTENSION } from '../../examples/component-extension/manifest.js'
import { chartPatch, DASHBOARD, explainSphere, forecast, MATH, SLOW, SPHERE, SESSION_LAUNCH, DATA_TOOLS } from './scenarios.mjs'

const PORT = Number(process.argv[2] || 3199)
const LOG = process.argv[3]
const WAIT_FOR_PREVIEW = process.argv.includes('--wait-for-preview')
const log = (o) => { const s = JSON.stringify(o); console.log(s); if (LOG) appendFileSync(LOG, s + '\n') }

function previewDelay(kind) {
  if (!WAIT_FOR_PREVIEW || !LOG) return 1500
  // Hold only the mock stream until the driver observes the real partial UI.
  // Bound the wait so a missing preview remains a test failure, not a hang.
  return new Promise(resolve => {
    const deadline = Date.now() + 20000
    const poll = () => {
      if (existsSync(`${LOG}.${kind}-preview`) || Date.now() >= deadline) resolve(40)
      else setTimeout(poll, 100)
    }
    poll()
  })
}

function sse(res, events, delayOf) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  let i = 0
  let closed = false
  res.on('close', () => { closed = true })
  const tick = () => {
    if (closed) return
    if (i >= events.length) return res.end()
    const e = events[i++]
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    const delay = e.type === 'content_block_delta' ? (typeof delayOf === 'function' ? delayOf(e) : delayOf) : 5
    Promise.resolve(delay).then(ms => { if (!closed) setTimeout(tick, ms) })
  }
  tick()
}

const start = model => ({ type: 'message_start', message: { id: 'msg_' + Date.now(), type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
function textEvents(model, text, chunk = 12) {
  const ev = [start(model), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }]
  for (let i = 0; i < text.length; i += chunk) ev.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + chunk) } })
  ev.push({ type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' })
  return ev
}
function toolEvents(model, name, input, chunk = 40) {
  const json = JSON.stringify(input)
  const ev = [start(model), { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_' + Date.now(), name, input: {} } }]
  for (let i = 0; i < json.length; i += chunk) ev.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + chunk) } })
  ev.push({ type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 100 } }, { type: 'message_stop' })
  return ev
}

const textOf = content => typeof content === 'string' ? content : (content || []).map(b => b.type === 'text' ? b.text : '').join('')

/** Pick the scripted answer for the latest user text. */
function decide(lastText, tools) {
  if (!tools.includes('ui_render')) return 'no-ui-tools'
  if (lastText.startsWith('E2E data tools')) return 'data-tools'
  if (lastText.startsWith('E2E show session launcher')) return 'session-launch'
  if (lastText.startsWith('E2E independent Agent task')) return 'session-task'
  if (/GitDiffViewer/.test(lastText)) return 'extension'
  if (/Form "Request a forecast" submitted/.test(lastText)) return 'forecast'
  if (/Explain the surface/.test(lastText)) return 'explain-sphere'
  if (/interrupted\. Please generate/.test(lastText)) return 'regenerate'
  if (/line chart/i.test(lastText)) return 'patch'
  if (/2Rz|sphere/i.test(lastText)) return 'sphere'
  if (/dashboard|sales/i.test(lastText)) return 'dashboard'
  if (/oscillat|damped/i.test(lastText)) return 'math'
  if (/solar|orbit/i.test(lastText)) return 'slow'
  return 'text'
}

const AFTER = {
  ui_render: 'The dashboard above is interactive — sort the table, switch tabs, or request a forecast.',
  ui_render_widget: 'Drag to rotate, scroll to zoom, and move the R slider; the surface updates instantly.',
  ui_patch: 'The revenue chart is now a line chart; everything else is as you left it.',
}

/** The dashboard's uiId: the id of the ui_render call that showed it. */
const dashboardId = messages => messages.flatMap(m => Array.isArray(m.content) ? m.content : [])
  .find(c => c.type === 'tool_use' && c.name === 'ui_render' && c.input?.title === DASHBOARD.title)?.id

createServer((req, res) => {
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    if (req.method !== 'POST' || !req.url.endsWith('/messages')) { log({ unexpected: req.method + ' ' + req.url }); res.writeHead(404).end('{}'); return }
    const b = JSON.parse(body)
    const tools = (b.tools || []).map(t => t.name)
    const system = typeof b.system === 'string' ? b.system : (b.system || []).map(s => s.text).join('\n')
    const last = b.messages[b.messages.length - 1]
    const lastText = textOf(last.content)
    const toolResult = Array.isArray(last.content) && last.content.find(c => c.type === 'tool_result')
    // The most recent tool call, to phrase the closing sentence.
    const prev = b.messages[b.messages.length - 2]
    const lastTool = toolResult && Array.isArray(prev?.content) ? prev.content.find(c => c.type === 'tool_use')?.name : undefined
    const refusedPatch = lastTool === 'ui_patch' && /UI not changed/.test(textOf(toolResult.content))
    const decision = toolResult ? (refusedPatch ? 'patch-retry' : 'after-tool') : decide(lastText, tools)
    log({ at: new Date().toISOString(), decision, uiTools: tools.filter(t => t.startsWith('ui_')), toolCount: tools.length, guidance: system.includes('# Intelligent UI'), lastText: lastText.slice(0, 200), toolResult: toolResult ? textOf(toolResult.content).slice(0, 300) : undefined,
      ...(decision === 'session-task' ? { sessionTask: true, userMessageCount: b.messages.filter(m => m.role === 'user' && !(Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'))).length } : {}),
    })
    const model = b.model
    switch (decision) {
      case 'data-tools': return sse(res, toolEvents(model, 'ui_render', DATA_TOOLS, 36), 20)
      case 'session-launch': return sse(res, toolEvents(model, 'ui_render', SESSION_LAUNCH, 36), 20)
      case 'session-task': return sse(res, textEvents(model, 'Independent Agent started automatically.'), 20)
      case 'extension': return sse(res, toolEvents(model, 'ui_render', EXTENSION, 36), 30)
      case 'dashboard': {
        // Make the partial-tree checkpoint observable even on a busy CI host.
        // Keep the stream open after the first Stat is complete; the browser
        // must still render it before the remaining components arrive.
        const checkpoint = JSON.stringify(DASHBOARD).indexOf(',{"id":"k2"')
        let streamed = 0
        let paused = false
        return sse(res, toolEvents(model, 'ui_render', DASHBOARD, 36), event => {
          streamed += event.delta.partial_json.length
          if (!paused && streamed >= checkpoint) {
            paused = true
            return previewDelay('dashboard')
          }
          return 40
        })
      }
      case 'forecast': {
        const json = /\{[\s\S]*\}/.exec(lastText)
        let values = {}
        try { values = JSON.parse(json ? json[0] : '{}') } catch { /* keep defaults */ }
        return sse(res, toolEvents(model, 'ui_render', forecast(values), 36), 30)
      }
      case 'patch': return sse(res, toolEvents(model, 'ui_patch', chartPatch(dashboardId(b.messages), false), 24), 30)
      case 'patch-retry': return sse(res, toolEvents(model, 'ui_patch', chartPatch(dashboardId(b.messages), true), 24), 30)
      case 'math': return sse(res, toolEvents(model, 'ui_render', MATH, 36), 35)
      case 'sphere': {
        // Leave the completed HTML visible in preview before the JS arrives.
        const checkpoint = JSON.stringify(SPHERE).indexOf(',"jsFunctions":')
        let streamed = 0
        let paused = false
        return sse(res, toolEvents(model, 'ui_render_widget', SPHERE, 40), event => {
          streamed += event.delta.partial_json.length
          if (!paused && streamed >= checkpoint) {
            paused = true
            return previewDelay('sphere')
          }
          return 40
        })
      }
      case 'slow': return sse(res, toolEvents(model, 'ui_render_widget', SLOW, 24), 220)
      case 'explain-sphere': return sse(res, textEvents(model, explainSphere(lastText)), 20)
      case 'regenerate': return sse(res, toolEvents(model, 'ui_render_widget', SLOW, 80), 15)
      case 'after-tool': return sse(res, textEvents(model, AFTER[lastTool] ?? 'Shown above.'), 20)
      case 'text': return sse(res, textEvents(model, /capital of france/i.test(lastText) ? 'The capital of France is **Paris**.' : 'Received: ' + lastText.slice(0, 160)), 20)
      default: return sse(res, textEvents(model, 'Demo session'), 20)
    }
  })
}).listen(PORT, '127.0.0.1', () => log({ listening: PORT }))
