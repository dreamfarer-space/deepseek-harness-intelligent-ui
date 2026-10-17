/**
 * `ui_render_widget`: free-form generative UI — the OpenIntelligentUI
 * "generateSandboxedUi" contract. The model streams HTML/CSS/JS that the Web
 * client renders live in a sandboxed (opaque-origin) iframe. Parameter ORDER
 * matters: the browser renders css → html → js as each field completes.
 * @module deepseek-harness-intelligent-ui/tools/widget
 */
import { RESOURCE_MODE } from '../resource-mode.js';
import { clientPolicy } from '../config.js';

export const WIDGET_TOOL = 'ui_render_widget';

/** Field order the streaming renderer depends on. */
export const WIDGET_FIELDS = ['title', 'initialHeight', 'placeholderMessages', 'css', 'html', 'jsFunctions', 'jsExpressions'];

/**
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
export function createWidgetTool(config) {
  const policy = clientPolicy(config);
  const cdn = policy.cdn.length ? policy.cdn.join(', ') : '(none)';
  return {
    name: WIDGET_TOOL,
    description: [
      'Render a custom interactive widget (HTML + CSS + JS) live in a sandboxed iframe inside the chat — ONLY for 3D scenes (Three.js/WebGL), dynamic physics/math simulations, animations, games, or custom canvas mini-apps.',
      'NEVER use this for standard charts (bar, line, area, multi-series), tables, forms, timelines, or dashboards — ALWAYS use ui_render for those instead.',
      'PARAMETER ORDER IS CRITICAL — emit the JSON keys in exactly this order, it is rendered while streaming:',
      '1. title (short) 2. initialHeight (px estimate) 3. placeholderMessages (2-4 short loading lines)',
      '4. css — ALL styles up front (no <style> in html) 5. html — body markup only (no <script>, <style>, <head>); give every control a unique id',
      '6. jsFunctions — named function declarations, runs once 7. jsExpressions — small statements calling those functions, run in order (e.g. ["init()"]).',
      'Scripts are classic scripts: no top-level await; use `async function init(){ ... }`. Bare imports resolve through an importmap: `await import("three")`, `await import("three/addons/controls/OrbitControls.js")`, `await import("d3")`, `await import("chart.js/auto")`, `await import("canvas-confetti")`.' + (RESOURCE_MODE === 'offline' ? '' : ' Online mode also supports `await import("gsap")`.'),
      ...(RESOURCE_MODE === 'offline' ? ['Offline resource pack: only bare imports three, three/addons/controls/OrbitControls.js, d3, chart.js/auto, canvas-confetti, katex and mermaid are included. Other addons, gsap, external images/models/fonts, fetch and CDN URLs are unavailable. Use procedural geometry, local canvas or inline data assets.'] : []),
      'Runtime helpers (global, no import needed):',
      '- `UI.three(elOrSelector, { camera: [x,y,z], target: [x,y,z], autoRotate })` → Promise<{ THREE, scene, camera, renderer, controls, render(), onFrame(cb(dt)) }>: sized WebGL renderer with lights and orbit controls (drag = rotate, wheel/pinch = zoom, right-drag = pan); renders on demand, so call render() after changing the scene, or onFrame() for continuous animation. Put it in `<div class="ui-stage" id="stage"></div>` (360px tall; override the height in css).',
      '- `UI.canvas(elOrSelector, (ctx, w, h) => { ... })` → { redraw }: HiDPI 2D canvas in CSS pixels, redrawn on resize and theme change.',
      '- `UI.state` + `UI.setState(patch)`: small JSON state that survives re-renders and page reloads. Inputs/selects/textareas with an id are persisted and restored automatically before your code runs.',
      '- `UI.color("accent")` → current theme color as opaque #rrggbb, safe for three.js/canvas (also "text", "muted", "border", "surface", "bg", "success", "warning", "error"); `UI.css("font")` → a raw theme value; `UI.scheme` is "light" or "dark"; `UI.onTheme(cb)` fires on theme change (re-read colors there); `UI.reducedMotion` is true when the user asked for less motion — skip decorative animation then.',
      '- Helper classes: .ui-row (wrapping flex row), .ui-control (label + input + <output>), .ui-card, .ui-muted, .ui-stage.',
      'Theme CSS variables: --ui-bg, --ui-surface, --ui-text, --ui-muted, --ui-border, --ui-accent, --ui-accent-text, --ui-success, --ui-warning, --ui-error, --ui-radius, --ui-font, --ui-mono. Use them (never hard-coded page colors) so the widget follows light/dark mode. Layout must be responsive (fluid widths, wrap rows) — the chat may be phone-narrow.',
      'Interactivity: sliders, buttons, drag, rotate and zoom must update the widget immediately in JS (listen to "input" events; recompute and redraw). Never call sendPrompt for those.',
      `Sandbox: no same-origin access (no localStorage/cookies/parent DOM). External resources only from: ${cdn}.${policy.allowNetwork ? ' fetch() to those origins is allowed.' : ' Network requests (fetch/XHR/WebSocket) are blocked.'}`,
      'To talk to the conversation call `Bridge.sendPrompt({ text })` (returns a Promise; the clicked button is disabled until it settles) ONLY in response to an explicit user action that needs you (e.g. an "Explain" or "Submit" button) — never on load, timers or ordinary input changes. Include the relevant current values in the text. `Bridge.openLink({ url })` opens an https link.',
      'After calling, add at most one short sentence; do not paste the code into the reply.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short widget title.' },
        initialHeight: { type: 'number', description: 'Estimated content height in px (100-1200).' },
        placeholderMessages: { type: 'array', items: { type: 'string' }, description: '2-4 short status lines shown while generating.' },
        css: { type: 'string', description: 'All CSS for the widget.' },
        html: { type: 'string', description: 'Body markup only.' },
        jsFunctions: { type: 'string', description: 'Function declarations (run once, before jsExpressions).' },
        jsExpressions: { type: 'array', items: { type: 'string' }, description: 'Statements run one by one after jsFunctions.' },
      },
      required: ['html'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          summary: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
        },
        required: ['ok', 'summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.ok ? value.summary : `${value.summary}\n${(value.errors || []).map(e => `- ${e}`).join('\n')}` }],
      presentationMeta: (_args, value) => ({ ok: value.ok, policy }),
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const errors = validateWidget(args, config);
      if (errors.length) {
        return { ok: false, summary: `Widget not rendered: ${errors.length} problem(s). Fix them and call ${WIDGET_TOOL} again.`, errors };
      }
      const title = args.title ? ` "${args.title}"` : '';
      const js = (args.jsExpressions || []).length;
      return {
        ok: true,
        summary: `Widget${title} is now displayed to the user (${args.html.length} chars html, ${(args.css || '').length} chars css, ${js} js expression(s)). If it calls Bridge.sendPrompt, those arrive as new user messages.`,
      };
    },
  };
}

/**
 * @param {any} args
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 * @returns {string[]}
 */
export function validateWidget(args, config) {
  const errors = [];
  if (typeof args !== 'object' || args === null) return ['arguments: expected object'];
  const str = (k, required) => {
    const v = args[k];
    if (v === undefined) { if (required) errors.push(`${k}: required`); return; }
    if (typeof v !== 'string') errors.push(`${k}: expected string`);
  };
  str('title');
  str('css');
  str('html', true);
  str('jsFunctions');
  if (typeof args.html === 'string' && args.html.trim() === '') errors.push('html: must not be empty');
  for (const k of ['placeholderMessages', 'jsExpressions']) {
    const v = args[k];
    if (v !== undefined && (!Array.isArray(v) || v.some(x => typeof x !== 'string'))) errors.push(`${k}: expected array of strings`);
  }
  if (args.initialHeight !== undefined && (typeof args.initialHeight !== 'number' || !Number.isFinite(args.initialHeight) || args.initialHeight <= 0)) {
    errors.push('initialHeight: expected positive number');
  }
  if (typeof args.html === 'string' && /<script[\s>]/i.test(args.html)) {
    errors.push('html: must not contain <script>; put code in jsFunctions/jsExpressions');
  }
  const size = ['css', 'html', 'jsFunctions'].reduce((n, k) => n + (typeof args[k] === 'string' ? args[k].length : 0), 0)
    + (Array.isArray(args.jsExpressions) ? args.jsExpressions.join('').length : 0);
  if (size > config.maxWidgetBytes) errors.push(`widget is ${size} characters; the limit is ${config.maxWidgetBytes}`);
  return errors;
}
