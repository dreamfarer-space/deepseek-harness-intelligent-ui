// One-shot E2E: build → install into a throwaway DSH home → start the scripted
// mock model and DSH Web → drive the browser checks → optionally encode the
// recorded demo (MP4 + GIF) with ffmpeg.
//
// Usage: node scripts/e2e/run-all.mjs [--record] [--out <dir>] [--dsh-home <dir>]
// Env:   CHROME_PATH (default: C:/Program Files/Google/Chrome/Application/chrome.exe), DSH_BIN (default: dsh)
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const RECORD = process.argv.includes('--record')
const out = path.resolve(arg('--out', path.join(root, 'e2e-shots')))
const dshHome = path.resolve(arg('--dsh-home', mkdtempSync(path.join(tmpdir(), 'dsh-e2e-'))))
const MOCK_PORT = 3199
const WEB_PORT = 3181
const dsh = process.env.DSH_BIN || 'dsh'
const children = []

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}`)
}
function cleanup() {
  for (const c of children) { try { c.kill() } catch { /* gone */ } }
  if (process.platform === 'win32') {
    for (const port of [MOCK_PORT, WEB_PORT]) {
      spawnSync('powershell', ['-NoProfile', '-Command', `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`])
    }
  }
}
process.on('SIGINT', () => { cleanup(); process.exit(130) })

try {
  mkdirSync(out, { recursive: true })
  console.log('[1/5] build')
  run(process.execPath, [path.join(root, 'scripts/build-client.mjs')])

  console.log(`[2/5] install into ${dshHome}`)
  mkdirSync(dshHome, { recursive: true })
  rmSync(path.join(dshHome, 'sessions'), { recursive: true, force: true })
  run(dsh, ['plugin', '--profile', 'web', 'add', `file:${root.replace(/\\/g, '/')}`], { cwd: dshHome, shell: process.platform === 'win32', env: { ...process.env, DSH_HOME: dshHome } })

  console.log('[3/5] start mock model and DSH Web')
  const mockLog = path.join(out, 'mock.log')
  rmSync(mockLog, { force: true })
  children.push(spawn(process.execPath, [path.join(root, 'scripts/e2e/mock-deepseek.mjs'), String(MOCK_PORT), mockLog], { stdio: 'ignore' }))
  const web = spawn(dsh, ['--profile', 'web', '--no-open', '--port', String(WEB_PORT)], {
    shell: process.platform === 'win32',
    env: { ...process.env, DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'mock', DEEPSEEK_BASE_URL: `http://127.0.0.1:${MOCK_PORT}` },
  })
  children.push(web)
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DSH Web did not start within 90s')), 90000)
    const scan = (d) => { const m = /http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s"']+/.exec(String(d)); if (m) { clearTimeout(timer); resolve(m[0]) } }
    web.stdout.on('data', scan)
    web.stderr.on('data', scan)
    web.on('exit', code => reject(new Error(`DSH exited with ${code}`)))
  })
  await new Promise(r => setTimeout(r, 1500))

  console.log('[4/5] browser checks')
  const driver = spawnSync(process.execPath, [path.join(root, 'scripts/e2e/browser.mjs'), url, out, mockLog, ...(RECORD ? ['--record'] : [])], { stdio: 'inherit' })

  if (RECORD && existsSync(path.join(out, 'frames', 'frames.txt'))) {
    console.log('[5/5] encode demo video')
    const assets = path.join(root, 'docs/assets')
    run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(out, 'frames', 'frames.txt'),
      '-vf', 'scale=1280:-2:flags=lanczos,fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', path.join(assets, 'demo.mp4')])
    run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(assets, 'demo.mp4'),
      '-vf', 'fps=6,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', path.join(assets, 'demo.gif')])
    console.log(`video: ${path.join(assets, 'demo.mp4')}`)
  } else {
    console.log('[5/5] (no recording requested)')
  }
  process.exitCode = driver.status ?? 1
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  cleanup()
}
