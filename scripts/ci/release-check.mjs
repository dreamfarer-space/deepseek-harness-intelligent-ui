// Release preflight, run locally (`npm run release:check`) and by release.yml.
//   - the tag (if any) is v<package.json version>
//   - client/client.js was rebuilt for this version
//   - CHANGELOG.md has a section for this version
//
// Usage: node scripts/ci/release-check.mjs [--tag v1.2.3] [--notes <out-file>]
//   --tag defaults to $GITHUB_REF_NAME when it starts with "v".
//   --notes writes this version's changelog section (the GitHub Release body).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = f => readFileSync(path.join(root, f), 'utf8')
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const pkg = JSON.parse(read('package.json'))
const errors = []

if (!semver.valid(pkg.version)) errors.push(`package.json version "${pkg.version}" is not valid semver`)

const tag = arg('--tag') ?? (process.env.GITHUB_REF_NAME?.startsWith('v') ? process.env.GITHUB_REF_NAME : undefined)
if (tag !== undefined && tag !== `v${pkg.version}`) errors.push(`tag ${tag} does not match package.json version ${pkg.version} (expected v${pkg.version})`)

// Release runners fetch full history and main before supplying this option.
const mainRef = arg('--main-ref')
if (mainRef) {
  try { execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', mainRef], { cwd: root, stdio: 'ignore' }) }
  catch { errors.push(`release commit is not reachable from ${mainRef}`) }
}

const banner = read('client/client.js').split('\n', 1)[0]
if (!banner.includes(`${pkg.name} ${pkg.version} `)) errors.push(`client/client.js was built for another version (${banner.slice(0, 80)}…) — run npm run build`)

const notes = changelogSection(read('CHANGELOG.md'), pkg.version)
if (notes === undefined) errors.push(`CHANGELOG.md has no "## [${pkg.version}]" section`)
else if (!notes.trim()) errors.push(`CHANGELOG.md section for ${pkg.version} is empty`)

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`)
  process.exit(1)
}
const out = arg('--notes')
if (out) writeFileSync(out, `${notes.trim()}\n`)
console.log(`release ${pkg.name}@${pkg.version} OK${tag ? ` (tag ${tag})` : ''}${semver.prerelease(pkg.version) ? ' — prerelease, npm dist-tag "next"' : ''}`)

/** Body of `## [version]` up to the next `## ` heading, or undefined. */
function changelogSection(text, version) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex(l => new RegExp(`^## \\[?${version.replace(/[.+]/g, '\\$&')}\\]?(\\s|$)`).test(l))
  if (start < 0) return undefined
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}
