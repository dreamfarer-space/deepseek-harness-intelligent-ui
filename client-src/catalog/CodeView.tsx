import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { diffLines, hunks, parsePatch } from '../../src/catalog/diff.js'
import { useUiState } from '../state.ts'
import type { Translate } from '../types/dsh.ts'

/*
 * Code and structure viewers. Every string is rendered as React text, never as
 * HTML, and nothing reads files: paths are labels supplied by the model.
 */

type Line = { op: ' ' | '-' | '+'; text: string; oldNo?: number; newNo?: number }
type Row = Line | { op: 'gap'; text: string }

export interface DiffFile { path: string; before?: string; after?: string; patch?: string; language?: string }

interface Shared { t: Translate; callId?: string; nodeId: string }

export function CodeDiff(props: { files: DiffFile[]; title?: string; context?: number } & Shared) {
  const { t } = props
  const totals = useMemo(() => props.files.map(f => fileDiff(f)), [props.files])
  const added = totals.reduce((a, d) => a + d.added, 0)
  const removed = totals.reduce((a, d) => a + d.removed, 0)
  return (
    <section className="diui-diff" aria-label={props.title ?? t('diff.title')}>
      <header className="diui-diff-summary">
        {props.title && <strong>{props.title}</strong>}
        <span>{t('diff.files', { count: props.files.length })}</span>
        <span className="diui-diff-add">+{added}</span>
        <span className="diui-diff-del">−{removed}</span>
      </header>
      {props.files.map((f, i) => <DiffFileView key={i} file={f} diff={totals[i]!} index={i} context={props.context ?? 3} {...props} />)}
    </section>
  )
}

function fileDiff(f: DiffFile): { rows: Row[]; added: number; removed: number; truncated: boolean; kind: 'added' | 'deleted' | 'modified' } {
  if (typeof f.patch === 'string') {
    const p = parsePatch(f.patch)
    return { rows: p.lines as Row[], added: p.added, removed: p.removed, truncated: false, kind: 'modified' }
  }
  const d = diffLines(f.before ?? '', f.after ?? '')
  const kind = f.before === undefined || f.before === '' ? 'added' : f.after === undefined || f.after === '' ? 'deleted' : 'modified'
  return { rows: d.lines as Row[], added: d.added, removed: d.removed, truncated: d.truncated, kind }
}

function DiffFileView(props: { file: DiffFile; diff: ReturnType<typeof fileDiff>; index: number; context: number } & Shared) {
  const { t, file, diff } = props
  // Large files start collapsed; the user's choice persists.
  const [open, setOpen] = useUiState(props.callId, `${props.nodeId}:file${props.index}`, diff.rows.length <= 400)
  const [expanded, setExpanded] = useUiState<number[]>(props.callId, `${props.nodeId}:expand${props.index}`, [])
  const blocks = useMemo(() => {
    if (typeof file.patch === 'string') return [{ kind: 'lines' as const, lines: diff.rows }]
    return hunks(diff.rows as Line[], props.context) as { kind: 'lines' | 'skip'; lines: Row[] }[]
  }, [diff.rows, file.patch, props.context])
  return (
    <div className="diui-diff-file" data-kind={diff.kind}>
      <button type="button" className="diui-diff-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="diui-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="diui-diff-path">{file.path}</span>
        {diff.kind !== 'modified' && <span className="diui-badge" data-tone={diff.kind === 'added' ? 'success' : 'error'}>{t(diff.kind === 'added' ? 'diff.added' : 'diff.deleted')}</span>}
        <span className="diui-diff-add">+{diff.added}</span>
        <span className="diui-diff-del">−{diff.removed}</span>
      </button>
      {open && (
        <div className="diui-diff-body" role="table" aria-label={file.path}>
          {diff.truncated && <div className="diui-note">{t('diff.tooLarge')}</div>}
          {diff.rows.length === 0 && <div className="diui-empty">{t('diff.noChanges')}</div>}
          {blocks.map((b, bi) => b.kind === 'skip' && !expanded.includes(bi)
            ? <button key={bi} type="button" className="diui-diff-skip" onClick={() => setExpanded([...expanded, bi])}>{t('diff.showUnchanged', { count: b.lines.length })}</button>
            : <div key={bi} role="rowgroup">{b.lines.map((l, li) => <DiffRow key={li} row={l} />)}</div>)}
        </div>
      )}
    </div>
  )
}

function DiffRow({ row }: { row: Row }) {
  if (row.op === 'gap') return <div className="diui-diff-gap" role="row">⋯ {row.text}</div>
  return (
    <div className="diui-diff-line" data-op={row.op === ' ' ? undefined : row.op} role="row">
      <span className="diui-diff-no" aria-hidden="true">{row.oldNo ?? ''}</span>
      <span className="diui-diff-no" aria-hidden="true">{row.newNo ?? ''}</span>
      <span className="diui-diff-sign" aria-label={row.op === '+' ? 'added' : row.op === '-' ? 'removed' : undefined}>{row.op === ' ' ? ' ' : row.op}</span>
      <code className="diui-diff-text">{row.text}</code>
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface TreeEntry { path: string; status?: 'added' | 'modified' | 'deleted' | 'renamed'; note?: string }
interface TreeNode { name: string; path: string; children: Map<string, TreeNode>; entry?: TreeEntry; files: number }

/** Split "a/b/c" or "a\\b\\c" into a tree; directories are paths with children or a trailing slash. */
export function buildTree(entries: readonly TreeEntry[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map(), files: 0 }
  for (const e of entries) {
    const parts = e.path.split(/[\\/]+/).filter(Boolean)
    let node = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let next = node.children.get(part)
      if (!next) node.children.set(part, next = { name: part, path, children: new Map(), files: 0 })
      node = next
    })
    if (node !== root) node.entry = e
  }
  const count = (n: TreeNode): number => n.files = n.children.size === 0 ? 1 : [...n.children.values()].reduce((a, c) => a + count(c), 0)
  count(root)
  return root
}

const isDir = (n: TreeNode) => n.children.size > 0 || /[\\/]$/.test(n.entry?.path ?? '')

export function FileTree(props: { entries: TreeEntry[]; title?: string; expandDepth?: number } & Shared) {
  const { t } = props
  const root = useMemo(() => buildTree(props.entries), [props.entries])
  const depth = props.expandDepth ?? 2
  const [toggled, setToggled] = useUiState<string[]>(props.callId, `${props.nodeId}:toggled`, [])
  const isOpen = (n: TreeNode, level: number) => (level < depth) !== toggled.includes(n.path)
  const toggle = (path: string) => setToggled(toggled.includes(path) ? toggled.filter(p => p !== path) : [...toggled, path])
  const render = (n: TreeNode, level: number): ReactNode => {
    const kids = [...n.children.values()].sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    return kids.map(c => {
      const dir = isDir(c)
      const open = dir && isOpen(c, level)
      return (
        <li key={c.path} role="treeitem" aria-expanded={dir ? open : undefined} aria-level={level + 1}>
          <div className="diui-tree-row" data-status={c.entry?.status}>
            {dir
              ? <button type="button" className="diui-tree-toggle" onClick={() => toggle(c.path)} onKeyDown={e => treeKey(e, open, () => toggle(c.path))}>
                  <span className="diui-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>📁 {c.name}
                  <span className="diui-tree-count">{t('tree.files', { count: c.files })}</span>
                </button>
              : <span className="diui-tree-file">📄 {c.name}</span>}
            {c.entry?.status && <span className="diui-badge" data-tone={statusTone(c.entry.status)}>{t(`tree.${c.entry.status}`)}</span>}
            {c.entry?.note && <span className="diui-tree-note">{c.entry.note}</span>}
          </div>
          {open && <ul role="group">{render(c, level + 1)}</ul>}
        </li>
      )
    })
  }
  return (
    <section className="diui-tree" aria-label={props.title ?? t('tree.title')}>
      {props.title && <h4 className="diui-tree-title">{props.title}</h4>}
      {props.entries.length === 0 ? <div className="diui-empty">{t('table.empty')}</div> : <ul role="tree">{render(root, 0)}</ul>}
    </section>
  )
}

function statusTone(s: TreeEntry['status']) {
  return s === 'added' ? 'success' : s === 'deleted' ? 'error' : s === 'renamed' ? 'info' : 'warning'
}

function treeKey(e: KeyboardEvent, open: boolean, toggle: () => void) {
  if ((e.key === 'ArrowRight' && !open) || (e.key === 'ArrowLeft' && open)) { e.preventDefault(); toggle() }
}

// ---------------------------------------------------------------------------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** JSONPath-like accessor for a child key. */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`
}

export function JsonView(props: { data: Json; title?: string; expandDepth?: number } & Shared) {
  const { t } = props
  const depth = props.expandDepth ?? 2
  const [toggled, setToggled] = useUiState<string[]>(props.callId, `${props.nodeId}:toggled`, [])
  const [copied, setCopied] = useState<string | undefined>(undefined)
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(what), () => setCopied(undefined))
  }
  const toggle = (path: string) => setToggled(toggled.includes(path) ? toggled.filter(p => p !== path) : [...toggled, path])
  const node = (key: string | number | undefined, value: Json, path: string, level: number): ReactNode => {
    const label = key === undefined ? null : <span className="diui-json-key">{typeof key === 'number' ? key : JSON.stringify(key)}: </span>
    const tools = (
      <span className="diui-json-tools">
        <button type="button" className="diui-json-copy" onClick={() => copy(path, path)} title={t('json.copyPath')}>{path}</button>
        <button type="button" className="diui-json-copy" onClick={() => copy(JSON.stringify(value, null, 2), `${path}=`)} title={t('json.copyValue')}>⧉</button>
      </span>
    )
    if (value !== null && typeof value === 'object') {
      const entries: [string | number, Json][] = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value)
      const open = (level < depth) !== toggled.includes(path)
      const [l, r] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
      return (
        <li key={path} role="treeitem" aria-expanded={open} aria-level={level + 1}>
          <div className="diui-json-row">
            <button type="button" className="diui-tree-toggle" onClick={() => toggle(path)} onKeyDown={e => treeKey(e, open, () => toggle(path))}>
              <span className="diui-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>{label}{l}{!open && <span className="diui-json-summary"> {t('json.items', { count: entries.length })} </span>}{!open && r}
            </button>
            {tools}
          </div>
          {open && <ul role="group">{entries.map(([k, v]) => node(k, v, childPath(path, k), level + 1))}</ul>}
          {open && <div className="diui-json-close">{r}</div>}
        </li>
      )
    }
    return (
      <li key={path} role="treeitem" aria-level={level + 1}>
        <div className="diui-json-row">{label}<span className="diui-json-value" data-type={value === null ? 'null' : typeof value}>{JSON.stringify(value)}</span>{tools}</div>
      </li>
    )
  }
  return (
    <section className="diui-json" aria-label={props.title ?? t('json.title')}>
      {props.title && <h4 className="diui-tree-title">{props.title}</h4>}
      <ul role="tree">{node(undefined, props.data, '$', 0)}</ul>
      {copied && <span className="diui-note" role="status">{t('json.copied', { what: copied })}</span>}
    </section>
  )
}
