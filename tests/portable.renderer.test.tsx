// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type MountedRenderer, type PortableUiArtifact } from '../renderer-src/index.tsx'
import { resetUiStateMemory } from '../client-src/state.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const tree = (value: string): PortableUiArtifact => ({
  kind: 'declarative', uiId: 'u-1', version: value === 'Hello' ? 1 : 2,
  definition: { root: 'root', components: [
    { id: 'root', type: 'Card', children: ['text', 'form'] },
    { id: 'text', type: 'Text', props: { text: value } },
    { id: 'form', type: 'Form', props: { fields: [{ name: 'who', label: 'Name', type: 'text' }] } },
  ] },
})
let host: HTMLDivElement
let renderer: MountedRenderer
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  host = document.createElement('div')
  document.body.append(host)
  renderer = mount(host, { sendPrompt: vi.fn(async () => {}) })
})
afterEach(() => {
  act(() => renderer.dispose())
  host.remove()
  vi.unstubAllGlobals()
  document.documentElement.style.colorScheme = ''
})
describe('portable renderer without a DSH Web session', () => {
  it('renders a full catalog snapshot, patches in place and preserves untouched inputs', () => {
    act(() => renderer.render(tree('Hello')))
    expect(host.textContent).toContain('Hello')
    const input = host.querySelector<HTMLInputElement>('form input')!
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Alice')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => renderer.render(tree('Version two')))
    expect(host.textContent).toContain('Version two')
    expect(host.querySelector<HTMLInputElement>('form input')?.value).toBe('Alice')
    act(() => renderer.render(tree('Hello')))
    expect(host.textContent).not.toContain('Hello') // stale v1 must be ignored
  })

  it('renders a composition artifact in block order, with inert prose and sandboxed widgets', () => {
    act(() => renderer.render({ kind: 'composition', uiId: 'comp-1', version: 1, title: 'Route', definition: { blocks: [
      { id: 'intro', type: 'markdown', text: ['## Plan', '', '<script>window.__xss=1</script>', '', '[bad](javascript:alert(1))'].join(String.fromCharCode(10)) },
      { id: 'chart', type: 'catalog', title: 'Chart', root: 'r', components: [{ id: 'r', type: 'Chart', props: { kind: 'bar', labels: ['Q1'], series: [{ name: 'S', values: [1] }] } }] },
      { id: 'more', type: 'markdown', text: 'After the chart.' },
      { id: 'sim', type: 'widget', title: 'Sim', css: '#x{}', html: '<div id="x">sim</div>', jsExpressions: ['1'] },
    ] } }))
    const parts = [...host.querySelectorAll('.diui-compose > *')]
    expect(parts.map(p => p.className)).toEqual(['diui-md', 'diui-render', 'diui-md', 'diui-remote-widget'])
    expect(parts[0]!.querySelector('h2')!.textContent).toBe('Plan')
    expect(parts[0]!.querySelector('script')).toBeNull()
    expect(parts[0]!.textContent).not.toContain('window.__xss=1')
    // A javascript: link renders as plain text, never as a link.
    expect(parts[0]!.querySelector('a')).toBeNull()
    expect(parts[0]!.textContent).toContain('bad')
    expect(parts[1]!.querySelector('.diui-chart-svg')).not.toBeNull()
    expect(parts[3]!.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
    // Older artifacts keep rendering exactly as before.
    act(() => renderer.render(tree('Hello')))
    expect(host.textContent).toContain('Hello')
  })

  it('safely fails invalid catalog definitions and updates the theme', () => {
    act(() => renderer.render({ kind: 'declarative', uiId: 'invalid', version: 1,
      definition: { root: 'no-node', components: [] } }))
    expect(host.textContent).toContain('Unsupported or invalid UI definition')
    act(() => renderer.setTheme('dark'))
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('renders Choice and sends a selected prompt only after confirmation', async () => {
    const send = vi.fn(async () => {})
    act(() => renderer.dispose())
    renderer = mount(host, { sendPrompt: send })
    act(() => renderer.render({ kind: 'declarative', uiId: 'portable-choices', version: 1,
      definition: { root: 'c', components: [{ id: 'c', type: 'Choice', props: {
        question: 'Choose a route', recommended: 'local', options: [
          { id: 'local', label: 'Local first', prompt: 'Discuss local storage; do not code.' },
          { id: 'cloud', label: 'Cloud', prompt: 'Discuss managed storage; do not code.' },
        ],
      } }] } }))
    expect(host.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
    act(() => host.querySelector<HTMLInputElement>('input[value=cloud]')!.click())
    expect(send).not.toHaveBeenCalled()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)) })
    await act(async () => host.querySelector<HTMLButtonElement>('button[type=submit]')!.click())
    expect(send).toHaveBeenCalledExactlyOnceWith('Discuss managed storage; do not code.')
  })

  it.each(['Form', 'Choice'])('refuses a new-session %s without falling back to the portable host', async type => {
    const send = vi.fn(async () => {})
    act(() => renderer.dispose())
    renderer = mount(host, { sendPrompt: send })
    act(() => renderer.render({ kind: 'declarative', uiId: `portable-new-${type}`, version: 1,
      definition: { root: 'c', components: [{ id: 'c', type, props: {
        ...(type === 'Form' ? { title: 'Discuss a plan' } : { question: 'Discuss a plan' }), sessionTarget: 'new',
        ...(type === 'Form' ? { prompt: 'Discuss the plan; do not code.', fields: [] } : { options: [
          { id: 'local', label: 'Local', prompt: 'Discuss local storage; do not code.' },
          { id: 'cloud', label: 'Cloud', prompt: 'Discuss cloud storage; do not code.' },
        ] }),
      } }] } }))
    if (type === 'Choice') act(() => host.querySelector<HTMLInputElement>('input[value=cloud]')!.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)) })
    await act(async () => host.querySelector<HTMLButtonElement>('button[type=submit]')!.click())
    expect(send).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Starting a new session is unavailable')
    expect(host.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false)
  })
})
