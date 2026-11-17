import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {bundleForPromotion, verifyBundleArchive} from './check-windows-portable-bundle.mjs';

const kit = JSON.parse(await readFile(new URL('../release/kit.json', import.meta.url)));
const bundle = JSON.parse(await readFile(new URL('../release/windows-portable-bundle.json', import.meta.url)));
const published = kit.publication.status === 'published' ? kit :
  JSON.parse(await readFile(new URL('../release/published-kit.json', import.meta.url)));
const mac = {kitVersion:published.kitVersion, publication:{status:'published'}};
const after = {kit:published, mac, bundle};
test('completing either side of a website release requires its complete ZIP', () => {
  for (const key of ['kit', 'mac']) {
    const before = {...after, [key]:null};
    assert.ok(bundleForPromotion(before, after));
    assert.throws(() => bundleForPromotion(before, {...after, bundle:null}), /complete Portable/);
    assert.throws(() => bundleForPromotion(before, {...after, bundle:{...bundle,kitVersion:'0.0.1'}}), /complete Portable version/);
    assert.throws(() => bundleForPromotion(before, {...after, bundle:{...bundle,kitSha256:'a'.repeat(64)}}), /published kit/);
  }
});
test('local preparation and unchanged publications preserve the existing complete ZIP', () => {
  assert.equal(bundleForPromotion(after, after), null);
  assert.equal(bundleForPromotion({...after, mac:null, kit:null}, {...after, mac:null}), null);
  assert.throws(() => bundleForPromotion(after, {...after, bundle:{...bundle,asset:{...bundle.asset,size:1}}}), /immutable/);
});
