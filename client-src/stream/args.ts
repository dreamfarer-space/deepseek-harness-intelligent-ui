/**
 * The raw argument prefix of a preparing tool call, across DSH versions.
 *
 * - DSH ≤ 0.2.0 hands tool views `useToolCallArgumentsPartial()`, a hook that
 *   subscribes to the streamed prefix.
 * - DSH 0.2.1+ drops that hook. Instead every phase's block carries a lazy
 *   `args` view (`PartialArguments` from `@deepseek-ai/dsh-util-values`) that
 *   grows in place while the call prepares. It republishes only when a field
 *   it was asked about changes, and no reader follows an array that is still
 *   open (the catalog's `components`), so we sample it on a short timer
 *   instead. The views throttle to the same cadence anyway.
 */
import { useEffect, useState } from 'react'
import type { ToolViewProps } from '../types/dsh.ts'

/** The parts of DSH 0.2.1's `PartialArguments` this module relies on (all total readers). */
export interface ArgsView {
  /** The streamed text so far (the view's only enumerable source field). */
  readonly chunks?: unknown
  keys?: () => readonly string[]
  text?: (key: string) => string | undefined
  value?: (key: string) => unknown
  complete?: (key: string) => boolean
  closed?: () => boolean
}

/**
 * Best-effort JSON text prefix of an args view.
 * Prefers the streamed source text, and otherwise rebuilds a prefix from the
 * public readers (string fields stream; other fields appear once closed).
 */
export function rawPrefixOf(args: ArgsView | undefined): string {
  if (!args || typeof args !== 'object') return ''
  const { chunks } = args
  if (Array.isArray(chunks) && chunks.every(c => typeof c === 'string')) return chunks.join('')
  if (typeof args.keys !== 'function') return ''
  const parts: string[] = []
  for (const key of args.keys()) {
    const s = args.text?.(key)
    if (s !== undefined) {
      const done = args.complete?.(key) ?? false
      const quoted = JSON.stringify(s)
      parts.push(`${JSON.stringify(key)}:${done ? quoted : quoted.slice(0, -1)}`)
      if (!done) break
      continue
    }
    const v = args.value?.(key)
    if (v === undefined) break // open non-string value: nothing safe to show yet
    parts.push(`${JSON.stringify(key)}:${JSON.stringify(v)}`)
  }
  return `{${parts.join(',')}${args.closed?.() ? '}' : ''}`
}

/** `args` of a preparing block on DSH 0.2.1+, else undefined. */
function preparingArgs(props: ToolViewProps): ArgsView | undefined {
  if (props.phase !== 'preparing') return undefined
  const args = (props.block as { args?: unknown }).args
  return args && typeof args === 'object' ? args as ArgsView : undefined
}

/**
 * The preparing call's raw argument prefix; '' once the call is dispatched.
 * @param pollMs - sampling interval for DSH versions without the partial hook.
 */
export function usePartialArguments(props: ToolViewProps, pollMs = 100): string {
  // Present or absent for the whole life of a DSH build, so hook order is stable.
  const hooked = props.useToolCallArgumentsPartial?.()
  const args = hooked === undefined ? preparingArgs(props) : undefined
  const [sampled, setSampled] = useState(() => rawPrefixOf(args))
  useEffect(() => {
    if (!args) return
    const tick = () => setSampled(prev => {
      const next = rawPrefixOf(args)
      return next === prev ? prev : next
    })
    tick()
    const timer = setInterval(tick, pollMs)
    return () => clearInterval(timer)
  }, [args, pollMs])
  if (hooked !== undefined) return hooked
  return args ? sampled : ''
}
