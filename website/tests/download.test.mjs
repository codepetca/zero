import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifiedLocalAsset } from '../lib/local-download.mjs';
import { validateManifest } from '../lib/contracts.mjs';
const manifest = { schema: 1, kitVersion: '0.5.0', coreVersion: '0.1.1', publication: { status: 'local', repository: 'codepetca/zero', tag: 'v0.5.0' }, assets: Object.fromEntries(['kit', 'starter', 'extension', 'components'].map(key => [key, { filename: `${key}.zip`, label: key }])) };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zero-download-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist'));
  const bytes = Buffer.from('verified fixture archive');
  const receipt = structuredClone(manifest);
  receipt.assets.kit = { ...receipt.assets.kit, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  await writeFile(join(root, 'dist', 'kit.zip'), bytes);
  await writeFile(join(root, 'dist', 'release.json'), JSON.stringify(receipt));
  return { root, bytes, receipt };
}
test('serves precisely receipted bytes and refuses unknown keys', async t => {
  const { root, bytes } = await fixture(t);
  assert.deepEqual((await verifiedLocalAsset(root, 'kit', manifest)).bytes, bytes);
  await assert.rejects(verifiedLocalAsset(root, '../kit.zip', manifest), /Unknown/);
  await assert.rejects(verifiedLocalAsset(root, 'constructor', manifest), /Unknown/);
});
test('refuses modified bytes, stale receipts and unbuilt optional components', async t => {
  const { root, receipt } = await fixture(t);
  await writeFile(join(root, 'dist', 'kit.zip'), 'modified fixture archive');
  await assert.rejects(verifiedLocalAsset(root, 'kit', manifest), /integrity/);
  receipt.coreVersion = '0.1.0';
  await writeFile(join(root, 'dist', 'release.json'), JSON.stringify(receipt));
  await assert.rejects(verifiedLocalAsset(root, 'kit', manifest), /current kit/);
  receipt.coreVersion = '0.1.1';
  await writeFile(join(root, 'dist', 'release.json'), JSON.stringify(receipt));
  await assert.rejects(verifiedLocalAsset(root, 'components', manifest), /verified receipt/);
});
test('refuses symlinked assets outside dist', async t => {
  const { root, bytes } = await fixture(t);
  await rm(join(root, 'dist', 'kit.zip'));
  await writeFile(join(root, 'outside.zip'), bytes);
  await symlink(join(root, 'outside.zip'), join(root, 'dist', 'kit.zip'));
  await assert.rejects(verifiedLocalAsset(root, 'kit', manifest), /outside dist/);
});
test('published state requires explicit exact GitHub version URLs and integrity', () => {
  const published = structuredClone(manifest);
  published.publication.status = 'published';
  assert.throws(() => validateManifest(published), /explicit/);
  for (const asset of Object.values(published.assets)) Object.assign(asset, { url: `https://github.com/codepetca/zero/releases/download/v0.5.0/${asset.filename}`, size: 1, sha256: 'a'.repeat(64) });
  validateManifest(published);
  published.assets.kit.url = 'https://evil.example/kit.zip';
  assert.throws(() => validateManifest(published), /explicit/);
  published.assets.kit.filename = '../kit.zip';
  assert.throws(() => validateManifest(published), /Invalid kit/);
});
