import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {zipSync} from 'fflate';
import {root} from './release.mjs';

// Reuse the verified school's launcher and embed only a vendor download plan.
const [candidate, outputDirectory] = process.argv.slice(2);
if (!candidate || !outputDirectory || process.argv.length !== 4)
  throw new Error('Usage: node scripts/package-windows-portable-public.mjs PRIVATE_ZIP NEW_OUTPUT_DIRECTORY');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(path.join(root, 'release/windows-portable-pilot.json'), 'utf8'));
const measured = manifest.localAsset;
const privateBytes = readFileSync(candidate);
assert.equal(privateBytes.length, measured.size);
assert.equal(digest(privateBytes), measured.sha256);
const extract = name => execFileSync('unzip', ['-p', path.resolve(candidate), `Zero Portable/${name}`], {maxBuffer:16 * 1024 * 1024});
const metadata = JSON.parse(extract('BUILD.json'));
assert.equal(metadata.kitVersion, manifest.kitVersion);
assert.equal(metadata.sourceRevision, manifest.sourceRevision);
assert.equal(metadata.sourceDirty, false);
const launcher = extract('Zero.exe');
assert.equal(digest(launcher), metadata.launcherSha256);
const pins = Object.entries(metadata.runtimes).map(([name, asset]) => ({
  name, url:asset.url, size:asset.size, sha256:asset.sha256,
  filename:decodeURIComponent(new URL(asset.url).pathname.split('/').at(-1)),
  prefix:name === 'jdk' ? asset.version : name === 'node' ? `node-v${asset.version}-win-x64` : '',
  executable:({jdk:'bin/java.exe', git:'cmd/git.exe', node:'node.exe', vscode:'Code.exe'})[name],
}));
const java = metadata.javaExtension;
pins.push({ name:'java', url:java.url, size:java.size, sha256:java.sha256, filename:new URL(java.url).pathname.split('/').at(-1) });
assert.deepEqual(pins.map(pin => pin.name).sort(), ['git', 'java', 'jdk', 'node', 'vscode']);
for (const pin of pins) {
  const url = new URL(pin.url);
  assert.ok(url.protocol === 'https:' && ['github.com', 'nodejs.org', 'vscode.download.prss.microsoft.com'].includes(url.host));
  assert.match(pin.sha256, /^[a-f0-9]{64}$/);
  assert.match(pin.filename, /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/);
}
const stageTemplate = readFileSync(path.join(root, 'native-installer/windows/Stage-Tools.ps1'), 'utf8');
const stage = stageTemplate.replace('@TOOL_PINS@', JSON.stringify(pins, null, 2)).replace(/\r?\n/g, '\r\n');
const files = Object.fromEntries(['Zero.exe', 'Zero.exe.config', 'Newtonsoft.Json.dll', 'Newtonsoft.Json.LICENSE.txt', 'LICENSE.txt']
  .map(name => [`Zero Portable/${name}`, extract(name)]));
files['Zero Portable/Stage-Tools.ps1'] = Buffer.from(stage);
files['Zero Portable/BUILD.json'] = Buffer.from(JSON.stringify({...metadata, toolDistribution:'vendor-downloads'}, null, 2) + '\n');
const guide = readFileSync(path.join(root, 'docs/WINDOWS-PORTABLE.md'), 'utf8');
const privateStart = guide.indexOf('## Prepare the private ZIP');
const testStart = guide.indexOf('## Test with a student login');
const rebuildStart = guide.indexOf('## Rebuild the local pilot');
assert.ok(privateStart > 0 && testStart > privateStart && rebuildStart > testStart, 'Unexpected pilot guide headings');
files['Zero Portable/READ-ME.md'] = Buffer.from((guide.slice(0, privateStart) + guide.slice(testStart, rebuildStart)).trimEnd() + '\n');
const output = path.resolve(outputDirectory);
mkdirSync(output);
const archive = zipSync(files, {level:6, mtime:new Date('2026-11-14T12:00:00Z')});
const filename = `Zero-${manifest.kitVersion}-windows-portable-pilot-staging-x64.zip`;
writeFileSync(path.join(output, filename), archive, {flag:'wx'});
writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${digest(archive)}  ${filename}\n`, {flag:'wx'});
console.log(JSON.stringify({filename, size:archive.length, sha256:digest(archive)}));
