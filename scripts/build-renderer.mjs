#!/usr/bin/env node
/** Standalone browser/WebView bundle; no DSH globals and no runtime CDN needed for React. */
import { build } from 'esbuild'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(resolve(root, 'renderer'), { recursive: true })
await build({
  entryPoints: [resolve(root, 'renderer-src/index.tsx')],
  outfile: resolve(root, 'renderer/renderer.js'),
  bundle: true, minify: true, platform: 'browser', format: 'iife',
  globalName: 'DshIntelligentUiRenderer', jsx: 'automatic', target: ['es2020'],
  charset: 'utf8', legalComments: 'eof',
  plugins: [{
    name: 'idiomorph-source',
    setup(b) {
      b.onResolve({ filter: /^idiomorph-source$/ }, () => ({
        path: resolve(root, 'node_modules/idiomorph/dist/idiomorph.min.js'),
        namespace: 'idiomorph-source',
      }))
      b.onLoad({ filter: /.*/, namespace: 'idiomorph-source' }, async args => ({
        contents: 'export default ' + JSON.stringify(await readFile(args.path, 'utf8')),
        loader: 'js',
      }))
    },
  }],
})
