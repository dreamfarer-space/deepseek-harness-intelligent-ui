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
import { extensionEntry, extensionTypes } from './extensions.js';
import { validateSchema } from '../controlled/runtime.js';

const DATA_REF = { type: 'object', props: { id: { type: 'string', required: true, max: 100 }, scope: { type: 'string', required: true, max: 200 } } };
const ACTION = { type: 'object', props: { actionId: { type: 'string', required: true, max: 100 }, args: { type: 'any', required: true } } };

/** Tone vocabulary shared by text-ish components. */
const TONES = ['default', 'muted', 'info', 'success', 'warning', 'error'];

/** Field kinds a Form may contain. */
export const FORM_FIELD_TYPES = ['text', 'number', 'range', 'select', 'checkbox', 'date', 'textarea'];

/** Value kinds a Table column can be sorted and filtered as. */
export const COLUMN_TYPES = ['text', 'number', 'date', 'boolean'];

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
  choiceOptions: 8,
  scatterPoints: 2000,
  heatmapAxis: 60,
  diffFiles: 20,
  diffChars: 200_000,
  treeEntries: 2000,
  jsonChars: 100_000,
  jsonDepth: 32,
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
    description: 'Data table / data grid. rows[i][j] belongs to columns[j]. Optional local, model-free interactions: sortable (typed: numbers, ISO 8601 dates `YYYY-MM-DD[THH:mm]`, booleans; empty values last), searchable, filterable (per-column contains / min-max range), pageSize, exportable (CSV/Markdown of the filtered rows). columnTypes overrides inferred types. Or use a host-registered dataRef for shared local search/filter/sort/paging.',
    children: false,
    props: {
      dataRef: DATA_REF,
      pageSize: { type: 'number', min: 1, max: 100 },
      columnTypes: { type: 'array', max: LIMITS.tableColumns, items: { type: 'enum', values: COLUMN_TYPES } },
      searchable: { type: 'boolean' },
      filterable: { type: 'boolean' },
      exportable: { type: 'boolean' },
      columns: { type: 'array', items: { type: 'string' }, max: LIMITS.tableColumns },
      rows: {
        type: 'array', max: LIMITS.tableRows,
        items: { type: 'array', items: { type: 'scalar' }, max: LIMITS.tableColumns },
      },
      caption: { type: 'string' },
      sortable: { type: 'boolean' },
    },
  },
  Chart: {
    description: 'SVG chart. Use dataRef with labelColumn and valueColumns (zero-based) for local linked data; otherwise labels are the x categories (pie: slice names); each series has one value per label.',
    children: false,
    props: {
      kind: { type: 'enum', required: true, values: CHART_KINDS },
      dataRef: DATA_REF,
      labelColumn: { type: 'number', min: 0, max: 23 },
      valueColumns: { type: 'array', max: 12, items: { type: 'number', min: 0, max: 23 } },
      labels: { type: 'array', items: { type: 'scalar' }, max: LIMITS.chartPoints },
      series: {
        type: 'array', max: LIMITS.chartSeries,
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
      exportable: { type: 'boolean' },
    },
  },
  Scatter: {
    description: 'Scatter plot of real numeric observations: each point has continuous x and y (not category indexes). Use for correlation/distribution between two measures. Points with a null coordinate are hidden and counted. Hover, tap or arrow keys show a point; legend toggles series.',
    children: false,
    props: {
      series: {
        type: 'array', required: true, max: LIMITS.chartSeries,
        items: {
          type: 'object',
          props: {
            name: { type: 'string', required: true },
            points: {
              type: 'array', required: true, max: LIMITS.scatterPoints,
              items: { type: 'object', props: { x: { type: 'scalar', required: true }, y: { type: 'scalar', required: true }, label: { type: 'string', max: 200 } } },
            },
          },
        },
      },
      title: { type: 'string' },
      xLabel: { type: 'string' },
      yLabel: { type: 'string' },
      xUnit: { type: 'string' },
      yUnit: { type: 'string' },
      height: { type: 'number', min: 160, max: 600 },
    },
  },
  Heatmap: {
    description: 'Matrix heatmap: values[r][c] belongs to yLabels[r] × xLabels[c]. Use null for missing data (drawn hatched, never as 0). scale "diverging" centres on 0 (negative red, positive blue); default "sequential". Optional fixed min/max.',
    children: false,
    props: {
      xLabels: { type: 'array', required: true, items: { type: 'scalar' }, max: LIMITS.heatmapAxis },
      yLabels: { type: 'array', required: true, items: { type: 'scalar' }, max: LIMITS.heatmapAxis },
      values: { type: 'array', required: true, max: LIMITS.heatmapAxis, items: { type: 'array', items: { type: 'scalar' }, max: LIMITS.heatmapAxis } },
      title: { type: 'string' },
      unit: { type: 'string' },
      scale: { type: 'enum', values: ['sequential', 'diverging'] },
      min: { type: 'number' },
      max: { type: 'number' },
      showValues: { type: 'boolean' },
    },
  },
  CodeDiff: {
    description: 'Read-only code diff viewer for one or more files: give each file before/after full text (the diff is computed, unchanged runs collapse to expandable context) or a unified diff `patch`. Shows line numbers and +/- counts; large files start collapsed. Content is shown as text, never executed. For displaying changes, not applying them.',
    children: false,
    props: {
      title: { type: 'string' },
      context: { type: 'number', min: 0, max: 20 },
      files: {
        type: 'array', required: true, max: LIMITS.diffFiles,
        items: {
          type: 'object',
          props: {
            path: { type: 'string', required: true, max: 500 },
            before: { type: 'string', max: LIMITS.diffChars },
            after: { type: 'string', max: LIMITS.diffChars },
            patch: { type: 'string', max: LIMITS.diffChars },
            language: { type: 'string', max: 40 },
          },
        },
      },
    },
  },
  FileTree: {
    description: 'Collapsible file/directory tree built from slash-separated paths (a trailing / marks an empty directory), with optional per-entry status (added/modified/deleted/renamed) and short note. Labels only: nothing is read from disk.',
    children: false,
    props: {
      title: { type: 'string' },
      expandDepth: { type: 'number', min: 0, max: 32 },
      entries: {
        type: 'array', required: true, max: LIMITS.treeEntries,
        items: {
          type: 'object',
          props: {
            path: { type: 'string', required: true, max: 500 },
            status: { type: 'enum', values: ['added', 'modified', 'deleted', 'renamed'] },
            note: { type: 'string', max: 200 },
          },
        },
      },
    },
  },
  JsonView: {
    description: 'Collapsible JSON tree for any JSON value (`data`), with per-node path ($.a[0].b) and copy path / copy value. Use to inspect API responses, configs or tool output.',
    children: false,
    props: {
      data: { type: 'any', required: true },
      title: { type: 'string' },
      expandDepth: { type: 'number', min: 0, max: 32 },
    },
  },
  Button: {
    description: 'Button sends prompt on explicit user click: sessionTarget defaults to current; new starts an independent Agent session in the same workspace. Or invokes a host-registered action {actionId,args}. Never invent action ids.',
    children: false,
    props: {
      label: { type: 'string', required: true },
      prompt: { type: 'string' },
      sessionTarget: { type: 'enum', values: ['current', 'new'] },
      action: ACTION,
      variant: { type: 'enum', values: ['primary', 'secondary'] },
    },
  },
  Choice: {
    description: 'Single-choice question card: radio options plus "Continue in this session" and "Start new session" buttons. The picked option prompt is sent on click; a new session inherits the workspace but NOT this conversation, so every option prompt must be self-contained.',
    children: false,
    props: {
      question: { type: 'string', required: true },
      options: {
        type: 'array', required: true, max: LIMITS.choiceOptions,
        items: {
          type: 'object',
          props: {
            label: { type: 'string', required: true },
            description: { type: 'string' },
            prompt: { type: 'string', required: true },
          },
        },
      },
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

export function componentEntry(type) {
  return Object.hasOwn(CATALOG, type) ? CATALOG[type] : extensionEntry(type);
}
export function componentTypes() { return [...COMPONENT_TYPES, ...extensionTypes()]; }
export function validateComponentVersion(type, version) {
  const entry = extensionEntry(type);
  if (entry && version !== entry.version) return [`componentVersion: ${type} requires ${entry.version}`];
  if (!entry && version !== undefined) return ['componentVersion: only registered extensions accept a version'];
  return [];
}

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
  if (type === 'Table' || type === 'Chart') {
    const inline = type === 'Table' ? ['columns', 'rows'] : ['labels', 'series'];
    if (props.dataRef !== undefined) {
      if (inline.some(k => props[k] !== undefined)) errors.push(`${path}: dataRef cannot be mixed with inline data`);
      if (type === 'Chart' && (!Number.isInteger(props.labelColumn) || !Array.isArray(props.valueColumns) || !props.valueColumns.length || props.valueColumns.some(n => !Number.isInteger(n)))) errors.push(`${path}: bound Chart needs integer labelColumn and valueColumns`);
      if (type === 'Chart' && props.kind === 'pie' && Array.isArray(props.valueColumns) && props.valueColumns.length !== 1) errors.push(`${path}: bound pie chart needs exactly one value column`);
    } else if (inline.some(k => props[k] === undefined)) errors.push(`${path}: needs ${inline.join(' and ')} or dataRef`);
    if (props.pageSize !== undefined && !Number.isInteger(props.pageSize)) errors.push(`${path}.pageSize: expected integer`);
    if (Array.isArray(props.columnTypes) && Array.isArray(props.columns) && props.columnTypes.length > props.columns.length) errors.push(`${path}.columnTypes: has ${props.columnTypes.length} entries but columns has ${props.columns.length}`);
    if (type === 'Table' && props.dataRef !== undefined && (props.searchable || props.filterable)) errors.push(`${path}: searchable/filterable apply to inline rows; a dataRef table already has shared search and filter`);
  }
  if (type === 'Button' && ((props.prompt === undefined) === (props.action === undefined))) errors.push(`${path}: needs exactly one of prompt or action`);
  if (type === 'Button' && props.sessionTarget !== undefined && props.action !== undefined) errors.push(`${path}.sessionTarget: only supported with prompt`);
  if (type === 'Choice' && Array.isArray(props.options) && props.options.length < 2) errors.push(`${path}.options: needs at least 2 options`);

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
  if (type === 'Scatter' && Array.isArray(props.series)) {
    let total = 0;
    props.series.forEach((ser, si) => {
      if (!isPlainObject(ser) || !Array.isArray(ser.points)) return;
      total += ser.points.length;
      ser.points.forEach((pt, pi) => {
        if (!isPlainObject(pt)) return;
        for (const k of ['x', 'y']) {
          const v = pt[k];
          if (v !== null && !(typeof v === 'number' && Number.isFinite(v))) errors.push(`${path}.series[${si}].points[${pi}].${k}: expected a finite number or null`);
        }
      });
    });
    if (total > LIMITS.scatterPoints) errors.push(`${path}.series: ${total} points in total; at most ${LIMITS.scatterPoints}`);
  }
  if (type === 'CodeDiff' && Array.isArray(props.files)) {
    let total = 0;
    props.files.forEach((f, i) => {
      if (!isPlainObject(f)) return;
      const hasPatch = f.patch !== undefined;
      if (hasPatch && (f.before !== undefined || f.after !== undefined)) errors.push(`${path}.files[${i}]: use either patch or before/after, not both`);
      if (!hasPatch && f.before === undefined && f.after === undefined) errors.push(`${path}.files[${i}]: needs before/after text or a patch`);
      for (const k of ['before', 'after', 'patch']) if (typeof f[k] === 'string') total += f[k].length;
    });
    if (total > LIMITS.diffChars) errors.push(`${path}.files: ${total} characters in total; at most ${LIMITS.diffChars}`);
  }
  if (type === 'JsonView' && props.data !== undefined) {
    let json;
    try { json = JSON.stringify(props.data); } catch { json = undefined; }
    if (json === undefined) errors.push(`${path}.data: must be a JSON value`);
    else if (json.length > LIMITS.jsonChars) errors.push(`${path}.data: ${json.length} characters; at most ${LIMITS.jsonChars}`);
    else if (jsonDepth(props.data) > LIMITS.jsonDepth) errors.push(`${path}.data: nested deeper than ${LIMITS.jsonDepth} levels`);
  }
  if (type === 'Heatmap' && Array.isArray(props.values) && Array.isArray(props.xLabels) && Array.isArray(props.yLabels)) {
    if (props.values.length !== props.yLabels.length) errors.push(`${path}.values: has ${props.values.length} rows but yLabels has ${props.yLabels.length}`);
    props.values.forEach((row, r) => {
      if (!Array.isArray(row)) return;
      if (row.length !== props.xLabels.length) errors.push(`${path}.values[${r}]: has ${row.length} values but xLabels has ${props.xLabels.length}`);
      row.forEach((v, c) => { if (v !== null && !(typeof v === 'number' && Number.isFinite(v))) errors.push(`${path}.values[${r}][${c}]: expected a finite number or null`); });
    });
    if (typeof props.min === 'number' && typeof props.max === 'number' && !(props.min < props.max)) errors.push(`${path}: min must be less than max`);
  }
}

function jsonDepth(v, d = 0) {
  if (d > LIMITS.jsonDepth) return d;
  if (v === null || typeof v !== 'object') return d;
  let max = d + 1;
  for (const c of Array.isArray(v) ? v : Object.values(v)) max = Math.max(max, jsonDepth(c, d + 1));
  return max;
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
  const entry = componentEntry(type);
  if (!entry) return [`${path}: unknown component type ${JSON.stringify(type)}; use one of ${componentTypes().join(', ')}`];
  const p = props === undefined ? {} : props;
  if (!isPlainObject(p)) return [`${path}: expected object, got ${describe(p)}`];
  const errors = [];
  if (entry.propsSchema) {
    try { validateSchema(entry.propsSchema, p); } catch (error) { errors.push(`${path}: ${error.message}`); }
    return errors;
  }
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
    if (Object.hasOwn(CATALOG, node.type) && isPlainObject(node.props) && 'children' in node.props) {
      if (node.children === undefined && Array.isArray(node.props.children)) {
        node.children = node.props.children;
      }
      delete node.props.children;
    }
    const entry = componentEntry(node.type);
    types[node.type] = (types[node.type] || 0) + 1;
    errors.push(...validateProps(node.type, node.props, `${at}(${node.id}).props`));
    errors.push(...validateComponentVersion(node.type, node.componentVersion).map(e => `${at}(${node.id}).${e}`));
    if (node.children !== undefined) {
      if (!Array.isArray(node.children) || node.children.some(c => typeof c !== 'string')) {
        errors.push(`${at}(${node.id}).children: expected array of component ids`);
      } else if (entry && !entry.children && node.children.length > 0) {
        errors.push(`${at}(${node.id}).children: ${node.type} cannot have children`);
      }
    }
    for (const key of Object.keys(node)) {
      if (!['id', 'type', 'componentVersion', 'props', 'children'].includes(key)) errors.push(`${at}(${node.id}).${key}: unknown field`);
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
    else if (s.type === 'object') t = `{${fmt(s.props || {})}}`;
    else if (s.type === 'array') t = s.items ? (s.items.type === 'object' ? `[{${fmt(s.items.props)}}]` : `${s.items.type === 'array' ? `${s.items.items.type}[]` : s.items.type}[]`) : 'array';
    return `${k}${s.required ? '' : '?'}: ${t}`;
  }).join(', ');
  return componentTypes().map((name) => {
    const e = componentEntry(name);
    if (e.propsSchema) return `- ${name} (componentVersion: ${e.version}${e.children ? ', children' : ''}) propsSchema=${JSON.stringify(e.propsSchema)}: ${e.description}${e.actions.length ? `; allowed host actionIds: ${e.actions.join(', ')}` : ''}`;
    return `- ${name}${e.children ? ' (children)' : ''} {${fmt(e.props)}}: ${e.description}`;
  }).join('\n');
}
