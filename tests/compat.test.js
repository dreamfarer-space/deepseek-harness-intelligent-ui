import { readFileSync } from 'node:fs'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_DSH_RANGE, TESTED_DSH_VERSIONS } from '../src/compat.js'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('DSH compatibility range', () => {
  it('package.json dsh peers match SUPPORTED_DSH_RANGE', () => {
    const dshPeers = Object.entries(manifest.peerDependencies)
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    expect(dshPeers.length).toBeGreaterThan(0)
    for (const [, range] of dshPeers) expect(range).toBe(SUPPORTED_DSH_RANGE)
  })

  // The real install-time gate DSH runs before it adds a plugin to a profile.
  it.each([...TESTED_DSH_VERSIONS, '0.2.0-rc.3', '0.2.9'])('DSH %s accepts the plugin', (runtime) => {
    expect(evaluatePluginCompatibility(manifest, {}, runtime)).toBeUndefined()
  })

  it.each(['0.1.5-rc.3', '0.1.6-alpha.2', '0.3.0-alpha.1', '0.3.0', '1.0.0'])('DSH %s refuses the plugin', (runtime) => {
    const issue = evaluatePluginCompatibility(manifest, {}, runtime)
    expect(issue?.exempted).toBe(false)
    expect(Object.keys(issue.peers)).toContain('@deepseek-ai/dsh')
  })

  it('keeps the package installable without a build step', () => {
    expect(manifest.scripts.prepare).toBeUndefined()
    expect(manifest.scripts.postinstall).toBeUndefined()
    expect(manifest.files).toEqual(expect.arrayContaining(['bin', 'src', 'client', 'locale', 'cordis.patch.yml']))
  })

  it('bundle patch and client banner use the package name and version', () => {
    expect(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')).toMatch(new RegExp(`name: ${manifest.name}\\s`))
    const banner = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8').split('\n', 2).join('\n')
    expect(banner).toContain(`${manifest.name} ${manifest.version}`)
    expect(banner).toContain(`id: ${JSON.stringify(manifest.name)}`)
  })
})
