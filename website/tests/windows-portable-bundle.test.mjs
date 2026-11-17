import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { windowsPortableBundleHref } from '../lib/windows-portable-bundle.mjs';

const bundle = JSON.parse(await readFile(new URL('../../release/windows-portable-bundle.json', import.meta.url)));
const currentKit = JSON.parse(await readFile(new URL('../../release/kit.json', import.meta.url)));
const kit = currentKit.publication.status === 'published' ? currentKit :
  JSON.parse(await readFile(new URL('../../release/published-kit.json', import.meta.url)));

test('published bundle matches the actual kit and its exact release URL', () => {
  assert.equal(windowsPortableBundleHref(bundle, kit), bundle.asset.url);
  assert.equal(bundle.kitVersion, kit.kitVersion);
  assert.equal(bundle.kitSha256, kit.assets.kit.sha256);
});

test('bundle rejects inconsistent, unsafe or guessed release metadata', () => {
  for (const change of [
    { kitVersion: '../0.5.78' }, { sourceRevision: 'a'.repeat(39) },
    { kitSourceRevision: 'b'.repeat(39) }, { kitSha256: 'c'.repeat(63) },
    { publication: { ...bundle.publication, status: 'draft' } },
    { publication: { ...bundle.publication, tag: 'latest' } },
    { asset: { ...bundle.asset, filename: 'other.zip' } },
    { asset: { ...bundle.asset, url: bundle.asset.url + '?download=1' } },
    { asset: { ...bundle.asset, size: 0 } },
    { asset: { ...bundle.asset, size: 2 * 1024 ** 3 + 1 } },
    { asset: { ...bundle.asset, sha256: '' } },
  ]) assert.throws(() => windowsPortableBundleHref({ ...bundle, ...change }, kit));
  assert.throws(() => windowsPortableBundleHref(bundle, { ...kit, kitVersion: '0.0.1' }), /published kit/);
  assert.throws(() => windowsPortableBundleHref(bundle, { ...kit, assets: { kit: { sha256: 'a'.repeat(64) } } }), /published kit/);
});

test('an older complete ZIP stays available while a newer kit-only release is published', () => {
  const next = {...kit, kitVersion:'999.0.0'};
  assert.equal(windowsPortableBundleHref(bundle, next), bundle.asset.url);
});
