// Install smoke test: what an ordinary user gets from `dsh plugin add`.
// Installs <spec> into a throwaway DSH home, then checks that DSH accepted it
// (version gate), composed its bundle row, kept the prebuilt client bundle, and
// boots DSH Web without plugin errors. No model or browser is needed.
//
// Usage: node scripts/ci/smoke.mjs [--spec <tgz|path|name@version>] [--dsh-home <dir>] [--keep]
//   --spec defaults to this checkout. CI passes the `npm pack` tarball, and the
//   release workflow passes `<name>@<version>` to test the published package.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH, capture, freePorts, installPlugin, kill, startDshWeb } from '../e2e/dsh-web.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const spec = arg('--spec', root)
const dshHome = path.resolve(arg('--dsh-home', mkdtempSync(path.join(tmpdir(), 'dsh-smoke-'))))
const PORT = Number(process.env.SMOKE_WEB_PORT || 3191)
const profile = path.join(dshHome, 'profiles', 'web')

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const env = { ...process.env, DSH_HOME: dshHome }
const dshVersion = String(capture(DSH, ['--version'], { env }).stdout).trim()
console.log(`dsh ${dshVersion} · node ${process.versions.node} · ${process.platform}-${process.arch}`)
console.log(`installing ${spec} into ${dshHome}\n`)

let web
try {
  installPlugin(spec, dshHome)

  const manifest = JSON.parse(readFileSync(path.join(profile, 'package.json'), 'utf8'))
  check('profile depends on the plugin', manifest.dependencies?.[pkg.name], manifest.dependencies?.[pkg.name])
  check('profile lists the plugin as a bundle', manifest.dsh?.profile?.bundles?.includes(pkg.name))

  const installed = path.join(profile, 'node_modules', pkg.name)
  const installedPkg = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'))
  check('prebuilt client bundle shipped (no build step)', existsSync(path.join(installed, 'client', 'client.js')))
  const banner = readFileSync(path.join(installed, 'client', 'client.js'), 'utf8').split('\n', 1)[0]
  check('client bundle matches the installed version', banner.includes(`${pkg.name} ${installedPkg.version}`), banner.slice(0, 100))

  // --dump-config composes the profile exactly as boot does, including the compatibility gate.
  const dump = capture(DSH, ['--profile', 'web', '--dump-config'], { env, cwd: dshHome })
  check('dsh --dump-config succeeds', dump.status === 0, dump.status === 0 ? '' : String(dump.stderr).slice(-2000))
  check('bundle patch inserts the intelligent-ui row', new RegExp(`- id: intelligent-ui\\s+name: ${pkg.name}`).test(dump.stdout))

  web = await startDshWeb({ dshHome, port: PORT, mockPort: 9 })
  check('DSH Web boots with the plugin', !!web.url)
  // Let the loader apply every plugin, then look for anything blaming this one.
  await new Promise(r => setTimeout(r, 5000))
  const complaints = web.output().split(/\r?\n/)
    .filter(l => /intelligent-ui/.test(l) && /error|fail|incompatible|cannot|exception/i.test(l))
  check('no plugin errors in the DSH log', complaints.length === 0, complaints.slice(0, 5).join(' | '))
} catch (err) {
  check('smoke run', false, err?.stack || String(err))
} finally {
  kill(web?.child)
  freePorts([PORT])
  if (!process.argv.includes('--keep')) rmSync(dshHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

console.log(`\n${failed ? `${failed} check(s) failed` : 'all smoke checks passed'}`)
process.exitCode = failed ? 1 : 0
