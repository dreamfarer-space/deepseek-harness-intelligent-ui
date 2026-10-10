/**
 * `ui_render_widget`: free-form generative UI — the OpenIntelligentUI
 * "generateSandboxedUi" contract. The model streams HTML/CSS/JS that the Web
 * client renders live in a sandboxed (opaque-origin) iframe. Parameter ORDER
 * matters: the browser renders css → html → js as each field completes.
 * @module dsh-intelligent-ui/tools/widget
 */
import { clientPolicy } from '../config.js';

export const WIDGET_TOOL = 'ui_render_widget';

/** Field order the streaming renderer depends on. */
export const WIDGET_FIELDS = ['title', 'initialHeight', 'placeholderMessages', 'css', 'html', 'jsFunctions', 'jsExpressions'];

/**
 * @param {ReturnType<import('../config.js').resolveConfig>} config
 */
export function createWidgetTool(config) {
  const policy = clientPolicy(config);
  const cdn = config.cdnAllowlist.length ? config.cdnAllowlist.join(', ') : '(none)';
  return {
    name: WIDGET_TOOL,
    description: [
      'Render a custom interactive widget (HTML + CSS + JS) live in a sandboxed iframe inside the chat — visualizations, simulations, calculators, diagrams, mini-apps.',
      'Prefer ui_render for plain tables/charts/forms; use this when you need custom visuals, animation or logic.',
      'PARAMETER ORDER IS CRITICAL — emit the JSON keys in exactly this order, it is rendered while streaming:',
      '1. title (short) 2. initialHeight (px estimate) 3. placeholderMessages (2-4 short loading lines)',
      '4. css — ALL styles up front (no <style> in html) 5. html — body markup only (no <script>, <style>, <head>)',
      '6. jsFunctions — named function declarations, runs once 7. jsExpressions — small statements calling those functions, run in order.',
      'Scripts are classic scripts: no top-level await. Load libraries inside an async function: `async function setup(){ const d3 = await import("https://esm.sh/d3@7"); ... }`.',
      'Theme CSS variables are predefined: --ui-bg, --ui-surface, --ui-text, --ui-muted, --ui-border, --ui-accent, --ui-accent-text, --ui-success, --ui-warning, --ui-error, --ui-radius, --ui-font, --ui-mono. Use them so the widget follows light/dark mode.',
      `Sandbox: no same-origin access (no localStorage/cookies/parent DOM). External resources only from: ${cdn}.${config.allowNetwork ? ' fetch() to those origins is allowed.' : ' Network requests (fetch/XHR/WebSocket) are blocked.'}`,
      'To talk to the conversation call `Bridge.sendPrompt({ text })` (returns a Promise) ONLY in response to an explicit user action such as a button click — never on load, timers or ordinary input changes. `Bridge.openLink({ url })` opens an https link.',
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
