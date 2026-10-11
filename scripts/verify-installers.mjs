import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, readdirSync, lstatSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {root, releaseDefinition} from './release.mjs';
import {kitEntries} from './installer-payload.mjs';
import {installerOptions, verifyMacSignature} from './installer-signing.mjs';

const {platform, signed} = installerOptions(process.argv.slice(2), 'verify');
const release = releaseDefinition(), directory = path.join(root, 'dist/installers');
const receipt = JSON.parse(readFileSync(path.join(directory, `build-${platform}${signed ? '-signed' : ''}.json`), 'utf8'));
const kit = readFileSync(path.join(root, 'dist', release.assets.kit.filename));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(receipt.kitVersion, release.kitVersion);
assert.equal(receipt.kit.sha256, sha256(kit));
assert.equal(receipt.kit.size, kit.length);
assert.equal(receipt.kit.filename, release.assets.kit.filename);
assert.deepEqual(receipt.artifacts.map(asset => asset.platform).sort(), (platform === 'all' ? ['macos', 'windows'] : [platform]).sort());
const entries = kitEntries(kit);
function command(command, args) {
  const result = spawnSync(command, args, {encoding:'utf8', timeout:180000});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return {stdout:result.stdout || '', stderr:result.stderr || ''};
}
function run(executable, args) { return command(executable, args).stdout; }
for (const asset of receipt.artifacts) {
  const suffix = asset.platform === 'windows' ? 'windows-development.exe' : `macos${signed ? '' : '-development'}.dmg`;
  assert.equal(asset.filename, `Zero-Setup-${release.kitVersion}-${suffix}`);
  const file = path.join(directory, asset.filename), bytes = readFileSync(file);
  assert.equal(bytes.length, asset.size); assert.equal(sha256(bytes), asset.sha256);
  if (asset.platform === 'windows') {
    assert.equal(bytes.readUInt16LE(0), 0x5a4d);
    const pe = bytes.readUInt32LE(0x3c);
    assert.equal(bytes.readUInt32LE(pe), 0x00004550);
    // PE32 AnyCPU managed assembly, rather than an accidentally host-native binary.
    assert.equal(bytes.readUInt16LE(pe + 4), 0x14c);
    assert.equal(bytes.readUInt16LE(pe + 24), 0x10b);
    assert.notEqual(bytes.readUInt32LE(pe + 24 + 96 + 14 * 8), 0, 'CLR header');
    assert.ok(bytes.indexOf(kit) >= 0, 'Exact embedded measured ZIP');
    assert.equal(asset.authenticodeSigned, false);
    continue;
  }
  assert.equal(process.platform, 'darwin', 'DMG payload verification requires macOS');
  run('/usr/bin/hdiutil', ['verify', file]);
  const mount = mkdtempSync(path.join(root, '.verification/native-installer/mount-'));
  let attached = false;
  try {
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, file]); attached = true;
    const contents = path.join(mount, 'Zero Setup.app/Contents');
    const plist = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(contents, 'Info.plist')]));
    assert.equal(plist.CFBundleShortVersionString, release.kitVersion);
    assert.equal(plist.CFBundleExecutable, 'ZeroSetup');
    assert.equal(plist.CFBundleIdentifier, signed ? 'ca.codepet.zero.setup' : 'ca.codepet.zero.setup.development');
    assert.equal(plist.ZeroDevelopmentBuild ?? true, !signed, 'Signed app requires explicit non-development marker');
    assert.deepEqual(asset.architectures, ['arm64', 'x86_64']);
    assert.equal(asset.minimumOS, '12.0');
    assert.equal(plist.LSMinimumSystemVersion, '12.0');
    assert.ok(lstatSync(path.join(contents, 'MacOS/ZeroSetup')).mode & 0o111, 'Native app launcher must be executable');
    for (const arch of ['arm64', 'x86_64']) run('/usr/bin/lipo', [path.join(contents, 'MacOS/ZeroSetup'), '-verify_arch', arch]);
    const payload = path.join(contents, 'Resources/kit'), found = [];
    function walk(folder, prefix = '') {
      for (const name of readdirSync(folder)) {
        const relative = prefix ? `${prefix}/${name}` : name, filename = path.join(folder, name), stat = lstatSync(filename);
        assert.ok(!stat.isSymbolicLink(), relative);
        if (stat.isDirectory()) walk(filename, relative); else {assert.ok(stat.isFile(), relative); found.push(relative);}
      }
    }
    walk(payload);
    assert.deepEqual(found.sort(), entries.map(entry => entry.relative).sort());
    for (const entry of entries) {
      const filename = path.join(payload, entry.relative);
      assert.equal(sha256(readFileSync(filename)), sha256(entry.bytes), entry.relative);
      assert.equal(lstatSync(filename).mode & 0o777, entry.mode, entry.relative);
    }
    assert.equal(asset.developerIdSigned, signed);
    if (signed) {
      assert.equal(typeof asset.notarized, 'boolean');
      assert.match(asset.signing?.identitySha1 || '', /^[A-F0-9]{40}$/);
      assert.match(asset.signing?.teamIdentifier || '', /^[A-Z0-9]{10}$/);
      const scratch = mkdtempSync(path.join(root, '.verification/native-installer/signature-'));
      try {
        const options = {identity:asset.signing.identitySha1, team:asset.signing.teamIdentifier};
        const app = path.join(mount, 'Zero Setup.app');
        const appSignature = verifyMacSignature(command, app, path.join(scratch, 'app'), {...options, app:true});
        const dmgSignature = verifyMacSignature(command, file, path.join(scratch, 'dmg'), options);
        assert.deepEqual(appSignature, asset.signing.app);
        assert.deepEqual(dmgSignature, asset.signing.dmg);
        assert.equal(asset.signing.authority, appSignature.architectures[0].authority);
        assert.equal(asset.signing.authority, dmgSignature.authority);
        if (asset.notarized) {
          run('/usr/bin/xcrun', ['stapler', 'validate', file]);
          run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', file]);
          run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
        }
      } finally { rmSync(scratch, {recursive:true, force:true}); }
    } else assert.equal(asset.notarized, false);
  } finally {
    if (attached) run('/usr/bin/hdiutil', ['detach', mount]);
    rmSync(mount, {recursive:true, force:true});
  }
}
console.log(`Native artifact checksums and selected platform payload/permission checks passed${signed ? '; Developer ID app/DMG signatures verified' : ''}. No installer or student tool was executed.`);
