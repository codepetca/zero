import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../../',import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name,root),'utf8'));
const lock = read('framework/project-builder/runtime-lock.json');

test('native setup pins exact official Node archives and verified HEAD sizes from the saved builder runtime lock',()=>{
  for (const [name,architecture,platform,size] of [
    ['mac','arm64','darwin-arm64',49924179],['mac','x64','darwin-x64',51091933],['windows','x64','win32-x64',35556042]]) {
    const manifest=read(`setup/${name}-downloads.json`),assets=manifest.architectures[architecture];
    assert.deepEqual(Object.keys(assets).sort(),['jdk','node','vscode']);
    const node=assets.node,pin=lock.pins.find(pin=>pin.tool==='node'&&pin.platform===platform);
    assert.deepEqual([node.url,node.sha256,node.version],[pin.url,pin.sha256,pin.version]);
    assert.equal(node.size,size);assert.equal(node.format,name==='mac'?'tar.gz':'zip');
    assert.equal(manifest.provenance.nodeCheckedUtc,'2026-10-24T02:24:07Z');
    assert.equal(manifest.provenance.nodeChecksums,'https://nodejs.org/dist/v22.21.1/SHASUMS256.txt');
    assert.match(manifest.provenance.nodeSizes,/HTTP HEAD Content-Length/);
  }
});

