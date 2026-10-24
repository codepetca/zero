'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createWebPublishCommands}=require('../src/web-publish-ui');
function fixture(t,{resolveProject,cancelUpload=false,uploadResult={uploaded:true,head:'a'.repeat(40)},uploadError}={}) {
  let simulation=false,busy=false,active='/student',reviewed=0,published=0,checks=0,setup=false,upgrade=false,uploaded=0,sha='a'.repeat(40);
  const messages=[],states=[],copied=[],opened=[],authCalls=[],choices=[];
  const stored=new Map(),workspaceState={get:key=>stored.get(key),update:async(key,value)=>{if(value===undefined)stored.delete(key);else stored.set(key,JSON.parse(JSON.stringify(value)));}};
  const session={id:'native',account:{id:'1',label:'student'},accessToken:'TEST',scopes:[]};
  const vscode={workspace:{isTrusted:true},authentication:{getSession:async(...args)=>{authCalls.push(args);return session;},onDidChangeSessions:()=>({dispose(){}})},window:{showInformationMessage:async(...args)=>{messages.push(args);return choices.shift();}},env:{clipboard:{writeText:async url=>copied.push(url)},openExternal:async uri=>{opened.push(uri);return true;}},Uri:{parse:url=>url}};
  const auth={capture:async()=>({session:{accountId:'1'}}),assertCurrent:async()=>{}};
  const repositories={access:async(url,options)=>{authCalls.push({url,...options});}};
  const review=()=>({status:'review',setup,upgrade:upgrade?{files:['.zero-web/README.md','.zero-web/owner.json'],previousSha:sha}:undefined,repository:'https://github.com/student/game',publicUrl:'https://student.github.io/game/',sha,account:'1'});
  const calls=[];
  const publisher={review:async()=>{calls.push('review');reviewed++;return review();},setup:async()=>{calls.push('setup');return {status:'upload-required',message:'Upload setup'};},publish:async()=>{calls.push('publish');published++;return {status:'pending',resume:{runId:42}};},check:async()=>{checks++;return {status:'live',url:'https://student.github.io/game/',sha,resume:{runId:42,sha,repository:'https://github.com/student/game'}};}};
  publisher.update=async()=>{calls.push('update');return {status:'upload-required',message:'Updated publishing files'};};
  publisher.verifyLink=async()=>publisher.check();
  const api=createWebPublishCommands(vscode,{project:resolveProject || (async()=>active),authentication:auth,repositories,workspaceState,isSimulation:()=>simulation,isBusy:()=>busy,setBusy:v=>{busy=v;},setState:message=>states.push(message),publisherFactory:()=>publisher,uploadChanges:async(_auth,options)=>{assert.equal(busy,false);assert.equal(options.forPublish,true);assert.equal(options.expectedRoot,active);await options.assertPublishCurrent();uploaded++;setup=false;upgrade=false;if(uploadError)throw uploadError;if(cancelUpload)return;sha=uploadResult.head;return uploadResult;},pollIntervalMs:0,maxChecks:2});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));
  return {api,choices,vscode,workspaceState,stored,messages,states,copied,opened,calls,authCalls,set simulation(v){simulation=v;},set setup(v){setup=v;},set upgrade(v){upgrade=v;},set active(v){active=v;},get busy(){return busy;},get reviewed(){return reviewed;},get published(){return published;},get checks(){return checks;},get uploaded(){return uploaded;},publisher};
}
test('simulation publish never saves, authenticates, writes setup or calls publisher',async t=>{
  const h=fixture(t);h.simulation=true;const result=await h.api.publish();assert.equal(result.status,'simulated');assert.deepEqual(h.calls,[]);assert.deepEqual(h.authCalls,[]);assert.equal(h.busy,false);
});
test('publish completion reports in sidebar and its verified copy command remains available',async t=>{
  const h=fixture(t);h.choices.push('Publish app');const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(h.reviewed,1);assert.equal(h.published,1);assert.equal(h.uploaded,0);assert.equal(h.checks,1);assert.deepEqual(h.copied,[]);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
  assert.equal(h.states.at(-1),'App published');assert.equal(h.messages.length,1,'Only first-publish warning remains');
  await h.api.commands['zero.copyPublishedWebLink']();assert.deepEqual(h.copied,['https://student.github.io/game/']);
  const warning=h.messages.find(message=>message[1]?.modal);
  assert.equal(warning[0],'Publish this app publicly?');
  assert.equal(warning[1].detail,'Your app and included assets will be public.\nhttps://student.github.io/game/');
});
test('first setup warns once, checks App workflow access, uploads and revalidates before publishing',async t=>{
  const h=fixture(t);h.setup=true;h.choices.push('Publish app');const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(h.uploaded,1);assert.deepEqual(h.calls,['review','review','setup','review','publish']);assert.deepEqual(h.authCalls.map(call=>call.permissions),[{contents:'write',workflows:'write'}]);assert.equal(h.messages.filter(m=>m[1]?.modal).length,1);
});
test('cancelled consent and project drift never publish or expose a URL',async t=>{
  const h=fixture(t);await h.api.publish();assert.equal(h.published,0);assert.deepEqual(h.authCalls,[]);
  h.vscode.window.showInformationMessage=async()=>{h.active='/other';return 'Publish app';};await assert.rejects(h.api.publish(),/project changed/);assert.equal(h.published,0);assert.deepEqual(h.copied,[]);assert.equal(h.busy,false);
});
test('failed and still-pending deployments never copy a link',async t=>{
  const h=fixture(t);h.choices.push('Publish app');h.publisher.check=async()=>({status:'failed',message:'Build failed'});assert.equal((await h.api.publish()).status,'failed');assert.deepEqual(h.copied,[]);
  h.choices.push('Publish app');h.publisher.check=async value=>({status:'pending',resume:value,message:'Waiting'});assert.equal((await h.api.publish()).status,'pending');assert.deepEqual(h.copied,[]);assert.equal(h.busy,false);
});

test('prior verified live link persists through failed update and works after editor restart',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const saved=h.workspaceState.get('zero.webPublish.lastLive');assert.equal(saved.url,'https://student.github.io/game/');
  h.choices.push('Publish app');const originalCheck=h.publisher.check;h.publisher.check=async()=>({status:'failed',message:'Build failed'});await h.api.publish();assert.deepEqual(h.workspaceState.get('zero.webPublish.lastLive'),saved);
  h.publisher.check=originalCheck;
  const restarted=createWebPublishCommands(h.vscode,{project:async()=>'/student',workspaceState:h.workspaceState,isSimulation:()=>false,publisherFactory:()=>h.publisher});t.after(()=>restarted.disposables.forEach(d=>d.dispose()));
  await restarted.commands['zero.copyPublishedWebLink']();assert.deepEqual(h.copied,['https://student.github.io/game/']);
  await restarted.commands['zero.openPublishedWeb']();assert.deepEqual(h.opened,['https://student.github.io/game/']);
});

test('later publish revalidates the same approved destination with one command',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const modalCount=h.messages.filter(message=>message[1]?.modal).length;
  await h.api.publish();assert.equal(h.published,2);assert.equal(h.reviewed,2);assert.equal(h.messages.filter(message=>message[1]?.modal).length,modalCount);
});

test('repository reconnect can forget a stale pending run without publishing or losing the prior link',async t=>{
  const h=fixture(t),pending={root:'/student',value:{runId:42,sha:'a'.repeat(40),repository:'https://github.com/student/old-game'}};
  const previous={root:'/student',url:'https://student.github.io/old-game/'};
  h.stored.set('zero.webPublish.pending',pending);h.stored.set('zero.webPublish.lastLive',previous);
  h.publisher.restore=async()=>{const error=Error('Repository changed');error.code='WEB_PUBLISH_REPOSITORY_CHANGED';throw error;};
  assert.equal((await h.api.publish()).status,'action-required');assert.deepEqual(h.stored.get('zero.webPublish.pending'),pending);
  h.choices.push('Forget saved run');assert.equal((await h.api.publish()).status,'reset');
  assert.equal(h.stored.has('zero.webPublish.pending'),false);assert.deepEqual(h.stored.get('zero.webPublish.lastLive'),previous);
  assert.equal(h.reviewed,0);assert.equal(h.published,0);
  h.choices.push('Publish app');assert.equal((await h.api.publish()).status,'live');assert.equal(h.reviewed,1);assert.equal(h.published,1);
});
test('transient pending-run errors preserve tracking for a later retry',async t=>{
  const h=fixture(t),pending={root:'/student',value:{runId:42}};h.stored.set('zero.webPublish.pending',pending);
  h.publisher.restore=async()=>{throw Error('Connection unavailable');};
  await assert.rejects(h.api.publish(),/Connection unavailable/);assert.deepEqual(h.stored.get('zero.webPublish.pending'),pending);assert.equal(h.busy,false);
});
test('Publish, Copy and Open claim one operation before awaiting project resolution',async t=>{
  let release,gate=new Promise(resolve=>{release=resolve;});const h=fixture(t,{resolveProject:()=>gate});h.choices.push('Publish app');
  const first=h.api.publish();
  await Promise.all([h.api.publish(),h.api.commands['zero.copyPublishedWebLink'](),h.api.commands['zero.openPublishedWeb']()]);
  assert.equal(h.reviewed,0);assert.equal(h.busy,true);release('/student');await first;
  assert.equal(h.reviewed,1);assert.equal(h.published,1);
  gate=new Promise(resolve=>{release=resolve;});const copy=h.api.commands['zero.copyPublishedWebLink']();
  await Promise.all([h.api.publish(),h.api.commands['zero.copyPublishedWebLink'](),h.api.commands['zero.openPublishedWeb']()]);
  release('/student');await copy;assert.equal(h.checks,2);assert.deepEqual(h.copied,['https://student.github.io/game/']);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
});

test('sharing receives an exact verified publication without editing metadata or another dialog',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const messages=h.messages.length;
  const web=await h.api.verifiedPublication('/student','a'.repeat(40));
  assert.deepEqual(web,{provider:'github-pages',url:'https://student.github.io/game/',commit:'a'.repeat(40),runId:42});
  assert.equal(h.messages.length,messages);assert.equal(h.checks,2);assert.equal(h.published,1);assert.equal(h.busy,false);
});
test('missing, stale or simulated sharing receipts do not authenticate or request a page',async t=>{
  const h=fixture(t);h.publisher.verifyLink=async()=>assert.fail('Unexpected page lookup');
  assert.equal(await h.api.verifiedPublication('/student','a'.repeat(40)),undefined);
  h.stored.set('zero.webPublish.lastLive',{root:'/student',sha:'b'.repeat(40)});
  assert.equal(await h.api.verifiedPublication('/student','a'.repeat(40)),undefined);
  h.simulation=true;assert.equal(await h.api.verifiedPublication('/student','b'.repeat(40)),undefined);assert.deepEqual(h.authCalls,[]);
});
test('nested sharing verification keeps the outer operation lock and rejects mode or project drift',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
  const api=createWebPublishCommands(h.vscode,{project:async()=>'/student',workspaceState:h.workspaceState,isSimulation:()=>false,isBusy:()=>true,publisherFactory:()=>h.publisher});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));assert.equal((await api.verifiedPublication('/student','a'.repeat(40))).runId,42);
  h.publisher.verifyLink=async()=>{h.simulation=true;return {status:'live',sha:'a'.repeat(40),url:'https://student.github.io/game/',resume:{runId:42}};};
  assert.equal(await h.api.verifiedPublication('/student','a'.repeat(40)),undefined);assert.equal(h.busy,false);
  h.simulation=false;h.active='/other';await assert.rejects(h.api.verifiedPublication('/student','a'.repeat(40)),/project changed/);assert.equal(h.busy,false);
});

test('an unavailable optional saved publication returns source-only while cancellation and project guards remain binding',async t=>{
  for(const code of ['WEB_PUBLISH_REPOSITORY_CHANGED','HTTP_UNAVAILABLE']) {
    const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
    h.publisher.verifyLink=async()=>{const error=new Error('Saved publication unavailable');error.code=code;throw error;};
    assert.equal(await h.api.verifiedPublication('/student','a'.repeat(40)),undefined);
    assert.equal(h.busy,false);assert.match(h.states.at(-1),/Sharing source only/);
  }
  const cancelled=fixture(t);cancelled.choices.push('Publish app');await cancelled.api.publish();
  cancelled.publisher.verifyLink=async()=>{cancelled.api.disposables[0].dispose();throw Error('Interrupted');};
  await assert.rejects(cancelled.api.verifiedPublication('/student','a'.repeat(40)),/cancelled/);assert.equal(cancelled.busy,false);
  const drift=fixture(t);drift.choices.push('Publish app');await drift.api.publish();
  drift.publisher.verifyLink=async()=>{drift.active='/other';throw Error('Unavailable');};
  await assert.rejects(drift.api.verifiedPublication('/student','a'.repeat(40)),/project changed/);assert.equal(drift.busy,false);
});

test('unresolved predispatch staging survives errors and is cleaned before a new review',async t=>{
  const h=fixture(t),stage={sha:'a'.repeat(40),repository:'https://github.com/student/game',staging:{tag:'zero-web-stage-'+'b'.repeat(32)}};
  h.choices.push('Publish app');h.publisher.publish=async(review,options)=>{await options.onStaging(stage);throw Error('creation response uncertain');};
  await assert.rejects(h.api.publish(),/uncertain/);assert.deepEqual(h.stored.get('zero.webPublish.staging'),{root:'/student',value:stage});
  let cleaned=false;h.publisher.cleanup=async(root,saved)=>{assert.equal(root,'/student');assert.deepEqual(saved,stage);cleaned=true;};
  h.publisher.review=async()=>{assert.equal(cleaned,true);return {status:'action-required'};};
  await h.api.publish();assert.equal(h.stored.has('zero.webPublish.staging'),false);
});
test('dispatch tracking persists before publish returns, so subsequent errors cannot start a duplicate run',async t=>{
  const h=fixture(t),value={runId:42,sha:'a'.repeat(40),repository:'https://github.com/student/game'};
  h.choices.push('Publish app');let count=0;h.publisher.publish=async(review,options)=>{count++;await options.onStaging({staging:{tag:'temporary'}});await options.onPending(value);throw Error('editor interrupted');};
  await assert.rejects(h.api.publish(),/interrupted/);assert.deepEqual(h.stored.get('zero.webPublish.pending'),{root:'/student',value,account:'1'});assert.equal(h.stored.has('zero.webPublish.staging'),false);
  h.publisher.restore=async(root,saved)=>{assert.deepEqual(saved,value);return {status:'live',resume:value,url:'https://student.github.io/game/',sha:value.sha};};
  await h.api.publish();assert.equal(count,1);assert.equal(h.stored.has('zero.webPublish.pending'),false);
});
test('unsaved project documents must save before source review; cancelled saves do not publish',async t=>{
  const h=fixture(t);h.vscode.workspace.textDocuments=[{isDirty:true}];let saved=0;h.vscode.workspace.saveAll=async()=>{saved++;return false;};
  await assert.rejects(h.api.publish(),/Save your project/);assert.equal(saved,1);assert.equal(h.reviewed,0);assert.equal(h.published,0);
  h.simulation=true;await h.api.publish();assert.equal(saved,1,'Simulation never saves editor buffers');
});

// Removing the second setup confirmation must not approve a different destination.
test('setup rejects destination and account drift before or after upload',async t=>{
  for(const phase of [2,3])for(const [field,value] of Object.entries({repository:'https://github.com/student/other',account:'other',publicUrl:'https://student.github.io/other/',needsPages:true})) {
    await t.test(`${field} at review ${phase}`,async t=>{
      const h=fixture(t);h.setup=true;h.choices.push('Publish app');
      const original=h.publisher.review;let calls=0;
      h.publisher.review=async()=>{const review=await original();return ++calls===phase?{...review,[field]:value}:review;};
      await assert.rejects(h.api.publish(),/account or destination changed/);
      assert.equal(h.published,0);assert.equal(h.busy,false);
      assert.equal(h.uploaded,phase===3?1:0);
    });
  }
});
test('a different repository, account or public URL asks for consent again',async t=>{
  for(const [field,value] of Object.entries({repository:'https://github.com/student/other',account:'other',publicUrl:'https://student.github.io/other/'})) {
    await t.test(field,async t=>{
      const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
      const original=h.publisher.review;h.publisher.review=async()=>({...await original(),[field]:value});
      await h.api.publish();assert.equal(h.published,1,'Cancelled warning must not publish to a changed destination');
      assert.equal(h.messages.filter(message=>message[1]?.modal).length,2);
    });
  }
});

test('setup cancellation stops even when another Git action finishes the setup',async t=>{
  const h=fixture(t,{cancelUpload:true});h.setup=true;h.choices.push('Publish app');
  await h.api.publish();assert.equal(h.uploaded,1);assert.equal(h.reviewed,2);assert.equal(h.published,0);assert.equal(h.busy,false);
});
test('setup publication is pinned to its successfully uploaded commit',async t=>{
  const h=fixture(t);h.setup=true;h.choices.push('Publish app');
  const original=h.publisher.review;let reviews=0;
  h.publisher.review=async()=>({...await original(),sha:++reviews===3?'b'.repeat(40):'a'.repeat(40)});
  await assert.rejects(h.api.publish(),/version changed after the setup upload/);
  assert.equal(h.published,0);assert.equal(h.uploaded,1);assert.equal(h.busy,false);
});
test('a pending publish retains its approved account across restart and repeat publication',async t=>{
  const h=fixture(t);h.choices.push('Publish app');const ready=h.publisher.check;
  h.publisher.check=async value=>({status:'pending',resume:value});await h.api.publish();
  assert.equal(h.stored.get('zero.webPublish.pending').account,'1');
  const warnings=h.messages.filter(message=>message[1]?.modal).length;
  h.publisher.check=ready;
  const restarted=createWebPublishCommands(h.vscode,{project:async()=>'/student',workspaceState:h.workspaceState,isSimulation:()=>false,publisherFactory:()=>h.publisher,pollIntervalMs:0});
  t.after(()=>restarted.disposables.forEach(d=>d.dispose()));
  await restarted.publish();assert.equal(h.stored.get('zero.webPublish.lastLive').account,'1');
  await restarted.publish();assert.equal(h.published,2);
  assert.equal(h.messages.filter(message=>message[1]?.modal).length,warnings);
});

test('setup may create a new commit and publishes that exact upload receipt',async t=>{
  const h=fixture(t,{uploadResult:{uploaded:true,head:'b'.repeat(40)}});h.setup=true;h.choices.push('Publish app');
  const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(result.sha,'b'.repeat(40));
  assert.equal(h.published,1);assert.equal(h.messages.filter(message=>message[1]?.modal).length,1);
});

test('first destination consent survives a cancelled setup upload and later restart',async t=>{
  const h=fixture(t,{cancelUpload:true});h.setup=true;h.choices.push('Publish app');
  await h.api.publish();assert.equal(h.published,0);assert.equal(h.messages.filter(m=>m[1]?.modal).length,1);
  const restarted=createWebPublishCommands(h.vscode,{project:async()=>'/student',authentication:{capture:async()=>({session:{accountId:'1'}})},workspaceState:h.workspaceState,isSimulation:()=>false,publisherFactory:()=>h.publisher,pollIntervalMs:0,maxChecks:2});
  t.after(()=>restarted.disposables.forEach(d=>d.dispose()));
  await restarted.publish();assert.equal(h.published,1);assert.equal(h.messages.filter(m=>m[1]?.modal).length,1);
  assert.ok(h.authCalls.every(call=>call.ticket.session.accountId==='1'));
});

test('upgrade asks for file-update consent then uploads and re-reviews the exact new commit at the same destination',async t=>{
  const h=fixture(t,{uploadResult:{uploaded:true,head:'b'.repeat(40)}});h.upgrade=true;
  h.stored.set('zero.webPublish.approval',{root:'/student',account:'1',repository:'https://github.com/student/game',url:'https://student.github.io/game/'});
  h.choices.push('Update publishing files');const result=await h.api.publish();
  assert.equal(result.status,'live');assert.equal(result.sha,'b'.repeat(40));assert.deepEqual(h.calls,['review','review','update','review','publish']);
  assert.equal(h.messages.length,1);assert.equal(h.messages[0][0],'Update publishing files?');
  assert.match(h.messages[0][1].detail,/README.md[\s\S]*owner.json[\s\S]*destination stay the same[\s\S]*Git history/);
});
test('cancelled upgrade decision never authorizes workflows, updates files, uploads or publishes',async t=>{
  const h=fixture(t);h.upgrade=true;h.choices.push('Publish app');
  await h.api.publish();assert.deepEqual(h.calls,['review']);assert.equal(h.uploaded,0);assert.deepEqual(h.authCalls,[]);
});
test('upgrade cancellation during upload preserves normal upload semantics and skips publish',async t=>{
  const h=fixture(t,{cancelUpload:true});h.upgrade=true;h.choices.push('Publish app','Update publishing files');
  await h.api.publish();assert.deepEqual(h.calls,['review','review','update']);assert.equal(h.uploaded,1);assert.equal(h.published,0);
});
test('upgrade rejects project and kit drift after consent or workflow authorization',async t=>{
  const h=fixture(t);h.upgrade=true;
  h.vscode.window.showInformationMessage=async message=>{if(message==='Update publishing files?')h.active='/other';return message==='Update publishing files?'?'Update publishing files':'Publish app';};
  await assert.rejects(h.api.publish(),/project changed/);assert.equal(h.uploaded,0);
  const kit=fixture(t);kit.upgrade=true;kit.choices.push('Publish app','Update publishing files');
  const original=kit.publisher.review;let n=0;kit.publisher.review=async()=>{const r=await original();if(++n===2)r.upgrade={...r.upgrade,files:['different']};return r;};
  await assert.rejects(kit.api.publish(),/kit changed/);assert.equal(kit.uploaded,0);assert.ok(!kit.calls.includes('update'));
});

function requireUploadOnce(h) {
  const original=h.publisher.review;
  let first=true;
  h.publisher.review=async()=>{
    if(first){first=false;throw Object.assign(new Error('Commit & push first'),{code:'WEB_PUBLISH_UPLOAD_REQUIRED',plan:{branch:'main'}});}
    return original();
  };
}
test('Publish uploads pending source once, revalidates its exact commit, then deploys',async t=>{
  const h=fixture(t,{uploadResult:{uploaded:true,head:'b'.repeat(40)}});requireUploadOnce(h);h.choices.push('Publish app');
  assert.equal((await h.api.publish()).status,'live');assert.equal(h.uploaded,1);assert.equal(h.published,1);
  assert.equal(h.stored.get('zero.webPublish.lastLive').sha,'b'.repeat(40));
  assert.equal(h.stored.get('zero.webPublish.lastLive').url,'https://student.github.io/game/');
});
test('cancelled or failed source upload never proceeds to deployment',async t=>{
  for(const options of [{cancelUpload:true},{uploadError:Error('Push failed; local commit preserved')}]) {
    const h=fixture(t,options);requireUploadOnce(h);h.choices.push('Publish app');
    if(options.uploadError)await assert.rejects(h.api.publish(),/Push failed/);else await h.api.publish();
    assert.equal(h.uploaded,1);assert.equal(h.published,0);assert.equal(h.busy,false);assert.equal(h.stored.has('zero.webPublish.lastLive'),false);
  }
});
test('change branches and unrelated review errors do not invoke the uploader',async t=>{
  const h=fixture(t);h.publisher.review=async()=>{throw Error('Finish your change with Merge to main before publishing the app.');};
  await assert.rejects(h.api.publish(),/Merge to main/);assert.equal(h.uploaded,0);assert.equal(h.published,0);
});
test('a different source commit after upload stops before public deployment',async t=>{
  const h=fixture(t);const original=h.publisher.review;requireUploadOnce(h);
  const uploadReview=h.publisher.review;let calls=0;h.publisher.review=async()=>++calls===1?uploadReview():({...await original(),sha:'c'.repeat(40)});
  await assert.rejects(h.api.publish(),/version changed after upload/);assert.equal(h.uploaded,1);assert.equal(h.published,0);
});
test('disabling live mode during save prevents upload and deployment',async t=>{
  const h=fixture(t);h.vscode.workspace.textDocuments=[{isDirty:true}];h.vscode.workspace.saveAll=async()=>{h.simulation=true;return true;};
  await assert.rejects(h.api.publish(),/Live publishing was disabled/);assert.equal(h.reviewed,0);assert.equal(h.uploaded,0);assert.equal(h.published,0);
});

test('Publish never invokes an obsolete automatic helper preparer',async t=>{
 const h=fixture(t);requireUploadOnce(h);h.choices.push('Publish app');
 h.publisher.prepare=async()=>assert.fail('Opening or publishing must preserve project helpers');
 assert.equal((await h.api.publish()).status,'live');assert.equal(h.uploaded,1);
});
