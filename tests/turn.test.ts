import { describe, expect, it } from 'vitest'
import { presented, presentable, selectTurnResults, TURN_DATA_KEY, uiTurnDefinition } from '../client-src/turn.ts'

const ev = (type: string, seq: number, data: Record<string, unknown>, surfaceOp?: string) => ({ type, seq, time: seq, data, ...(surfaceOp ? { surfaceOp } : {}) })
const result = (seq: number, callId: string, meta: unknown, isError = false) =>
  ev('tool/result', seq, { turn: 1, message: { source: { callId }, content: [{ type: 'text', text: 'ok' }], isError }, meta }, 'append')

function run(events: ReturnType<typeof ev>[]) {
  let state: any
  for (const event of events) {
    const m = uiTurnDefinition.match(event)
    if (!m) continue
    state = m.role === 'start' ? uiTurnDefinition.start(undefined, { event }) : uiTurnDefinition.update({ state }, { event })
  }
  return state
}

describe('turn definition', () => {
  it('collects settled, successful UI results only', () => {
    const state = run([
      ev('turn/start', 1, { turn: 1 }),
      ev('tool/call', 2, { turn: 1, callId: 'a', name: 'ui_render', arguments: '{"root":"r"}' }),
      ev('tool/call', 3, { turn: 1, callId: 'b', name: 'bash', arguments: '{}' }),
      ev('tool/call', 4, { turn: 1, callId: 'c', name: 'ui_render_widget', arguments: '{"html":"x"}' }),
      ev('tool/call', 5, { turn: 1, callId: 'd', name: 'ui_render', arguments: '{}' }),
      result(6, 'a', { ok: true }),
      result(7, 'b', undefined),
      result(8, 'c', { ok: true }),
      result(9, 'd', { ok: false }),
      ev('tool/result', 10, { turn: 1, message: { source: { callId: 'a' }, content: [] } }, 'replace'),
    ])
    expect(state.results.map((r: any) => [r.callId, r.call.name, r.seq])).toEqual([['a', 'ui_render', 6], ['c', 'ui_render_widget', 8]])
    const loc = uiTurnDefinition.buildLocationData({ state }, 'turn', undefined)
    expect(loc).toMatchObject({ kind: 'turn', turn: 1, key: TURN_DATA_KEY })
    expect(uiTurnDefinition.buildLocationData({ state }, 'turn', loc)).toBe(loc)
    expect(uiTurnDefinition.buildLocationData({ state }, 'step', undefined)).toBeNull()
  })

  it('bounds the tail by the turn end and skips failures', () => {
    const data = { results: [{ callId: 'a', seq: 5 }, { callId: 'b', seq: 50 }] }
    const owner = { seq: 99, turn: { end: { seq: 20 }, data: { get: (k: string) => (k === TURN_DATA_KEY ? data : undefined) } } }
    expect(selectTurnResults(owner as never).map(r => r.callId)).toEqual(['a'])
    expect(selectTurnResults({ seq: 1, turn: { data: { get: () => undefined } } })).toEqual([])
    expect(presentable({ ok: false }, false)).toBe(false)
    expect(presentable(undefined, true)).toBe(false)
    expect(presentable({ ok: true }, false)).toBe(true)
  })

  it('tracks which calls the tail presents (ref-counted)', () => {
    const off1 = presented.add('x')
    const off2 = presented.add('x')
    expect(presented.has('x')).toBe(true)
    off1()
    expect(presented.has('x')).toBe(true)
    off2()
    expect(presented.has('x')).toBe(false)
  })
})
