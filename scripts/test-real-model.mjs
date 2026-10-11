import https from 'node:https';
import { createRenderTool } from '../src/tools/render.js';
import { createWidgetTool } from '../src/tools/widget.js';
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

export const MODEL = 'deepseek-flash';
const config = resolveConfig({});

// Setup system guidance and tools
const systemGuidance = guidanceText(config);
const renderTool = createRenderTool(config);
const widgetTool = createWidgetTool(config);

const tools = [
  {
    type: 'function',
    function: {
      name: renderTool.name,
      description: renderTool.description,
      parameters: renderTool.parameters,
    },
  },
  {
    type: 'function',
    function: {
      name: widgetTool.name,
      description: widgetTool.description,
      parameters: widgetTool.parameters,
    },
  },
];

async function callChat(messages, useTools = true) {
  const apiKey = getApiKey();
  const payload = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a helpful AI assistant in DeepSeek Harness.\n\n${systemGuidance}`,
      },
      ...messages,
    ],
    tools: useTools ? tools : undefined,
    temperature: 0.3,
  };

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request('https://api.deepseek.com/chat/completions', {
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
          resolve(message);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('DeepSeek API request timed out after 120 seconds')));
    req.on('response', res => res.on('error', reject));
    req.write(data);
    req.end();
  });
}

export { callChat, config, validateTree, validateWidget };
