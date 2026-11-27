'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createWebPublishCommands}=require('../src/web-publish-ui');
function dirtyDocument({file='/student/src/main/java/Main.java',scheme='file',save}={}) {
  const document={isDirty:true,uri:{scheme,fsPath:file}};
  document.save=save||async function(){document.isDirty=false;return true;};
  return document;
}
function fixture(t,{resolveProject,connectedRepository=()=>'https://github.com/student/game',cancelUpload=false,uploadResult={uploaded:true,head:'a'.repeat(40)},uploadError,beforeBuildReview,onToolingDecision,listPublication,onReportFailure,onReportStage,onReportSuccess,gameJam,onUpload=async()=>{}}={}) {
  let simulation=false,busy=false,active='/student',reviewed=0,published=0,checks=0,setup=false,upgrade=false,uploaded=0,sha='a'.repeat(40);
  const progress=[],messages=[],states=[],copied=[],opened=[],authCalls=[],choices=[];
  const stored=new Map(),workspaceState={get:key=>stored.get(key),update:async(key,value)=>{if(value===undefined)stored.delete(key);else stored.set(key,JSON.parse(JSON.stringify(value)));}};
  const session={id:'native',account:{id:'1',label:'student'},accessToken:'TEST',scopes:[]};
  const vscode={workspace:{isTrusted:true},authentication:{getSession:async(...args)=>{authCalls.push(args);return session;},onDidChangeSessions:()=>({dispose(){}})},window:{showInformationMessage:async(...args)=>{messages.push(args);return choices.shift();}},env:{clipboard:{writeText:async url=>copied.push(url)},openExternal:async uri=>{opened.push(uri);return true;}},Uri:{parse:url=>url}};
  vscode.window.showWarningMessage=vscode.window.showInformationMessage;
  const auth={capture:async()=>({session:{accountId:'1'}}),assertCurrent:async()=>{},assertCurrentNow:()=>({accountId:'1'})};
  const repositories={access:async(url,options)=>{authCalls.push({url,...options});}};
  const review=()=>({status:'review',root:active,setup,upgrade:upgrade?{files:['.zero-web/README.md','.zero-web/owner.json'],previousSha:sha}:undefined,repository:'https://github.com/student/game',repositoryId:24,publicUrl:'https://student.github.io/game/',sha,account:'1'});
  const calls=[];
  const uploadPlan={head:sha,fingerprint:'publishing-files'};
  const publisher={review:async()=>{calls.push('review');reviewed++;return review();},setup:async()=>{calls.push('setup');return {status:'upload-required',message:'Upload setup',uploadPlan};},publish:async()=>{calls.push('publish');published++;return {status:'pending',resume:{runId:42}};},check:async()=>{checks++;return {status:'live',url:'https://student.github.io/game/',sha,resume:{runId:42,sha,repository:'https://github.com/student/game',repositoryId:24}};}};
  publisher.update=async()=>{calls.push('update');return {status:'upload-required',message:'Updated publishing files',uploadPlan};};
  publisher.verifyLink=async()=>publisher.check();
  publisher.verifyCurrent=async(reviewed,saved,{beforeFinalCheck,onCurrent}={})=>{
    if(!saved || saved.root!==active || saved.account!==reviewed.account || saved.sha!==reviewed.sha || saved.url!==reviewed.publicUrl || saved.resume?.repository!==reviewed.repository || reviewed.setup || reviewed.upgrade)return {status:'stale'};
    await beforeFinalCheck?.();
    if(reviewed.sha!==sha)throw Error('The app changed while checking its published version.');
    const live=await publisher.check();if(live.status==='live')onCurrent?.(live);return live;
  };
  const api=createWebPublishCommands(vscode,{onToolingDecision,onReportFailure,onReportStage,onReportSuccess,project:resolveProject || (async()=>active),connectedRepository,assertProjectNow:expected=>{if(active!==expected)throw Error('The project changed.');},authentication:auth,repositories,workspaceState,beforeBuildReview,listPublication,gameJam:gameJam&&{recover:async()=>null,...gameJam},isSimulation:()=>simulation,isBusy:()=>busy,setBusy:v=>{busy=v;},setState:message=>states.push(message),setProgress:value=>progress.push(value),publisherFactory:()=>publisher,uploadChanges:async(_auth,options)=>{assert.equal(busy,false);assert.equal(options.forPublish,true);assert.equal(options.expectedRoot,active);assert.equal(options.expectedPlan,uploadPlan);assert.equal(options.expectedAccount,'1');await options.assertPublishCurrent();await onUpload(options);uploaded++;setup=false;upgrade=false;if(uploadError)throw uploadError;if(cancelUpload)return;sha=uploadResult.head;return uploadResult;},pollIntervalMs:0,maxChecks:2});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));
  return {api,auth,progress,choices,vscode,workspaceState,stored,messages,states,copied,opened,calls,authCalls,set simulation(v){simulation=v;},set setup(v){setup=v;},set upgrade(v){upgrade=v;},set active(v){active=v;},set sha(v){sha=v;},get busy(){return busy;},get reviewed(){return reviewed;},get published(){return published;},get checks(){return checks;},get uploaded(){return uploaded;},publisher};
}
const ordinaryTarget={root:'/student',account:'1',repository:'https://github.com/student/game',repositoryId:'24'};
const linkedJam={root:'/student',id:'jam-42',entryRevision:'',title:'Toast to the Moon',revision:'b'.repeat(64),account:'1',
  repository:'https://github.com/student/game',repositoryId:'24',submissionsOpen:true,submissionsCloseAt:'2030-11-30T12:00:00Z'};

test('Publish to Jam submits the verified Pages build and never replaces a ZeroHub listing',async t=>{
  const submissions=[];
  const h=fixture(t,{listPublication:async()=>assert.fail('Jam publishing must not list on ZeroHub'),gameJam:{
    resolve:async(root,{beforeSend})=>{assert.equal(root,'/student');beforeSend();return linkedJam;},
    submit:async(destination,live,{beforeSend})=>{
      beforeSend();assert.equal(destination,linkedJam);submissions.push(live);return {status:'submitted'};
    }
  }});
  h.choices.push('Publish to Jam');
  const first=await h.api.publishAndOpen();
  assert.equal(first.jamSubmission.status,'submitted');
  assert.equal(submissions[0].resume.runId,42);
  assert.equal(submissions[0].url,'https://student.github.io/game/');
  assert.equal(h.states.at(-1),'Submitted to Toast to the Moon');
  assert.equal(h.messages[0][0],'Publish to Toast to the Moon?');
  assert.equal(h.published,1);
  assert.deepEqual(h.opened,[submissions[0].url]);
  assert.equal((await h.api.publishAndOpen()).alreadyCurrent,true);
  assert.equal(h.published,1);
  assert.equal(h.messages.length,1);
  assert.equal(submissions.length,2);
});

test('earlier Jam submission recovery after close does not rebuild or deploy another version',async t=>{
  let priorSubmission=false;
  const h=fixture(t,{gameJam:{
    resolve:async()=>({...linkedJam,submissionsOpen:!priorSubmission,submissionsCloseAt:'2020-11-30T12:00:00Z'}),
    recover:async()=>priorSubmission?{status:'submitted'}:null,
    submit:async()=>{priorSubmission=true;return {status:'pending'};}
  }});
  h.choices.push('Publish to Jam');
  assert.equal((await h.api.publishAndOpen()).jamSubmission.status,'pending');
  assert.match(h.states.at(-1),/Game published.*pending/);
  assert.equal((await h.api.publishAndOpen()).jamSubmission.status,'submitted');
  assert.equal(h.published,1);
  assert.equal(h.opened.length,1);
  assert.match(h.states.at(-1),/Earlier submission.*confirmed/);
});

test('closed Jam, cancelled approval and mismatched repository never publish',async t=>{
  const submit=async()=>assert.fail('Do not submit');
  const blocked=fixture(t,{gameJam:{resolve:async()=>({...linkedJam,submissionsOpen:false,submissionsCloseAt:'2020-11-30T12:00:00Z'}),submit}});
  assert.equal((await blocked.api.publishAndOpen()).status,'action-required');
  assert.match(blocked.states.at(-1),/Submissions closed/);
  assert.equal(blocked.reviewed,0);
  const cancelled=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit}});
  await cancelled.api.publishAndOpen();
  assert.equal(cancelled.published,0);
  const mismatch=fixture(t,{gameJam:{resolve:async()=>({...linkedJam,repositoryId:'99'}),submit}});
  await assert.rejects(mismatch.api.publishAndOpen(),/repository changed/);
  assert.equal(mismatch.published,0);
});

test('closed or upcoming Jam permits an explicit Pages-only publish without changing its entry',async t=>{
  for(const submissionsCloseAt of ['2020-11-30T12:00:00Z','2030-11-30T12:00:00Z'])await t.test(submissionsCloseAt,async t=>{
    let recovered=0,open=false;
    const h=fixture(t,{listPublication:async()=>assert.fail('Pages-only must not list on ZeroHub'),gameJam:{
      resolve:async()=>({...linkedJam,submissionsOpen:open,submissionsCloseAt}),
      recover:async()=>{recovered++;return null;},
      submit:async()=>assert.fail('Pages-only must not submit to a jam')
    }});
    h.choices.push('Publish to web only','Publish app');
    const result=await h.api.publishAndOpen();
    assert.equal(result.status,'live');
    assert.equal(result.jamSubmission,undefined);
    assert.equal(recovered,1,'check earlier submission before allowing a new publication');
    assert.equal(h.published,1);
    assert.equal(h.stored.has('zero.webPublish.jamApproval'),false);
    assert.equal(h.stored.get('zero.webPublish.lastLive').listingPending,undefined);
    open=true;
    await h.api.publishAndOpen();
    assert.equal(h.messages.at(-1)[0],`Publish to ${linkedJam.title}?`);
    assert.equal(h.published,1,'Pages-only consent cannot authorize a jam submission');
  });
});

test('ambiguous Jam permits only an explicit identity-bound Pages-only publish',async t=>{
  const routingError=()=>Object.assign(Error('Multiple jams'),{code:'ZERO_JAM_DESTINATION_AMBIGUOUS',publishTarget:ordinaryTarget});
  const h=fixture(t,{listPublication:async()=>assert.fail('Do not list a Pages-only publish'),gameJam:{
    resolve:async()=>{throw routingError();},
    recover:async()=>assert.fail('Ambiguity cannot authorize jam recovery'),
    submit:async()=>assert.fail('Ambiguity cannot authorize jam submission')
  }});
  await h.api.publishAndOpen();
  assert.equal(h.published,0,'cancelled fallback cannot deploy');
  h.choices.push('Publish to web only','Publish app');
  assert.equal((await h.api.publishAndOpen()).status,'live');
  assert.equal(h.published,1);
  assert.equal(h.messages[0][0],'Choose a Game Jam before submitting.');
  assert.equal(h.stored.has('zero.webPublish.jamApproval'),false);
  const original=h.publisher.review;
  h.publisher.review=async()=>({...await original(),repositoryId:25});
  h.choices.push('Publish to web only');
  await assert.rejects(h.api.publishAndOpen(),/account or repository changed/);
  assert.equal(h.published,1);
});

test('ambiguous Jam does not bypass a saved dispatch recovery',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>{throw Object.assign(Error('Multiple jams'),{
    code:'ZERO_JAM_DESTINATION_AMBIGUOUS',publishTarget:ordinaryTarget
  });}}});
  const receipt={root:'/student',value:{phase:'dispatched',repositoryId:24},jamConsent:linkedJam};
  h.stored.set('zero.webPublish.staging',receipt);
  h.choices.push('Publish to web only');
  await assert.rejects(h.api.publishAndOpen(),/Multiple jams/);
  assert.equal(h.messages.length,0);
  assert.equal(h.stored.get('zero.webPublish.staging'),receipt);
  assert.equal(h.published,0);
});

test('failure to open the browser does not prevent submitting the verified Jam build',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>({status:'submitted'})}});
  h.choices.push('Publish to Jam');
  h.vscode.env.openExternal=async()=>{throw Error('Browser unavailable');};
  const result=await h.api.publishAndOpen();
  assert.equal(result.opened,false);
  assert.equal(result.jamSubmission.status,'submitted');
});

test('revised Pages destination requires a fresh Jam confirmation before deployment',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>({status:'submitted'})}});
  h.choices.push('Publish to Jam');
  await h.api.publishAndOpen();
  const original=h.publisher.review;
  h.publisher.review=async()=>({...await original(),publicUrl:'https://games.example.org/'});
  await h.api.publishAndOpen();
  assert.match(h.messages.at(-1)[1].detail,/https:\/\/games\.example\.org\//);
  assert.equal(h.published,1,'cancelled changed destination never dispatches');
});

test('a pending deployment for an older repository can be forgotten before Jam publish',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>assert.fail()}});
  h.stored.set('zero.webPublish.pending',{root:'/student',account:'1',value:{repository:'https://github.com/student/old',repositoryId:23,runId:21}});
  h.publisher.restore=async()=>assert.fail('Do not contact GitHub for the unrelated run');
  h.choices.push('Forget saved run');
  assert.equal((await h.api.publishAndOpen()).status,'reset');
  assert.equal(h.stored.has('zero.webPublish.pending'),false);
  assert.equal(h.published,0);
});

test('Jam setup upload pins the confirmed account and repository ID',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>assert.fail()},onUpload:options=>{
    assert.deepEqual(options.expectedPublishTarget,{root:'/student',account:'1',repository:'https://github.com/student/game',repositoryId:'24',label:'Publish to Jam'});
    throw Error('Native upload detected a replacement repository');
  }});
  h.setup=true;
  h.choices.push('Publish to Jam');
  await assert.rejects(h.api.publishAndOpen(),/replacement repository/);
  assert.equal(h.uploaded,0);
  assert.equal(h.published,0);
});

test('Publish to Jam verifies and submits through the command that does not open the browser',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>({status:'submitted'})}});
  h.choices.push('Publish to Jam');
  const result=await h.api.publish();
  assert.equal(result.opened,false);
  assert.deepEqual(h.opened,[]);
  assert.equal(result.jamSubmission.status,'submitted');
});

test('an exception after submitting a live build is reported as unconfirmed',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>{throw Error('Lost response');}}});
  h.choices.push('Publish to Jam');
  assert.equal((await h.api.publishAndOpen()).jamSubmission.status,'pending');
  assert.match(h.states.at(-1),/submission .* pending/);
});

test('an uncertain Jam lookup can publish to Pages alone only after explicit consent',async t=>{
  const h=fixture(t,{listPublication:async()=>assert.fail('No automatic listing for a web-only fallback'),gameJam:{
    resolve:async()=>{throw Object.assign(Error('Unavailable'),{code:'ZERO_JAM_STATUS_UNKNOWN',publishTarget:ordinaryTarget});}
  }});
  await h.api.publishAndOpen();
  assert.equal(h.published,0);
  h.choices.push('Publish to web only','Publish app');
  assert.equal((await h.api.publishAndOpen()).status,'live');
  assert.equal(h.published,1);
  assert.equal(h.stored.get('zero.webPublish.lastLive').listingPending,undefined);
});
test('unlinked lookup aborts if repository identity changes before the publish review',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>ordinaryTarget}});
  const original=h.publisher.review;
  h.publisher.review=async()=>({...await original(),repositoryId:25});
  await assert.rejects(h.api.publishAndOpen(),/account or repository changed/);
  assert.equal(h.messages.length,0);
  assert.equal(h.published,0);
});

test('web-only consent cannot carry over to a different repository after unavailable routing',async t=>{
  let replaced=false;
  const h=fixture(t,{gameJam:{
    resolve:async()=>{throw Object.assign(Error('Unavailable'),{code:'ZERO_JAM_STATUS_UNKNOWN',publishTarget:ordinaryTarget});}
  }});
  h.vscode.window.showInformationMessage=async title=>{
    assert.equal(title,'ZeroJams is unavailable.');
    replaced=true;
    return 'Publish to web only';
  };
  const original=h.publisher.review;
  h.publisher.review=async()=>({...await original(),repositoryId:replaced?25:24});
  await assert.rejects(h.api.publishAndOpen(),/account or repository changed/);
  assert.equal(h.published,0);
  assert.deepEqual(h.opened,[]);
});

test('ordinary consent for a previous same-name repository requires fresh review',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>ordinaryTarget}});
  h.stored.set('zero.webPublish.approval',{...ordinaryTarget,repositoryId:'25',url:'https://student.github.io/game/'});
  await h.api.publishAndOpen();
  assert.equal(h.messages[0][0],'Publish app?');
  assert.equal(h.published,0);
});

test('an ordinary lookup binds setup upload and final verification to the same identity',async t=>{
  const h=fixture(t,{gameJam:{resolve:async()=>ordinaryTarget},onUpload:options=>{
    assert.deepEqual(options.expectedPublishTarget,{...ordinaryTarget,label:'Publish & open app'});
  }});
  h.setup=true;
  h.choices.push('Publish app');
  assert.equal((await h.api.publish()).status,'live');
  assert.equal(h.uploaded,1);
});

test('simulation publish never saves, authenticates, writes setup or calls publisher',async t=>{
  const h=fixture(t);h.simulation=true;const result=await h.api.publish();assert.equal(result.status,'simulated');assert.deepEqual(h.calls,[]);assert.deepEqual(h.authCalls,[]);assert.equal(h.busy,false);
});
test('browser tooling review precedes review and setup upload for a new build',async t=>{
  let hookCalls=0;const h=fixture(t,{beforeBuildReview:async(root,{signal})=>{hookCalls++;assert.equal(root,'/student');assert.equal(signal.aborted,false);assert.deepEqual(h.calls,[]);assert.equal(h.uploaded,0);}});
  h.setup=true;h.choices.push('Publish app');const result=await h.api.publish();
  assert.equal(result.status,'live');assert.equal(hookCalls,1);assert.equal(h.uploaded,1);assert.equal(h.published,1);
});
test('cancelled browser tooling review prevents publishing review and upload',async t=>{
  const {BrowserToolingDecision}=require('../src/browser-tooling-decision');
  const h=fixture(t,{onReportFailure:()=>assert.fail('A declined review is not a publishing failure'),beforeBuildReview:async()=>{throw new BrowserToolingDecision();}});
  await assert.rejects(h.api.publish(),/Browser action cancelled/);assert.equal(h.reviewed,0);assert.equal(h.uploaded,0);assert.equal(h.published,0);assert.equal(h.busy,false);
});
test('a publish recheck can offer the same inline repair before the next review',async t=>{
  const {BrowserToolingDecision}=require('../src/browser-tooling-decision');
  const decision=new BrowserToolingDecision({token:'reviewed'}),offered=deferred();
  let checks=0;
  const h=fixture(t,{beforeBuildReview:async()=>{if(++checks===2)throw decision;},onToolingDecision:offered.resolve,
    onReportFailure:()=>assert.fail('Waiting for an inline repair is not a publishing failure')});
  h.publisher.review=async()=>({status:'action-required',action:{message:'Check again.'}});
  h.choices.push('Recheck');await h.api.publish();
  assert.equal(await offered.promise,decision);assert.equal(h.uploaded,0);assert.equal(h.busy,false);
});
test('a publish recheck cannot continue in a different workspace project',async t=>{
  const roots=[];
  const h=fixture(t,{beforeBuildReview:async root=>roots.push(root),
    onToolingDecision:()=>assert.fail('A stale notification must not offer repair')});
  h.publisher.review=async()=>({status:'action-required',action:{message:'Check again.'}});
  h.vscode.window.showInformationMessage=async()=>{
    h.active='/second-project';
    return 'Recheck';
  };
  await h.api.publish();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(roots,['/student']);
  assert.equal(h.uploaded,0);
  assert.equal(h.published,0);
  assert.equal(h.busy,false);
});
test('simulation skips browser tooling review',async t=>{
  let hookCalls=0;const h=fixture(t,{beforeBuildReview:async()=>{hookCalls++;}});h.simulation=true;
  assert.equal((await h.api.publish()).status,'simulated');assert.equal(hookCalls,0);assert.equal(h.reviewed,0);assert.equal(h.uploaded,0);
});
test('publish completion reports in sidebar and its verified copy command remains available',async t=>{
  const h=fixture(t);h.choices.push('Publish app');const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(h.reviewed,1);assert.equal(h.published,1);assert.equal(h.uploaded,0);assert.equal(h.checks,1);assert.deepEqual(h.copied,[]);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
  assert.equal(h.states.at(-1),'App published');assert.equal(h.messages.length,1,'Only first-publish warning remains');
  await h.api.commands['zero.copyPublishedWebLink']();assert.deepEqual(h.copied,['https://student.github.io/game/']);
  const warning=h.messages.find(message=>message[1]?.modal);
  assert.equal(warning[0],'Publish app?');
  assert.equal(warning[1].detail,'Your app and its assets will be public.\nhttps://student.github.io/game/');
});
test('first setup warns once, checks App workflow access, uploads and revalidates before publishing',async t=>{
  const h=fixture(t);h.setup=true;h.choices.push('Publish app');const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(h.uploaded,1);assert.deepEqual(h.calls,['review','review','setup','review','publish']);assert.deepEqual(h.authCalls.map(call=>call.permissions),[{contents:'write',workflows:'write'}]);assert.equal(h.messages.filter(m=>m[1]?.modal).length,1);
});
test('cancelled consent and project drift never publish or expose a URL',async t=>{
  const h=fixture(t);h.setup=true;await h.api.publish();assert.equal(h.published,0);assert.equal(h.uploaded,0);assert.deepEqual(h.calls,['review']);assert.deepEqual(h.authCalls,[]);
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
  const restarted=createWebPublishCommands(h.vscode,{project:async()=>'/student',authentication:h.auth,workspaceState:h.workspaceState,isSimulation:()=>false,publisherFactory:()=>h.publisher});t.after(()=>restarted.disposables.forEach(d=>d.dispose()));
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
test('a terminal saved run offers to open that run and requires a new Publish to retry',async t=>{
  const h=fixture(t),url='https://github.com/student/game/actions/runs/42';
  h.stored.set('zero.webPublish.pending',{root:'/student',value:{runId:42}});
  h.publisher.restore=async()=>({status:'failed',message:'Publishing failed',action:{url,message:'Open publishing run'}});
  h.choices.push('Open GitHub');
  assert.equal((await h.api.publishAndOpen()).status,'failed');
  assert.deepEqual(h.messages,[['Open publishing run','Open GitHub']]);
  assert.deepEqual(h.opened,[url]);assert.deepEqual(h.calls,[]);
  assert.equal(h.stored.has('zero.webPublish.pending'),false);
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
  const api=createWebPublishCommands(h.vscode,{project:async()=>'/student',authentication:h.auth,workspaceState:h.workspaceState,isSimulation:()=>false,isBusy:()=>true,publisherFactory:()=>h.publisher});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));assert.equal((await api.verifiedPublication('/student','a'.repeat(40))).runId,42);
  h.publisher.verifyLink=async()=>{h.simulation=true;return {status:'live',sha:'a'.repeat(40),url:'https://student.github.io/game/',resume:{runId:42}};};
  assert.equal(await h.api.verifiedPublication('/student','a'.repeat(40)),undefined);assert.equal(h.busy,false);
  h.simulation=false;h.active='/other';await assert.rejects(h.api.verifiedPublication('/student','a'.repeat(40)),/project changed/);assert.equal(h.busy,false);
});

test('an unavailable saved publication attaches no link while cancellation and project guards remain binding',async t=>{
  for(const code of ['WEB_PUBLISH_REPOSITORY_CHANGED','HTTP_UNAVAILABLE']) {
    const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
    h.publisher.verifyLink=async()=>{const error=new Error('Saved publication unavailable');error.code=code;throw error;};
    assert.equal(await h.api.verifiedPublication('/student','a'.repeat(40)),undefined);
    assert.equal(h.busy,false);assert.match(h.states.at(-1),/could not be verified.*Publish app/);
  }
  const cancelled=fixture(t);cancelled.choices.push('Publish app');await cancelled.api.publish();
  cancelled.publisher.verifyLink=async()=>{cancelled.api.disposables[0].dispose();throw Error('Interrupted');};
  await assert.rejects(cancelled.api.verifiedPublication('/student','a'.repeat(40)),/cancelled/);assert.equal(cancelled.busy,false);
  const drift=fixture(t);drift.choices.push('Publish app');await drift.api.publish();
  drift.publisher.verifyLink=async()=>{drift.active='/other';throw Error('Unavailable');};
  await assert.rejects(drift.api.verifiedPublication('/student','a'.repeat(40)),/project changed/);assert.equal(drift.busy,false);
});

test('explicitly predispatch staging survives errors and is cleaned before a new review',async t=>{
  const h=fixture(t),stage={phase:'staging',sha:'a'.repeat(40),repository:'https://github.com/student/game',staging:{tag:'zero-web-stage-'+'b'.repeat(32)}};
  h.choices.push('Publish app');h.publisher.publish=async(review,options)=>{await options.onStaging(stage);throw Error('creation response uncertain');};
  await assert.rejects(h.api.publish(),/uncertain/);assert.deepEqual(h.stored.get('zero.webPublish.staging'),{root:'/student',value:stage});
  let cleaned=false;h.publisher.restoreDispatch=async(root,saved)=>{assert.equal(root,'/student');assert.deepEqual(saved,stage);cleaned=true;return {status:'staging-cleared'};};
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
const uncertainStage={phase:'dispatch-uncertain',sha:'a'.repeat(40),repository:'https://github.com/student/game',account:'1',staging:{tag:'zero-web-stage-'+'b'.repeat(32)}};
const uncertainAction={status:'dispatch-uncertain',action:{url:uncertainStage.repository+'/actions',message:'GitHub has not confirmed the publishing run.'}};

test('restart routes uncertain and legacy staged receipts to recovery without saving, building, or cleaning',async t=>{
  for(const original of [uncertainStage,{...uncertainStage,phase:undefined,account:undefined}]) {
    const h=fixture(t);
    const staged={root:'/student',value:original};
    h.stored.set('zero.webPublish.staging',staged);
    h.vscode.workspace.textDocuments=[dirtyDocument({save:()=>assert.fail('Recovering an existing attempt must not save buffers')})];
    h.vscode.workspace.saveAll=()=>assert.fail('Recovering an existing attempt must not save buffers');
    h.publisher.restoreDispatch=async(root,value)=>{assert.equal(root,'/student');assert.deepEqual(value,original);return uncertainAction;};
    h.choices.push('Open GitHub Actions');
    assert.equal((await h.api.publishAndOpen()).status,'dispatch-uncertain');
    assert.equal(h.stored.get('zero.webPublish.staging'),staged);
    assert.deepEqual(h.opened,[uncertainAction.action.url]);
    assert.deepEqual(h.calls,[]);assert.equal(h.uploaded,0);
  }
});
test('rechecking an uncertain deployment saves its identified run and never publishes newer work',async t=>{
  const h=fixture(t),checked=deferred();
  h.stored.set('zero.webPublish.staging',{root:'/student',value:uncertainStage});
  h.sha='c'.repeat(40);
  h.vscode.workspace.textDocuments=[dirtyDocument({save:()=>assert.fail('Rechecking an existing attempt must not save buffers')})];
  let attempts=0;
  const value={runId:41,repository:uncertainStage.repository,sha:uncertainStage.sha,staging:uncertainStage.staging};
  h.publisher.restoreDispatch=async(_root,_saved,{onPending})=>{
    if(++attempts===1)return uncertainAction;
    await onPending(value);
    assert.deepEqual(h.stored.get('zero.webPublish.pending'),{root:'/student',value,account:'1'});
    assert.equal(h.stored.has('zero.webPublish.staging'),false);
    return {status:'live',url:'https://student.github.io/game/',sha:value.sha,resume:value};
  };
  const update=h.workspaceState.update;
  h.workspaceState.update=async(key,data)=>{await update(key,data);if(key==='zero.webPublish.pending' && data===undefined)checked.resolve();};
  h.choices.push('Recheck');
  assert.equal((await h.api.publishAndOpen()).status,'dispatch-uncertain');
  await checked.promise;
  assert.equal(h.stored.get('zero.webPublish.lastLive').sha,value.sha);
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.opened,[]);
});
test('ambiguous Jam still allows recovery of an explicitly Pages-only dispatch',async t=>{
  const h=fixture(t,{listPublication:async()=>assert.fail('Pages-only recovery must not list on ZeroHub'),gameJam:{
    resolve:async()=>{throw Object.assign(Error('Multiple jams'),{
      code:'ZERO_JAM_DESTINATION_AMBIGUOUS',publishTarget:ordinaryTarget
    });},
    recover:async()=>assert.fail('Pages-only recovery must not recover a jam submission'),
    submit:async()=>assert.fail('Pages-only recovery must not submit to a jam')
  }});
  const stage={...uncertainStage,repositoryId:24};
  const value={runId:41,repository:stage.repository,repositoryId:24,sha:stage.sha,staging:stage.staging};
  const routing={root:'/student',webOnly:true};
  h.stored.set('zero.webPublish.staging',{...routing,value:stage});
  h.publisher.check=async()=>({status:'pending',resume:value});
  h.publisher.restoreDispatch=async(root,saved,{onPending})=>{
    assert.equal(root,'/student');
    assert.deepEqual(saved,stage);
    await onPending(value);
    return {status:'pending',resume:value};
  };
  assert.equal((await h.api.publishAndOpen()).status,'pending');
  assert.deepEqual(h.stored.get('zero.webPublish.pending'),{...routing,value,account:'1'});
  h.publisher.restore=async()=>({status:'live',url:'https://student.github.io/game/',sha:stage.sha,resume:value});
  const recovered=await h.api.publishAndOpen();
  assert.equal(recovered.status,'live');
  assert.equal(recovered.jamSubmission,undefined);
  assert.equal(h.stored.has('zero.webPublish.pending'),false);
  assert.equal(h.published,0);
  assert.deepEqual(h.messages,[]);
  assert.deepEqual(h.opened,[]);
});

test('dismissing an uncertain attempt requires a separate decision and never starts another publish',async t=>{
  const h=fixture(t),previous={root:'/student',url:'https://student.github.io/game/'};
  h.stored.set('zero.webPublish.staging',{root:'/student',value:uncertainStage});
  h.stored.set('zero.webPublish.lastLive',previous);
  h.publisher.restoreDispatch=async()=>uncertainAction;
  let dismissed=0;
  h.publisher.forgetDispatch=async(root,value)=>{assert.equal(root,'/student');assert.deepEqual(value,uncertainStage);dismissed++;};
  h.choices.push('Dismiss saved attempt…');
  assert.equal((await h.api.publish()).status,'dispatch-uncertain');
  assert.ok(h.stored.has('zero.webPublish.staging'));assert.equal(dismissed,0);
  h.choices.push('Dismiss saved attempt…','Dismiss saved attempt');
  assert.equal((await h.api.publish()).status,'reset');
  assert.equal(h.stored.has('zero.webPublish.staging'),false);assert.equal(dismissed,1);
  assert.equal(h.stored.get('zero.webPublish.lastLive'),previous);
  assert.deepEqual(h.calls,[]);assert.equal(h.uploaded,0);
});
test('a reconnected repo does not resume or replace the old attempt',async t=>{
  const h=fixture(t),staged={root:'/student',value:uncertainStage};
  h.stored.set('zero.webPublish.staging',staged);
  h.publisher.restoreDispatch=async()=>({...uncertainAction,message:'The saved publishing attempt belongs to a different repository.'});
  h.choices.push('Open GitHub Actions');
  assert.equal((await h.api.publish()).status,'dispatch-uncertain');
  assert.equal(h.stored.get('zero.webPublish.staging'),staged);
  assert.deepEqual(h.opened,[uncertainAction.action.url]);
  assert.deepEqual(h.calls,[]);
});
test('dispatch recovery preserves exact Jam consent and submits the saved Pages run once',async t=>{
  let submissions=0;
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async(jam,live)=>{
    assert.equal(jam,linkedJam);assert.equal(live.sha,uncertainStage.sha);assert.equal(live.resume.runId,41);
    submissions++;return {status:'submitted'};
  }}});
  const stage={...uncertainStage,repositoryId:24};
  const value={runId:41,repository:stage.repository,repositoryId:24,sha:stage.sha,staging:stage.staging};
  h.choices.push('Publish to Jam');
  h.publisher.publish=async(_review,{onStaging})=>{await onStaging(stage);return uncertainAction;};
  assert.equal((await h.api.publishAndOpen()).status,'dispatch-uncertain');
  assert.equal(h.stored.get('zero.webPublish.staging').jamConsent.dispatchTag,stage.staging.tag);
  h.sha='c'.repeat(40);
  h.publisher.restoreDispatch=async(_root,_stage,{onPending})=>{
    await onPending(value);
    assert.equal(h.stored.get('zero.webPublish.pending').jamConsent.sha,stage.sha);
    return {status:'live',url:'https://student.github.io/game/',sha:stage.sha,resume:value};
  };
  assert.equal((await h.api.publishAndOpen()).jamSubmission.status,'submitted');
  assert.equal(submissions,1);
  assert.deepEqual(h.opened,[]);
});

test('a recovered deployment still in progress retains the exact Jam handoff across commands',async t=>{
  let submissions=0;
  const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async(_jam,live)=>{
    assert.equal(live.resume.runId,41);submissions++;return {status:'submitted'};
  }}});
  const stage={...uncertainStage,repositoryId:24};
  const value={runId:41,repository:stage.repository,repositoryId:24,sha:stage.sha,staging:stage.staging};
  h.stored.set('zero.webPublish.staging',{root:'/student',value:stage,jamConsent:{
    ...linkedJam,dispatchTag:stage.staging.tag,pagesUrl:'https://student.github.io/game/',sha:stage.sha
  }});
  h.publisher.restoreDispatch=async(_root,_stage,{onPending})=>{
    await onPending(value);
    return {status:'pending',resume:value};
  };
  h.publisher.check=async()=>({status:'pending',resume:value});
  assert.equal((await h.api.publishAndOpen()).status,'pending');
  assert.equal(h.messages.length,0);
  assert.equal(h.stored.get('zero.webPublish.pending').jamConsent.dispatchTag,stage.staging.tag);
  h.publisher.restore=async()=>({status:'live',url:'https://student.github.io/game/',sha:stage.sha,resume:value});
  assert.equal((await h.api.publishAndOpen()).jamSubmission.status,'submitted');
  assert.equal(h.stored.has('zero.webPublish.pending'),false);
  assert.equal(submissions,1);
  assert.deepEqual(h.opened,[]);
});

test('a completed Jam run awaiting its Pages marker can stop only its own saved check',async t=>{
  for(const action of ['stop','cancel','receipt changed','repository changed'])await t.test(action,async t=>{
    let target=linkedJam;
    const h=fixture(t,{gameJam:{resolve:async()=>target,submit:async()=>assert.fail('Do not submit an unverified run')}});
    const key='zero.webPublish.pending';
    const value={runId:41,repository:uncertainStage.repository,repositoryId:24,sha:uncertainStage.sha,staging:uncertainStage.staging};
    const saved={root:'/student',account:'1',value,jamConsent:{
      ...linkedJam,dispatchTag:value.staging.tag,pagesUrl:'https://student.github.io/game/',sha:value.sha
    }};
    const replacement={...saved,value:{...value,runId:42}};
    const live={root:'/student',url:'https://student.github.io/game/',sha:'c'.repeat(40)};
    h.stored.set(key,saved);
    h.stored.set('zero.webPublish.lastLive',live);
    h.publisher.restore=async()=>({status:'pending',pendingReason:'public-marker',resume:value});
    h.publisher.check=async()=>assert.fail('Offer a choice when the completed run cannot be verified');
    h.vscode.window.showInformationMessage=async (message,options,button)=>{
      assert.equal(message,'Stop checking this publishing run?');assert.equal(options.modal,true);
      assert.equal(button,'Stop checking this run');
      if(action==='receipt changed')h.stored.set(key,replacement);
      if(action==='repository changed')target={...linkedJam,repositoryId:'25'};
      return action==='cancel' ? undefined : button;
    };
    if(action==='receipt changed')await assert.rejects(h.api.publishAndOpen(),/saved publishing run changed/);
    else if(action==='repository changed')await assert.rejects(h.api.publishAndOpen(),/account or repository changed/);
    else assert.equal((await h.api.publishAndOpen()).status,action==='stop' ? 'reset' : 'pending');
    await new Promise(resolve=>setImmediate(resolve));
    if(action==='stop')assert.match(h.states.at(-1),/Choose Publish to Jam to start a new publish/);
    assert.equal(h.stored.get(key),action==='stop' ? undefined : action==='receipt changed' ? replacement : saved);
    assert.equal(h.stored.get('zero.webPublish.lastLive'),live);
    assert.equal(h.reviewed,0);
    assert.equal(h.published,0);
    assert.deepEqual(h.opened,[]);
  });
});

test('legacy and revised Jam dispatch consent require a new explicit Publish to Jam',async t=>{
  for(const legacy of [true,false])await t.test(legacy?'legacy receipt':'entry revision changed',async t=>{
    const h=fixture(t,{gameJam:{resolve:async()=>linkedJam,submit:async()=>assert.fail('No current consent')}});
    const stage={...uncertainStage,repositoryId:24};
    const value={runId:41,repository:stage.repository,repositoryId:24,sha:stage.sha,staging:stage.staging};
    h.stored.set('zero.webPublish.staging',{root:'/student',value:stage,...(legacy?{}:{jamConsent:{
      ...linkedJam,entryRevision:'e'.repeat(64),dispatchTag:stage.staging.tag,pagesUrl:'https://student.github.io/game/',sha:stage.sha
    }})});
    h.publisher.restoreDispatch=async(_root,_stage,{onPending})=>{
      await onPending(value);
      return {status:'live',url:'https://student.github.io/game/',sha:stage.sha,resume:value};
    };
    assert.equal((await h.api.publishAndOpen()).jamSubmission.status,'review-required');
    assert.match(h.states.at(-1),/Choose Publish to Jam to review and submit/);
    assert.deepEqual(h.opened,[]);
  });
});

test('failure to save recovered run keeps the staging receipt for another check',async t=>{
  const h=fixture(t),staged={root:'/student',value:uncertainStage},update=h.workspaceState.update;
  h.stored.set('zero.webPublish.staging',staged);
  h.workspaceState.update=async(key,value)=>{if(key==='zero.webPublish.pending')throw Error('Storage unavailable');await update(key,value);};
  h.publisher.restoreDispatch=async(_root,_saved,{onPending})=>{await onPending({runId:42});assert.fail('No status check should follow a failed pending write');};
  await assert.rejects(h.api.publish(),/Storage unavailable/);
  assert.equal(h.stored.get('zero.webPublish.staging'),staged);
  assert.deepEqual(h.calls,[]);assert.equal(h.stored.has('zero.webPublish.pending'),false);
});
test('unsaved project documents must save before source review; cancelled saves do not publish',async t=>{
  const h=fixture(t);let saved=0;h.vscode.workspace.textDocuments=[dirtyDocument({save:async()=>{saved++;return false;}})];
  await assert.rejects(h.api.publish(),/Save your project/);assert.equal(saved,1);assert.equal(h.reviewed,0);assert.equal(h.published,0);
  h.simulation=true;await h.api.publish();assert.equal(saved,1,'Simulation never saves editor buffers');
});
test('publishing ignores unrelated files and untitled notes without saving them',async t=>{
  for(const open of [false,true]) {
    const h=fixture(t),neverSave=()=>assert.fail('Publishing must not save an unrelated editor');
    const unrelated=[dirtyDocument({file:'/other/src/main/java/Main.java',save:neverSave}),
      dirtyDocument({file:'/student/notes.md',save:neverSave}),
      dirtyDocument({file:'Untitled-1',scheme:'untitled',save:neverSave})];
    h.vscode.workspace.textDocuments=unrelated;h.vscode.workspace.saveAll=neverSave;
    h.choices.push('Publish app');
    const result=await(open?h.api.publishAndOpen():h.api.publish());
    assert.equal(result.status,'live');assert.equal(h.published,1);assert.equal(h.opened.length,open?1:0);
    assert.ok(unrelated.every(document=>document.isDirty));
  }
});
test('publishing saves only selected project build inputs before review',async t=>{
  const h=fixture(t),saved=[];
  const paths=['/student/src/main/java/New.java','/student/src/main/resources/theme.css',
    '/student/pom.xml','/student/zero-libraries.json','/student/libraries/score/src/main/java/Score.java'];
  const documents=paths.map(file=>{const document=dirtyDocument({file});document.save=async()=>{
    assert.equal(h.reviewed,0);saved.push(file);document.isDirty=false;return true;
  };return document;});
  h.vscode.workspace.textDocuments=documents;h.choices.push('Publish app');
  assert.equal((await h.api.publishAndOpen()).status,'live');assert.deepEqual(saved,paths);
});
test('an unrelated editor dirtied at final verification does not block opening',async t=>{
  const h=fixture(t);h.choices.push('Publish app');const verify=h.publisher.verifyCurrent;
  h.publisher.verifyCurrent=(review,saved,options)=>verify(review,saved,{...options,onCurrent:live=>{
    h.vscode.workspace.textDocuments=[dirtyDocument({file:'Untitled-2',scheme:'untitled'})];options.onCurrent(live);
  }});
  assert.equal((await h.api.publishAndOpen()).status,'live');assert.equal(h.opened.length,1);
});
test('a source file opened through a workspace alias is still saved before publishing',async t=>{
  if(process.platform==='win32'){t.skip('Creating a directory symlink requires separate Windows privileges');return;}
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'zero-publish-inputs-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'student'),alias=path.join(base,'alias');
  await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'class Main {}');
  await fs.symlink(root,alias,'dir');
  const h=fixture(t);h.active=root;let saved=0;const document=dirtyDocument({file:path.join(alias,'src/main/java/Main.java')});
  document.save=async()=>{saved++;document.isDirty=false;return true;};h.vscode.workspace.textDocuments=[document];h.choices.push('Publish app');
  assert.equal((await h.api.publishAndOpen()).status,'live');assert.equal(saved,1);
});

// Removing the second setup confirmation must not approve a different destination.
test('case aliases of existing and new build inputs save and remain guarded at final dispatch',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'zero-publish-case-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'student'),alias=path.join(base,'STUDENT');
  await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'pom.xml'),'<project/>');
  if(!await fs.stat(path.join(root,'POM.XML')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})) {
    t.skip('Temporary filesystem is case-sensitive');return;
  }
  for(const file of [path.join(alias,'POM.XML'),path.join(alias,'SRC/MAIN/JAVA/New.java')]) {
    const h=fixture(t);h.active=root;let saves=0;const document=dirtyDocument({file});
    document.save=async()=>{saves++;document.isDirty=false;return true;};
    h.vscode.workspace.textDocuments=[document];h.choices.push('Publish app');
    assert.equal((await h.api.publishAndOpen()).status,'live');assert.equal(saves,1,file);
  }
  const h=fixture(t);h.active=root;h.choices.push('Publish app');const verify=h.publisher.verifyCurrent;
  h.publisher.verifyCurrent=(review,saved,options)=>verify(review,saved,{...options,onCurrent:live=>{
    h.vscode.workspace.textDocuments=[dirtyDocument({file:path.join(alias,'POM.XML')})];options.onCurrent(live);
  }});
  await assert.rejects(h.api.publishAndOpen(),/app changed while publishing/);assert.equal(h.opened.length,0);
});
test('case-distinct projects on a case-sensitive filesystem stay unrelated',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'zero-publish-distinct-case-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'student'),other=path.join(base,'STUDENT');await fs.mkdir(root);
  if(await fs.stat(other).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;})) {
    t.skip('Temporary filesystem is case-insensitive');return;
  }
  await fs.mkdir(other);await fs.writeFile(path.join(other,'pom.xml'),'<project/>');
  const h=fixture(t);h.active=root;h.choices.push('Publish app');
  h.vscode.workspace.textDocuments=[dirtyDocument({file:path.join(other,'pom.xml'),save:()=>assert.fail('Unrelated case-distinct project must not save')})];
  assert.equal((await h.api.publishAndOpen()).status,'live');assert.equal(h.opened.length,1);
});

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
  const restarted=createWebPublishCommands(h.vscode,{project:async()=>'/student',authentication:h.auth,workspaceState:h.workspaceState,isSimulation:()=>false,publisherFactory:()=>h.publisher,pollIntervalMs:0});
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
  assert.match(h.messages[0][1].detail,/commit and sync these files to https:\/\/github\.com\/student\/game[\s\S]*README.md[\s\S]*owner.json[\s\S]*Git history/);
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
test('unsynced source stops before the publisher can push or ask for approval',async t=>{
  for(const [entry,plan] of [
    ['publish',{status:'',head:'a'.repeat(40)}],
    ['publishAndOpen',{status:' M Main.java',head:'a'.repeat(40)}]
  ]) {
    const h=fixture(t);
    const review=h.publisher.review;
    h.publisher.review=async()=>{throw Object.assign(Error('Sync needed'),{code:'WEB_PUBLISH_UPLOAD_REQUIRED',plan});};
    assert.equal((await h.api[entry]()).status,'upload-required');
    assert.match(h.states.at(-1),/Commit.*Sync on main/);
    assert.equal(h.uploaded,0);assert.equal(h.published,0);assert.equal(h.busy,false);
    assert.deepEqual(h.messages,[]);assert.equal(h.stored.has('zero.webPublish.approval'),false);
    h.publisher.review=review;
    await h.api[entry](); // Source is now synced, but the first public warning is dismissed.
    assert.equal(h.messages.at(-1)[0],'Publish app?');
    assert.equal(h.uploaded,0);assert.equal(h.published,0);assert.deepEqual(h.opened,[]);
  }
});
test('change branches and unrelated review errors do not invoke the uploader',async t=>{
  const h=fixture(t);h.publisher.review=async()=>{throw Error('Finish your change with Merge to main before publishing the app.');};
  await assert.rejects(h.api.publish(),/Merge to main/);assert.equal(h.uploaded,0);assert.equal(h.published,0);
});
test('disabling live mode during save prevents upload and deployment',async t=>{
  const h=fixture(t);h.vscode.workspace.textDocuments=[dirtyDocument({save:async()=>{h.simulation=true;return true;}})];
  await assert.rejects(h.api.publish(),/Live publishing was disabled/);assert.equal(h.reviewed,0);assert.equal(h.uploaded,0);assert.equal(h.published,0);
});

test('Publish never invokes an obsolete automatic helper preparer',async t=>{
 const h=fixture(t);h.choices.push('Publish app');
 h.publisher.prepare=async()=>assert.fail('Opening or publishing must preserve project helpers');
 assert.equal((await h.api.publish()).status,'live');assert.equal(h.uploaded,0);
});


test('publish and open publishes a first version, opens only verified live output and reuses it on the next click',async t=>{
  const h=fixture(t);h.choices.push('Publish app');
  const first=await h.api.publishAndOpen();assert.equal(first.opened,true);assert.equal(h.published,1);assert.deepEqual(h.opened,['https://student.github.io/game/']);
  const next=await h.api.commands['zero.publishAndOpenWeb']();assert.equal(next.opened,true);assert.equal(h.published,1,'Current published input never starts another build/deployment');assert.equal(h.uploaded,0);assert.equal(h.opened.length,2);assert.equal(h.messages.length,1);assert.equal(h.busy,false);
});
test('publish and open updates a stale version and saves buffers before checking freshness',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
  const doc=dirtyDocument();h.vscode.workspace.textDocuments=[doc];let saves=0;
  doc.save=async()=>{saves++;doc.isDirty=false;h.sha='b'.repeat(40);return true;};
  const result=await h.api.publishAndOpen();assert.equal(saves,1);assert.equal(result.sha,'b'.repeat(40));assert.equal(h.published,2);assert.equal(h.opened.length,1);
});
test('publish and open never opens on cancel, failure, pending, simulation, untrusted or unsaved work',async t=>{
  for(const mode of ['consent','failed','pending','simulation','untrusted','save']){
    const h=fixture(t);if(mode!=='consent')h.choices.push('Publish app');
    if(mode==='failed')h.publisher.check=async()=>({status:'failed',message:'Failed'});
    if(mode==='pending')h.publisher.check=async value=>({status:'pending',resume:value,message:'Waiting'});
    if(mode==='simulation')h.simulation=true;
    if(mode==='untrusted')h.vscode.workspace.isTrusted=false;
    if(mode==='save'){h.vscode.workspace.textDocuments=[dirtyDocument({save:async()=>false})];}
    if(['untrusted','save'].includes(mode))await assert.rejects(h.api.publishAndOpen(),/Trust|Save/);else await h.api.publishAndOpen();
    assert.deepEqual(h.opened,[],mode);assert.equal(h.busy,false,mode);
  }
});
test('a resumed older deployment must publish the newer source before opening',async t=>{
  const h=fixture(t),old='a'.repeat(40);h.sha='b'.repeat(40);
  h.stored.set('zero.webPublish.pending',{root:'/student',account:'1',value:{runId:41,sha:old,repository:'https://github.com/student/game'}});
  h.publisher.restore=async(_root,value)=>({status:'live',url:'https://student.github.io/game/',sha:old,resume:value});
  const result=await h.api.publishAndOpen();assert.equal(result.sha,'b'.repeat(40));assert.equal(h.published,1);assert.equal(h.opened.length,1);assert.equal(h.stored.get('zero.webPublish.lastLive').sha,'b'.repeat(40));
});
test('resuming a known run keeps dirty source unsaved and blocks opening current output',async t=>{
  for(const open of [false,true]) {
    const h=fixture(t),sha='a'.repeat(40);
    h.stored.set('zero.webPublish.pending',{root:'/student',account:'1',value:{runId:41,sha,repository:'https://github.com/student/game'}});
    const document=dirtyDocument({save:()=>assert.fail('Resuming a run must not save current source')});
    h.vscode.workspace.textDocuments=[document];
    h.publisher.restore=async(_root,value)=>({status:'live',url:'https://student.github.io/game/',sha,resume:value});
    if(open)await assert.rejects(h.api.publishAndOpen(),/app changed while publishing/);
    else assert.equal((await h.api.publish()).status,'live');
    assert.equal(document.isDirty,true);assert.equal(h.published,0);assert.equal(h.uploaded,0);assert.deepEqual(h.opened,[]);
    assert.equal(h.stored.get('zero.webPublish.lastLive').sha,sha);
  }
});
test('continued editing is bounded and never opens an outdated page',async t=>{
  const h=fixture(t);h.choices.push('Publish app');h.publisher.verifyCurrent=async()=>({status:'stale'});
  await assert.rejects(h.api.publishAndOpen(),/changed while publishing/);assert.equal(h.published,2);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
});
test('freshness failure or project/mode drift cannot open a remembered link',async t=>{
  for(const mode of ['offline','project','simulation']){
    const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
    h.publisher.verifyCurrent=async(_review,_saved,{onCurrent})=>{if(mode==='offline')throw Error('Offline');if(mode==='project')h.active='/other';else h.simulation=true;const live={status:'live',url:'https://student.github.io/game/',sha:'a'.repeat(40)};onCurrent(live);return live;};
    await assert.rejects(h.api.publishAndOpen(),/Offline|project changed|disabled/);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
  }
});
test('a browser launch failure preserves published success without republishing',async t=>{
  const h=fixture(t);h.choices.push('Publish app');h.vscode.env.openExternal=async()=>false;
  const result=await h.api.publishAndOpen();assert.equal(result.status,'live');assert.equal(result.opened,false);assert.match(h.states.at(-1),/browser could not be opened/);assert.equal(h.published,1);assert.ok(h.stored.get('zero.webPublish.lastLive'));
});

test('an unavailable remembered page stops read-only and gives an explicit retry without starting a deployment',async t=>{
 const h=fixture(t);h.choices.push('Publish app');await h.api.publish();h.publisher.verifyCurrent=async()=>({status:'pending',message:'Public page not reachable'});
 const result=await h.api.publishAndOpen();assert.equal(result.status,'pending');assert.equal(h.published,1);assert.deepEqual(h.opened,[]);assert.match(h.states.at(-1),/could not be verified.*Try Publish & open/);assert.equal(h.busy,false);
});

// Simulate a saved disk/HEAD change during the final asynchronous root lookup.
test('saved source drift during final project resolution prevents browser dispatch',async t=>{
  let h,checking=false;h=fixture(t,{resolveProject:async()=>{if(checking)h.sha='b'.repeat(40);return '/student';}});
  h.choices.push('Publish app');await h.api.publish();
  const verify=h.publisher.verifyCurrent;h.publisher.verifyCurrent=async(...args)=>{checking=true;return verify(...args);};
  await assert.rejects(h.api.publishAndOpen(),/app changed/);assert.deepEqual(h.opened,[]);assert.equal(h.published,1);assert.equal(h.busy,false);
});
test('dirty buffers at the final verified dispatch stop the browser',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();
  const verify=h.publisher.verifyCurrent;h.publisher.verifyCurrent=(review,saved,options)=>verify(review,saved,{...options,onCurrent:live=>{h.vscode.workspace.textDocuments=[dirtyDocument()];options.onCurrent(live);}});
  await assert.rejects(h.api.publishAndOpen(),/app changed/);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
});

function deferred() {let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}
test('publishing stages remain active through final verification and browser promise without early success',async t=>{
  const h=fixture(t),opened=deferred(),dispatch=deferred();h.choices.push('Publish app');
  const publish=h.publisher.publish;h.publisher.publish=async(review,options)=>{for(const name of ['building','uploading','deploying'])options.onStage(name);return publish(review,options);};
  h.vscode.env.openExternal=()=>{dispatch.resolve();return opened.promise;};
  const operation=h.api.publishAndOpen();await dispatch.promise;
  assert.equal(h.busy,true);assert.equal(h.progress.at(-1).stages[h.progress.at(-1).index],'opening');
  assert.match(h.states.at(-1),/Opening in browser/);assert.ok(!h.states.includes('App published'));assert.ok(!h.states.includes('App opened'));
  const actual=h.progress.filter(Boolean).map(value=>value.stages[value.index]);
  for(const name of ['building','uploading','deploying','verifying','opening'])assert.ok(actual.includes(name),name);
  opened.resolve(true);await operation;assert.equal(h.progress.at(-1),undefined);assert.equal(h.states.at(-1),'App opened');
});
test('current-page reuse and resumed deployment only count the stages actually followed',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();h.progress.length=0;
  await h.api.publishAndOpen();
  assert.ok(h.progress.filter(Boolean).every(value=>!value.stages.includes('building')&&!value.stages.includes('uploading')));
  assert.deepEqual(h.progress.filter(Boolean).at(-1).stages,['verifying','opening']);
  h.progress.length=0;h.stored.set('zero.webPublish.pending',{root:'/student',account:'1',value:{runId:42}});
  await h.api.publishAndOpen();assert.ok(h.progress.some(value=>value?.stages.join(',')==='deploying,verifying,opening'));
  assert.ok(h.progress.filter(Boolean).every(value=>!value.stages.includes('building')));assert.equal(h.progress.at(-1),undefined);
});
test('all publishing exits clear active progress, including timeout, browser rejection, cancellation and source/build/access failure',async t=>{
  for(const mode of ['pending','browser','consent','simulation','build','access','source']){
    const h=fixture(t);if(mode!=='consent')h.choices.push('Publish app');
    if(mode==='pending')h.publisher.check=async value=>({status:'pending',resume:value,message:'Waiting for GitHub'});
    if(mode==='browser')h.vscode.env.openExternal=async()=>{throw Error('Browser refused');};
    if(mode==='simulation')h.simulation=true;
    if(mode==='build')h.publisher.publish=async(_review,{onStage})=>{onStage('building');throw Error('Build failed');};
    if(mode==='access')h.publisher.review=async()=>{throw Error('Access removed');};
    if(mode==='source'){requireUploadOnce(h);h.vscode.workspace.textDocuments=[dirtyDocument({save:async()=>false})];}
    if(['browser','build','access','source'].includes(mode))await assert.rejects(h.api.publishAndOpen());else await h.api.publishAndOpen();
    assert.equal(h.progress.at(-1),undefined,mode);assert.equal(h.busy,false,mode);
    if(mode==='pending')assert.match(h.states.at(-1),/Choose Publish & open app again/);
  }
});
test('project switch or disposal during browser opening clears progress and cannot report old-project success',async t=>{
  for(const mode of ['project','dispose']){
    const h=fixture(t),opened=deferred(),dispatch=deferred();h.choices.push('Publish app');
    h.vscode.env.openExternal=()=>{dispatch.resolve();return opened.promise;};
    const operation=h.api.publishAndOpen();await dispatch.promise;
    if(mode==='project')h.active='/other';else h.api.disposables[0].dispose();
    opened.resolve(true);await assert.rejects(operation,/project changed|cancelled/);
    assert.equal(h.progress.at(-1),undefined);assert.ok(!h.states.includes('App opened'));
  }
});
test('action-required pauses progress before opening its recovery prompt',async t=>{
  const h=fixture(t);h.publisher.review=async()=>({status:'action-required',message:'Enable Pages',action:{message:'Open GitHub',url:'https://github.com/student/game'}});
  h.vscode.window.showInformationMessage=async()=>{assert.equal(h.progress.at(-1),undefined);};
  await h.api.publishAndOpen();assert.equal(h.progress.at(-1),undefined);
});

const publicationScope={root:'/student',repository:'https://github.com/student/game',account:'1'};
test('published-app visibility follows verified same-project receipt and preserves previous success after a failed update',async t=>{
  const h=fixture(t);assert.equal(h.api.hasPublishedApp(publicationScope),false);
  h.choices.push('Publish app');h.publisher.check=async()=>({status:'failed',message:'Build failed'});
  await h.api.publish();assert.equal(h.api.hasPublishedApp(publicationScope),false);
  h.choices.push('Publish app');h.publisher.check=async()=>({status:'live',url:'https://student.github.io/game/',sha:'a'.repeat(40),resume:{runId:42,sha:'a'.repeat(40),repository:publicationScope.repository}});
  await h.api.publish();assert.equal(h.api.hasPublishedApp(publicationScope),true);
  const saved=h.stored.get('zero.webPublish.lastLive');h.publisher.check=async()=>({status:'failed',message:'Update failed'});
  await h.api.publish();assert.equal(h.api.hasPublishedApp(publicationScope),true);assert.deepEqual(h.stored.get('zero.webPublish.lastLive'),saved);
  for(const scope of [{...publicationScope,root:'/other'},{...publicationScope,repository:'https://github.com/student/reconnected'},{...publicationScope,account:'2'},{}])assert.equal(h.api.hasPublishedApp(scope),false);
});
test('published-app receipt restores after restart and malformed saved values fail closed without publisher reads',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const saved=h.stored.get('zero.webPublish.lastLive');
  const restart=createWebPublishCommands(h.vscode,{workspaceState:h.workspaceState,publisherFactory:()=>({})});t.after(()=>restart.disposables[0].dispose());
  assert.equal(restart.hasPublishedApp(publicationScope),true);
  const malformed=[null,{}, {...saved,url:'javascript:alert(1)'},{...saved,url:'https://user:secret@example.org/'},{...saved,url:3},{...saved,account:1},{...saved,sha:'bad'},{...saved,resume:{...saved.resume,sha:'b'.repeat(40)}},{...saved,resume:{...saved.resume,runId:0}},{...saved,resume:{...saved.resume,repository:'https://github.com/other/repo'}}];
  for(const value of malformed){h.stored.set('zero.webPublish.lastLive',value);assert.equal(restart.hasPublishedApp(publicationScope),false,JSON.stringify(value));}
});
test('opening a published app with newer local dirty code is read-only and keeps progress through browser launch',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const saved=h.stored.get('zero.webPublish.lastLive'),oldSha=saved.sha;
  h.sha='b'.repeat(40);h.vscode.workspace.textDocuments=[dirtyDocument({save:()=>assert.fail('Historical opening never saves source')})];
  const before={published:h.published,uploaded:h.uploaded,reviewed:h.reviewed},verifying=deferred(),verification=deferred(),opening=deferred(),opened=deferred();
  h.publisher.verifyLink=async(root,record,options)=>{assert.equal(root,'/student');assert.equal(record.sha,oldSha);assert.equal(options.cleanup,undefined);verifying.resolve();return verification.promise;};
  h.vscode.env.openExternal=uri=>{assert.equal(uri,saved.url);opening.resolve();return opened.promise;};
  const operation=h.api.commands['zero.openPublishedWeb']();await verifying.promise;
  assert.match(h.states.at(-1),/Checking published app/);assert.deepEqual(h.progress.at(-1).stages,['verifying','opening']);
  verification.resolve({status:'live',url:saved.url,sha:oldSha});await opening.promise;
  assert.match(h.states.at(-1),/Opening in browser/);assert.equal(h.progress.at(-1).index,1);assert.equal(h.busy,true);
  assert.equal(await h.api.commands['zero.openPublishedWeb'](),undefined,'Busy guard prevents duplicate opens');
  opened.resolve(true);const result=await operation;assert.equal(result.sha,oldSha);assert.equal(h.progress.at(-1),undefined);assert.equal(h.states.at(-1),'Published app opened');
  assert.deepEqual({published:h.published,uploaded:h.uploaded,reviewed:h.reviewed},before);
});
test('historical browser opening keeps final project/session/mode/trust guards and clears failures',async t=>{
  for(const mode of ['project','session','simulation','trust','pending','browser']){
    const h=fixture(t);h.choices.push('Publish app');await h.api.publish();h.opened.length=0;
    h.publisher.verifyLink=async(_root,saved)=>{
      if(mode==='project')h.active='/other';
      if(mode==='session')h.auth.assertCurrentNow=()=>{throw Error('Account changed');};
      if(mode==='simulation')h.simulation=true;
      if(mode==='trust')h.vscode.workspace.isTrusted=false;
      if(mode==='pending')return {status:'pending',message:'Page unavailable'};
      return {status:'live',url:saved.url,sha:saved.sha};
    };
    if(mode==='browser')h.vscode.env.openExternal=async()=>{throw Error('Browser unavailable');};
    if(mode==='pending')await h.api.commands['zero.openPublishedWeb']();else await assert.rejects(h.api.commands['zero.openPublishedWeb']());
    assert.deepEqual(h.opened,[],mode);assert.equal(h.progress.at(-1),undefined,mode);assert.equal(h.busy,false,mode);
  }
});

test('unchanged fast reuse opens without another review, upload or deployment',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();let fast=0;
  h.publisher.verifyUnchanged=async(root,saved,options)=>{fast++;assert.equal(root,'/student');await options.beforeFinalCheck();const live={status:'live',url:saved.url,sha:saved.sha,resume:saved.resume};options.onCurrent(live);return live;};
  const result=await h.api.publishAndOpen();assert.equal(result.alreadyCurrent,true);assert.equal(fast,1);assert.equal(h.reviewed,1);assert.equal(h.published,1);assert.equal(h.uploaded,0);assert.equal(h.opened.length,1);assert.equal(h.busy,false);assert.equal(h.progress.at(-1),undefined);
});
test('unchanged fast reuse skips browser tooling review',async t=>{
  let hookCalls=0;const h=fixture(t,{beforeBuildReview:async()=>{hookCalls++;}});h.choices.push('Publish app');await h.api.publish();
  h.publisher.verifyUnchanged=async(_root,saved,options)=>{await options.beforeFinalCheck();const live={status:'live',url:saved.url,sha:saved.sha,resume:saved.resume};options.onCurrent(live);return live;};
  const result=await h.api.publishAndOpen();assert.equal(result.alreadyCurrent,true);assert.equal(hookCalls,1);assert.equal(h.reviewed,1);assert.equal(h.uploaded,0);
});
test('changed project leaves fast reuse and completes the guarded publish/open flow',async t=>{
  const h=fixture(t);h.choices.push('Publish app');await h.api.publish();h.sha='b'.repeat(40);
  h.publisher.verifyUnchanged=async()=>({status:'stale'});
  const result=await h.api.publishAndOpen();assert.equal(result.sha,'b'.repeat(40));assert.equal(h.reviewed,3);assert.equal(h.published,2);assert.equal(h.opened.length,1);assert.equal(h.stored.get('zero.webPublish.lastLive').sha,'b'.repeat(40));
});
test('fast reuse failure preserves the old publication without opening or deploying',async t=>{
  for(const kind of ['pending','network','project','dirty'])await t.test(kind,async t=>{
    const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const saved=h.stored.get('zero.webPublish.lastLive');
    h.publisher.verifyUnchanged=async(_root,_saved,options)=>{
      if(kind==='pending')return {status:'pending',message:'Page unavailable'};
      if(kind==='network')throw Error('Offline');
      if(kind==='project')h.active='/other';
      if(kind==='dirty')h.vscode.workspace.textDocuments=[dirtyDocument()];
      await options.beforeFinalCheck();const live={status:'live',url:saved.url};options.onCurrent(live);return live;
    };
    if(kind==='pending')assert.equal((await h.api.publishAndOpen()).status,'pending');else await assert.rejects(h.api.publishAndOpen());
    assert.equal(h.published,1);assert.deepEqual(h.opened,[]);assert.deepEqual(h.stored.get('zero.webPublish.lastLive'),saved);assert.equal(h.busy,false);assert.equal(h.progress.at(-1),undefined);
  });
});

test('View published app opens the saved site immediately despite dirty edits and unavailable GitHub',async t=>{
 const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const saved=h.stored.get('zero.webPublish.lastLive'),before={reviewed:h.reviewed,published:h.published,uploaded:h.uploaded,checks:h.checks};
 h.sha='b'.repeat(40);h.vscode.workspace.textDocuments=[dirtyDocument({save:()=>assert.fail('Viewing must not save')})];
 h.auth.capture=()=>assert.fail('Viewing must not authenticate');h.auth.assertCurrent=()=>assert.fail('Viewing must not authenticate');h.auth.assertCurrentNow=()=>assert.fail('Viewing must not authenticate');
 h.publisher.verifyLink=()=>assert.fail('Viewing must not check the public site');h.publisher.verifyUnchanged=()=>assert.fail('Viewing must not check local source');
 const result=await h.api.commands['zero.viewPublishedWeb']();assert.equal(result.status,'opened');assert.deepEqual(h.opened,[saved.url]);assert.deepEqual(h.stored.get('zero.webPublish.lastLive'),saved);assert.deepEqual({reviewed:h.reviewed,published:h.published,uploaded:h.uploaded,checks:h.checks},before);assert.equal(h.busy,false);assert.equal(h.progress.at(-1),undefined);
});
test('View published app rejects missing or disconnected receipts and unsafe URL data without network calls',async t=>{
 const base={root:'/student',account:'1',sha:'a'.repeat(40),url:'https://student.github.io/game/',resume:{sha:'a'.repeat(40),runId:42,repository:'https://github.com/student/game'}};
 for(const saved of [undefined,{...base,root:'/other'},{...base,url:'javascript:alert(1)'},{...base,url:'https://user:password@student.github.io/game/'},{...base,url:'https://127.0.0.1/'},{...base,resume:{...base.resume,repository:'https://github.com/student/other'}},{...base,resume:{...base.resume,destination:{url:'https://other.github.io/'}}}]){
  const h=fixture(t);if(saved)h.stored.set('zero.webPublish.lastLive',saved);h.auth.capture=()=>assert.fail('No authentication expected');
  await assert.rejects(h.api.commands['zero.viewPublishedWeb'](),/Publish this project/);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);assert.equal(h.progress.at(-1),undefined);
 }
});
test('View published app keeps opening progress, duplicate protection and useful browser failure feedback',async t=>{
 const h=fixture(t);h.choices.push('Publish app');await h.api.publish();const gate=deferred(),started=deferred();h.vscode.env.openExternal=()=>{started.resolve();return gate.promise;};
 const open=h.api.commands['zero.viewPublishedWeb']();await started.promise;assert.equal(h.busy,true);assert.deepEqual(h.progress.at(-1).stages,['opening']);assert.equal(await h.api.commands['zero.viewPublishedWeb'](),undefined);
 gate.resolve(false);assert.equal((await open).status,'failed');assert.match(h.states.at(-1),/browser could not be opened/);assert.ok(h.stored.get('zero.webPublish.lastLive'));assert.equal(h.busy,false);assert.equal(h.progress.at(-1),undefined);
});
test('View published app respects simulation, current project and repository guards',async t=>{
 let repository='https://github.com/student/game';const h=fixture(t,{connectedRepository:()=>repository});h.choices.push('Publish app');await h.api.publish();
 repository='https://github.com/student/other';await assert.rejects(h.api.commands['zero.viewPublishedWeb'](),/Publish this project/);repository='https://github.com/student/game';
 h.simulation=true;await h.api.commands['zero.viewPublishedWeb']();assert.deepEqual(h.opened,[]);h.simulation=false;
 h.active='/other';await assert.rejects(h.api.commands['zero.viewPublishedWeb'](),/Publish this project/);assert.equal(h.busy,false);
});

test('verified publish lists automatically and reusing the same app retries only its pending listing', async t=>{
  const listings=[];
  const h=fixture(t,{listPublication:async (saved,{beforeSend})=>{
    beforeSend();
    listings.push(saved.resume.runId);
    return listings.length === 1 ? {status:'pending'} : {status:'listed',replaced:'older-game'};
  }});
  h.choices.push('Publish app');
  await h.api.publish();
  assert.equal(h.messages[0][1].detail,'Your app and its assets will be public. This may replace your currently published app.\nhttps://student.github.io/game/');
  assert.deepEqual(listings,[42]);
  assert.match(h.states.at(-1),/ZeroHub app listing pending/);
  await h.api.publishAndOpen();
  assert.deepEqual(listings,[42,42]);
  assert.equal(h.published,1);
  assert.match(h.states.at(-1),/Added to ZeroHub, replacing older-game/);
  await h.api.publishAndOpen();
  assert.deepEqual(listings,[42,42]);
});

test('failed deployment and the saved Open published app action leave ZeroHub alone', async t=>{
  let listings=0;
  const h=fixture(t,{listPublication:async()=>{listings++; return {status:'listed'};}});
  h.choices.push('Publish app');
  const check=h.publisher.check;
  h.publisher.check=async()=>({status:'failed',message:'Build failed'});
  await h.api.publish();
  assert.equal(listings,0);
  h.publisher.check=check;
  await h.api.publish();
  assert.equal(listings,1);
  await h.api.commands['zero.viewPublishedWeb']();
  assert.equal(listings,1);
});

test('desktop listing checks availability before acquiring or sending its token', async ()=>{
  const {createHubPublishListing}=require('../src/hub-publish-listing');
  let enabled=false, captured=0;
  const calls=[];
  const client=createHubPublishListing({
    capture:async()=>{captured++;return {};},
    assertCurrentNow:()=>({accountId:'1',accessToken:'ghu_fixtureTokenForTest'})
  },async (url,options)=>{
    calls.push({url,options});
    return url.endsWith('/capability') ? Response.json({enabled}) : Response.json({status:'listed'});
  });
  const saved={resume:{repositoryId:3,runId:42,repository:'https://github.com/student/game'},
    account:'1',sha:'a'.repeat(40),url:'https://student.github.io/game/'};
  const options={signal:new AbortController().signal,beforeSend:()=>{}};
  assert.deepEqual(await client(saved, options),{status:'unavailable'});
  assert.equal(captured,0);
  assert.equal(calls[0].options.headers,undefined);
  enabled=true;
  assert.deepEqual(await client(saved, options),{status:'listed'});
  assert.equal(captured,1);
  assert.equal(calls[2].url,'https://zero.codepet.ca/api/hub/listings');
  assert.equal(JSON.parse(calls[2].options.body).pagesUrl,saved.url);
  assert.equal(calls[2].options.redirect,'error');
});
test('deployment result reports only the stable failure code and suppresses cancellation',async t=>{
  const reports=[],stages=[];
  const h=fixture(t,{onReportFailure:(error,root)=>reports.push({code:error.code,root,message:error.message}),onReportStage:stage=>stages.push(stage)});
  h.choices.push('Publish app');
  h.publisher.check=async()=>({status:'failed',reportCode:'WEB_PUBLISH_DEPLOYMENT_FAILED',message:'Private GitHub details'});
  assert.equal((await h.api.publish()).status,'failed');
  assert.deepEqual(reports,[{code:'WEB_PUBLISH_DEPLOYMENT_FAILED',root:'/student',message:''}]);
  assert.equal(stages.at(-1),'deploying');
  reports.length=0;h.choices.push('Publish app');
  h.publisher.check=async()=>({status:'failed',message:'Cancelled'});
  assert.equal((await h.api.publish()).status,'failed');assert.deepEqual(reports,[]);
});
test('browser dispatch failure reports opening and cannot claim recovery',async t=>{
  const reports=[],successes=[],stages=[];
  const h=fixture(t,{onReportFailure:(error,root)=>reports.push({code:error.code,root}),onReportStage:stage=>stages.push(stage),onReportSuccess:(root,stage)=>successes.push({root,stage})});
  h.choices.push('Publish app');h.vscode.env.openExternal=async()=>false;
  const result=await h.api.publishAndOpen();assert.equal(result.opened,false);
  assert.deepEqual(reports,[{code:'WEB_PUBLISH_OPEN_FAILED',root:'/student'}]);assert.equal(stages.at(-1),'opening');assert.deepEqual(successes,[]);
});
