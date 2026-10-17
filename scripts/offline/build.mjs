// Produce an opt-in plugin tarball. The default package and committed bundles stay small.
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFile, writeFile, mkdir, rm, readdir, cp, rename } from 'node:fs/promises'
import { dirname, resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(root, 'dist/offline')
const stage = join(out, 'package')
const read = name => readFile(resolve(root, name), 'utf8')
const sha256 = data => createHash('sha256').update(data).digest('hex')
const pkg = JSON.parse(await read('package.json'))
const lockText = await read('package-lock.json')
const lock = JSON.parse(lockText)
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', ...opts })
// npm.cmd cannot be execFile'd directly on Windows; npm run supplies its JS CLI.
const npmRun = args => process.env.npm_execpath
  ? run(process.execPath, [process.env.npm_execpath, ...args])
  : run('npm', args)

// Every supported entry is deliberately enumerated; no arbitrary file/URL loader.
const entries = {
  katex: { package: 'katex', version: '0.16.11', code: "export {default} from 'katex'", imports: ['katex'] },
  mermaid: { package: 'mermaid', version: '11.4.1', code: "export {default} from 'mermaid'", imports: ['mermaid'] },
  three: { package: 'three', version: '0.169.0', code: "export * from 'three'; export {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'", imports: ['three', 'three/addons/controls/OrbitControls.js'] },
  d3: { package: 'd3', version: '7.9.0', code: "export * from 'd3'", imports: ['d3'] },
  chart: { package: 'chart.js', version: '4.4.4', code: "export {default} from 'chart.js/auto'; export * from 'chart.js/auto'", imports: ['chart.js/auto'] },
  confetti: { package: 'canvas-confetti', version: '1.9.3', code: "export {default} from 'canvas-confetti'", imports: ['canvas-confetti'] },
}
await rm(out, { recursive: true, force: true })
await mkdir(stage, { recursive: true })
const modules = {}, resources = [], packageDirs = new Set()
for (const [name, entry] of Object.entries(entries)) {
  if (pkg.devDependencies[entry.package] !== entry.version) throw new Error(`Unpinned offline dependency: ${entry.package}`)
  const result = await build({
    stdin: { contents: entry.code, resolveDir: root, sourcefile: `${name}-entry.js` },
    absWorkingDir: root, write: false, bundle: true, minify: true,
    platform: 'browser', format: 'esm', target: ['es2020'], legalComments: 'eof',
    metafile: true, charset: 'utf8', define: { 'process.env.NODE_ENV': '"production"' },
  })
  for (const output of Object.values(result.metafile.outputs)) {
    if (output.imports.length) throw new Error(`Offline module ${name} still has imports: ${JSON.stringify(output.imports)}`)
  }
  for (const file of Object.keys(result.metafile.inputs)) {
    const normalized = file.replace(/\\/g, '/')
    if (normalized.includes('node_modules/')) {
      const parts = normalized.split('node_modules/')
      const last = parts.pop().split('/')
      const packageName = last[0].startsWith('@') ? last.slice(0, 2).join('/') : last[0]
      packageDirs.add(parts.join('node_modules/') + 'node_modules/' + packageName)
    }
  }
  const source = result.outputFiles[0].text
  modules[name] = { source, imports: entry.imports }
  resources.push({ name, package: entry.package, version: entry.version, imports: entry.imports, bytes: Buffer.byteLength(source), gzipBytes: gzipSync(source).length, sha256: sha256(source) })
}
// Modern Chromium/WebViews support WOFF2. Embed those fonts and omit legacy WOFF/TTF copies.
let katexCss = await read('node_modules/katex/dist/katex.min.css')
katexCss = katexCss.replace(/,url\([^)]*\) format\("(?:woff|truetype)"\)/g, '')
katexCss = await replaceAsync(katexCss, /url\((fonts\/[^)]+\.woff2)\)/g, async name =>
  `url(data:font/woff2;base64,${(await readFile(resolve(root, 'node_modules/katex/dist', name))).toString('base64')})`)
if (/url\((?!data:)/.test(katexCss)) throw new Error('Unresolved KaTeX CSS asset')
resources.push({ name: 'katex-css-and-fonts', bytes: Buffer.byteLength(katexCss), gzipBytes: gzipSync(katexCss).length, sha256: sha256(katexCss) })
await writeFile(join(out, 'pack.json'), JSON.stringify({ modules, katexCss }))

// Use npm's own file selection, then overlay only the two browser entry points.
const [online] = JSON.parse(npmRun(['pack', '--dry-run', '--json', '--ignore-scripts']))
if (online.size > 1_000_000) throw new Error(`Default package exceeded 1 MB: ${online.size}`)
for (const file of online.files) {
  await mkdir(dirname(join(stage, file.path)), { recursive: true })
  await cp(resolve(root, file.path), join(stage, file.path))
}
await writeFile(join(stage, 'src/resource-mode.js'), "export const RESOURCE_MODE = 'offline';\n")
const stagedPkg = { ...pkg, files: [...pkg.files, 'offline-resources'], scripts: {}, intelligentUiResources: 'offline' }
await writeFile(join(stage, 'package.json'), JSON.stringify(stagedPkg, null, 2) + '\n')
const packages = []
for (const dir of [...packageDirs].sort()) {
  const info = JSON.parse(await read(`${dir}/package.json`))
  const locked = lock.packages[dir]
  if (!locked?.integrity || locked.version !== info.version) throw new Error(`Unverifiable dependency: ${dir}`)
  const files = (await readdir(resolve(root, dir))).filter(n => /^(license|licence|copying|notice)([.-]|$)/i.test(n)).sort()
  if (!files.length) throw new Error(`No upstream license file: ${dir}`)
  const target = join(stage, 'offline-resources/licenses', dir.replaceAll('node_modules/', ''))
  await mkdir(target, { recursive: true })
  for (const name of files) await cp(resolve(root, dir, name), join(target, name), { recursive: true })
  // Keep declarations as well as complete upstream license files (including KaTeX fonts).
  await writeFile(join(target, 'package.json'), JSON.stringify({ name: info.name, version: info.version, license: info.license, repository: info.repository }, null, 2) + '\n')
  packages.push({ name: info.name, version: info.version, path: dir, license: info.license, integrity: locked.integrity, licenseFiles: files })
}
run(process.execPath, ['scripts/build-client.mjs', '--offline'])
run(process.execPath, ['scripts/build-renderer.mjs', '--offline'])
const assets = []
for (const name of [...online.files.map(f => f.path).sort(), ...await walk(join(stage, 'offline-resources/licenses'), 'offline-resources/licenses')]) {
  const data = await readFile(join(stage, name))
  assets.push({ path: name, bytes: data.length, sha256: sha256(data) })
}
await writeFile(join(stage, 'offline-resources/manifest.json'), JSON.stringify({
  format: 1, mode: 'offline', package: pkg.name, version: pkg.version,
  lockSha256: sha256(lockText), resources, packages, assets,
}, null, 2) + '\n')
// --ignore-scripts prevents publishing hooks from replacing the optional bundles.
const [packed] = JSON.parse(npmRun(['pack', stage, '--json', '--ignore-scripts', '--pack-destination', out]))
const MAX_PACKED = 5_000_000, MAX_UNPACKED = 16_000_000
if (packed.size > MAX_PACKED || packed.unpackedSize > MAX_UNPACKED) throw new Error(`Offline package size budget exceeded: ${packed.size}/${packed.unpackedSize}`)
const tarball = `${pkg.name}-${pkg.version}-offline.tgz`
await rename(join(out, packed.filename), join(out, tarball))
const digest = sha256(await readFile(join(out, tarball)))
await writeFile(join(out, `${tarball}.sha256`), `${digest}  ${tarball}\n`)
const size = { onlinePackedBytes: online.size, offlinePackedBytes: packed.size, offlineUnpackedBytes: packed.unpackedSize, limits: { packed: MAX_PACKED, unpacked: MAX_UNPACKED }, resources }
await writeFile(join(out, 'size-report.json'), JSON.stringify(size, null, 2) + '\n')
console.table(resources.map(({ name, bytes, gzipBytes }) => ({ name, bytes, gzipBytes })))
console.log(`${relative(root, join(out, tarball))}: ${packed.size} bytes packed / ${packed.unpackedSize} unpacked; online ${online.size} packed`)

async function replaceAsync(text, re, fn) {
  const matches = [...text.matchAll(re)]
  const values = await Promise.all(matches.map(m => fn(m[1])))
  let n = 0
  return text.replace(re, () => values[n++])
}
async function walk(dir, prefix) {
  const all = []
  for (const file of await readdir(dir, { withFileTypes: true })) {
    if (file.isDirectory()) all.push(...await walk(join(dir, file.name), `${prefix}/${file.name}`))
    else all.push(`${prefix}/${file.name}`)
  }
  return all.sort()
}
