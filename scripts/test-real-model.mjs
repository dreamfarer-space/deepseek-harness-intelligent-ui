import fs from 'node:fs';
import https from 'node:https';
import { createRenderTool } from '../src/tools/render.js';
import { createWidgetTool } from '../src/tools/widget.js';
import { guidanceText } from '../src/guidance.js';
import { resolveConfig } from '../src/config.js';
import { validateTree } from '../src/catalog/catalog.js';
import { validateWidget } from '../src/tools/widget.js';

// 1. Read API Key safely without logging it
function getApiKey() {
  const credPath = 'D:/DSH/.credentials.yaml';
  if (!fs.existsSync(credPath)) {
    throw new Error('Credentials file not found: ' + credPath);
  }
  const content = fs.readFileSync(credPath, 'utf8');
  const match = content.match(/DEEPSEEK_API_KEY:\s*(\S+)/);
  if (!match) throw new Error('DEEPSEEK_API_KEY not found in .credentials.yaml');
  return match[1].replace(/['\"]/g, '');
}

const API_KEY = getApiKey();
const MODEL = 'deepseek-flash'; // Official model name verified
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
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`API ${res.statusCode}: ${body.slice(0, 300)}`));
        }
        try {
          const json = JSON.parse(body);
          resolve(json.choices[0]?.message);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export { callChat, config, validateTree, validateWidget };
