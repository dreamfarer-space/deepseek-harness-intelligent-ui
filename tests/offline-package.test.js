import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { verifyOfflinePackage } from '../scripts/offline/verify.mjs';

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'diui-offline-package-'));
  const files = {
    'package.json': JSON.stringify({ name: 'deepseek-harness-intelligent-ui', version: '0.2.5', intelligentUiResources: 'offline' }),
    'src/resource-mode.js': "export const RESOURCE_MODE = 'offline';\n",
    'client/client.js': ' '.repeat(1_000_001),
    'renderer/renderer.js': ' '.repeat(1_000_001),
    'client/client.d.ts': 'export declare const inject: string[];\n',
    'docs/component-extensions.md': '# Trusted extensions\n',
  };
  // Exercise every shipped template file, including its prebuilt DSH client.
  for (const name of await readdir(new URL('../examples/component-extension/', import.meta.url))) {
    files['examples/component-extension/' + name] = await readFile(new URL('../examples/component-extension/' + name, import.meta.url));
  }
  const assets = [];
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
    assets.push({ path, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
  }
  await mkdir(join(root, 'offline-resources'));
  await writeFile(join(root, 'offline-resources/manifest.json'), JSON.stringify({
    format: 1, mode: 'offline', package: 'deepseek-harness-intelligent-ui', version: '0.2.5', assets,
    packages: [{ integrity: 'sha512-fixture', version: '1.0.0', licenseFiles: ['LICENSE'] }],
  }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('offline extension package verification', () => {
  it('accepts the shipped extension declarations, documentation and complete template', async () => {
    await expect(verifyOfflinePackage(root)).resolves.toMatchObject({ version: '0.2.5' });
  });
  it('still detects changes in newly allowed documentation', async () => {
    await writeFile(join(root, 'docs/component-extensions.md'), 'modified');
    await expect(verifyOfflinePackage(root)).rejects.toThrow(/Integrity mismatch: docs\/component-extensions.md/);
  });
  it('does not permit arbitrary documentation or traversal through the new paths', async () => {
    const file = join(root, 'offline-resources/manifest.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    for (const path of ['docs/other.md', 'examples/component-extension/../../package.json']) {
      await writeFile(file, JSON.stringify({ ...manifest, assets: [{ path }] }));
      await expect(verifyOfflinePackage(root)).rejects.toThrow(/Unexpected|Unsafe/);
    }
  });
});
