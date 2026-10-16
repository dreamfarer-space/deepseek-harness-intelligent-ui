import { describe, expect, it } from 'vitest'
import { applyPatch, collectUis, snapshotOf } from '../src/catalog/patch.js'
import { clientPolicy, resolveConfig } from '../src/config.js'
import { createPatchTool, PATCH_TOOL } from '../src/tools/patch.js'
import { createRenderTool, RENDER_TOOL } from '../src/tools/render.js'
import { DASHBOARD } from '../scripts/e2e/scenarios.mjs'

const config = resolveConfig({})
const TOOLS = { render: RENDER_TOOL, patch: PATCH_TOOL }
const tool = createPatchTool(config)

/** A conversation history in Session.deriveMessages() shape. */
function history(...calls) {
  const messages = []
  for (const c of calls) {
    messages.push({ role: 'assistant', content: [{ type: 'tool-call', id: c.id, name: c.name, arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) }] })
    if (c.result !== 'pending') messages.push({ role: 'tool', toolCallId: c.id, isError: c.result === 'error', content: [{ type: 'text', text: '…' }] })
  }
  return messages
}
const execIn = messages => ({ callId: 'now', agent: { session: { deriveMessages: () => messages } } })
const dash = { id: 'dash', name: RENDER_TOOL, args: DASHBOARD }
const toLine = { uiId: 'dash', baseVersion: 1, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'line' } }] }
const byId = ui => new Map(ui.components.map(n => [n.id, n]))

describe('applyPatch', () => {
  const v1 = snapshotOf('dash', DASHBOARD)

  it('changes one component and leaves every other component as it was', () => {
    const r = applyPatch(v1, toLine)
    expect(r.ok).toBe(true)
    expect(r.ui.version).toBe(2)
    expect(r.changed).toEqual(['chart'])
    const before = byId(v1)
    const after = byId(r.ui)
    expect(after.get('chart').props).toEqual({ ...before.get('chart').props, kind: 'line' })
    for (const id of before.keys()) if (id !== 'chart') expect(after.get(id)).toEqual(before.get(id))
    // The input snapshot is never mutated.
    expect(before.get('chart').props.kind).toBe('bar')
  })

  it('inserts, replaces and removes components', () => {
    const r = applyPatch(v1, {
      uiId: 'dash',
      baseVersion: 1,
      title: 'Sales v2',
      ops: [
        { op: 'insertChild', parent: 'kpis', id: 'k5', nodes: [{ id: 'k5', type: 'Stat', props: { label: 'NPS', value: 61 } }] },
        { op: 'removeNode', id: 'k4' },
        { op: 'replaceNode', id: 'timeline', node: { type: 'Stack', children: ['note'] }, nodes: [{ id: 'note', type: 'Text', props: { text: 'Milestones moved' } }] },
        { op: 'setProps', id: 'regions', unset: ['caption'] },
      ],
    })
    expect(r.ok).toBe(true)
    const ui = byId(r.ui)
    expect(r.ui.title).toBe('Sales v2')
    expect(ui.get('kpis').children).toEqual(['k1', 'k2', 'k3', 'k5'])
    expect(ui.has('k4')).toBe(false)
    expect(ui.get('timeline')).toEqual({ id: 'timeline', type: 'Stack', children: ['note'] })
    expect(ui.get('regions').props.caption).toBeUndefined()
    // Parents precede children, so the result streams/renders progressively.
    const order = r.ui.components.map(n => n.id)
    expect(order.indexOf('timeline')).toBeLessThan(order.indexOf('note'))
  })

  it('rejects stale versions, unknown ids, invalid props and structural damage, all-or-nothing', () => {
    const errorsOf = args => { const r = applyPatch(v1, args); expect(r.ok).toBe(false); return r }
    expect(errorsOf({ ...toLine, baseVersion: 2 })).toMatchObject({ code: 'stale' })
    expect(errorsOf({ ...toLine, baseVersion: 2 }).errors[0]).toMatch(/is at version 1, not 2/)
    expect(errorsOf({ uiId: 'dash', ops: toLine.ops }).errors[0]).toMatch(/baseVersion/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'setProps', id: 'nope', props: {} }] }).errors[0]).toMatch(/unknown component id "nope"/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'scatter' } }] }).errors.join()).toMatch(/kind: expected one of bar/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'setProps', id: 'chart', props: { labels: ['Q1'] } }] }).errors.join()).toMatch(/has 4 values but labels has 1/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'explode', id: 'chart' }] }).errors[0]).toMatch(/op: expected one of/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'removeNode', id: 'card' }] }).errors[0]).toMatch(/root cannot be removed/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'removeNode', id: 'chart' }] }).errors.join()).toMatch(/Tabs has 4 labels but 3 children/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'insertChild', parent: 'chart', id: 'x', nodes: [{ id: 'x', type: 'Divider' }] }] }).errors.join()).toMatch(/Chart cannot have children/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'insertChild', parent: 'kpis', id: 'k1' }] }).errors[0]).toMatch(/already has a parent/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'insertChild', parent: 'kpis', id: 'k1', nodes: [{ id: 'k1', type: 'Divider' }] }] }).errors[0]).toMatch(/already exists/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'replaceNode', id: 'kpis', node: { type: 'Grid', props: { columns: 2 }, children: ['k1', 'tabs'] } }] }).errors.join()).toMatch(/cycle|two parents/)
    expect(errorsOf({ ...toLine, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'line' }, node: {} }] }).errors[0]).toMatch(/not a field of setProps/)
    expect(errorsOf({ ...toLine, ops: Array.from({ length: 51 }, () => toLine.ops[0]) }).errors[0]).toMatch(/more than 50/)
    // A valid op followed by an invalid one changes nothing.
    const r = errorsOf({ ...toLine, ops: [toLine.ops[0], { op: 'setProps', id: 'nope', props: {} }] })
    expect(r.errors[0]).toMatch(/^ops\[1\]/)
    expect(byId(v1).get('chart').props.kind).toBe('bar')
  })

  it('removing a Tabs panel works together with its label', () => {
    const r = applyPatch(v1, { uiId: 'dash', baseVersion: 1, ops: [{ op: 'removeNode', id: 'timeline' }, { op: 'setProps', id: 'tabs', props: { labels: ['Revenue', 'Regions', 'Forecast'] } }] })
    expect(r.ok).toBe(true)
    expect(byId(r.ui).get('tabs').children).toEqual(['chart', 'regions', 'form'])
  })
})

describe('collectUis', () => {
  it('replays renders and accepted patches; ignores refused, failed and pending calls', () => {
    const uis = collectUis(history(
      dash,
      { id: 'bad', name: RENDER_TOOL, args: { root: 'r', components: [{ id: 'r', type: 'Nope' }] } },
      { id: 'p1', name: PATCH_TOOL, args: toLine },
      { id: 'p-stale', name: PATCH_TOOL, args: { ...toLine, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'area' } }] } },
      { id: 'p-err', name: PATCH_TOOL, args: { uiId: 'dash', baseVersion: 2, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'pie' } }] }, result: 'error' },
      { id: 'p-pending', name: PATCH_TOOL, args: { uiId: 'dash', baseVersion: 2, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'area' } }] }, result: 'pending' },
      { id: 'garbled', name: PATCH_TOOL, args: '{"uiId":' },
    ), TOOLS)
    expect([...uis.keys()]).toEqual(['dash'])
    const ui = uis.get('dash')
    expect(ui.version).toBe(2)
    expect(byId(ui).get('chart').props.kind).toBe('line')
  })
})

describe('ui_patch tool', () => {
  it('patches a UI of this conversation and ships the full next version to the browser only', async () => {
    const value = await tool.execute(toLine, execIn(history(dash)))
    expect(value.ok).toBe(true)
    expect(value.summary).toMatch(/uiId dash, now version 2 \(changed: chart\)/)
    expect(value.summary).toMatch(/chart:Chart/)
    const meta = tool.output.presentationMeta(toLine, value)
    expect(meta).toMatchObject({ ok: true, policy: clientPolicy(config), ui: { uiId: 'dash', version: 2, root: 'card' } })
    expect(byId(meta.ui).get('chart').props.kind).toBe('line')
    const text = tool.output.render(toLine, value)[0].text
    expect(text).toBe(value.summary)
    expect(text).not.toMatch(/Online/)
  })

  it('chains versions across turns and refuses stale or foreign targets', async () => {
    const v2 = history(dash, { id: 'p1', name: PATCH_TOOL, args: toLine })
    const again = await tool.execute(toLine, execIn(v2))
    expect(again).toMatchObject({ ok: false, code: 'stale' })
    expect(tool.output.presentationMeta(toLine, again)).toEqual({ ok: false, policy: clientPolicy(config), code: 'stale' })
    const next = await tool.execute({ ...toLine, baseVersion: 2, ops: [{ op: 'setProps', id: 'chart', props: { kind: 'area' } }] }, execIn(v2))
    expect(next).toMatchObject({ ok: true, ui: { version: 3 } })
    // Another conversation's UI is not addressable.
    const foreign = await tool.execute(toLine, execIn(history({ ...dash, id: 'other' })))
    expect(foreign).toMatchObject({ ok: false, code: 'unknown' })
    expect(foreign.errors[0]).toMatch(/no UI "dash" in this conversation; known: other \(v1 "Quarterly sales/)
    expect(await tool.execute(toLine, { callId: 'x' })).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await tool.execute({ ops: [] }, execIn([]))).toMatchObject({ ok: false })
  })

  it('declares an exclusive schema inside the DSH JSON-schema subset', () => {
    expect(tool.name).toBe(PATCH_TOOL)
    expect(tool.isConcurrencySafe()).toBe(false)
    expect(tool.parameters.required).toEqual(['uiId', 'baseVersion', 'ops'])
    expect(JSON.stringify(tool.parameters)).not.toMatch(/\$ref|anyOf|allOf/)
  })
})

describe('ui_render identity', () => {
  it('tells the model the uiId and version it can patch', async () => {
    const value = await createRenderTool(config).execute(structuredClone(DASHBOARD), { callId: 'toolu_1' })
    expect(value.summary).toMatch(/uiId toolu_1, version 1/)
  })
})
