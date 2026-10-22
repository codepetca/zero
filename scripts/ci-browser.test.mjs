import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureBrowser} from './ci-browser.mjs';
test('warm runner Chrome avoids installation',async()=>{
  let installs=0;
  assert.equal(await ensureBrowser({probe:async()=>{},install:async()=>{installs++;},log:()=>{}}),'reused');assert.equal(installs,0);
});
test('cold or incompatible Chrome installs once then verifies actual launch',async()=>{
  let probes=0,installs=0;
  assert.equal(await ensureBrowser({probe:async()=>{if(++probes===1)throw Error('missing');},install:async()=>{installs++;},log:()=>{}}),'installed');assert.equal(probes,2);assert.equal(installs,1);
});
test('failed install and incompatible fallback both fail the job',async()=>{
  await assert.rejects(ensureBrowser({probe:async()=>{throw Error('missing');},install:async()=>{throw Error('download');},log:()=>{}}),/download/);
  await assert.rejects(ensureBrowser({probe:async()=>{throw Error('incompatible');},install:async()=>{},log:()=>{}}),/incompatible/);
});
