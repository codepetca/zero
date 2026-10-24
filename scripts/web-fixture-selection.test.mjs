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
async function harness(name,selection,globals={}){const source=await fs.readFile(new URL(name,import.meta.url),'utf8');return vm.runInNewContext('('+source.trim().replace(/;$/,'')+')',{__URLS__:Object.fromEntries(fixtureIds.map(id=>[id,'https://unit.invalid/'+id])),__ARTIFACT_ROOT__:'/unit',__SELECTION__:selection,...globals});}
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

test('a Java startup assertion fails promptly with fixture identity and retained observed diagnostics',async()=>{
 const calls=[],javaError='java.lang.IllegalStateException: API assertion failed: actor-empty; expected 10,20, observed 9,20';
 const globals={window:{__zeroCheck:{errors:[],consoleErrors:[javaError],rejections:[]}},document:{body:{innerText:'startup failed'}}};
 const child={addInitScript:async()=>{},goto:async()=>{},waitForFunction:async predicate=>predicate(),evaluate:async predicate=>predicate(),screenshot:async options=>calls.push(options.path),close:async()=>calls.push('closed')};
 const run=await harness('web-browser-checks.js',['helpers'],globals);
 await assert.rejects(run({context:()=>({newPage:async()=>child})}),error=>error.message.includes('Browser fixture helpers failed')&&error.message.includes(javaError)&&error.message.includes('consoleErrors'));
 assert.deepEqual(calls,['/unit/helpers-failure.png','closed']);
});

test('helper evidence retains its successful snapshot before loading fault reloads',async()=>{
 const source=await fs.readFile(new URL('web-browser-checks.js',import.meta.url),'utf8');
 const start=source.indexOf('  const helperEvidence=');const end=source.indexOf('  // A completed image',start);
 assert.ok(start>source.indexOf("'No JavaScript errors in helpers'"));assert.ok(end>start);
 assert.ok(!source.slice(source.indexOf('  for (const id of selection')).includes('apiEvidence.push'));
 const successful='ZERO_API_EVIDENCE_V1\nI|fixture#actual()|observed\nA|fixture#actual()|observed|actual passed|true\nEND_ZERO_API_EVIDENCE';
 let active=successful,reads=0;const apiEvidence=[],page={evaluate:async()=>{reads++;return active;}};
 await vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})()',{page,apiEvidence});
 active=undefined; // An intentionally failed later page has no Java receipt.
 assert.equal(reads,1);assert.equal(apiEvidence.length,1);assert.equal(apiEvidence[0].caseId,'browser/helpers');assert.equal(apiEvidence[0].raw,successful);
 await assert.rejects(vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})()',{page,apiEvidence:[]}),/Missing successful helper/);
});

test('actual Canvas instrumentation assembles whole/split blocks and rejects incomplete, cross-frame and oversized transport',async()=>{
 // These are synthetic transport bytes, not evidence that a Java API ran.
 const painted=[],window={},document={createElement:()=>({}),body:{innerText:''}};
 function Context(){this.canvas={width:960,height:480};}
 Context.prototype.fillText=function(text){painted.push(text);};Context.prototype.clearRect=function(){};Context.prototype.drawImage=function(){};
 const globals={window,document,CanvasRenderingContext2D:Context,addEventListener:()=>{},console:{error:()=>{}}};
 const child={addInitScript:async initialize=>initialize(),goto:async()=>{throw new Error('initialized-only');},evaluate:async predicate=>predicate(),screenshot:async()=>{},close:async()=>{}};
 await assert.rejects((await harness('web-browser-checks.js',['helpers'],globals))({context:()=>({newPage:async()=>child})}),/initialized-only/);
 const context=new Context(),start='ZERO_API_EVIDENCE_V1',end='END_ZERO_API_EVIDENCE';
 const lines=[start,'I|fixture#actual()|transport','A|fixture#actual()|transport|Synthetic transport only|true',end],raw=lines.join('\n');
 context.fillText(raw,0,0);assert.equal(window.__zeroCheck.apiEvidence,raw);assert.equal(painted[0],raw);
 window.__zeroCheck.apiEvidence=undefined;for(const line of lines)context.fillText(line,0,0);assert.equal(window.__zeroCheck.apiEvidence,raw);
 window.__zeroCheck.apiEvidence=undefined;for(const line of lines.slice(0,-1))context.fillText(line,0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 context.clearRect(0,0,960,480);context.fillText(end,0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 context.fillText(raw.slice(0,-end.length),0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 context.fillText(start,0,0);context.fillText('I|'+ 'x'.repeat(512*1024),0,0);context.fillText(end,0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 context.fillText(start,0,0);const other=new Context();for(const line of lines.slice(1))other.fillText(line,0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 context.fillText(start,0,0);context.fillText('unrelated rendered text',0,0);for(const line of lines.slice(1))context.fillText(line,0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 for(const line of [start,lines[2],lines[1],end])context.fillText(line,0,0);assert.equal(window.__zeroCheck.apiEvidence,undefined);
 for(const line of lines)context.fillText(line,0,0);assert.equal(window.__zeroCheck.apiEvidence,raw);
});
