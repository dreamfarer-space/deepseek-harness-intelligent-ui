/**
 * Declarative component catalog shared by the Host tool (`ui_render`
 * validation) and the browser renderer (per-node validation while streaming).
 *
 * The DSH tool-schema subset has no `$ref`/recursion, so a UI tree travels as a
 * flat node list: `{ root, components: [{ id, type, props, children }] }`.
 * Each catalog entry declares its props with a tiny spec language checked by
 * {@link validateProps}; `children` says whether the node may own children.
 * @module deepseek-harness-intelligent-ui/catalog
 */

import { checkExpression, FUNCTIONS } from './expr.js';

/** Tone vocabulary shared by text-ish components. */
const TONES = ['default', 'muted', 'info', 'success', 'warning', 'error'];

/** Field kinds a Form may contain. */
export const FORM_FIELD_TYPES = ['text', 'number', 'range', 'select', 'checkbox', 'date', 'textarea'];

/** Chart kinds the SVG renderer draws. */
export const CHART_KINDS = ['bar', 'line', 'area', 'pie'];

/** Upper bounds that keep one card renderable and the tool result small. */
export const LIMITS = Object.freeze({
  components: 300,
  depth: 24,
  tableRows: 500,
  tableColumns: 24,
  chartPoints: 500,
  chartSeries: 12,
  formFields: 40,
  text: 20000,
  plotFunctions: 8,
  plotParams: 8,
  timelineItems: 100,
});

/**
 * Prop spec language: `{ type, required?, values?, items?, max?, min? }` where
 * type is one of string | number | boolean | scalar | enum | array | object | any.
 * `scalar` accepts string, number, boolean or null.
 */
export const CATALOG = Object.freeze({
  Card: {
    description: 'Bordered container with optional title/subtitle/footer; children stack vertically.',
    children: true,
    props: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      footer: { type: 'string' },
    },
  },
  Stack: {
    description: 'Lays out children vertically (default) or horizontally.',
    children: true,
    props: {
      direction: { type: 'enum', values: ['vertical', 'horizontal'] },
      gap: { type: 'number', min: 0, max: 64 },
      wrap: { type: 'boolean' },
      align: { type: 'enum', values: ['start', 'center', 'end', 'stretch'] },
    },
  },
  Grid: {
    description: 'Responsive grid; `columns` is the column count on wide screens (1-6).',
    children: true,
    props: { columns: { type: 'number', required: true, min: 1, max: 6 } },
  },
  Tabs: {
    description: 'Tabbed panels: labels[i] titles children[i].',
    children: true,
    props: { labels: { type: 'array', required: true, items: { type: 'string' }, max: 12 } },
  },
  Text: {
    description: 'Text with a markdown subset (**bold**, *italic*, `code`, [link](https://...), line breaks).',
    children: false,
    props: {
      text: { type: 'string', required: true, max: LIMITS.text },
      variant: { type: 'enum', values: ['body', 'title', 'heading', 'caption'] },
      tone: { type: 'enum', values: TONES },
    },
  },
  Code: {
    description: 'Monospaced code block.',
    children: false,
    props: {
      code: { type: 'string', required: true, max: LIMITS.text },
      language: { type: 'string' },
    },
  },
  Alert: {
    description: 'Callout box with a tone.',
    children: false,
    props: {
      title: { type: 'string' },
      text: { type: 'string', required: true },
      tone: { type: 'enum', values: TONES },
    },
  },
  Badge: {
    description: 'Small inline label.',
    children: false,
    props: { text: { type: 'string', required: true }, tone: { type: 'enum', values: TONES } },
  },
  Divider: { description: 'Horizontal rule.', children: false, props: {} },
  Stat: {
    description: 'KPI tile: label, big value, optional delta with trend.',
    children: false,
    props: {
      label: { type: 'string', required: true },
      value: { type: 'scalar', required: true },
      delta: { type: 'string' },
      trend: { type: 'enum', values: ['up', 'down', 'flat'] },
      hint: { type: 'string' },
    },
  },
  Progress: {
    description: 'Progress bar; value out of max (default 100).',
    children: false,
    props: {
      value: { type: 'number', required: true },
      max: { type: 'number', min: 0 },
      label: { type: 'string' },
      tone: { type: 'enum', values: TONES },
    },
  },
  List: {
    description: 'Bulleted or numbered list of short markdown-subset strings.',
    children: false,
    props: {
      items: { type: 'array', required: true, items: { type: 'string' }, max: 200 },
      ordered: { type: 'boolean' },
    },
  },
  Table: {
    description: 'Data table. rows[i][j] belongs to columns[j]. Click-to-sort when sortable.',
    children: false,
    props: {
      columns: { type: 'array', required: true, items: { type: 'string' }, max: LIMITS.tableColumns },
      rows: {
        type: 'array', required: true, max: LIMITS.tableRows,
        items: { type: 'array', items: { type: 'scalar' }, max: LIMITS.tableColumns },
      },
      caption: { type: 'string' },
      sortable: { type: 'boolean' },
    },
  },
  Chart: {
    description: 'SVG chart. labels are the x categories (pie: slice names); each series has one value per label.',
    children: false,
    props: {
      kind: { type: 'enum', required: true, values: CHART_KINDS },
      labels: { type: 'array', required: true, items: { type: 'scalar' }, max: LIMITS.chartPoints },
      series: {
        type: 'array', required: true, max: LIMITS.chartSeries,
        items: {
          type: 'object',
          props: {
            name: { type: 'string', required: true },
            values: { type: 'array', required: true, items: { type: 'number' }, max: LIMITS.chartPoints },
          },
        },
      },
      title: { type: 'string' },
      unit: { type: 'string' },
      stacked: { type: 'boolean' },
      height: { type: 'number', min: 120, max: 600 },
    },
  },
  Button: {
    description: 'Button that, when the user clicks it, sends `prompt` back to you as the user\'s next message.',
    children: false,
    props: {
      label: { type: 'string', required: true },
      prompt: { type: 'string', required: true },
      variant: { type: 'enum', values: ['primary', 'secondary'] },
    },
  },
  Form: {
    description: 'Input form. On submit the values are sent back to you as the user\'s next message (prefixed by `prompt` when given).',
    children: false,
    props: {
      title: { type: 'string' },
      submitLabel: { type: 'string' },
      prompt: { type: 'string' },
      fields: {
        type: 'array', required: true, max: LIMITS.formFields,
        items: {
          type: 'object',
          props: {
            name: { type: 'string', required: true },
            label: { type: 'string', required: true },
            type: { type: 'enum', required: true, values: FORM_FIELD_TYPES },
            options: { type: 'array', items: { type: 'string' }, max: 100 },
            required: { type: 'boolean' },
            placeholder: { type: 'string' },
            default: { type: 'scalar' },
            min: { type: 'number' },
            max: { type: 'number' },
            step: { type: 'number', min: 0 },
          },
        },
      },
    },
  },
  Timeline: {
    description: 'Vertical timeline of events/steps in order.',
    children: false,
    props: {
      items: {
        type: 'array', required: true, max: LIMITS.timelineItems,
        items: {
          type: 'object',
          props: {
            title: { type: 'string', required: true },
            time: { type: 'string' },
            text: { type: 'string' },
            tone: { type: 'enum', values: TONES },
          },
        },
      },
    },
  },
  Plot: {
    description: 'Function plot y = f(x) drawn natively. `params` become sliders the user drags; the curves update instantly in the browser (no message to you). Expressions use x, the param names, pi, e, + - * / ^, and functions like sin, cos, exp, ln, sqrt, abs.',
    children: false,
    props: {
      functions: {
        type: 'array', required: true, max: LIMITS.plotFunctions,
        items: { type: 'object', props: { expr: { type: 'string', required: true, max: 500 }, label: { type: 'string' } } },
      },
      xMin: { type: 'number' },
      xMax: { type: 'number' },
      yMin: { type: 'number' },
      yMax: { type: 'number' },
      params: {
        type: 'array', max: LIMITS.plotParams,
        items: {
          type: 'object',
          props: {
            name: { type: 'string', required: true },
            label: { type: 'string' },
            min: { type: 'number', required: true },
            max: { type: 'number', required: true },
            step: { type: 'number', min: 0 },
            value: { type: 'number', required: true },
          },
        },
      },
      title: { type: 'string' },
      xLabel: { type: 'string' },
      yLabel: { type: 'string' },
      height: { type: 'number', min: 160, max: 600 },
    },
  },
  Math: {
    description: 'LaTeX math typeset with KaTeX (block by default). Put related equations in one node (e.g. \\begin{aligned}...\\end{aligned}). In JSON, escape each backslash (\\\\frac).',
    children: false,
    props: {
      tex: { type: 'string', required: true, max: 5000 },
      display: { type: 'boolean' },
    },
  },
  Mermaid: {
    description: 'Diagram from Mermaid source (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, timeline, mindmap, pie).',
    children: false,
    props: {
      code: { type: 'string', required: true, max: LIMITS.text },
    },
  },
});

/** Component type names in catalog order. */
export const COMPONENT_TYPES = Object.freeze(Object.keys(CATALOG));

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function describe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Check one value against a prop spec.
 * @param {unknown} value
 * @param {object} spec
 * @param {string} path - error path prefix.
 * @param {string[]} errors - collected messages (mutated).
 */
function checkValue(value, spec, path, errors) {
  switch (spec.type) {
    case 'any':
      return;
    case 'string':
      if (typeof value !== 'string') { errors.push(`${path}: expected string, got ${describe(value)}`); return; }
      if (spec.max !== undefined && value.length > spec.max) errors.push(`${path}: longer than ${spec.max} characters`);
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) { errors.push(`${path}: expected finite number, got ${describe(value)}`); return; }
      if (spec.min !== undefined && value < spec.min) errors.push(`${path}: must be >= ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) errors.push(`${path}: must be <= ${spec.max}`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${describe(value)}`);
      return;
    case 'scalar':
      if (!(value === null || ['string', 'number', 'boolean'].includes(typeof value))) {
        errors.push(`${path}: expected string, number, boolean or null, got ${describe(value)}`);
      }
      return;
    case 'enum':
      if (!spec.values.includes(value)) errors.push(`${path}: expected one of ${spec.values.join(' | ')}, got ${JSON.stringify(value)}`);
      return;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: expected array, got ${describe(value)}`); return; }
      if (spec.max !== undefined && value.length > spec.max) { errors.push(`${path}: more than ${spec.max} items`); return; }
      if (spec.items) value.forEach((item, i) => checkValue(item, spec.items, `${path}[${i}]`, errors));
      return;
    case 'object':
      if (!isPlainObject(value)) { errors.push(`${path}: expected object, got ${describe(value)}`); return; }
      checkProps(value, spec.props || {}, path, errors);
      return;
    default:
      errors.push(`${path}: unknown spec type ${spec.type}`);
  }
}

function checkProps(props, specs, path, errors) {
  for (const [key, spec] of Object.entries(specs)) {
    const v = props[key];
    if (v === undefined) {
      if (spec.required) errors.push(`${path}.${key}: required`);
      continue;
    }
    checkValue(v, spec, `${path}.${key}`, errors);
  }
  for (const key of Object.keys(props)) {
    if (!(key in specs)) errors.push(`${path}.${key}: unknown prop`);
  }
}

/**
 * Cross-field rules the spec language cannot express.
 * @param {string} type
 * @param {Record<string, unknown>} props
 * @param {string} path
 * @param {string[]} errors
 */
function checkSemantics(type, props, path, errors) {
  if (type === 'Chart' && Array.isArray(props.labels) && Array.isArray(props.series)) {
    props.series.forEach((s, i) => {
      if (isPlainObject(s) && Array.isArray(s.values) && s.values.length !== props.labels.length) {
        errors.push(`${path}.series[${i}].values: has ${s.values.length} values but labels has ${props.labels.length}`);
      }
    });
    if (props.kind === 'pie' && props.series.length > 1) errors.push(`${path}.series: a pie chart takes exactly one series`);
  }
  if (type === 'Form' && Array.isArray(props.fields)) {
    const seen = new Set();
    props.fields.forEach((f, i) => {
      if (!isPlainObject(f)) return;
      if (seen.has(f.name)) errors.push(`${path}.fields[${i}].name: duplicate field name ${JSON.stringify(f.name)}`);
      seen.add(f.name);
      if (f.type === 'select' && (!Array.isArray(f.options) || f.options.length === 0)) {
        errors.push(`${path}.fields[${i}].options: a select field needs options`);
      }
      if (f.type === 'range' && !(typeof f.min === 'number' && typeof f.max === 'number' && f.min < f.max)) {
        errors.push(`${path}.fields[${i}]: a range field needs numeric min < max`);
      }
    });
  }
  if (type === 'Plot') checkPlot(props, path, errors);
}

const IDENT = /^[A-Za-z_][A-Za-z_0-9]*$/;
const RESERVED = new Set(['x', 'pi', 'e', 'tau', ...Object.keys(FUNCTIONS)]);

function checkPlot(props, path, errors) {
  const xMin = typeof props.xMin === 'number' ? props.xMin : -10;
  const xMax = typeof props.xMax === 'number' ? props.xMax : 10;
  if (!(xMin < xMax)) errors.push(`${path}: xMin must be less than xMax`);
  if (typeof props.yMin === 'number' && typeof props.yMax === 'number' && !(props.yMin < props.yMax)) {
    errors.push(`${path}: yMin must be less than yMax`);
  }
  const names = [];
  if (Array.isArray(props.params)) {
    props.params.forEach((pr, i) => {
      if (!isPlainObject(pr) || typeof pr.name !== 'string') return;
      const at = `${path}.params[${i}]`;
      if (!IDENT.test(pr.name)) errors.push(`${at}.name: must be an identifier like "a" or "omega"`);
      else if (RESERVED.has(pr.name)) errors.push(`${at}.name: "${pr.name}" is reserved`);
      else if (names.includes(pr.name)) errors.push(`${at}.name: duplicate parameter "${pr.name}"`);
      names.push(pr.name);
      if (typeof pr.min === 'number' && typeof pr.max === 'number') {
        if (!(pr.min < pr.max)) errors.push(`${at}: min must be less than max`);
        else if (typeof pr.value === 'number' && (pr.value < pr.min || pr.value > pr.max)) errors.push(`${at}.value: must lie within [min, max]`);
      }
    });
  }
  if (Array.isArray(props.functions)) {
    props.functions.forEach((f, i) => {
      if (!isPlainObject(f) || typeof f.expr !== 'string') return;
      const problem = checkExpression(f.expr, ['x', ...names]);
      if (problem) errors.push(`${path}.functions[${i}].expr: ${problem}`);
    });
  }
}

/**
 * Validate one node's props against its catalog entry.
 * @param {string} type - component type.
 * @param {unknown} props - raw props (undefined counts as `{}`).
 * @param {string} [path] - error path prefix.
 * @returns {string[]} error messages; empty when valid.
 */
export function validateProps(type, props, path = 'props') {
  const entry = CATALOG[type];
  if (!entry) return [`${path}: unknown component type ${JSON.stringify(type)}; use one of ${COMPONENT_TYPES.join(', ')}`];
  const p = props === undefined ? {} : props;
  if (!isPlainObject(p)) return [`${path}: expected object, got ${describe(p)}`];
  const errors = [];
  checkProps(p, entry.props, path, errors);
  checkSemantics(type, p, path, errors);
  return errors;
}

/**
 * Validate a whole `ui_render` payload: node shape, ids, references, cycles,
 * single parent, depth, and per-type props.
 * @param {unknown} args - tool arguments.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], types: Record<string, number>, count: number }}
 */
export function validateTree(args) {
  const errors = [];
  const warnings = [];
  const types = {};
  if (!isPlainObject(args)) return { ok: false, errors: ['arguments: expected object'], warnings, types, count: 0 };
  const { root, components } = args;
  if (args.title !== undefined && typeof args.title !== 'string') errors.push('title: expected string');
  if (typeof root !== 'string' || root === '') errors.push('root: expected the id of the top-level component');
  if (!Array.isArray(components) || components.length === 0) {
    errors.push('components: expected a non-empty array');
    return { ok: false, errors, warnings, types, count: 0 };
  }
  if (components.length > LIMITS.components) errors.push(`components: more than ${LIMITS.components} nodes`);

  const byId = new Map();
  components.forEach((node, i) => {
    const at = `components[${i}]`;
    if (!isPlainObject(node)) { errors.push(`${at}: expected object`); return; }
    if (typeof node.id !== 'string' || node.id === '') { errors.push(`${at}.id: expected non-empty string`); return; }
    if (byId.has(node.id)) { errors.push(`${at}.id: duplicate id ${JSON.stringify(node.id)}`); return; }
    byId.set(node.id, node);
    if (isPlainObject(node.props) && 'children' in node.props) {
      if (node.children === undefined && Array.isArray(node.props.children)) {
        node.children = node.props.children;
      }
      delete node.props.children;
    }
    const entry = CATALOG[node.type];
    types[node.type] = (types[node.type] || 0) + 1;
    errors.push(...validateProps(node.type, node.props, `${at}(${node.id}).props`));
    if (node.children !== undefined) {
      if (!Array.isArray(node.children) || node.children.some(c => typeof c !== 'string')) {
        errors.push(`${at}(${node.id}).children: expected array of component ids`);
      } else if (entry && !entry.children && node.children.length > 0) {
        errors.push(`${at}(${node.id}).children: ${node.type} cannot have children`);
      }
    }
    for (const key of Object.keys(node)) {
      if (!['id', 'type', 'props', 'children'].includes(key)) errors.push(`${at}(${node.id}).${key}: unknown field`);
    }
  });

  const parentOf = new Map();
  for (const node of byId.values()) {
    if (!Array.isArray(node.children)) continue;
    for (const child of node.children) {
      if (!byId.has(child)) { errors.push(`${node.id}.children: unknown id ${JSON.stringify(child)}`); continue; }
      if (child === root) { errors.push(`${node.id}.children: the root ${JSON.stringify(root)} cannot be a child`); continue; }
      if (parentOf.has(child)) { errors.push(`${child}: has two parents (${parentOf.get(child)} and ${node.id})`); continue; }
      parentOf.set(child, node.id);
    }
  }

  if (typeof root === 'string' && root !== '' && !byId.has(root)) errors.push(`root: unknown id ${JSON.stringify(root)}`);

  // Reachability with cycle and depth detection.
  if (byId.has(root)) {
    const reached = new Set();
    const walk = (id, depth, trail) => {
      if (trail.has(id)) { errors.push(`cycle through ${JSON.stringify(id)}`); return; }
      if (depth > LIMITS.depth) { errors.push(`nesting deeper than ${LIMITS.depth} at ${JSON.stringify(id)}`); return; }
      if (reached.has(id)) return;
      reached.add(id);
      const node = byId.get(id);
      if (!node || !Array.isArray(node.children)) return;
      trail.add(id);
      for (const child of node.children) if (byId.has(child)) walk(child, depth + 1, trail);
      trail.delete(id);
    };
    walk(root, 0, new Set());
    const orphans = [...byId.keys()].filter(id => !reached.has(id));
    if (orphans.length > 0) warnings.push(`not reachable from root (not rendered): ${orphans.join(', ')}`);
  }

  for (const t of byId.values()) {
    if (t.type !== 'Tabs' || !isPlainObject(t.props) || !Array.isArray(t.props.labels)) continue;
    const n = Array.isArray(t.children) ? t.children.length : 0;
    if (n !== t.props.labels.length) errors.push(`${t.id}: Tabs has ${t.props.labels.length} labels but ${n} children`);
  }

  return { ok: errors.length === 0, errors, warnings, types, count: byId.size };
}

/**
 * One-line catalog reference for the model (tool description / guidance).
 * @returns {string}
 */
export function catalogReference() {
  const fmt = (specs) => Object.entries(specs).map(([k, s]) => {
    let t = s.type;
    if (s.type === 'enum') t = s.values.join('|');
    else if (s.type === 'array') t = s.items ? (s.items.type === 'object' ? `[{${fmt(s.items.props)}}]` : `${s.items.type === 'array' ? `${s.items.items.type}[]` : s.items.type}[]`) : 'array';
    return `${k}${s.required ? '' : '?'}: ${t}`;
  }).join(', ');
  return COMPONENT_TYPES.map((name) => {
    const e = CATALOG[name];
    return `- ${name}${e.children ? ' (children)' : ''} {${fmt(e.props)}}: ${e.description}`;
  }).join('\n');
}
