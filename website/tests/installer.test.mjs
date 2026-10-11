import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateInstallerManifest, installerHref, landingDownloadHref, localDownloadsAllowed } from '../lib/installer.mjs';
import { verifiedLocalInstaller, boundedFile } from '../lib/local-installer.mjs';
const kit = JSON.parse(await readFile(new URL('../../release/kit.json', import.meta.url)));
const releaseInstaller = JSON.parse(await readFile(new URL('../../release/installer.json', import.meta.url)));
const authored = structuredClone(releaseInstaller);
authored.publication.status = 'local';
delete authored.asset.url;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zero-native-download-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  await mkdir(join(root, 'dist/installers'), {recursive:true});
  const manifest = structuredClone(authored), bytes = Buffer.from('test signed DMG'), kitBytes = Buffer.from('test kit');
  Object.assign(manifest.asset, {size:bytes.length, sha256:hash(bytes)});
  Object.assign(manifest.kit, {size:kitBytes.length, sha256:hash(kitBytes)});
  const receipt = {schema:1, kitVersion:kit.kitVersion, sourceRevision:manifest.sourceRevision, sourceDirty:false, kit:manifest.kit, artifacts:[{...manifest.asset, developerIdSigned:true, notarized:true, signing:manifest.signing, notarization:{submissionId:manifest.notarizationSubmissionId, status:'Accepted', stapled:true, gatekeeper:{dmg:'accepted',app:'accepted'}}}]};
  await writeFile(join(root, 'dist/installers', manifest.asset.filename), bytes);
  await writeFile(join(root, 'dist', manifest.kit.filename), kitBytes);
  await writeFile(join(root, 'dist/release.json'), JSON.stringify({...kit, assets:{kit:manifest.kit}}));
  const save = () => writeFile(join(root, 'dist/installers/build-macos-signed.json'), JSON.stringify(receipt));
  await save();
  return {root, manifest, receipt, save, bytes};
}
test('strict independent manifest, versioned publication and platform choice', () => {
  validateInstallerManifest(releaseInstaller, kit);
  validateInstallerManifest(authored, kit);
  assert.equal(validateInstallerManifest(null, kit), null);
  assert.equal(installerHref(authored), null);
  assert.equal(installerHref(authored, true), '/download/installer');
  assert.equal(landingDownloadHref('/download/kit', authored, true), '/learn#downloads');
  assert.equal(landingDownloadHref('published-kit-url', null), 'published-kit-url');
  const published = structuredClone(authored); published.publication.status='published';
  assert.throws(() => validateInstallerManifest(published, kit), /versioned/);
  published.asset.url=`https://github.com/codepetca/zero/releases/download/setup-v${kit.kitVersion}/${published.asset.filename}`;
  validateInstallerManifest(published, kit); assert.equal(installerHref(published), published.asset.url);
  for (const mutate of [m => m.kitVersion='0.5.7', m => m.asset.filename='evil.exe', m => m.asset.size=129*1024*1024, m => m.publication.tag='v0.5.6', m => m.asset.url='https://example.com']) {
    const bad=structuredClone(authored); mutate(bad); assert.throws(() => validateInstallerManifest(bad, kit));
  }
});
test('local flag is explicitly disabled on hosted deployment', () => {
  assert.equal(localDownloadsAllowed({ZERO_LOCAL_DOWNLOADS:'1'}), true);
  for (const env of [{}, {ZERO_LOCAL_DOWNLOADS:'0'}, {ZERO_LOCAL_DOWNLOADS:'1', VERCEL:'1'}]) assert.equal(localDownloadsAllowed(env), false);
});
test('verified native bytes require signed clean accepted stapled provenance and exact kit', async t => {
  const f=await fixture(t), read=() => verifiedLocalInstaller(f.root, f.manifest, kit, {checkSource:false});
  assert.deepEqual((await read()).bytes, f.bytes);
  for (const mutate of [r => r.sourceDirty=true, r => r.sourceRevision='b'.repeat(40), r => r.artifacts[0].developerIdSigned=false, r => r.artifacts[0].notarized=false, r => r.artifacts[0].notarization.stapled=false, r => r.artifacts[0].notarization.status='Rejected', r => r.artifacts[0].notarization.gatekeeper.app='rejected', r => r.kit={...r.kit, sha256:'b'.repeat(64)}]) {
    const original=structuredClone(f.receipt); mutate(f.receipt); await f.save(); await assert.rejects(read());
    Object.keys(f.receipt).forEach(k => delete f.receipt[k]); Object.assign(f.receipt, original);
  }
  await f.save(); await writeFile(join(f.root, 'dist', f.manifest.kit.filename), 'tampered'); await assert.rejects(read());
});
test('refuses tampered DMG, oversized files and symlink escapes before serving', async t => {
  const f=await fixture(t), file=join(f.root,'dist/installers',f.manifest.asset.filename), read=() => verifiedLocalInstaller(f.root, f.manifest, kit, {checkSource:false});
  await writeFile(file, Buffer.alloc(f.bytes.length, 1)); await assert.rejects(read(), /integrity/);
  await writeFile(file, Buffer.alloc(f.bytes.length+1)); await assert.rejects(read(), /bounded/);
  await rm(file); await writeFile(join(f.root,'outside.dmg'), f.bytes); await symlink(join(f.root,'outside.dmg'), file); await assert.rejects(read(), /Symlink/);
  await assert.rejects(boundedFile(f.root,'../outside.dmg',100), /Invalid/);
});
