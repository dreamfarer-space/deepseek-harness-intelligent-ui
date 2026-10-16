// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPatch, snapshotOf } from '../src/catalog/patch.js'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import { uiTurnDefinition } from '../client-src/turn.ts'
import type { ToolResultNode, ToolViewProps } from '../client-src/types/dsh.ts'
import { latestUiVersion, resetUiVersions } from '../client-src/versions.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  resetUiVersions()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (el: React.ReactElement) => act(() => root.render(el))
function remount(el: React.ReactElement) {
  act(() => root.unmount())
  root = createRoot(host)
  render(el)
}
function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const TREE = {
  title: 'Board',
  root: 'card',
  components: [
    { id: 'card', type: 'Card', children: ['chart', 'tabs', 'form', 'plot'] },
    { id: 'chart', type: 'Chart', props: { kind: 'bar', labels: ['Q1', 'Q2'], series: [{ name: 'Rev', values: [3, 5] }] } },
    { id: 'tabs', type: 'Tabs', props: { labels: ['Notes', 'Data'] }, children: ['txt', 'tbl'] },
    { id: 'txt', type: 'Text', props: { text: 'Notes here' } },
    { id: 'tbl', type: 'Table', props: { columns: ['Day', 'Cost'], rows: [['Mon', 30], ['Tue', 10]], sortable: true } },
    { id: 'form', type: 'Form', props: { fields: [{ name: 'who', label: 'Who', type: 'text' }] } },
    { id: 'plot', type: 'Plot', props: { functions: [{ expr: 'a*x' }], params: [{ name: 'a', min: -3, max: 3, step: 0.5, value: 1 }] } },
  ],
}
const PATCH = {
  uiId: 'dash',
  baseVersion: 1,
  ops: [
    { op: 'setProps', id: 'chart', props: { kind: 'line' } },
    { op: 'setProps', id: 'form', props: { fields: [{ name: 'who', label: 'Who', type: 'text' }, { name: 'n', label: 'N', type: 'number', default: 7 }] } },
  ],
}
const patched = (() => {
  const r = applyPatch(snapshotOf('dash', TREE), PATCH)
  if (!r.ok) throw new Error(r.errors.join())
  return r.ui
})()

const renderBlock: ToolResultNode = { kind: 'tool-result', callId: 'dash', call: { name: 'ui_render', argsRaw: JSON.stringify(TREE) }, content: [], isError: false, meta: { ok: true } }
const patchBlock = (meta: unknown, extra: Partial<ToolResultNode> = {}): ToolResultNode => ({ kind: 'tool-result', callId: 'p1', call: { name: 'ui_patch', argsRaw: JSON.stringify(PATCH) }, content: [{ type: 'text', text: 'UI not changed\n- ops[0]: bad' }], isError: false, meta, ...extra })
const base = { t, sendPrompt: vi.fn(async () => {}) }
const original = () => <RenderView {...base} callId="dash" toolName="ui_render" phase="result" block={renderBlock} />
const patchView = (block: ToolResultNode) => <PatchView {...base} callId={block.callId} toolName="ui_patch" phase="result" block={block} />

/** Fold the durable events like the conversation engine does (live or on replay). */
function fold(events: { type: string; data: any }[]) {
  let state: any
  events.forEach((e, seq) => {
    const event = { ...e, seq, time: seq, surfaceOp: e.type === 'tool/result' ? 'append' : undefined }
    const m = uiTurnDefinition.match(event)
    if (!m) return
    state = m.role === 'start' ? uiTurnDefinition.start(undefined, { event }) : uiTurnDefinition.update({ state }, { event })
  })
  return state
}
const result = (callId: string, meta: unknown) => ({ type: 'tool/result', data: { turn: 1, message: { source: { callId }, content: [], isError: false }, meta } })

describe('ui_patch in the browser', () => {
  it('updates the chart in place and keeps sort, tab, form input and slider state', () => {
    render(original())
    act(() => [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')][1].click())
    const cost = () => [...host.querySelectorAll<HTMLButtonElement>('th button')][1]
    act(() => cost().click())
    act(() => setValue(host.querySelector('form input')!, 'Ada'))
    act(() => setValue(host.querySelector('.diui-param input[type=range]')!, '-2'))
    expect(host.querySelectorAll('.diui-chart-svg rect[rx="2"]').length).toBeGreaterThan(0)

    // Turn 2: the patch result arrives; the version registry learns about it.
    fold([
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'tool/call', data: { turn: 1, callId: 'dash', name: 'ui_render', arguments: JSON.stringify(TREE) } },
      result('dash', { ok: true }),
      { type: 'tool/call', data: { turn: 1, callId: 'p1', name: 'ui_patch', arguments: JSON.stringify(PATCH) } },
      result('p1', { ok: true, ui: patched }),
    ])
    expect(latestUiVersion('dash')).toEqual({ version: 2, title: 'Board' })
    render(<>{original()}{patchView(patchBlock({ ok: true, ui: patched }))}</>)

    const [old, next] = [...host.querySelectorAll<HTMLElement>('.diui-shell')]
    expect(old.querySelector('.diui-shell-body')).toBeNull()
    expect(old.textContent).toContain('Updated to version 2')
    expect(next.querySelector('.diui-shell-status')!.textContent).toBe('Version 2')
    expect(next.querySelectorAll('.diui-chart-svg rect[rx="2"]').length).toBe(0)
    expect(next.querySelector('.diui-chart-svg path[fill=none]')).not.toBeNull()
    expect(next.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe('Data')
    expect([...next.querySelectorAll('tbody tr td:first-child')].map(td => td.textContent)).toEqual(['Tue', 'Mon'])
    const inputs = [...next.querySelectorAll<HTMLInputElement>('form input')]
    expect(inputs.map(i => i.value)).toEqual(['Ada', '7'])
    expect(next.querySelector<HTMLInputElement>('.diui-param input[type=range]')!.value).toBe('-2')

    // A reload replays the same events and restores the same picture.
    resetUiStateMemory()
    remount(<>{original()}{patchView(patchBlock({ ok: true, ui: patched }))}</>)
    expect(host.querySelectorAll('.diui-shell-body').length).toBe(1)
    expect(host.querySelector<HTMLInputElement>('form input')!.value).toBe('Ada')
  })

  it('never shows a half-applied patch: streaming, refused and stopped patches leave the previous version live', () => {
    fold([{ type: 'turn/start', data: { turn: 1 } }, { type: 'tool/call', data: { turn: 1, callId: 'dash', name: 'ui_render', arguments: JSON.stringify(TREE) } }, result('dash', { ok: true })])
    const raw = JSON.stringify(PATCH)
    render(<>{original()}<PatchView {...base} callId="p1" toolName="ui_patch" phase="preparing" block={{ phase: 'preparing', callId: 'p1' }} useToolCallArgumentsPartial={() => raw.slice(0, raw.length / 2)} /></>)
    let shells = [...host.querySelectorAll<HTMLElement>('.diui-shell')]
    expect(shells[0].querySelector('.diui-chart-svg')).not.toBeNull()
    expect(shells[1].dataset.state).toBe('generating')
    expect(shells[1].querySelector('.diui-shell-body')).toBeNull()
    expect(shells[1].textContent).toContain(en['patch.updating'])

    render(<>{original()}{patchView(patchBlock({ ok: false, code: 'invalid' }))}</>)
    shells = [...host.querySelectorAll<HTMLElement>('.diui-shell')]
    expect(shells[0].querySelector('.diui-chart-svg rect[rx="2"]')).not.toBeNull()
    expect(shells[1].dataset.state).toBe('error')
    expect(shells[1].textContent).toContain(en['patch.invalid'])

    render(<>{original()}{patchView(patchBlock(undefined, { isError: true, error: { name: 'Interrupted', code: 'interrupted' } }))}</>)
    shells = [...host.querySelectorAll<HTMLElement>('.diui-shell')]
    expect(shells[0].querySelector('.diui-chart-svg rect[rx="2"]')).not.toBeNull()
    expect(shells[1].dataset.state).toBe('stopped')
    expect(shells[1].textContent).toContain(en['patch.stopped'])
    expect(shells[1].querySelector('.diui-shell-body')).toBeNull()
    expect(latestUiVersion('dash')?.version).toBe(1)
  })
})
