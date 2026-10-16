// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type MountedRenderer, type PortableUiArtifact } from '../renderer-src/index.tsx'

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

  it('safely fails invalid catalog definitions and updates the theme', () => {
    act(() => renderer.render({ kind: 'declarative', uiId: 'invalid', version: 1,
      definition: { root: 'no-node', components: [] } }))
    expect(host.textContent).toContain('Unsupported or invalid UI definition')
    act(() => renderer.setTheme('dark'))
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
