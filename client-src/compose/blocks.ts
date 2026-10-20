/**
 * Reading `ui_compose` arguments in the browser: the complete object when the
 * call has settled, or the finished block prefix while it streams. A block is
 * exposed only once its own JSON object closes, so nothing half-parsed is ever
 * drawn. Pure functions (no React) so tests and the portable renderer share
 * exactly the same rules.
 */
import { parseArgs, scanPartialObject } from '../stream/partial-json.ts'

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
}

/** Ordered blocks of a composition, from complete arguments or from the finished prefix. */
export function readComposeBlocks(raw: string, partial: boolean): ComposeBlock[] {
  if (!partial) {
    const args = parseArgs(raw)
    return Array.isArray(args?.blocks) ? args.blocks.filter(isComposeBlock) : []
  }
  const field = scanPartialObject(raw).blocks
  return Array.isArray(field?.value) ? field.value.filter(isComposeBlock) : []
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
