// Scripted DeepSeek Messages (Anthropic-style SSE) server for plumbing tests.
import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'
const PORT = Number(process.argv[2] || 3199)
const LOG = process.argv[3]
const log = (o) => { const s = JSON.stringify(o); console.log(s); if (LOG) appendFileSync(LOG, s + '\n') }

const DASHBOARD = {
  title: 'Sorting algorithms',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', props: { title: 'Quicksort vs Mergesort vs Heapsort', subtitle: 'Average-case behaviour' }, children: ['stats', 'tabs'] },
    { id: 'stats', type: 'Grid', props: { columns: 3 }, children: ['s1', 's2', 's3'] },
    { id: 's1', type: 'Stat', props: { label: 'Quicksort', value: 'O(n log n)', delta: 'in-place', trend: 'up' } },
    { id: 's2', type: 'Stat', props: { label: 'Mergesort', value: 'O(n log n)', delta: 'stable' } },
    { id: 's3', type: 'Stat', props: { label: 'Heapsort', value: 'O(n log n)', delta: 'no extra memory', trend: 'flat' } },
    { id: 'tabs', type: 'Tabs', props: { labels: ['Table', 'Chart', 'Try it'] }, children: ['tbl', 'chart', 'form'] },
    { id: 'tbl', type: 'Table', props: { columns: ['Algorithm', 'Best', 'Worst', 'Stable', 'Memory'], rows: [['Quicksort', 'n log n', 'n^2', false, 'log n'], ['Mergesort', 'n log n', 'n log n', true, 'n'], ['Heapsort', 'n log n', 'n log n', false, '1']], sortable: true } },
    { id: 'chart', type: 'Chart', props: { kind: 'line', title: 'Comparisons (millions)', labels: ['10k', '100k', '1M'], series: [{ name: 'Quicksort', values: [0.16, 2.0, 24] }, { name: 'Mergesort', values: [0.12, 1.6, 20] }, { name: 'Heapsort', values: [0.24, 3.1, 37] }] } },
    { id: 'form', type: 'Form', props: { title: 'Benchmark', submitLabel: 'Run', fields: [{ name: 'n', label: 'Array size', type: 'number', default: 100000, required: true }, { name: 'algo', label: 'Algorithm', type: 'select', options: ['Quicksort', 'Mergesort', 'Heapsort'], default: 'Mergesort' }, { name: 'sorted', label: 'Already sorted input', type: 'checkbox' }] } },
  ],
}

const WIDGET = {
  title: 'Sine wave explorer',
  initialHeight: 340,
  placeholderMessages: ['Drawing the axes', 'Wiring up the sliders'],
  css: '.wrap{display:flex;flex-direction:column;gap:10px}.row{display:flex;gap:12px;align-items:center}label{color:var(--ui-muted);font-size:13px;min-width:90px}canvas{width:100%;height:200px;border:1px solid var(--ui-border);border-radius:var(--ui-radius);background:var(--ui-surface)}',
  html: '<div class="wrap"><h3>y = A * sin(f * x)</h3><div class="row"><label for="a">Amplitude <b id="av">1.0</b></label><input id="a" type="range" min="0.1" max="2" step="0.1" value="1"></div><div class="row"><label for="f">Frequency <b id="fv">1.0</b></label><input id="f" type="range" min="0.5" max="5" step="0.5" value="1"></div><canvas id="c" width="600" height="200"></canvas><div class="row"><button class="primary" id="ask">Explain these parameters</button></div></div>',
  jsFunctions: 'function draw(){var c=document.getElementById("c"),g=c.getContext("2d"),A=+document.getElementById("a").value,f=+document.getElementById("f").value;document.getElementById("av").textContent=A.toFixed(1);document.getElementById("fv").textContent=f.toFixed(1);g.clearRect(0,0,c.width,c.height);g.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--ui-accent")||"#4d6bfe";g.lineWidth=2;g.beginPath();for(var x=0;x<=c.width;x++){var y=c.height/2-A*80*Math.sin(f*x/c.width*Math.PI*4);x?g.lineTo(x,y):g.moveTo(x,y)}g.stroke()}\nfunction wire(){["a","f"].forEach(function(id){document.getElementById(id).addEventListener("input",draw)});document.getElementById("ask").addEventListener("click",function(){Bridge.sendPrompt({text:"Explain amplitude "+document.getElementById("a").value+" and frequency "+document.getElementById("f").value})})}',
  jsExpressions: ['wire()', 'draw()'],
}

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  let i = 0
  const tick = () => {
    if (i >= events.length) return res.end()
    const e = events[i++]
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    setTimeout(tick, e.type === 'content_block_delta' ? 25 : 5)
  }
  tick()
}

const start = model => ({ type: 'message_start', message: { id: 'msg_' + Date.now(), type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
function textEvents(model, text) {
  return [start(model), { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' }]
}
function toolEvents(model, name, input, chunk = 40) {
  const json = JSON.stringify(input)
  const ev = [start(model), { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_' + Date.now(), name, input: {} } }]
  for (let i = 0; i < json.length; i += chunk) ev.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + chunk) } })
  ev.push({ type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 100 } }, { type: 'message_stop' })
  return ev
}

const textOf = content => typeof content === 'string' ? content : (content || []).map(b => b.type === 'text' ? b.text : '').join('')

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
    let decision = 'text'
    if (toolResult) decision = 'after-tool'
    else if (!tools.includes('ui_render')) decision = 'no-ui-tools'
    else if (/widget|sine/i.test(lastText) && !/Explain amplitude/.test(lastText)) decision = 'widget'
    else if (/dashboard|compare|sort/i.test(lastText) && !/submitted/.test(lastText)) decision = 'render'
    log({ at: new Date().toISOString(), decision, uiTools: tools.filter(t => t.startsWith('ui_')), toolCount: tools.length, guidance: system.includes('# Intelligent UI'), lastText: lastText.slice(0, 200), toolResult: toolResult ? textOf(toolResult.content).slice(0, 300) : undefined })
    const model = b.model
    if (decision === 'widget') return sse(res, toolEvents(model, 'ui_render_widget', WIDGET, 60))
    if (decision === 'render') return sse(res, toolEvents(model, 'ui_render', DASHBOARD, 40))
    if (decision === 'after-tool') return sse(res, textEvents(model, 'Shown above.'))
    return sse(res, textEvents(model, 'Received: ' + lastText.slice(0, 160)))
  })
}).listen(PORT, '127.0.0.1', () => log({ listening: PORT }))
