// One-shot E2E: build → install into a throwaway DSH home → start the scripted
// mock model and DSH Web → drive the browser checks → optionally encode the
// recorded demo (MP4 + GIF) with ffmpeg. Runs on Windows, Linux and macOS.
//
// Usage: node scripts/e2e/run-all.mjs [--record] [--out <dir>] [--dsh-home <dir>] [--spec <path|tgz|name@version>] [--no-build]
//   --spec      what to install (default: this checkout). CI passes the packed .tgz so it tests what users get.
// Env:   CHROME_PATH (default: detected per platform), DSH_BIN (default: dsh),
//        E2E_MOCK_PORT (default 3199), E2E_WEB_PORT (default 3181)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePorts, installPlugin, kill, run, startDshWeb } from './dsh-web.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const RECORD = process.argv.includes('--record')
const out = path.resolve(arg('--out', path.join(root, 'e2e-shots')))
const dshHome = path.resolve(arg('--dsh-home', mkdtempSync(path.join(tmpdir(), 'dsh-e2e-'))))
const spec = arg('--spec', root)
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 3199)
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 3181)
const children = []

function cleanup() {
  for (const c of children) kill(c)
  freePorts([MOCK_PORT, WEB_PORT])
}
process.on('SIGINT', () => { cleanup(); process.exit(130) })

try {
  mkdirSync(out, { recursive: true })
  if (process.argv.includes('--no-build')) console.log('[1/5] build (skipped)')
  else {
    console.log('[1/5] build')
    run(process.execPath, [path.join(root, 'scripts/build-client.mjs')])
  }

  console.log(`[2/5] install ${spec} into ${dshHome}`)
  mkdirSync(dshHome, { recursive: true })
  rmSync(path.join(dshHome, 'sessions'), { recursive: true, force: true })
  installPlugin(spec, dshHome)

  console.log('[3/5] start mock model and DSH Web')
  const mockLog = path.join(out, 'mock.log')
  rmSync(mockLog, { force: true })
  children.push(spawn(process.execPath, [path.join(root, 'scripts/e2e/mock-deepseek.mjs'), String(MOCK_PORT), mockLog], { stdio: 'ignore' }))
  const web = await startDshWeb({ dshHome, port: WEB_PORT, mockPort: MOCK_PORT })
  children.push(web.child)
  await new Promise(r => setTimeout(r, 1500))

  console.log('[4/5] browser checks')
  const driver = run(process.execPath, [path.join(root, 'scripts/e2e/browser.mjs'), web.url, out, mockLog, ...(RECORD ? ['--record'] : [])], { check: false })

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
