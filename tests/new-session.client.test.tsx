// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../client-src/index.ts'
import { createNewSessionSender } from '../client-src/new-session.ts'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { ComposeView } from '../client-src/compose/ComposeView.tsx'
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
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

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
  it('isolates composed block actions and resumes the original session through a patch', async () => {
    const f = fixture()
    f.openSession.mockRejectedValueOnce(new Error('navigation failed'))
    const composition = { blocks: ['left', 'right'].map(id => ({
      id, type: 'catalog', ...tree('new', `Discuss ${id}`),
    })) }
    const composed = <ComposeView {...f.injected} callId="comp" toolName="ui_compose" phase="result"
      block={{ kind: 'tool-result', callId: 'comp', call: { name: 'ui_compose', argsRaw: JSON.stringify(composition) }, content: [], isError: false, meta: { ok: true } }} />
    mount(composed)
    await click()
    expect(f.create).toHaveBeenCalledOnce()
    const firstSession = f.create.mock.calls[0]![0].sessionId
    // Reload also resets the UI rate limiter while retaining durable recovery.
    reload(composed)
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.diui-button')[1]!.click())
    expect(f.create).toHaveBeenCalledTimes(2)
    expect(f.prompt).toHaveBeenCalledTimes(2)
    const ui = { ...tree('new', 'Discuss left'), uiId: 'comp#left', version: 2 }
    reload(<PatchView {...f.injected} callId="patch" toolName="ui_patch" phase="result"
      block={{ kind: 'tool-result', callId: 'patch', call: { name: 'ui_patch', argsRaw: '{}' }, content: [], isError: false, meta: { ok: true, ui } }} />)
    await click()
    expect(f.create).toHaveBeenCalledTimes(2)
    expect(f.prompt).toHaveBeenCalledTimes(2)
    expect(f.openSession).toHaveBeenLastCalledWith(firstSession)
  })

  it.each(['quota', 'unavailable'])('blocks creation when recovery storage is %s and resumes safely once restored', async failure => {
    const f = fixture()
    if (failure === 'quota') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    else vi.stubGlobal('localStorage', undefined)
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('recovery state')
    // A second attempt in the same page must not use a memory-only launch.
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('recovery state')
    expect(f.create).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
    expect(f.openSession).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenCalledOnce()
  })

  it.each(['created', 'request', 'accepted'])('recovers a storage failure while saving %s using the same durable identities', async stage => {
    const f = fixture()
    const key = `newSession:${JSON.stringify(['source', 'task'])}`
    const originalSet = Storage.prototype.setItem
    let storageFailed = false
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) {
      const state = name === 'diui:v1:ui-1' ? JSON.parse(value).v[key] : undefined
      const fail = state && (stage === 'created' ? state.created && !state.requestId
        : stage === 'request' ? !!state.requestId && !state.accepted : state.accepted)
      if (fail && !storageFailed) {
        storageFailed = true
        throw new DOMException('Full', 'QuotaExceededError')
      }
      originalSet.call(this, name, value)
    })
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not persist')
    expect(storageFailed).toBe(true)
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledTimes(stage === 'accepted' ? 1 : 0)
    expect(f.openSession).not.toHaveBeenCalled()
    const sessionId = f.create.mock.calls[0]![0].sessionId
    write.mockRestore()
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledTimes(stage === 'created' ? 2 : 1)
    expect(f.create.mock.calls.every(([options]) => options.sessionId === sessionId)).toBe(true)
    expect(f.prompt).toHaveBeenCalledTimes(stage === 'accepted' ? 2 : 1)
    if (stage === 'accepted') expect(f.prompt.mock.calls[0]).toEqual(f.prompt.mock.calls[1])
    expect(f.openSession).toHaveBeenCalledExactlyOnceWith(sessionId)
    // The accepted state is now durable; a later replay only opens that session.
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.prompt).toHaveBeenCalledTimes(stage === 'accepted' ? 2 : 1)
  })

  it('blocks navigation retries while storage is broken without losing the accepted task', async () => {
    const f = fixture()
    f.openSession.mockRejectedValueOnce(new Error('navigation failed'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Prompt accepted')
    const sessionId = f.create.mock.calls[0]![0].sessionId
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not persist')
    resetUiStateMemory()
    await expect(createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not persist')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenCalledOnce()
    write.mockRestore()
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenLastCalledWith(sessionId)
    expect(f.openSession).toHaveBeenCalledTimes(2)
  })

  it('does not replace a previous launch when recovery storage cannot be read after reload', async () => {
    const f = fixture()
    f.openSession.mockRejectedValueOnce(new Error('navigation failed'))
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Prompt accepted')
    const record = localStorage.getItem('diui:v1:ui-1')
    resetUiStateMemory()
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    await expect(createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not read')
    expect(write).not.toHaveBeenCalled()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    read.mockRestore()
    expect(localStorage.getItem('diui:v1:ui-1')).toBe(record)
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenCalledTimes(2)
  })

  it('refuses corrupt persisted recovery data instead of silently starting a different task', async () => {
    const f = fixture()
    localStorage.setItem('diui:v1:ui-1', '{broken')
    await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not read')
    expect(f.create).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
    expect(localStorage.getItem('diui:v1:ui-1')).toBe('{broken')
  })

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
function inputTree(type: 'Form' | 'Choice', sessionTarget?: string) {
  return { root: 'input', components: [{ id: 'input', type, props: {
    ...(type === 'Form' ? { title: 'Choose a plan' } : { question: 'Choose a plan' }), ...(sessionTarget ? { sessionTarget } : {}), submitLabel: 'Continue',
    ...(type === 'Form'
      ? { prompt: INPUT_TASK, fields: [{ name: 'route', label: 'Route', type: 'select', options: ['SQLite', 'Supabase'], default: 'SQLite', required: true }] }
      : { options: [{ id: 'sqlite', label: 'SQLite', prompt: INPUT_TASK }, { id: 'supabase', label: 'Supabase', prompt: 'Another self-contained discussion. Do not code.' }] }),
  } }] }
}
function inputView(f: ReturnType<typeof fixture>, definition: ReturnType<typeof inputTree>) {
  return <RenderView {...f.injected} callId="input-ui" toolName="ui_render" phase="result"
    block={{ kind: 'tool-result', callId: 'input-ui', call: { name: 'ui_render', argsRaw: JSON.stringify(definition) }, content: [], isError: false }} />
}
function selectInput(type: 'Form' | 'Choice') {
  if (type === 'Choice') act(() => host.querySelector<HTMLInputElement>('input[value=sqlite]')!.click())
}
const submitInput = () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
const inputButton = () => host.querySelector<HTMLButtonElement>('button[type=submit]')!
const expectedInput = (type: 'Form' | 'Choice') => type === 'Form' ? `${INPUT_TASK}\n{\n  "route": "SQLite"\n}` : INPUT_TASK

describe.each(['Form', 'Choice'] as const)('%s session targets', type => {
  it('does not freeze inputs or start a task when localStorage rejects the confirmed payload', async () => {
    const f = fixture()
    mount(inputView(f, inputTree(type, 'new')))
    selectInput(type)
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    await act(async () => { submitInput() })
    expect(host.textContent).toContain(en['session.recoveryUnavailable'])
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
    expect(inputButton().disabled).toBe(false)
    expect(f.create).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
    write.mockRestore()
    reload(inputView(f, inputTree(type, 'new')))
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
    await act(async () => { submitInput() })
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledOnce()
  })

  it.each([undefined, 'current'])('preserves current routing for %s and displays the target', async target => {
    const f = fixture()
    mount(inputView(f, inputTree(type, target)))
    selectInput(type)
    expect(inputButton().textContent).toContain(en['session.targetCurrent'])
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

  it('retries a failed submission after patch/reload using the original payload and target', async () => {
    const f = fixture()
    f.prompt.mockRejectedValueOnce(new Error('offline'))
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
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledTimes(2)
    for (const call of f.prompt.mock.calls) expect(call).toEqual([[{ type: 'text', text: expectedInput(type) }], 'queue', undefined, 'request-1'])
    expect(f.openSession).toHaveBeenCalledOnce()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    expect(inputButton().disabled).toBe(true)
  })

  it('resumes a legacy frozen prompt with its original launch identity', async () => {
    const f = fixture()
    const text = expectedInput(type)
    expect(setUiState('input-ui', 'input:launchPrompt', text)).toBe(true)
    f.prompt.mockRejectedValueOnce(new Error('offline'))
    await expect(f.send('source', text, 'input-ui', 'input')).rejects.toThrow('offline')
    reload(inputView(f, inputTree(type, 'new')))
    await act(async () => { submitInput() })
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledTimes(2)
    expect(f.prompt.mock.calls[1]).toEqual(f.prompt.mock.calls[0])
    expect(f.openSession).toHaveBeenCalledOnce()
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
    expect(host.querySelector('[role=status]')!.textContent).toContain('offline')
    expect(inputButton().disabled).toBe(false)
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(false)
    if (type === 'Choice') expect(host.querySelector<HTMLInputElement>('input[value=sqlite]')!.checked).toBe(true)
    else expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe('SQLite')
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
    expect(inputButton().disabled).toBe(true)
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
    expect(host.querySelector('input,select')!.matches(':disabled')).toBe(true)
    await act(async () => { submitInput() })
    expect(f.create).not.toHaveBeenCalled()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
  })
})

describe('durable launch recovery', () => {
  it('refuses to start when the recovery state cannot reach storage', async () => {
    const f = fixture()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    try {
      await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not persist the new session recovery state')
      resetUiStateMemory()
      await expect(createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not persist the new session recovery state')
    } finally { setItem.mockRestore() }
    expect(f.create).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
  })
  it('does not start a second task when storage fills after creation and the page reloads', async () => {
    const f = fixture()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    f.create.mockImplementationOnce(async ({ sessionId }) => {
      f.events.push('create')
      setItem.mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
      return sessionId
    })
    try {
      await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Could not persist the new session recovery state')
    } finally { setItem.mockRestore() }
    expect(f.prompt).not.toHaveBeenCalled()
    // The Host rejects a duplicate id; the session it already holds is reused.
    const id = f.create.mock.calls[0]![0].sessionId
    f.create.mockRejectedValueOnce(new Error(`session "${id}" already exists`))
    f.sessions.list = { getSnapshot: () => ({ byId: { source: { cwd: '/project' }, [id]: {} } }) }
    resetUiStateMemory()
    await createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')
    expect(f.create).toHaveBeenCalledTimes(2)
    expect(f.create.mock.calls[1]).toEqual(f.create.mock.calls[0])
    expect(f.prompt).toHaveBeenCalledOnce()
    expect(f.openSession).toHaveBeenCalledWith(id)
  })
})

describe('Choice card', () => {
  const OPTIONS = [
    { label: 'Python', description: 'Fast to script', prompt: 'Build the CLI in Python' },
    { label: 'Node.js', prompt: 'Build the CLI in Node.js' },
  ]
  const choice = (f: ReturnType<typeof fixture>, extra: Record<string, unknown> = {}) => (
    <RenderView {...f.injected} callId="ui-1" toolName="ui_render" phase="result"
      block={{ kind: 'tool-result', callId: 'ui-1', call: { name: 'ui_render', argsRaw: JSON.stringify({
        root: 'pick', components: [{ id: 'pick', type: 'Choice', props: { question: 'Which runtime?', options: OPTIONS, ...extra } }],
      }) }, content: [], isError: false }} />
  )
  const radios = () => [...host.querySelectorAll<HTMLInputElement>('.diui-choice input[type=radio]')]
  const action = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.diui-choice-actions .diui-button')].find(b => b.textContent === label)
  const pick = (i: number) => act(() => { radios()[i]!.click() })

  it('needs a pick, then continues in the current session and locks', async () => {
    const f = fixture()
    mount(choice(f))
    expect(radios()).toHaveLength(2)
    expect(host.textContent).toContain('Fast to script')
    expect(action(en['choice.continue'])!.disabled).toBe(true)
    pick(1)
    await act(async () => { action(en['choice.continue'])!.click() })
    expect(f.injected.sendPrompt).toHaveBeenCalledWith('Build the CLI in Node.js')
    expect(f.create).not.toHaveBeenCalled()
    expect(host.textContent).toContain(en['choice.sent'])
    reload(choice(f))
    expect(radios()[1]!.checked).toBe(true)
    expect(host.querySelector<HTMLFieldSetElement>('.diui-choice fieldset')!.disabled).toBe(true)
  })
  it('starts the picked option in a new session once', async () => {
    const f = fixture()
    mount(choice(f))
    pick(0)
    await act(async () => { action(en['choice.newSession'])!.click(); action(en['choice.newSession'])!.click() })
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.prompt).toHaveBeenCalledWith([{ type: 'text', text: 'Build the CLI in Python' }], 'queue', undefined, 'request-1')
    expect(f.openSession).toHaveBeenCalledOnce()
    expect(f.injected.sendPrompt).not.toHaveBeenCalled()
    expect(host.textContent).toContain(en['session.started'])
  })
  it('offers only the current session where the host cannot open sessions', () => {
    const f = fixture()
    f.injected.sendNewSessionPrompt = undefined as never
    mount(choice(f))
    expect(action(en['choice.newSession'])).toBeUndefined()
    expect(action(en['choice.continue'])).toBeDefined()
  })
  it('rejects props that would hide an action', () => {
    const f = fixture()
    mount(choice(f, { allowNewSession: false }))
    expect(host.querySelector('.diui-node-error')).not.toBeNull()
  })
  it('validates its options', () => {
    expect(validateProps('Choice', { question: 'Q', options: OPTIONS })).toEqual([])
    expect(validateProps('Choice', { question: 'Q', options: OPTIONS.slice(0, 1) }).join()).toContain('at least 2')
    expect(validateProps('Choice', { question: 'Q', options: [{ label: 'A' }, { label: 'B' }] })).not.toEqual([])
  })
})
