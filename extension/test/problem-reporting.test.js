'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProblemReporter,classify,KEY}=require('../src/problem-reporting');
const {validateProblemReport}=require('../src/problem-report-contract');
const receipt='c4ebd3bc-a08e-4a8c-847c-7ac13f32c898';
const response=(status='delivered')=>({status:202,json:async()=>({status,receipt})});
function fixture({enabled=true,telemetry=true,stored,send,timeoutMs=30,project}={}) {
  let setting=enabled,telemetryListener,configListener,store=stored,inputs=[],answers=[],notifications=[],copied=[],currentProject=project;
  const vscode={version:'1.95.0',ExtensionMode:{Development:2},env:{clipboard:{writeText:async value=>copied.push(value)},isTelemetryEnabled:telemetry,onDidChangeTelemetryEnabled:cb=>(telemetryListener=cb,{dispose(){}})},workspace:{getConfiguration:()=>({get:()=>setting}),onDidChangeConfiguration:cb=>(configListener=cb,{dispose(){}})},window:{showInputBox:async()=>inputs.shift(),showInformationMessage:async(...args)=>{notifications.push(args);return answers.shift();}}};
  const context={extensionMode:2,extension:{packageJSON:{version:'0.5.80'}},globalState:{get:()=>store,update:async(_,value)=>{store=structuredClone(value);}}};
  const reporter=createProblemReporter(vscode,context,{send,timeoutMs,retryDelay:100000,getProject:()=>currentProject});
  return {reporter,vscode,get store(){return store;},inputs,answers,notifications,copied,setProject(value){currentProject=value;},setEnabled(value){setting=value;configListener({affectsConfiguration:()=>true});},setTelemetry(value){vscode.env.isTelemetryEnabled=value;telemetryListener(value);}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const bad=()=>Object.assign(new Error('secret /Users/student project https://github.com/a/b token'),{code:'ZERO_BUILDER_UNAVAILABLE'});
test('classification rejects expected and untrusted generic failures',()=>{
  assert.equal(classify(bad()),'ZERO_BUILDER_UNAVAILABLE');
  assert.equal(classify(new TypeError('secret')),'ZERO_INTERNAL_TYPE_ERROR');
  assert.equal(classify(new Error('compiler error')),undefined);
  assert.equal(classify(Object.assign(new Error('student runtime'),{code:'STARTUP_FAILED'})),undefined);
  assert.equal(classify(Object.assign(new TypeError('cancel'),{name:'AbortError'})),undefined);
});
test('disabled and telemetry opt-out do not transmit; automatic payload is bounded and contains no error text',async()=>{
  const sent=[];const f=fixture({enabled:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  f.reporter.failure(bad(),'run-browser','checking');await tick();assert.equal(sent.length,0);
  f.setEnabled(true);f.reporter.breadcrumb('run-browser','checking','started');f.reporter.failure(bad(),'run-browser','checking');await tick();
  assert.equal(sent.length,1);assert.ok(validateProblemReport(sent[0]));assert.doesNotMatch(JSON.stringify(sent),/secret|Users|github\.com|token/);
  f.setTelemetry(false);f.reporter.failure(bad(),'run-browser','checking');await tick();assert.equal(sent.length,1);assert.deepEqual(f.store,[]);f.reporter.dispose();
});
test('queue persists across restart, deduplicates, retries with the same id, and expires',async()=>{
  const first=fixture({send:async()=>({status:503})});
  first.reporter.failure(bad(),'run-browser','checking');first.reporter.failure(bad(),'run-browser','checking');await tick();
  assert.equal(first.store.length,1);const id=first.store[0].report.reportId;first.reporter.dispose();
  const delivered=[];const second=fixture({stored:first.store,send:async(_,options)=>{delivered.push(JSON.parse(options.body));return response();}});await tick();
  assert.equal(delivered.length,1);assert.equal(delivered[0].reportId,id);assert.deepEqual(second.store,[]);second.reporter.dispose();
  const old=structuredClone(first.store);old[0].report.occurredAt='2020-01-01T00:00:00.000Z';
  const third=fixture({stored:old,send:async()=>{throw Error('must not send');}});await tick();assert.deepEqual(third.store,[]);third.reporter.dispose();
});
test('disabling during an automatic send aborts it and removes the queue',async()=>{
  let aborted=false;const f=fixture({send:async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));}))});
  f.reporter.failure(bad(),'publish','building');await tick();f.setTelemetry(false);await tick();assert.ok(aborted);assert.deepEqual(f.store,[]);f.reporter.dispose();
});
test('timeout is bounded even if a transport ignores cancellation',async()=>{
  const f=fixture({send:async()=>new Promise(()=>{}),timeoutMs:10});f.reporter.failure(bad(),'publish','building');await new Promise(resolve=>setTimeout(resolve,40));assert.equal(f.store[0].attempts,1);f.reporter.dispose();
});
test('manual report is reviewed before sending and works with telemetry disabled',async()=>{
  const sent=[];const f=fixture({telemetry:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response('pending');}});
  f.inputs.push('');f.answers.push('Send report');await f.reporter.manual();
  assert.equal(sent.length,1);assert.equal(sent[0].source,'manual');assert.ok(validateProblemReport(sent[0]));assert.match(f.notifications[0][1].detail,/"environment"/);assert.match(f.notifications[1][0],/pending/);f.reporter.dispose();
});
test('recovery requires the same local project and unchanged original versions',async()=>{
  const sent=[];const f=fixture({send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  f.reporter.failure(bad(),'publish','building','project-a');await tick();
  f.reporter.success('publish','project-b');f.reporter.success('run-browser','project-a');await tick();assert.equal(sent.length,1);
  f.reporter.success('publish','project-a');await tick();assert.equal(sent.length,2);assert.equal(sent[1].outcome,'recovered');assert.equal(sent[1].reportId,sent[0].reportId);assert.equal(sent[1].code,sent[0].code);assert.deepEqual(sent[1].environment,sent[0].environment);assert.doesNotMatch(JSON.stringify(sent),/project-a/);f.reporter.dispose();
});
test('pending uses the same report id and is not treated as delivery',async()=>{
  const sent=[];let count=0;const f=fixture({send:async(_,options)=>{sent.push(JSON.parse(options.body));return response(++count===1?'pending':'delivered');}});
  f.reporter.failure(bad(),'publish','building');await tick();assert.equal(f.store.length,1);assert.equal(f.store[0].attempts,1);
  await f.reporter.flush();assert.equal(sent[1].reportId,sent[0].reportId);assert.deepEqual(f.store,[]);f.reporter.dispose();
});
test('manual report preserves only stable latest error context when automatic reporting is off',async()=>{
  const sent=[];const f=fixture({enabled:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  f.reporter.failure(bad(),'run-browser','web-compile');f.inputs.push('');f.answers.push('Send report');await f.reporter.manual();
  assert.equal(sent[0].operation,'run-browser');assert.equal(sent[0].stage,'web-compile');assert.equal(sent[0].code,'ZERO_BUILDER_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(sent),/secret|Users|github\.com|token/);f.reporter.dispose();
});
test('project version reads are bounded and reject symlinks',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {readRecord}=require('../src/problem-reporting');const dir=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'zero-report-test-'));
  try {await fs.writeFile(path.join(dir,'zero-core.json'),JSON.stringify({schema:1,coordinate:{version:'1.2.3'}}));assert.equal((await readRecord(dir,['zero-core.json'])).coordinate.version,'1.2.3');
    await fs.symlink(dir,path.join(dir,'link'));assert.equal(await readRecord(path.join(dir,'link'),['zero-core.json']),undefined);
    await fs.unlink(path.join(dir,'zero-core.json'));await fs.symlink('/etc/hosts',path.join(dir,'zero-core.json'));assert.equal(await readRecord(dir,['zero-core.json']),undefined);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('deduplicated pending failure recovers the original backend occurrence',async()=>{
  const rows=new Map(),sent=[];let deliveries=0;
  const f=fixture({send:async(_,options)=>{
    const report=JSON.parse(options.body);sent.push(report);
    const row=rows.get(report.reportId) || {failed:false,recovered:false};row[report.outcome]=true;rows.set(report.reportId,row);
    return response(++deliveries<=2?'pending':'delivered');
  }});
  f.reporter.failure(bad(),'publish','building','project-a');await tick();
  f.reporter.failure(bad(),'publish','building','project-a');await tick();
  await f.reporter.success('publish','project-a');await tick();
  assert.equal(rows.size,1);assert.deepEqual([...rows.values()],[{failed:true,recovered:true}]);
  assert.ok(sent.some(report=>report.outcome==='recovered'));assert.equal(new Set(sent.map(report=>report.reportId)).size,1);f.reporter.dispose();
});
test('manual uncertainty retries the identical reviewed report and can copy it later',async()=>{
  const sent=[];let count=0;const f=fixture({send:async(_,options)=>{sent.push(JSON.parse(options.body));return ++count===1?{status:503}:response();}});
  f.inputs.push('A reviewed description');f.answers.push('Send report','Copy report');await f.reporter.manual();
  assert.equal(sent.length,1);assert.deepEqual(JSON.parse(f.copied[0]),sent[0]);
  f.answers.push('Retry');await f.reporter.manual();assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);f.reporter.dispose();
});
test('manual disposal aborts an in-flight send',async()=>{
  let aborted=false,started;const startedPromise=new Promise(resolve=>{started=resolve;});
  const f=fixture({timeoutMs:1000,send:async(_,options)=>new Promise((resolve,reject)=>{started();options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));});})});
  f.inputs.push('');f.answers.push('Send report');const operation=f.reporter.manual();await startedPromise;f.reporter.dispose();await operation;assert.ok(aborted);
});
test('manual report drops stale context when the project changes',async()=>{
  const sent=[];const f=fixture({enabled:false,project:'project-a',send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  f.reporter.failure(bad(),'publish','building','project-a');f.setProject('project-b');f.inputs.push('');f.answers.push('Send report');await f.reporter.manual();
  assert.equal(sent[0].operation,'manual');assert.equal(sent[0].stage,'manual');assert.equal(sent[0].code,'MANUAL_REPORT');assert.doesNotMatch(JSON.stringify(sent),/project-[ab]/);f.reporter.dispose();
});
test('an opening failure only recovers after a confirmed browser opening',async()=>{
  const sent=[];const f=fixture({send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  const error=Object.assign(new Error('private'),{code:'WEB_PUBLISH_OPEN_FAILED'});
  f.reporter.failure(error,'publish','opening','project-a');await tick();
  await f.reporter.success('publish','project-a');await tick();assert.equal(sent.length,1);
  await f.reporter.success('publish','project-a','opening');await tick();
  assert.equal(sent.length,2);assert.equal(sent[1].outcome,'recovered');assert.equal(sent[1].reportId,sent[0].reportId);f.reporter.dispose();
});
