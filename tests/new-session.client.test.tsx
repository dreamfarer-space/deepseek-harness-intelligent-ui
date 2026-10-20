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
import { resetUiStateMemory } from '../client-src/state.ts'
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
afterEach(() => { act(() => root.unmount()); host.remove() })

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
    expect(validateProps('Form', { fields: [], sessionTarget: 'new' }).join()).toContain('unknown prop')
  })
})

describe('durable launch recovery', () => {
  it('refuses to start when the recovery state cannot reach storage', async () => {
    const f = fixture()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    try {
      await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Browser storage is unavailable')
      resetUiStateMemory()
      await expect(createNewSessionSender(f.sessions, () => f.services)('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Browser storage is unavailable')
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
      await expect(f.send('source', TEXT, 'ui-1', 'task')).rejects.toThrow('Browser storage is unavailable')
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
    expect(host.querySelector<HTMLFieldSetElement>('.diui-choice')!.disabled).toBe(true)
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
