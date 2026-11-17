import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {kitEntries} from './installer-payload.mjs';
import {root, releaseDefinition} from './release.mjs';
import {writePublicPortable} from './windows-portable-package.mjs';
import {validateManifest} from '../website/lib/contracts.mjs';
import {buildWindowsIcon} from './windows-icon.mjs';

const args = process.argv.slice(2);
const bundled = args[0] === '--bundled';
const [downloadDirectory, outputDirectory, ...extra] = bundled ? args.slice(1) : args;
if (!downloadDirectory || !outputDirectory || extra.length || (bundled && downloadDirectory === '--public'))
  throw new Error('Usage: node scripts/build-windows-portable.mjs DOWNLOAD_DIRECTORY|--public|--bundled DOWNLOAD_DIRECTORY NEW_OUTPUT_DIRECTORY');

const publicOnly = downloadDirectory === '--public';
const editorPin = path.join(root, 'native-installer/windows/portable-editor.json');
const release = releaseDefinition();
const kitFile = path.join(root, 'dist', release.assets.kit.filename);
const kit = readFileSync(kitFile);
const receipt = JSON.parse(readFileSync(path.join(root, 'dist/release.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.ok(release.publication.status === 'local' || (bundled && release.publication.status === 'published'),
  'Use a local kit, or the exact public kit when adding a complete Portable download');
validateManifest(release);
let kitSourceRevision;
if (bundled && release.publication.status === 'published') {
  assert.equal(kit.length, release.assets.kit.size, 'Public kit size drift');
  assert.equal(digest(kit), release.assets.kit.sha256, 'Use the exact public kit ZIP');
  const tag = `refs/tags/${release.publication.tag}`;
  const references = execFileSync('git', ['ls-remote', 'https://github.com/codepetca/zero.git', tag, `${tag}^{}`],
    {cwd:root, encoding:'utf8', timeout:30000}).trim().split('\n').map(line => line.split('\t'));
  kitSourceRevision = references.find(([, ref]) => ref === `${tag}^{}`)?.[0] ??
    references.find(([, ref]) => ref === tag)?.[0];
  assert.match(kitSourceRevision ?? '', /^[a-f0-9]{40}$/, 'Published kit tag is unavailable');
}
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
  ...(bundled ? [`-p:ZeroPortableEditor=${editorPin}`] : []),
  `-p:Version=${release.kitVersion}`, `-p:ZeroIcon=${icon}`, `-p:ZeroKitZip=${kitFile}`,
  `-p:BaseIntermediateOutputPath=${path.join(work, 'obj')}${path.sep}`,
  `-p:BaseOutputPath=${path.join(work, 'bin')}${path.sep}`], {cwd:root, stdio:'inherit', timeout:240000});
assert.deepEqual(readdirSync(stage).sort(), ['Newtonsoft.Json.dll', 'Zero.exe', 'Zero.exe.config']);
const restore = JSON.parse(readFileSync(path.join(work, 'obj/project.assets.json'), 'utf8'));
const dependency = restore.libraries['Newtonsoft.Json/13.0.4'];
const dependencyPath = Object.keys(restore.packageFolders)
  .map(folder => path.join(folder, dependency.path, 'LICENSE.md'))
  .find(candidate => existsSync(candidate));
assert.ok(dependencyPath, 'The pinned Newtonsoft.Json license must be present');
copyFileSync(dependencyPath, path.join(stage, 'Newtonsoft.Json.LICENSE.txt'));
const launcher = readFileSync(path.join(stage, 'Zero.exe'));
assert.equal(launcher.readUInt16LE(0), 0x5a4d);
const pe = launcher.readUInt32LE(0x3c);
assert.equal(launcher.readUInt32LE(pe), 0x00004550);
assert.equal(launcher.readUInt16LE(pe + 4), 0x8664);
assert.ok(launcher.includes(kit), 'The launcher must embed the exact measured Zero kit');
if (bundled) assert.ok(launcher.includes(readFileSync(editorPin)), 'The launcher must embed the pinned Portable editor');

const pins = JSON.parse(runtimeManifest).architectures.x64;
const runtimePins = {...pins};
if (bundled) {
  delete runtimePins.vscode;
  runtimePins.vscodium = JSON.parse(readFileSync(editorPin, 'utf8'));
}
const javaExtension = JSON.parse(readFileSync(path.join(root, 'native-installer/windows/portable-java.json'), 'utf8'));
const source = readFileSync(path.join(root, 'native-installer/windows/WindowsRuntime.cs'), 'utf8');
assert.ok(source.includes(`PortableJavaVersion = "${javaExtension.version}"`) &&
  source.includes(`PortableJavaHash = "${javaExtension.sha256}"`) &&
  source.includes(`Length != ${javaExtension.size}`), 'Portable Java extension pins must match the launcher');

copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE.txt'));
const metadata = {
  kitVersion:release.kitVersion,
  sourceRevision:execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim(),
  sourceDirty:!!execFileSync('git', ['status', '--porcelain'], {cwd:root, encoding:'utf8'}).trim(),
  kitSha256:digest(kit), launcherSha256:digest(launcher),
  ...(bundled ? {toolDistribution:'bundled', kitSourceRevision:kitSourceRevision ?? execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim()} : {}),
  runtimes:Object.fromEntries(
    Object.entries(runtimePins).map(([key, {version, url, size, sha256}]) => [key, {version, url, size, sha256}])), javaExtension};
const output = path.resolve(outputDirectory);
if (publicOnly) {
  writePublicPortable(root, metadata, name => readFileSync(path.join(stage, name)), output);
} else {
  if (!bundled) {
    const vs = pins.vscode;
    const stageScript = readFileSync(path.join(root, 'native-installer/windows/Stage-VSCode.ps1'), 'utf8')
      .replaceAll('@VS_CODE_URL@', vs.url).replaceAll('@VS_CODE_SIZE@', String(vs.size)).replaceAll('@VS_CODE_SHA256@', vs.sha256);
    writeFileSync(path.join(stage, 'Stage-VSCode.ps1'), stageScript.replace(/\r?\n/g, '\r\n'), {flag:'wx'});
  }
  const guide = bundled ? 'release/PORTABLE-BUNDLED.md' : 'docs/WINDOWS-PORTABLE.md';
  copyFileSync(path.join(root, guide), path.join(stage, 'READ-ME.md'));
  if (bundled) {
    const notices = readFileSync(path.join(root, 'release/PORTABLE-THIRD-PARTY.md'), 'utf8')
      .replaceAll('windows-portable-bundled-v0.5.78', `windows-portable-bundled-v${release.kitVersion}`);
    writeFileSync(path.join(stage, 'THIRD-PARTY.md'), notices, {flag:'wx'});
  }
  writeFileSync(path.join(stage, 'BUILD.json'), JSON.stringify(metadata, null, 2) + '\n', {flag:'wx'});
  mkdirSync(output);
  execFileSync('python3', [path.join(root, 'scripts/stage-windows-portable.py'), path.resolve(downloadDirectory),
    stage, output, path.join(root, 'setup/windows-downloads.json'), ...(bundled ? [editorPin] : [])], {cwd:root, stdio:'inherit', timeout:240000});
}
