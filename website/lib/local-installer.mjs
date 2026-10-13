import assert from 'node:assert/strict';
import { open, realpath, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateInstallerManifest } from './installer.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// No symlink is accepted, including dist/ or installers/. Size is bounded before reading.
export async function boundedFile(root, relative, limit) {
  const base = await realpath(root);
  let cursor = base;
  for (const part of relative.split('/')) {
    assert.ok(part && part !== '.' && part !== '..', 'Invalid local artifact path');
    cursor = resolve(cursor, part);
    assert.ok(!(await lstat(cursor)).isSymbolicLink(), 'Symlinked local artifact refused');
  }
  assert.equal(await realpath(cursor), cursor, 'Local artifact path escaped');
  const handle = await open(cursor, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= limit, 'Local artifact exceeds bounded size');
    const buffer = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < buffer.length) {
      const {bytesRead} = await handle.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    assert.equal(total, stat.size, 'Local artifact size changed');
    return buffer.subarray(0, total);
  } finally { await handle.close(); }
}
const sourcePaths = ['native-installer/macos', 'extension', 'framework', 'profile', 'setup', 'student-template', 'LICENSE', 'release/kit.json', 'release/sharing.json', 'release/START-HERE.md', 'sharing/harness/ZeroLibraryHarness.java', 'scripts/build-installers.mjs', 'scripts/installer-signing.mjs', 'scripts/installer-payload.mjs', 'scripts/package.mjs', 'scripts/release-review.mjs', 'scripts/kit.mjs', 'scripts/release.mjs', 'scripts/prepare-starter.mjs', 'package-lock.json'];
export function gitRead(root, args) {
  const result = spawnSync('git', args, {cwd:root, encoding:'utf8', timeout:10000, maxBuffer:1024 * 1024});
  assert.equal(result.status, 0, result.error?.message || result.stderr || 'Git source check failed');
  return result.stdout.trim();
}
export function verifyInstallerSource(root, revision, {clean = false} = {}) {
  assert.match(revision, /^[a-f0-9]{40}$/);
  gitRead(root, ['cat-file', '-e', `${revision}^{commit}`]);
  const preparationRevision = gitRead(root, ['rev-parse', 'HEAD']);
  if (clean) assert.equal(gitRead(root, ['status', '--porcelain', '--untracked-files=all']), '', 'Preparation requires clean committed source');
  assert.equal(gitRead(root, ['diff', '--name-only', revision, '--', ...sourcePaths]), '', 'Native/runtime/packaged source differs from installer build');
  // Diff does not include untracked files; refuse new source in protected trees too.
  assert.equal(gitRead(root, ['ls-files', '--others', '--exclude-standard', '--', ...sourcePaths]), '', 'Untracked native/runtime/packaged source');
  return {builtSourceRevision:revision, preparationRevision, sourceEquivalent:true, comparedPaths:sourcePaths};
}
export async function verifiedLocalInstaller(root, manifest, kitManifest, {checkSource = true} = {}) {
  validateInstallerManifest(manifest, kitManifest);
  assert.ok(manifest, 'No Mac installer manifest');
  assert.equal(manifest.kitVersion, kitManifest.kitVersion, 'Local installer must match the current kit version');
  const receiptBytes = await boundedFile(root, 'dist/installers/build-macos-signed.json', 128 * 1024);
  const receipt = JSON.parse(receiptBytes.toString());
  assert.equal(receipt.schema, 1); assert.equal(receipt.kitVersion, manifest.kitVersion);
  assert.equal(receipt.sourceRevision, manifest.sourceRevision, 'Installer source receipt drift');
  assert.equal(receipt.sourceDirty, false, 'Installer build source was dirty');
  assert.deepEqual(receipt.kit, manifest.kit, 'Installer embedded kit receipt drift');
  assert.equal(receipt.artifacts?.length, 1, 'Expected exactly one signed Mac artifact');
  const asset = receipt.artifacts[0];
  for (const key of ['filename', 'size', 'sha256', 'platform', 'minimumOS', 'architectures']) assert.deepEqual(asset[key], manifest.asset[key], `Installer ${key} receipt drift`);
  assert.equal(asset.developerIdSigned, true, 'Unsigned installer refused');
  assert.equal(asset.notarized, true, 'Unnotarized installer refused');
  for (const key of ['identitySha1', 'teamIdentifier']) assert.equal(asset.signing?.[key], manifest.signing[key], 'Installer signer receipt drift');
  assert.equal(asset.notarization?.submissionId, manifest.notarizationSubmissionId);
  assert.equal(asset.notarization?.status, 'Accepted'); assert.equal(asset.notarization?.stapled, true);
  assert.deepEqual(asset.notarization?.gatekeeper, {dmg:'accepted', app:'accepted'});
  const kitReceipt = JSON.parse((await boundedFile(root, 'dist/release.json', 128 * 1024)).toString());
  assert.equal(kitReceipt.kitVersion, kitManifest.kitVersion); assert.equal(kitReceipt.coreVersion, kitManifest.coreVersion);
  assert.deepEqual(kitReceipt.publication, kitManifest.publication);
  for (const key of ['filename', 'size', 'sha256']) assert.equal(kitReceipt.assets?.kit?.[key], manifest.kit[key], 'Current kit receipt drift');
  if (checkSource) verifyInstallerSource(root, manifest.sourceRevision);
  const kit = await boundedFile(root, `dist/${manifest.kit.filename}`, manifest.kit.size);
  assert.equal(kit.length, manifest.kit.size); assert.equal(hash(kit), manifest.kit.sha256, 'Embedded kit byte drift');
  const bytes = await boundedFile(root, `dist/installers/${manifest.asset.filename}`, manifest.asset.size);
  assert.equal(bytes.length, manifest.asset.size); assert.equal(hash(bytes), manifest.asset.sha256, 'Installer integrity failure');
  return {bytes, asset:manifest.asset, receipt, receiptBytes};
}
