// Bundle the real client-src/widget/frame.ts (and policy.ts) into a single ESM
// module for Node, so the security audit builds the exact srcdoc the browser
// plugin ships — no re-implementation that could drift.
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Same two build-time aliases the client bundle uses, but online mode. */
function fixtures() {
  return {
    name: 'audit-aliases',
    setup(b) {
      b.onResolve({ filter: /^idiomorph-source$/ }, () => ({ path: resolve(root, 'node_modules/idiomorph/dist/idiomorph.min.js'), namespace: 'idiomorph-source' }))
      b.onLoad({ filter: /.*/, namespace: 'idiomorph-source' }, async args => ({
        contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`,
        loader: 'js',
      }))
      b.onResolve({ filter: /^offline-resource-pack$/ }, () => ({ path: 'pack', namespace: 'offline-resource-pack' }))
      b.onLoad({ filter: /.*/, namespace: 'offline-resource-pack' }, async () => ({ contents: 'export default null', loader: 'js' }))
    },
  }
}

/**
 * @returns {Promise<typeof import('../../client-src/widget/frame.ts')>}
 */
export async function loadFrameModule() {
  const result = await build({
    stdin: {
      contents: "export * from './client-src/widget/frame.ts'; export * from './client-src/policy.ts'",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: ['node22'],
    plugins: [fixtures()],
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].contents
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
