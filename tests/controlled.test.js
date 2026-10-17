import { describe, expect, it, vi } from 'vitest'
import { CONTROL_LIMITS, createControlledRuntime, projectData, validateSchema } from '../src/controlled/runtime.js'
import { validateProps, validateTree } from '../src/catalog/catalog.js'
const ctx = { sessionId: 'session-a', uiId: 'board' }
const ref = { id: 'checks', scope: 'board' }
const dataset = () => ({ columns: ['Name', 'Count', 'Status'], rows: [['A', 10, 'failed'], ['B', 2, 'passed'], ['C', 5, 'failed']] })
const schema = { type: 'object', properties: { name: { type: 'string', maxLength: 20 } }, required: ['name'], additionalProperties: false }
const request = (args = { name: 'A' }) => ({ actionId: 'retry', args, requestId: 'once' })
// Unit-test fixture for the trusted-host boundary; real synthetic DOM events remain denied.
const click = () => Object.defineProperty(new Event('click'), 'isTrusted', { value: true })
const setup = (overrides = {}) => {
  const runtime = createControlledRuntime('session-a'), run = vi.fn(async () => ({ accepted: true }))
  runtime.registerAction('board', 'retry', { schema, effect: 'write', authorize: async () => true, confirm: async () => true, run, ...overrides })
  return { runtime, run }
}
describe('scoped data registry', () => {
  it('clones/freezes data, links pure local queries, and notifies subscribers', () => {
    const r = createControlledRuntime('session-a'), d = dataset(), notify = vi.fn()
    r.subscribe(notify); r.registerData('board', 'checks', d); d.rows[0][1] = 99
    expect(r.readData(ctx, ref).value.rows[0][1]).toBe(10)
    expect(() => { r.readData(ctx, ref).value.rows[0][1] = 8 }).toThrow()
    expect(() => { r.readData(ctx, ref).view.page = 9 }).toThrow()
    r.setView(ctx, ref, { filterColumn: 2, filterValue: 'failed', sortColumn: 1 })
    expect(projectData(r.readData(ctx, ref)).rows.map(r => r[0])).toEqual(['C', 'A'])
    r.setView(ctx, ref, { search: 'C' })
    expect(projectData(r.readData(ctx, ref)).rows.map(r => r[0])).toEqual(['C'])
    expect(notify).toHaveBeenCalledTimes(3)
  })
  it('denies cross-session/UI references, expiry and disposed sessions', () => {
    const r = createControlledRuntime('session-a'); const release = r.registerData('board', 'checks', dataset())
    for (const [c, f] of [[{ ...ctx, sessionId: 'b' }, ref], [{ ...ctx, uiId: 'other' }, ref], [ctx, { ...ref, scope: 'other' }]]) expect(() => r.readData(c, f)).toThrow(/scope/i)
    release(); expect(() => r.readData(ctx, ref)).toThrow(/unavailable/)
    r.registerData('board', 'checks', dataset()); r.releaseScope('board'); expect(() => r.readData(ctx, ref)).toThrow()
    r.dispose(); expect(() => r.registerData('board', 'checks', dataset())).toThrow(/disposed/)
  })
  it('rejects oversized, malformed and non-JSON data and local queries', () => {
    const r = createControlledRuntime('session-a')
    expect(() => r.registerData('board', 'big', { columns: ['x'], rows: [['x'.repeat(CONTROL_LIMITS.dataBytes)]] })).toThrow(/limit/)
    expect(() => r.registerData('board', 'bad', { columns: ['x'], rows: [[Infinity]] })).toThrow(/JSON/)
    expect(() => r.registerData('board', 'bad', { columns: ['x'], rows: [[1, 2]] })).toThrow(/dataset/)
    r.registerData('board', 'checks', dataset())
    expect(() => r.setView(ctx, ref, { sortColumn: 4 })).toThrow(/query/)
    expect(() => r.setView(ctx, ref, { js: 'evil' })).toThrow(/query/)
  })
})
describe('allowlisted action execution', () => {
  it('rejects automatic/synthetic calls and forged user-gesture flags', async () => {
    const { runtime, run } = setup()
    for (const event of [undefined, { isTrusted: true, type: 'click' }, new Event('click')]) await expect(runtime.invokeAction(ctx, request(), event)).rejects.toThrow(/trusted user click/)
    expect(run).not.toHaveBeenCalled()
  })
  it('requires registration, session/UI scope, and strict bounded schema parameters', async () => {
    const { runtime, run } = setup()
    await expect(runtime.invokeAction(ctx, { ...request(), actionId: 'shell.exec' }, click())).rejects.toThrow(/Unregistered/)
    await expect(runtime.invokeAction({ ...ctx, sessionId: 'other' }, request(), click())).rejects.toThrow(/Scope/)
    await expect(runtime.invokeAction({ ...ctx, uiId: 'other' }, request(), click())).rejects.toThrow(/Unregistered/)
    for (const args of [{}, { name: 1 }, { name: 'A', tool: 'shell' }, { name: 'x'.repeat(21) }, { name: 'x'.repeat(17000) }]) await expect(runtime.invokeAction(ctx, request(args), click())).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
  it('requires host permission AND explicit write confirmation, including changed permission', async () => {
    for (const overrides of [{ authorize: async () => false }, { confirm: async () => false }, { authorize: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false) }]) {
      const { runtime, run } = setup(overrides)
      await expect(runtime.invokeAction(ctx, request(), click())).rejects.toThrow(/denied|cancelled/)
      expect(run).not.toHaveBeenCalled()
    }
    expect(() => setup({ confirm: undefined })).toThrow(/confirmation/)
  })
  it('caches pending/success receipts, rejects changed arguments under the same key', async () => {
    const { runtime, run } = setup()
    const [a, b] = await Promise.all([runtime.invokeAction(ctx, request(), click()), runtime.invokeAction(ctx, request(), click())])
    expect(a).toEqual({ accepted: true }); expect(a).toEqual(b); expect(run).toHaveBeenCalledTimes(1)
    await runtime.invokeAction(ctx, request(), click()); expect(run).toHaveBeenCalledTimes(1)
    await expect(runtime.invokeAction(ctx, request({ name: 'B' }), click())).rejects.toThrow(/Idempotency/)
  })
  it('caches failures so retrying an uncertain write cannot execute it twice', async () => {
    const run = vi.fn(async () => { throw new Error('offline') }), { runtime } = setup({ run })
    await expect(runtime.invokeAction(ctx, request(), click())).rejects.toThrow('offline')
    await expect(runtime.invokeAction(ctx, request(), click())).rejects.toThrow('offline')
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('lets a cancelled operation be confirmed again with the same request id', async () => {
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    const { runtime, run } = setup({ confirm })
    const first = await Promise.allSettled([
      runtime.invokeAction(ctx, request(), click()),
      runtime.invokeAction(ctx, request(), click()),
    ])
    expect(first.every(r => r.status === 'rejected' && r.reason.message === 'Action cancelled')).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
    await expect(runtime.invokeAction(ctx, request(), click())).resolves.toEqual({ accepted: true })
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('rechecks a denied permission on a later explicit attempt', async () => {
    for (const failedCheck of [1, 2]) {
      let checks = 0
      const authorize = vi.fn(async () => ++checks !== failedCheck)
      const { runtime, run } = setup({ authorize })
      await expect(runtime.invokeAction(ctx, request(), click())).rejects.toThrow('Action permission denied')
      expect(run).not.toHaveBeenCalled()
      await expect(runtime.invokeAction(ctx, request(), click())).resolves.toEqual({ accepted: true })
      expect(run).toHaveBeenCalledTimes(1)
      expect(authorize).toHaveBeenCalledTimes(failedCheck + 2)
    }
  })
  it('releases receipts when permission/confirmation callbacks fail before run', async () => {
    for (const callback of ['authorize', 'confirm']) {
      const check = vi.fn().mockRejectedValueOnce(new Error('approval offline')).mockResolvedValue(true)
      const { runtime, run } = setup({ [callback]: check })
      await expect(runtime.invokeAction(ctx, request(), click())).rejects.toThrow('approval offline')
      expect(run).not.toHaveBeenCalled()
      await expect(runtime.invokeAction(ctx, request(), click())).resolves.toEqual({ accepted: true })
      expect(run).toHaveBeenCalledTimes(1)
    }
  })
  it('rechecks revocation/disposal after async permission/confirmation', async () => {
    const { runtime, run } = setup({ confirm: async () => { runtime.releaseScope('board'); return true } })
    await expect(runtime.invokeAction(ctx, request(), click())).rejects.toThrow(/revoked/); expect(run).not.toHaveBeenCalled()
    const other = setup({ authorize: async () => { other.runtime.dispose(); return true } })
    await expect(other.runtime.invokeAction(ctx, request(), click())).rejects.toThrow(/disposed/)
  })
  it('snapshots requests before awaiting authorization and bounds receipts/results', async () => {
    const q = request(), { runtime, run } = setup({ authorize: async () => { q.actionId = 'evil'; q.args.name = 'changed'; return true } })
    await runtime.invokeAction(ctx, q, click()); expect(run.mock.calls[0][0]).toEqual({ name: 'A' })
    const big = setup({ run: async () => 'x'.repeat(CONTROL_LIMITS.resultBytes) })
    await expect(big.runtime.invokeAction(ctx, request(), click())).rejects.toThrow(/limit/)
    for (let i = 0; i < CONTROL_LIMITS.receipts - 1; i++) await runtime.invokeAction(ctx, { ...request(), requestId: String(i) }, click())
    await expect(runtime.invokeAction(ctx, { ...request(), requestId: 'extra' }, click())).rejects.toThrow(/Receipt limit/)
  })
  it('fails closed on unsupported schemas and rejects non-finite arguments', () => {
    expect(() => validateSchema({ ...schema, patternProperties: {} }, {}, true)).toThrow(/Unsupported/)
    expect(() => validateSchema({ type: 'number' }, NaN)).toThrow(/number/)
    expect(() => validateSchema({ ...schema, additionalProperties: true }, {}, true)).toThrow()
  })
})
describe('declarative references and actions', () => {
  it('accepts shared dataRef and controlled Buttons, preserving inline validation', () => {
    expect(validateTree({ root: 'root', components: [
      { id: 'root', type: 'Stack', children: ['t','c','b'] },
      { id: 't', type: 'Table', props: { dataRef: ref } },
      { id: 'c', type: 'Chart', props: { kind: 'bar', dataRef: ref, labelColumn: 0, valueColumns: [1] } },
      { id: 'b', type: 'Button', props: { label: 'Retry', action: { actionId: 'retry', args: { name: 'A' } } } },
    ] }).ok).toBe(true)
    expect(validateProps('Table', {})).not.toHaveLength(0)
    expect(validateProps('Chart', { kind: 'bar', dataRef: ref, labelColumn: 0.5, valueColumns: [1] })).not.toHaveLength(0)
    expect(validateProps('Table', { dataRef: ref, columns: ['x'], rows: [] })).not.toHaveLength(0)
    expect(validateProps('Button', { label: 'x' })).not.toHaveLength(0)
    expect(validateProps('Button', { label: 'x', prompt: 'hello', action: { actionId: 'a', args: {} } })).not.toHaveLength(0)
  })
})
