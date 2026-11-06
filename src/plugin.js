/**
 * DeepSeek Harness Intelligent UI — Host half.
 *
 * Registers the generative-UI tools (`ui_render`, `ui_patch`, `ui_render_widget`,
 * `ui_compose`), the `/ui` command and an optional system-prompt section. The
 * browser half (`./client`) renders each tool call in the `tool.call.toolview` slot.
 * @module deepseek-harness-intelligent-ui
 */
import { Config as ConfigSchema, resolveConfig } from './config.js';
import { composeEnabled } from './compose/compose.js';
import { COMPOSE_TOOL } from './compose/constants.js';
import { createUiSessionProjection } from './catalog/patch.js';
import { createComposeTool } from './tools/compose.js';
import { createRenderTool, RENDER_TOOL } from './tools/render.js';
import { createPatchTool, PATCH_TOOL } from './tools/patch.js';
import { createWidgetTool } from './tools/widget.js';
import { GUIDANCE_ORDER, guidanceText } from './guidance.js';
import { registerCommands } from './commands.js';

export const name = 'deepseek-harness-intelligent-ui';
export const inject = ['tools', 'commands'];
export const Config = ConfigSchema;

/**
 * @param {import('@deepseek-ai/cordis').Context & Record<string, any>} ctx
 * @param {Record<string, unknown>} rawConfig
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  // tools.register / commands.register are fiber effects: unloading this
  // plugin unregisters everything, so no manual disposer bookkeeping.
  if (config.enableCatalog) {
    const unit = createUiSessionProjection({
      render: RENDER_TOOL,
      patch: PATCH_TOOL,
      ...(config.enableCompose !== false ? { compose: COMPOSE_TOOL, config } : {}),
    });
    let activePromise;
    ctx.inject(['sessionProjections'], (child) => {
      const sp = child.sessionProjections;
      if (!sp || typeof sp.register !== 'function') return;
      let disposed = false;
      const promise = Promise.resolve(sp.register(unit)).then(
        (h) => (!disposed && h && typeof h.stateOf === 'function' ? h : undefined),
        (err) => { child.logger?.warn?.(err); return undefined; },
      );
      activePromise = promise;
      child.effect(() => () => {
        disposed = true;
        if (activePromise === promise) activePromise = undefined;
      });
    });
    ctx.tools.register(createRenderTool(config));
    ctx.tools.register(createPatchTool(config, () => activePromise));
  }
  if (config.enableWidget) ctx.tools.register(createWidgetTool(config));
  // Composing needs something to compose; without a UI capability it is not offered.
  if (composeEnabled(config)) ctx.tools.register(createComposeTool(config));
  registerCommands(ctx.commands, config);

  const text = config.injectGuidance ? guidanceText(config) : '';
  if (text) {
    // Optional: a composition without the system-prompt service still gets the tools.
    ctx.inject(['systemPrompt'], (child) => {
      child.systemPrompt.section({ name: 'intelligent-ui:guidance', order: GUIDANCE_ORDER, text });
    });
  }
}
