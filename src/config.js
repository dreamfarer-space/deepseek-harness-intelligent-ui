/**
 * Plugin configuration (Schemastery). Every field is deployment-tunable; the
 * Plugins page renders this schema. Browser-relevant fields travel to the
 * client through each tool result's `presentationMeta` (see {@link clientPolicy}).
 * @module deepseek-harness-intelligent-ui/config
 */
import { RESOURCE_MODE } from './resource-mode.js';
import Schema from '@deepseek-ai/schemastery';

export const DEFAULTS = Object.freeze({
  enableCatalog: true,
  enableWidget: true,
  injectGuidance: true,
  cdnAllowlist: ['https://esm.sh', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
  allowNetwork: false,
  maxWidgetHeight: 2400,
  maxWidgetBytes: 400000,
  sendPromptMaxChars: 4000,
  openLinkAllowedOrigins: [],
});

export const Config = Schema.object({
  enableCatalog: Schema.boolean().default(DEFAULTS.enableCatalog)
    .description('Register `ui_render` (declarative cards, tables, charts, forms).'),
  enableWidget: Schema.boolean().default(DEFAULTS.enableWidget)
    .description('Register `ui_render_widget` (sandboxed streaming HTML/CSS/JS widgets).'),
  injectGuidance: Schema.boolean().default(DEFAULTS.injectGuidance)
    .description('Add a system-prompt section telling the model when and how to answer with UI.'),
  cdnAllowlist: Schema.array(Schema.string()).default([...DEFAULTS.cdnAllowlist])
    .description('Origins widgets may load scripts, styles, fonts and images from (CSP).'),
  allowNetwork: Schema.boolean().default(DEFAULTS.allowNetwork)
    .description('Allow widgets to fetch()/WebSocket to the CDN allowlist (CSP connect-src). Off: no network calls.'),
  maxWidgetHeight: Schema.natural().min(200).max(8000).default(DEFAULTS.maxWidgetHeight)
    .description('Maximum widget frame height in pixels.'),
  maxWidgetBytes: Schema.natural().min(10000).default(DEFAULTS.maxWidgetBytes)
    .description('Reject widgets whose html+css+js exceed this many characters.'),
  sendPromptMaxChars: Schema.natural().min(100).max(20000).default(DEFAULTS.sendPromptMaxChars)
    .description('Longest message a widget, button or form may send back to the conversation.'),
  openLinkAllowedOrigins: Schema.array(Schema.string()).default([])
    .description('If non-empty, widgets may only open https links on these origins.'),
});

/**
 * Normalize raw config onto defaults (tests and direct callers may skip Schemastery).
 * @param {Partial<typeof DEFAULTS> | undefined} raw
 * @returns {typeof DEFAULTS}
 */
export function resolveConfig(raw) {
  const merged = { ...DEFAULTS, ...(raw || {}) };
  for (const key of Object.keys(merged)) {
    if (!(key in DEFAULTS)) throw new TypeError(`deepseek-harness-intelligent-ui: unknown config key "${key}"`);
  }
  return merged;
}

/**
 * The browser-relevant policy persisted on each tool result so replays render
 * with the same constraints the Host had at call time.
 * @param {typeof DEFAULTS} config
 */
export function clientPolicy(config) {
  return {
    cdn: RESOURCE_MODE === 'offline' ? [] : [...config.cdnAllowlist],
    allowNetwork: RESOURCE_MODE === 'offline' ? false : config.allowNetwork,
    maxHeight: config.maxWidgetHeight,
    sendPromptMaxChars: config.sendPromptMaxChars,
    openLinkOrigins: [...config.openLinkAllowedOrigins],
  };
}
