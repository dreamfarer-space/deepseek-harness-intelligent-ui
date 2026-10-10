// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inTurn, resetInterruptedMemory, stashInterrupted } from '../client-src/interrupted.ts'
import { en } from '../client-src/locales.ts'
import { TurnTail } from '../client-src/TurnTail.tsx'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { WidgetView } from '../client-src/widget/WidgetView.tsx'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetInterruptedMemory()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const WIDGET = { title: 'Orbits', css: '.a{}', html: '<h3>Inner planets</h3><div class="sky">', jsFunctions: 'function f(){}', jsExpressions: ['f()'] }
const owner = (start: number, end: number, results: unknown[] = []) => ({
  seq: 10,
  turn: { start: { time: start }, end: { seq: 10, time: end }, data: { get: () => ({ results }) } },
})

describe('interrupted UI calls', () => {
  it('a streaming widget dropped by DSH (turn stopped) is stashed for its session', async () => {
    const raw = JSON.stringify(WIDGET)
    const partial = raw.slice(0, raw.indexOf('"jsFunctions"') - 10)
    act(() => root.render(<WidgetView callId="w1" toolName="ui_render_widget" t={t} sendPrompt={vi.fn()} sessionId="s1" phase="preparing" block={{ phase: 'preparing', callId: 'w1' }} useToolCallArgumentsPartial={() => partial} />))
    await act(async () => { await new Promise(r => setTimeout(r, 150)) })
    act(() => root.render(<div />)) // DSH removes the dropped call
    const stored = JSON.parse(localStorage.getItem('diui:v1:interrupted:s1')!)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ callId: 'w1', toolName: 'ui_render_widget', argsRaw: partial })
  })

  it('the turn tail re-presents a stashed call as a stopped preview, unless a real result exists', () => {
    const now = Date.now()
    const raw = JSON.stringify(WIDGET)
    stashInterrupted('s1', { callId: 'w2', toolName: 'ui_render_widget', argsRaw: raw.slice(0, raw.indexOf('"jsFunctions"') - 10), at: now })
    act(() => root.render(<TurnTail {...owner(now - 5000, now + 100)} t={t} sendPrompt={vi.fn()} sessionId="s1" />))
    const shell = host.querySelector('.diui-shell')!
    expect(shell.getAttribute('data-state')).toBe('stopped')
    expect(host.textContent).toContain(en['widget.stopped'])
    expect(host.querySelector('iframe')!.dataset.mode).toBe('preview')
    // A different turn (outside the time window) does not claim it.
    act(() => root.render(<TurnTail {...owner(now + 60000, now + 70000)} t={t} sendPrompt={vi.fn()} sessionId="s1" />))
    expect(host.querySelector('.diui-shell')).toBeNull()
    // A completed result with the same callId wins over the stash.
    const result = { kind: 'tool-result', callId: 'w2', seq: 5, call: { name: 'ui_render_widget', argsRaw: raw }, content: [], isError: false, meta: { ok: true } }
    act(() => root.render(<TurnTail {...owner(now - 5000, now + 100, [result])} t={t} sendPrompt={vi.fn()} sessionId="s1" />))
    expect(host.querySelectorAll('.diui-shell')).toHaveLength(1)
    expect(host.querySelector('.diui-shell')!.getAttribute('data-state')).toBe('ready')
  })

  it('matches turns by time with a tolerance and ignores non-epoch times', () => {
    const e = { callId: 'x', toolName: 'ui_render', argsRaw: '{', at: 1_800_000_000_000 }
    expect(inTurn(e, 1_800_000_000_000 - 1000, 1_800_000_000_000 + 5)).toBe(true)
    expect(inTurn(e, 1_800_000_000_000 + 5000, undefined)).toBe(false)
    // The follow-up turn the user starts right after stopping does not claim it.
    expect(inTurn(e, 1_800_000_000_000 + 1200, 1_800_000_000_000 + 4000)).toBe(false)
    expect(inTurn(e, 12, 13)).toBe(false)
  })
})
