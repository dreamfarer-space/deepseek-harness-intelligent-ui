import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import https from 'node:https'
import { callChat, getApiKey, config } from '../scripts/test-real-model.mjs'
import { checkedCalls, checkNativeCase, checkUpdatedTable, incorporatesSubmission, toolHistory } from '../scripts/eval/assertions.mjs'

const tree = (type, props) => ({ root: 'r', components: [{ id: 'r', type, props }] })
const call = (id, args, name = 'ui_render') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const table = (sizes = null, price = 100) => tree('Table', {
  columns: ['Model', 'Price', ...(sizes ? ['屏幕尺寸'] : [])],
  rows: ['A', 'B', 'C'].map((m, i) => [`Model ${m}`, price + i, ...(sizes ? [sizes[i]] : [])]),
})

describe('real-model evaluation assertions', () => {
  it('rejects a schema-valid form in place of the requested multi-series chart', () => {
    const args = tree('Form', { fields: [{ name: 'revenue', label: 'Revenue', type: 'number' }] })
    checkedCalls({ tool_calls: [call('form', args)] }, config)
    expect(checkNativeCase('B3', args)).toMatch(/missing/)
    const chart = tree('Chart', { kind: 'bar', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [
      { name: 'Online', values: [1, 2, 3, 4] }, { name: 'Offline', values: [4, 3, 2, 1] },
    ] })
    expect(checkNativeCase('B3', chart)).toBeNull()
    chart.components[0].props.series.pop()
    expect(checkNativeCase('B3', chart)).toMatch(/missing/)
  })

  it('does not score orphan components that the user cannot see', () => {
    const args = tree('Text', { text: 'No table displayed' })
    args.components.push({ id: 'orphan', type: 'Table', props: { columns: ['x'], rows: [[1]], sortable: true } })
    checkedCalls({ tool_calls: [call('orphan', args)] }, config)
    expect(checkNativeCase('B2', args)).toMatch(/missing/)
  })

  it('requires all submitted parameters and rejects generic lengthy replies', () => {
    expect(incorporatesSubmission({ content: 'A generic analysis '.repeat(30) }, [])).toBe(false)
    expect(incorporatesSubmission({ content: 'APAC results for four quarters' }, [])).toBe(false)
    expect(incorporatesSubmission({ content: 'APAC，四个季度，乐观情景' }, [])).toBe(true)
    expect(incorporatesSubmission({}, [{ args: { title: 'APAC, 4 quarters, Optimistic' } }])).toBe(true)
  })

  it('requires correct per-model screen sizes and retains prior table values', () => {
    const before = table()
    expect(checkUpdatedTable(before, table(['6.1 寸', 6.7, '6.5 inches']))).toBe(true)
    expect(checkUpdatedTable(before, table([6.7, 6.1, 6.5]))).toBe(false)
    expect(checkUpdatedTable(before, table([6.1, 6.7, 6.5], 999))).toBe(false)
    const missing = table([6.1, 6.7, 6.5]); missing.components[0].props.rows.pop()
    expect(checkUpdatedTable(before, missing)).toBe(false)
  })

  it('acknowledges every validated tool call and refuses malformed histories', () => {
    const message = { content: null, tool_calls: [call('one', table()), call('two', { html: '<div>ok</div>' }, 'ui_render_widget')] }
    const checked = checkedCalls(message, config)
    expect(toolHistory('prompt', message, checked).slice(2).map(t => t.tool_call_id)).toEqual(['one', 'two'])
    expect(() => checkedCalls({ tool_calls: [message.tool_calls[0], message.tool_calls[0]] }, config)).toThrow(/unique/)
    expect(() => checkedCalls({ tool_calls: [call('bad', { root: 'absent', components: [] })] }, config)).toThrow(/validateTree/)
    expect(() => checkedCalls({ tool_calls: [call('bad', {}, 'unknown')] }, config)).toThrow(/Unexpected tool/)
  })
})

describe('real-model API client and command', () => {
  it('imports without credentials and reads the current environment key without a fixed file path', () => {
    expect(getApiKey({ DEEPSEEK_API_KEY: '  test-key  ' })).toBe('test-key')
    expect(() => getApiKey({})).toThrow(/Set DEEPSEEK_API_KEY/)
    expect(() => getApiKey({ DEEPSEEK_API_KEY: '  ' })).toThrow(/Set DEEPSEEK_API_KEY/)
  })

  it('fails without credentials or with an invalid category without overwriting the report', () => {
    const filename = new URL('../docs/real-model-eval-report.json', import.meta.url)
    const before = readFileSync(filename, 'utf8')
    for (const category of ['A', 'typo']) {
      const result = spawnSync(process.execPath, ['scripts/run-real-model-suite.mjs', category], {
        env: { ...process.env, DEEPSEEK_API_KEY: '' }, encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(category === 'A' ? /Set DEEPSEEK_API_KEY/ : /Category must be/)
    }
    expect(readFileSync(filename, 'utf8')).toBe(before)
  })

  it('runs the command offline: failures exit nonzero and partial reports exclude old cases', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-eval-'))
    const preload = path.join(dir, 'mock-api.mjs')
    // Stub only the HTTP boundary; execute the real CLI, scoring and report writer.
    writeFileSync(preload, `
      import https from 'node:https';
      import { EventEmitter } from 'node:events';
      https.request = (_url, _options, cb) => {
        const req = new EventEmitter(); req.write = () => {}; req.setTimeout = () => {};
        req.end = () => queueMicrotask(() => {
          const res = new EventEmitter(); res.statusCode = 200;
          cb(res); req.emit('response', res);
          res.emit('data', JSON.stringify({choices:[{message:{role:'assistant',content:'A sufficiently long plain text answer for an offline test.'}}]}));
          res.emit('end');
        });
        return req;
      };
    `)
    const report = path.join(dir, 'docs', 'real-model-eval-report.json')
    mkdirSync(path.dirname(report))
    writeFileSync(report, JSON.stringify({ categories: { B_nativeComponents: [{ id: 'stale', passed: true }] } }))
    const suite = fileURLToPath(new URL('../scripts/run-real-model-suite.mjs', import.meta.url))
    try {
      for (const [category, code, summary] of [
        ['A', 0, { total: 4, passed: 4, failed: 0 }],
        ['B', 1, { total: 5, passed: 0, failed: 5 }],
      ]) {
        const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, suite, category], {
          cwd: dir, env: { ...process.env, DEEPSEEK_API_KEY: 'offline-test-key' }, encoding: 'utf8',
        })
        expect(result.status, result.stderr).toBe(code)
        const saved = JSON.parse(readFileSync(report, 'utf8'))
        expect(saved.evaluationVersion).toBe(2)
        expect(saved.summary).toEqual(summary)
        expect(Object.values(saved.categories).flat().some(c => c.id === 'stale')).toBe(false)
        expect(saved.categories[category === 'A' ? 'B_nativeComponents' : 'A_plainText']).toEqual([])
      }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('uses the environment key, rejects missing messages and HTTP errors without echoing secrets', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-secret')
    let response = { choices: [{ message: { role: 'assistant', content: 'OK' } }] }
    let status = 200
    let timeout
    const request = vi.spyOn(https, 'request').mockImplementation((_url, options, callback) => {
      expect(options.headers.Authorization).toBe('Bearer test-secret')
      const req = new EventEmitter()
      req.setTimeout = (ms, fn) => { timeout = { ms, fn } }
      req.write = () => {}
      req.destroy = err => req.emit('error', err)
      req.end = () => queueMicrotask(() => {
        const res = new EventEmitter(); res.statusCode = status
        callback(res); req.emit('response', res)
        res.emit('data', JSON.stringify(response)); res.emit('end')
      })
      return req
    })
    try {
      await expect(callChat([{ role: 'user', content: 'hello' }])).resolves.toMatchObject({ content: 'OK' })
      expect(timeout.ms).toBe(120000)
      response = { choices: [] }
      await expect(callChat([])).rejects.toThrow(/no assistant message/)
      status = 401; response = { error: 'test-secret' }
      await expect(callChat([])).rejects.toThrow('DeepSeek API returned HTTP 401')
    } finally { request.mockRestore(); vi.unstubAllEnvs() }
  })
})
