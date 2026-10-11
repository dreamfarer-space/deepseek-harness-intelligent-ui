import { validateTree } from '../../src/catalog/catalog.js';
import { validateWidget } from '../../src/tools/widget.js';

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
    for (const child of node.children || []) visit(child);
  };
  visit(args.root);
  return nodes;
}

export function checkNativeCase(id, args) {
  const nodes = renderedNodes(args);
  const has = (type, predicate = () => true) => nodes.some(n => n.type === type && predicate(n.props));
  const checks = {
    B1: () => has('Stat') && has('Chart'),
    B2: () => has('Table', p => p.sortable === true && p.rows.length > 0),
    B3: () => has('Chart', p => p.kind === 'bar' && p.labels.length === 4 && p.series.length >= 2),
    B4: () => has('Form', p => p.fields.some(f => f.type === 'range') && p.fields.some(f => f.type === 'checkbox')),
    B5: () => has('Timeline', p => p.items.length > 0),
    C2: () => has('Plot', p => p.params?.length >= 3),
  };
  return checks[id]?.() ? null : `${id}: requested rendered components or controls are missing`;
}

export function toolHistory(prompt, message, checked) {
  return [
    { role: 'user', content: prompt },
    { role: 'assistant', content: message.content || null, tool_calls: message.tool_calls },
    ...checked.map(({ call, name }) => ({
      role: 'tool', tool_call_id: call.id, name,
      content: JSON.stringify({ ok: true, summary: 'UI displayed (schema validated by evaluation).' }),
    })),
  ];
}

export function incorporatesSubmission(message, checked) {
  const text = [message.content || '', ...checked.map(c => JSON.stringify(c.args))].join('\n');
  return /apac/i.test(text) && /(?:\b4\b|四)/.test(text) && /optimistic|乐观/i.test(text);
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
