import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {kitEntries} from './installer-payload.mjs';
import {root, releaseDefinition} from './release.mjs';
import {buildWindowsIcon} from './windows-icon.mjs';

const [downloadDirectory, outputDirectory, ...extra] = process.argv.slice(2);
if (!downloadDirectory || !outputDirectory || extra.length)
  throw new Error('Usage: node scripts/build-windows-portable.mjs DOWNLOAD_DIRECTORY NEW_OUTPUT_DIRECTORY');

const release = releaseDefinition();
const kitFile = path.join(root, 'dist', release.assets.kit.filename);
const kit = readFileSync(kitFile);
const receipt = JSON.parse(readFileSync(path.join(root, 'dist/release.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(release.publication.status, 'local', 'Build a new local kit for the portable candidate');
assert.equal(receipt.kitVersion, release.kitVersion);
assert.equal(receipt.assets.kit.size, kit.length);
assert.equal(receipt.assets.kit.sha256, digest(kit));
const runtimeManifest = readFileSync(path.join(root, 'setup/windows-downloads.json'));
assert.ok(kitEntries(kit).some(file => file.relative === 'setup/windows-downloads.json' &&
  Buffer.from(file.bytes).equals(runtimeManifest)), 'Kit and portable runtime metadata must match');

const scratch = path.join(root, '.verification/portable');
mkdirSync(scratch, {recursive:true});
const work = mkdtempSync(path.join(scratch, 'build-'));
const icon = path.join(work, 'Zero.ico');
buildWindowsIcon(root, icon);
const stage = path.join(work, 'Zero Portable');
execFileSync('dotnet', ['publish', path.join(root, 'native-installer/windows/ZeroSetup.csproj'),
  '-c', 'Release', '-o', stage, '-p:ZeroDistribution=Portable', '-p:PlatformTarget=x64',
  '-p:RuntimeIdentifier=win-x64', '-p:RestoreLockedMode=true', '-p:NuGetAudit=false',
  `-p:Version=${release.kitVersion}`, `-p:ZeroIcon=${icon}`, `-p:ZeroKitZip=${kitFile}`,
  `-p:BaseIntermediateOutputPath=${path.join(work, 'obj')}${path.sep}`,
  `-p:BaseOutputPath=${path.join(work, 'bin')}${path.sep}`], {cwd:root, stdio:'inherit', timeout:240000});
assert.deepEqual(readdirSync(stage).sort(), ['Newtonsoft.Json.dll', 'Zero.exe', 'Zero.exe.config']);
const launcher = readFileSync(path.join(stage, 'Zero.exe'));
assert.equal(launcher.readUInt16LE(0), 0x5a4d);
const pe = launcher.readUInt32LE(0x3c);
assert.equal(launcher.readUInt32LE(pe), 0x00004550);
assert.equal(launcher.readUInt16LE(pe + 4), 0x8664);
assert.ok(launcher.includes(kit), 'The launcher must embed the exact measured Zero kit');

const pins = JSON.parse(runtimeManifest).architectures.x64;
const javaExtension = {
  version:'1.57.0',
  url:'https://github.com/redhat-developer/vscode-java/releases/download/v1.57.0/vscode-java-1.57.0-1110.vsix',
  size:54395892,
  sha256:'80a6b852577aec37510b1f975e188279181e8c30ab5cae88812d941cd2d11bff'
};
const source = readFileSync(path.join(root, 'native-installer/windows/WindowsRuntime.cs'), 'utf8');
assert.ok(source.includes(`PortableJavaVersion = "${javaExtension.version}"`) &&
  source.includes(`PortableJavaHash = "${javaExtension.sha256}"`) &&
  source.includes(`Length != ${javaExtension.size}`), 'Portable Java extension pins must match the launcher');

const vs = pins.vscode;
const stageScript = readFileSync(path.join(root, 'native-installer/windows/Stage-VSCode.ps1'), 'utf8')
  .replaceAll('@VS_CODE_URL@', vs.url).replaceAll('@VS_CODE_SIZE@', String(vs.size)).replaceAll('@VS_CODE_SHA256@', vs.sha256);
writeFileSync(path.join(stage, 'Stage-VSCode.ps1'), stageScript.replace(/\r?\n/g, '\r\n'), {flag:'wx'});
copyFileSync(path.join(root, 'docs/WINDOWS-PORTABLE.md'), path.join(stage, 'READ-ME.md'));
copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE.txt'));
const metadata = {kitVersion:release.kitVersion, sourceRevision:execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim(),
  kitSha256:digest(kit), launcherSha256:digest(launcher), runtimes:Object.fromEntries(
    Object.entries(pins).map(([key, {version, url, size, sha256}]) => [key, {version, url, size, sha256}])), javaExtension};
writeFileSync(path.join(stage, 'BUILD.json'), JSON.stringify(metadata, null, 2) + '\n', {flag:'wx'});
const output = path.resolve(outputDirectory);
mkdirSync(output);
execFileSync('python3', [path.join(root, 'scripts/stage-windows-portable.py'), path.resolve(downloadDirectory),
  stage, output, path.join(root, 'setup/windows-downloads.json')], {cwd:root, stdio:'inherit', timeout:240000});
