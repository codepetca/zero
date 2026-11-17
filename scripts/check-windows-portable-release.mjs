import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {unzipSync} from 'fflate';
import {availableKitRelease, validateManifest} from '../website/lib/contracts.mjs';
import {availableInstaller} from '../website/lib/published-installer.mjs';
import {windowsPortablePilotHref} from '../website/lib/windows-portable-pilot.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const releaseDownloadFiles = ['kit', 'published-kit', 'installer', 'published-installer', 'windows-portable-pilot', 'windows-portable-bundle'];

export function releaseDownloads(read) {
  return {
    kit: availableKitRelease(read('kit'), read('published-kit')),
    mac: availableInstaller(read('installer'), read('published-installer')),
    portable: read('windows-portable-pilot'),
    bundle: read('windows-portable-bundle'),
  };
}

export function portableForPromotion(before, after) {
  const {kit, mac, portable} = after;
  const portableChanged = !isDeepStrictEqual(before.portable, portable);
  // The matching kit and Mac setup constitute a website release. Microsoft
  // Store certification and the separate Windows preview can land later.
  const full = kit && mac?.publication?.status === 'published' && mac.kitVersion === kit.kitVersion;
  const fullChanged = full && (!isDeepStrictEqual(before.kit, kit) || !isDeepStrictEqual(before.mac, mac));
  if (!portableChanged && !fullChanged) return null;

  assert.equal(kit?.publication?.status, 'published', 'Portable promotion requires the public Zero kit');
  validateManifest(kit);
  const version = kit.kitVersion;
  assert.ok(portable && portable.kitVersion === version && windowsPortablePilotHref(portable),
    `Publish the verified Windows Portable ${version} staging ZIP and include its manifest in this promotion.`);
  if (before.portable?.publication?.status === 'published' && before.portable.kitVersion === version) {
    assert.deepEqual(portable.asset, before.portable.asset, 'Published Portable assets are immutable');
    assert.equal(portable.sourceRevision, before.portable.sourceRevision, 'Published Portable source is immutable');
  }
  assert.equal(portable.kitSha256, kit.assets.kit.sha256, 'Portable must embed the exact published kit');
  return {portable, kit: kit.assets.kit};
}

export async function verifiedDownload(asset, request) {
  const response = await request(asset.url, {signal:AbortSignal.timeout(30000)});
  assert.equal(response.status, 200, `Public download failed for ${asset.filename}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.size, `Public download size drift for ${asset.filename}`);
  assert.equal(digest(bytes), asset.sha256, `Public download checksum drift for ${asset.filename}`);
  return bytes;
}

export async function verifyPublicPortable(promotion, request = fetch) {
  const {portable, kit} = promotion;
  const [zip, kitBytes] = await Promise.all([
    verifiedDownload(portable.asset, request), verifiedDownload(kit, request),
  ]);
  verifyPortableArchive(portable, zip, kitBytes);
}

export function verifyPortableArchive(portable, zip, kitBytes) {
  const contents = unzipSync(zip, {filter: entry =>
    entry.name.startsWith('Zero Portable/') && ['BUILD.json', 'Zero.exe'].includes(entry.name.slice('Zero Portable/'.length)) &&
    entry.originalSize <= 32 * 1024 * 1024});
  const build = JSON.parse(Buffer.from(contents['Zero Portable/BUILD.json']).toString('utf8'));
  const launcher = Buffer.from(contents['Zero Portable/Zero.exe']);
  assert.equal(build.kitVersion, portable.kitVersion, 'Portable build version drift');
  assert.equal(build.sourceRevision, portable.sourceRevision, 'Portable build source drift');
  assert.equal(build.sourceDirty, false, 'Portable build needs clean source');
  assert.equal(build.toolDistribution, 'vendor-downloads', 'Expected the public staging ZIP');
  assert.equal(build.kitSha256, portable.kitSha256, 'Portable build kit checksum drift');
  assert.equal(digest(launcher), build.launcherSha256, 'Portable launcher checksum drift');
  assert.ok(launcher.includes(kitBytes), 'Portable launcher does not contain the exact published kit');
}

async function main() {
  const [base, ...extra] = process.argv.slice(2);
  assert.ok(/^[a-f0-9]{40}$/.test(base ?? '') && !extra.length,
    'Usage: node scripts/check-windows-portable-release.mjs BASE_SHA');
  const paths = releaseDownloadFiles.map(file => `release/${file}.json`);
  const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', ...paths], {encoding:'utf8'}).trim();
  if (!changed) return;
  const tracked = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', ...paths], {encoding:'utf8'}).trim().split('\n'));
  const before = releaseDownloads(name => {
    const file = `release/${name}.json`;
    return tracked.has(file) ? JSON.parse(execFileSync('git', ['show', `${base}:${file}`], {encoding:'utf8'})) : null;
  });
  const after = releaseDownloads(name => {
    try { return JSON.parse(readFileSync(`release/${name}.json`, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  });
  const promotion = portableForPromotion(before, after);
  if (!promotion) return;
  const tags = [after.kit.publication.tag, promotion.portable.publication.tag]
    .map(tag => `refs/tags/${tag}`);
  const refs = new Map(execFileSync('git', ['ls-remote', 'https://github.com/codepetca/zero.git',
    ...tags, ...tags.map(tag => `${tag}^{}`)], {encoding:'utf8', timeout:30000}).trim()
    .split('\n').map(line => line.split('\t').reverse()));
  for (const tag of tags) {
    assert.equal(refs.get(`${tag}^{}`) ?? refs.get(tag), promotion.portable.sourceRevision,
      `Public tag ${tag} must target the prepared source commit`);
  }
  await verifyPublicPortable(promotion);
  console.log(`Public Portable ${promotion.portable.kitVersion} ZIP matches the exact published kit.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
