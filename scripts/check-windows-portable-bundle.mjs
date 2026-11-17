import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, open, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {windowsPortableBundleHref} from '../website/lib/windows-portable-bundle.mjs';
import {releaseDownloads, releaseDownloadFiles, verifiedDownload} from './check-windows-portable-release.mjs';

export function bundleForPromotion(before, after) {
  const full = after.kit && after.mac?.publication?.status === 'published' &&
    after.mac.kitVersion === after.kit.kitVersion;
  const changed = !isDeepStrictEqual(before.bundle, after.bundle);
  const completed = full && (!isDeepStrictEqual(before.kit, after.kit) || !isDeepStrictEqual(before.mac, after.mac));
  if (!changed && !completed) return null;
  assert.ok(after.bundle, 'A full release requires the matching complete Portable ZIP as well as the small ZIP');
  assert.equal(after.bundle.kitVersion, after.kit.kitVersion, 'A full release requires the matching complete Portable version');
  windowsPortableBundleHref(after.bundle, after.kit);
  if (before.bundle?.kitVersion === after.bundle.kitVersion) {
    assert.deepEqual(after.bundle, before.bundle, 'Published complete Portable metadata is immutable');
  }
  return {bundle:after.bundle, kit:after.kit.assets.kit};
}

export async function downloadBundle(asset, directory, request = fetch) {
  const response = await request(asset.url, {signal:AbortSignal.timeout(300000)});
  assert.equal(response.status, 200, 'Complete Portable download failed');
  const filename = path.join(directory, 'complete.zip');
  const handle = await open(filename, 'wx');
  let size = 0;
  const hash = createHash('sha256');
  try {
    for await (const bytes of response.body) {
      size += bytes.length;
      assert.ok(size <= asset.size, 'Complete Portable ZIP is oversized');
      hash.update(bytes);
      await handle.writeFile(bytes);
    }
  } finally { await handle.close(); }
  assert.equal(size, asset.size, 'Complete Portable download size drift');
  assert.equal(hash.digest('hex'), asset.sha256, 'Complete Portable download checksum drift');
  return filename;
}

export function verifyBundleArchive(filename, bundle, kitBytes) {
  const extract = name => execFileSync('unzip', ['-p', filename, 'Zero Portable/' + name],
    {maxBuffer:32 * 1024 * 1024});
  const build = JSON.parse(extract('BUILD.json'));
  assert.equal(build.toolDistribution, 'bundled', 'Expected the complete Portable ZIP');
  assert.equal(build.sourceDirty, false, 'Complete Portable must have clean build source');
  for (const key of ['kitVersion', 'sourceRevision', 'kitSourceRevision', 'kitSha256']) {
    assert.equal(build[key], bundle[key], 'Complete Portable build drift for ' + key);
  }
  const launcher = extract('Zero.exe');
  assert.equal(createHash('sha256').update(launcher).digest('hex'), build.launcherSha256, 'Complete launcher checksum drift');
  assert.ok(launcher.includes(kitBytes), 'Complete Portable must embed the exact published kit');
  for (const kind of ['vscodium', 'jdk', 'node', 'git']) {
    const pin = build.runtimes[kind];
    assert.match(pin?.sha256 ?? '', /^[a-f0-9]{64}$/, 'Complete Portable runtime pin missing');
    assert.equal(extract(`tools/${kind}/.zero-asset.sha256`).toString().trim(), pin.sha256, 'Complete runtime marker drift');
  }
  const editor = JSON.parse(extract('tools/vscodium/resources/app/package.json'));
  assert.equal(editor.version, build.runtimes.vscodium.version, 'Bundled editor version drift');
  const editorHeader = execFileSync('unzip', ['-p', filename, 'Zero Portable/tools/vscodium/VSCodium.exe'],
    {maxBuffer:256 * 1024 * 1024});
  assert.equal(editorHeader.subarray(0, 2).toString(), 'MZ', 'Bundled Windows editor is missing');
  return build;
}

export async function verifyPublicBundle({bundle, kit}, request = fetch) {
  windowsPortableBundleHref(bundle);
  const directory = await mkdtemp(path.join(tmpdir(), 'zero-complete-check-'));
  try {
    const [filename, kitBytes] = await Promise.all([
      downloadBundle(bundle.asset, directory, request), verifiedDownload(kit, request),
    ]);
    verifyBundleArchive(filename, bundle, kitBytes);
  } finally { await rm(directory, {recursive:true, force:true}); }
}

async function main() {
  const [base, ...extra] = process.argv.slice(2);
  assert.ok(/^[a-f0-9]{40}$/.test(base ?? '') && !extra.length, 'Select the exact promotion base SHA');
  const files = [...releaseDownloadFiles, 'windows-portable-bundle'];
  const paths = [...new Set(files)].map(name => `release/${name}.json`);
  const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', ...paths], {encoding:'utf8'}).trim();
  if (!changed) return;
  const available = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', ...paths], {encoding:'utf8'}).trim().split('\n'));
  const before = releaseDownloads(name => available.has(`release/${name}.json`) ?
    JSON.parse(execFileSync('git', ['show', `${base}:release/${name}.json`], {encoding:'utf8'})) : null);
  const map = new Map(await Promise.all(files.map(async name => {
    try { return [name, JSON.parse(await readFile(`release/${name}.json`, 'utf8'))]; }
    catch (error) { if (error.code === 'ENOENT') return [name, null]; throw error; }
  })));
  const after = releaseDownloads(name => map.get(name));
  const promotion = bundleForPromotion(before, after);
  if (!promotion) return;
  const {bundle} = promotion;
  for (const [tag, expected] of [[bundle.publication.tag, bundle.sourceRevision],
    [after.kit.publication.tag, bundle.kitSourceRevision]]) {
    const ref = `refs/tags/${tag}`;
    const references = execFileSync('git', ['ls-remote', 'https://github.com/codepetca/zero.git', ref, `${ref}^{}`],
      {encoding:'utf8', timeout:30000}).trim().split('\n').map(line => line.split('\t'));
    const actual = references.find(([, name]) => name === `${ref}^{}`)?.[0] ??
      references.find(([, name]) => name === ref)?.[0];
    assert.equal(actual, expected, 'Complete Portable public source tag drift');
  }
  await verifyPublicBundle(promotion);
  console.log('Verified the complete Portable download and exact embedded public kit.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
