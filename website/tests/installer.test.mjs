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
authored.kitVersion = kit.kitVersion;
authored.publication.status = 'local';
authored.publication.tag = `setup-v${kit.kitVersion}`;
authored.asset.filename = `Zero-Setup-${kit.kitVersion}-macos.dmg`;
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
  for (const mutate of [m => m.kitVersion='999.0.0', m => m.asset.filename='evil.exe', m => m.asset.size=129*1024*1024, m => m.publication.tag='v0.5.6', m => m.asset.url='https://example.com']) {
    const bad=structuredClone(authored); mutate(bad); assert.throws(() => validateInstallerManifest(bad, kit));
  }
});
test('local flag is explicitly disabled on hosted deployment', () => {
  assert.equal(localDownloadsAllowed({ZERO_LOCAL_DOWNLOADS:'1'}), true);
  for (const env of [{}, {ZERO_LOCAL_DOWNLOADS:'0'}, {ZERO_LOCAL_DOWNLOADS:'1', VERCEL:'1'}]) assert.equal(localDownloadsAllowed(env), false);
});
function publishedManifest(version) {
  const manifest = structuredClone(authored);
  manifest.kitVersion = version;
  manifest.publication.status = 'published';
  manifest.publication.tag = `setup-v${version}`;
  manifest.asset.filename = `Zero-Setup-${version}-macos.dmg`;
  manifest.asset.url = `https://github.com/codepetca/zero/releases/download/setup-v${version}/${manifest.asset.filename}`;
  return manifest;
}
test('published Mac fallback keeps its own exact download across a newer local kit', () => {
  const current = {...kit, kitVersion:'0.5.8'};
  const published = publishedManifest('0.5.7');
  assert.equal(validateInstallerManifest(published, current), published);
  assert.equal(installerHref(published), published.asset.url);
  assert.equal(installerHref(published, true), published.asset.url);
  assert.equal(landingDownloadHref('published-kit-url', published), '/learn#downloads');
  assert.equal(validateInstallerManifest(publishedManifest('0.5.8'), current).kitVersion, '0.5.8');
  for (const version of ['0.5.9', '0.6.0', '1.0.0']) {
    assert.throws(() => validateInstallerManifest(publishedManifest(version), current), /newer/);
  }
  // Compare numeric components, including values beyond JavaScript's safe integer range.
  validateInstallerManifest(publishedManifest('0.9.0'), {...kit, kitVersion:'0.10.0'});
  assert.throws(() => validateInstallerManifest(publishedManifest('0.10.0'), {...kit, kitVersion:'0.9.0'}), /newer/);
  assert.throws(() => validateInstallerManifest(publishedManifest('0.5.9007199254740993'), {...kit, kitVersion:'0.5.9007199254740992'}), /newer/);
  const olderLocal = structuredClone(published);
  olderLocal.publication.status = 'local';
  delete olderLocal.asset.url;
  assert.throws(() => validateInstallerManifest(olderLocal, current), /local version/);
});
test('older published metadata retains version bindings and strict integrity guards', () => {
  const current = {...kit, kitVersion:'0.5.8'};
  const valid = publishedManifest('0.5.7');
  const wrongVersion = publishedManifest('0.5.8');
  for (const mutate of [
    m => m.schema=2,
    m => m.kitVersion='0.5.7-beta',
    m => m.kitVersion=507,
    m => m.publication.status='unknown',
    m => m.publication.repository='other/zero',
    m => m.publication.tag=wrongVersion.publication.tag,
    m => m.asset.filename=wrongVersion.asset.filename,
    m => m.asset.url=wrongVersion.asset.url,
    m => m.asset.url=`https://github.com/codepetca/zero/releases/download/setup-v0.5.8/${m.asset.filename}`,
    m => m.asset.url=`https://github.com/codepetca/zero/releases/download/setup-v0.5.7/${wrongVersion.asset.filename}`,
    m => m.asset.platform='windows',
    m => m.asset.architectures=['arm64'],
    m => m.asset.minimumOS='13.0',
    m => m.asset.size=129*1024*1024,
    m => m.asset.sha256='bad',
    m => m.kit.size=0,
    m => m.kit.sha256='bad',
    m => m.kit.filename='other.zip',
    m => m.sourceRevision='bad',
    m => m.signing.identitySha1='bad',
    m => m.signing.teamIdentifier='bad',
    m => m.notarizationSubmissionId='bad',
    m => m.unexpected=true,
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => validateInstallerManifest(invalid, current));
  }
  for (const version of ['0.5', '0.5.8-beta', 508]) {
    assert.throws(() => validateInstallerManifest(valid, {...current, kitVersion:version}), /version/);
  }
  const local = structuredClone(authored);
  local.asset.url=valid.asset.url;
  assert.throws(() => validateInstallerManifest(local, kit), /local asset/);
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
test('a valid published fallback cannot be served as the newer local candidate', async t => {
  const f = await fixture(t);
  const published = structuredClone(f.manifest);
  published.publication.status = 'published';
  published.asset.url = `https://github.com/codepetca/zero/releases/download/${published.publication.tag}/${published.asset.filename}`;
  assert.deepEqual((await verifiedLocalInstaller(f.root, published, kit, {checkSource:false})).bytes, f.bytes);
  const newer = {...kit, kitVersion:kit.kitVersion.replace(/\d+$/, patch => String(BigInt(patch) + 1n))};
  assert.equal(validateInstallerManifest(published, newer), published);
  await assert.rejects(verifiedLocalInstaller(f.root, published, newer, {checkSource:false}), /Local installer must match the current kit version/);
});
test('refuses tampered DMG, oversized files and symlink escapes before serving', async t => {
  const f=await fixture(t), file=join(f.root,'dist/installers',f.manifest.asset.filename), read=() => verifiedLocalInstaller(f.root, f.manifest, kit, {checkSource:false});
  await writeFile(file, Buffer.alloc(f.bytes.length, 1)); await assert.rejects(read(), /integrity/);
  await writeFile(file, Buffer.alloc(f.bytes.length+1)); await assert.rejects(read(), /bounded/);
  await rm(file); await writeFile(join(f.root,'outside.dmg'), f.bytes); await symlink(join(f.root,'outside.dmg'), file); await assert.rejects(read(), /Symlink/);
  await assert.rejects(boundedFile(f.root,'../outside.dmg',100), /Invalid/);
});
