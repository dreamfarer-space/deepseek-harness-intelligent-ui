import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { createRenderTool } from '../src/tools/render.js';
import { createPatchTool } from '../src/tools/patch.js';
import { createWidgetTool } from '../src/tools/widget.js';
import { createComposeTool } from '../src/tools/compose.js';
import { guidanceText } from '../src/guidance.js';
import { resolveConfig } from '../src/config.js';
import { validateTree } from '../src/catalog/catalog.js';
import { validateWidget } from '../src/tools/widget.js';

// Read credentials only when a request is made; importing the client is safe.
export function getApiKey(env = process.env) {
  const key = env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new Error('Set DEEPSEEK_API_KEY to run real-model evaluation.');
  return key;
}

export const MODEL = process.env.DEEPSEEK_EVAL_MODEL?.trim() || 'deepseek-flash';
const ENDPOINT = process.env.DEEPSEEK_EVAL_ENDPOINT?.trim() || 'https://api.deepseek.com/chat/completions';
const config = resolveConfig({});

// The same tools, descriptions and system guidance the plugin registers in DSH.
const systemGuidance = guidanceText(config);
export const pluginTools = [createRenderTool(config), createPatchTool(config), createWidgetTool(config), createComposeTool(config)];
const SYSTEM = `You are a helpful AI assistant in DeepSeek Harness.\n\n${systemGuidance}`;

const tools = pluginTools.map(tool => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: tool.parameters },
}));

/** Short hash of everything the model is shown besides the user turn: any change makes runs incomparable. */
export const PROMPT_VERSION = createHash('sha256').update(JSON.stringify({ SYSTEM, tools })).digest('hex').slice(0, 12);

/** Token counts of one completion, when the API reports them. */
function usageOf(usage) {
  const prompt = Number(usage?.prompt_tokens);
  const completion = Number(usage?.completion_tokens);
  return Number.isFinite(prompt) && Number.isFinite(completion) ? { prompt, completion } : null;
}

/**
 * One chat completion with timing, model identity and token usage.
 * @returns {Promise<{ message: any, model: string, fingerprint: string | null, ms: number, usage: { prompt: number, completion: number } | null }>}
 */
export function callChatDetailed(messages, useTools = true) {
  const apiKey = getApiKey();
  const payload = {
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM }, ...messages],
    tools: useTools ? tools : undefined,
    temperature: 0.3,
  };
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    // A local OpenAI-compatible gateway (http://127.0.0.1:…) is allowed for evaluation runs.
    const client = new URL(ENDPOINT).protocol === 'http:' ? http : https;
    const req = client.request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          // Do not echo response bodies: upstream errors may include secrets.
          return reject(new Error(`DeepSeek API returned HTTP ${res.statusCode}`));
        }
        try {
          const json = JSON.parse(body);
          const message = json.choices?.[0]?.message;
          if (!message || message.role !== 'assistant') throw new Error('DeepSeek API returned no assistant message');
          resolve({ message, model: json.model || MODEL, fingerprint: json.system_fingerprint ?? null, ms: Math.round(performance.now() - started), usage: usageOf(json.usage) });
        } catch (e) {
          reject(e);
        }
      });
    });
    // Network failures carry no credentials; keep only the code for the report.
    req.on('error', err => reject(err.code ? new Error(`DeepSeek API unreachable: ${err.code}`) : err));
    req.setTimeout(120000, () => req.destroy(new Error('DeepSeek API request timed out after 120 seconds')));
    req.on('response', res => res.on('error', reject));
    req.write(data);
    req.end();
  });
}

async function callChat(messages, useTools = true) {
  return (await callChatDetailed(messages, useTools)).message;
}

export { callChat, config, validateTree, validateWidget };
