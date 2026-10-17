/** Replaced at build time. The online bundle contains only null, never library code. */
import PACK from 'offline-resource-pack'

export interface ResourcePack {
  modules: Record<string, { source: string; imports: string[] }>
  katexCss: string
}
export const offlinePack: ResourcePack | null = PACK
export const resourceMode = offlinePack ? 'offline' : 'online'
