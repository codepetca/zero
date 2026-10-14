import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, readdirSync, symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {root, releaseDefinition} from './release.mjs';
import {extractKit, kitEntries} from './installer-payload.mjs';
import {buildMacIcon} from './mac-icon.mjs';
import {macArtifactIdentity} from './mac-artifact.mjs';
import {buildStyledMacDmg} from './mac-dmg-layout.mjs';
import {macInstallInstructions, macDevelopmentNotice} from './mac-volume.mjs';
import {installerOptions, installerPlist, signMacArtifact, verifyMacSignature} from './installer-signing.mjs';

const {platform, identity, signed} = installerOptions(process.argv.slice(2), 'build');
const release = releaseDefinition(), dist = path.join(root, 'dist'), output = path.join(dist, 'installers');
const receipt = JSON.parse(readFileSync(path.join(dist, 'release.json'), 'utf8'));
const kitFile = path.join(dist, release.assets.kit.filename), kit = readFileSync(kitFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (receipt.kitVersion !== release.kitVersion || receipt.assets.kit.size !== kit.length || receipt.assets.kit.sha256 !== sha256(kit)) throw new Error('Build/verify the current kit before packaging native installers');
kitEntries(kit);
mkdirSync(output, {recursive:true});
mkdirSync(path.join(root, '.verification/native-installer'), {recursive:true});
const work = mkdtempSync(path.join(root, '.verification/native-installer/build-'));
const receiptFile = path.join(output, `build-${platform}${signed ? '-signed' : ''}.json`);
rmSync(receiptFile, {force:true});
function run(command, args, timeout = 180000) {
  const result = spawnSync(command, args, {cwd:root, stdio:command === '/usr/bin/codesign' ? 'pipe' : 'inherit', encoding:'utf8', timeout, env:{...process.env, DOTNET_CLI_TELEMETRY_OPTOUT:'1', DOTNET_NOLOGO:'1'}});
  if (result.error || result.status !== 0) throw new Error(`Build failed: ${command}: ${result.error?.message || result.stderr || result.status}`);
  return {stdout:result.stdout || '', stderr:result.stderr || ''};
}
const artifacts = [];
function measure(filename, fields) {
  const bytes = readFileSync(path.join(output, filename));
  artifacts.push({filename, size:bytes.length, sha256:sha256(bytes), ...fields});
}
if (platform !== 'windows') {
  if (process.platform !== 'darwin') throw new Error('macOS DMG builds require macOS and Xcode command line tools');
  const source = path.join(root, 'native-installer/macos');
  const artifactIdentity = macArtifactIdentity(release.kitVersion, signed);
  if (artifactIdentity.legacy) throw new Error('New Zero.app packaging requires a new kit version after 0.5.12');
  const volume = path.join(work, 'volume'), app = path.join(volume, artifactIdentity.appName);
  const contents = path.join(app, 'Contents'), bin = path.join(contents, 'MacOS');
  mkdirSync(bin, {recursive:true});
  extractKit(kit, path.join(contents, 'Resources/kit'));
  const plist = readFileSync(path.join(source, 'Info.plist'), 'utf8');
  writeFileSync(path.join(contents, 'Info.plist'), installerPlist(plist, release.kitVersion, signed));
  buildMacIcon(run, root, work, path.join(contents, 'Resources/Zero.icns'));
  symlinkSync('/Applications', path.join(volume, 'Applications'));
  if (!artifactIdentity.styled) writeFileSync(path.join(volume, 'INSTALL.txt'), macInstallInstructions + (signed ? '' : macDevelopmentNotice));
  const binaries = [];
  for (const arch of ['arm64', 'x86_64']) {
    const file = path.join(work, `ZeroSetup-${arch}`);
    run('/usr/bin/xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macosx12.0`, '-framework', 'AppKit', '-framework', 'Foundation', ...['SetupCore.swift', 'MacRuntime.swift', 'SetupWindow.swift', 'main.swift'].map(name => path.join(source, name)), '-o', file]);
    binaries.push(file);
  }
  run('/usr/bin/lipo', ['-create', ...binaries, '-output', path.join(bin, 'ZeroSetup')]);
  for (const arch of ['arm64', 'x86_64']) run('/usr/bin/lipo', [path.join(bin, 'ZeroSetup'), '-verify_arch', arch]);
  let appSignature;
  if (signed) {
    signMacArtifact(run, app, identity, true);
    appSignature = verifyMacSignature(run, app, path.join(work, 'app-cert'), {app:true, identity});
  }
  const filename = artifactIdentity.filename, staged = path.join(work, filename);
  if (artifactIdentity.styled) buildStyledMacDmg(run, volume, work, staged, artifactIdentity.volumeName);
  else run('/usr/bin/hdiutil', ['create', '-srcfolder', volume, '-volname', 'Zero', '-format', 'UDZO', staged]);
  run('/usr/bin/hdiutil', ['verify', staged]);
  let signing;
  if (signed) {
    signMacArtifact(run, staged, identity, false);
    const first = appSignature.architectures[0];
    const dmg = verifyMacSignature(run, staged, path.join(work, 'dmg-cert'), {identity, team:first.teamIdentifier});
    signing = {identitySha1:first.identitySha1, teamIdentifier:first.teamIdentifier, authority:first.authority, app:appSignature, dmg};
  }
  copyFileSync(staged, path.join(output, filename));
  measure(filename, {platform:'macos', architectures:['arm64', 'x86_64'], minimumOS:'12.0', developerIdSigned:signed, notarized:false, ...(signing ? {signing} : {})});
}
if (platform !== 'macos') {
  const project = path.join(root, 'native-installer/windows/ZeroSetup.csproj');
  const published = path.join(work, 'windows');
  run('dotnet', ['publish', project, '-c', 'Release', '-o', published, `-p:ZeroKitZip=${kitFile}`, `-p:Version=${release.kitVersion}`, `-p:AssemblyVersion=${release.kitVersion}.0`, `-p:BaseIntermediateOutputPath=${path.join(work, 'obj')}/`, `-p:BaseOutputPath=${path.join(work, 'bin')}/`, `-p:RestorePackagesPath=${path.join(root, '.verification/native-installer/nuget')}`, '-p:NuGetAudit=false'], 240000);
  const executable = path.join(published, 'ZeroSetup.exe'), bytes = readFileSync(executable);
  if (bytes.readUInt16LE(0) !== 0x5a4d || bytes.readUInt32LE(bytes.readUInt32LE(0x3c)) !== 0x00004550 || bytes.indexOf(kit) < 0) throw new Error('Windows PE executable must embed exact measured kit');
  const dependencies = readdirSync(published).filter(name => name.endsWith('.dll'));
  if (dependencies.length) throw new Error(`Unexpected Windows runtime dependencies: ${dependencies.join(', ')}`);
  const filename = `Zero-Setup-${release.kitVersion}-windows-development.exe`;
  copyFileSync(executable, path.join(output, filename));
  measure(filename, {platform:'windows', architectures:['AnyCPU'], runtime:'.NET Framework 4.8', authenticodeSigned:false, nativeWindowsTested:false});
}
const git = spawnSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'});
const dirty = spawnSync('git', ['status', '--porcelain'], {cwd:root, encoding:'utf8'});
writeFileSync(receiptFile, JSON.stringify({schema:1, kitVersion:release.kitVersion, sourceRevision:git.stdout.trim(), sourceDirty:!!dirty.stdout.trim(), kit:{filename:release.assets.kit.filename, size:kit.length, sha256:sha256(kit)}, builtAt:new Date().toISOString(), artifacts}, null, 2) + '\n');
console.log(`Built local ${signed ? 'signed Mac candidate (not notarized)' : 'development installers'}; measured receipt: ${receiptFile}`);
