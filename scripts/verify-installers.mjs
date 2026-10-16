import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, readdirSync, lstatSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {root, releaseDefinition} from './release.mjs';
import {kitEntries} from './installer-payload.mjs';
import {unzipSync} from 'fflate';
import {VELOPACK_VERSION} from './windows-updater.mjs';
import {macArtifactIdentity} from './mac-artifact.mjs';
import {verifyMacVolume, verifyMacPlist} from './mac-volume.mjs';
import {readMacUpdaterConfig, updaterEnabledForVersion, acquireSparkle, verifySparkleFramework, updaterReceipt, verifyUpdaterAppLayout} from './mac-updater.mjs';
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
assert.deepEqual([...new Set(receipt.artifacts.map(asset => asset.platform))].sort(), (platform === 'all' ? ['macos', 'windows'] : [platform]).sort());
const entries = kitEntries(kit);
function command(command, args) {
  const result = spawnSync(command, args, {encoding:'utf8', timeout:180000});
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return {stdout:result.stdout || '', stderr:result.stderr || ''};
}
function run(executable, args) { return command(executable, args).stdout; }
for (const asset of receipt.artifacts) {
  const suffix = asset.platform === 'windows' ? 'windows-development.exe' : `macos${signed ? '' : '-development'}.dmg`;
  const artifactIdentity = macArtifactIdentity(release.kitVersion, signed);
  assert.equal(asset.filename, asset.platform === 'windows' ? (asset.kind === 'update-package' ? `Zero-${release.kitVersion}-full.nupkg` : `Zero-Setup-${release.kitVersion}-${suffix}`) : artifactIdentity.filename);
  const file = path.join(directory, asset.filename), bytes = readFileSync(file);
  assert.equal(bytes.length, asset.size); assert.equal(sha256(bytes), asset.sha256);
  if (asset.platform === 'windows') {
    assert.equal(asset.packageId, 'Zero');
    assert.equal(asset.mainExe, 'Zero.exe');
    assert.equal(asset.velopackVersion, VELOPACK_VERSION);
    assert.equal(asset.hookVerified, true);
    assert.equal(asset.updaterEnabled, false, 'Development builds cannot use production updating');
    assert.equal(asset.authenticodeSigned, false);
    const packageAsset = receipt.artifacts.find(item => item.platform === 'windows' && item.kind === 'update-package');
    assert.ok(packageAsset, 'Windows build requires its full update package');
    const packageBytes = readFileSync(path.join(directory, packageAsset.filename));
    assert.equal(sha256(packageBytes), packageAsset.sha256);
    const contents = unzipSync(packageBytes);
    const executable = Buffer.from(contents['lib/app/Zero.exe'] || []);
    assert.ok(executable.indexOf(kit) >= 0, 'Exact embedded measured ZIP in launcher package');
    assert.ok(contents['lib/app/Velopack.dll'] && contents['lib/app/Newtonsoft.Json.dll'], 'Pinned updater dependencies packaged');
    const spec = Object.keys(contents).filter(name => name.endsWith('.nuspec'));
    assert.equal(spec.length, 1);
    const xml = Buffer.from(contents[spec[0]]).toString('utf8');
    for (const [name,value] of Object.entries({id:'Zero',version:release.kitVersion,mainExe:'Zero.exe',channel:'win',shortcutLocations:'StartMenuRoot',osMinVersion:'10.0.19041',rid:'win-x64'}))
      assert.ok(xml.includes(`<${name}>${value}</${name}>`), `Windows manifest ${name}`);
    if (asset.kind === 'update-package') continue;
    assert.equal(bytes.readUInt16LE(0), 0x5a4d);
    const pe = bytes.readUInt32LE(0x3c);
    assert.equal(bytes.readUInt32LE(pe), 0x00004550);
    assert.equal(bytes.readUInt16LE(pe + 4), 0x8664, 'Native x64 per-user installer');
    assert.ok(bytes.indexOf(packageBytes) >= 0, 'Setup embeds exact full update package');
    continue;
  }
  assert.equal(process.platform, 'darwin', 'DMG payload verification requires macOS');
  run('/usr/bin/hdiutil', ['verify', file]);
  const mount = mkdtempSync(path.join(root, '.verification/native-installer/mount-'));
  let attached = false;
  try {
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, file]); attached = true;
    const app = verifyMacVolume(mount, artifactIdentity, signed);
    const contents = path.join(app, 'Contents');
    const plist = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(contents, 'Info.plist')]));
    const updater = updaterEnabledForVersion(release.kitVersion) ? readMacUpdaterConfig(root) : undefined;
    verifyMacPlist(plist, artifactIdentity, release.kitVersion, signed, contents, updater);
    if (updater) {
      verifyUpdaterAppLayout(contents);
      const distribution = acquireSparkle(command, root, updater);
      const scratch = mkdtempSync(path.join(root, '.verification/native-installer/updater-'));
      try {
        assert.deepEqual(readFileSync(path.join(contents,'Resources/Sparkle-LICENSE.txt')),readFileSync(path.join(distribution.directory,'LICENSE')), 'Pinned Sparkle license');
        const framework = verifySparkleFramework(command,path.join(contents,'Frameworks/Sparkle.framework'),updater,{sourceFramework:distribution.framework, ...(signed ? {identity:asset.signing?.identitySha1,team:asset.signing?.teamIdentifier,scratchPrefix:path.join(scratch,'cert')} : {})});
        assert.deepEqual(asset.updater,updaterReceipt(updater,distribution,framework));
        for (const architecture of ['arm64','x86_64']) {
          const linkage = run('/usr/bin/otool',['-arch',architecture,'-L',path.join(contents,'MacOS/ZeroSetup')]);
          assert.match(linkage, /@rpath\/Sparkle\.framework\/Versions\/B\/Sparkle/);
          const loadCommands = run('/usr/bin/otool',['-arch',architecture,'-l',path.join(contents,'MacOS/ZeroSetup')]);
          assert.match(loadCommands,/path @executable_path\/\.\.\/Frameworks \(offset/);
        }
      } finally { rmSync(distribution.directory,{recursive:true,force:true}); rmSync(scratch,{recursive:true,force:true}); }
    } else assert.equal(asset.updater,undefined, 'Historical artifact has no updater contract');
    assert.deepEqual(asset.architectures, ['arm64', 'x86_64']);
    assert.equal(asset.minimumOS, '12.0');
    assert.equal(plist.LSMinimumSystemVersion, '12.0');
    assert.ok(lstatSync(path.join(contents, 'MacOS/ZeroSetup')).mode & 0o111, 'Native app launcher must be executable');
    for (const arch of ['arm64', 'x86_64']) run('/usr/bin/lipo', [path.join(contents, 'MacOS/ZeroSetup'), '-verify_arch', arch]);
    if (updater) assert.deepEqual(run('/usr/bin/lipo',['-archs',path.join(contents,'MacOS/ZeroSetup')]).trim().split(/\s+/).sort(),['arm64','x86_64']);
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
        const appSignature = verifyMacSignature(command, app, path.join(scratch, 'app'), {...options, app:true, ...(artifactIdentity.legacy ? {legacyArtifact:{kitVersion:release.kitVersion, filename:asset.filename}} : {})});
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
