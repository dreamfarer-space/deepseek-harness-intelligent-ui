/**
 * Tolerant scanner for a streaming JSON *object* prefix (tool-call arguments).
 *
 * Unlike a generic "repair and JSON.parse" approach it reports, per top-level
 * key, whether the value is complete — the streaming renderer keys its
 * milestones (css done, html done, each finished js expression / component)
 * off those flags. Partial strings decode to their safe prefix; partial arrays
 * expose their completed items plus the in-progress tail.
 */

export interface PartialField {
  /** Decoded value: full value when complete; string/array prefix otherwise. */
  value: unknown
  complete: boolean
  /** For arrays: number of fully parsed items in `value`. */
  completeItems?: number
  /** For arrays whose in-progress item is a string: its decoded prefix. */
  partialItem?: string
}

export type PartialObject = Record<string, PartialField>

const WS = new Set([' ', '\t', '\n', '\r'])

/** Decode a JSON string body (between quotes, no quotes) that may be cut mid-escape. */
export function decodeStringPrefix(body: string): string {
  let out = ''
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (c !== '\\') { out += c; continue }
    const n = body[i + 1]
    if (n === undefined) break
    if (n === 'u') {
      const hex = body.slice(i + 2, i + 6)
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break
      const code = parseInt(hex, 16)
      // A lone high surrogate at the cut is held back until its pair arrives.
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = body.slice(i + 6, i + 12)
        if (!/^\\u[dD][c-fC-F][0-9a-fA-F]{2}$/.test(next)) {
          if (next.length < 6) break
          out += String.fromCharCode(code)
          i += 5
          continue
        }
        out += String.fromCharCode(code, parseInt(next.slice(2), 16))
        i += 11
        continue
      }
      out += String.fromCharCode(code)
      i += 5
      continue
    }
    const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
    out += map[n] ?? n
    i += 1
  }
  return out
}

/** Index just past the closing quote of the string starting at `start` (a `"`), or -1 if unterminated. */
function stringEnd(src: string, start: number): number {
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') { i++; continue }
    if (c === '"') return i + 1
  }
  return -1
}

/** Index just past the JSON value starting at `start`, or -1 when the value is cut off. */
function valueEnd(src: string, start: number): number {
  const c = src[start]
  if (c === '"') return stringEnd(src, start)
  if (c === '{' || c === '[') {
    let depth = 0
    for (let i = start; i < src.length; i++) {
      const ch = src[i]
      if (ch === '"') { const e = stringEnd(src, i); if (e < 0) return -1; i = e - 1; continue }
      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i + 1 }
    }
    return -1
  }
  // Scalar: number / true / false / null ends at a delimiter. A scalar running
  // to the end of input may still be growing ("12" → "123"), so it's incomplete.
  let i = start
  while (i < src.length && !WS.has(src[i]!) && src[i] !== ',' && src[i] !== '}' && src[i] !== ']') i++
  return i < src.length ? i : -1
}

function skipWs(src: string, i: number): number {
  while (i < src.length && WS.has(src[i]!)) i++
  return i
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(text) } } catch { return { ok: false } }
}

/** Scan an array value that may be cut off, collecting complete items. */
function scanArray(src: string, start: number): PartialField {
  const items: unknown[] = []
  let i = skipWs(src, start + 1)
  for (;;) {
    if (i >= src.length) return { value: items, complete: false, completeItems: items.length }
    if (src[i] === ']') return { value: items, complete: true, completeItems: items.length }
    const end = valueEnd(src, i)
    if (end < 0) {
      const field: PartialField = { value: items, complete: false, completeItems: items.length }
      if (src[i] === '"') field.partialItem = decodeStringPrefix(src.slice(i + 1))
      return field
    }
    const parsed = tryParse(src.slice(i, end))
    if (!parsed.ok) return { value: items, complete: false, completeItems: items.length }
    items.push(parsed.value)
    i = skipWs(src, end)
    if (src[i] === ',') i = skipWs(src, i + 1)
  }
}

/**
 * Scan a (possibly truncated) JSON object text.
 * @param src - raw argument prefix as streamed by the model.
 * @returns the fields seen so far, in key order.
 */
export function scanPartialObject(src: string): PartialObject {
  const out: PartialObject = {}
  let i = skipWs(src, 0)
  if (src[i] !== '{') return out
  i = skipWs(src, i + 1)
  while (i < src.length) {
    if (src[i] === '}') break
    if (src[i] !== '"') break
    const keyEnd = stringEnd(src, i)
    if (keyEnd < 0) break
    const key = decodeStringPrefix(src.slice(i + 1, keyEnd - 1))
    i = skipWs(src, keyEnd)
    if (src[i] !== ':') break
    i = skipWs(src, i + 1)
    if (i >= src.length) break
    const end = valueEnd(src, i)
    if (end >= 0) {
      const parsed = tryParse(src.slice(i, end))
      if (!parsed.ok) break
      const field: PartialField = { value: parsed.value, complete: true }
      if (Array.isArray(parsed.value)) field.completeItems = parsed.value.length
      out[key] = field
      i = skipWs(src, end)
      if (src[i] === ',') i = skipWs(src, i + 1)
      continue
    }
    // Value cut off: expose what can be shown.
    const c = src[i]
    if (c === '"') out[key] = { value: decodeStringPrefix(src.slice(i + 1)), complete: false }
    else if (c === '[') out[key] = scanArray(src, i)
    else out[key] = { value: undefined, complete: false }
    break
  }
  return out
}

/** Parse complete arguments; returns undefined for malformed JSON or a non-object. */
export function parseArgs(raw: string | undefined | null): Record<string, unknown> | undefined {
  if (!raw) return undefined
  const parsed = tryParse(raw)
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) return undefined
  return parsed.value as Record<string, unknown>
}
