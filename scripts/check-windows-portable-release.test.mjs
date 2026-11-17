import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {zipSync} from 'fflate';
import {portableForPromotion, verifyPublicPortable} from './check-windows-portable-release.mjs';

const kit = JSON.parse(readFileSync(new URL('../release/published-kit.json', import.meta.url)));
const {kitVersion: version} = kit;
const platform = {kitVersion:version, publication:{status:'published'}};
const tag = `windows-portable-pilot-v${version}`;
const filename = `Zero-${version}-windows-portable-pilot-staging-x64.zip`;
const portable = {
  kitVersion:version, sourceRevision:'a'.repeat(40), kitSha256:kit.assets.kit.sha256,
  publication:{status:'published', tag},
  asset:{filename, size:100, sha256:'b'.repeat(64),
    url:`https://github.com/codepetca/zero/releases/download/${tag}/${filename}`},
};
const full = {kit, mac:platform, windows:platform, portable};

test('a full release cannot be promoted without the matching ZIP, in any promotion order', () => {
  for (const last of ['kit', 'mac', 'windows']) {
    const before = {...full, [last]:null};
    for (const invalid of [null, {...portable, kitVersion:'0.0.1'}]) {
      assert.throws(() => portableForPromotion(before, {...full, portable:invalid}), /publish the verified windows portable/i);
    }
    assert.throws(() => portableForPromotion(before, {...full, portable:{...portable, kitSha256:'c'.repeat(64)}}), /exact published kit/);
    assert.deepEqual(portableForPromotion(before, full), {portable, kit:kit.assets.kit});
  }
});

test('new local candidates and kit-only promotions can retain the previous Portable ZIP', () => {
  const before = {...full, kit:null, mac:null, windows:null};
  const kitOnly = {...before, kit};
  assert.equal(portableForPromotion(before, kitOnly), null);
  assert.equal(portableForPromotion(full, full), null);
  assert.throws(() => portableForPromotion(full, {...full, portable:null}), /publish the verified windows portable/i);
});

test('the public staging ZIP must contain a launcher embedding the exact downloaded kit', async () => {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const kitBytes = Buffer.from('fixture published kit bytes');
  const kitAsset = {...kit.assets.kit, size:kitBytes.length, sha256:digest(kitBytes)};
  for (const embedded of [kitBytes, Buffer.from('a different same-version kit')]) {
    const launcher = Buffer.concat([Buffer.from('fixture executable'), embedded]);
    const build = {
      kitVersion:version, sourceRevision:portable.sourceRevision, sourceDirty:false,
      toolDistribution:'vendor-downloads', kitSha256:kitAsset.sha256, launcherSha256:digest(launcher),
    };
    const zip = zipSync({
      'Zero Portable/Zero.exe': launcher,
      'Zero Portable/BUILD.json': Buffer.from(JSON.stringify(build)),
    });
    const measured = {...portable, kitSha256:kitAsset.sha256,
      asset:{...portable.asset, size:zip.length, sha256:digest(zip)}};
    const request = async url => new Response(url === kitAsset.url ? kitBytes : zip);
    const check = verifyPublicPortable({portable:measured, kit:kitAsset}, request);
    if (embedded === kitBytes) await check;
    else await assert.rejects(check, /does not contain the exact published kit/);
  }
});
