import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from './release.mjs';
import {validateManifest} from '../website/lib/contracts.mjs';

const kit = validateManifest(JSON.parse(await readFile(path.join(root, 'release/kit.json'), 'utf8')));
assert.equal(kit.publication.status, 'published', 'Use package and verify:kit for an unpublished source kit');
await mkdir(path.join(root, 'dist'), {recursive:true});
for (const key of ['kit', 'starter', 'extension']) {
  const asset = kit.assets[key];
  const response = await fetch(asset.url, {signal:AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, 'Published kit download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.size, 'Published kit size drift');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, 'Published kit checksum drift');
  await writeFile(path.join(root, 'dist', asset.filename), bytes, {flag:'wx'});
}
await writeFile(path.join(root, 'dist/release.json'), JSON.stringify(kit, null, 2) + '\n', {flag:'wx'});
console.log('Fetched the exact published kit for Portable packaging.');
