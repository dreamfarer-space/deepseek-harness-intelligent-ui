/**
 * Table/Chart data export. Everything here is plain text built from cell
 * values; nothing is parsed or rendered as HTML.
 *
 * CSV follows RFC 4180 (quote fields with `,` `"` CR or LF; double quotes) and
 * neutralises spreadsheet formula injection (OWASP): a text cell starting with
 * `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'` so Excel/Sheets show it as
 * text instead of evaluating it. Numbers are written as numbers, so a negative
 * value stays numeric. A UTF-8 BOM keeps CJK text readable when Excel opens it.
 */

export type ExportCell = string | number | boolean | null | undefined

const FORMULA_START = /^[=+\-@\t\r]/

function csvField(v: ExportCell): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v)
  if (typeof v === 'string' && FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(columns: readonly string[], rows: readonly (readonly ExportCell[])[]): string {
  const lines = [columns, ...rows].map(r => columns.map((_, c) => csvField(r[c])).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

function mdField(v: ExportCell): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n|\r/g, '<br>')
}

export function toMarkdown(columns: readonly string[], rows: readonly (readonly ExportCell[])[]): string {
  const line = (r: readonly ExportCell[]) => `| ${columns.map((_, c) => mdField(r[c])).join(' | ')} |`
  return [line(columns), `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n') + '\n'
}

/** A file name safe on Windows, macOS and Linux. */
export function exportFileName(title: string | undefined, ext: string): string {
  const base = (title ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `${base || 'data'}.${ext}`
}

/** Save text through a temporary object URL; the host's normal download flow applies. */
export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
