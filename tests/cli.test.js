import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSupportedDsh, main, parseArgs, parseVersionOutput, planCommand, profileDir, shellLine } from '../bin/cli.mjs'

const NAME = 'deepseek-harness-intelligent-ui'

/** Fake `run`: answers --version probes, records everything else. */
function fakeRun({ dsh = '0.2.0-rc.2', pnpm = '10.33.0', installStatus = 0 } = {}) {
  const calls = []
  const run = (cmd, args) => {
    calls.push([cmd, ...args])
    if (args[0] === '--version') {
      const v = cmd === 'pnpm' ? pnpm : dsh
      return v ? { status: 0, stdout: `${v}\n` } : { status: null, stdout: '', error: new Error('ENOENT') }
    }
    return { status: installStatus, stdout: '' }
  }
  return { run, calls }
}

const home = () => mkdtempSync(path.join(tmpdir(), 'dsh-cli-test-'))

function quiet() {
  const out = []
  return { out, log: s => out.push(s), error: s => out.push(s) }
}

describe('cli args', () => {
  it('defaults to install into the web profile', () => {
    expect(parseArgs([])).toMatchObject({ command: 'install', profile: 'web', dryRun: false })
  })
  it('parses commands, aliases and --key=value', () => {
    expect(parseArgs(['remove', '--profile=tui'])).toMatchObject({ command: 'uninstall', profile: 'tui' })
    expect(parseArgs(['doctor', '--dsh', '/opt/dsh'])).toMatchObject({ command: 'doctor', dsh: '/opt/dsh' })
  })
  it('rejects unknown input and unsafe profile names', () => {
    expect(() => parseArgs(['frobnicate'])).toThrow(/unknown command/)
    expect(() => parseArgs(['--profile'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--profile', 'a&b'])).toThrow(/invalid profile/)
  })
})

describe('cli version gate', () => {
  it('reads commander version output', () => {
    expect(parseVersionOutput('0.2.0-rc.1\n')).toBe('0.2.0-rc.1')
    expect(parseVersionOutput('nope')).toBeNull()
  })
  it('applies the range with prereleases, like DSH', () => {
    expect(isSupportedDsh('0.1.7-rc.2')).toBe(true)
    expect(isSupportedDsh('0.2.1-alpha.2')).toBe(true)
    expect(isSupportedDsh('0.1.5-rc.3')).toBe(false)
    expect(isSupportedDsh('0.3.0')).toBe(false)
  })
})

describe('cli commands', () => {
  const node = '22.13.0'

  it('install runs dsh plugin add with the pinned version', () => {
    const { run, calls } = fakeRun()
    expect(main(['install'], { run, env: { DSH_HOME: home() }, nodeVersion: node, ...quiet() })).toBe(0)
    expect(calls.at(-1)).toEqual(['dsh', 'plugin', '--profile', 'web', 'add', expect.stringMatching(new RegExp(`^${NAME}@\\d`))])
  })

  it('refuses to install on an unsupported DSH and names the escape hatch', () => {
    const { run, calls } = fakeRun({ dsh: '0.1.5-rc.3' })
    const io = quiet()
    expect(main(['install'], { run, env: { DSH_HOME: home() }, nodeVersion: node, ...io })).toBe(1)
    expect(calls.every(c => c[1] === '--version')).toBe(true)
    expect(io.out.join('\n')).toMatch(/allow-version/)
  })

  it('reports missing dsh, missing pnpm and old Node', () => {
    const { run } = fakeRun({ dsh: null, pnpm: null })
    const io = quiet()
    expect(main(['doctor'], { run, env: { DSH_HOME: home() }, nodeVersion: '20.10.0', ...io })).toBe(1)
    const text = io.out.join('\n')
    expect(text).toMatch(/npm install -g @deepseek-ai\/dsh/)
    expect(text).toMatch(/corepack enable/)
    expect(text).toMatch(/Node\.js 20\.10\.0 is older/)
  })

  it('fails when dsh itself fails', () => {
    const { run } = fakeRun({ installStatus: 1 })
    expect(main(['install'], { run, env: { DSH_HOME: home() }, nodeVersion: node, ...quiet() })).toBe(1)
  })

  it('uninstall is a no-op when absent and removes the plugin when present', () => {
    const dir = home()
    let f = fakeRun()
    expect(main(['uninstall'], { run: f.run, env: { DSH_HOME: dir }, nodeVersion: node, ...quiet() })).toBe(0)
    expect(f.calls.some(c => c.includes('remove'))).toBe(false)

    mkdirSync(path.join(dir, 'profiles', 'web'), { recursive: true })
    writeFileSync(path.join(dir, 'profiles', 'web', 'package.json'), JSON.stringify({ dependencies: { [NAME]: '0.2.0' } }))
    f = fakeRun()
    expect(main(['uninstall'], { run: f.run, env: { DSH_HOME: dir }, nodeVersion: node, ...quiet() })).toBe(0)
    expect(f.calls.at(-1)).toEqual(['dsh', 'plugin', '--profile', 'web', 'remove', NAME])
  })

  it('blocks install while the pre-0.2 package is still in the profile', () => {
    const dir = home()
    mkdirSync(path.join(dir, 'profiles', 'web'), { recursive: true })
    writeFileSync(path.join(dir, 'profiles', 'web', 'package.json'), JSON.stringify({ dependencies: { 'dsh-intelligent-ui': 'file:/old' } }))
    const { run, calls } = fakeRun()
    const io = quiet()
    expect(main(['install'], { run, env: { DSH_HOME: dir }, nodeVersion: node, ...io })).toBe(1)
    expect(calls.some(c => c.includes('add'))).toBe(false)
    expect(io.out.join('\n')).toMatch(/remove dsh-intelligent-ui/)
  })

  it('honors --dry-run, DSH_BIN and --spec', () => {
    const { run, calls } = fakeRun()
    expect(main(['--dry-run'], { run, env: { DSH_HOME: home(), DSH_BIN: '/x/dsh' }, nodeVersion: node, ...quiet() })).toBe(0)
    expect(calls.map(c => c[0])).toEqual(['/x/dsh', 'pnpm'])
    expect(planCommand(parseArgs(['--spec', 'file:/tmp/p.tgz']), {})[1].at(-1)).toBe('file:/tmp/p.tgz')
  })
})

describe('cli helpers', () => {
  it('profileDir follows DSH_HOME', () => {
    const h = path.resolve('/h')
    expect(profileDir('web', { DSH_HOME: h })).toBe(path.join(h, 'profiles', 'web'))
  })
  it('shellLine quotes only what needs quoting', () => {
    expect(shellLine('dsh', ['plugin', '--profile', 'web', 'add', 'x@1.0.0'])).toBe('dsh plugin --profile web add x@1.0.0')
    expect(shellLine('C:\\Program Files\\dsh.cmd', ['a "b"'])).toBe('"C:\\Program Files\\dsh.cmd" "a ""b"""')
  })
})
