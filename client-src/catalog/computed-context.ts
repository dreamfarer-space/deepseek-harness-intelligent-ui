/**
 * Browser side of declarative computed fields (Issue #84, Phase 2).
 *
 * Phase 1 shipped the engine (`evaluateComputed`, `resolveComputedProps`) and
 * the protocol (`computed: [{ id, expr, format? }]`, `bindKey`, `filterField`).
 * This module joins the engine to the live UI:
 *
 * 1. {@link collectBindings} walks a catalog tree and lists every value a
 *    `Form` publishes — its field `bindKey`, else the field name — together
 *    with the value it starts from.
 * 2. Those values are read from the shared UI state (see `state.ts`: a key
 *    without a `<nodeId>:` prefix lives at the root call id, so a form in one
 *    block and a chart in another see the same value).
 * 3. {@link useComputedContext} re-evaluates the tree's `computed` array on
 *    every broadcast and hands the result to the renderer, which resolves it
 *    into props with `resolveComputedProps`.
 *
 * A composition evaluates the merged `computed` arrays of all of its catalog
 * blocks against one field pool, so a block can drive a value another block
 * renders. Evaluation stays pure and local: no message to the model.
 */
import { useMemo } from 'react'
import { evaluateComputed, extractIdentifiers } from '../../src/catalog/computed.js'
import { getUiState, useUiStateRevision } from '../state.ts'

/** Minimal shape of a node this module inspects. */
export interface ShapedNode {
  id?: unknown
  type?: unknown
  props?: unknown
}

/** The part of a `Form` field that state sharing and defaults care about. */
export interface BoundField {
  name?: unknown
  type?: unknown
  default?: unknown
  min?: unknown
  max?: unknown
  bindKey?: unknown
}

/** Resolved computed values plus the field keys that feed them. */
export interface ComputedContext {
  /** Raw values, for numeric slots (`Progress.value`, `Chart` series). */
  values: Record<string, number | boolean>
  /** Formatted values, for `{{id}}` inside text props. */
  formatted: Record<string, string>
  /** Per-formula problems; a broken formula never invents a number. */
  errors: Record<string, string>
  /**
   * Field keys some formula reads. A `Form` broadcasts exactly these (and every
   * explicitly bound field) to shared state, so a formula over a plain field
   * name stays live without every same-named field in the answer colliding.
   */
  liveKeys: ReadonlySet<string>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The value a field starts from: the same rule `Form` renders with.
 * @param f
 */
export function fieldInitialValue(f: BoundField): unknown {
  if (f.type === 'checkbox') return f.default === true
  if (f.type === 'range') {
    const min = typeof f.min === 'number' ? f.min : 0
    const max = typeof f.max === 'number' ? f.max : 100
    return typeof f.default === 'number' ? f.default : (min + max) / 2
  }
  if (f.default === undefined || f.default === null) return ''
  return f.type === 'number' ? Number(f.default) : String(f.default)
}

/**
 * Shared-state key of a field: its `bindKey` when it declares one, else its
 * name (the catalog documents both as scope names).
 * @param f
 */
export function bindKeyOf(f: BoundField): string | undefined {
  if (typeof f.bindKey === 'string' && f.bindKey) return f.bindKey
  return typeof f.name === 'string' && f.name ? f.name : undefined
}

/**
 * Every form-bound value of a tree (or of several compositions blocks), keyed
 * by the name a formula uses. The first definition of a key wins, so merging
 * blocks never reorders values the model already fixed.
 * @param nodes
 */
export function collectBindings(nodes: Iterable<ShapedNode>): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const node of nodes) {
    if (!isRecord(node) || node.type !== 'Form' || !isRecord(node.props)) continue
    const form = node.props
    const fields = Array.isArray(form.fields) ? form.fields.filter(isRecord) : []
    for (const raw of fields) {
      const field = raw as BoundField
      const key = bindKeyOf(field)
      if (key === undefined || out.has(key)) continue
      out.set(key, fieldInitialValue(field))
    }
    // A form-level bindKey names the value of a single-field form.
    const formKey = typeof form.bindKey === 'string' && form.bindKey ? form.bindKey : undefined
    if (formKey && fields.length === 1 && !out.has(formKey)) {
      out.set(formKey, fieldInitialValue(fields[0] as BoundField))
    }
  }
  return out
}

/**
 * Concatenate the `computed` arrays of one or more trees. A repeated id keeps
 * its first definition (the Host rejects duplicates inside one tree).
 * @param specs
 */
export function mergeComputed(specs: readonly (readonly unknown[])[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const spec of specs) {
    if (!Array.isArray(spec)) continue
    for (const entry of spec) {
      if (!isRecord(entry)) continue
      const id = entry.id
      if (typeof id === 'string') {
        if (seen.has(id)) continue
        seen.add(id)
      }
      out.push(entry)
    }
  }
  return out
}

/**
 * Live computed context of a surface: current field values in, resolved values
 * out, recomputed whenever any block broadcasts a shared key.
 *
 * @param callId - the surface's (possibly block-scoped) call id.
 * @param bindings - field keys and their defaults, from {@link collectBindings}.
 * @param specs - the `computed` arrays to evaluate (merged across blocks).
 * @returns undefined when no `computed` array is declared.
 */
export function useComputedContext(
  callId: string | undefined,
  bindings: ReadonlyMap<string, unknown>,
  specs: readonly (readonly unknown[])[],
): ComputedContext | undefined {
  const id = callId ?? ''
  const revision = useUiStateRevision(callId)
  const spec = useMemo(() => mergeComputed(specs), [specs])
  return useMemo(() => {
    // `revision` is the subscription: a broadcast bumps it and forces this memo
    // to read the new shared values. Recomputing is cheap (compiled formulas
    // are cached by the Phase 1 LRU).
    void revision
    if (spec.length === 0) return undefined
    const fields: Record<string, unknown> = {}
    for (const [key, initial] of bindings) {
      const stored = getUiState(id, key)
      fields[key] = stored === undefined ? initial : stored
    }
    const result = evaluateComputed(spec, fields)
    const liveKeys = new Set<string>()
    for (const entry of spec) {
      for (const name of extractIdentifiers(entry.expr)) if (bindings.has(name)) liveKeys.add(name)
    }
    return { values: result.values, formatted: result.formatted, errors: result.errors, liveKeys }
  }, [id, bindings, spec, revision])
}
