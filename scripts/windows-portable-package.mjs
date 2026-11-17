import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {zipSync} from 'fflate';

export const portableDigest = bytes => createHash('sha256').update(bytes).digest('hex');

export function writePublicPortable(sourceRoot, metadata, extract, output, localAsset) {
  assert.equal(metadata.sourceDirty, false, 'Build Portable from a clean source checkout');
  const launcher = extract('Zero.exe');
  assert.equal(portableDigest(launcher), metadata.launcherSha256);
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
  const stageTemplate = readFileSync(path.join(sourceRoot, 'native-installer/windows/Stage-Tools.ps1'), 'utf8');
  const stage = stageTemplate.replace('@TOOL_PINS@', JSON.stringify(pins, null, 2)).replace(/\r?\n/g, '\r\n');
  const files = Object.fromEntries(['Zero.exe', 'Zero.exe.config', 'Newtonsoft.Json.dll', 'Newtonsoft.Json.LICENSE.txt', 'LICENSE.txt']
    .map(name => [`Zero Portable/${name}`, extract(name)]));
  files['Zero Portable/Stage-Tools.ps1'] = Buffer.from(stage);
  files['Zero Portable/BUILD.json'] = Buffer.from(JSON.stringify({...metadata, toolDistribution:'vendor-downloads'}, null, 2) + '\n');
  const guide = readFileSync(path.join(sourceRoot, 'docs/WINDOWS-PORTABLE.md'), 'utf8');
  const privateStart = guide.indexOf('## Prepare the private ZIP');
  const testStart = guide.indexOf('## Test with a student login');
  const rebuildStart = guide.indexOf('## Rebuild the local pilot');
  assert.ok(privateStart > 0 && testStart > privateStart && rebuildStart > testStart, 'Unexpected pilot guide headings');
  files['Zero Portable/READ-ME.md'] = Buffer.from((guide.slice(0, privateStart) + guide.slice(testStart, rebuildStart)).trimEnd() + '\n');
  const {kitVersion, sourceRevision, kitSha256} = metadata;
  const tag = `windows-portable-pilot-v${kitVersion}`;
  const filename = `Zero-${kitVersion}-windows-portable-pilot-staging-x64.zip`;
  const archive = zipSync(files, {level:6, mtime:new Date('2026-11-14T12:00:00Z')});
  const asset = {filename, size:archive.length, sha256:portableDigest(archive),
    url:`https://github.com/codepetca/zero/releases/download/${tag}/${filename}`};
  const manifest = {kitVersion, sourceRevision, kitSha256, ...(localAsset ? {localAsset} : {}),
    publication:{status:'published', tag}, asset};
  mkdirSync(output);
  writeFileSync(path.join(output, filename), archive, {flag:'wx'});
  writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${asset.sha256}  ${filename}\n`, {flag:'wx'});
  writeFileSync(path.join(output, 'portable-candidate.json'), JSON.stringify(manifest, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify(asset));
}
