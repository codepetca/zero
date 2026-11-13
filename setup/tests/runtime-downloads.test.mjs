import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../../',import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name,root),'utf8'));
const lock = read('framework/project-builder/runtime-lock.json');

test('native setup pins exact official Node archives and verified HEAD sizes from the saved builder runtime lock',()=>{
  for (const [name,architecture,platform,size] of [
    ['mac','arm64','darwin-arm64',49996369],['mac','x64','darwin-x64',51190214],['windows','x64','win32-x64',35604229]]) {
    const manifest=read(`setup/${name}-downloads.json`),assets=manifest.architectures[architecture];
    assert.deepEqual(Object.keys(assets).sort(),['git','jdk','node','vscode']);
    const node=assets.node,pin=lock.pins.find(pin=>pin.tool==='node'&&pin.platform===platform);
    assert.deepEqual([node.url,node.sha256,node.version],[pin.url,pin.sha256,pin.version]);
    assert.equal(node.size,size);assert.equal(node.format,name==='mac'?'tar.gz':'zip');
    assert.equal(manifest.provenance.nodeCheckedUtc,'2026-11-08T14:46:56Z');
    assert.equal(manifest.provenance.nodeChecksums,'https://nodejs.org/dist/v22.23.4/SHASUMS256.txt');
    assert.match(manifest.provenance.nodeSizes,/HTTP HEAD Content-Length/);
  }
});

test('Windows setup pins the official x64 MinGit archive',()=>{
  const {architectures,provenance}=read('setup/windows-downloads.json');
  const {files, ...archive} = architectures.x64.git;
  assert.deepEqual(archive,{
    url:'https://github.com/git-for-windows/git/releases/download/v2.56.1.windows.1/MinGit-2.56.1-64-bit.zip',
    sha256:'4a92850b6e917da4fd010669b614b55dccf5b0ec333a534cc4be4700dfefdafd',
    version:'2.56.1.windows.1',format:'zip',size:39849768
  });
  assert.equal(Object.keys(files).length,375);
  assert.match(files['ucrt64/bin/git-remote-https.exe'],/^[a-f0-9]{64}$/);
  assert.equal(provenance.gitRelease,'https://github.com/git-for-windows/git/releases/tag/v2.56.1.windows.1');
});

