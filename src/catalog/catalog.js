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
import { COMPUTED_ID, computedIdProblem, COMPUTED_FORMATS } from './computed.js';
import { extensionEntry, extensionTypes } from './extensions.js';
import { validateSchema } from '../controlled/runtime.js';
import { embedSource, PROVIDER_NAMES, videoPlatform } from './video.js';

const DATA_REF = { type: 'object', props: { id: { type: 'string', required: true, max: 100 }, scope: { type: 'string', required: true, max: 200 } } };
const ACTION = { type: 'object', props: { actionId: { type: 'string', required: true, max: 100 }, args: { type: 'any', required: true } } };

/** Tone vocabulary shared by text-ish components. */
const TONES = ['default', 'muted', 'info', 'success', 'warning', 'error'];

/** Field kinds a Form may contain. */
export const FORM_FIELD_TYPES = ['text', 'number', 'range', 'select', 'checkbox', 'switch', 'tags', 'daterange', 'date', 'textarea'];

/** Value kinds a Table column can be sorted and filtered as. */
/** `string` is accepted as an alias of `text`: models often write it. */
export const COLUMN_TYPES = ['text', 'number', 'date', 'boolean', 'string'];

/** Chart kinds the SVG renderer draws. */
export const CHART_KINDS = ['bar', 'hbar', 'line', 'area', 'pie', 'radar'];

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
  accordionItems: 24,
  stepsItems: 24,
  keyValueItems: 100,
  followUpItems: 6,
  sourceItems: 20,
  segmentedOptions: 12,
  calendarEvents: 300,
  calendarDays: 31,
  scatterPoints: 2000,
  heatmapAxis: 60,
  diffFiles: 20,
  diffChars: 200_000,
  treeEntries: 2000,
  jsonChars: 100_000,
  jsonDepth: 32,
  mapMarkers: 500,
  mapRoutes: 50,
  mapRoutePoints: 1000,
  mapTotalRoutePoints: 5000,
  galleryImages: 24,
  urlChars: 2048,
  computed: 64,
});

/** Identifier rule for names the model invents (Plot params, `bindKey`, computed ids). */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(['x', 'pi', 'e', 'tau', ...Object.keys(FUNCTIONS)]);

/** A computed reference in a numeric prop slot: `{"$computed": "total"}`. */
const COMPUTED_REF = {
  type: 'object',
  label: '{"$computed": "id"}',
  props: {
    $computed: {
      type: 'string', required: true, max: 64, pattern: COMPUTED_ID,
      expect: 'expected the id of a computed entry (letters, digits, "_")',
    },
  },
};

/**
 * A slot that takes a literal number or a computed reference. `expect` is the
 * wording used in errors, `label` the wording used by {@link catalogReference}.
 */
const numberOrComputed = (expect) => ({
  type: 'union',
  label: 'number',
  expect,
  anyOf: [{ type: 'number' }, COMPUTED_REF],
});

const scalarOrComputed = (expect) => ({
  type: 'union',
  label: 'scalar',
  expect,
  anyOf: [{ type: 'scalar' }, COMPUTED_REF],
});

const FORM_DEFAULT_SPEC = {
  type: 'union',
  label: 'scalar',
  expect: 'string, number, boolean, null, string[] (for tags) or {start?: string, end?: string} (for daterange)',
  anyOf: [
    { type: 'scalar' },
    { type: 'array', max: 50, items: { type: 'string', max: 100 } },
    { type: 'object', props: { start: { type: 'string', max: 40 }, end: { type: 'string', max: 40 } } },
  ],
};

/** Field key a form value is bound to in the computed scope. */
const BIND_KEY = {
  type: 'string', max: 64, pattern: IDENT,
  expect: 'expected a field key like "qty" (letters, digits, "_")',
};

/** Media sources and credit links: absolute https URLs (no credentials), checked in {@link checkSemantics}. */
const URL_SPEC = { type: 'string', max: LIMITS.urlChars };
const PHOTO_PROPS = {
  src: { ...URL_SPEC, required: true },
  alt: { type: 'string', required: true, max: 500 },
  caption: { type: 'string', max: 1000 },
  credit: { type: 'string', max: 300 },
  creditUrl: URL_SPEC,
};

/**
 * Why `value` is not an absolute https URL without embedded credentials, or
 * undefined when it is one.
 * @param {unknown} value
 */
export function httpsUrlProblem(value) {
  if (typeof value !== 'string') return undefined;
  let url;
  try { url = new URL(value); } catch { return 'expected an absolute https:// URL'; }
  if (url.protocol !== 'https:') return `expected an https:// URL, got ${url.protocol}`;
  if (url.username || url.password) return 'must not contain credentials';
  return undefined;
}

/**
 * Prop spec language: `{ type, required?, values?, items?, max?, min?, pattern?, anyOf?, label?, expect? }`
 * where type is one of string | number | boolean | scalar | enum | array | object | union | any.
 * `scalar` accepts string, number, boolean or null; `union` accepts the first
 * matching spec in `anyOf`; `pattern` constrains identifiers.
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
    props: {
      columns: { type: 'number', required: true, min: 1, max: 6 },
      gap: { type: 'number', min: 0, max: 64 },
    },
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
    description: 'Progress bar; value out of max (default 100). `value` may be a computed reference {"$computed":"id"} instead of a literal number.',
    children: false,
    props: {
      value: { ...numberOrComputed('finite number'), required: true },
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
      filterField: { type: 'string', max: 200 },
      filterValue: { type: 'string', max: 500 },
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
            values: {
              type: 'array', required: true, max: LIMITS.chartPoints,
              items: { type: 'union', label: 'number', anyOf: [{ type: 'number' }, COMPUTED_REF] },
            },
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
  Map: {
    description: 'Geographic map of real places: markers at WGS84 lat/lon degrees (look the coordinates up; never guess), optional routes as [lat, lon] point lists drawn as straight segments (an itinerary sketch, not road directions; set dashed when illustrative). Pan, zoom, tap a marker for its note. Works offline with a built-in world outline; uses the Host tile basemap when configured. group colours markers and adds a legend.',
    children: false,
    props: {
      markers: {
        type: 'array', max: LIMITS.mapMarkers,
        items: {
          type: 'object',
          props: {
            id: { type: 'string', required: true, max: 100 },
            lat: { type: 'number', required: true, min: -90, max: 90 },
            lon: { type: 'number', required: true, min: -180, max: 180 },
            label: { type: 'string', required: true, max: 200 },
            group: { type: 'string', max: 100 },
            note: { type: 'string', max: 1000 },
          },
        },
      },
      routes: {
        type: 'array', max: LIMITS.mapRoutes,
        items: {
          type: 'object',
          props: {
            points: { type: 'array', required: true, max: LIMITS.mapRoutePoints, items: { type: 'array', items: { type: 'number' } } },
            label: { type: 'string', max: 200 },
            dashed: { type: 'boolean' },
          },
        },
      },
      title: { type: 'string' },
      center: { type: 'object', props: { lat: { type: 'number', required: true, min: -90, max: 90 }, lon: { type: 'number', required: true, min: -180, max: 180 } } },
      zoom: { type: 'number', min: 0, max: 18 },
      height: { type: 'number', min: 200, max: 640 },
      selected: { type: 'string', max: 100 },
      basemap: { type: 'enum', values: ['auto', 'outline'] },
    },
  },
  Image: {
    description: 'One photo or picture from an absolute https URL that you know exists (given by the user, a tool result or a page you read); never invent or guess image URLs. alt describes the picture (shown if it cannot load); credit/creditUrl name the author, source or license. Tap opens a full-size viewer.',
    children: false,
    props: {
      ...PHOTO_PROPS,
      height: { type: 'number', min: 80, max: 800 },
      fit: { type: 'enum', values: ['cover', 'contain'] },
    },
  },
  Gallery: {
    description: 'Grid of 1–24 photos (same rules as Image) with a full-size viewer: tap a photo, then arrow keys or buttons step through them. Use for destinations, products, comparisons of several pictures.',
    children: false,
    props: {
      images: { type: 'array', required: true, max: LIMITS.galleryImages, items: { type: 'object', props: PHOTO_PROPS } },
      title: { type: 'string' },
      columns: { type: 'number', min: 1, max: 6 },
    },
  },
  Video: {
    description: 'One video: a YouTube, Bilibili or Vimeo page link (played in the official embed player after the user presses play) or a direct https .mp4/.webm file. Only links you have actually seen (user, tool result, page); never invent video ids. start skips to a second; poster is an https image. Always shows a link to open the original.',
    children: false,
    props: {
      src: { ...URL_SPEC, required: true },
      title: { type: 'string', max: 300 },
      poster: URL_SPEC,
      caption: { type: 'string', max: 1000 },
      credit: { type: 'string', max: 300 },
      creditUrl: URL_SPEC,
      start: { type: 'number', min: 0, max: 86400 },
      aspectRatio: { type: 'enum', values: ['16:9', '4:3', '1:1', '9:16'] },
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
    description: 'Single or multi-choice decision card with 2-8 options. Selection is local; the primary action continues in the current session and an optional secondary action starts a new session. Set sessionTarget only for an explicitly chosen fixed destination. Give options stable ids; recommended marks an id without selecting it. Set multiple:true for multi-select (with optional minSelect/maxSelect) and variant:"chips" for compact pills. Every prompt must preserve user constraints and be self-contained for a new session. New-session retries retain the first confirmed task. No registered actions.',
    children: false,
    props: {
      question: { type: 'string', required: true, max: 300 },
      submitLabel: { type: 'string', max: 200 },
      sessionTarget: { type: 'enum', values: ['current', 'new'] },
      recommended: { type: 'string', max: 100 },
      multiple: { type: 'boolean' },
      minSelect: { type: 'number', min: 1, max: LIMITS.choiceOptions },
      maxSelect: { type: 'number', min: 1, max: LIMITS.choiceOptions },
      variant: { type: 'enum', values: ['cards', 'chips'] },
      options: {
        type: 'array', required: true, max: LIMITS.choiceOptions,
        items: { type: 'object', props: {
          id: { type: 'string', max: 100 },
          label: { type: 'string', required: true, max: 200 },
          description: { type: 'string', max: 1200 },
          prompt: { type: 'string', required: true, max: LIMITS.text },
        } },
      },
    },
  },
  Form: {
    description: 'Input form. Submit sends all field values prefixed by prompt. sessionTarget defaults to current; new creates an independent session in the same workspace and submits automatically. For new, prompt must contain complete task context and user constraints; conversation history is not copied. bindKey (on the form or a field) names the value in the computed scope; a field without bindKey binds to its name. A form-level bindKey only applies to a single-field form; give each field its own bindKey otherwise.',
    children: false,
    props: {
      title: { type: 'string' },
      submitLabel: { type: 'string' },
      prompt: { type: 'string' },
      sessionTarget: { type: 'enum', values: ['current', 'new'] },
      bindKey: BIND_KEY,
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
            default: FORM_DEFAULT_SPEC,
            min: { type: 'number' },
            max: { type: 'number' },
            step: { type: 'number', min: 0 },
            maxTags: { type: 'number', min: 1, max: 50 },
            searchable: { type: 'boolean' },
            bindKey: BIND_KEY,
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
  Accordion: {
    description: 'Collapsible sections; items[i] titles children[i] (when children are given) or renders inline items[i].text. Local expand/collapse survives patches and reloads.',
    children: true,
    props: {
      title: { type: 'string' },
      multiple: { type: 'boolean' },
      items: {
        type: 'array', required: true, max: LIMITS.accordionItems,
        items: {
          type: 'object',
          props: {
            id: { type: 'string', max: 100 },
            title: { type: 'string', required: true, max: 300 },
            subtitle: { type: 'string', max: 500 },
            text: { type: 'string', max: LIMITS.text },
            badge: { type: 'string', max: 100 },
            tone: { type: 'enum', values: TONES },
            defaultOpen: { type: 'boolean' },
          },
        },
      },
    },
  },
  Steps: {
    description: 'Step-by-step progress or workflow tracker with per-step status (done/active/pending/error) or zero-based `current` index.',
    children: false,
    props: {
      title: { type: 'string' },
      current: { type: 'number', min: 0, max: 23 },
      items: {
        type: 'array', required: true, max: LIMITS.stepsItems,
        items: {
          type: 'object',
          props: {
            id: { type: 'string', max: 100 },
            title: { type: 'string', required: true, max: 300 },
            description: { type: 'string', max: 2000 },
            status: { type: 'enum', values: ['done', 'active', 'pending', 'error'] },
          },
        },
      },
    },
  },
  KeyValue: {
    description: 'Compact key-value specification grid (1-3 columns) with optional per-item hint, tone and one-click copy.',
    children: false,
    props: {
      title: { type: 'string' },
      columns: { type: 'number', min: 1, max: 3 },
      items: {
        type: 'array', required: true, max: LIMITS.keyValueItems,
        items: {
          type: 'object',
          props: {
            key: { type: 'string', required: true, max: 200 },
            value: { ...scalarOrComputed('string, number, boolean or null'), required: true },
            hint: { type: 'string', max: 500 },
            tone: { type: 'enum', values: TONES },
            copyable: { type: 'boolean' },
          },
        },
      },
    },
  },
  EmptyState: {
    description: 'Standardized empty or uninitialized state callout with optional next-step action button.',
    children: false,
    props: {
      title: { type: 'string', required: true, max: 300 },
      description: { type: 'string', max: 2000 },
      tone: { type: 'enum', values: TONES },
      actionLabel: { type: 'string', max: 200 },
      prompt: { type: 'string', max: LIMITS.text },
      sessionTarget: { type: 'enum', values: ['current', 'new'] },
      action: ACTION,
    },
  },
  FollowUp: {
    description: 'Lightweight closing follow-up suggestion chips (1-6 items); clicking a chip sends its prompt immediately.',
    children: false,
    props: {
      title: { type: 'string', max: 200 },
      items: {
        type: 'array', required: true, max: LIMITS.followUpItems,
        items: {
          type: 'object',
          props: {
            id: { type: 'string', max: 100 },
            label: { type: 'string', required: true, max: 200 },
            prompt: { type: 'string', required: true, max: LIMITS.text },
            sessionTarget: { type: 'enum', values: ['current', 'new'] },
          },
        },
      },
    },
  },
  Sources: {
    description: 'Structured citation list of https web links or plain-text literature/document references (never accesses local files).',
    children: false,
    props: {
      title: { type: 'string', max: 200 },
      items: {
        type: 'array', required: true, max: LIMITS.sourceItems,
        items: {
          type: 'object',
          props: {
            id: { type: 'string', max: 100 },
            title: { type: 'string', required: true, max: 300 },
            url: URL_SPEC,
            source: { type: 'string', max: 200 },
            note: { type: 'string', max: 500 },
          },
        },
      },
    },
  },
  Segmented: {
    description: 'Local segmented control (2-12 options) that updates shared state via `bindKey` to drive computed values, Charts or Table filters without calling the model.',
    children: false,
    props: {
      label: { type: 'string', max: 200 },
      title: { type: 'string', max: 200 },
      bindKey: BIND_KEY,
      defaultValue: { type: 'scalar' },
      options: {
        type: 'array', required: true, max: LIMITS.segmentedOptions,
        items: {
          type: 'object',
          props: {
            value: { type: 'scalar', required: true },
            label: { type: 'string', required: true, max: 200 },
          },
        },
      },
    },
  },
  Calendar: {
    description: 'Read-only schedule view (day, week or agenda) with explicit IANA timeZone; events are positioned by real duration with overlap splitting and local detail inspection.',
    children: false,
    props: {
      title: { type: 'string', max: 300 },
      view: { type: 'enum', values: ['day', 'week', 'agenda'] },
      timeZone: { type: 'string', required: true, max: 100 },
      start: { type: 'string', max: 40 },
      events: {
        type: 'array', required: true, max: LIMITS.calendarEvents,
        items: {
          type: 'object',
          props: {
            id: { type: 'string', required: true, max: 100 },
            title: { type: 'string', required: true, max: 300 },
            start: { type: 'string', required: true, max: 40 },
            end: { type: 'string', required: true, max: 40 },
            group: { type: 'string', max: 100 },
            note: { type: 'string', max: 1000 },
            location: { type: 'string', max: 200 },
          },
        },
      },
    },
  },
  Audio: {
    description: 'One audio clip from an absolute https URL you have actually seen (governed by mediaAllowedOrigins); never invent audio URLs.',
    children: false,
    props: {
      src: { ...URL_SPEC, required: true },
      title: { type: 'string', max: 300 },
      caption: { type: 'string', max: 1000 },
      credit: { type: 'string', max: 300 },
      creditUrl: URL_SPEC,
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

const PROTOTYPE_KEYS = new Set([
  '__proto__', 'constructor', 'toString', 'hasOwnProperty',
  'valueOf', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
]);

/**
 * Harmless decorative layout/style props frequently emitted by models migrating
 * from other UI libraries (e.g. Divider.orientation, Grid.gap, Card.variant,
 * Table.striped/compact/bordered). When not a declared prop of a built-in
 * component, they are ignored and reported as warnings rather than rejecting
 * the entire UI response.
 */
export const DECORATIVE_PROPS = new Set([
  'orientation', 'gap', 'rowGap', 'columnGap', 'variant', 'align', 'justify',
  'size', 'compact', 'bordered', 'striped', 'hoverable', 'padding', 'margin',
  'dashed', 'icon',
]);

/** Harmless comment/note fields emitted by models on blocks or component nodes. */
export const HARMLESS_NOTES = new Set([
  'blocks_note', 'block_note', 'note', '_note', 'comment', '_comment',
]);

/** Guidance shown when a leaf component is mistakenly given `children`. */
const CHILDREN_HINTS = Object.freeze({
  Timeline: 'use props.items: [{title: string, time?: string, text?: string, tone?: default|muted|info|success|warning|error}]',
  Steps: 'use props.items: [{title: string, description?: string, status?: done|active|pending|error}]',
  KeyValue: 'use props.items: [{key: string, value: scalar, hint?: string, tone?: string, copyable?: boolean}]',
  EmptyState: 'use props.title, props.description and optional props.actionLabel + props.prompt',
  FollowUp: 'use props.items: [{label: string, prompt: string, sessionTarget?: current|new}]',
  Sources: 'use props.items: [{title: string, url?: string, source?: string, note?: string}]',
  Segmented: 'use props.options: [{value: scalar, label: string}]',
  Calendar: 'use props.events: [{id: string, title: string, start: string, end: string}]',
  List: 'use props.items: string[]',
  Table: 'use props.columns: string[] and props.rows: scalar[][] (or props.dataRef)',
  Choice: 'use props.options: [{id?: string, label: string, description?: string, prompt: string}]',
  Form: 'use props.fields: [{name: string, label: string, type: string, ...}]',
  Gallery: 'use props.images: [{src: string, alt: string, caption?: string}]',
  Chart: 'use props.labels: scalar[] and props.series: [{name: string, values: number[]}] (or props.dataRef)',
  default: 'container types that accept children are Card, Stack, Grid, Tabs, Accordion',
});

function specTypeSummary(s) {
  if (!s) return 'any';
  if (s.label !== undefined) return s.label;
  if (s.type === 'enum') return s.values.join(' | ');
  if (s.type === 'union') return (s.anyOf ?? []).map(specTypeSummary).join(' | ');
  if (s.type === 'object') return `{${formatSpecFields(s.props || {})}}`;
  if (s.type === 'array') {
    if (!s.items) return 'array';
    return s.items.type === 'object' ? `[{${formatSpecFields(s.items.props || {})}}]` : `${specTypeSummary(s.items)}[]`;
  }
  return s.type;
}

function formatSpecFields(specs) {
  return Object.entries(specs)
    .map(([k, s]) => `${k}${s.required ? '' : '?'}: ${specTypeSummary(s)}`)
    .join(', ');
}

export function formatAllowedProps(specs) {
  const keys = Object.keys(specs || {});
  if (keys.length === 0) return 'accepts no props';
  return `{${formatSpecFields(specs)}}`;
}

function propHint(type, path, key, specs) {
  if (type === 'Choice' && path.includes('.options[') && key === 'sessionTarget') {
    return `sessionTarget belongs on Choice.props (all options share one target); option props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Form' && path.includes('.fields[') && key === 'sessionTarget') {
    return `sessionTarget belongs on Form.props (all fields share one target); field props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'KeyValue' && path.includes('.items[') && key === 'label') {
    return `did you mean items[i].key? KeyValue item props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Steps' && path.includes('.items[') && (key === 'text' || key === 'subtitle')) {
    return `did you mean items[i].description? Steps item props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'EmptyState' && key === 'text') {
    return `did you mean props.description? EmptyState props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'FollowUp' && key === 'options') {
    return `FollowUp uses props.items: [{label, prompt, sessionTarget?}]; FollowUp props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Sources' && (key === 'sources' || key === 'links')) {
    return `Sources uses props.items: [{id?, title, url?, source?, note?}]; Sources props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Segmented' && key === 'items') {
    return `Segmented uses props.options: [{value, label}]; Segmented props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Alert' && key === 'items') {
    return `Alert uses props.text (string), or change type to "List" for props.items; Alert props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Table' && (key === 'items' || key === 'data')) {
    return `Table uses props.columns (string[]) and props.rows (scalar[][]) or props.dataRef; Table props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Timeline' && (key === 'events' || key === 'steps' || key === 'data' || key === 'children')) {
    return `Timeline uses props.items: [{title, time?, text?, tone?}]; Timeline props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Text' && (key === 'content' || key === 'value' || key === 'label')) {
    return `did you mean props.text? Text props are ${formatAllowedProps(specs)}`;
  }
  if ((type === 'Code' || type === 'Mermaid') && (key === 'text' || key === 'content' || key === 'source')) {
    return `did you mean props.code? ${type} props are ${formatAllowedProps(specs)}`;
  }
  if (type === 'Math' && (key === 'text' || key === 'code' || key === 'latex' || key === 'formula' || key === 'expr')) {
    return `did you mean props.tex? Math props are ${formatAllowedProps(specs)}`;
  }
  if (Object.keys(specs || {}).length === 0) {
    return `${type || 'Component'} accepts no props`;
  }
  return `allowed: ${formatAllowedProps(specs)}`;
}

/**
 * Check one value against a prop spec.
 * @param {unknown} value
 * @param {object} spec
 * @param {string} path - error path prefix.
 * @param {string[]} errors - collected messages (mutated).
 * @param {{ type?: string, warnings?: string[], lenient?: boolean }} [ctx]
 */
function checkValue(value, spec, path, errors, ctx) {
  switch (spec.type) {
    case 'any':
      return;
    case 'string':
      if (typeof value !== 'string') { errors.push(`${path}: expected string, got ${describe(value)}`); return; }
      if (spec.max !== undefined && value.length > spec.max) errors.push(`${path}: longer than ${spec.max} characters`);
      if (spec.pattern instanceof RegExp && !spec.pattern.test(value)) {
        errors.push(`${path}: ${spec.expect ?? `must match ${spec.pattern}`}, got ${JSON.stringify(value)}`);
      }
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
      if (spec.items) value.forEach((item, i) => checkValue(item, spec.items, `${path}[${i}]`, errors, ctx));
      return;
    case 'object':
      if (!isPlainObject(value)) { errors.push(`${path}: expected object, got ${describe(value)}`); return; }
      checkProps(value, spec.props || {}, path, errors, ctx, false);
      return;
    case 'union': {
      for (const sub of spec.anyOf ?? []) {
        const subErrors = [];
        checkValue(value, sub, path, subErrors, ctx);
        if (subErrors.length === 0) return;
      }
      if (isPlainObject(value) && Object.hasOwn(value, '$computed') && typeof value.$computed !== 'string') {
        errors.push(`${path}.$computed: expected the id of a computed entry (letters, digits, "_")`);
        return;
      }
      if (isPlainObject(value) && typeof value.$computed === 'string') {
        // They wrote a computed reference; report its own problems (extra keys, bad id).
        const refSpec = (spec.anyOf ?? []).find(sub => sub.type === 'object' && Object.hasOwn(sub.props || {}, '$computed'));
        if (refSpec) { checkValue(value, refSpec, path, errors, ctx); return; }
      }
      const expected = spec.expect ?? (spec.anyOf ?? []).map(sub => sub.label ?? sub.type).join(' or ');
      errors.push(`${path}: expected ${expected}, got ${describe(value)}`);
      return;
    }
    default:
      errors.push(`${path}: unknown spec type ${spec.type}`);
  }
}

function checkProps(props, specs, path, errors, ctx, isTopLevelProps = false) {
  for (const [key, spec] of Object.entries(specs)) {
    const v = props[key];
    if (v === undefined) {
      if (spec.required) {
        if (isTopLevelProps && ctx?.type === 'Alert' && key === 'text' && Array.isArray(props.items)) {
          errors.push(`${path}.text: required — Alert requires props.text (string); join items into props.text or use List for props.items`);
        } else {
          const schemaSuffix = isTopLevelProps && ctx?.type ? `; ${ctx.type} props: ${formatAllowedProps(specs)}` : '';
          errors.push(`${path}.${key}: required (expected ${specTypeSummary(spec)}${schemaSuffix})`);
        }
      }
      continue;
    }
    checkValue(v, spec, `${path}.${key}`, errors, ctx);
  }
  for (const key of Object.keys(props)) {
    // Own properties only: `key in specs` would accept `__proto__`,
    // `constructor` and `toString` from the prototype chain, so a JSON
    // `__proto__` prop (which JSON.parse creates as an own key) passed
    // validation and then became the prototype of the resolved props.
    if (Object.hasOwn(specs, key)) continue;
    if (PROTOTYPE_KEYS.has(key)) {
      errors.push(`${path}.${key}: unknown prop — ${propHint(ctx?.type, path, key, specs)}`);
      continue;
    }
    if (isTopLevelProps && Object.hasOwn(CATALOG, ctx?.type) && DECORATIVE_PROPS.has(key)) {
      ctx?.warnings?.push(`${path}.${key}: decorative prop ${JSON.stringify(key)} is not used by ${ctx.type} and was ignored`);
      continue;
    }
    if (ctx?.type === 'Timeline' && /\.items\[\d+\]$/.test(path) && (key === 'id' || key === 'key')) {
      ctx?.warnings?.push(`${path}.${key}: decorative prop ${JSON.stringify(key)} on Timeline item was ignored`);
      continue;
    }
    if (HARMLESS_NOTES.has(key)) {
      ctx?.warnings?.push(`${path}.${key}: ignored note field ${JSON.stringify(key)}`);
      continue;
    }
    errors.push(`${path}.${key}: unknown prop — ${propHint(ctx?.type, path, key, specs)}`);
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
  if (type === 'Table' && props.filterValue !== undefined && props.filterField === undefined) {
    errors.push(`${path}.filterValue: needs filterField (the column name it filters)`);
  }
  if (type === 'Table' && props.filterField !== undefined && props.dataRef === undefined && Array.isArray(props.columns)
    && !props.columns.includes(props.filterField)) {
    errors.push(`${path}.filterField: must name one of columns`);
  }
  if (type === 'Form' && props.sessionTarget === 'new' && (typeof props.prompt !== 'string' || !props.prompt.trim())) errors.push(`${path}.prompt: new session needs a non-empty task prompt`);
  if (type === 'Choice') {
    for (const name of ['question', 'submitLabel']) {
      if (typeof props[name] === 'string' && !props[name].trim()) errors.push(`${path}.${name}: must not be blank`);
    }
    if (props.minSelect !== undefined && !Number.isInteger(props.minSelect)) errors.push(`${path}.minSelect: expected integer`);
    if (props.maxSelect !== undefined && !Number.isInteger(props.maxSelect)) errors.push(`${path}.maxSelect: expected integer`);
    if ((props.minSelect !== undefined || props.maxSelect !== undefined) && !props.multiple) {
      errors.push(`${path}: minSelect and maxSelect require multiple: true`);
    }
    if (typeof props.minSelect === 'number' && typeof props.maxSelect === 'number' && props.minSelect > props.maxSelect) {
      errors.push(`${path}: minSelect must be <= maxSelect`);
    }
    if (Array.isArray(props.options)) {
      if (props.options.length < 2) errors.push(`${path}.options: needs at least 2 options`);
      if (typeof props.minSelect === 'number' && props.minSelect > props.options.length) {
        errors.push(`${path}.minSelect: exceeds options length (${props.options.length})`);
      }
      const ids = new Set();
      props.options.forEach((option, i) => {
        if (!isPlainObject(option)) return;
        for (const name of ['id', 'label', 'prompt']) {
          if (typeof option[name] === 'string' && !option[name].trim()) errors.push(`${path}.options[${i}].${name}: must not be blank`);
        }
        if (option.id !== undefined && ids.has(option.id)) errors.push(`${path}.options[${i}].id: duplicate option id`);
        if (option.id !== undefined) ids.add(option.id);
      });
      if (props.recommended !== undefined && !ids.has(props.recommended)) errors.push(`${path}.recommended: must reference an option id`);
    }
  }

  if (type === 'Chart' && Array.isArray(props.labels) && Array.isArray(props.series)) {
    if (props.kind === 'radar' && props.labels.length < 3) {
      errors.push(`${path}.labels: a radar chart needs at least 3 labels`);
    }
    props.series.forEach((s, i) => {
      if (isPlainObject(s) && Array.isArray(s.values) && s.values.length !== props.labels.length) {
        errors.push(`${path}.series[${i}].values: has ${s.values.length} values but labels has ${props.labels.length}`);
      }
    });
    if (props.kind === 'pie' && props.series.length > 1) errors.push(`${path}.series: a pie chart takes exactly one series`);
  }
  if (type === 'Form' && Array.isArray(props.fields)) {
    const seen = new Set();
    const binds = new Set();
    props.fields.forEach((f, i) => {
      if (!isPlainObject(f)) return;
      if (seen.has(f.name)) errors.push(`${path}.fields[${i}].name: duplicate field name ${JSON.stringify(f.name)}`);
      seen.add(f.name);
      if (f.bindKey !== undefined) {
        if (binds.has(f.bindKey)) errors.push(`${path}.fields[${i}].bindKey: duplicate bindKey ${JSON.stringify(f.bindKey)}`);
        binds.add(f.bindKey);
      }
      if (f.type === 'select' && (!Array.isArray(f.options) || f.options.length === 0)) {
        errors.push(`${path}.fields[${i}].options: a select field needs options`);
      }
      if (f.type === 'range' && !(typeof f.min === 'number' && typeof f.max === 'number' && f.min < f.max)) {
        errors.push(`${path}.fields[${i}]: a range field needs numeric min < max`);
      }
      if (f.maxTags !== undefined) {
        if (f.type !== 'tags') errors.push(`${path}.fields[${i}].maxTags: only supported on a tags field`);
        else if (!Number.isInteger(f.maxTags)) errors.push(`${path}.fields[${i}].maxTags: expected integer`);
      }
      if (f.searchable !== undefined && f.type !== 'select') {
        errors.push(`${path}.fields[${i}].searchable: only supported on a select field`);
      }
      if (f.type === 'tags' && f.default !== undefined && f.default !== null) {
        const cap = typeof f.maxTags === 'number' ? f.maxTags : 20;
        if (Array.isArray(f.default)) {
          if (f.default.length > cap) {
            errors.push(`${path}.fields[${i}].default: has ${f.default.length} tags, exceeding maxTags (${cap})`);
          }
        } else if (typeof f.default === 'string') {
          const parts = f.default.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          if (parts.length > cap) {
            errors.push(`${path}.fields[${i}].default: has ${parts.length} tags, exceeding maxTags (${cap})`);
          }
        } else {
          errors.push(`${path}.fields[${i}].default: expected string[] or string for tags field`);
        }
      } else if (Array.isArray(f.default) && f.type !== 'tags') {
        errors.push(`${path}.fields[${i}].default: array default is only valid for tags fields`);
      }
      if (isPlainObject(f.default)) {
        if (f.type !== 'daterange') errors.push(`${path}.fields[${i}].default: object default is only valid for daterange fields`);
        else if (typeof f.default.start === 'string' && typeof f.default.end === 'string' && f.default.start && f.default.end && f.default.start > f.default.end) {
          errors.push(`${path}.fields[${i}].default: start must be <= end`);
        }
      }
    });
  }
  if (type === 'Accordion' && Array.isArray(props.items)) {
    if (!props.items.length) errors.push(`${path}.items: needs at least 1 item`);
    const ids = new Set();
    props.items.forEach((it, i) => {
      if (!isPlainObject(it)) return;
      if (typeof it.title === 'string' && !it.title.trim()) errors.push(`${path}.items[${i}].title: must not be blank`);
      if (it.id !== undefined) {
        if (typeof it.id === 'string' && !it.id.trim()) errors.push(`${path}.items[${i}].id: must not be blank`);
        else if (ids.has(it.id)) errors.push(`${path}.items[${i}].id: duplicate item id ${JSON.stringify(it.id)}`);
        ids.add(it.id);
      }
    });
  }
  if (type === 'Steps' && Array.isArray(props.items)) {
    if (!props.items.length) errors.push(`${path}.items: needs at least 1 step`);
    if (props.current !== undefined) {
      if (!Number.isInteger(props.current)) errors.push(`${path}.current: expected integer`);
      else if (props.items.length > 0 && props.current >= props.items.length) {
        errors.push(`${path}.current: must be < items.length (${props.items.length})`);
      }
    }
    const ids = new Set();
    props.items.forEach((it, i) => {
      if (!isPlainObject(it)) return;
      if (typeof it.title === 'string' && !it.title.trim()) errors.push(`${path}.items[${i}].title: must not be blank`);
      if (it.id !== undefined) {
        if (typeof it.id === 'string' && !it.id.trim()) errors.push(`${path}.items[${i}].id: must not be blank`);
        else if (ids.has(it.id)) errors.push(`${path}.items[${i}].id: duplicate step id ${JSON.stringify(it.id)}`);
        ids.add(it.id);
      }
    });
  }
  if (type === 'KeyValue') {
    if (props.columns !== undefined && !Number.isInteger(props.columns)) errors.push(`${path}.columns: expected integer`);
    if (Array.isArray(props.items)) {
      if (!props.items.length) errors.push(`${path}.items: needs at least 1 item`);
      props.items.forEach((it, i) => {
        if (isPlainObject(it) && typeof it.key === 'string' && !it.key.trim()) {
          errors.push(`${path}.items[${i}].key: must not be blank`);
        }
      });
    }
  }
  if (type === 'EmptyState') {
    if (typeof props.title === 'string' && !props.title.trim()) errors.push(`${path}.title: must not be blank`);
    if (props.prompt !== undefined && props.action !== undefined) errors.push(`${path}: cannot use both prompt and action`);
    if ((props.prompt !== undefined || props.action !== undefined) && (typeof props.actionLabel !== 'string' || !props.actionLabel.trim())) {
      errors.push(`${path}.actionLabel: required when prompt or action is set`);
    }
    if (props.actionLabel !== undefined && props.prompt === undefined && props.action === undefined) {
      errors.push(`${path}.actionLabel: requires prompt or action`);
    }
    if (props.sessionTarget !== undefined && props.prompt === undefined) {
      errors.push(`${path}.sessionTarget: only supported with prompt`);
    }
  }
  if (type === 'FollowUp' && Array.isArray(props.items)) {
    if (!props.items.length) errors.push(`${path}.items: needs at least 1 item`);
    const ids = new Set();
    props.items.forEach((it, i) => {
      if (!isPlainObject(it)) return;
      for (const k of ['id', 'label', 'prompt']) {
        if (typeof it[k] === 'string' && !it[k].trim()) errors.push(`${path}.items[${i}].${k}: must not be blank`);
      }
      if (it.id !== undefined && ids.has(it.id)) errors.push(`${path}.items[${i}].id: duplicate item id ${JSON.stringify(it.id)}`);
      if (it.id !== undefined) ids.add(it.id);
    });
  }
  if (type === 'Sources' && Array.isArray(props.items)) {
    if (!props.items.length) errors.push(`${path}.items: needs at least 1 source`);
    const ids = new Set();
    props.items.forEach((it, i) => {
      if (!isPlainObject(it)) return;
      for (const k of ['id', 'title']) {
        if (typeof it[k] === 'string' && !it[k].trim()) errors.push(`${path}.items[${i}].${k}: must not be blank`);
      }
      if (it.id !== undefined && ids.has(it.id)) errors.push(`${path}.items[${i}].id: duplicate source id ${JSON.stringify(it.id)}`);
      if (it.id !== undefined) ids.add(it.id);
      if (it.url !== undefined) {
        const problem = httpsUrlProblem(it.url);
        if (problem) errors.push(`${path}.items[${i}].url: ${problem}`);
      }
    });
  }
  if (type === 'Segmented' && Array.isArray(props.options)) {
    if (props.options.length < 2) errors.push(`${path}.options: needs at least 2 options`);
    const vals = new Set();
    const rawVals = [];
    props.options.forEach((opt, i) => {
      if (!isPlainObject(opt)) return;
      if (typeof opt.label === 'string' && !opt.label.trim()) errors.push(`${path}.options[${i}].label: must not be blank`);
      if (opt.value === null) errors.push(`${path}.options[${i}].value: must not be null`);
      else if (opt.value !== undefined) {
        const key = `${typeof opt.value}:${String(opt.value)}`;
        if (vals.has(key)) errors.push(`${path}.options[${i}].value: duplicate option value ${JSON.stringify(opt.value)}`);
        vals.add(key);
        rawVals.push(opt.value);
      }
    });
    if (props.defaultValue !== undefined && rawVals.length > 0 && !rawVals.includes(props.defaultValue)) {
      errors.push(`${path}.defaultValue: must match one of options[].value`);
    }
  }
  if (type === 'Calendar') checkCalendar(props, path, errors);
  if (type === 'Audio') {
    for (const key of ['src', 'creditUrl']) {
      const problem = httpsUrlProblem(props[key]);
      if (problem) errors.push(`${path}.${key}: ${problem}`);
    }
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
  if (type === 'Map') checkMap(props, path, errors);
  if (type === 'Image') checkPhoto(props, path, errors);
  if (type === 'Video') {
    for (const key of ['src', 'poster', 'creditUrl']) {
      const problem = httpsUrlProblem(props[key]);
      if (problem) errors.push(`${path}.${key}: ${problem}`);
    }
    const platform = videoPlatform(props.src);
    if (platform && !embedSource(props.src)) errors.push(`${path}.src: not a playable ${PROVIDER_NAMES[platform]} video link; use the video page URL (e.g. ${platform === 'youtube' ? 'https://www.youtube.com/watch?v=<11-character id>' : platform === 'bilibili' ? 'https://www.bilibili.com/video/BV…' : 'https://vimeo.com/<number>'})`);
  }
  if (type === 'Gallery' && Array.isArray(props.images)) {
    if (!props.images.length) errors.push(`${path}.images: needs at least 1 image`);
    props.images.forEach((img, i) => { if (isPlainObject(img)) checkPhoto(img, `${path}.images[${i}]`, errors); });
    if (props.columns !== undefined && !Number.isInteger(props.columns)) errors.push(`${path}.columns: expected integer`);
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

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

function validIsoDate(datePart) {
  if (!ISO_DATE_ONLY.test(datePart)) return undefined;
  const ms = Date.parse(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== datePart) return undefined;
  return ms;
}

function parseCalendarInstant(raw, timeZone) {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (ISO_DATE_ONLY.test(s)) {
    const ms = validIsoDate(s);
    return ms !== undefined ? { ms, dateOnly: true } : undefined;
  }
  if (ISO_DATETIME.test(s)) {
    if (validIsoDate(s.slice(0, 10)) === undefined) return undefined;
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
    if (!hasOffset) {
      const ms = Date.parse(`${s}Z`);
      return Number.isFinite(ms) ? { ms, dateOnly: false } : undefined;
    }
    const utcMs = Date.parse(s);
    if (!Number.isFinite(utcMs)) return undefined;
    if (timeZone) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(new Date(utcMs));
        const get = (type) => parts.find(p => p.type === type)?.value ?? '00';
        const wallMs = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
        if (Number.isFinite(wallMs)) return { ms: wallMs, dateOnly: false };
      } catch {
        // Fall through to utcMs when timeZone is invalid (already reported above).
      }
    }
    return { ms: utcMs, dateOnly: false };
  }
  return undefined;
}

function checkCalendar(props, path, errors) {
  let validTz;
  if (typeof props.timeZone === 'string') {
    if (!props.timeZone.trim()) errors.push(`${path}.timeZone: must not be blank`);
    else {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: props.timeZone });
        validTz = props.timeZone;
      } catch {
        errors.push(`${path}.timeZone: invalid IANA time zone ${JSON.stringify(props.timeZone)} (e.g. "Asia/Shanghai", "UTC")`);
      }
    }
  }
  if (props.start !== undefined && validIsoDate(String(props.start)) === undefined) {
    errors.push(`${path}.start: expected an ISO 8601 date "YYYY-MM-DD"`);
  }
  if (!Array.isArray(props.events)) return;
  if (!props.events.length) {
    errors.push(`${path}.events: needs at least 1 event`);
    return;
  }
  const ids = new Set();
  let minMs = Infinity;
  let maxMs = -Infinity;
  props.events.forEach((ev, i) => {
    if (!isPlainObject(ev)) return;
    const at = `${path}.events[${i}]`;
    for (const k of ['id', 'title']) {
      if (typeof ev[k] === 'string' && !ev[k].trim()) errors.push(`${at}.${k}: must not be blank`);
    }
    if (typeof ev.id === 'string' && ev.id.trim()) {
      if (ids.has(ev.id)) errors.push(`${at}.id: duplicate event id ${JSON.stringify(ev.id)}`);
      ids.add(ev.id);
    }
    const start = parseCalendarInstant(ev.start, validTz);
    const end = parseCalendarInstant(ev.end, validTz);
    if (ev.start !== undefined && !start) errors.push(`${at}.start: expected ISO 8601 "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"`);
    if (ev.end !== undefined && !end) errors.push(`${at}.end: expected ISO 8601 "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"`);
    if (start && end) {
      if (start.dateOnly && end.dateOnly ? end.ms < start.ms : end.ms <= start.ms) {
        errors.push(`${at}.end: must be after start`);
      }
      minMs = Math.min(minMs, start.ms);
      maxMs = Math.max(maxMs, end.dateOnly ? end.ms + 86_400_000 : end.ms);
    }
  });
  if (Number.isFinite(minMs) && Number.isFinite(maxMs) && maxMs - minMs > LIMITS.calendarDays * 86_400_000) {
    errors.push(`${path}.events: spans more than ${LIMITS.calendarDays} days`);
  }
}

function checkPhoto(props, path, errors) {
  for (const key of ['src', 'creditUrl']) {
    const problem = httpsUrlProblem(props[key]);
    if (problem) errors.push(`${path}.${key}: ${problem}`);
  }
  if (typeof props.alt === 'string' && !props.alt.trim()) errors.push(`${path}.alt: must describe the picture`);
}

function checkMap(props, path, errors) {
  const markers = Array.isArray(props.markers) ? props.markers : [];
  const routes = Array.isArray(props.routes) ? props.routes : [];
  if (!markers.length && !routes.length) errors.push(`${path}: needs at least one marker or route`);
  const ids = new Set();
  markers.forEach((m, i) => {
    if (!isPlainObject(m) || typeof m.id !== 'string') return;
    if (!m.id.trim()) errors.push(`${path}.markers[${i}].id: must not be blank`);
    else if (ids.has(m.id)) errors.push(`${path}.markers[${i}].id: duplicate marker id ${JSON.stringify(m.id)}`);
    ids.add(m.id);
  });
  let total = 0;
  routes.forEach((r, i) => {
    if (!isPlainObject(r) || !Array.isArray(r.points)) return;
    total += r.points.length;
    if (r.points.length < 2) errors.push(`${path}.routes[${i}].points: needs at least 2 points`);
    r.points.forEach((pt, j) => {
      const at = `${path}.routes[${i}].points[${j}]`;
      if (!Array.isArray(pt) || pt.length !== 2) errors.push(`${at}: expected [lat, lon]`);
      else if (Math.abs(pt[0]) > 90 || Math.abs(pt[1]) > 180) errors.push(`${at}: [lat, lon] out of range (lat ±90, lon ±180); points are [lat, lon], not [lon, lat]`);
    });
  });
  if (total > LIMITS.mapTotalRoutePoints) errors.push(`${path}.routes: ${total} points in total; at most ${LIMITS.mapTotalRoutePoints}`);
  if (props.selected !== undefined && !ids.has(props.selected)) errors.push(`${path}.selected: must reference a marker id`);
}

function jsonDepth(v, d = 0) {
  if (d > LIMITS.jsonDepth) return d;
  if (v === null || typeof v !== 'object') return d;
  let max = d + 1;
  for (const c of Array.isArray(v) ? v : Object.values(v)) max = Math.max(max, jsonDepth(c, d + 1));
  return max;
}

/** Component types whose text is free-form content, not a computed template. */
const VERBATIM_TYPES = new Set(['Code', 'CodeDiff', 'Math', 'Mermaid', 'JsonView']);

/** `{{id}}` placeholders inside any string prop. */
const TEMPLATE_REF = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

const COMPUTED_KEYS = ['id', 'expr', 'format'];
const FORMAT_KEYS = ['style', 'currency', 'minimumFractionDigits', 'maximumFractionDigits', 'locale'];

/**
 * Validate a computed `format` object.
 * @param {unknown} format
 * @param {string} at - error path prefix (the entry, e.g. `computed[0]`).
 * @param {string[]} errors
 */
function checkComputedFormat(format, at, errors) {
  if (format === undefined) return;
  if (!isPlainObject(format)) { errors.push(`${at}.format: expected object`); return; }
  for (const key of Object.keys(format)) {
    if (!FORMAT_KEYS.includes(key)) errors.push(`${at}.format.${key}: unknown field`);
  }
  if (format.style !== undefined && !COMPUTED_FORMATS.includes(format.style)) {
    errors.push(`${at}.format.style: expected one of ${COMPUTED_FORMATS.join(' | ')}`);
  }
  if (format.currency !== undefined && (typeof format.currency !== 'string' || !/^[A-Z]{3}$/.test(format.currency))) {
    errors.push(`${at}.format.currency: expected a 3-letter ISO 4217 code like "USD"`);
  }
  for (const key of ['minimumFractionDigits', 'maximumFractionDigits']) {
    const digits = format[key];
    if (digits !== undefined && (!Number.isInteger(digits) || digits < 0 || digits > 20)) {
      errors.push(`${at}.format.${key}: expected an integer 0-20`);
    }
  }
  if (Number.isInteger(format.minimumFractionDigits) && Number.isInteger(format.maximumFractionDigits)
    && format.minimumFractionDigits > format.maximumFractionDigits) {
    errors.push(`${at}.format: minimumFractionDigits must be <= maximumFractionDigits`);
  }
  if (format.locale !== undefined && (typeof format.locale !== 'string' || !format.locale)) {
    errors.push(`${at}.format.locale: expected a locale like "en-US"`);
  }
}

/**
 * Report `{{id}}` / `{"$computed": "id"}` references that name no declared
 * computed entry, anywhere inside a node's props.
 * @param {unknown} props
 * @param {string} path
 * @param {Set<string>} ids - declared computed ids.
 * @param {string[]} errors
 * @param {number} [depth]
 * @param {Set<string>} [fieldKeys]
 */
function checkComputedRefs(props, path, ids, errors, depth = 0, fieldKeys = undefined) {
  if (depth > 8 || props === null || props === undefined) return;
  if (typeof props === 'string') {
    TEMPLATE_REF.lastIndex = 0;
    let m;
    while ((m = TEMPLATE_REF.exec(props)) !== null) {
      if (!ids.has(m[1]) && !fieldKeys?.has(m[1])) errors.push(`${path}: unknown computed id "${m[1]}" in {{${m[1]}}}`);
    }
    return;
  }
  if (Array.isArray(props)) {
    props.forEach((item, i) => checkComputedRefs(item, `${path}[${i}]`, ids, errors, depth + 1, fieldKeys));
    return;
  }
  if (!isPlainObject(props)) return;
  if (Object.hasOwn(props, '$computed')) {
    const id = props.$computed;
    if (typeof id === 'string' && !ids.has(id)) errors.push(`${path}.$computed: unknown computed id ${JSON.stringify(id)}`);
    return;
  }
  for (const [key, item] of Object.entries(props)) checkComputedRefs(item, `${path}.${key}`, ids, errors, depth + 1, fieldKeys);
}

/**
 * Validate the root-level `computed` array and the references that point at it.
 * @param {unknown} entries
 * @param {Map<string, any>} byId - nodes of the tree, for bindKey collection.
 * @param {Map<string, string>} paths
 * @param {string[]} errors
 * @param {Iterable<string>} [extraFields] - field keys published by sibling
 *   blocks of a composition: they are readable but not declared here.
 * @returns {Set<string>} declared computed ids (empty when the tree has none).
 */
function checkComputed(entries, byId, paths, errors, extraFields) {
  const ids = new Set();
  if (entries === undefined) return ids;
  if (!Array.isArray(entries)) { errors.push('computed: expected an array of { id, expr, format? }'); return ids; }
  if (entries.length > LIMITS.computed) errors.push(`computed: more than ${LIMITS.computed} entries`);

  entries.forEach((entry, i) => {
    const at = `computed[${i}]`;
    if (!isPlainObject(entry)) { errors.push(`${at}: expected object`); return; }
    for (const key of Object.keys(entry)) {
      if (!COMPUTED_KEYS.includes(key)) errors.push(`${at}.${key}: unknown field`);
    }
    const problem = computedIdProblem(entry.id);
    if (problem) errors.push(`${at}.id: ${problem}`);
    else if (ids.has(entry.id)) errors.push(`${at}.id: duplicate computed id ${JSON.stringify(entry.id)}`);
    else ids.add(entry.id);
    checkComputedFormat(entry.format, at, errors);
  });

  // Scope names a formula may read: declared computed ids plus the values a
  // Form or Segmented control binds.
  const fieldKeys = new Set(extraFields ?? []);
  for (const node of byId.values()) {
    if (!isPlainObject(node.props)) continue;
    if (node.type === 'Segmented') {
      if (typeof node.props.bindKey === 'string' && node.props.bindKey) fieldKeys.add(node.props.bindKey);
      continue;
    }
    if (node.type !== 'Form') continue;
    const fields = Array.isArray(node.props.fields) ? node.props.fields : [];
    // A form-level bindKey names the value of a single-field form only.
    if (fields.length === 1 && typeof node.props.bindKey === 'string') fieldKeys.add(node.props.bindKey);
    for (const field of fields) {
      if (!isPlainObject(field)) continue;
      if (typeof field.name === 'string' && field.name) fieldKeys.add(field.name);
      if (typeof field.bindKey === 'string' && field.bindKey) fieldKeys.add(field.bindKey);
    }
  }

  const variables = [...ids, ...fieldKeys];
  entries.forEach((entry, i) => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || !ids.has(entry.id)) return;
    if (typeof entry.expr !== 'string' || !entry.expr.trim()) {
      errors.push(`computed[${i}].expr: expected a non-empty expression string`);
      return;
    }
    if (fieldKeys.has(entry.id)) errors.push(`computed[${i}].id: "${entry.id}" is also a form field key; pick one name per value`);
    const problem = checkExpression(entry.expr, variables);
    if (problem) errors.push(`computed[${i}].expr: ${problem}`);
  });

  if (ids.size > 0) {
    for (const node of byId.values()) {
      if (VERBATIM_TYPES.has(node.type) || !isPlainObject(node.props)) continue;
      const at = paths.get(node.id) ?? node.id;
      checkComputedRefs(node.props, `${at}(${node.id}).props`, ids, errors, 0, fieldKeys);
    }
  }
  return ids;
}

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
 * @param {{ warnings?: string[], lenient?: boolean, onNormalized?: () => void }} [options]
 * @returns {string[]} error messages; empty when valid.
 */
export function validateProps(type, props, path = 'props', options) {
  const entry = componentEntry(type);
  if (!entry) return [`${path}: unknown component type ${JSON.stringify(type)}; use one of ${componentTypes().join(', ')}`];
  const p = props === undefined ? {} : props;
  if (!isPlainObject(p)) return [`${path}: expected object, got ${describe(p)}`];
  const errors = [];
  if (entry.propsSchema) {
    try { validateSchema(entry.propsSchema, p); } catch (error) { errors.push(`${path}: ${error.message}`); }
    return errors;
  }
  const ctx = {
    type,
    warnings: Array.isArray(options) ? options : options?.warnings,
    lenient: Boolean(options?.lenient),
    normalized: false,
  };
  checkProps(p, entry.props, path, errors, ctx, true);
  if (ctx.normalized && typeof options?.onNormalized === 'function') options.onNormalized();
  checkSemantics(type, p, path, errors);
  return errors;
}

/**
 * Rules about how a `Form` publishes values into the computed scope.
 *
 * Deliberately a whole-tree check rather than part of {@link validateProps}:
 * the renderer validates props per node and degrades a bad node to a visible
 * placeholder, so a per-node error here would make an accepted UI disappear.
 * A form-level `bindKey` on a multi-field form is not renderable-wrong, it is
 * meaningless (one key, several values) and must be rejected by the Host before
 * a formula reads it as a variable that never has a value.
 * @param {Map<string, any>} byId
 * @param {Map<string, string>} paths
 * @param {string[]} errors
 */
function checkFormBindings(byId, paths, errors) {
  for (const node of byId.values()) {
    if (node.type !== 'Form' || !isPlainObject(node.props) || node.props.bindKey === undefined) continue;
    const fields = Array.isArray(node.props.fields) ? node.props.fields : [];
    if (fields.length < 2) continue;
    const at = `${paths.get(node.id) ?? node.id}(${node.id}).props.bindKey`;
    errors.push(`${at}: a form with ${fields.length} fields has no single value to bind; set bindKey on the individual fields instead`);
  }
}

/**
 * Normalize recoverable model schema mistakes on a component list when
 * `lenientValidation` is enabled. Mutates nodes in place and records warnings.
 * @param {unknown[]} components
 * @param {string[]} warnings
 * @returns {{ normalized: boolean, absorbedIds: Set<string> }}
 */
function normalizeLenientComponents(components, warnings) {
  let normalized = false;
  const absorbedIds = new Set();
  const nodeMap = new Map();
  const idCounts = new Map();

  // Pass 1: normalize missing `id` from `key`/`name` and lift top-level declared
  // props into `node.props` on every component first, so Pass 2 (`Timeline`
  // absorbing child nodes) sees normalized child `props` regardless of whether
  // `Timeline` appears before or after its children in `components`.
  components.forEach((node, i) => {
    if (!isPlainObject(node)) return;
    const at = `components[${i}]`;
    if (typeof node.id !== 'string' || node.id === '') {
      const aliasKey = typeof node.key === 'string' && node.key.trim() ? 'key'
        : typeof node.name === 'string' && node.name.trim() ? 'name'
          : undefined;
      if (aliasKey) {
        const aliasVal = node[aliasKey].trim();
        node.id = aliasVal;
        const entry = componentEntry(node.type);
        if (!entry?.props || !Object.hasOwn(entry.props, aliasKey)) delete node[aliasKey];
        normalized = true;
        warnings.push(`${at}.id: normalized missing id from ${JSON.stringify(aliasKey)} (${JSON.stringify(aliasVal)})`);
      }
    }
    if (typeof node.id === 'string' && node.id && Object.hasOwn(CATALOG, node.type)) {
      const nodeAt = `${at}(${node.id})`;
      const entry = CATALOG[node.type];
      for (const key of Object.keys(node)) {
        if (['id', 'type', 'componentVersion', 'props', 'children'].includes(key)) continue;
        if (PROTOTYPE_KEYS.has(key)) continue;
        if (Object.hasOwn(entry.props, key)) {
          if (!isPlainObject(node.props)) node.props = {};
          if (node.props[key] === undefined) {
            node.props[key] = node[key];
            delete node[key];
            normalized = true;
            warnings.push(`${nodeAt}.${key}: lifted top-level prop ${JSON.stringify(key)} into props.${key}`);
          }
        } else if (DECORATIVE_PROPS.has(key) || HARMLESS_NOTES.has(key)) {
          delete node[key];
          normalized = true;
          warnings.push(`${nodeAt}.${key}: ignored decorative/note field ${JSON.stringify(key)}`);
        }
      }

      if (node.type === 'Choice' && isPlainObject(node.props) && Array.isArray(node.props.options)) {
        const targets = new Set();
        node.props.options.forEach(opt => {
          if (isPlainObject(opt) && opt.sessionTarget !== undefined) targets.add(opt.sessionTarget);
        });
        if (targets.size === 1) {
          const [target] = targets;
          if ((target === 'current' || target === 'new') && (node.props.sessionTarget === undefined || node.props.sessionTarget === target)) {
            node.props.sessionTarget = target;
            node.props.options.forEach((opt, oi) => {
              if (isPlainObject(opt) && opt.sessionTarget !== undefined) {
                delete opt.sessionTarget;
                normalized = true;
                warnings.push(`${nodeAt}.props.options[${oi}].sessionTarget: lifted option-level sessionTarget ${JSON.stringify(target)} to Choice.props.sessionTarget`);
              }
            });
          }
        }
      }

      if (node.type === 'Alert' && isPlainObject(node.props) && node.props.text === undefined
        && Array.isArray(node.props.items) && node.props.items.length > 0
        && node.props.items.every(x => typeof x === 'string')) {
        node.props.text = node.props.items.map(s => `• ${s}`).join('\n');
        delete node.props.items;
        normalized = true;
        warnings.push(`${nodeAt}.props.items: converted Alert props.items into props.text`);
      }

      if (node.type === 'KeyValue' && isPlainObject(node.props) && Array.isArray(node.props.items)) {
        node.props.items.forEach((it, ii) => {
          if (isPlainObject(it) && it.key === undefined && typeof it.label === 'string' && it.label.trim()) {
            it.key = it.label.trim();
            delete it.label;
            normalized = true;
            warnings.push(`${nodeAt}.props.items[${ii}].label: normalized label to key`);
          }
        });
      }

      if (node.type === 'Steps' && isPlainObject(node.props) && Array.isArray(node.props.items)) {
        node.props.items.forEach((it, ii) => {
          if (!isPlainObject(it) || it.description !== undefined) return;
          const alias = typeof it.text === 'string' ? 'text' : typeof it.subtitle === 'string' ? 'subtitle' : undefined;
          if (alias) {
            it.description = it[alias];
            delete it[alias];
            normalized = true;
            warnings.push(`${nodeAt}.props.items[${ii}].${alias}: normalized ${alias} to description`);
          }
        });
      }

      if (node.type === 'EmptyState' && isPlainObject(node.props) && node.props.description === undefined && typeof node.props.text === 'string') {
        node.props.description = node.props.text;
        delete node.props.text;
        normalized = true;
        warnings.push(`${nodeAt}.props.text: normalized EmptyState props.text to props.description`);
      }

      if (node.type === 'FollowUp' && isPlainObject(node.props) && node.props.items === undefined && Array.isArray(node.props.options)) {
        node.props.items = node.props.options;
        delete node.props.options;
        normalized = true;
        warnings.push(`${nodeAt}.props.options: normalized FollowUp props.options to props.items`);
      }

      if (node.type === 'Sources' && isPlainObject(node.props) && node.props.items === undefined) {
        const alias = Array.isArray(node.props.sources) ? 'sources' : Array.isArray(node.props.links) ? 'links' : undefined;
        if (alias) {
          node.props.items = node.props[alias];
          delete node.props[alias];
          normalized = true;
          warnings.push(`${nodeAt}.props.${alias}: normalized Sources props.${alias} to props.items`);
        }
      }

      if (node.type === 'Segmented' && isPlainObject(node.props) && node.props.options === undefined && Array.isArray(node.props.items)) {
        node.props.options = node.props.items;
        delete node.props.items;
        normalized = true;
        warnings.push(`${nodeAt}.props.items: normalized Segmented props.items to props.options`);
      }
    }
    if (typeof node.id === 'string' && node.id) {
      idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1);
      if (!nodeMap.has(node.id)) nodeMap.set(node.id, node);
    }
  });

  // Pass 2: cross-node normalizations (Timeline absorbing leaf child nodes after every node's own props are normalized).
  components.forEach((node, i) => {
    if (!isPlainObject(node) || typeof node.id !== 'string' || !node.id) return;
    if (!Object.hasOwn(CATALOG, node.type)) return;
    const at = `components[${i}](${node.id})`;

    if (node.type === 'Timeline' && Array.isArray(node.children) && node.children.length > 0) {
      if (!isPlainObject(node.props)) node.props = {};
      if (Array.isArray(node.props.items) && node.props.items.length > 0) {
        delete node.children;
        normalized = true;
        warnings.push(`${at}.children: ignored redundant children on Timeline (using props.items)`);
      } else {
        node.props.items = node.children.map(cid => {
          const child = nodeMap.get(String(cid));
          if (child && isPlainObject(child.props)) {
            const hasOwnDescendants = Array.isArray(child.children) && child.children.length > 0;
            const hasUnknownTopKeys = Object.keys(child).some(k => !['id', 'type', 'componentVersion', 'props', 'children'].includes(k));
            const childPropErrors = validateProps(child.type, child.props);
            const isUniqueId = idCounts.get(String(cid)) === 1 && String(cid) !== node.id;
            if (!hasOwnDescendants && !hasUnknownTopKeys && childPropErrors.length === 0 && isUniqueId) {
              absorbedIds.add(String(cid));
            }
            const title = typeof child.props.title === 'string' && child.props.title.trim() ? child.props.title
              : typeof child.props.label === 'string' && child.props.label.trim() ? child.props.label
                : typeof child.props.text === 'string' && child.props.text.trim() ? child.props.text
                  : String(cid);
            return {
              title,
              ...(typeof child.props.time === 'string' ? { time: child.props.time } : typeof child.props.subtitle === 'string' ? { time: child.props.subtitle } : {}),
              ...(typeof child.props.text === 'string' && child.props.text !== title ? { text: child.props.text } : {}),
              ...(TONES.includes(child.props.tone) ? { tone: child.props.tone } : {}),
            };
          }
          return { title: String(cid) };
        });
        delete node.children;
        normalized = true;
        warnings.push(`${at}.children: converted Timeline children into props.items`);
      }
    }
  });

  return { normalized, absorbedIds };
}

/**
 * Validate a whole `ui_render` payload: node shape, ids, references, cycles,
 * single parent, depth, and per-type props.
 * @param {unknown} args - tool arguments.
 * @param {{ fields?: Iterable<string>, lenient?: boolean }} [options] - extra readable field names
 *   (a composition's shared scope) and optional lenient normalization.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], fixes: string[], normalized?: boolean, types: Record<string, number>, count: number }}
 */
export function validateTree(args, options) {
  const errors = [];
  const warnings = [];
  const fixes = [];
  const types = {};
  const lenient = Boolean(options?.lenient);
  let normalized = false;
  if (!isPlainObject(args)) return { ok: false, errors: ['arguments: expected object'], warnings, fixes, types, count: 0 };
  const { root } = args;
  let components = args.components;
  if (args.title !== undefined && typeof args.title !== 'string') errors.push('title: expected string');
  if (root === undefined) errors.push('root: missing. Add the top-level field "root" next to "components", set to the id of the top component (a component named "root" does not replace it)');
  else if (typeof root !== 'string' || root === '') errors.push('root: expected the id of the top-level component');
  if (!Array.isArray(components) || components.length === 0) {
    errors.push('components: expected a non-empty array of {id, type, props?, children?} (e.g. {"root":"page","components":[{"id":"page","type":"Card","props":{"title":"..."},"children":[...]}]})');
    return { ok: false, errors, warnings, fixes, types, count: 0 };
  }
  if (components.length > LIMITS.components) errors.push(`components: more than ${LIMITS.components} nodes`);

  let absorbedIds = new Set();
  if (lenient) {
    // Clone unconditionally in lenient mode so deeply or partially frozen
    // nested objects (e.g. a frozen Choice option) never throw during normalization.
    components = structuredClone(components);
    if (!Object.isFrozen(args)) args.components = components;
    const norm = normalizeLenientComponents(components, warnings);
    if (norm.normalized) normalized = true;
    absorbedIds = norm.absorbedIds;
    if (absorbedIds.size > 0) {
      components = components.filter(n => !isPlainObject(n) || !absorbedIds.has(n.id));
      if (!Object.isFrozen(args)) args.components = components;
    }
  }

  const byId = new Map();
  const paths = new Map();
  components.forEach((rawNode, i) => {
    let node = rawNode;
    const at = `components[${i}]`;
    if (!isPlainObject(node)) { errors.push(`${at}: expected object`); return; }
    if (typeof node.id !== 'string' || node.id === '') {
      const aliasKey = typeof node.key === 'string' && node.key ? 'key'
        : typeof node.name === 'string' && node.name ? 'name'
          : undefined;
      const alias = aliasKey
        ? ` — found "${aliasKey}" (${JSON.stringify(node[aliasKey])}); rename it to "id"`
        : ' (every component requires a unique string "id")';
      errors.push(`${at}.id: expected non-empty string${alias}`);
      if (aliasKey) {
        const { [aliasKey]: aliasVal, id: _emptyId, ...restNode } = node;
        fixes.push(`${at}: rename "${aliasKey}" to "id": ${JSON.stringify({ id: aliasVal, ...restNode })}`);
      }
      return;
    }
    if (absorbedIds.has(node.id)) return;
    if (byId.has(node.id)) { errors.push(`${at}.id: duplicate id ${JSON.stringify(node.id)}`); return; }
    if (Object.hasOwn(CATALOG, node.type) && isPlainObject(node.props) && Object.hasOwn(node.props, 'children')) {
      if (Object.isFrozen(node) || Object.isFrozen(node.props)) {
        node = structuredClone(node);
      }
      if (node.children === undefined && Array.isArray(node.props.children)) {
        node.children = node.props.children;
      }
      delete node.props.children;
    }
    byId.set(node.id, node);
    paths.set(node.id, at);
    const entry = componentEntry(node.type);
    types[node.type] = (types[node.type] || 0) + 1;

    // Collect actionable fix suggestions before prop validation when common model mistakes are present.
    if (entry && !entry.propsSchema) {
      const misplacedProps = Object.keys(node).filter(
        k => !['id', 'type', 'componentVersion', 'props', 'children'].includes(k) && !PROTOTYPE_KEYS.has(k) && Object.hasOwn(entry.props, k),
      );
      if (misplacedProps.length > 0) {
        const merged = { ...(isPlainObject(node.props) ? node.props : {}), ...Object.fromEntries(misplacedProps.map(k => [k, node[k]])) };
        fixes.push(`${at}(${node.id}): move top-level props (${misplacedProps.join(', ')}) into "props": ${JSON.stringify({ id: node.id, type: node.type, props: merged, ...(Array.isArray(node.children) ? { children: node.children } : {}) })}`);
      }
      if (node.type === 'Choice' && isPlainObject(node.props) && Array.isArray(node.props.options)) {
        const withTarget = node.props.options.find(o => isPlainObject(o) && o.sessionTarget !== undefined);
        if (withTarget) {
          const tVal = withTarget.sessionTarget === 'new' ? 'new' : 'current';
          const cleanedOpts = node.props.options.map(o => {
            if (!isPlainObject(o)) return o;
            const { sessionTarget: _st, ...rest } = o;
            return rest;
          });
          fixes.push(`${at}(${node.id}): move "sessionTarget" from options[*] to Choice.props: ${JSON.stringify({ id: node.id, type: 'Choice', props: { ...node.props, sessionTarget: tVal, options: cleanedOpts } })}`);
        }
      }
      if (node.type === 'Alert' && isPlainObject(node.props) && node.props.items !== undefined && node.props.text === undefined) {
        const joined = Array.isArray(node.props.items) ? node.props.items.filter(x => typeof x === 'string').join('\n') : '...';
        const { items: _it, ...restProps } = node.props;
        fixes.push(`${at}(${node.id}): replace Alert props.items with props.text: ${JSON.stringify({ id: node.id, type: 'Alert', props: { ...restProps, text: joined || '...' } })} (or change type to "List")`);
      }
      const pObj = isPlainObject(node.props) ? node.props : {};
      const missingReq = Object.entries(entry.props)
        .filter(([k, s]) => s.required && pObj[k] === undefined && !misplacedProps.includes(k) && !(node.type === 'Alert' && k === 'text' && pObj.items !== undefined))
        .map(([k, s]) => [k, s.type === 'number' ? 1 : s.type === 'array' ? [] : s.type === 'object' ? {} : '...']);
      if (missingReq.length > 0 && !(node.type === 'Timeline' && Array.isArray(node.children) && node.children.length > 0)) {
        fixes.push(`${at}(${node.id}): supply required ${node.type} props (${missingReq.map(([k]) => k).join(', ')}): ${JSON.stringify({ id: node.id, type: node.type, props: { ...pObj, ...Object.fromEntries(missingReq) } })}`);
      }
    }

    errors.push(...validateProps(node.type, node.props, `${at}(${node.id}).props`, {
      warnings,
      lenient,
      onNormalized: () => { normalized = true; },
    }));
    errors.push(...validateComponentVersion(node.type, node.componentVersion).map(e => `${at}(${node.id}).${e}`));
    if (node.children !== undefined) {
      if (!Array.isArray(node.children) || node.children.some(c => typeof c !== 'string')) {
        errors.push(`${at}(${node.id}).children: expected array of component ids`);
      } else if (entry && !entry.children && node.children.length > 0) {
        const hint = CHILDREN_HINTS[node.type] ?? CHILDREN_HINTS.default;
        errors.push(`${at}(${node.id}).children: ${node.type} cannot have children — ${hint}`);
        fixes.push(`${at}(${node.id}): remove "children" from ${node.type} (${hint}); use: ${JSON.stringify({ id: node.id, type: node.type, props: node.type === 'Timeline' ? { items: [{ title: 'Step 1', time: '...', text: '...' }] } : (isPlainObject(node.props) ? node.props : {}) })}`);
      }
    }
    for (const key of Object.keys(node)) {
      if (['id', 'type', 'componentVersion', 'props', 'children'].includes(key)) continue;
      if (!PROTOTYPE_KEYS.has(key) && HARMLESS_NOTES.has(key)) {
        warnings.push(`${at}(${node.id}).${key}: ignored note field ${JSON.stringify(key)}`);
        continue;
      }
      if (entry && !entry.propsSchema && Object.hasOwn(entry.props, key)) {
        errors.push(`${at}(${node.id}).${key}: unknown field — ${JSON.stringify(key)} is a ${node.type} prop; nest it inside props: {${JSON.stringify(key)}: ...}`);
      } else if (node.type === 'Grid' && key === 'gap') {
        errors.push(`${at}(${node.id}).gap: unknown field — did you mean props.columns? (put component props inside "props"; Grid props are ${formatAllowedProps(entry?.props)})`);
      } else {
        const allowed = entry && !entry.propsSchema ? `; ${node.type} props go inside "props": ${formatAllowedProps(entry.props)}` : '';
        errors.push(`${at}(${node.id}).${key}: unknown field — component fields are id, type, props, children?${allowed}`);
      }
    }
  });

  checkFormBindings(byId, paths, errors);
  checkComputed(args.computed, byId, paths, errors, options?.fields);

  const parentOf = new Map();
  for (const node of byId.values()) {
    if (!Array.isArray(node.children)) continue;
    const entry = componentEntry(node.type);
    const leafCannotOwnChildren = Boolean(entry && !entry.children);
    for (const child of node.children) {
      if (!byId.has(child)) {
        // When a leaf component (e.g. Timeline) was mistakenly given children,
        // `cannot have children` already reported the root cause; suppress
        // cascading `unknown id` noise for its non-component child ids.
        if (!leafCannotOwnChildren) errors.push(`${node.id}.children: unknown id ${JSON.stringify(child)}`);
        continue;
      }
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
    if (t.type === 'Tabs' && isPlainObject(t.props) && Array.isArray(t.props.labels)) {
      const n = Array.isArray(t.children) ? t.children.length : 0;
      if (n !== t.props.labels.length) errors.push(`${t.id}: Tabs has ${t.props.labels.length} labels but ${n} children`);
    }
    if (t.type === 'Accordion' && isPlainObject(t.props) && Array.isArray(t.props.items)) {
      const n = Array.isArray(t.children) ? t.children.length : 0;
      if (n > 0 && n !== t.props.items.length) {
        errors.push(`${t.id}: Accordion has ${t.props.items.length} items but ${n} children`);
      } else if (n === 0) {
        t.props.items.forEach((it, idx) => {
          if (isPlainObject(it) && (typeof it.text !== 'string' || !it.text.trim())) {
            errors.push(`${t.id}.props.items[${idx}].text: required when Accordion has no children`);
          }
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fixes,
    ...(normalized ? { normalized: true, components } : {}),
    types,
    count: byId.size,
  };
}

/**
 * One-line catalog reference for the model (tool description / guidance).
 * @returns {string}
 */
export function catalogReference() {
  const typeName = (s) => (s.label !== undefined ? s.label
    : s.type === 'enum' ? s.values.join('|')
      : s.type === 'union' ? (s.anyOf ?? []).map(typeName).join('|')
        : s.type === 'object' ? `{${fmt(s.props || {})}}`
          : s.type === 'array' ? (s.items ? (s.items.type === 'object' ? `[{${fmt(s.items.props)}}]` : `${typeName(s.items)}[]`) : 'array')
            : s.type);
  const fmt = (specs) => Object.entries(specs).map(([k, s]) => `${k}${s.required ? '' : '?'}: ${typeName(s)}`).join(', ');
  return componentTypes().map((name) => {
    const e = componentEntry(name);
    if (e.propsSchema) return `- ${name} (componentVersion: ${e.version}${e.children ? ', children' : ''}) propsSchema=${JSON.stringify(e.propsSchema)}: ${e.description}${e.actions.length ? `; allowed host actionIds: ${e.actions.join(', ')}` : ''}`;
    return `- ${name}${e.children ? ' (children)' : ''} {${fmt(e.props)}}: ${e.description}`;
  }).join('\n');
}
