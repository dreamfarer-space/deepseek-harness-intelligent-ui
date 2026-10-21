// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPatch, snapshotOf } from '../src/catalog/patch.js'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import { resetUiVersions } from '../client-src/versions.ts'
import type { ToolResultNode, ToolViewProps } from '../client-src/types/dsh.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']
const options = [
  { id: 'sqlite', label: 'SQLite sync', description: 'Keep local data and add sync.', prompt: 'Discuss SQLite sync for a solo developer on a limited budget. No files or coding.' },
  { id: 'supabase', label: 'Supabase', description: 'Managed backend.', prompt: 'Discuss Supabase for a solo developer on a limited budget. No files or coding.' },
  { id: 'custom', label: 'Custom backend', prompt: 'Discuss a custom backend. No files or coding.' },
]
const props = { question: 'Which route?', recommended: 'sqlite', options }
const tree = (p = props) => ({ root: 'choice', components: [{ id: 'choice', type: 'Choice', props: p }] })
const block = (args: unknown, extra: Partial<ToolResultNode> = {}): ToolResultNode => ({
  kind: 'tool-result', callId: 'choices', call: { name: 'ui_render', argsRaw: JSON.stringify(args) },
  content: [], isError: false, meta: { ok: true }, ...extra,
})
let host: HTMLDivElement
let root: Root
let send: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
let sendNew: ReturnType<typeof vi.fn<(text: string, callId: string, nodeId: string) => Promise<void>>>
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  resetUiVersions()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  send = vi.fn(async () => {})
  sendNew = vi.fn(async () => {})
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})
const base = () => ({ callId: 'choices', toolName: 'ui_render', t, sendPrompt: send, sendNewSessionPrompt: sendNew })
const view = (p = props) => <RenderView {...base()} phase="result" block={block(tree(p))} />
const render = (element = view()) => act(() => root.render(element))
const radios = () => [...host.querySelectorAll<HTMLInputElement>('input[type=radio]')]
const submitButton = () => host.querySelector<HTMLButtonElement>('.diui-choice-submit')!
const choose = (index: number) => act(() => radios()[index]!.click())
const submit = () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
function reload() {
  act(() => root.unmount())
  resetUiStateMemory()
  root = createRoot(host)
  render()
}

describe('Choice decisions', () => {
  it('offers accessible choices without preselecting the recommendation or sending before confirmation', async () => {
    render()
    expect(host.querySelector('legend')!.textContent).toBe(props.question)
    expect(host.querySelector('.diui-choice-recommended')!.textContent).toBe('Recommended')
    expect(radios().every(radio => !radio.checked)).toBe(true)
    expect(submitButton().disabled).toBe(true)
    await act(async () => { submit() })
    expect(send).not.toHaveBeenCalled()
    choose(1)
    expect(radios().map(radio => radio.checked)).toEqual([false, true, false])
    expect(submitButton().disabled).toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(sendNew).not.toHaveBeenCalled()
    const description = radios()[1]!.getAttribute('aria-describedby')!
    expect(document.getElementById(description)!.textContent).toBe(options[1]!.description)
  })

  it('sends only the selected prompt to the current conversation after confirmation, then stays locked', async () => {
    render()
    choose(1)
    await act(async () => { submit() })
    expect(send).toHaveBeenCalledExactlyOnceWith(options[1]!.prompt)
    expect(sendNew).not.toHaveBeenCalled()
    expect(submitButton().textContent).toBe(en['choice.sent'])
    expect(submitButton().disabled).toBe(true)
    await act(async () => { submit() })
    expect(send).toHaveBeenCalledTimes(1)
    reload()
    expect(radios()[1]!.checked).toBe(true)
    expect(submitButton().disabled).toBe(true)
    await act(async () => { submit() })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('deduplicates same-frame submissions and disables selection while sending', async () => {
    let release!: () => void
    send.mockImplementation(() => new Promise(resolve => { release = resolve }))
    render()
    choose(0)
    await act(async () => { submit(); submit() })
    expect(send).toHaveBeenCalledTimes(1)
    expect(host.querySelector('fieldset')!.disabled).toBe(true)
    choose(1)
    expect(radios()[0]!.checked).toBe(true)
    await act(async () => { release() })
    expect(submitButton().disabled).toBe(true)
  })

  it.each(['current', 'new'])('accepts only the first destination when %s is clicked first', async target => {
    let release!: () => void
    const sending = target === 'new' ? sendNew : send
    sending.mockImplementation(() => new Promise(resolve => { release = resolve }))
    render()
    choose(0)
    const newButton = host.querySelector<HTMLButtonElement>('button[type=button]')!
    await act(async () => {
      if (target === 'new') { newButton.click(); submit() }
      else { submit(); newButton.click() }
    })
    expect(sending).toHaveBeenCalledTimes(1)
    expect(target === 'new' ? send : sendNew).not.toHaveBeenCalled()
    await act(async () => { release() })
    expect(submitButton().disabled).toBe(true)
  })

  it('restores an unsubmitted selection after reload without submitting', () => {
    render()
    choose(2)
    reload()
    expect(radios()[2]!.checked).toBe(true)
    expect(submitButton().disabled).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('preserves selection through ui_patch, but never chooses a replacement for a removed option', () => {
    render()
    choose(1)
    let snapshot = snapshotOf('choices', tree())
    const patch = (newOptions: typeof options) => {
      const args = { uiId: 'choices', baseVersion: snapshot.version,
        ops: [{ op: 'setProps', id: 'choice', props: { options: newOptions } }] }
      const result = applyPatch(snapshot, args)
      if (!result.ok) throw new Error(result.errors.join())
      snapshot = result.ui
      render(<PatchView {...base()} callId={`patch-${snapshot.version}`} toolName="ui_patch" phase="result"
        block={block(args, { meta: { ok: true, ui: snapshot } })} />)
    }
    patch(options.map(option => ({ ...option, description: 'Updated description' })))
    expect(radios()[1]!.checked).toBe(true)
    patch([options[1]!, options[2]!, options[0]!])
    expect(radios()[0]!.checked).toBe(true)
    patch([options[0]!, options[2]!])
    expect(radios().every(radio => !radio.checked)).toBe(true)
    expect(submitButton().disabled).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('uses the existing bridge length policy and surfaces its rejection', async () => {
    render(view({ ...props, options: [{ ...options[0]!, prompt: 'x'.repeat(5000) }, options[1]!] }))
    choose(0)
    await act(async () => { submit() })
    expect(send).not.toHaveBeenCalled()
    expect(host.querySelector('[role=status]')!.textContent).toMatch(/exceeds .* characters/)
    expect(submitButton().disabled).toBe(false)
  })

  it('escapes model-provided labels and descriptions as text', () => {
    render(view({ ...props, options: [
      { ...options[0]!, id: 'spaces allowed', label: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' },
      options[1]!,
    ], recommended: 'spaces allowed' }))
    expect(host.querySelector('img,script')).toBeNull()
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(document.getElementById(radios()[0]!.getAttribute('aria-describedby')!)!.textContent).toContain('<script>')
  })
})
