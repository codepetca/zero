import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fixtureIds,parseFixtureSelection,selectFixtureReceipts,runSelectedFixtures} from './web-fixture-selection.mjs';
test('full default includes ten known fixtures; invalid selectors fail before any preparation',async()=>{
 assert.equal(fixtureIds.length,10);assert.deepEqual(parseFixtureSelection([]),fixtureIds);assert.deepEqual(parseFixtureSelection(['--only=helpers,audio']),['helpers','audio']);
 for(const args of [['--only='],['--only=helpers,helpers'],['--only=unknown'],['--only=helpers','--only=audio'],['--only']])assert.throws(()=>parseFixtureSelection(args));
 let prepared=0;await assert.rejects(runSelectedFixtures(['invalid'],{prepare:()=>prepared++,build:()=>({})}));assert.equal(prepared,0);
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'zero-selector-unit-'));const output=path.join(base,'must-not-create');
 try{const result=spawnSync(process.execPath,['scripts/verify-web-export.mjs','--only=bad','--output',output],{encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);await assert.rejects(fs.stat(output),{code:'ENOENT'});}finally{await fs.rm(base,{recursive:true,force:true});}
});
test('injected build runner prepares and builds only selected fixtures',async()=>{const calls=[];const results=await runSelectedFixtures(['audio','zero-ui'],{prepare:async(id,example)=>{calls.push(['prepare',id,example]);return '/unit/'+id;},build:async(project,id)=>{calls.push(['build',project,id]);return {buildId:'unit-'+id};}});assert.deepEqual(results.map(result=>result.name),['audio','zero-ui']);assert.deepEqual(calls.map(call=>call[0]+':'+call[1]),['prepare:audio','build:/unit/audio','prepare:zero-ui','build:/unit/zero-ui']);});
test('browser-only can select one receipt from a scoped or full prior build',()=>{const full=fixtureIds.map(name=>({name,buildId:'unit-'+name}));assert.deepEqual(selectFixtureReceipts(full,['audio']),[full[3]]);assert.equal(selectFixtureReceipts([full[3]],['audio']).length,1);for(const receipts of [[],[full[0],full[0]],[{name:'unknown'}]])assert.throws(()=>selectFixtureReceipts(receipts,['audio']));});
async function harness(name,selection){const source=await fs.readFile(new URL(name,import.meta.url),'utf8');return vm.runInNewContext('('+source.trim().replace(/;$/,'')+')',{__URLS__:Object.fromEntries(fixtureIds.map(id=>[id,'https://unit.invalid/'+id])),__ARTIFACT_ROOT__:'/unit',__SELECTION__:selection});}
test('each ordinary browser fixture has an isolated selected entry and always closes its fresh page',async()=>{
 for(const id of fixtureIds.filter(id=>id!=='mobile')){const calls=[];const child={addInitScript:async()=>calls.push('init'),setViewportSize:async()=>{},goto:async url=>{calls.push(url);throw new Error('unit-stop-before-browser');},close:async()=>calls.push('closed')};const initial={context:()=>({newPage:async()=>{calls.push('new');return child;}})};
 const run=await harness('web-browser-checks.js',[id]);await assert.rejects(run(initial),/unit-stop-before-browser/);assert.deepEqual(calls,['new','init','https://unit.invalid/'+id,'closed'],id);}
});
test('mobile selection initializes a fresh page/CDP only for its selected case',async()=>{const calls=[],cdp={send:async()=>{},detach:async()=>calls.push('detach')};const child={addInitScript:async()=>calls.push('init'),setViewportSize:async()=>{},context:()=>({newCDPSession:async()=>cdp}),goto:async url=>{calls.push(url);throw new Error('unit-stop-before-browser');},close:async()=>calls.push('closed')};const run=await harness('web-mobile-checks.js',['mobile']);await assert.rejects(run({context:()=>({newPage:async()=>child})}),/unit-stop-before-browser/);assert.deepEqual(calls,['init','https://unit.invalid/mobile','detach','closed']);});
test('harness rejects malformed selections before creating any page',async()=>{for(const filename of ['web-browser-checks.js','web-mobile-checks.js'])for(const selection of [[],['no'],['audio','audio']]){const run=await harness(filename,selection);await assert.rejects(run({context(){throw new Error('must not create page');}}),/Invalid .*fixture selection/);}});
test('mobile harness accepts default ten and the four evidence families',async()=>{
 for(const selection of [fixtureIds,['helpers','zero-ui','audio','lifecycle']]) {
  const calls=[],cdp={send:async()=>{},detach:async()=>calls.push('detach')};
  const page={addInitScript:async()=>{},setViewportSize:async()=>{},context:()=>({newCDPSession:async()=>cdp}),goto:async url=>{calls.push(url);throw new Error('accepted-selection');},close:async()=>calls.push('closed')};
  await assert.rejects((await harness('web-mobile-checks.js',selection))({context:()=>({newPage:async()=>page})}),/accepted-selection/);
  assert.deepEqual(calls,['https://unit.invalid/helpers','detach','closed']);
 }
});
