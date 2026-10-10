// Scripted "model" answers for the mock DeepSeek server. Each scenario is what
// a model following the plugin's guidance would plausibly emit; the mock picks
// one by keyword. They exercise every rendering path end to end, but they are
// NOT evidence of how a real model routes requests.

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
