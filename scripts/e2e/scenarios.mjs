// Scripted "model" answers for the mock DeepSeek server. Each scenario is what
// a model following the plugin's guidance would plausibly emit; the mock picks
// one by keyword. They exercise every rendering path end to end, but they are
// NOT evidence of how a real model routes requests.

export const SESSION_LAUNCH = {
  title: 'Independent Agent task',
  root: 'launch',
  components: [{ id: 'launch', type: 'Button', props: {
    label: 'Start independent Agent', prompt: 'E2E independent Agent task', sessionTarget: 'new',
  } }],
}

/** Issue #17 components: data grid, scatter, heatmap, code diff, map, photos and videos in one card. */
export const DATA_TOOLS = {
  title: 'Data tools',
  root: 'stack',
  components: [
    { id: 'stack', type: 'Stack', children: ['grid', 'scatter', 'heat', 'diff', 'map', 'photos', 'clip', 'talk'] },
    { id: 'grid', type: 'Table', props: {
      caption: 'Orders', sortable: true, searchable: true, filterable: true, exportable: true, pageSize: 5,
      columns: ['Order', 'Date', 'Amount', 'Note'],
      rows: [
        ['A-1', '2026-03-02', 120, 'ok'], ['B-2', '2026-01-15', -40, '=1+1'], ['C-3', '2026-02-20', 300, 'big'],
        ['D-4', '2025-12-31', 75.5, 'year end'], ['E-5', '2026-02-10', 18, 'small'], ['F-6', '2026-04-01', 260, 'spring'],
      ],
    } },
    { id: 'scatter', type: 'Scatter', props: {
      title: 'Price vs rating', xLabel: 'Price', xUnit: 'USD', yLabel: 'Rating',
      series: [{ name: 'Products', points: [{ x: 10, y: 3.2, label: 'Basic' }, { x: 25, y: 4.1, label: 'Plus' }, { x: 60, y: 4.7, label: 'Pro' }, { x: null, y: 4 }] }],
    } },
    { id: 'heat', type: 'Heatmap', props: {
      title: 'Load', unit: '%', xLabels: ['Mon', 'Tue', 'Wed'], yLabels: ['AM', 'PM'], values: [[10, 0, null], [70, 95, 40]],
    } },
    { id: 'diff', type: 'CodeDiff', props: {
      title: 'Change', files: [{ path: 'app.js', before: Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'), after: Array.from({ length: 12 }, (_, i) => i === 6 ? '<img src=x onerror="window.__xss=1">' : `line ${i}`).join('\n') }],
    } },
    // https://media.e2e.test is answered by the browser driver (request interception), so no real network is used.
    { id: 'photos', type: 'Gallery', props: {
      title: 'Photos',
      images: [
        { src: 'https://media.e2e.test/a.png', alt: 'Blue square', caption: 'First', credit: 'E2E', creditUrl: 'https://media.e2e.test/credit' },
        { src: 'https://media.e2e.test/b.png', alt: 'Green square', caption: 'Second' },
        { src: 'https://media.e2e.test/missing.png', alt: 'Missing photo', caption: 'Broken' },
      ],
    } },
    { id: 'clip', type: 'Video', props: { src: 'https://media.e2e.test/clip.webm', title: 'Clip', caption: 'A 1 s test clip' } },
    { id: 'talk', type: 'Video', props: { src: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', title: 'Talk', start: 10 } },
    { id: 'map', type: 'Map', props: {
      title: 'Kyoto day trip',
      markers: [
        { id: 'inari', lat: 34.9671, lon: 135.7727, label: 'Fushimi Inari', group: 'Morning', note: 'Go early' },
        { id: 'kiyo', lat: 34.9949, lon: 135.785, label: 'Kiyomizu-dera', group: 'Morning' },
        { id: 'arashi', lat: 35.0094, lon: 135.6668, label: 'Arashiyama', group: 'Afternoon' },
      ],
      routes: [{ label: 'Itinerary sketch', dashed: true, points: [[34.9671, 135.7727], [34.9949, 135.785], [35.0094, 135.6668]] }],
    } },
  ],
}

/** One composed answer: prose, native UI, prose, a decision and a sandboxed widget, in that order. */
const lines = (...parts) => parts.join(String.fromCharCode(10))
export const COMPOSE = {
  title: 'Route decision',
  blocks: [
    { id: 'intro', type: 'markdown', text: lines('## 推荐结论', '', '先用 **本地 SQLite**，把数据模型和同步边界跑通，再考虑托管后端。', '', '| 路线 | 月成本 | 运维负担 |', '| --- | --- | --- |', '| 本地 SQLite | 约 0 | 低 |', '| Supabase | 约 $25 | 中 |') },
    { id: 'compare', type: 'catalog', title: '成本与运维对比', root: 'stack', components: [
      { id: 'stack', type: 'Stack', children: ['chart'] },
      { id: 'chart', type: 'Chart', props: { kind: 'bar', title: 'Monthly cost (USD)', labels: ['Local', 'Supabase', 'Custom'], series: [{ name: 'Cost', values: [0, 25, 60] }] } },
    ] },
    { id: 'analysis', type: 'markdown', text: lines('### 为什么先本地', '', '1. 单人维护，同步冲突面小。', '2. 托管方案在离线时不可用。', '3. 迁移到 Supabase 只需要替换存储层。') },
    { id: 'next', type: 'catalog', title: '下一步', root: 'choice', components: [
      { id: 'choice', type: 'Choice', props: { question: '接下来讨论哪条路线？', options: [
        { id: 'local', label: '本地 SQLite', description: '先把本地模型定下来', prompt: '继续讨论本地 SQLite 方案，只讨论，不写代码。' },
        { id: 'cloud', label: 'Supabase', description: '托管后端与同步', prompt: '继续讨论 Supabase 方案，只讨论，不写代码。' },
      ] } },
    ] },
    { id: 'outro', type: 'markdown', text: '选好路线后，再决定同步频率与冲突策略。' },
  ],
}

export function composePatch(uiId) {
  return { uiId, baseVersion: 1, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'line', title: 'Monthly cost (line)' } }] }
}

export const DASHBOARD = {
  title: 'Quarterly sales (sample data)',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', props: { title: 'Sales overview · FY2025', subtitle: 'Illustrative sample data for the demo' }, children: ['kpis', 'tabs'] },
    { id: 'kpis', type: 'Grid', props: { columns: 4 }, children: ['k1', 'k2', 'k3', 'k4'] },
    { id: 'k1', type: 'Stat', props: { label: 'Revenue', value: '$4.82M', delta: '+12.4% YoY', trend: 'up' } },
    { id: 'k2', type: 'Stat', props: { label: 'Orders', value: '18,240', delta: '+6.1%', trend: 'up' } },
    { id: 'k3', type: 'Stat', props: { label: 'Avg. order', value: '$264', delta: '+5.9%', trend: 'up' } },
    { id: 'k4', type: 'Stat', props: { label: 'Churn', value: '2.1%', delta: '+0.3 pt', trend: 'down' } },
    { id: 'tabs', type: 'Tabs', props: { labels: ['Revenue', 'Regions', 'Milestones', 'Forecast'] }, children: ['chart', 'regions', 'timeline', 'form'] },
    { id: 'chart', type: 'Chart', props: { kind: 'bar', stacked: true, title: 'Revenue by channel', unit: 'k$', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Online', values: [820, 910, 1010, 1180] }, { name: 'Retail', values: [300, 285, 262, 253] }] } },
    { id: 'regions', type: 'Table', props: { sortable: true, caption: 'Click a header to sort', columns: ['Region', 'Revenue (k$)', 'Growth %', 'Target met'], rows: [['North America', 2140, 9.8, true], ['Europe', 1310, 14.2, true], ['APAC', 1020, 18.5, false], ['LATAM', 350, 4.1, false]] } },
    { id: 'timeline', type: 'Timeline', props: { items: [{ time: 'Jan', title: 'New checkout launched', text: 'Conversion **+1.8 pt**', tone: 'success' }, { time: 'Apr', title: 'Retail store closures', text: '3 stores consolidated', tone: 'warning' }, { time: 'Aug', title: 'APAC marketplace', text: 'Fastest-growing region' }, { time: 'Nov', title: 'Holiday campaign', text: 'Record week: $142k', tone: 'success' }] } },
    { id: 'form', type: 'Form', props: { title: 'Request a forecast', submitLabel: 'Ask for forecast', fields: [{ name: 'region', label: 'Region', type: 'select', options: ['All', 'North America', 'Europe', 'APAC'], default: 'All' }, { name: 'quarters', label: 'Horizon (quarters)', type: 'range', min: 1, max: 8, step: 1, default: 4 }, { name: 'scenario', label: 'Scenario', type: 'select', options: ['Base', 'Optimistic', 'Conservative'], default: 'Base' }, { name: 'seasonality', label: 'Include seasonality', type: 'checkbox', default: true }] } },
  ],
}

/**
 * Second-turn change of the dashboard by component id. The first attempt uses
 * an invalid chart kind, so the Host refuses it and the "model" retries.
 */
export function chartPatch(uiId, valid) {
  return { uiId, baseVersion: 1, ops: [{ op: 'setProps', id: 'chart', props: { kind: valid ? 'line' : 'scatter', title: 'Revenue by channel (line)' } }] }
}

export function forecast(values) {
  const q = Math.max(1, Math.min(8, Number(values.quarters) || 4))
  const growth = { Base: 0.03, Optimistic: 0.055, Conservative: 0.012 }[values.scenario] ?? 0.03
  const labels = Array.from({ length: q }, (_, i) => `Q${(i % 4) + 1} ${2026 + Math.floor(i / 4)}`)
  let v = 1433
  const base = labels.map((_, i) => Math.round((v *= 1 + growth) * (values.seasonality && i % 4 === 3 ? 1.12 : 1)))
  return {
    title: `Forecast · ${values.region ?? 'All'} · ${values.scenario ?? 'Base'}`,
    root: 'f',
    components: [
      { id: 'f', type: 'Stack', children: ['fc', 'note'] },
      { id: 'fc', type: 'Chart', props: { kind: 'area', title: `Projected revenue, next ${q} quarters`, unit: 'k$', labels, series: [{ name: values.scenario ?? 'Base', values: base }] } },
      { id: 'note', type: 'Alert', props: { tone: 'info', title: 'Assumptions', text: `${(growth * 100).toFixed(1)}% quarter-over-quarter growth${values.seasonality ? ', +12% holiday-quarter seasonality' : ''}. Sample data.` } },
    ],
  }
}

export const MATH = {
  title: 'Damped oscillator',
  root: 'c',
  components: [
    { id: 'c', type: 'Card', children: ['eq', 'plot', 'regimes'] },
    { id: 'eq', type: 'Math', props: { tex: 'x(t) = A\\,e^{-\\gamma t}\\cos(\\omega t), \\qquad \\gamma = \\frac{c}{2m}' } },
    { id: 'plot', type: 'Plot', props: { title: 'Drag the sliders — the curve updates instantly', xMin: 0, xMax: 12, xLabel: 't', functions: [{ expr: 'A*exp(-g*x)*cos(w*x)', label: 'x(t)' }, { expr: 'A*exp(-g*x)', label: 'envelope' }, { expr: '-A*exp(-g*x)', label: '−envelope' }], params: [{ name: 'A', label: 'A', min: 0.2, max: 2, step: 0.1, value: 1 }, { name: 'g', label: 'γ', min: 0, max: 1, step: 0.02, value: 0.2 }, { name: 'w', label: 'ω', min: 0.5, max: 6, step: 0.1, value: 2.5 }] } },
    { id: 'regimes', type: 'Mermaid', props: { code: 'flowchart LR\n  Z{"damping ratio ζ"} -->|"ζ < 1"| U["Underdamped: oscillates"]\n  Z -->|"ζ = 1"| C["Critically damped: fastest return"]\n  Z -->|"ζ > 1"| O["Overdamped: slow return"]' } },
  ],
}

export const SPHERE = {
  title: 'Sphere x² + y² + z² = 2Rz',
  initialHeight: 470,
  placeholderMessages: ['Completing the square: x² + y² + (z − R)² = R²', 'Building the 3D scene', 'Wiring the R slider'],
  css: '.head{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;justify-content:space-between;margin-bottom:10px}.head h3{margin:0}.eq{font-family:var(--ui-mono);font-size:12.5px;color:var(--ui-muted)}.ui-stage{height:330px}.foot{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin-top:10px}.foot .ui-control input[type=range]{width:180px}.stats{font-size:12px;color:var(--ui-muted);font-variant-numeric:tabular-nums}.foot button{margin-left:auto}@media (max-width:520px){.foot button{margin-left:0}.ui-stage{height:260px}}',
  html: '<div class="head"><h3>x² + y² + z² = 2Rz</h3><div class="eq">⇔ x² + y² + (z − R)² = R²: a sphere centred at (0, 0, R) with radius R</div></div><div class="ui-stage" id="stage" role="img" aria-label="3D view. Drag to rotate, scroll or pinch to zoom."></div><div class="foot"><label class="ui-control" for="r">R <input id="r" type="range" min="0.2" max="3" step="0.1" value="1"><output id="rv" for="r">1.0</output></label><label class="ui-control" for="wire"><input id="wire" type="checkbox"> wireframe</label><span class="stats" id="stats"></span><button class="primary" id="ask">Explain this surface</button></div>',
  jsFunctions: [
    'async function init(){',
    '  var v = await UI.three("#stage", { camera: [5, -6, 4], target: [0, 0, 1] });',
    '  var THREE = v.THREE;',
    '  v.camera.up.set(0, 0, 1); v.controls.update();',
    '  var grid = new THREE.GridHelper(8, 16, UI.color("muted"), UI.color("border")); grid.rotation.x = Math.PI / 2; v.scene.add(grid);',
    '  v.scene.add(new THREE.AxesHelper(3.2));',
    '  var mat = new THREE.MeshStandardMaterial({ color: UI.color("accent"), roughness: 0.35, metalness: 0.08, transparent: true, opacity: 0.88 });',
    '  var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat); v.scene.add(mesh);',
    '  var dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: UI.color("error") })); v.scene.add(dot);',
    '  function update(){',
    '    var R = +document.getElementById("r").value;',
    '    document.getElementById("rv").textContent = R.toFixed(1);',
    '    mesh.scale.setScalar(R); mesh.position.set(0, 0, R);',
    '    mat.wireframe = document.getElementById("wire").checked;',
    '    document.getElementById("stats").textContent = "centre (0, 0, " + R.toFixed(1) + ") · area " + (4 * Math.PI * R * R).toFixed(2) + " · volume " + (4 / 3 * Math.PI * R * R * R).toFixed(2);',
    '    v.render();',
    '  }',
    '  document.getElementById("r").addEventListener("input", update);',
    '  document.getElementById("wire").addEventListener("change", update);',
    '  UI.onTheme(function(){ mat.color.set(UI.color("accent")); v.render(); });',
    '  document.getElementById("ask").addEventListener("click", function(){ Bridge.sendPrompt("Explain the surface x²+y²+z²=2Rz at R = " + document.getElementById("r").value + "."); });',
    '  window.__view = v; window.__mesh = mesh;',
    '  update();',
    '}',
  ].join('\n'),
  jsExpressions: ['init()'],
}

/** Long and deliberately slow, so a test can stop the turn mid-stream. */
export const SLOW = {
  title: 'Solar system orbits',
  initialHeight: 360,
  placeholderMessages: ['Placing the planets', 'Computing orbital periods'],
  css: '.sky{position:relative;height:300px;border-radius:var(--ui-radius);background:var(--ui-surface);overflow:hidden}.sun{position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px;border-radius:50%;background:var(--ui-warning)}.orbit{position:absolute;left:50%;top:50%;border:1px dashed var(--ui-border);border-radius:50%}.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:12px;color:var(--ui-muted)}',
  html: '<h3>Inner planets</h3><div class="sky" id="sky"><div class="sun"></div>' + [60, 90, 120, 150].map(r => `<div class="orbit" style="width:${2 * r}px;height:${2 * r}px;margin:-${r}px"></div>`).join('') + '</div><div class="legend">' + ['Mercury · 88 d', 'Venus · 225 d', 'Earth · 365 d', 'Mars · 687 d'].map(x => `<span>${x}</span>`).join('') + '</div>',
  jsFunctions: 'function start(){ /* animation would go here */ }',
  jsExpressions: ['start()'],
}

export function explainSphere(text) {
  const R = Number((/R = ([\d.]+)/.exec(text) || [])[1] || 1)
  return `At R = ${R}, completing the square gives x² + y² + (z − ${R})² = ${R}²: a sphere of radius ${R} centred at (0, 0, ${R}). `
    + `It touches the xy-plane only at the origin, its surface area is ${(4 * Math.PI * R * R).toFixed(2)} and its volume ${(4 / 3 * Math.PI * R ** 3).toFixed(2)}.`
}

/** Issue #84: Declarative computed engine and live cross-component linkage. */
export const COMPUTED_PLANNER = {
  title: 'Cloud capacity planner',
  root: 'card',
  computed: [
    { id: 'nodeCount', expr: 'nodes', format: { style: 'decimal', maximumFractionDigits: 0 } },
    { id: 'monthlyCost', expr: 'nodes * 120', format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } },
    { id: 'annualCost', expr: 'monthlyCost * 12', format: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } },
    { id: 'utilization', expr: 'min(100, nodes * 10)', format: { style: 'decimal', maximumFractionDigits: 0 } },
    { id: 'minTierNodes', expr: 'nodes', format: { style: 'decimal', maximumFractionDigits: 0 } },
  ],
  components: [
    { id: 'card', type: 'Card', props: { title: 'Cluster sizing · Live computed linkage', subtitle: 'Adjust nodes to recompute KPIs, progress, chart and table filter locally' }, children: ['controls', 'kpis', 'util', 'chart', 'tiers'] },
    { id: 'controls', type: 'Form', props: {
      title: 'Cluster parameters',
      fields: [
        { name: 'nodes', label: 'Worker nodes', type: 'number', min: 1, max: 20, step: 1, default: 4, bindKey: 'nodes' },
      ],
    } },
    { id: 'kpis', type: 'Grid', props: { columns: 2 }, children: ['mCost', 'aCost'] },
    { id: 'mCost', type: 'Stat', props: { label: 'Monthly cost', value: '{{monthlyCost}}', delta: '{{nodeCount}} nodes @ $120', trend: 'up' } },
    { id: 'aCost', type: 'Stat', props: { label: 'Annual run-rate', value: '{{annualCost}}', delta: '12-month projection', trend: 'flat' } },
    { id: 'util', type: 'Progress', props: { label: 'Capacity utilization ({{utilization}}%)', value: { $computed: 'utilization' }, max: 100 } },
    { id: 'chart', type: 'Chart', props: {
      kind: 'bar', title: 'Monthly budget comparison (USD)', labels: ['Baseline (4)', 'Selected', 'Enterprise (12)'],
      series: [{ name: 'USD/mo', values: [480, { $computed: 'monthlyCost' }, 1440] }],
    } },
    { id: 'tiers', type: 'Table', props: {
      caption: 'Eligible support tiers',
      columns: ['Tier', 'MinNodes', 'SLA'],
      rows: [
        ['Starter', 1, '99.5%'],
        ['Growth', 4, '99.9%'],
        ['Enterprise', 10, '99.99%'],
      ],
      filterField: 'MinNodes',
      filterValue: '>= {{minTierNodes}}',
    } },
  ],
}

/** Slash `/ui` command scenario with FileTree, JsonView, Badge and Code. */
export const SYSTEM_INSPECTOR = {
  title: 'Runtime inspector',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', props: { title: 'DSH 0.2.2 Runtime Compatibility Inspector', subtitle: 'Triggered via /ui slash command' }, children: ['badges', 'split'] },
    { id: 'badges', type: 'Stack', props: { direction: 'horizontal' }, children: ['b1', 'b2', 'b3'] },
    { id: 'b1', type: 'Badge', props: { text: 'cordis 4.1.0', tone: 'success' } },
    { id: 'b2', type: 'Badge', props: { text: 'PTC ready', tone: 'info' } },
    { id: 'b3', type: 'Badge', props: { text: 'SessionProjection v1', tone: 'success' } },
    { id: 'split', type: 'Grid', props: { columns: 2 }, children: ['tree', 'json'] },
    { id: 'tree', type: 'FileTree', props: {
      title: 'Plugin structure',
      expandDepth: 2,
      entries: [
        { path: 'src/plugin.js', status: 'modified', note: 'SessionProjection' },
        { path: 'src/compat.js', status: 'modified', note: 'cordis 4.1.0' },
        { path: 'src/catalog/computed.js' },
        { path: 'src/catalog/patch.js', status: 'modified', note: 'PTC fold' },
        { path: 'client-src/turn.ts', status: 'modified', note: 'PTC TurnTail' },
      ],
    } },
    { id: 'json', type: 'JsonView', props: {
      title: 'Compatibility contract',
      expandDepth: 2,
      data: {
        runtime: '0.2.2-rc.1 / master',
        cordis: '4.1.0',
        transports: ['native', 'ptc'],
        tools: ['ui_render', 'ui_patch', 'ui_render_widget', 'ui_compose'],
      },
    } },
  ],
}

/** DSH 0.2.2+ PTC (`run_code` -> `tool/ptc-dispatch`) scenario and patch. */
export const PTC_CARD = {
  title: 'PTC pipeline monitor',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', props: { title: 'PTC Mode · Programmatic Tool Calling', subtitle: 'Dispatched inside run_code via await tools.ui_render(...)' }, children: ['kpis', 'chart'] },
    { id: 'kpis', type: 'Grid', props: { columns: 2 }, children: ['s1', 's2'] },
    { id: 's1', type: 'Stat', props: { label: 'Transport', value: 'tool/ptc-dispatch', delta: 'nested sub-call', trend: 'up' } },
    { id: 's2', type: 'Stat', props: { label: 'Projection', value: 'Active', delta: 'sessionProjections', trend: 'up' } },
    { id: 'chart', type: 'Chart', props: {
      kind: 'bar', title: 'Sub-call latency (ms)', labels: ['Turn 1', 'Turn 2', 'Turn 3'],
      series: [{ name: 'Latency', values: [18, 12, 9] }],
    } },
  ],
}

/**
 * Build the `ui_patch` payload that updates the PTC pipeline monitor chart to a line chart.
 * @param {string} uiId
 */
export function ptcPatch(uiId) {
  return {
    uiId,
    baseVersion: 1,
    ops: [{ op: 'setProps', id: 'chart', props: { kind: 'line', title: 'Sub-call latency (patched via PTC)' } }],
  }
}
