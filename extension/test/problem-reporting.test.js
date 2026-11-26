'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProblemReporter,classify,KEY}=require('../src/problem-reporting');
const {validateProblemReport}=require('../src/problem-report-contract');
const receipt='c4ebd3bc-a08e-4a8c-847c-7ac13f32c898';
const response=(status='delivered')=>({status:202,json:async()=>({status,receipt})});
function fixture({enabled=true,legacyEnabled=false,telemetry=true,stored,legacyStored,send,timeoutMs=30,project}={}) {
  let setting=enabled,telemetryListener,configListener,answers=[],notifications=[],copied=[],currentProject=project;
  const storage=new Map(),updates=[];
  if(stored!==undefined)storage.set(KEY,stored);
  if(legacyStored!==undefined)storage.set('zero.problemReports.queue',legacyStored);
  const vscode={version:'1.95.0',ExtensionMode:{Development:2},env:{clipboard:{writeText:async value=>copied.push(value)},isTelemetryEnabled:telemetry,onDidChangeTelemetryEnabled:cb=>(telemetryListener=cb,{dispose(){}})},workspace:{getConfiguration:()=>({get:(key,fallback)=>key==='automaticPublicProblemReports'?setting:key==='automaticProblemReports'?legacyEnabled:fallback,inspect:key=>key==='automaticPublicProblemReports'?{globalValue:setting}:undefined}),onDidChangeConfiguration:cb=>(configListener=cb,{dispose(){}})},window:{showInputBox:async()=>assert.fail('Structured reports must not ask for text'),showInformationMessage:async(...args)=>{notifications.push(args);return answers.shift();}}};
  const context={extensionMode:2,extension:{packageJSON:{version:'0.5.80'}},globalState:{get:key=>storage.get(key),update:async(key,value)=>{updates.push({key,value});if(value===undefined)storage.delete(key);else storage.set(key,structuredClone(value));}}};
  const reporter=createProblemReporter(vscode,context,{send,timeoutMs,retryDelay:100000,getProject:()=>currentProject});
  return {reporter,vscode,get store(){return storage.get(KEY);},get legacyStore(){return storage.get('zero.problemReports.queue');},updates,answers,notifications,copied,setProject(value){currentProject=value;},setEnabled(value){setting=value;configListener({affectsConfiguration:()=>true});},setTelemetry(value){vscode.env.isTelemetryEnabled=value;telemetryListener(value);}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const bad=()=>Object.assign(new Error('secret /Users/student project https://github.com/a/b token'),{code:'WEB_PUBLISH_DEPLOYMENT_FAILED'});
test('startup leaves an untouched editor profile without queue records',async()=>{
  for(const enabled of [false,true]) {
    const f=fixture({enabled,send:async()=>{throw Error('Unexpected submission');}});
    await tick();
    assert.equal(f.store,undefined);assert.deepEqual(f.updates,[]);
    if(!enabled) {
      f.reporter.failure(bad(),'publish','deploying');await tick();
      assert.equal(f.store,undefined);assert.deepEqual(f.updates,[]);
    }
    f.reporter.dispose();
  }
});
test('classification rejects expected and untrusted generic failures',()=>{
  assert.equal(classify(bad()),'WEB_PUBLISH_DEPLOYMENT_FAILED');
  assert.equal(classify(new TypeError('secret')),'ZERO_INTERNAL_TYPE_ERROR');
  assert.equal(classify(new Error('compiler error')),undefined);
  assert.equal(classify(Object.assign(new Error('update required'),{code:'ZERO_BUILDER_UPDATE_REQUIRED'})),undefined);
  assert.equal(classify(Object.assign(new Error('student runtime'),{code:'STARTUP_FAILED'})),undefined);
  assert.equal(classify(Object.assign(new TypeError('cancel'),{name:'AbortError'})),undefined);
});
test('disabled and telemetry opt-out do not transmit; automatic payload is bounded and contains no error text',async()=>{
  const sent=[];const f=fixture({enabled:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  f.reporter.failure(bad(),'run-browser','checking');await tick();assert.equal(sent.length,0);
  f.setEnabled(true);f.reporter.breadcrumb('run-browser','checking','started');f.reporter.failure(bad(),'run-browser','checking');await tick();
  assert.equal(sent.length,1);assert.ok(validateProblemReport(sent[0]));assert.equal(Object.hasOwn(sent[0],'description'),false);assert.doesNotMatch(JSON.stringify(sent),/secret|Users|github\.com|token/);
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
  const sent=[];const f=fixture({enabled:false,telemetry:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response('pending');}});
  f.answers.push('Send report');await f.reporter.manual();
  assert.equal(sent.length,1);assert.equal(sent[0].source,'manual');assert.ok(validateProblemReport(sent[0]));
  const detail=f.notifications[0][1].detail;
  assert.match(detail,/Version information, the failed action and recent operation steps/);
  assert.match(detail,/published in a public GitHub issue/);
  assert.equal(Object.hasOwn(sent[0],'description'),false);
  assert.doesNotMatch(detail,/"environment"|schemaVersion|reportId|occurredAt/);
  assert.match(f.notifications[1][0],/pending/);f.reporter.dispose();
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
  f.reporter.failure(bad(),'run-browser','web-compile');f.answers.push('Send report');await f.reporter.manual();
  assert.equal(sent[0].operation,'run-browser');assert.equal(sent[0].stage,'web-compile');assert.equal(sent[0].code,'WEB_PUBLISH_DEPLOYMENT_FAILED');assert.match(f.notifications[0][1].detail,/GitHub Pages deployment failed\./);assert.match(f.notifications[0][1].detail,/public GitHub issue/);assert.doesNotMatch(JSON.stringify(sent),/secret|Users|github\.com|token/);f.reporter.dispose();
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
  const sent=[];let count=0;const f=fixture({enabled:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return ++count===1?{status:503}:response();}});
  f.answers.push('Send report','Copy report');await f.reporter.manual();
  assert.equal(sent.length,1);assert.equal(Object.hasOwn(sent[0],'description'),false);assert.deepEqual(JSON.parse(f.copied[0]),sent[0]);
  f.answers.push('Retry','Send report');await f.reporter.manual();assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);f.reporter.dispose();
});
test('manual disposal aborts an in-flight send',async()=>{
  let aborted=false,started;const startedPromise=new Promise(resolve=>{started=resolve;});
  const f=fixture({timeoutMs:1000,send:async(_,options)=>new Promise((resolve,reject)=>{started();options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));});})});
  f.answers.push('Send report');const operation=f.reporter.manual();await startedPromise;f.reporter.dispose();await operation;assert.ok(aborted);
});
test('manual report drops stale context when the project changes',async()=>{
  const sent=[];const f=fixture({enabled:false,project:'project-a',send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  f.reporter.failure(bad(),'publish','building','project-a');f.setProject('project-b');f.answers.push('Send report');await f.reporter.manual();
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
test('revoking and re-enabling consent discards work queued in the previous epoch',async()=>{
  const sent=[];let release;
  const firstResponse=new Promise(resolve=>{release=resolve;});
  const f=fixture({timeoutMs:1000,send:async(_,options)=>{
    sent.push(JSON.parse(options.body));
    return sent.length===1 ? firstResponse : response();
  }});
  f.reporter.failure(bad(),'publish','building','project-a');await tick();
  f.reporter.failure(bad(),'publish','deploying','project-a');await tick();
  f.setEnabled(false);f.setEnabled(true);release(response());
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(sent.length,1);assert.deepEqual(f.store,[]);
  f.reporter.failure(bad(),'publish','verifying','project-a');await tick();
  assert.equal(sent.length,2);assert.equal(sent[1].stage,'verifying');f.reporter.dispose();
});

test('manual public report requires explicit send confirmation',async()=>{
  const sent=[];const f=fixture({enabled:false,send:async(_,options)=>{sent.push(options);return response();}});
  await f.reporter.manual();assert.equal(sent.length,0);
  assert.match(f.notifications[0][1].detail,/public GitHub issue/);f.reporter.dispose();
});
test('private reporting consent and queue never authorize or supply public reports',async()=>{
  const legacyKey='zero.problemReports.queue';
  const oldReport={schemaVersion:1,reportId:'c4ebd3bc-a08e-4a8c-847c-7ac13f32c898',occurredAt:new Date().toISOString(),source:'automatic',operation:'publish',stage:'deploying',code:'WEB_PUBLISH_DEPLOYMENT_FAILED',outcome:'failed',environment:{zeroVersion:'0.5.80',editorVersion:'1.95.0',os:'unknown',osVersion:'unknown',architecture:'unknown',distribution:'unknown',javaVersion:'unknown',frameworkVersion:'unknown',browserBuilderVersion:'unknown'},breadcrumbs:[]};
  const oldQueue=[{report:oldReport,attempts:0}];
  for(const enabled of [false,true]) {
    const sent=[];const f=fixture({enabled,legacyEnabled:true,legacyStored:oldQueue,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
    await tick();assert.equal(f.legacyStore,undefined);assert.equal(sent.length,0);
    assert.deepEqual(f.updates.map(update=>update.key),[legacyKey]);
    if(enabled) {
      f.reporter.failure(bad(),'publish','building','project-a');await tick();
      assert.equal(sent.length,1);assert.notEqual(sent[0].reportId,oldReport.reportId);
      assert.equal(f.updates[0].key,legacyKey);
    }
    f.reporter.dispose();
  }
});

function firstRunFixture(t, {globalValue, workspaceValue, telemetry=true, legacyMarker=false, failSave=false}={}) {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'zero-report-choice-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  if (legacyMarker) fs.writeFileSync(path.join(directory, 'public-reporting-choice-v1'), '');
  let current=globalValue;const notifications=[],writes=[],listeners=[],deliveries=[];
  const config={
    inspect:()=>({globalValue:current,workspaceValue,defaultValue:false}),
    get:()=>workspaceValue ?? current ?? false,
    update:async(key,value,target)=>{if(failSave)throw Error('settings unavailable');writes.push({key,value,target});current=value;for(const listener of listeners)listener({affectsConfiguration:()=>true});}
  };
  const vscode={ConfigurationTarget:{Global:1},ExtensionMode:{Development:2},
    workspace:{getConfiguration:()=>config,onDidChangeConfiguration:fn=>{listeners.push(fn);return {dispose(){}};}},
    env:{isTelemetryEnabled:telemetry,clipboard:{writeText:async()=>{}}},
    window:{showInformationMessage:async(...args)=>{notifications.push(args);}}};
  const storage=new Map();const context={extensionMode:2,globalStorageUri:{fsPath:directory},
    globalState:{get:key=>storage.get(key),update:async(key,value)=>{if(value===undefined)storage.delete(key);else storage.set(key,value);}}};
  const make=()=>createProblemReporter(vscode,context,{send:async(_,options)=>{deliveries.push(JSON.parse(options.body));return response();}});
  return {make,notifications,writes,deliveries,get current(){return current;},set current(value){current=value;for(const listener of listeners)listener({affectsConfiguration:()=>true});}};
}

test('the setup choice is saved only on continue, including an explicit opt-out', async t => {
  for (const allow of [true, false]) await t.test(String(allow), async t => {
    const f = firstRunFixture(t);
    let reporter = f.make();
    assert.equal(reporter.needsFirstRunChoice(), true);
    reporter.failure(bad(), 'publish', 'deploying');
    await tick();
    assert.deepEqual(f.deliveries, []);
    assert.deepEqual(f.writes, []);
    reporter.dispose();
    reporter = f.make();
    assert.equal(reporter.needsFirstRunChoice(), true);
    await reporter.saveFirstRunChoice(allow, () => true);
    assert.deepEqual(f.writes, [{key:'automaticPublicProblemReports', value:allow, target:1}]);
    assert.equal(reporter.needsFirstRunChoice(), false);
    assert.deepEqual(f.deliveries, []);
    reporter.failure(bad(), 'publish', 'deploying');
    await tick();
    assert.equal(f.deliveries.length, allow ? 1 : 0);
    assert.deepEqual(f.notifications, []);
    reporter.dispose();
    reporter = f.make();
    assert.equal(reporter.needsFirstRunChoice(), false);
    reporter.dispose();
  });
});

test('existing reporting choices and earlier popup offers survive updates', async t => {
  for (const options of [{globalValue:true}, {globalValue:false}, {legacyMarker:true}]) {
    await t.test(JSON.stringify(options), async t => {
      const f = firstRunFixture(t, options), reporter = f.make();
      assert.equal(reporter.needsFirstRunChoice(), false);
      await reporter.saveFirstRunChoice(true, () => true);
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.notifications, []);
      assert.equal(f.current, options.globalValue);
      reporter.dispose();
    });
  }
});

test('two windows can commit only one setup choice', async t => {
  const f = firstRunFixture(t), first = f.make(), second = f.make();
  await Promise.all([first.saveFirstRunChoice(false, () => true), second.saveFirstRunChoice(true, () => true)]);
  assert.equal(f.writes.length, 1);
  assert.equal(first.needsFirstRunChoice(), false);
  assert.equal(second.needsFirstRunChoice(), false);
  first.dispose();
  second.dispose();
});

test('a closed setup or changed preference invalidates an unfinished save', async t => {
  for (const action of ['setting', 'close', 'dispose']) await t.test(action, async t => {
    const f = firstRunFixture(t), reporter = f.make();
    let current = true;
    const saving = reporter.saveFirstRunChoice(true, () => current);
    if (action === 'setting') {f.current = false; f.current = undefined;}
    if (action === 'close') current = false;
    if (action === 'dispose') reporter.dispose();
    await saving;
    assert.deepEqual(f.writes, []);
    const reopened = f.make();
    assert.equal(reopened.needsFirstRunChoice(), true);
    reopened.dispose();
    reporter.dispose();
  });
});

test('setup save failures allow a retry and leave collection off', async t => {
  const f = firstRunFixture(t, {failSave:true}), reporter = f.make();
  await assert.rejects(reporter.saveFirstRunChoice(true, () => true), /settings unavailable/);
  assert.equal(reporter.needsFirstRunChoice(), true);
  reporter.failure(bad(), 'publish', 'deploying');
  await tick();
  assert.deepEqual(f.deliveries, []);
  reporter.dispose();
});

test('public consent sends a manual report directly even with telemetry disabled',async()=>{
  const sent=[];const f=fixture({enabled:true,telemetry:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return response();}});
  await f.reporter.manual();assert.equal(sent.length,1);assert.equal(sent[0].source,'manual');
  assert.equal(f.notifications.some(args=>args[0]==='Send this problem report?'),false);f.reporter.dispose();
});

test('a saved draft retries directly once public reporting is enabled',async()=>{
  const sent=[];let count=0;const f=fixture({enabled:false,send:async(_,options)=>{sent.push(JSON.parse(options.body));return ++count===1?{status:503}:response();}});
  f.answers.push('Send report');await f.reporter.manual();assert.equal(sent.length,1);
  const before=f.notifications.length;f.setEnabled(true);await f.reporter.manual();
  assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);
  assert.equal(f.notifications.slice(before).some(args=>args[0]==='A reviewed problem report is ready.'),false);f.reporter.dispose();
});

test('workspace-only settings do not authorize automatic or direct manual reports',async t=>{
  const f=firstRunFixture(t,{workspaceValue:true});const r=f.make();
  r.failure(bad(),'publish','building','project');await tick();
  await r.manual();
  assert.ok(f.notifications.some(args=>args[0]==='Send this problem report?'));
  assert.deepEqual(f.deliveries,[]);assert.deepEqual(f.writes,[]);r.dispose();
});

test('revoked consent requires public confirmation before a retained draft is retried',async()=>{
  const sent=[];let count=0;
  const f=fixture({enabled:true,send:async(_,options)=>{sent.push(JSON.parse(options.body));return ++count===1?{status:503}:response();}});
  f.reporter.recordManual('publish','deploying','WEB_PUBLISH_DEPLOYMENT_FAILED');
  await f.reporter.manual();assert.equal(sent.length,1);
  f.setEnabled(false);f.answers.push('Retry');await f.reporter.manual();
  assert.equal(sent.length,1,'Dismissing the public notice must not retry');
  const notice=f.notifications.at(-1);assert.equal(notice[0],'Send this problem report?');
  assert.match(notice[1].detail,/GitHub Pages deployment failed/);assert.match(notice[1].detail,/public GitHub issue/);
  f.answers.push('Retry','Send report');await f.reporter.manual();
  assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);f.reporter.dispose();
});

test('revoking consent during a send requires public confirmation before retry',async()=>{
  const sent=[];let release;
  const first=new Promise(resolve=>{release=resolve;});
  const f=fixture({enabled:true,timeoutMs:1000,send:async(_,options)=>{sent.push(JSON.parse(options.body));return sent.length===1?first:response();}});
  f.reporter.recordManual('publish','deploying','WEB_PUBLISH_DEPLOYMENT_FAILED');
  const attempt=f.reporter.manual();for(let i=0;i<30&&!sent.length;i++)await tick();assert.equal(sent.length,1);
  f.setEnabled(false);f.answers.push('Retry');release({status:503});await attempt;
  assert.equal(sent.length,1);assert.match(f.notifications.at(-1)[1].detail,/public GitHub issue/);
  f.answers.push('Retry','Send report');await f.reporter.manual();
  assert.equal(sent.length,2);assert.equal(sent[1].reportId,sent[0].reportId);f.reporter.dispose();
});

test('revocation while a retry prompt is open is checked before transmission',async()=>{
  const sent=[];let finishRetry,openedRetry;
  const retryOpened=new Promise(resolve=>{openedRetry=resolve;});
  const pendingRetry=new Promise(resolve=>{finishRetry=resolve;});
  const f=fixture({enabled:true,send:async(_,options)=>{sent.push(JSON.parse(options.body));return sent.length===1?{status:503}:response();}});
  f.reporter.recordManual('publish','deploying','WEB_PUBLISH_DEPLOYMENT_FAILED');
  f.vscode.window.showInformationMessage=async(...args)=>{
    f.notifications.push(args);
    if(args[0]==='Problem report could not be confirmed.'){openedRetry();return pendingRetry;}
    return f.answers.shift();
  };
  const attempt=f.reporter.manual();await retryOpened;f.setEnabled(false);finishRetry('Retry');await attempt;
  assert.equal(sent.length,1);assert.match(f.notifications.at(-1)[1].detail,/public GitHub issue/);
  f.answers.push('Retry','Send report');await f.reporter.manual();
  assert.equal(sent.length,2);assert.deepEqual(sent[1],sent[0]);f.reporter.dispose();
});
