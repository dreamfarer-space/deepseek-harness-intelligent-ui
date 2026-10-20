// Verify an extracted optional tarball using only Node built-ins.
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Public extension SDK and the deliberately shipped example, in both package modes.
const extensionAssets = new Set([
  'client/client.d.ts', 'docs/component-extensions.md',
  ...[
    'build-dsh-client.mjs', 'cordis.patch.yml', 'dsh-client.bundle.js', 'dsh-client.js',
    'host.mjs', 'index.html', 'manifest.js', 'package.template.json', 'renderers.js', 'serve.mjs',
  ].map(name => `examples/component-extension/${name}`),
])

export async function verifyOfflinePackage(directory) {
  const root = resolve(directory)
  const manifest = JSON.parse(await readFile(resolve(root, 'offline-resources/manifest.json'), 'utf8'))
  if (manifest.format !== 1 || manifest.mode !== 'offline' || !Array.isArray(manifest.assets)) throw new Error('Unsupported offline manifest')
  const required = new Set(['client/client.js', 'renderer/renderer.js', 'package.json', 'src/resource-mode.js'])
  const seen = new Set()
  for (const asset of manifest.assets) {
    if (typeof asset.path !== 'string' || (!extensionAssets.has(asset.path) && !/^(client\/client\.js|renderer\/renderer\.js|package\.json|src\/.+|bin\/.+|locale\/.+|cordis\.patch\.yml|LICENSE|THIRD_PARTY_NOTICES\.md|README(?:\.zh-CN)?\.md|CHANGELOG\.md|offline-resources\/licenses\/.+)$/.test(asset.path))) throw new Error('Unexpected manifest path')
    const target = resolve(root, asset.path)
    if (!target.startsWith(root + sep) || asset.path.split(/[\\/]/).includes('..') || seen.has(asset.path)) throw new Error('Unsafe or duplicate manifest path')
    const data = await readFile(target)
    const hash = createHash('sha256').update(data).digest('hex')
    if (data.length !== asset.bytes || hash !== asset.sha256) throw new Error(`Integrity mismatch: ${asset.path}`)
    required.delete(asset.path); seen.add(asset.path)
  }
  if (required.size || !manifest.packages?.length) throw new Error('Incomplete offline manifest')
  for (const entry of manifest.packages) {
    if (!entry.integrity || !entry.version || !Array.isArray(entry.licenseFiles)) throw new Error('Missing dependency provenance')
  }
  const mode = await readFile(resolve(root, 'src/resource-mode.js'), 'utf8')
  if (!mode.includes("RESOURCE_MODE = 'offline'")) throw new Error('Host resource mode mismatch')
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  if (pkg.intelligentUiResources !== 'offline' || pkg.version !== manifest.version || pkg.name !== manifest.package) throw new Error('Package identity mismatch')
  // Require actual browser artifacts, not a manifest containing empty placeholders.
  for (const name of ['client/client.js', 'renderer/renderer.js']) {
    if ((await stat(resolve(root, name))).size < 1_000_000) throw new Error(`Incomplete offline bundle: ${name}`)
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || fileURLToPath(new URL('../../dist/offline/package', import.meta.url))
  const m = await verifyOfflinePackage(dir)
  console.log(`Verified ${m.package}@${m.version}: ${m.assets.length} assets, ${m.resources.length} resources, ${m.packages.length} locked packages`)
}
