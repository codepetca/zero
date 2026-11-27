import assert from 'node:assert/strict';
import test from 'node:test';
import {approved,fixture,legacyProposal,manifest,maintainer,NEXT_COMMIT,hostedManifest,participant,creator,verifiedPages} from '../../jams/test/fixtures.mjs';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {desktopJamProjectChangeResponse,getDesktopJamProjectResponse,postDesktopJamSubmitResponse} from '../lib/jams-http.mjs';

const origin='http://127.0.0.1:3000',token='ghu_'+'d'.repeat(24);
const env={NODE_ENV:'test',ZERO_JAMS_ENABLED:'1',ZERO_HUB_ORIGIN:origin,
  ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'secret-'.repeat(6),ZERO_HUB_GITHUB_SESSION_SECRET:'a'.repeat(64)};
const repositoryId='202',repositoryUrl='https://github.com/student/project',pagesUrl='https://student.github.io/project/';
const commit='b'.repeat(40),runId='30';
const proofUrl=new URL('zero-source-sha.txt',pagesUrl).href;
const workflowRun={id:Number(runId),repository:{id:Number(repositoryId)},head_sha:commit,head_branch:'main',
  path:'.github/workflows/zero-web.yml@main',event:'workflow_dispatch',status:'completed',conclusion:'success',created_at:'2030-01-02T12:00:00.000Z'};

function desktopRequest(path,{body,headers,method=body?'POST':'GET'}={}) {
  return new Request(origin+path,{method,headers:{'X-Zero-Desktop':'1',Authorization:'Bearer '+token,
    ...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
}

test('only the authenticated desktop member can add and remove a Game Jam project',async()=>{
  const {service}=fixture();
  const {eventId:id}=await register(service,creator,'manage-desktop-projects');
  const path='/api/desktop/jams/'+id+'/projects';
  const options=account=>({env,service,fetchImpl:transport(account,()=>assert.fail('Unexpected GitHub call'))});
  const remove={operationId:'remove-desktop-project',repositoryId,projectRevision:''};
  const request=(method,body,headers)=>desktopRequest(path,{method,body,headers});
  assert.equal((await desktopJamProjectChangeResponse(request('DELETE',remove,{Cookie:'browser=1'}),id,options(participant))).status,403);
  assert.equal((await desktopJamProjectChangeResponse(request('DELETE',remove),id,options(creator))).status,409);
  assert.equal((await desktopJamProjectChangeResponse(request('POST',remove),id,options(participant))).status,400);
  const removed=await desktopJamProjectChangeResponse(request('DELETE',remove),id,options(participant));
  assert.equal(removed.status,200);
  assert.equal(removed.headers.get('cache-control'),'no-store');
  assert.equal((await removed.json()).status,'project-removed');
  assert.deepEqual((await service.readEditorJoin(id,participant)).registration.repositories,[]);
  const {registration}=await service.readEditorJoin(id,participant);
  const added=await desktopJamProjectChangeResponse(request('POST',{operationId:'add-desktop-project',repositoryId,repositoryUrl,
    projectRevision:registration.projectRevision}),id,options(participant));
  assert.equal((await added.json()).status,'project-added');
  assert.equal((await service.readEditorJoin(id,participant)).registration.repositories[0].id,repositoryId);
  const check={'X-Zero-Check-Project-Change':'1'};
  const existing=await desktopJamProjectChangeResponse(request('DELETE',remove,check),id,options(participant));
  assert.equal((await existing.json()).settlement,'applied');
  const neverSent={...remove,operationId:'never-dispatched-change'};
  const fenced=await desktopJamProjectChangeResponse(request('DELETE',neverSent,check),id,options(participant));
  assert.equal((await fenced.json()).settlement,'not-applied');
  const tooLate=await desktopJamProjectChangeResponse(request('DELETE',neverSent),id,options(participant));
  assert.equal(tooLate.status,409);
  assert.equal((await service.readEditorJoin(id,participant)).registration.repositories[0].id,repositoryId);
});
async function register(service,actor,operationId,manifest=hostedManifest()) {
  const event=await service.propose({actor,operationId,manifest});
  await service.mutate({id:event.eventId,actor:participant,operationId:'join-'+operationId,
    action:'join',revision:event.revision,repositoryUrl,repositoryId},{joinChannel:'editor'});
  return event;
}
function transport(account,github) {
  return async (url,init)=>{
    const user={id:Number(account.id),login:account.login};
    if(url==='https://api.github.com/applications/'+zeroApp.clientId+'/token')return Response.json({user,app:{client_id:zeroApp.clientId}});
    if(url==='https://api.github.com/user')return Response.json(user);
    return github(url,init);
  };
}

test('destination selects only the account’s linked active Game Jams and never guesses between multiple choices',async()=>{
  const {service,setTime}=fixture();
  const first=await register(service,creator,'destination-first');
  const other=await register(service,{id:'12',login:'creator2'},'destination-second',hostedManifest({
    title:'Second game jam',schedule:{...hostedManifest().schedule,submissionsCloseAt:'2030-01-04T12:00:00Z'}
  }));
  const app=await service.propose({actor:{id:'13',login:'creator3'},operationId:'destination-app',manifest:hostedManifest({type:'app'})});
  await service.mutate({id:app.eventId,actor:participant,operationId:'join-destination-app',
    action:'join',revision:app.revision,repositoryUrl},{joinChannel:'browser'});
  const request=()=>desktopRequest('/api/desktop/jams/project?repositoryId='+repositoryId);
  const lookup=async account=>{
    const response=await getDesktopJamProjectResponse(request(),{env,service,fetchImpl:transport(account,()=>assert.fail('No publication calls'))});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    return response.json();
  };
  assert.deepEqual(await lookup(participant),{configured:true,destination:null,ambiguous:true});
  assert.deepEqual(await lookup(creator),{configured:true,destination:null});
  await service.mutate({actor:participant,id:first.eventId,operationId:'destination-leave',action:'leave'});
  const available=await lookup(participant);
  assert.deepEqual(available.destination,{id:other.eventId,title:'Second game jam',revision:other.revision,
    entryRevision:'',projectRevision:'',submissionsOpen:true,submissionsCloseAt:'2030-01-04T12:00:00.000Z'});
  setTime('2030-01-04T12:00:00Z');
  assert.equal((await lookup(participant)).destination.submissionsOpen,false);
  await service.mutate({actor:{id:'12',login:'creator2'},id:other.eventId,operationId:'destination-cancel',action:'cancel',reason:'Date changed'});
  assert.deepEqual(await lookup(participant),{configured:true,destination:null});
});

test('destination includes approved rules when the registration acknowledged an older revision',async()=>{
  const f=fixture(),{service}=f;
  const revision=await approved(f);
  await service.mutate({id:'jam-101',actor:participant,operationId:'join-old-event',action:'join',revision,repositoryUrl,repositoryId},{joinChannel:'editor'});
  const next=await legacyProposal(f,{operationId:'revised-event',commit:NEXT_COMMIT,data:manifest({rules:'Revised rules',eligibility:'Revised eligibility'})});
  await service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-revised-event',action:'approve',revision:next.revision});
  const {destination}=await service.projectDestination(repositoryId,participant);
  assert.equal(destination.revision,next.revision);
  assert.equal(destination.rules,'Revised rules');
  assert.equal(destination.eligibility,'Revised eligibility');
});

test('desktop publish verifies only the bound build, keeps authored details and recovers the same receipt after closing',async()=>{
  const {service,store,setTime}=fixture({pagesBindingReader:verifiedPages});
  const event=await register(service,creator,'published-entry');
  const base={revision:event.revision,repositoryId,pagesUrl,commit,runId,entryRevision:''};
  const body={...base,operationId:'publish-first-build'};
  const path='/api/desktop/jams/'+event.eventId+'/submit';
  let pagesCalls=0,runCalls=0,markerCalls=0,proof=commit+'\n'+runId;
  const options={env,service,fetchImpl:transport(participant,(url,init)=>{
    assert.equal(init.headers.Authorization,'Bearer '+token);
    if(url==='https://api.github.com/repos/student/project/pages'){
      pagesCalls++;
      return Response.json({html_url:pagesUrl,public:true,build_type:'workflow'});
    }
    assert.equal(url,'https://api.github.com/repos/student/project/actions/runs/'+runId);
    runCalls++;
    return Response.json(workflowRun);
  }),readPublishedMarker:async url=>{
    assert.equal(url,proofUrl);
    markerCalls++;
    return new Response(proof);
  }};
  const submit=body=>postDesktopJamSubmitResponse(desktopRequest(path,{body}),event.eventId,options);
  assert.equal((await submit({...body,repositoryId:'203'})).status,409);
  assert.equal((await submit({...body,title:'Fake'})).status,400);
  assert.deepEqual([pagesCalls,runCalls,markerCalls],[0,0,0]);
  proof='a'.repeat(40)+'\n'+runId;
  assert.equal((await submit(body)).status,503);
  assert.equal((await service.readOverview(event.eventId,participant)).entry,null);
  proof=commit+'\n'+runId;
  const accepted=await submit(body);
  assert.equal(accepted.status,200,await accepted.clone().text());
  assert.equal((await accepted.json()).status,'submitted');
  const initial=(await service.readOverview(event.eventId,participant)).entry;
  assert.equal(initial.title,'project');
  assert.equal(initial.description,'');
  assert.equal(initial.pagesVerification.repositoryId,repositoryId);
  const repeat={...body,operationId:'publish-first-build-again',entryRevision:initial.revision};
  const repeated=await submit(repeat);
  assert.equal(repeated.status,200);
  assert.deepEqual(await repeated.json(),{configured:true,eventId:event.eventId,operationId:repeat.operationId,
    status:'submitted',revision:initial.revision,alreadySubmitted:true});
  const afterRepeat=(await store.read(event.eventId)).state;
  assert.equal(afterRepeat.entries[participant.id].length,1);
  assert.equal(Object.keys(afterRepeat.operations).length,3);
  assert.deepEqual([pagesCalls,runCalls,markerCalls],[2,2,2]);

  const authored=await service.mutate({id:event.eventId,actor:participant,action:'submit',revision:event.revision,operationId:'author-entry-copy',
    title:'Student title',description:'Student description',instructions:'Press Space',demoUrl:pagesUrl});
  store.afterCas=async()=>{throw Error('Lost acknowledgment');};
  const update={...base,operationId:'publish-updated-build',entryRevision:authored.revision};
  assert.equal((await submit(update)).status,503);
  store.afterCas=null;
  assert.deepEqual([pagesCalls,runCalls,markerCalls],[3,3,3]);
  setTime('2030-01-04T00:00:00Z');
  proof='No longer available';
  const recovered=await submit(update);
  assert.equal(recovered.status,200,await recovered.clone().text());
  const entry=(await service.readOverview(event.eventId,participant)).entry;
  assert.deepEqual([entry.title,entry.description,entry.instructions],['Student title','Student description','Press Space']);
  assert.equal((await submit({...update,commit:'c'.repeat(40)})).status,409,'same operation cannot change its proof');
  const sameAfterClose=await submit({...update,entryRevision:entry.revision,operationId:'publish-after-close'});
  assert.equal(sameAfterClose.status,200);
  assert.equal((await sameAfterClose.json()).alreadySubmitted,true);
  assert.equal((await submit({...update,entryRevision:entry.revision,operationId:'different-build-after-close',commit:'c'.repeat(40)})).status,409);
  assert.deepEqual([pagesCalls,runCalls,markerCalls],[3,3,3]);
  assert.equal((await store.read(event.eventId)).state.entries[participant.id].length,3);
});

test('concurrent writes preserve the entry revision precondition and unchanged transactional repeats avoid new history',async()=>{
  const {service,store}=fixture();
  const event=await register(service,creator,'concurrent-event');
  const publication={repositoryId,pagesUrl,commit,runId,entryRevision:''};
  let arrive,visits=0;
  const gate=new Promise(resolve=>{arrive=resolve;});
  async function verifyPublication(){
    if(++visits===2)arrive();
    await gate;
    return {pagesUrl};
  }
  const submit=(operationId,entryRevision='')=>service.mutate({id:event.eventId,actor:participant,action:'submit',
    operationId,revision:event.revision,publication:{...publication,entryRevision}},{verifyPublication});
  const results=await Promise.allSettled([submit('concurrent-publish-1'),submit('concurrent-publish-2')]);
  const accepted=results.find(result=>result.status==='fulfilled').value;
  const rejected=results.find(result=>result.status==='rejected').reason;
  assert.equal(rejected.status,409);
  assert.match(rejected.message,/entry changed/);
  const before=(await store.snapshot()).revision;
  let transactions=0;
  store.transact=async work=>{transactions++;return work(store);};
  const repeat=await submit('transaction-publish-repeat',accepted.revision);
  assert.equal(repeat.alreadySubmitted,true);
  assert.equal(repeat.revision,accepted.revision);
  assert.equal(transactions,1);
  assert.equal(visits,2);
  assert.equal((await store.snapshot()).revision,before);
  assert.equal((await store.read(event.eventId)).state.entries[participant.id].length,1);
});

test('an exact newer live run settles an unconfirmed receipt before an in-flight old write can apply',async()=>{
  const {service,store}=fixture();
  const event=await register(service,creator,'superseded-event');
  const operationId='superseded-publication';
  const body={operationId,revision:event.revision,repositoryId,pagesUrl,commit,runId,entryRevision:''};
  const newerCommit='c'.repeat(40),newerId='31';
  const newerRun={...workflowRun,id:Number(newerId),head_sha:newerCommit,created_at:'2030-01-02T12:01:00.000Z'};
  let marker=commit+'\n'+runId,observedNewer={...newerRun,head_branch:'feature'},calls=0;
  const options={env,service,fetchImpl:transport(participant,url=>{
    calls++;
    if(url.endsWith('/pages'))return Response.json({html_url:pagesUrl,public:true,build_type:'workflow'});
    if(url.endsWith('/actions/runs/'+runId))return Response.json(workflowRun);
    assert.ok(url.endsWith('/actions/runs/'+newerId));
    return Response.json(observedNewer);
  }),readPublishedMarker:async()=>new Response(marker)};
  const submit=(payload=body)=>postDesktopJamSubmitResponse(desktopRequest('/api/desktop/jams/'+event.eventId+'/submit',
    {body:payload}),event.eventId,options);
  let reachedWrite,releaseWrite;
  const writing=new Promise(resolve=>{reachedWrite=resolve;});
  const writeReleased=new Promise(resolve=>{releaseWrite=resolve;});
  store.beforeCas=async id=>{if(id===event.eventId){reachedWrite();await writeReleased;}};
  const inFlight=submit();
  await writing;
  try {
    marker=newerCommit+'\n'+newerId;
    assert.equal((await submit()).status,503,'another branch is insufficient proof of supersession');
    observedNewer={...newerRun,created_at:workflowRun.created_at};
    assert.equal((await submit()).status,503,'the newly observed run must be newer');
    assert.deepEqual((await store.snapshot()).settlements.operations,{});
    observedNewer=newerRun;
    const closed=await submit();
    assert.equal(closed.status,409);
    assert.match((await closed.json()).error,/A newer build is live/);
    const settled=(await store.snapshot()).settlements.operations;
    assert.equal(settled[`${event.eventId}:${participant.id}:${operationId}`].operationId,operationId);
  } finally {
    releaseWrite();
  }
  assert.equal((await inFlight).status,409);
  assert.equal((await service.readOverview(event.eventId,participant)).entry,null);
  const checkedCalls=calls;
  assert.equal((await submit()).status,409);
  assert.equal(calls,checkedCalls,'the durable terminal result does not need another Pages probe');
  const current=await submit({...body,operationId:'publish-current-build',commit:newerCommit,runId:newerId});
  assert.equal(current.status,200);
  assert.equal((await current.json()).status,'submitted');
});

test('retry of an unrecorded no-op cannot reinstate an entry withdrawn in the browser',async()=>{
  const {service,store}=fixture();
  const event=await register(service,creator,'withdraw-race-event');
  const publication={repositoryId,pagesUrl,commit,runId};
  let visits=0;
  const submit=(operationId,entryRevision)=>service.mutate({id:event.eventId,actor:participant,action:'submit',
    operationId,revision:event.revision,publication:{...publication,entryRevision}},
    {verifyPublication:async()=>{visits++;return {pagesUrl};}});
  const accepted=await submit('withdraw-first-build','');
  const noOpId='withdraw-repeat-lost-ack';
  const repeat=await submit(noOpId,accepted.revision);
  assert.equal(repeat.alreadySubmitted,true);
  assert.equal((await store.read(event.eventId)).state.operations[participant.id+':'+noOpId],undefined);

  await service.mutate({id:event.eventId,actor:participant,action:'withdraw',operationId:'website-withdrawal'},{joinChannel:'browser'});
  const withdrawn=(await service.readOverview(event.eventId,participant)).entry;
  assert.equal(withdrawn.status,'withdrawn');
  const {destination}=await service.projectDestination(repositoryId,participant);
  assert.equal(destination.entryRevision,withdrawn.revision);
  await assert.rejects(submit(noOpId,accepted.revision),{status:409,message:/entry changed/});
  assert.equal((await service.readOverview(event.eventId,participant)).entry.status,'withdrawn');
  assert.equal(visits,1,'stale replay cannot verify or mutate the current entry');
  const republish=await submit('withdraw-confirmed-republish',destination.entryRevision);
  assert.equal(republish.status,'submitted');
  assert.equal((await service.readOverview(event.eventId,participant)).entry.revision,republish.revision);
  assert.equal(visits,2);
});
