// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../client-src/index.ts'
import { createNewSessionSender } from '../client-src/new-session.ts'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { TurnTail } from '../client-src/TurnTail.tsx'
import { en } from '../client-src/locales.ts'
import { MAX_STATE_CHARS, resetUiStateMemory, setUiState } from '../client-src/state.ts'
import { validateProps } from '../src/catalog/catalog.js'
import { applyPatch, snapshotOf } from '../src/catalog/patch.js'
import type { SessionsFace, ToolViewProps } from '../client-src/types/dsh.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const t: ToolViewProps['t'] = (key, vars) => en[key].replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''))
const TEXT = 'Review the workspace tests'
const tree = (sessionTarget?: string, prompt = TEXT) => ({
  root: 'task', components: [{ id: 'task', type: 'Button', props: { label: 'Start task', prompt, ...(sessionTarget ? { sessionTarget } : {}) } }],
})
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

function fixture() {
  const events: string[] = []
  const abandon = vi.fn()
  const prompt = vi.fn(async () => { events.push('prompt'); return { ok: true } })
  const beginSubmission = vi.fn(() => ({ requestId: 'request-1', abandon }))
  const openSession = vi.fn(async () => { events.push('open') })
  const create = vi.fn(async ({ sessionId }: { sessionId: string; workspaceId?: string; cwd?: string }) => { events.push('create'); return sessionId })
  const using = vi.fn(async (_id, _options, operation) => {
    events.push('retain')
    try { return await operation({ binding: { session: { prompt, beginSubmission } } }) }
    finally { events.push('release') }
  }) as SessionsFace['using'] & ReturnType<typeof vi.fn>
  const sessions: SessionsFace = { create, using, binding: vi.fn(), list: { getSnapshot: () => ({ byId: { source: { cwd: '/project' } } }) } }
  const snapshot = { phase: 'ready', state: 'idle', items: [{ workspaceId: 'workspace-1', sessionIds: ['source'] }] }
  const services = { workspaces: { list: { getSnapshot: () => snapshot } }, uiWorkspace: { openSession } }
  const send = createNewSessionSender(sessions, () => services)
  const injected = { t, sessionId: 'source', sendPrompt: vi.fn(async () => {}),
    sendNewSessionPrompt: (text: string, uiId: string, nodeId: string) => send('source', text, uiId, nodeId) }
  return { events, abandon, beginSubmission, prompt, openSession, create, using, sessions, snapshot, services, send, injected }
}
function view(f: ReturnType<typeof fixture>, target: string | undefined = 'new', prompt = TEXT) {
  return <RenderView {...f.injected} callId="ui-1" toolName="ui_render" phase="result"
    block={{ kind: 'tool-result', callId: 'ui-1', call: { name: 'ui_render', argsRaw: JSON.stringify(tree(target, prompt)) }, content: [], isError: false }} />
}
const button = () => host.querySelector<HTMLButtonElement>('.diui-button')!
const mount = (el: React.ReactElement) => act(() => root.render(el))
async function click() { await act(async () => { button().click() }) }
function reload(el: React.ReactElement) {
  act(() => root.unmount())
  resetUiStateMemory()
  root = createRoot(host)
  mount(el)
}

describe('new Agent session adapter', () => {
  it('creates independently in the source workspace, submits, then navigates before release', async () => {
    const f = fixture()
    await f.send('source', TEXT, 'ui-1', 'task')
    const id = f.create.mock.calls[0]![0].sessionId
    expect(f.create).toHaveBeenCalledWith({ sessionId: id, workspaceId: 'workspace-1' })
    expect(f.using).toHaveBeenCalledWith(id, { source: 'controllerOperation' }, expect.any(Function))
    expect(f.prompt).toHaveBeenCalledWith([{ type: 'text', text: TEXT }], 'queue', undefined, 'request-1')
    expect(f.openSession).toHaveBeenCalledWith(id)
    expect(f.sessions.binding).not.toHaveBeenCalled()
    expect(f.events).toEqual(['create', 'retain', 'prompt', 'open', 'release'])
  })
  it('inherits cwd on legacy hosts without a workspace service', async () => {
    const f = fixture()
    const send = createNewSessionSender(f.sessions, () => ({ uiWorkspace: f.services.uiWorkspace }))
    await send('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledWith({ sessionId: expect.any(String), cwd: '/project' })
  })
  it('retries uncertain creation with exactly the same session identity across reload', async () => {
    const f = fixture()
    f.create.mockRejectedValueOnce(new Error('response lost'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('response lost')
    resetUiStateMemory()
    const restored = createNewSessionSender(f.sessions, () => f.services)
    await restored('source', TEXT, 'ui-1', 'task')
    expect(f.create.mock.calls[1]).toEqual(f.create.mock.calls[0])
    expect(f.prompt).toHaveBeenCalledTimes(1)
  })
  it.each(['rejection', 'transport'])('recovers a prompt %s in the created session with the same RPC identity', async failure => {
    const f = fixture()
    if (failure === 'rejection') f.prompt.mockResolvedValueOnce({ ok: false, error: { message: 'busy' } } as never)
    else f.prompt.mockRejectedValueOnce(new Error('offline'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Retry this button')
    expect(f.openSession).not.toHaveBeenCalled()
    expect(f.abandon).toHaveBeenCalledOnce()
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt.mock.calls[0]).toEqual(f.prompt.mock.calls[1])
    expect(f.beginSubmission).toHaveBeenCalledOnce()
  })
  it('retries only navigation once the prompt has been accepted', async () => {
    const f = fixture()
    f.openSession.mockRejectedValueOnce(new Error('navigation failed'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Prompt accepted')
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenCalledTimes(2)
  })
  it('recovers a reference acquisition failure without recreating the session', async () => {
    const f = fixture()
    f.using.mockRejectedValueOnce(new Error('open failed'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('open failed')
    await f.send('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
  })
  it('shares one operation across simultaneous inline and turn-tail copies', async () => {
    const f = fixture()
    let release!: (id: string) => void
    f.create.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const first = f.send('source', TEXT, 'ui-1', 'task')
    const second = f.send('source', TEXT, 'ui-1', 'task')
    expect(second).toBe(first)
    release(f.create.mock.calls[0]![0].sessionId)
    await Promise.all([first, second])
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
  })
  it.each(['create', 'using', 'navigation', 'workspace', 'source'])('fails before mutation when %s is unavailable', async missing => {
    const f = fixture()
    if (missing === 'create') f.sessions.create = undefined
    if (missing === 'using') f.sessions.using = undefined
    if (missing === 'navigation') f.services.uiWorkspace = undefined as never
    if (missing === 'workspace') f.snapshot.phase = 'pending'
    if (missing === 'source') { f.snapshot.items = []; f.sessions.list = undefined }
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow()
    expect(f.create).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
  })
  it('does not reuse a partially launched button for a changed prompt', async () => {
    const f = fixture()
    f.prompt.mockRejectedValueOnce(new Error('offline'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow()
    await expect(f.send('source', 'Different task', 'ui-1', 'task')).rejects.toThrow('different prompt')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
  })
})

describe('native Button integration', () => {
  it.each(['ui_render', 'ui_patch'])('starts a new session through the injected turn-tail slot for %s', async toolName => {
    const f = fixture()
    const entries: Record<string, any>[] = []
    apply({
      sessions: f.sessions, get: name => name === 'workspaces' ? f.services.workspaces : name === 'uiWorkspace' ? f.services.uiWorkspace : undefined,
      effect: () => {}, locale: { register: () => () => {} }, uiConversation: { events: { register: () => {} } },
      slots: { inject: (_name, fn) => { fn() }, register: entry => { entries.push(entry) } },
    })
    const injected = entries.find(entry => entry.name === 'conversation.chat.turnTail')!.inject('source')
    const block = {
      kind: 'tool-result' as const, callId: 'tail-1', seq: 1,
      call: { name: toolName, argsRaw: JSON.stringify(tree('new')) }, content: [], isError: false,
      meta: toolName === 'ui_patch' ? { ok: true, ui: { ...tree('new'), uiId: 'ui-1', version: 2 } } : { ok: true },
    }
    const owner = { seq: 2, turn: { start: { time: Date.now() }, end: { seq: 2 }, data: { get: () => ({ results: [block] }) } } }
    const tail = <TurnTail {...injected} {...owner} t={t} />
    mount(tail)
    expect(host.querySelector('.diui-tail .diui-button')).not.toBeNull()
    await act(async () => { button().click(); button().click() })
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledWith([{ type: 'text', text: TEXT }], 'queue', undefined, 'request-1')
    expect(f.openSession).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('New session started')
    reload(tail)
    expect(button().disabled).toBe(true)
    await click()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
  })

  it('wires the optional service through real plugin slot injection', async () => {
    const f = fixture()
    const entries: Record<string, any>[] = []
    apply({
      sessions: f.sessions, get: name => name === 'workspaces' ? f.services.workspaces : name === 'uiWorkspace' ? f.services.uiWorkspace : undefined,
      effect: () => {}, locale: { register: () => () => {} }, uiConversation: { events: { register: () => {} } },
      slots: { inject: (_name, fn) => { fn() }, register: entry => { entries.push(entry) } },
    })
    const injected = entries.find(entry => entry.key === 'ui_render')!.inject('source')
    mount(<RenderView {...injected} t={t} callId="ui-1" toolName="ui_render" phase="result"
      block={{ kind: 'tool-result', callId: 'ui-1', call: { name: 'ui_render', argsRaw: JSON.stringify(tree('new')) }, content: [], isError: false }} />)
    await click()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenCalledOnce()
  })
  it('launches once on double click and stays locked after completion and reload', async () => {
    const f = fixture()
    let release!: () => void
    f.prompt.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true }) }))
    mount(view(f))
    await act(async () => { button().click(); button().click() })
    expect(button().disabled).toBe(true)
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    await act(async () => { release() })
    expect(host.textContent).toContain('New session started')
    reload(view(f))
    await click()
    expect(button().disabled).toBe(true)
    expect(f.prompt).toHaveBeenCalledOnce()
  })
  it('shows failure, then retries the same session from a patched copy after reload', async () => {
    const f = fixture()
    f.prompt.mockRejectedValueOnce(new Error('offline'))
    mount(view(f))
    await click()
    expect(host.textContent).toContain('offline')
    expect(button().disabled).toBe(false)
    const changed = applyPatch(snapshotOf('ui-1', tree('new')), { uiId: 'ui-1', baseVersion: 1,
      ops: [{ op: 'setProps', id: 'task', props: { label: 'Retry task' } }] })
    expect(changed.ok).toBe(true)
    reload(<PatchView {...f.injected} callId="patch-1" toolName="ui_patch" phase="result"
      block={{ kind: 'tool-result', callId: 'patch-1', call: null, content: [], isError: false, meta: { ok: true, ui: changed.ui } }} />)
    await click()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledTimes(2)
    expect(f.openSession).toHaveBeenCalledOnce()
  })
  it.each([undefined, 'current'])('preserves current-session routing for %s', async target => {
    const f = fixture()
    mount(view(f, target))
    // Passing undefined uses view's default; explicitly render the legacy definition.
    if (target === undefined) mount(<RenderView {...f.injected} callId="ui-1" toolName="ui_render" phase="result"
      block={{ kind: 'tool-result', callId: 'ui-1', call: { name: 'ui_render', argsRaw: JSON.stringify(tree()) }, content: [], isError: false }} />)
    await click()
    expect(f.injected.sendPrompt).toHaveBeenCalledWith(TEXT)
    expect(f.create).not.toHaveBeenCalled()
  })
  it.each(['', 'x'.repeat(20_001)])('guards invalid prompts before creating a session', async prompt => {
    const f = fixture()
    mount(view(f, 'new', prompt))
    await click()
    expect(f.create).not.toHaveBeenCalled()
  })
  it('does not silently send to the current session without the optional native action', async () => {
    const f = fixture()
    f.injected.sendNewSessionPrompt = undefined as never
    mount(view(f))
    await click()
    expect(host.textContent).toContain(en['session.unavailable'])
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
  })
})

describe('Button sessionTarget validation', () => {
  it('accepts current/new, rejects unknown values and action combinations', () => {
    for (const sessionTarget of ['current', 'new']) {
      expect(validateProps('Button', { label: 'Go', prompt: TEXT, sessionTarget })).toEqual([])
    }
    expect(validateProps('Button', { label: 'Go', prompt: TEXT, sessionTarget: 'other' })).not.toEqual([])
    expect(validateProps('Button', { label: 'Go', action: { actionId: 'safe', args: {} }, sessionTarget: 'new' }).join()).toContain('only supported with prompt')
    expect(validateProps('Form', { fields: [], sessionTarget: 'new' }).join()).toContain('non-empty task prompt')
    expect(validateProps('Form', { fields: [], prompt: TEXT, sessionTarget: 'new' })).toEqual([])
    expect(validateProps('Form', { fields: [], sessionTarget: 'current' })).toEqual([])
    expect(validateProps('Form', { fields: [], sessionTarget: 'other' }).join()).toContain('expected one of')
    expect(validateProps('Form', { fields: [], prompt: ' ', sessionTarget: 'new' }).join()).toContain('non-empty task prompt')
  })
})

const INPUT_TASK = 'Discuss a solo developer plan on a limited budget. Do not create files or write code.'
function inputTree(type: 'Form' | 'ChoiceGroup', sessionTarget?: string) {
  return { root: 'input', components: [{ id: 'input', type, props: {
    title: 'Choose a plan', ...(sessionTarget ? { sessionTarget } : {}), submitLabel: 'Continue',
    ...(type === 'Form'
      ? { prompt: INPUT_TASK, fields: [{ name: 'route', label: 'Route', type: 'select', options: ['SQLite', 'Supabase'], default: 'SQLite', required: true }] }
      : { options: [{ id: 'sqlite', label: 'SQLite', prompt: INPUT_TASK }, { id: 'supabase', label: 'Supabase', prompt: 'Another self-contained discussion. Do not code.' }] }),
  } }] }
}
function inputView(f: ReturnType<typeof fixture>, definition: ReturnType<typeof inputTree>) {
  return <RenderView {...f.injected} callId="input-ui" toolName="ui_render" phase="result"
    block={{ kind: 'tool-result', callId: 'input-ui', call: { name: 'ui_render', argsRaw: JSON.stringify(definition) }, content: [], isError: false }} />
}
function selectInput(type: 'Form' | 'ChoiceGroup') {
  if (type === 'ChoiceGroup') act(() => host.querySelector<HTMLInputElement>('input[value=sqlite]')!.click())
}
const submitInput = () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
const inputButton = () => host.querySelector<HTMLButtonElement>('button[type=submit]')!
const expectedInput = (type: 'Form' | 'ChoiceGroup') => type === 'Form' ? `${INPUT_TASK}\n{\n  "route": "SQLite"\n}` : INPUT_TASK

describe.each(['Form', 'ChoiceGroup'] as const)('%s session targets', type => {
  it.each([undefined, 'current'])('preserves current routing for %s and displays the target', async target => {
    const f = fixture()
    mount(inputView(f, inputTree(type, target)))
    selectInput(type)
    expect(inputButton().textContent).toContain(en['session.targetCurrent'])
    expect(host.querySelector('.diui-session-info')).toBeNull()
    expect(host.textContent).not.toContain('Continue in this conversation with its existing context')
    await act(async () => { submitInput(); submitInput() })
    expect(f.injected.sendPrompt).toHaveBeenCalledExactlyOnceWith(expectedInput(type))
    expect(f.create).not.toHaveBeenCalled()
  })

  it('creates in the inherited workspace, auto-submits once, navigates and locks after reload', async () => {
    const f = fixture()
    const definition = inputTree(type, 'new')
    let release!: () => void
    f.prompt.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true }) }))
    mount(inputView(f, definition))
    selectInput(type)
    expect(inputButton().textContent).toContain(en['session.targetNew'])
    expect(host.querySelector('.diui-session-info,[role=tooltip]')).toBeNull()
    expect(f.create).not.toHaveBeenCalled()
    await act(async () => { submitInput(); submitInput() })
    expect(f.create).toHaveBeenCalledExactlyOnceWith({ sessionId: expect.any(String), workspaceId: 'workspace-1' })
    expect(inputButton().disabled).toBe(true)
    const input = host.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')!
    expect(input.matches(':disabled')).toBe(true)
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    await act(async () => { release() })
    expect(f.prompt).toHaveBeenCalledExactlyOnceWith([{ type: 'text', text: expectedInput(type) }], 'queue', undefined, 'request-1')
    expect(f.openSession).toHaveBeenCalledOnce()
    expect(inputButton().textContent).toBe(en['session.started'])
    reload(inputView(f, definition))
    await act(async () => { submitInput() })
    expect(inputButton().disabled).toBe(true)
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
  })

  it.each(['create', 'prompt', 'navigation'])('recovers %s failure after patch/reload using the original payload and target', async stage => {
    const f = fixture()
    if (stage === 'create') f.create.mockRejectedValueOnce(new Error('offline'))
    if (stage === 'prompt') f.prompt.mockRejectedValueOnce(new Error('offline'))
    if (stage === 'navigation') f.openSession.mockRejectedValueOnce(new Error('offline'))
    const definition = inputTree(type, 'new')
    mount(inputView(f, definition))
    selectInput(type)
    await act(async () => { submitInput() })
    expect(host.textContent).toContain('offline')
    expect(inputButton().disabled).toBe(false)
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(true)
    expect(host.textContent).toContain(en['session.retryHint'])
    const changed = applyPatch(snapshotOf('input-ui', definition), { uiId: 'input-ui', baseVersion: 1, ops: [
      { op: 'setProps', id: 'input', props: {
        sessionTarget: 'current', submitLabel: 'Changed label',
        ...(type === 'Form' ? { prompt: 'Changed task' } : { options: [
          { id: 'new-a', label: 'Changed A', prompt: 'Changed A' },
          { id: 'new-b', label: 'Changed B', prompt: 'Changed B' },
        ] }),
      } },
    ] })
    if (!changed.ok) throw new Error(changed.errors.join())
    reload(<PatchView {...f.injected} callId="patch-input" toolName="ui_patch" phase="result"
      block={{ kind: 'tool-result', callId: 'patch-input', call: null, content: [], isError: false, meta: { ok: true, ui: changed.ui } }} />)
    expect(inputButton().textContent).toContain(en['session.targetNew'])
    expect(inputButton().textContent).toContain(en['session.retry'])
    await act(async () => { submitInput() })
    expect(f.create).toHaveBeenCalledTimes(stage === 'create' ? 2 : 1)
    if (stage === 'create') expect(f.create.mock.calls[1]).toEqual(f.create.mock.calls[0])
    expect(f.prompt).toHaveBeenCalledTimes(stage === 'prompt' ? 2 : 1)
    for (const call of f.prompt.mock.calls) expect(call).toEqual([[{ type: 'text', text: expectedInput(type) }], 'queue', undefined, 'request-1'])
    expect(f.openSession).toHaveBeenCalledTimes(stage === 'navigation' ? 2 : 1)
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    expect(inputButton().disabled).toBe(true)
  })

  it('does not fall back to the current session when the optional service is absent', async () => {
    const f = fixture()
    f.injected.sendNewSessionPrompt = undefined as never
    mount(inputView(f, inputTree(type, 'new')))
    selectInput(type)
    await act(async () => { submitInput() })
    expect(host.textContent).toContain(en['session.unavailable'])
    expect(f.create).not.toHaveBeenCalled()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
  })

  it('rejects an oversized payload before freezing inputs or creating a session', async () => {
    const f = fixture()
    const definition = inputTree(type, 'new')
    if (type === 'Form') (definition.components[0]!.props as any).prompt = 'x'.repeat(5000)
    else (definition.components[0]!.props as any).options[0].prompt = 'x'.repeat(5000)
    mount(inputView(f, definition))
    selectInput(type)
    await act(async () => { submitInput() })
    expect(host.textContent).toMatch(/exceeds .* characters/)
    expect(f.create).not.toHaveBeenCalled()
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
  })

  it('refuses to launch if the frozen task cannot fit in recovery state', async () => {
    const f = fixture()
    mount(inputView(f, inputTree(type, 'new')))
    selectInput(type)
    expect(setUiState('input-ui', 'padding', 'x'.repeat(MAX_STATE_CHARS - 120))).toBe(true)
    await act(async () => { submitInput() })
    expect(host.textContent).toContain(en['session.recoveryUnavailable'])
    expect(f.create).not.toHaveBeenCalled()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
  })

  it('leaves failed current-session submissions editable', async () => {
    const f = fixture()
    const clock = vi.spyOn(Date, 'now')
    clock.mockReturnValue(10000)
    f.injected.sendPrompt.mockRejectedValueOnce(new Error('offline'))
    mount(inputView(f, inputTree(type)))
    selectInput(type)
    await act(async () => { submitInput() })
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
    act(() => {
      if (type === 'Form') {
        const select = host.querySelector('select')!
        select.value = 'Supabase'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else host.querySelector<HTMLInputElement>('input[value=supabase]')!.click()
    })
    clock.mockReturnValue(12000)
    await act(async () => { submitInput() })
    expect(f.injected.sendPrompt).toHaveBeenCalledTimes(2)
    expect(f.injected.sendPrompt.mock.calls[0]).not.toEqual(f.injected.sendPrompt.mock.calls[1])
    expect(f.create).not.toHaveBeenCalled()
  })

  it.each(['streaming', 'stopped'])('refuses submissions while %s', async mode => {
    const f = fixture()
    const raw = JSON.stringify(inputTree(type, 'new'))
    mount(mode === 'streaming'
      ? <RenderView {...f.injected} callId="input-ui" toolName="ui_render" phase="preparing"
        block={{ phase: 'preparing', callId: 'input-ui' }} useToolCallArgumentsPartial={() => raw} />
      : <RenderView {...f.injected} callId="input-ui" toolName="ui_render" phase="result"
        block={{ kind: 'tool-result', callId: 'input-ui', call: { name: 'ui_render', argsRaw: raw }, content: [], isError: true, error: { name: 'Interrupted', code: 'interrupted' } }} />)
    expect(inputButton().disabled).toBe(true)
    await act(async () => { submitInput() })
    expect(f.create).not.toHaveBeenCalled()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
  })
})

describe.each(['Button', 'Form', 'ChoiceGroup'] as const)('%s session controls', type => {
  it('shows only the task button without an information icon or tooltip', () => {
    const f = fixture()
    mount(type === 'Button' ? view(f) : inputView(f, inputTree(type, 'new')))
    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(host.querySelector('.diui-session-info,[role=tooltip]')).toBeNull()
    expect(f.create).not.toHaveBeenCalled()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
  })
})
