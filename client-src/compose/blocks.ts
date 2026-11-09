/**
 * Reading `ui_compose` arguments in the browser: the complete object when the
 * call has settled, or the finished block prefix while it streams. A block is
 * exposed only once its own JSON object closes, so nothing half-parsed is ever
 * drawn. Pure functions (no React) so tests and the portable renderer share
 * exactly the same rules.
 */
import { parseArgs, scanPartialObject, type PartialObject } from '../stream/partial-json.ts'

/** Composition block types the renderer understands (the Host validates the same set). */
export type ComposeBlockType = 'markdown' | 'catalog' | 'widget'

/** A block as far as the browser can trust it; per-type fields are checked where used. */
export interface ComposeBlock {
  id: string
  type: ComposeBlockType
  /** markdown */
  text?: string
  /** catalog */
  title?: string
  root?: string
  components?: unknown
  /** catalog: root-level computed formulas of this block. */
  computed?: unknown
  /** widget */
  initialHeight?: number
  placeholderMessages?: string[]
  css?: string
  html?: string
  jsFunctions?: string
  jsExpressions?: string[]
}

const BLOCK_TYPES: readonly string[] = ['markdown', 'catalog', 'widget']

export function isComposeBlock(value: unknown): value is ComposeBlock {
  return !!value && typeof value === 'object'
    && typeof (value as ComposeBlock).id === 'string'
    && BLOCK_TYPES.includes((value as ComposeBlock).type)
    && ((value as ComposeBlock).type !== 'markdown' || typeof (value as ComposeBlock).text === 'string')
}

function partialBlockOf(obj: PartialObject | undefined): ComposeBlock | undefined {
  if (!obj) return undefined
  const id = obj.id?.complete && typeof obj.id.value === 'string' && obj.id.value ? obj.id.value : undefined
  const type = obj.type?.complete && typeof obj.type.value === 'string' && BLOCK_TYPES.includes(obj.type.value)
    ? (obj.type.value as ComposeBlockType)
    : undefined
  if (!id || !type) return undefined
  if (type === 'markdown') {
    const text = typeof obj.text?.value === 'string' ? obj.text.value : undefined
    return text && text.trim().length > 0 ? { id, type, text } : undefined
  }
  if (type === 'catalog') {
    const comps = Array.isArray(obj.components?.value) ? obj.components.value : undefined
    const root = obj.root?.complete && typeof obj.root.value === 'string' && obj.root.value
      ? obj.root.value
      : (comps && comps.length > 0 && typeof (comps[0] as { id?: unknown })?.id === 'string' ? (comps[0] as { id: string }).id : undefined)
    if (!root || !comps || comps.length === 0) return undefined
    return {
      id,
      type,
      ...(typeof obj.title?.value === 'string' && obj.title.value ? { title: obj.title.value } : {}),
      root,
      components: comps,
      ...(obj.computed?.complete && Array.isArray(obj.computed.value) ? { computed: obj.computed.value } : {}),
    }
  }
  return undefined
}

/** Ordered blocks of a composition, from complete arguments or from the finished prefix. */
export function readComposeBlocks(raw: string, partial: boolean, includeInProgress = false): ComposeBlock[] {
  if (!partial) {
    const args = parseArgs(raw)
    return Array.isArray(args?.blocks) ? args.blocks.filter(isComposeBlock) : []
  }
  const field = scanPartialObject(raw).blocks
  const closed = Array.isArray(field?.value) ? field.value.filter(isComposeBlock) : []
  if (includeInProgress) {
    const tail = partialBlockOf(field?.partialObject)
    if (tail && !closed.some(b => b.id === tail.id)) closed.push(tail)
  }
  return closed
}

/** The composition's title, from complete or streaming arguments. */
export function readComposeTitle(raw: string, partial: boolean): string | undefined {
  if (!partial) {
    const args = parseArgs(raw)
    return typeof args?.title === 'string' && args.title ? args.title : undefined
  }
  const field = scanPartialObject(raw).title
  return typeof field?.value === 'string' && field.value ? field.value : undefined
}
