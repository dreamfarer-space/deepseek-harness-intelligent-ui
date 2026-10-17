import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Embed audited text only in the optional build; no runtime loader or host-origin route. */
export function resourcePackPlugin(root, offline) {
  return {
    name: 'offline-resource-pack',
    setup(b) {
      b.onResolve({ filter: /^offline-resource-pack$/ }, () => ({ path: 'pack', namespace: 'offline-resource-pack' }))
      b.onLoad({ filter: /.*/, namespace: 'offline-resource-pack' }, async () => ({
        contents: 'export default ' + (offline ? await readFile(resolve(root, 'dist/offline/pack.json'), 'utf8') : 'null'),
        loader: 'js',
      }))
    },
  }
}
