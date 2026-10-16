// Linux release-runner helper. Never executes files from a downloaded package.
// publish: publish only if absent, then verify and retain the registry tarball.
// verify: compare the registry package with this checkout and its provenance.
// github-asset: create/reuse an identical release attachment, never overwrite it.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser } from 'tar'
import semver from 'semver'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const registry = 'https://registry.npmjs.org'
const digest = (data, algorithm = 'sha512', encoding = 'base64') => createHash(algorithm).update(data).digest(encoding)
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** Parse regular package files in memory; reject links, traversal and duplicates. */
export function readArchive(bytes) {
  return new Promise((resolve, reject) => {
    const files = new Map()
    let total = 0
    const parser = new Parser({ strict: true, maxDecompressionRatio: 100 })
    parser.on('error', reject)
    parser.on('entry', entry => {
      const name = entry.path
      if (entry.type === 'Directory' && name === 'package/') { entry.resume(); return }
      if (entry.type !== 'File' || !name.startsWith('package/') || name.includes('\\')
        || name.split('/').some(p => p === '..' || p === '.' || p === '') || files.has(name)) {
        parser.abort(new Error(`unsafe or duplicate archive entry: ${name}`))
        return
      }
      total += entry.size
      if (total > 10_000_000) { parser.abort(new Error('archive exceeds release size limit')); return }
      const chunks = []
      files.set(name, null)
      entry.on('data', chunk => chunks.push(chunk))
      entry.on('end', () => files.set(name, Buffer.concat(chunks)))
    })
    parser.on('end', () => resolve(files))
    parser.end(bytes)
  })
}

/** Fail closed on a reused version from different contents or a different ref. */
export async function verifyPublished(metadata, bytes, expectedBytes, provenance, expected) {
  if (metadata.name !== expected.name || metadata.version !== expected.version) throw new Error('registry package name/version differs')
  if (metadata.dist?.integrity !== `sha512-${digest(bytes)}`) throw new Error('registry tarball integrity differs')
  if (metadata.gitHead !== expected.sha) throw new Error('registry gitHead differs from release commit')
  const [actual, local] = await Promise.all([readArchive(bytes), readArchive(expectedBytes)])
  if (actual.size !== local.size) throw new Error('registry package file set differs')
  for (const [name, data] of local) {
    if (!actual.get(name)?.equals(data)) throw new Error(`registry package content differs: ${name}`)
  }
  const statement = provenance.attestations?.find(a => a.predicateType === 'https://slsa.dev/provenance/v1')?.bundle?.dsseEnvelope?.payload
  if (!statement) throw new Error('registry package has no provenance statement')
  const attestation = JSON.parse(Buffer.from(statement, 'base64').toString('utf8'))
  const definition = attestation.predicate?.buildDefinition
  const workflow = definition?.externalParameters?.workflow
  const dependency = definition?.resolvedDependencies?.find(d => d.digest?.gitCommit === expected.sha)
  if (workflow?.repository !== expected.repository || workflow?.ref !== expected.ref || workflow?.path !== '.github/workflows/release.yml'
    || !dependency || definition?.internalParameters?.github?.event_name !== 'push'
    || attestation.predicate?.runDetails?.builder?.id !== 'https://github.com/actions/runner/github-hosted'
    || !attestation.subject?.some(s => s.name === `pkg:npm/${expected.name}@${expected.version}` && s.digest?.sha512 === digest(bytes, 'sha512', 'hex'))) {
    throw new Error('registry provenance differs from release source/ref/digest')
  }
}

export function assertAssetDigest(asset, bytes) {
  if (asset.digest !== `sha256:${digest(bytes, 'sha256', 'hex')}`) throw new Error(`existing release asset differs: ${asset.name}`)
}

async function get(url, json = true) {
  const parsed = new URL(url)
  if (parsed.origin !== registry) throw new Error(`unexpected registry URL origin: ${parsed.origin}`)
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' })
  if (!response.ok) throw new Error(`registry HTTP ${response.status}: ${url}`)
  const limit = json ? 10_000_000 : 2_000_000
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) { await response.body.cancel().catch(() => {}); throw new Error('registry response exceeds size limit') }
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks)
  return json ? JSON.parse(body.toString('utf8')) : body
}

function lookup(spec) {
  try { return JSON.parse(run('npm', ['view', spec, '--json', '--registry', registry, '--fetch-retries=0'])) }
  catch (error) {
    let code
    try { code = JSON.parse(String(error.stdout)).error?.code } catch { /* not a registry error */ }
    if (code === 'E404') return null
    throw error
  }
}

async function registryPackage(mode) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const spec = `${pkg.name}@${pkg.version}`
  const expected = {
    name: pkg.name, version: pkg.version,
    sha: run('git', ['rev-parse', 'HEAD']).trim(),
    repository: pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
    ref: `refs/tags/v${pkg.version}`,
  }
  const packDir = mkdtempSync(path.join(tmpdir(), 'intelligent-ui-release-'))
  try {
    // Build and freshness checks run before this helper in the workflow.
    const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packDir]))
    const expectedBytes = readFileSync(path.join(packDir, packed.filename))
    let metadata = lookup(spec)
    if (!metadata && mode === 'publish') {
      console.log(`Publishing ${spec}`)
      console.log(run('npm', ['publish', '--provenance', '--access', 'public', '--tag', semver.prerelease(pkg.version) ? 'next' : 'latest']))
    } else if (metadata) console.log(`${spec} exists; verifying contents and source before reuse`)
    // A fresh version can take several minutes to appear (0.2.4 took ~4 min).
    for (let attempt = 0; !metadata && attempt < 15; attempt++) {
      console.log(`Waiting for ${spec} (${attempt + 1}/15)`)
      await new Promise(resolve => setTimeout(resolve, 20_000))
      metadata = lookup(spec)
    }
    if (!metadata) throw new Error(`${spec} is not available on npm`)
    const bytes = await get(metadata.dist.tarball, false)
    const provenance = await get(metadata.dist.attestations?.url ?? `${registry}/-/npm/v1/attestations/${spec}`)
    await verifyPublished(metadata, bytes, expectedBytes, provenance, expected)
    // Cryptographically verify registry signatures and attestations, in addition
    // to checking the provenance fields above. No downloaded install scripts run.
    const signatureDir = path.join(packDir, 'signatures')
    mkdirSync(signatureDir)
    writeFileSync(path.join(signatureDir, 'package.json'), '{"private":true}')
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', registry, spec], signatureDir)
    console.log(run('npm', ['audit', 'signatures', '--registry', registry], signatureDir))
    mkdirSync(path.join(root, 'release-artifacts'), { recursive: true })
    const tarball = path.join('release-artifacts', packed.filename)
    writeFileSync(path.join(root, tarball), bytes)
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `TARBALL=${tarball}\n`)
    console.log(`Verified ${spec} against ${expected.sha}; saved ${tarball}`)
  } finally { rmSync(packDir, { recursive: true, force: true }) }
}

function githubAsset() {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const tag = `v${pkg.version}`
  const tarball = process.env.TARBALL
  if (!tarball || !existsSync(path.join(root, tarball))) throw new Error('verified registry tarball is missing')
  const bytes = readFileSync(path.join(root, tarball))
  let release
  try { release = JSON.parse(run('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${tag}`])) }
  catch (error) { if (!/HTTP 404/.test(String(error.stderr))) throw error }
  if (!release) {
    const args = ['release', 'create', tag, tarball, '--title', tag, '--notes-file', 'release-notes.md', '--verify-tag']
    if (semver.prerelease(pkg.version)) args.push('--prerelease')
    console.log(run('gh', args))
    return
  }
  const asset = release.assets.find(a => a.name === path.basename(tarball))
  if (asset) {
    // API digest may be absent on old assets. Verify the bytes in that case.
    if (asset.digest) assertAssetDigest(asset, bytes)
    else {
      const dir = mkdtempSync(path.join(tmpdir(), 'intelligent-ui-asset-'))
      try {
        run('gh', ['release', 'download', tag, '--pattern', asset.name, '--dir', dir])
        if (!readFileSync(path.join(dir, asset.name)).equals(bytes)) throw new Error('existing release asset differs')
      } finally { rmSync(dir, { recursive: true, force: true }) }
    }
    console.log(`Existing ${asset.name} matches; leaving it intact`)
  } else console.log(run('gh', ['release', 'upload', tag, tarball]))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  try {
    if (mode === 'publish' || mode === 'verify') await registryPackage(mode)
    else if (mode === 'github-asset') githubAsset()
    else throw new Error('usage: registry-release.mjs publish|verify|github-asset')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
