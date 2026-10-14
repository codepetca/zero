import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { root, releaseDefinition } from './release.mjs';
import { publicKeys, verifyReviewAssets } from './release-review.mjs';
import { validateInstallerManifest } from '../website/lib/installer.mjs';
import { boundedFile, verifiedLocalInstaller, verifyInstallerSource } from '../website/lib/local-installer.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function sealMacCandidate(output, files) {
  assert.ok(!existsSync(output), 'Candidate output already exists; never overwrite sealed bytes');
  mkdirSync(resolve(output, '..'), {recursive:true});
  // Exclusive directory creation protects even an empty existing candidate.
  mkdirSync(output);
  try {
    for (const [name, bytes] of Object.entries(files)) {
      assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Candidate filename must be flat');
      writeFileSync(join(output, name), bytes, {flag:'wx'});
    }
  } catch (error) {
    rmSync(output, {recursive:true, force:true});
    throw error;
  }
}
function verify(command, args) {
  const result = spawnSync(command, args, {cwd:root, stdio:'inherit', timeout:300000});
  assert.equal(result.status, 0, result.error?.message || `Verification failed: ${command}`);
}
export async function prepareMacRelease({output} = {}) {
  assert.equal(process.platform, 'darwin', 'Mac release preparation requires macOS; Linux CI cannot recreate notarized bytes');
  const release = releaseDefinition();
  const manifestBytes = await boundedFile(root, 'release/installer.json', 128 * 1024);
  const manifest = validateInstallerManifest(JSON.parse(manifestBytes.toString()), release);
  assert.equal(manifest.publication.status, 'local', 'Published native versions are immutable');
  const source = verifyInstallerSource(root, manifest.sourceRevision, {clean:true});
  output = resolve(output || join(root, 'dist/candidates', `mac-${release.kitVersion}-${source.preparationRevision.slice(0, 12)}`));
  assert.ok(!existsSync(output), 'Candidate output already exists; never overwrite sealed bytes');
  const native = await verifiedLocalInstaller(root, manifest, release);
  const releaseBytes = await boundedFile(root, 'dist/release.json', 128 * 1024);
  // Existing kit validation checks archives/source/modes plus extracted Maven compile.
  verify(process.execPath, [join(root, 'scripts/verify-kit.mjs')]);
  verifyReviewAssets(join(root, 'dist'), release);
  // Read-only mount, actual Developer ID signatures, staple and Gatekeeper. No GUI.
  verify(process.execPath, [join(root, 'scripts/verify-installers.mjs'), '--platform', 'macos', '--signed']);
  const files = {};
  const kitReceipt = JSON.parse(releaseBytes.toString());
  for (const key of publicKeys) {
    const asset = kitReceipt.assets[key];
    const bytes = await boundedFile(root, `dist/${asset.filename}`, asset.size);
    assert.equal(bytes.length, asset.size); assert.equal(digest(bytes), asset.sha256);
    files[asset.filename] = bytes;
  }
  // Repeat provenance and byte checks after the potentially long platform verification.
  assert.deepEqual(verifyInstallerSource(root, manifest.sourceRevision, {clean:true}), source);
  const finalNative = await verifiedLocalInstaller(root, manifest, release);
  assert.deepEqual(finalNative.bytes, native.bytes); assert.deepEqual(finalNative.receiptBytes, native.receiptBytes);
  assert.deepEqual(await boundedFile(root, 'dist/release.json', 128 * 1024), releaseBytes);
  assert.deepEqual(await boundedFile(root, 'release/installer.json', 128 * 1024), manifestBytes);
  files[manifest.asset.filename] = native.bytes;
  files['release.json'] = releaseBytes;
  files['installer.json'] = manifestBytes;
  files['build-macos-signed.json'] = native.receiptBytes;
  const receipt = {schema:1, kind:'zero-mac-release-candidate', kitVersion:release.kitVersion,
    nativeTag:manifest.publication.tag, kitTag:release.publication.tag, ...source,
    preparedAt:new Date().toISOString(), verification:{kitSourceAndArchives:true, signedPayload:true, staple:true, gatekeeper:true},
    artifacts:[...publicKeys.map(key => kitReceipt.assets[key]), manifest.asset]};
  files['candidate.json'] = JSON.stringify(receipt, null, 2) + '\n';
  files['SOURCE.txt'] = `Repository: codepetca/zero\nBuilt installer source: ${source.builtSourceRevision}\nPreparation source: ${source.preparationRevision}\nVersion: ${release.kitVersion}\nNative/runtime/packaged source equivalent: true\n`;
  files['NOTES.md'] = `Zero Setup ${release.kitVersion} for macOS 12+, Apple Silicon and Intel.\n\nSigned, notarized and stapled Mac setup embeds the complete Zero kit. Open setup, wait while Preparing Zero and its progress spinner prepare the kit, then Open Zero and Run App. Setup uses ~/Zero, prepares verified private Java and isolated editor support, and updates setup files in an existing recognized kit automatically while preserving student work. GitHub sign-in remains separate.\n\nLocal sealed candidate only. Native setup-v${release.kitVersion} publishes one DMG separately from the three-asset v${release.kitVersion} kit. Physical Windows testing is deferred; no Windows EXE is included. Fresh-machine installs, physical Intel execution and novice usability remain untested. Linux CI cannot regenerate this notarized Mac artifact.\n`;
  files['SHA256SUMS'] = Object.entries(files).map(([name, bytes]) => `${digest(bytes)}  ${name}`).join('\n') + '\n';
  sealMacCandidate(output, files);
  console.log(`Sealed existing verified bytes at ${output}. No rebuild, signing, notarization upload or publication occurred.`);
  return {output, receipt};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--output' && args[1]), 'Usage: npm run release:prepare:mac -- [--output <new-directory>]');
  await prepareMacRelease({output:args[1]});
}
