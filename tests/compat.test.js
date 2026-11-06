import { readFileSync } from 'node:fs'
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_CORDIS_RANGE, SUPPORTED_DSH_RANGE, TESTED_DSH_VERSIONS, minNodeVersionForDsh } from '../src/compat.js'
import semver from 'semver'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('DSH compatibility range', () => {
  it('package.json dsh and cordis peers match SUPPORTED_DSH_RANGE / SUPPORTED_CORDIS_RANGE', () => {
    const dshPeers = Object.entries(manifest.peerDependencies)
      .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    expect(dshPeers.length).toBeGreaterThan(0)
    for (const [, range] of dshPeers) expect(range).toBe(SUPPORTED_DSH_RANGE)
    expect(manifest.peerDependencies['@deepseek-ai/cordis']).toBe(SUPPORTED_CORDIS_RANGE)
  })

  it.each(['4.0.4', '4.0.5-alpha.1', '4.0.6-alpha.1', '4.0.6', '4.1.0-alpha.1', '4.1.0', '4.1.2', '4.2.0-rc.1', '4.2.0'])('ordinary npm peer semver accepts @deepseek-ai/cordis %s', (ver) => {
    expect(semver.satisfies(ver, manifest.peerDependencies['@deepseek-ai/cordis'])).toBe(true)
  })

  // The real install-time gate DSH runs before it adds a plugin to a profile.
  it.each([...TESTED_DSH_VERSIONS, '0.2.3-alpha.1', '0.2.3-rc.1', '0.2.4-alpha.1'])('ordinary npm peer semver accepts DSH %s', (runtime) => {
    expect(semver.satisfies(runtime, SUPPORTED_DSH_RANGE)).toBe(true)
  })

  it.each([...TESTED_DSH_VERSIONS, '0.2.0-rc.3', '0.2.2-rc.1', '0.2.9'])('DSH %s accepts the plugin', (runtime) => {
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

  it('returns the DSH-specific minimum Node.js version (24.9.0 for DSH >= 0.2.2-0, 22.13.0 for older)', () => {
    expect(minNodeVersionForDsh('0.1.7-rc.2')).toBe('22.13.0')
    expect(minNodeVersionForDsh('0.2.1-rc.5')).toBe('22.13.0')
    expect(minNodeVersionForDsh('0.2.2-alpha.2')).toBe('24.9.0')
    expect(minNodeVersionForDsh('0.2.2-rc.1')).toBe('24.9.0')
    expect(minNodeVersionForDsh(null)).toBe('22.13.0')
  })
})
