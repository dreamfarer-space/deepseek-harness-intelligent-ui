/**
 * Plugin configuration (Schemastery). Every field is deployment-tunable; the
 * Plugins page renders this schema. Widget policy fields are `volatile`: the
 * official settings service (Desktop forms, Remote clients) edits them live,
 * and every read goes through {@link resolveConfig}'s getters, so the next
 * tool call sees the new value without remounting the plugin. Tool and
 * guidance switches stay structural because they change what is registered.
 * Browser-relevant fields travel to the
 * client through each tool result's `presentationMeta` (see {@link clientPolicy}).
 * @module deepseek-harness-intelligent-ui/config
 */
import { RESOURCE_MODE } from './resource-mode.js';
import Schema from '@deepseek-ai/schemastery';

export const DEFAULTS = Object.freeze({
  enableCatalog: true,
  enableWidget: true,
  enableCompose: true,
  injectGuidance: true,
  cdnAllowlist: ['https://esm.sh', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
  allowNetwork: false,
  maxWidgetHeight: 2400,
  maxWidgetBytes: 400000,
  sendPromptMaxChars: 4000,
  openLinkAllowedOrigins: [],
  mapTileUrl: '',
  mapTileAttribution: '',
  mapTileMaxZoom: 19,
});

export const Config = Schema.object({
  enableCatalog: Schema.boolean().default(DEFAULTS.enableCatalog)
    .description('Register `ui_render` (declarative cards, tables, charts, forms).'),
  enableWidget: Schema.boolean().default(DEFAULTS.enableWidget)
    .description('Register `ui_render_widget` (sandboxed streaming HTML/CSS/JS widgets).'),
  enableCompose: Schema.boolean().default(DEFAULTS.enableCompose)
    .description('Register `ui_compose` (one answer that interleaves markdown, native components and widgets). Needs at least one UI capability.'),
  injectGuidance: Schema.boolean().default(DEFAULTS.injectGuidance)
    .description('Add a system-prompt section telling the model when and how to answer with UI.'),
  cdnAllowlist: Schema.array(Schema.string()).default([...DEFAULTS.cdnAllowlist]).volatile()
    .description('Origins widgets may load scripts, styles, fonts and images from (CSP).'),
  allowNetwork: Schema.boolean().default(DEFAULTS.allowNetwork).volatile()
    .description('Allow widgets to fetch()/WebSocket to the CDN allowlist (CSP connect-src). Off: no script network calls. Resource elements (img/script/style/font/media) still reach allowlisted origins; set cdnAllowlist to [] to block external resource requests. Self-navigation can still send data in its URL.'),
  maxWidgetHeight: Schema.natural().min(200).max(8000).default(DEFAULTS.maxWidgetHeight).volatile()
    .description('Maximum widget frame height in pixels.'),
  maxWidgetBytes: Schema.natural().min(10000).default(DEFAULTS.maxWidgetBytes).volatile()
    .description('Reject widgets whose html+css+js exceed this many characters.'),
  sendPromptMaxChars: Schema.natural().min(100).max(20000).default(DEFAULTS.sendPromptMaxChars).volatile()
    .description('Longest message a widget, button or form may send back to the conversation.'),
  openLinkAllowedOrigins: Schema.array(Schema.string()).default([]).volatile()
    .description('If non-empty, widgets may only open https links on these origins.'),
  mapTileUrl: Schema.string().default(DEFAULTS.mapTileUrl).volatile()
    .description('Raster tile URL template for the Map component, e.g. `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (https, with {z}, {x} and {y}). Empty: maps draw the built-in offline world outline. Follow the provider usage policy.'),
  mapTileAttribution: Schema.string().default(DEFAULTS.mapTileAttribution).volatile()
    .description('Attribution shown on every tiled map, e.g. `© OpenStreetMap contributors`. Required by most tile providers.'),
  mapTileMaxZoom: Schema.natural().min(1).max(22).default(DEFAULTS.mapTileMaxZoom).volatile()
    .description('Highest zoom level the tile provider serves.'),
}).i18n({
  'zh-CN': {
    enableCatalog: '注册 `ui_render`（声明式卡片、表格、图表、表单）。',
    enableWidget: '注册 `ui_render_widget`（沙箱中流式渲染的 HTML/CSS/JS 组件）。',
    enableCompose: '注册 `ui_compose`（在一个回答中穿插 Markdown、原生组件和 Widget）。至少需要开启一种 UI 能力。',
    injectGuidance: '在系统提示词中加入何时、如何用 UI 作答的说明。',
    cdnAllowlist: 'Widget 可加载脚本、样式、字体和图片的来源（CSP）。',
    allowNetwork: '允许 Widget 对 CDN 白名单发起 fetch()/WebSocket（CSP connect-src）。关闭时禁止脚本网络调用；图片、脚本、样式、字体和媒体仍可请求白名单来源。将 cdnAllowlist 设为空数组可阻止外部资源请求，但不能阻止组件自身导航及其 URL 携带的数据。',
    maxWidgetHeight: 'Widget 框架的最大高度（像素）。',
    maxWidgetBytes: 'html+css+js 总字符数超过此值的 Widget 会被拒绝。',
    sendPromptMaxChars: 'Widget、按钮或表单回传到对话的消息最大长度。',
    openLinkAllowedOrigins: '非空时，Widget 只能打开这些来源下的 https 链接。',
    mapTileUrl: 'Map 组件的栅格瓦片 URL 模板，例如 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`（https，需含 {z}、{x}、{y}）。留空时地图绘制内置的离线世界轮廓。请遵守瓦片服务商的使用政策。',
    mapTileAttribution: '瓦片地图上始终显示的署名，例如 `© OpenStreetMap contributors`。多数瓦片服务商要求署名。',
    mapTileMaxZoom: '瓦片服务商提供的最大缩放级别。',
  },
});

/**
 * Normalize raw config onto defaults (tests and direct callers may skip Schemastery).
 * Volatile fields arrive as live `{ get() }` references; each property is a
 * getter so callers always read the current value.
 * @param {Partial<typeof DEFAULTS> | Record<string, unknown> | undefined} raw
 * @returns {typeof DEFAULTS}
 */
export function resolveConfig(raw) {
  const source = raw || {};
  for (const key of Object.keys(source)) {
    if (!(key in DEFAULTS)) throw new TypeError(`deepseek-harness-intelligent-ui: unknown config key "${key}"`);
  }
  const config = {};
  for (const key of Object.keys(DEFAULTS)) {
    Object.defineProperty(config, key, {
      enumerable: true,
      get() {
        const value = isVolatileRef(source[key]) ? source[key].get() : source[key];
        return value === undefined ? DEFAULTS[key] : value;
      },
    });
  }
  return /** @type {typeof DEFAULTS} */ (config);
}

/** @param {unknown} value @returns {value is { get(): unknown }} */
function isVolatileRef(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof value.get === 'function';
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
    mapTiles: RESOURCE_MODE === 'offline' ? null : mapTiles(config),
  };
}

/**
 * The Host-approved tile provider, or null when none is configured or the
 * template is unusable (the Map component then draws its offline outline).
 * @param {typeof DEFAULTS} config
 * @returns {{ url: string, attribution: string, maxZoom: number } | null}
 */
export function mapTiles(config) {
  const url = typeof config.mapTileUrl === 'string' ? config.mapTileUrl.trim() : '';
  if (!/^https:\/\/[^/?#\s]+\/\S*$/.test(url) || !['{z}', '{x}', '{y}'].every(p => url.includes(p))) return null;
  const maxZoom = Number.isInteger(config.mapTileMaxZoom) ? Math.max(1, Math.min(22, config.mapTileMaxZoom)) : DEFAULTS.mapTileMaxZoom;
  return { url, attribution: String(config.mapTileAttribution ?? '').slice(0, 300), maxZoom };
}
