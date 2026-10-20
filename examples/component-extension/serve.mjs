#!/usr/bin/env node
/** Run from the repo OR the installed package: node .../examples/component-extension/serve.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const routes = {
  '/': ['index.html', 'text/html'],
  '/manifest.js': ['manifest.js', 'text/javascript'],
  '/renderers.js': ['renderers.js', 'text/javascript'],
  '/renderer.js': ['../../renderer/renderer.js', 'text/javascript'],
};
const port = Number(process.env.PORT ?? 3286);
createServer(async (request, response) => {
  const route = routes[request.url];
  if (!route) { response.writeHead(404).end(); return; }
  try {
    const content = await readFile(new URL(route[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' }).end(content);
  } catch { response.writeHead(500).end('Run npm run build in the source checkout first.'); }
}).listen(port, '127.0.0.1', () => console.log(`Component extension demo: http://127.0.0.1:${port}`));
