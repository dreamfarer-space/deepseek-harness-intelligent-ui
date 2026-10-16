import { validateTree } from '../../src/catalog/catalog.js';
import { validateWidget } from '../../src/tools/widget.js';

/** Bump whenever a check changes: reports with different versions are not comparable. */
export const ASSERTION_VERSION = 3;

/** Validate every call before constructing a follow-up tool-result history. */
export function checkedCalls(message, config) {
  const calls = message?.tool_calls;
  if (!Array.isArray(calls) || !calls.length) throw new Error('No UI tool call returned');
  const ids = new Set();
  return calls.map(call => {
    if (!call.id || ids.has(call.id)) throw new Error('Tool calls need unique non-empty ids');
    ids.add(call.id);
    const name = call.function?.name;
    const args = JSON.parse(call.function?.arguments);
    if (name === 'ui_render') {
      const validation = validateTree(args);
      if (!validation.ok) throw new Error(`validateTree failed: ${validation.errors.join('; ')}`);
    } else if (name === 'ui_render_widget') {
      const errors = validateWidget(args, config);
      if (errors.length) throw new Error(`validateWidget failed: ${errors.join('; ')}`);
    } else throw new Error(`Unexpected tool: ${name}`);
    return { call, args, name };
  });
}

/** Orphan components are valid schema but never rendered; do not score them. */
export function renderedNodes(args) {
  const byId = new Map(args.components.map(node => [node.id, node]));
  const seen = new Set();
  const nodes = [];
  const visit = id => {
    if (seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    const node = byId.get(id);
    nodes.push(node);
    for (const child of node.children || node.props?.children || []) visit(child);
  };
  visit(args.root);
  return nodes;
}

/** One quarter label: "Q1", "Q1 2025", "2025Q1", "第一季度", "1季度". */
const QUARTER = /^(?:(?:20\d\d\s*)?Q\s*[1-4](?:\s*(?:20\d\d|[(（][^)）]*[)）]))?|[1-4](?:\s*季度)?|第?[一二三四1-4]季度)$/i;
const ONLINE = /线上|电商|online|e-?commerce/i;
const OFFLINE = /线下|门店|offline|store/i;

/** Every requested criterion as its own check, so a report says which one failed. */
const NATIVE = {
  B1: has => [
    ['KPI tiles for revenue, active users, conversion and order value',
      ['收入|营收|revenue|gmv', '活跃|月活|日活|active|(?<![a-z])[md]au(?![a-z])', '转化|conversion', '客单|order value|aov|arpu'].every(k => has('Stat', p => new RegExp(k, 'i').test(p.label)))],
    ['per-business-line breakdown (Chart or Table)', has('Chart', p => p.series.length >= 1 && p.labels.length >= 2) || has('Table', p => p.rows.length >= 2)],
  ],
  B2: has => [
    ['sortable table with rows', has('Table', p => p.sortable === true && p.rows.length >= 3)],
    ['columns: model, range, 0-100, price, battery',
      has('Table', p => ['车型|model', '续航|range', '加速|0-100|百公里', '售价|价格|指导价|报价|price|msrp', '电池|battery'].every(k => p.columns.some(c => new RegExp(k, 'i').test(c))))],
  ],
  B3: has => [
    ['bar Chart rendered', has('Chart', p => p.kind === 'bar')],
    ['four quarters Q1-Q4 on the x axis', has('Chart', p => p.labels.length === 4 && p.labels.every(l => QUARTER.test(String(l).trim())))],
    ['online and offline series with 4 values each', has('Chart', p => p.series.length >= 2 && p.series.some(s => ONLINE.test(s.name)) && p.series.some(s => OFFLINE.test(s.name)) && p.series.every(s => s.values.length === 4))],
  ],
  B4: has => [
    ['rating slider (range field)', has('Form', p => p.fields.some(f => f.type === 'range'))],
    ['email opt-in (checkbox field)', has('Form', p => p.fields.some(f => f.type === 'checkbox'))],
    ['user type / category choices (select field)', has('Form', p => p.fields.some(f => f.type === 'select' && (f.options || []).length >= 2))],
  ],
  // A dated Mermaid flow/timeline is an equally correct chronology: judge the result, not the component.
  B5: has => [['chronology with at least 4 milestones (Timeline, or Mermaid with 4+ ordered years)',
    has('Timeline', p => p.items.length >= 4) || has('Mermaid', p => {
      const years = (String(p.code).match(/(?<!\d)(?:19|20)\d\d(?!\d)/g) || []).map(Number)
      return new Set(years).size >= 4 && years.every((y, i) => i === 0 || y >= years[i - 1])
    })]],
  C2: has => {
    const plots = []
    has('Plot', p => { plots.push(p); return true })
    const exprs = p => (p.functions || []).map(f => f.expr).join(' ')
    const uses = (p, name) => new RegExp(`(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(exprs(p))
    return [
      ['Plot with three parameter sliders', plots.some(p => (p.params || []).length >= 3)],
      ['every slider drives the curve (param used in an expression)', plots.some(p => (p.params || []).length >= 3 && p.params.every(q => uses(p, q.name)))],
      ['damped oscillation shape: exp(…)·sin/cos(…)', plots.some(p => /exp\s*\(|e\s*\^/.test(exprs(p)) && /(sin|cos)\s*\(/.test(exprs(p)))],
    ]
  },
};

/**
 * Checks for a native (ui_render) case.
 * @returns {[string, boolean][]}
 */
export function nativeChecks(id, args) {
  const nodes = renderedNodes(args);
  const has = (type, predicate = () => true) => nodes.some(n => {
    if (n.type !== type) return false;
    try { return !!predicate(n.props || {}); } catch { return false; }
  });
  return (NATIVE[id]?.(has) ?? []).map(([name, ok]) => [name, !!ok]);
}

export function checkNativeCase(id, args) {
  const checks = nativeChecks(id, args);
  return checks.length && checks.every(([, ok]) => ok) ? null : `${id}: requested rendered components or controls are missing`;
}

/** Source of a widget: what the browser will run. */
const widgetCode = a => [a.jsFunctions, ...(a.jsExpressions || [])].filter(Boolean).join('\n');
const usesThree = a => /UI\.three\s*\(|import\(\s*["']three["']\s*\)/.test(widgetCode(a));
const animates = a => /onFrame\s*\(|requestAnimationFrame|setAnimationLoop|setInterval/.test(widgetCode(a));
const ranges = a => (String(a.html).match(/<input[^>]*type\s*=\s*["']?range/gi) || []).length;

export function widgetChecks(id, a) {
  switch (id) {
    case 'C1': return [
      ['Three.js scene (UI.three or import("three"))', usesThree(a)],
      ['surface depends on R (R appears in code or controls)', /\bR\b/.test(widgetCode(a) + a.html)],
    ];
    case 'C2': return [
      ['three sliders (range inputs)', ranges(a) >= 3],
      ['draws a curve (canvas, svg or chart)', /<canvas|<svg|chart\.js|d3/i.test(a.html + widgetCode(a))],
      ['damped oscillation shape: exp(…)·sin/cos(…)', /Math\.exp\s*\(/.test(widgetCode(a)) && /Math\.(sin|cos)\s*\(/.test(widgetCode(a))],
    ];
    case 'C3': return [
      ['Three.js scene (UI.three or import("three"))', usesThree(a)],
      ['animated orbits', animates(a)],
      ['light sources for shading', /Light\s*\(/.test(widgetCode(a)) || /UI\.three\s*\(/.test(widgetCode(a))],
    ];
    case 'C4': return [
      ['start/pause control', /<button/i.test(a.html) && /暂停|pause|start|开始|启动/i.test(a.html + widgetCode(a))],
      ['length and gravity sliders', ranges(a) >= 2 && /摆长|length|\bL\b/i.test(a.html) && /重力|gravity|\bg\b/i.test(a.html)],
      ['time-stepped animation', animates(a)],
    ];
    default: return [];
  }
}

/** The follow-up uses the submitted region (APAC unless the form offered other regions), 4 quarters and the optimistic scenario. */
export function incorporatesSubmission(message, checked, region = 'APAC') {
  const text = [message.content || '', ...checked.map(c => JSON.stringify(c.args))].join('\n');
  const place = region === 'APAC' ? /apac/i.test(text) : text.includes(region);
  return place && /(?:\b4\b|四)/.test(text) && /optimistic|乐观/i.test(text);
}

export function checkUpdatedTable(original, updated) {
  const originals = renderedNodes(original).filter(n => n.type === 'Table');
  const tables = renderedNodes(updated).filter(n => n.type === 'Table');
  const expected = new Map([['Model A', '6.1'], ['Model B', '6.7'], ['Model C', '6.5']]);
  return originals.some(before => tables.some(after => {
    const index = after.props.columns.findIndex(c => /屏幕|screen|尺寸/i.test(c));
    if (index < 0 || !before.props.columns.every(c => after.props.columns.includes(c))) return false;
    return [...expected].every(([model, size]) => {
      const row = after.props.rows.find(r => r.some(cell => String(cell).trim() === model));
      if (!row || !new RegExp(`^${size.replace('.', '\\.')}(?:\\s*(?:寸|英寸|inch(?:es)?|["″]))?$`, 'i').test(String(row[index]).trim())) return false;
      const oldRow = before.props.rows.find(r => r.some(cell => String(cell).trim() === model));
      return oldRow && before.props.columns.every((column, i) => String(oldRow[i]) === String(row[after.props.columns.indexOf(column)]));
    });
  }));
}

/** Chart nodes of a UI snapshot. */
export const chartsOf = ui => (ui ? renderedNodes(ui).filter(n => n.type === 'Chart') : []);

/**
 * Continuous modification (D3): the chart is now a line chart, the original
 * two series are unchanged, and the added series has exactly the requested values.
 */
export function checkChartEdits(before, after, { kind, added } = {}) {
  const old = chartsOf(before)[0]?.props;
  const now = chartsOf(after).map(n => n.props);
  if (!old) return [['original chart present', false]];
  const same = (a, b) => a.length === b.length && a.every((v, i) => Number(v) === Number(b[i]));
  return [
    [`chart is now "${kind}"`, now.some(p => p.kind === kind)],
    ['original series kept with the same values', now.some(p => old.series.every(s => p.series.some(t => t.name === s.name && same(t.values, s.values))))],
    ...(added ? [[`series "${added.name}" = ${added.values.join(', ')}`, now.some(p => p.series.some(s => s.name.includes(added.name) && same(s.values, added.values)))]] : []),
  ];
}

/**
 * Pick submission values for a forecast form by meaning, like a user would.
 * @returns {{ values: Record<string, unknown>, missing: string[], region?: string }}
 */
export function fillForecastForm(form) {
  const values = {};
  const missing = [];
  const pick = (re, field) => (field.options || []).find(o => re.test(o));
  const want = [
    // A select offers the model's own regions: take APAC when listed, else the first one, as a user would.
    ['region', /区域|地区|region/i, f => (f.type === 'select' ? pick(/apac|亚太/i, f) ?? f.options?.[0] : 'APAC')],
    ['quarters', /季度|quarter|期数|周期/i, f => (f.type === 'select' ? pick(/^\D*4\D*$|四/, f) : 4)],
    ['scenario', /情景|场景|scenario/i, f => (f.type === 'select' ? pick(/乐观|optimistic/i, f) : '乐观')],
  ];
  for (const [what, re, value] of want) {
    const field = form.fields.find(f => re.test(`${f.name} ${f.label}`));
    const v = field && value(field);
    if (v === undefined) missing.push(what);
    else values[field.name] = v;
  }
  const regionField = form.fields.find(f => /区域|地区|region/i.test(`${f.name} ${f.label}`));
  for (const f of form.fields) {
    if (f.name in values) continue;
    if (f.type === 'checkbox') values[f.name] = false;
    else if (f.type === 'select' && f.options?.length) values[f.name] = f.options[0];
    else if (f.default !== undefined) values[f.name] = f.default;
  }
  return { values, missing, region: regionField ? String(values[regionField.name]) : undefined };
}
