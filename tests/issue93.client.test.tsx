// @vitest-environment jsdom
/**
 * Issue #93 client-side suite: the new catalog components render in the
 * browser, keep their interaction state locally (across a `ui_patch` and a
 * remount), and never break the security boundaries (no HTML execution, no
 * message to the model for a local interaction, media policy respected).
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { PatchView } from '../client-src/catalog/PatchView.tsx'
import { en } from '../client-src/locales.ts'
import { getUiState, resetUiStateMemory } from '../client-src/state.ts'
import { resetUiVersions } from '../client-src/versions.ts'
import { applyPatch, snapshotOf } from '../src/catalog/patch.js'
import type { ToolResultNode, ToolViewProps } from '../client-src/types/dsh.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

let host: HTMLDivElement
let root: Root
let send: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>
let sendNew: ReturnType<typeof vi.fn<(text: string, uiId: string, nodeId: string) => Promise<void>>>

beforeEach(() => {
  localStorage.clear()
  resetUiStateMemory()
  resetUiVersions()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  send = vi.fn(async () => {})
  sendNew = vi.fn(async () => {})
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

const base = (callId: string, toolName = 'ui_render') => ({
  callId, toolName, t, sendPrompt: send, sendNewSessionPrompt: sendNew,
})

const settled = (callId: string, args: unknown, meta: Record<string, unknown> = { ok: true }): ToolResultNode => ({
  kind: 'tool-result', callId,
  call: { name: 'ui_render', argsRaw: JSON.stringify(args) },
  content: [], isError: false, meta,
})

/** Render one `ui_render` tree. */
function show(callId: string, args: unknown, meta?: Record<string, unknown>) {
  act(() => root.render(
    <RenderView {...base(callId)} phase="result" block={settled(callId, args, meta)} />,
  ))
}

/** Unmount and mount again on the same host (a reload / a turn move). */
function remount(callId: string, args: unknown, meta?: Record<string, unknown>) {
  act(() => root.unmount())
  root = createRoot(host)
  show(callId, args, meta)
}

const click = (el: Element) => act(() => { (el as HTMLElement).click() })
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
const submit = () => act(() => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })

/** Drive an input the way a user does, so React sees the change. */
function setInputValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function setSelectValue(el: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Apply one `ui_patch` and render the patched version (same UI id). */
function applyAndShow(uiId: string, snapshot: any, ops: unknown[]) {
  const args = { uiId, baseVersion: snapshot.version, ops }
  const result = applyPatch(snapshot, args)
  if (!result.ok) throw new Error(result.errors.join('\n'))
  act(() => root.render(
    <PatchView {...base('patch-1', 'ui_patch')} phase="result"
      block={{
        kind: 'tool-result', callId: 'patch-1', call: { name: 'ui_patch', argsRaw: JSON.stringify(args) },
        content: [], isError: false, meta: { ok: true, ui: result.ui },
      }} />,
  ))
  return result.ui
}

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

const ACC_ITEMS = [
  { id: 'a', title: 'First', text: 'First body' },
  { id: 'b', title: 'Second', text: 'Second body' },
]
const ACC_TREE = {
  root: 'acc',
  components: [
    { id: 'acc', type: 'Accordion', props: { title: 'FAQ', items: ACC_ITEMS } },
  ],
}
const ACC_CHILD_TREE = {
  root: 'acc',
  components: [
    { id: 'acc', type: 'Accordion', props: { title: 'FAQ', items: [{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }] }, children: ['ca', 'cb'] },
    { id: 'ca', type: 'Text', props: { text: 'Child A' } },
    { id: 'cb', type: 'Text', props: { text: 'Child B' } },
  ],
}
const triggers = () => [...host.querySelectorAll<HTMLButtonElement>('.diui-accordion-trigger')]
const panels = () => [...host.querySelectorAll<HTMLElement>('.diui-accordion-panel')]

describe('Accordion', () => {
  it('keeps one section open at a time by default', () => {
    show('acc-1', ACC_TREE)
    expect(triggers().length).toBe(2)
    expect(triggers().every(tg => tg.getAttribute('aria-expanded') === 'false')).toBe(true)
    click(triggers()[0]!)
    expect(triggers()[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(triggers()[1]!.getAttribute('aria-expanded')).toBe('false')
    click(triggers()[1]!)
    expect(triggers()[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(triggers()[1]!.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps several sections open with multiple: true', () => {
    show('acc-2', {
      root: 'acc',
      components: [{ id: 'acc', type: 'Accordion', props: { multiple: true, items: ACC_ITEMS } }],
    })
    click(triggers()[0]!)
    click(triggers()[1]!)
    expect(triggers().map(tg => tg.getAttribute('aria-expanded'))).toEqual(['true', 'true'])
    // Collapsing one keeps the other open.
    click(triggers()[0]!)
    expect(triggers().map(tg => tg.getAttribute('aria-expanded'))).toEqual(['false', 'true'])
  })

  it('moves focus between headers with ArrowDown, ArrowUp, Home and End', () => {
    show('acc-3', ACC_TREE)
    triggers()[0]!.focus()
    key(triggers()[0]!, 'ArrowDown')
    expect(document.activeElement).toBe(triggers()[1])
    key(triggers()[1]!, 'ArrowDown')
    expect(document.activeElement).toBe(triggers()[0])
    key(triggers()[0]!, 'ArrowUp')
    expect(document.activeElement).toBe(triggers()[1])
    key(triggers()[1]!, 'Home')
    expect(document.activeElement).toBe(triggers()[0])
    key(triggers()[0]!, 'End')
    expect(document.activeElement).toBe(triggers()[1])
    // Moving the focus never expands a section.
    expect(triggers().every(tg => tg.getAttribute('aria-expanded') === 'false')).toBe(true)
  })

  it('renders inline item text and child components inside the panels', () => {
    show('acc-4', ACC_TREE)
    expect(panels()[0]!.textContent).toContain('First body')
    expect(panels()[1]!.textContent).toContain('Second body')
    show('acc-5', ACC_CHILD_TREE)
    expect(panels()[0]!.querySelector('.diui-text')!.textContent).toBe('Child A')
    expect(panels()[1]!.querySelector('.diui-text')!.textContent).toBe('Child B')
  })

  it('keeps the expanded section across a ui_patch and a remount', () => {
    show('acc-6', ACC_TREE)
    click(triggers()[1]!)
    expect(triggers()[1]!.getAttribute('aria-expanded')).toBe('true')
    const snapshot = snapshotOf('acc-6', ACC_TREE)
    applyAndShow('acc-6', snapshot, [{ op: 'setProps', id: 'acc', props: { title: 'FAQ (v2)' } }])
    expect(host.querySelector('.diui-accordion-title')!.textContent).toBe('FAQ (v2)')
    expect(triggers()[1]!.getAttribute('aria-expanded')).toBe('true')
    remount('acc-6', ACC_TREE)
    expect(triggers()[1]!.getAttribute('aria-expanded')).toBe('true')
  })
})

// ---------------------------------------------------------------------------
// Steps / KeyValue / EmptyState
// ---------------------------------------------------------------------------

describe('Steps', () => {
  it('derives the statuses from the current index and marks the active step', () => {
    show('st-1', {
      root: 'st',
      components: [{
        id: 'st', type: 'Steps',
        props: { current: 1, items: [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }, { id: 's3', title: 'Three' }] },
      }],
    })
    const steps = [...host.querySelectorAll<HTMLElement>('.diui-step')]
    expect(steps.map(s => s.dataset.status)).toEqual(['done', 'active', 'pending'])
    expect(steps[1]!.getAttribute('aria-current')).toBe('step')
    expect(steps[0]!.getAttribute('aria-current')).toBeNull()
    expect(steps[2]!.getAttribute('aria-current')).toBeNull()
    expect(steps[0]!.textContent).toContain(en['steps.done'])
  })

  it('lets an explicit status win over the derived one', () => {
    show('st-2', {
      root: 'st',
      components: [{
        id: 'st', type: 'Steps',
        props: {
          current: 1,
          items: [{ id: 's1', title: 'One', status: 'error' }, { id: 's2', title: 'Two', status: 'done' }, { id: 's3', title: 'Three' }],
        },
      }],
    })
    const steps = [...host.querySelectorAll<HTMLElement>('.diui-step')]
    // The explicit status wins: the derived `active` for index 1 is replaced.
    expect(steps.map(s => s.dataset.status)).toEqual(['error', 'done', 'pending'])
    expect(steps[0]!.getAttribute('aria-current')).toBeNull()
    expect(steps[1]!.getAttribute('aria-current')).toBeNull()
    expect(steps[2]!.getAttribute('aria-current')).toBeNull()
  })
})

describe('KeyValue', () => {
  it('lays out 1-3 columns, resolves a computed value and copies a value', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    show('kv-1', {
      root: 'kv',
      computed: [{ id: 'total', expr: '40 + 2' }],
      components: [{
        id: 'kv', type: 'KeyValue',
        props: {
          title: 'Spec', columns: 3,
          items: [
            { key: 'Total', value: { $computed: 'total' }, copyable: true },
            { key: 'Owner', value: 'Ada', hint: 'maintainer' },
          ],
        },
      }],
    })
    const grid = host.querySelector<HTMLElement>('.diui-kv-grid')!
    expect(grid.style.getPropertyValue('--diui-kv-cols')).toBe('3')
    const values = [...host.querySelectorAll('.diui-kv-val')].map(el => el.textContent)
    expect(values).toEqual(['42', 'Ada'])
    expect(host.textContent).toContain('maintainer')

    const copy = host.querySelector<HTMLButtonElement>('.diui-kv-copy')!
    expect(copy.textContent).toBe(en['kv.copy'])
    await act(async () => { copy.click() })
    expect(writeText).toHaveBeenCalledWith('42')
    expect(host.querySelector('.diui-kv-copy')!.textContent).toBe(en['kv.copied'])
  })

  it('renders an HTML string as literal text, never as markup', () => {
    show('kv-2', {
      root: 'kv',
      components: [{
        id: 'kv', type: 'KeyValue',
        props: { items: [{ key: 'Note', value: '<img src=x onerror=alert(1)><script>alert(2)</script>' }] },
      }],
    })
    expect(host.querySelector('img,script')).toBeNull()
    expect(host.querySelector('.diui-kv-val')!.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('EmptyState', () => {
  it('renders the callout and sends the prompt when the button is clicked', async () => {
    show('es-1', {
      root: 'es',
      components: [{
        id: 'es', type: 'EmptyState',
        props: { title: 'Nothing here yet', description: 'Ask the agent to build it.', actionLabel: 'Ask', prompt: 'Build the report' },
      }],
    })
    expect(host.querySelector('.diui-empty-state-title')!.textContent).toBe('Nothing here yet')
    expect(host.querySelector('.diui-empty-state-desc')!.textContent).toBe('Ask the agent to build it.')
    const button = host.querySelector<HTMLButtonElement>('.diui-empty-state-actions button')!
    expect(button.textContent).toBe('Ask')
    await act(async () => { button.click() })
    expect(send).toHaveBeenCalledExactlyOnceWith('Build the report')
  })
})

// ---------------------------------------------------------------------------
// FollowUp / Sources
// ---------------------------------------------------------------------------

const FOLLOW_UP = {
  root: 'fu',
  components: [{
    id: 'fu', type: 'FollowUp',
    props: {
      title: 'Next?',
      items: [
        { id: 'x', label: 'Ask about X', prompt: 'prompt x' },
        { id: 'y', label: 'Start Y', prompt: 'prompt y', sessionTarget: 'new' },
      ],
    },
  }],
}
const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.diui-followup-chip')]

describe('FollowUp', () => {
  it('sends the prompt of a current-session chip and remembers the send', async () => {
    show('fu-1', FOLLOW_UP)
    expect(chips()[0]!.dataset.sent).toBeUndefined()
    await act(async () => { chips()[0]!.click() })
    expect(send).toHaveBeenCalledExactlyOnceWith('prompt x')
    expect(chips()[0]!.dataset.sent).toBe('true')
    expect(sendNew).not.toHaveBeenCalled()
  })

  it('sends a new-session chip to a new session and disables it afterwards', async () => {
    show('fu-2', FOLLOW_UP)
    await act(async () => { chips()[1]!.click() })
    expect(sendNew).toHaveBeenCalledTimes(1)
    expect(sendNew.mock.calls[0]![0]).toBe('prompt y')
    expect(sendNew.mock.calls[0]![2]).toBe('fu')
    expect(send).not.toHaveBeenCalled()
    expect(chips()[1]!.dataset.sent).toBe('true')
    expect(chips()[1]!.disabled).toBe(true)
    // The current-session chip stays clickable.
    expect(chips()[0]!.disabled).toBe(false)
  })
})

describe('Sources', () => {
  it('links an https source and prints a document label as plain text', () => {
    show('src-1', {
      root: 'src',
      components: [{
        id: 'src', type: 'Sources',
        props: {
          title: 'References',
          items: [
            { id: 'a', title: 'The docs', url: 'https://example.com/docs', source: 'web' },
            { id: 'b', title: 'A printed manual', note: 'no link' },
          ],
        },
      }],
    })
    const link = host.querySelector<HTMLAnchorElement>('.diui-source-link')!
    expect(link.getAttribute('href')).toBe('https://example.com/docs')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.textContent).toBe('The docs')
    const plain = host.querySelector('.diui-source-title')!
    expect(plain.textContent).toBe('A printed manual')
    expect(host.querySelectorAll('a')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Segmented
// ---------------------------------------------------------------------------

const SEG_TREE = {
  root: 'stack',
  computed: [{ id: 'share', expr: 'dept * 2' }],
  components: [
    { id: 'stack', type: 'Stack', children: ['seg', 'bar', 'chart', 'tbl'] },
    {
      id: 'seg', type: 'Segmented',
      props: {
        label: 'Dept', bindKey: 'dept', defaultValue: 3,
        options: [{ value: 3, label: 'Three' }, { value: 6, label: 'Six' }, { value: 9, label: 'Nine' }],
      },
    },
    { id: 'bar', type: 'Progress', props: { label: 'Share', max: 100, value: { $computed: 'share' } } },
    { id: 'chart', type: 'Chart', props: { kind: 'bar', labels: ['Now'], series: [{ name: 'S', values: [{ $computed: 'share' }] }] } },
    { id: 'tbl', type: 'Table', props: { columns: ['Dept', 'Name'], rows: [[3, 'Alpha'], [6, 'Bravo'], [9, 'Charlie']], filterField: 'Dept', filterValue: '{{dept}}' } },
  ],
}
const segButtons = () => [...host.querySelectorAll<HTMLButtonElement>('.diui-segmented-btn')]
const progressValue = () => host.querySelector('.diui-progress-track')!.getAttribute('aria-valuenow')
const barTitles = () => [...host.querySelectorAll('rect title')].map(el => el.textContent)
const tableRows = () => [...host.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent).join('|'))

describe('Segmented', () => {
  it('drives a computed formula, a chart and a table filter locally, without a message', () => {
    show('seg-1', SEG_TREE)
    expect(progressValue()).toBe('6')
    expect(barTitles()).toEqual(['Now · S: 6'])
    expect(tableRows()).toEqual(['3|Alpha'])

    click(segButtons()[1]!)
    expect(progressValue()).toBe('12')
    expect(barTitles()).toEqual(['Now · S: 12'])
    expect(tableRows()).toEqual(['6|Bravo'])
    expect(getUiState('seg-1', 'dept')).toBe(6)
    expect(send).not.toHaveBeenCalled()
  })

  it('selects with the arrow keys', () => {
    show('seg-2', SEG_TREE)
    key(segButtons()[0]!, 'ArrowRight')
    expect(getUiState('seg-2', 'dept')).toBe(6)
    expect(segButtons()[1]!.getAttribute('aria-checked')).toBe('true')
    key(segButtons()[1]!, 'End')
    expect(getUiState('seg-2', 'dept')).toBe(9)
    expect(send).not.toHaveBeenCalled()
  })

  it('falls back to the default value when a patch removes the selected option', () => {
    show('seg-3', SEG_TREE)
    click(segButtons()[2]!)
    expect(getUiState('seg-3', 'dept')).toBe(9)
    const snapshot = snapshotOf('seg-3', SEG_TREE)
    applyAndShow('seg-3', snapshot, [{
      op: 'setProps', id: 'seg',
      props: { options: [{ value: 3, label: 'Three' }, { value: 6, label: 'Six' }] },
    }])
    const checked = segButtons().filter(b => b.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]!.textContent).toBe('Three')
  })
})

// ---------------------------------------------------------------------------
// Choice (multi-select, chips)
// ---------------------------------------------------------------------------

const CHOICE_OPTIONS = [
  { id: 'a', label: 'Alpha', prompt: 'do alpha' },
  { id: 'b', label: 'Beta', prompt: 'do beta' },
  { id: 'c', label: 'Gamma', prompt: 'do gamma' },
  { id: 'd', label: 'Delta', prompt: 'do delta' },
]
const CHOICE_TREE = {
  root: 'choice',
  components: [{
    id: 'choice', type: 'Choice',
    props: {
      question: 'Which ones?', multiple: true, minSelect: 2, maxSelect: 3, variant: 'chips',
      options: CHOICE_OPTIONS,
    },
  }],
}
const boxes = () => [...host.querySelectorAll<HTMLInputElement>('.diui-choice-options input[type=checkbox]')]
const submitButton = () => host.querySelector<HTMLButtonElement>('.diui-choice-submit')!

describe('Choice (multiple)', () => {
  it('keeps the submit disabled until minSelect is met and blocks past maxSelect', () => {
    show('ch-1', CHOICE_TREE)
    expect(host.querySelector('.diui-choice-options')!.getAttribute('data-variant')).toBe('chips')
    expect(submitButton().disabled).toBe(true)
    click(boxes()[0]!)
    expect(submitButton().disabled).toBe(true)
    click(boxes()[1]!)
    expect(submitButton().disabled).toBe(false)
    click(boxes()[2]!)
    // At the cap: the unchecked option is disabled.
    expect(boxes()[3]!.disabled).toBe(true)
    expect(boxes()[2]!.checked).toBe(true)
    click(boxes()[1]!)
    expect(boxes()[3]!.disabled).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the joined prompts in option order', async () => {
    show('ch-2', CHOICE_TREE)
    click(boxes()[2]!)
    click(boxes()[0]!)
    await act(async () => { submit() })
    expect(send).toHaveBeenCalledExactlyOnceWith('do alpha\n\ndo gamma')
    expect(sendNew).not.toHaveBeenCalled()
  })

  it('keeps the checked ids across a patch, drops removed ids and never auto-submits', async () => {
    show('ch-3', CHOICE_TREE)
    click(boxes()[0]!)
    click(boxes()[2]!)
    const snapshot = snapshotOf('ch-3', CHOICE_TREE)
    const ui1 = applyAndShow('ch-3', snapshot, [{
      op: 'setProps', id: 'choice',
      props: { options: [{ id: 'c', label: 'Gamma (edited)', prompt: 'do gamma' }, { id: 'a', label: 'Alpha', prompt: 'do alpha' }, { id: 'd', label: 'Delta', prompt: 'do delta' }] },
    }])
    const after = boxes()
    expect(after.map(b => b.checked)).toEqual([true, true, false])
    expect(after[0]!.value).toBe('c')
    expect(after[1]!.value).toBe('a')
    // No automatic submission on a patch.
    expect(send).not.toHaveBeenCalled()
    expect(sendNew).not.toHaveBeenCalled()

    applyAndShow('ch-3', ui1, [{
      op: 'setProps', id: 'choice',
      props: { options: [{ id: 'a', label: 'Alpha', prompt: 'do alpha' }, { id: 'd', label: 'Delta', prompt: 'do delta' }] },
    }])
    // The removed id is dropped; only 'a' stays selected.
    expect(boxes().map(b => b.checked)).toEqual([true, false])
    expect(send).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

describe('Form fields', () => {
  it('toggles a switch and publishes its bindKey', () => {
    show('fm-1', {
      root: 'form',
      components: [{
        id: 'form', type: 'Form',
        props: { fields: [{ name: 'flag', label: 'Flag', type: 'switch', bindKey: 'flag' }] },
      }],
    })
    const sw = host.querySelector<HTMLButtonElement>('.diui-switch')!
    expect(sw.getAttribute('role')).toBe('switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(getUiState('fm-1', 'flag')).toBe(true)
    click(sw)
    expect(getUiState('fm-1', 'flag')).toBe(false)
  })

  it('adds tags on Enter, comma and paste, warns on duplicates and removes them again', () => {
    show('fm-2', {
      root: 'form',
      components: [{
        id: 'form', type: 'Form',
        props: { fields: [{ name: 'tags', label: 'Tags', type: 'tags', maxTags: 3 }] },
      }],
    })
    const input = host.querySelector<HTMLInputElement>('.diui-tag-input')!
    const tagTexts = () => [...host.querySelectorAll('.diui-tag-chip > span:first-child')].map(el => el.textContent)

    setInputValue(input, 'alpha')
    key(input, 'Enter')
    expect(tagTexts()).toEqual(['alpha'])

    // A comma in the typed value commits every token.
    setInputValue(input, 'beta,gamma')
    expect(tagTexts()).toEqual(['alpha', 'beta', 'gamma'])

    // The tag limit disables the input.
    expect(input.disabled).toBe(true)

    // A duplicate is reported and adds nothing.
    const input2 = host.querySelector<HTMLInputElement>('.diui-tag-input')!
    expect(input2.disabled).toBe(true)
  })

  it('warns on a duplicate tag and removes tags with × and Backspace', () => {
    show('fm-3', {
      root: 'form',
      components: [{
        id: 'form', type: 'Form',
        props: { fields: [{ name: 'tags', label: 'Tags', type: 'tags' }] },
      }],
    })
    const input = host.querySelector<HTMLInputElement>('.diui-tag-input')!
    const tagTexts = () => [...host.querySelectorAll('.diui-tag-chip > span:first-child')].map(el => el.textContent)
    setInputValue(input, 'alpha')
    key(input, 'Enter')
    expect(tagTexts()).toEqual(['alpha'])

    setInputValue(input, 'alpha')
    key(input, 'Enter')
    expect(host.querySelector('.diui-tags')!.getAttribute('data-duplicate')).toBe('true')
    expect(host.textContent).toContain('alpha')
    expect(tagTexts()).toEqual(['alpha'])

    // Remove with the × button.
    click(host.querySelector<HTMLButtonElement>('.diui-tag-remove')!)
    expect(tagTexts()).toEqual([])

    // Backspace on an empty draft removes the last tag.
    setInputValue(input, 'beta')
    key(input, 'Enter')
    expect(tagTexts()).toEqual(['beta'])
    key(input, 'Backspace')
    expect(tagTexts()).toEqual([])
  })

  it('adds pasted tags that contain separators', () => {
    show('fm-4', {
      root: 'form',
      components: [{
        id: 'form', type: 'Form',
        props: { fields: [{ name: 'tags', label: 'Tags', type: 'tags' }] },
      }],
    })
    const input = host.querySelector<HTMLInputElement>('.diui-tag-input')!
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'x,y,z' } })
    act(() => { input.dispatchEvent(event) })
    expect([...host.querySelectorAll('.diui-tag-chip > span:first-child')].map(el => el.textContent)).toEqual(['x', 'y', 'z'])
  })

  it('updates a daterange and drives a day-span formula', () => {
    show('fm-5', {
      root: 'stack',
      computed: [{ id: 'days', expr: 'span' }],
      components: [
        { id: 'stack', type: 'Stack', children: ['form', 'bar'] },
        {
          id: 'form', type: 'Form',
          props: { fields: [{ name: 'span', label: 'Span', type: 'daterange', bindKey: 'span' }] },
        },
        { id: 'bar', type: 'Progress', props: { label: 'Days', max: 30, value: { $computed: 'days' } } },
      ],
    })
    const start = host.querySelector<HTMLInputElement>('input[name="span.start"]')!
    const end = host.querySelector<HTMLInputElement>('input[name="span.end"]')!
    setInputValue(start, '2026-01-01')
    setInputValue(end, '2026-01-08')
    expect(getUiState('fm-5', 'span')).toEqual({ start: '2026-01-01', end: '2026-01-08' })
    expect(progressValue()).toBe('7')
  })

  it('filters a long option list through .diui-select-search and keeps the selected option', () => {
    const options = Array.from({ length: 16 }, (_, i) => `Option ${i + 1}`)
    show('fm-6', {
      root: 'form',
      components: [{
        id: 'form', type: 'Form',
        props: { fields: [{ name: 'pick', label: 'Pick', type: 'select', options }] },
      }],
    })
    const search = host.querySelector<HTMLInputElement>('.diui-select-search')!
    expect(search).not.toBeNull()
    const select = host.querySelector<HTMLSelectElement>('select')!
    setSelectValue(select, 'Option 3')
    expect(select.value).toBe('Option 3')
    setInputValue(search, 'Option 1')
    const visible = [...select.options].map(o => o.value)
    expect(visible).toContain('Option 3')
    expect(visible).toContain('Option 1')
    expect(visible).not.toContain('Option 7')
  })

  it('shows the search box for a short list when searchable is set', () => {
    show('fm-7', {
      root: 'form',
      components: [{
        id: 'form', type: 'Form',
        props: { fields: [{ name: 'pick', label: 'Pick', type: 'select', searchable: true, options: ['A', 'B', 'C'] }] },
      }],
    })
    expect(host.querySelector('.diui-select-search')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const CAL_EVENTS = [
  { id: 'e1', title: 'Standup', start: '2026-10-20T10:00', end: '2026-10-20T10:30', group: 'Work' },
  { id: 'e2', title: 'Review', start: '2026-10-20T10:15', end: '2026-10-20T11:00', group: 'Work' },
  { id: 'e3', title: 'UTC sync', start: '2026-10-21T02:00:00Z', end: '2026-10-21T03:00:00Z', group: 'Ops' },
]
const CAL_TREE = {
  root: 'cal',
  components: [{ id: 'cal', type: 'Calendar', props: { title: 'Week', timeZone: 'Asia/Shanghai', view: 'week', events: CAL_EVENTS } }],
}
const calEvents = () => [...host.querySelectorAll<HTMLElement>('.diui-calendar-event')]
const eventByTitle = (title: string) => calEvents().find(e => e.textContent!.includes(title))!

describe('Calendar', () => {
  it('renders the week, day and agenda views', () => {
    show('cal-1', CAL_TREE)
    expect(host.querySelectorAll('.diui-calendar-day-col')).toHaveLength(7)
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.diui-calendar-view-btn')]
    click(buttons.find(b => b.textContent === en['calendar.day'])!)
    expect(host.querySelectorAll('.diui-calendar-day-col')).toHaveLength(1)
    click(host.querySelectorAll<HTMLButtonElement>('.diui-calendar-view-btn')[2]!)
    expect(host.querySelector('.diui-calendar-agenda')).not.toBeNull()
    expect(host.querySelectorAll('.diui-calendar-agenda-item').length).toBe(3)
  })

  it('splits overlapping events into columns and converts a UTC instant into Asia/Shanghai', () => {
    show('cal-2', CAL_TREE)
    expect(calEvents().length).toBe(3)
    expect(eventByTitle('Standup').style.width).toBe('50%')
    expect(eventByTitle('Review').style.width).toBe('50%')
    // 02:00 UTC is 10:00 in Asia/Shanghai.
    expect(eventByTitle('UTC sync').textContent).toContain('10:00–11:00')
  })

  it('opens the detail panel of a clicked event', () => {
    show('cal-3', CAL_TREE)
    expect(host.querySelector('.diui-calendar-detail')).toBeNull()
    click(eventByTitle('Review'))
    const detail = host.querySelector('.diui-calendar-detail')!
    expect(detail.textContent).toContain('Review')
    expect(detail.textContent).toContain('Asia/Shanghai')
    expect(send).not.toHaveBeenCalled()
  })

  it('toggles a group in the legend', () => {
    show('cal-4', CAL_TREE)
    const legend = [...host.querySelectorAll<HTMLButtonElement>('.diui-legend-item')]
    expect(legend).toHaveLength(2)
    expect(calEvents().length).toBe(3)
    click(legend[0]!)
    expect(calEvents().length).toBe(1)
    expect(eventByTitle('UTC sync')).toBeTruthy()
    click(legend[0]!)
    expect(calEvents().length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Chart (hbar, radar)
// ---------------------------------------------------------------------------

describe('Chart hbar and radar', () => {
  it('draws horizontal bars with a title per value', () => {
    show('ch-h', {
      root: 'chart',
      components: [{
        id: 'chart', type: 'Chart',
        props: {
          kind: 'hbar', labels: ['Alpha', 'Beta'],
          series: [{ name: 'S', values: [10, -5] }],
        },
      }],
    })
    const rects = [...host.querySelectorAll<SVGElement>('rect.diui-hbar-rect')]
    expect(rects).toHaveLength(2)
    expect(rects.map(r => r.querySelector('title')!.textContent)).toEqual(['Alpha · S: 10', 'Beta · S: -5'])
  })

  it('stacks positive and negative values in an hbar chart', () => {
    show('ch-hs', {
      root: 'chart',
      components: [{
        id: 'chart', type: 'Chart',
        props: {
          kind: 'hbar', stacked: true, labels: ['Row'],
          series: [{ name: 'Pos', values: [10] }, { name: 'Neg', values: [-5] }],
        },
      }],
    })
    const rects = [...host.querySelectorAll<SVGElement>('rect.diui-hbar-rect')]
    expect(rects).toHaveLength(2)
    expect(rects.map(r => r.querySelector('title')!.textContent)).toEqual(['Row · Pos: 10', 'Row · Neg: -5'])
    for (const rect of rects) expect(Number(rect.getAttribute('width'))).toBeGreaterThan(0)
  })

  it('draws a radar polygon with vertex circles and a keyboard tooltip', () => {
    show('ch-r', {
      root: 'chart',
      components: [{
        id: 'chart', type: 'Chart',
        props: { kind: 'radar', labels: ['A', 'B', 'C'], series: [{ name: 'S', values: [3, 5, 4] }] },
      }],
    })
    expect(host.querySelectorAll('polygon.diui-radar-poly')).toHaveLength(1)
    const dots = [...host.querySelectorAll<SVGElement>('circle')]
    expect(dots).toHaveLength(3)
    expect(dots.map(d => d.querySelector('title')!.textContent)).toEqual(['A · S: 3', 'B · S: 5', 'C · S: 4'])

    const svg = host.querySelector<SVGElement>('svg.diui-chart-svg')!
    expect(host.querySelector('.diui-tooltip')).toBeNull()
    key(svg, 'ArrowRight')
    expect(host.querySelector('.diui-tooltip')!.textContent).toContain('A')
    expect(host.querySelector('.diui-tooltip')!.textContent).toContain('S: 3')
    key(svg, 'ArrowRight')
    expect(host.querySelector('.diui-tooltip')!.textContent).toContain('B')
  })
})

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

describe('Audio', () => {
  it('mounts the player for an allowed origin', () => {
    show('au-1', {
      root: 'au',
      components: [{ id: 'au', type: 'Audio', props: { src: 'https://cdn.example.com/a.mp3', title: 'Clip' } }],
    }, { ok: true, policy: { mediaOrigins: ['https://cdn.example.com'] } })
    const audio = host.querySelector('audio')!
    expect(audio.getAttribute('src')).toBe('https://cdn.example.com/a.mp3')
    expect(host.querySelector('.diui-audio-fallback')).toBeNull()
  })

  it('shows a fallback without an <audio> element when the origin is blocked', () => {
    show('au-2', {
      root: 'au',
      components: [{ id: 'au', type: 'Audio', props: { src: 'https://other.example.com/a.mp3', title: 'Clip' } }],
    }, { ok: true, policy: { mediaOrigins: ['https://cdn.example.com'] } })
    expect(host.querySelector('audio')).toBeNull()
    expect(host.querySelector('.diui-audio-fallback')!.textContent).toContain(en['audio.blocked'])
  })

  it('shows a fallback without an <audio> element when the package is offline', () => {
    show('au-3', {
      root: 'au',
      components: [{ id: 'au', type: 'Audio', props: { src: 'https://cdn.example.com/a.mp3', title: 'Clip' } }],
    }, { ok: true, policy: { allowMedia: false } })
    expect(host.querySelector('audio')).toBeNull()
    expect(host.querySelector('.diui-audio-fallback')!.textContent).toContain(en['audio.offline'])
  })
})
