// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rawPrefixOf, usePartialArguments } from '../client-src/stream/args.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Minimal stand-in for DSH 0.2.1's PartialArguments: grows in place via `chunks`. */
class FakeArgs {
  chunks: string[] = []
  append(s: string) { this.chunks.push(s) }
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

let seen = ''
function Probe(props: { view: ToolViewProps }) {
  seen = usePartialArguments(props.view, 50)
  return null
}
const base = { callId: 'c1', toolName: 'ui_render_widget', t: (k => k) as ToolViewProps['t'], sendPrompt: async () => {} }

describe('usePartialArguments', () => {
  it('uses the DSH ≤ 0.2.0 hook when present', () => {
    const view = { ...base, phase: 'preparing', block: { phase: 'preparing', callId: 'c1' }, useToolCallArgumentsPartial: () => '{"title":"A' } as ToolViewProps
    act(() => root.render(<Probe view={view} />))
    expect(seen).toBe('{"title":"A')
  })

  it('samples the growing args view on DSH 0.2.1+', () => {
    const args = new FakeArgs()
    args.append('{"title":"Or')
    const view = { ...base, phase: 'preparing', block: { phase: 'preparing', callId: 'c1', args } } as unknown as ToolViewProps
    act(() => root.render(<Probe view={view} />))
    expect(seen).toBe('{"title":"Or')
    args.append('bits","css":".a{')
    act(() => { vi.advanceTimersByTime(60) })
    expect(seen).toBe('{"title":"Orbits","css":".a{')
  })

  it('returns an empty prefix once dispatched', () => {
    const view = { ...base, phase: 'start', block: { phase: 'start', callId: 'c1', argsRaw: '{}', args: new FakeArgs() } } as unknown as ToolViewProps
    act(() => root.render(<Probe view={view} />))
    expect(seen).toBe('')
  })
})

describe('rawPrefixOf', () => {
  it('rebuilds a prefix from the public readers when no source text is exposed', () => {
    const fields: Record<string, { text?: string; value?: unknown; done: boolean }> = {
      title: { text: 'Orbits', done: true },
      height: { value: 300, done: true },
      html: { text: '<h3>In"ner', done: false },
    }
    const view = {
      keys: () => Object.keys(fields),
      text: (k: string) => fields[k]?.text,
      value: (k: string) => fields[k]?.value,
      complete: (k: string) => fields[k]?.done ?? false,
      closed: () => false,
    }
    expect(rawPrefixOf(view)).toBe('{"title":"Orbits","height":300,"html":"<h3>In\\"ner')
  })

  it('is total for missing or foreign values', () => {
    expect(rawPrefixOf(undefined)).toBe('')
    expect(rawPrefixOf({ chunks: [1, 2] })).toBe('')
  })
})
