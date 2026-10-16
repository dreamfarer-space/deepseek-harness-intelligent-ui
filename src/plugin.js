/**
 * DeepSeek Harness Intelligent UI — Host half.
 *
 * Registers the generative-UI tools (`ui_render`, `ui_patch`, `ui_render_widget`), the
 * `/ui` command and an optional system-prompt section. The browser half
 * (`./client`) renders each tool call in the `tool.call.toolview` slot.
 * @module deepseek-harness-intelligent-ui
 */
import { Config as ConfigSchema, resolveConfig } from './config.js';
import { createRenderTool } from './tools/render.js';
import { createPatchTool } from './tools/patch.js';
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
    ctx.tools.register(createRenderTool(config));
    ctx.tools.register(createPatchTool(config));
  }
  if (config.enableWidget) ctx.tools.register(createWidgetTool(config));
  registerCommands(ctx.commands, config);

  const text = config.injectGuidance ? guidanceText(config) : '';
  if (text) {
    // Optional: a composition without the system-prompt service still gets the tools.
    ctx.inject(['systemPrompt'], (child) => {
      child.systemPrompt.section({ name: 'intelligent-ui:guidance', order: GUIDANCE_ORDER, text });
    });
  }
}
