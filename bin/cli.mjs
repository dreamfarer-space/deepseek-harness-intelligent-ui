#!/usr/bin/env node
/**
 * `npx deepseek-harness-intelligent-ui <install|uninstall|doctor>` — a thin,
 * build-free wrapper over `dsh plugin --profile <p> add|remove`.
 *
 * It checks the environment first (Node, dsh on PATH and its version against
 * SUPPORTED_DSH_RANGE, pnpm), then lets DSH's own plugin manager do the work.
 * Nothing here is needed at runtime; DSH loads `src/plugin.js` and `client/`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'
import { MIN_NODE_VERSION, SUPPORTED_DSH_RANGE } from '../src/compat.js'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

export const USAGE = `Usage: npx ${pkg.name} <command> [options]

Commands:
  install      install this plugin into a DSH profile (default)
  uninstall    remove it from the profile
  doctor       check Node, dsh, pnpm and the profile without changing anything

Options:
  --profile <name>   DSH profile (default: web)
  --dsh <bin>        dsh executable (default: $DSH_BIN or dsh on PATH)
  --spec <spec>      what to install (default: ${pkg.name}@${pkg.version})
  --dry-run          print the dsh command instead of running it
  -h, --help         show this help
  -v, --version      print the plugin version`

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { command: 'install', profile: 'web', dsh: undefined, spec: undefined, dryRun: false, help: false, version: false }
  const rest = [...argv]
  let commandSeen = false
  while (rest.length) {
    const a = rest.shift()
    const value = () => {
      const v = rest.shift()
      if (v === undefined || v.startsWith('-')) throw new UsageError(`${a} needs a value`)
      return v
    }
    if (a === '-h' || a === '--help') opts.help = true
    else if (a === '-v' || a === '--version') opts.version = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--profile') opts.profile = value()
    else if (a === '--dsh') opts.dsh = value()
    else if (a === '--spec') opts.spec = value()
    else if (a.startsWith('--') && a.includes('=')) rest.unshift(a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1))
    else if (!a.startsWith('-') && !commandSeen) {
      if (!['install', 'uninstall', 'remove', 'doctor'].includes(a)) throw new UsageError(`unknown command "${a}"`)
      opts.command = a === 'remove' ? 'uninstall' : a
      commandSeen = true
    } else throw new UsageError(`unknown argument "${a}"`)
  }
  if (!/^[\w.-]+$/.test(opts.profile)) throw new UsageError(`invalid profile name "${opts.profile}"`)
  return opts
}

export class UsageError extends Error {}

/** Leading semver in `dsh --version` output, which commander prints bare. */
export function parseVersionOutput(text) {
  const m = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/.exec(String(text))
  return m ? m[0] : null
}

/** Same rule DSH applies at install time: prereleases participate in ranges. */
export function isSupportedDsh(version) {
  return semver.valid(version) !== null && semver.satisfies(version, SUPPORTED_DSH_RANGE, { includePrerelease: true })
}

export function isSupportedNode(version) {
  const v = semver.coerce(version)
  return v !== null && semver.gte(v, MIN_NODE_VERSION)
}

/** `$DSH_HOME/profiles/<profile>`, defaulting DSH_HOME to `~/.dsh` like dsh-home-paths. */
export function profileDir(profile, env = process.env) {
  const raw = env.DSH_HOME?.trim()
  const home = !raw ? path.join(homedir(), '.dsh')
    : raw === '~' ? homedir()
    : raw.startsWith('~/') || raw.startsWith('~\\') ? path.join(homedir(), raw.slice(2))
    : path.resolve(raw)
  return path.join(home, 'profiles', profile)
}

/** Pre-0.2 package name; its bundle row has the same id, so both cannot be installed. */
export const LEGACY_NAME = 'dsh-intelligent-ui'

/** The spec the profile's package.json records for a package (default: this plugin), or null. */
export function installedSpec(dir, name = pkg.name) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return manifest.dependencies?.[name] ?? null
  } catch {
    return null
  }
}

/**
 * Run a command and capture its output. `.cmd` shims (dsh, pnpm on Windows)
 * only start through a shell; arguments here are fixed or validated above.
 */
export function defaultRun(cmd, args, { inherit = false } = {}) {
  const win = process.platform === 'win32'
  const r = spawnSync(win ? shellLine(cmd, args) : cmd, win ? [] : args, {
    shell: win,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: process.env,
  })
  return { status: r.error ? null : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error }
}

/** One cmd.exe command line; quotes anything outside a conservative safe set. */
export function shellLine(cmd, args) {
  const quote = s => /^[\w@%+=:,./\\-]+$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`
  return [cmd, ...args].map(quote).join(' ')
}

/**
 * Inspect the environment. Every problem carries the fix a user can apply.
 * @returns {{ ok: boolean, dshVersion: string|null, dir: string, installed: string|null, lines: string[] }}
 */
export function doctor(opts, { run = defaultRun, env = process.env, nodeVersion = process.versions.node } = {}) {
  const lines = []
  let ok = true
  const good = msg => lines.push(`  ok    ${msg}`)
  const bad = (msg, fix) => { ok = false; lines.push(`  FAIL  ${msg}`, `        → ${fix}`) }
  const warn = (msg, fix) => lines.push(`  warn  ${msg}`, ...(fix ? [`        → ${fix}`] : []))

  if (isSupportedNode(nodeVersion)) good(`Node.js ${nodeVersion}`)
  else bad(`Node.js ${nodeVersion} is older than ${MIN_NODE_VERSION}`, `install Node.js ${MIN_NODE_VERSION} or newer (https://nodejs.org)`)

  const dsh = dshBin(opts, env)
  const v = run(dsh, ['--version'])
  const dshVersion = v.status === 0 ? parseVersionOutput(v.stdout) : null
  if (!dshVersion) {
    bad(`could not run "${dsh} --version"`, 'install DeepSeek Harness: npm install -g @deepseek-ai/dsh (or pass --dsh <path>)')
  } else if (isSupportedDsh(dshVersion)) {
    good(`dsh ${dshVersion} (supported: ${SUPPORTED_DSH_RANGE})`)
  } else {
    bad(`dsh ${dshVersion} is outside the supported range ${SUPPORTED_DSH_RANGE}`,
      `upgrade DSH (npm install -g @deepseek-ai/dsh@latest) or install a plugin release that supports ${dshVersion}; `
      + `\`dsh plugin --profile ${opts.profile} allow-version ${pkg.name}@${pkg.version} --dsh-version ${dshVersion} --accept-risk\` overrides the check at your own risk`)
  }

  const p = run('pnpm', ['--version'])
  if (p.status === 0) good(`pnpm ${String(p.stdout).trim()}`)
  else bad('pnpm was not found (DSH installs plugins with pnpm)', 'run `corepack enable` (bundled with Node.js) or `npm install -g pnpm`')

  const dir = profileDir(opts.profile, env)
  const installed = installedSpec(dir)
  if (!existsSync(dir)) warn(`profile "${opts.profile}" does not exist yet at ${dir}`, 'it is created on first install')
  else if (installed) good(`profile "${opts.profile}" has ${pkg.name} (${installed})`)
  else good(`profile "${opts.profile}" at ${dir}`)
  const legacy = installedSpec(dir, LEGACY_NAME)
  if (legacy && opts.command !== 'uninstall') {
    bad(`profile "${opts.profile}" still has the pre-0.2 package ${LEGACY_NAME} (${legacy}); both insert the "intelligent-ui" row`,
      `remove it first: dsh plugin --profile ${opts.profile} remove ${LEGACY_NAME}`)
  }

  return { ok, dshVersion, dir, installed, lines }
}

function dshBin(opts, env) {
  return opts.dsh || env.DSH_BIN?.trim() || 'dsh'
}

/** The dsh invocation for a command, without running it. */
export function planCommand(opts, env = process.env) {
  const dsh = dshBin(opts, env)
  if (opts.command === 'install') return [dsh, ['plugin', '--profile', opts.profile, 'add', opts.spec || `${pkg.name}@${pkg.version}`]]
  if (opts.command === 'uninstall') return [dsh, ['plugin', '--profile', opts.profile, 'remove', pkg.name]]
  return null
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv, { run = defaultRun, env = process.env, log = console.log, error = console.error, nodeVersion } = {}) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    error(`${pkg.name}: ${e.message}\n\n${USAGE}`)
    return 2
  }
  if (opts.help) { log(USAGE); return 0 }
  if (opts.version) { log(pkg.version); return 0 }

  log(`${pkg.name} ${pkg.version} — checking environment (profile: ${opts.profile})`)
  const report = doctor(opts, { run, env, ...(nodeVersion ? { nodeVersion } : {}) })
  for (const line of report.lines) log(line)
  if (opts.command === 'doctor') return report.ok ? 0 : 1
  if (opts.command === 'uninstall' && !report.installed) {
    log(`\n${pkg.name} is not installed in profile "${opts.profile}"; nothing to do.`)
    return 0
  }
  if (!report.ok) {
    error('\nFix the problems above, then run this command again.')
    return 1
  }

  const [cmd, args] = planCommand(opts, env)
  log(`\n> ${cmd} ${args.join(' ')}`)
  if (opts.dryRun) return 0
  const r = run(cmd, args, { inherit: true })
  if (r.status !== 0) {
    error(`\n${pkg.name}: dsh exited with ${r.status ?? r.error?.message}. See its output above.`)
    return 1
  }
  log(opts.command === 'install'
    ? `\nInstalled. Restart DSH (\`dsh ${opts.profile}\`) to load the plugin.`
    : `\nRemoved. Restart DSH (\`dsh ${opts.profile}\`) to unload the plugin.`)
  return 0
}

/** True when this file is the process entry (directly, via npx or a .bin symlink). */
function isEntry() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntry()) process.exitCode = main(process.argv.slice(2))
