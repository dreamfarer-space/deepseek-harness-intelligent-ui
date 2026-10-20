// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTree, childPath } from '../client-src/catalog/CodeView.tsx'
import { RenderView } from '../client-src/catalog/RenderView.tsx'
import { en } from '../client-src/locales.ts'
import { resetUiStateMemory } from '../client-src/state.ts'
import type { ToolViewProps } from '../client-src/types/dsh.ts'
import { LIMITS, validateProps } from '../src/catalog/catalog.js'
import { diffLines, hunks, parsePatch, splitLines } from '../src/catalog/diff.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof en, vars?: Record<string, string | number>) =>
  en[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as ToolViewProps['t']

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

function show(type: string, props: Record<string, unknown>) {
  const args = { root: 'n', components: [{ id: 'n', type, props }] }
  act(() => root.render(<RenderView callId="v1" toolName="ui_render" phase="result" t={t} sendPrompt={vi.fn(async () => {})}
    block={{ kind: 'tool-result', callId: 'v1', call: { name: 'ui_render', argsRaw: JSON.stringify(args) }, content: [], isError: false, meta: { ok: true } }} />))
}
const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click() })
const buttonText = (s: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(s))

describe('line diff', () => {
  it('normalises line endings and a trailing newline', () => {
    expect(splitLines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c'])
    expect(splitLines('')).toEqual([])
  })
  it('produces a minimal script that rebuilds both sides', () => {
    for (let k = 0; k < 200; k++) {
      const gen = () => Array.from({ length: Math.floor(Math.random() * 25) }, () => 'abcd'[Math.floor(Math.random() * 4)]).join('\n')
      const a = gen(), b = gen()
      const d = diffLines(a, b)
      expect(d.lines.filter(l => l.op !== '+').map(l => l.text)).toEqual(splitLines(a))
      expect(d.lines.filter(l => l.op !== '-').map(l => l.text)).toEqual(splitLines(b))
      expect(d.truncated).toBe(false)
    }
    const d = diffLines('a\nb\nc\n', 'a\nB\nc\n')
    expect(d.lines.map(l => l.op + l.text)).toEqual([' a', '-b', '+B', ' c'])
    expect(d.lines[2]).toMatchObject({ newNo: 2 })
  })
  it('collapses long unchanged runs around hunks', () => {
    const a = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n')
    const b = a.replace('l15', 'L15')
    expect(hunks(diffLines(a, b).lines, 3).map(h => `${h.kind}:${h.lines.length}`)).toEqual(['skip:12', 'lines:8', 'skip:11'])
  })
  it('parses unified patches with hunk numbering, gaps and no-newline markers', () => {
    const p = parsePatch(['diff --git a/x b/x', '--- a/x', '+++ b/x', '@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c', '@@ -10,2 +10,3 @@ fn()', ' x', '+y', ' z', '\\ No newline at end of file'].join('\n'))
    expect(p.added).toBe(2)
    expect(p.removed).toBe(1)
    expect(p.lines.map(l => l.op)).toEqual([' ', '-', '+', ' ', 'gap', ' ', '+', ' '])
    expect(p.lines.at(-1)).toMatchObject({ text: 'z', oldNo: 11, newNo: 12 })
  })
})

describe('CodeDiff', () => {
  const FILES = [
    { path: 'src/app.ts', before: Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'), after: Array.from({ length: 20 }, (_, i) => i === 10 ? 'changed <b>x</b>' : `line ${i}`).join('\n') },
    { path: 'README.md', patch: '@@ -1,2 +1,2 @@\n-# Old\n+# New\n text\n' },
    { path: 'new.txt', after: 'hello\n' },
  ]
  it('renders per-file counts, collapses context and expands it on demand', () => {
    show('CodeDiff', { title: 'Refactor', files: FILES })
    expect(host.querySelector('.diui-diff-summary')?.textContent).toContain('3 file(s)')
    expect(host.querySelector('.diui-diff-summary')?.textContent).toContain('+3')
    expect(host.querySelector('.diui-diff-summary')?.textContent).toContain('−2')
    expect(host.textContent).toContain('Show 7 unchanged lines')
    const before = host.querySelectorAll('.diui-diff-line').length
    click(buttonText('Show 7 unchanged lines'))
    expect(host.querySelectorAll('.diui-diff-line').length).toBe(before + 7)
    expect(host.textContent).toContain('Added')
  })
  it('shows code as text, never as HTML', () => {
    show('CodeDiff', { files: FILES })
    expect(host.querySelector('b')).toBeNull()
    expect(host.textContent).toContain('changed <b>x</b>')
  })
  it('collapses a file and keeps that choice across a remount', () => {
    show('CodeDiff', { files: FILES })
    click(buttonText('src/app.ts'))
    expect(buttonText('src/app.ts')!.getAttribute('aria-expanded')).toBe('false')
    act(() => root.unmount())
    root = createRoot(host)
    show('CodeDiff', { files: FILES })
    expect(buttonText('src/app.ts')!.getAttribute('aria-expanded')).toBe('false')
  })
  it('validates inputs and size limits', () => {
    expect(validateProps('CodeDiff', { files: FILES })).toEqual([])
    expect(validateProps('CodeDiff', { files: [{ path: 'a' }] }).join()).toContain('needs before/after')
    expect(validateProps('CodeDiff', { files: [{ path: 'a', patch: 'x', after: 'y' }] }).join()).toContain('either patch or before/after')
    const big = 'x'.repeat(LIMITS.diffChars / 2 + 1)
    expect(validateProps('CodeDiff', { files: [{ path: 'a', before: big, after: big }] }).join()).toContain(`at most ${LIMITS.diffChars}`)
  })
})

describe('FileTree', () => {
  const ENTRIES = [
    { path: 'src/index.ts', status: 'modified' },
    { path: 'src/ui/Button.tsx', status: 'added', note: 'new component' },
    { path: 'src\\ui\\old.css', status: 'deleted' },
    { path: 'docs/' },
    { path: 'package.json' },
  ]
  it('builds a tree from slash or backslash paths and counts files', () => {
    const tree = buildTree(ENTRIES as never)
    expect([...tree.children.keys()]).toEqual(['src', 'docs', 'package.json'])
    expect(tree.children.get('src')!.files).toBe(3)
  })
  it('lists directories first, expands to a depth and toggles with a click', () => {
    show('FileTree', { entries: ENTRIES, expandDepth: 1 })
    const rows = () => [...host.querySelectorAll('.diui-tree-row')].map(r => r.textContent)
    expect(rows()[0]).toContain('docs')
    expect(rows().some(r => r?.includes('index.ts'))).toBe(true)
    expect(rows().some(r => r?.includes('Button.tsx'))).toBe(false)
    click(buttonText('ui'))
    expect(rows().some(r => r?.includes('Button.tsx') && r.includes('Added') && r.includes('new component'))).toBe(true)
    expect(host.querySelector('[role=tree]')).not.toBeNull()
  })
  it('validates entries', () => {
    expect(validateProps('FileTree', { entries: ENTRIES })).toEqual([])
    expect(validateProps('FileTree', { entries: [{ path: 'a', status: 'moved' }] })).not.toEqual([])
  })
})

describe('JsonView', () => {
  const DATA = { user: { id: 7, name: 'Ann', 'first-tag': ['a', 'b'] }, ok: true, missing: null }
  it('builds paths for identifiers, odd keys and indexes', () => {
    expect(childPath('$', 'user')).toBe('$.user')
    expect(childPath('$.user', 'first-tag')).toBe('$.user["first-tag"]')
    expect(childPath('$.list', 2)).toBe('$.list[2]')
  })
  it('expands to a depth, toggles nodes and copies paths', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    show('JsonView', { data: DATA, expandDepth: 1 })
    expect(host.textContent).toContain('"user": {')
    expect(host.textContent).toContain('3 items')
    expect(host.textContent).not.toContain('"Ann"')
    click(buttonText('"user"'))
    expect(host.textContent).toContain('"Ann"')
    await act(async () => { buttonText('$.user.name')!.click() })
    expect(writeText).toHaveBeenCalledWith('$.user.name')
    expect(host.textContent).toContain('Copied $.user.name')
  })
  it('validates size and depth', () => {
    expect(validateProps('JsonView', { data: DATA })).toEqual([])
    let deep: unknown = 1
    for (let i = 0; i < LIMITS.jsonDepth + 2; i++) deep = [deep]
    expect(validateProps('JsonView', { data: deep }).join()).toContain('nested deeper')
    expect(validateProps('JsonView', { data: 'x'.repeat(LIMITS.jsonChars) }).join()).toContain('characters')
  })
})
