import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(err => (err ? reject(err) : resolvePort(port)))
    })
  })
}

async function postMessages(port, body) {
  const res = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(200)
  const raw = await res.text()
  let toolName = ''
  let jsonChunks = ''
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue
    const evt = JSON.parse(line.slice(6))
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
      toolName = evt.content_block.name
    } else if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
      jsonChunks += evt.delta.partial_json
    }
  }
  return { toolName, input: JSON.parse(jsonChunks) }
}

function assertReplSafeScript(code) {
  expect(() => transformSync(code, { loader: 'js', format: 'esm' })).not.toThrow()
  expect(code).not.toMatch(/\breturn\b/)
  expect(code).not.toMatch(/^\s*(?:const|let|var)\s+/m)
  expect(code).toMatch(/^console\.log\(\(await tools\.ui_(?:render|patch)\(/)
}

describe('e2e mock-deepseek PTC run_code snippets', () => {
  let port = 0
  let child

  beforeAll(async () => {
    port = await freePort()
    child = spawn(process.execPath, [resolve(ROOT, 'scripts/e2e/mock-deepseek.mjs'), String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('mock-deepseek did not listen in time')), 10000)
      let buf = ''
      child.stdout.on('data', chunk => {
        buf += chunk.toString('utf8')
        if (buf.includes(`"listening":${port}`)) {
          clearTimeout(timer)
          resolveReady()
        }
      })
      child.on('exit', code => {
        clearTimeout(timer)
        rejectReady(new Error(`mock-deepseek exited early with code ${code}`))
      })
    })
  })

  afterAll(() => {
    if (child && !child.killed) child.kill()
  })

  it('emits top-level-return-free console.log code and resolves subCallId across 0.2.2 and 0.2.3 tool_result formats', async () => {
    const renderCall = await postMessages(port, {
      model: 'claude-sonnet-4-20250514',
      tools: [{ name: 'run_code' }, { name: 'ui_render' }, { name: 'ui_patch' }],
      messages: [{ role: 'user', content: 'E2E ptc render' }],
    })
    expect(renderCall.toolName).toBe('run_code')
    assertReplSafeScript(renderCall.input.code)
    expect(renderCall.input.code).toContain('await tools.ui_render(')

    const summary = 'Rendered declarative UI "PTC Pipeline" (uiId toolu_123:ptc:1, version 1 (change it later with ui_patch)).'

    // 0.2.2-rc.5 style: plain string tool_result
    const patch22 = await postMessages(port, {
      model: 'claude-sonnet-4-20250514',
      tools: [{ name: 'run_code' }, { name: 'ui_render' }, { name: 'ui_patch' }],
      messages: [
        { role: 'user', content: 'E2E ptc render' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_123', name: 'run_code', input: renderCall.input }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_123', content: summary }] },
        { role: 'user', content: 'E2E ptc patch' },
      ],
    })
    expect(patch22.toolName).toBe('run_code')
    assertReplSafeScript(patch22.input.code)
    expect(patch22.input.code).toContain('"uiId":"toolu_123:ptc:1"')
    expect(patch22.input.code).not.toContain('"uiId":"missing"')

    // 0.2.3-alpha.2 style: content block array with trailing newline from console.log stdout
    const patch23 = await postMessages(port, {
      model: 'claude-sonnet-4-20250514',
      tools: [{ name: 'run_code' }, { name: 'ui_render' }, { name: 'ui_patch' }],
      messages: [
        { role: 'user', content: 'E2E ptc render' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_456', name: 'run_code', input: renderCall.input }] },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_456',
            content: [{ type: 'text', text: `${summary.replace('toolu_123:ptc:1', 'toolu_456:ptc:1')}\n` }],
          }],
        },
        { role: 'user', content: 'E2E ptc patch' },
      ],
    })
    expect(patch23.toolName).toBe('run_code')
    assertReplSafeScript(patch23.input.code)
    expect(patch23.input.code).toContain('"uiId":"toolu_456:ptc:1"')
    expect(patch23.input.code).not.toContain('"uiId":"missing"')

    // Concatenating both scripts in a persistent scope must remain syntactically valid without redeclaration
    expect(() => transformSync(`${renderCall.input.code}\n${patch23.input.code}`, { loader: 'js', format: 'esm' })).not.toThrow()
  })
})
