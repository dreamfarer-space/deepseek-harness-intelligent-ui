// Assert the npm tarball holds what a build-free install needs, and nothing it shouldn't.
import { execSync } from 'node:child_process'

const [report] = JSON.parse(execSync('npm pack --dry-run --json --ignore-scripts', { encoding: 'utf8' }))
const files = new Set(report.files.map(f => f.path.replace(/\\/g, '/')))

const required = [
  'package.json', 'README.md', 'README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md',
  'src/catalog/extensions.js', 'src/catalog/extensions.d.ts', 'src/catalog/browser.d.ts', 'client/client.d.ts',
  'examples/component-extension/manifest.js', 'examples/component-extension/serve.mjs', 'docs/component-extensions.md',
  'cordis.patch.yml', 'bin/cli.mjs', 'src/plugin.js', 'src/compat.js', 'client/client.js', 'renderer/renderer.js', 'locale/en.json', 'locale/zh.json',
]
const forbidden = [/^client-src\//, /^tests\//, /^scripts\//, /^docs\/(?!component-extensions\.md$)/, /^node_modules\//, /\.tgz$/, /\.log$/, /^e2e-shots\//]

const missing = required.filter(f => !files.has(f))
const unwanted = [...files].filter(f => forbidden.some(re => re.test(f)))
const MAX_BYTES = 1_000_000
const rendererEntry = report.files.find(f => f.path.replace(/\\/g, '/') === 'renderer/renderer.js')
const rendererTooSmall = rendererEntry !== undefined && rendererEntry.size < 50_000
if (rendererTooSmall) console.error(`renderer/renderer.js is unexpectedly small (${rendererEntry.size} bytes)`)

console.log(`${report.name}@${report.version}: ${files.size} files, ${(report.size / 1024).toFixed(1)} kB packed, ${(report.unpackedSize / 1024).toFixed(1)} kB unpacked`)
if (missing.length) console.error(`missing from package: ${missing.join(', ')}`)
if (unwanted.length) console.error(`should not be packaged: ${unwanted.join(', ')}`)
if (report.size > MAX_BYTES) console.error(`package is ${report.size} bytes (limit ${MAX_BYTES})`)
process.exitCode = missing.length || unwanted.length || rendererTooSmall || report.size > MAX_BYTES ? 1 : 0
