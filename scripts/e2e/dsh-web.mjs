// Cross-platform helpers shared by the E2E runner and the CI smoke test:
// run dsh, install the plugin into a throwaway DSH home, boot DSH Web against
// the scripted mock model, find Chrome, and tear the processes down again.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const WIN = process.platform === 'win32'
export const DSH = process.env.DSH_BIN || 'dsh'

/** One cmd.exe line (Windows .cmd shims only start through a shell). */
function shellLine(cmd, args) {
  const quote = s => /^[\w@%+=:,./\\-]+$/.test(s) ? s : `"${String(s).replace(/"/g, '""')}"`
  return [cmd, ...args].map(quote).join(' ')
}

/** PATH lookups on Windows (dsh, ffmpeg) may be `.cmd` shims, which only start through a shell. */
const viaShell = cmd => WIN && (!path.isAbsolute(cmd) || /\.(cmd|bat)$/i.test(cmd))

/** spawnSync that handles `.cmd` shims; throws on a non-zero exit unless `check: false`. */
export function run(cmd, args, { check = true, ...opts } = {}) {
  const r = viaShell(cmd)
    ? spawnSync(shellLine(cmd, args), { stdio: 'inherit', shell: true, ...opts })
    : spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (check && r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status ?? r.error?.message}`)
  return r
}

/** Run to completion and capture output (never throws on a non-zero exit). */
export function capture(cmd, args, opts = {}) {
  return run(cmd, args, { check: false, stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 << 20, ...opts })
}

/** Long-running child; on POSIX it leads its own process group so `kill` reaches dsh's workers too. */
export function start(cmd, args, opts = {}) {
  if (viaShell(cmd)) return spawn(shellLine(cmd, args), { shell: true, ...opts })
  return spawn(cmd, args, { detached: !WIN, ...opts })
}

export function kill(child) {
  if (!child?.pid || child.exitCode !== null) return
  try {
    if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGTERM')
  } catch { /* already gone */ }
}

/** Belt and braces on Windows, where a shell-wrapped dsh can outlive taskkill of its parent. */
export function freePorts(ports) {
  if (!WIN) return
  for (const port of ports) {
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`])
  }
}

/** Install spec for `dsh plugin add`: a path or .tgz becomes `file:` with forward slashes. */
export function installSpec(spec) {
  if (/^(file:|https?:|git\+|github:)/.test(spec) || (!spec.endsWith('.tgz') && !existsSync(spec))) return spec
  return `file:${path.resolve(spec).replace(/\\/g, '/')}`
}

export function installPlugin(spec, dshHome, profile = 'web') {
  run(DSH, ['plugin', '--profile', profile, 'add', installSpec(spec)], { cwd: dshHome, env: { ...process.env, DSH_HOME: dshHome } })
}

/**
 * Boot `dsh --profile web` and resolve with the tokenized URL it prints.
 * Without `mockPort` DSH talks to the real DeepSeek API with the caller's
 * DEEPSEEK_API_KEY; `patches` adds loader patch entries (e.g. the model).
 * @returns {Promise<{ child: import('node:child_process').ChildProcess, url: string, output: () => string }>}
 */
export function startDshWeb({ dshHome, port, mockPort, patches = [], timeoutMs = 120000 }) {
  // CI hosts may have no system Documents directory (notably Linux without
  // xdg-user-dir). Keep first-use workspace creation inside this test home.
  const documents = path.join(dshHome, 'documents')
  mkdirSync(documents, { recursive: true })
  const patch = path.join(dshHome, 'e2e-workspace.patch.yml')
  writeFileSync(patch, JSON.stringify([{ id: 'workspace-controller', config: { documentsDirectory: documents } }, ...patches]))
  const model = mockPort ? { DEEPSEEK_API_KEY: 'mock', DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}` } : {}
  const child = start(DSH, ['--profile', 'web', '--patch', patch, '--no-open', '--port', String(port)], {
    env: { ...process.env, DSH_HOME: dshHome, ...model },
  })
  let log = ''
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      kill(child)
      reject(new Error(`DSH Web did not start within ${timeoutMs / 1000}s\n${log.slice(-4000)}`))
    }, timeoutMs)
    const scan = (d) => {
      log += String(d)
      const m = /http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s"']+/.exec(log)
      if (m) { clearTimeout(timer); resolve({ child, url: m[0], output: () => log }) }
    }
    child.stdout.on('data', scan)
    child.stderr.on('data', scan)
    child.on('error', err => { clearTimeout(timer); reject(err) })
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`DSH exited with ${code}\n${log.slice(-4000)}`)) })
  })
}

/** Chrome for puppeteer: $CHROME_PATH, else the usual install location per platform. */
export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = {
    win32: [
      `${process.env.PROGRAMFILES || 'C:/Program Files'}/Google/Chrome/Application/chrome.exe`,
      `${process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'}/Google/Chrome/Application/chrome.exe`,
      `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
      `${process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)'}/Microsoft/Edge/Application/msedge.exe`,
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
  }[process.platform] ?? ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .flatMap(bin => ['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome'].map(dir => `${dir}/${bin}`))
  const found = candidates.find(p => p && existsSync(p))
  if (!found) throw new Error(`Chrome not found; set CHROME_PATH. Looked in:\n  ${candidates.join('\n  ')}`)
  return found
}
