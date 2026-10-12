import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { create, Header } from 'tar'
import { describe, expect, it } from 'vitest'
import { assertAssetDigest, readArchive, verifyPublished } from '../scripts/ci/registry-release.mjs'

const sha512 = (bytes, encoding = 'base64') => createHash('sha512').update(bytes).digest(encoding)
const expected = {
  name: 'deepseek-harness-intelligent-ui', version: '0.2.1', sha: 'a'.repeat(40),
  repository: 'https://github.com/dreamfarer-space/deepseek-harness-intelligent-ui', ref: 'refs/tags/v0.2.1',
}

async function archive(files = { 'package.json': '{"version":"0.2.1"}', 'src/plugin.js': 'export const apply = () => {}' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ui-release-test-'))
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
      writeFileSync(path.join(dir, name), text)
    }
    const chunks = []
    for await (const chunk of create({ cwd: dir, prefix: 'package/', portable: true, gzip: true, noDirRecurse: true }, Object.keys(files))) chunks.push(chunk)
    return Buffer.concat(chunks)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

function evidence(bytes, mutate = () => {}) {
  const statement = {
    subject: [{ name: `pkg:npm/${expected.name}@${expected.version}`, digest: { sha512: sha512(bytes, 'hex') } }],
    predicate: {
      buildDefinition: {
        externalParameters: { workflow: { repository: expected.repository, ref: expected.ref, path: '.github/workflows/release.yml' } },
        internalParameters: { github: { event_name: 'push' } },
        resolvedDependencies: [{ digest: { gitCommit: expected.sha } }],
      },
      runDetails: { builder: { id: 'https://github.com/actions/runner/github-hosted' } },
    },
  }
  mutate(statement)
  return { attestations: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } }] }
}

const metadata = bytes => ({ name: expected.name, version: expected.version, gitHead: expected.sha, dist: { integrity: `sha512-${sha512(bytes)}` } })

describe('registry release verification', () => {
  it('accepts the same files even when archive timestamps/compression differ', async () => {
    const bytes = await archive()
    const local = await archive()
    await expect(verifyPublished(metadata(bytes), bytes, local, evidence(bytes), expected)).resolves.toBeUndefined()
  })

  it('rejects corrupted download bytes', async () => {
    const bytes = await archive()
    const corrupt = Buffer.from(bytes)
    corrupt[20] ^= 1
    await expect(verifyPublished(metadata(bytes), corrupt, bytes, evidence(bytes), expected)).rejects.toThrow(/integrity/)
  })

  it.each(['name', 'version', 'gitHead'])('rejects registry %s mismatch before reuse', async key => {
    const bytes = await archive()
    await expect(verifyPublished({ ...metadata(bytes), [key]: 'different' }, bytes, bytes, evidence(bytes), expected)).rejects.toThrow(/differs/)
  })

  it('rejects an existing version with changed source', async () => {
    const bytes = await archive()
    const different = await archive({ 'package.json': '{"version":"0.2.1"}', 'src/plugin.js': 'unreviewed source' })
    await expect(verifyPublished(metadata(bytes), bytes, different, evidence(bytes), expected)).rejects.toThrow(/content differs.*plugin.js/)
  })

  it('rejects missing or extra packed files', async () => {
    const bytes = await archive()
    const different = await archive({ 'package.json': '{}' })
    await expect(verifyPublished(metadata(bytes), bytes, different, evidence(bytes), expected)).rejects.toThrow(/file set/)
  })

  it('rejects missing provenance', async () => {
    const bytes = await archive()
    await expect(verifyPublished(metadata(bytes), bytes, bytes, {}, expected)).rejects.toThrow(/no provenance/)
  })

  it.each(['repository', 'ref', 'path'])('rejects a different provenance workflow %s', async key => {
    const bytes = await archive()
    const provenance = evidence(bytes, p => { p.predicate.buildDefinition.externalParameters.workflow[key] = 'different' })
    await expect(verifyPublished(metadata(bytes), bytes, bytes, provenance, expected)).rejects.toThrow(/provenance differs/)
  })

  it('rejects provenance for a different commit', async () => {
    const bytes = await archive()
    const provenance = evidence(bytes, p => { p.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'b'.repeat(40) })
    await expect(verifyPublished(metadata(bytes), bytes, bytes, provenance, expected)).rejects.toThrow(/provenance differs/)
  })

  it('rejects provenance for a different tarball', async () => {
    const bytes = await archive()
    const provenance = evidence(bytes, p => { p.subject[0].digest.sha512 = '0'.repeat(128) })
    await expect(verifyPublished(metadata(bytes), bytes, bytes, provenance, expected)).rejects.toThrow(/provenance differs/)
  })

  it('refuses conflicting GitHub assets instead of overwriting them', () => {
    const bytes = Buffer.from('verified registry tarball')
    const asset = { name: 'plugin.tgz', digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
    expect(() => assertAssetDigest(asset, bytes)).not.toThrow()
    expect(() => assertAssetDigest(asset, Buffer.from('other tarball'))).toThrow(/asset differs/)
  })

  it('rejects a malformed archive', async () => {
    await expect(readArchive(Buffer.from('not a tarball'))).rejects.toThrow()
  })

  it.each([
    { path: 'package/../../escape', type: 'File' },
    { path: 'package/link', type: 'SymbolicLink', linkpath: '/etc/passwd' },
  ])('rejects unsafe archive entries: $path ($type)', async entry => {
    const header = new Header({ ...entry, size: 0, mode: 0o644 })
    header.encode()
    await expect(readArchive(Buffer.concat([header.block, Buffer.alloc(1024)]))).rejects.toThrow(/unsafe/)
  })
})
