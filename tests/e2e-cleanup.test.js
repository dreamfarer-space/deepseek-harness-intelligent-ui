import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

// Windows uses taskkill; POSIX cleanup must terminate the mock's process group.
it.skipIf(process.platform === 'win32')('E2E exits and cleans up its mock when DSH Web fails to boot', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-cleanup-test-'))
  const dsh = path.join(dir, 'fake-dsh')
  writeFileSync(dsh, '#!/usr/bin/env node\nprocess.exit(process.argv[2] === "plugin" ? 0 : 7)\n', { mode: 0o755 })
  const child = spawn(process.execPath, [path.join(root, 'scripts/e2e/run-all.mjs'),
    '--no-build', '--spec', root, '--out', path.join(dir, 'shots'), '--dsh-home', path.join(dir, 'home')], {
    detached: true,
    env: { ...process.env, DSH_BIN: dsh, E2E_MOCK_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  let timer
  try {
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`E2E did not exit after DSH failed:\n${output}`)), 8000)
      child.on('error', reject)
      child.on('exit', resolve)
    })
    expect(code).toBe(1)
    expect(output).toContain('DSH exited with 7')
  } finally {
    clearTimeout(timer)
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true })
  }
}, 15000)
