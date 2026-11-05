import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {digest} from '../schema.mjs';
import {getJamsResponse} from '../../website/lib/jams-http.mjs';
import {fixture,manifest,approved,creator,maintainer,participant,submission,hostedManifest} from './fixtures.mjs';

const id='jam-101',reveal='2030-01-05T00:00:00Z',demoUrl='https://play.example.org/';
const verified=async(repository,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repository.id,ownerId:repository.ownerId});
async function setup(reader=verified) {
 const f=fixture({pagesBindingReader:verified,verifyRepository:async()=>({repository:{id:'202',ownerId:participant.id,fullName:'student/project'}}),source:async input=>({repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:reveal}})})});
 const revision=await approved(f);
 await f.service.mutate({id,actor:participant,operationId:'read-proof-join-01',action:'join',revision,repositoryUrl:'https://github.com/student/project'});
 const {source,...request}=submission(revision,{demoUrl});
 await f.service.mutate(request);
 let time=Date.parse(reveal);
 f.time=value=>{time=typeof value==='number'?value:Date.parse(value);};
 f.reader=createJamService({store:f.store,verifySource:async()=>{throw Error('unused');},pagesBindingReader:reader,maintainerIds:[maintainer.id],now:()=>time});
 f.withStore=store=>createJamService({store,verifySource:async()=>{throw Error('unused');},pagesBindingReader:reader,maintainerIds:[maintainer.id],now:()=>time});
 return f;
}
function cloneEvent(f,newId=id) {
 const record=structuredClone(f.store.records.get(id));
 record.state.id=newId;record.state.repositoryId=newId.slice(4);
 for(const proposal of [...record.state.proposals,record.state.accepted])proposal.repository.id=newId.slice(4);
 for(const operation of Object.values(record.state.operations))operation.result.eventId=newId;
 f.store.records.set(newId,record);return record;
}

test('fresh matching Pages proof is required on each read; negative results do not cache or expose private entries',async()=>{
 let accepted=false,calls=0;
 const f=await setup(async(repository,url)=>{calls++;return accepted?verified(repository,url):{status:'unverified',reason:'identity-mismatch'};});
 const missing=await f.reader.read(id),listing=await f.reader.list();
 assert.deepEqual(missing.event.entries,[]);assert.equal(missing.event.galleryIncomplete,true);
 assert.deepEqual(listing.events[0].entries,[]);assert.equal(listing.events[0].galleryIncomplete,true);
 assert.doesNotMatch(JSON.stringify(missing.event),/play\.example\.org|identity-mismatch/);
 const own=await f.reader.read(id,participant),moderation=await f.reader.read(id,maintainer);
 assert.equal(own.entry.demoUrl,demoUrl);assert.equal(own.moderationEntries,undefined);
 assert.equal(moderation.moderationEntries[0].demoUrl,demoUrl);
 accepted=true;
 const recovered=await f.reader.read(id);
 assert.equal(recovered.event.entries[0].demoUrl,demoUrl);assert.equal(recovered.event.galleryIncomplete,undefined);
 assert.equal(calls,5);
});

test('mismatched proof IDs or exact URL and thrown provider failures omit only public entry',async()=>{
 for(const reader of [async(repository,url)=>({...await verified(repository,url),repositoryId:'999'}),async(repository,url)=>({...await verified(repository,url),ownerId:'99'}),async(repository,url)=>({...await verified(repository,url),pagesUrl:'https://another.example/'}),async()=>{throw Error('secret provider body');}]) {
  const f=await setup(reader),detail=await f.reader.read(id,maintainer);
  assert.deepEqual(detail.event.entries,[]);assert.equal(detail.moderationEntries[0].demoUrl,demoUrl);
  assert.doesNotMatch(JSON.stringify(detail),/secret provider body/);
 }
});

test('suspended and cancelled event details still flag unavailable revealed submissions',async()=>{
 for(const action of ['suspend','cancel']) {
  const f=await setup(async()=>({status:'unverified',reason:'unavailable'}));
  await f.reader.mutate({id,actor:maintainer,operationId:`gallery-${action}-001`,action,reason:'Reviewing the event'});
  const detail=await f.reader.read(id);
  assert.deepEqual(detail.event.entries,[]);assert.equal(detail.event.galleryIncomplete,true);
 }
});

test('pre-reveal and global holds dispatch no Pages observations',async()=>{
 let calls=0;const f=await setup(async(repository,url)=>{calls++;return verified(repository,url);});
 f.time(Date.parse(reveal)-1);assert.equal((await f.reader.read(id)).event.galleryIncomplete,undefined);await f.reader.list();
 f.time(reveal);
 const hold=cloneEvent(f,'jam-102');
 for(const proposal of [...hold.state.proposals,hold.state.accepted])proposal.manifest.schedule.galleryRevealAt='2030-01-06T00:00:00.000Z';
 assert.deepEqual((await f.reader.read(id)).event.entries,[]);
 assert.equal(calls,0);
});

test('same repository and exact URL are deduplicated within a request and reobserved in the next',async()=>{
 let calls=0;const f=await setup(async(repository,url)=>{calls++;return verified(repository,url);});cloneEvent(f,'jam-102');
 assert.deepEqual((await f.reader.list()).events.map(event=>event.entries.length),[1,1]);assert.equal(calls,1);
 await f.reader.list();assert.equal(calls,2);
});

test('summary-only HTTP directory avoids Pages checks and preserves full gallery behavior for existing callers',async()=>{
 let calls=0;const f=await setup(async(repository,url)=>{calls++;return verified(repository,url);});
 const response=await getJamsResponse(new Request('http://127.0.0.1/api/jams?view=summaries'),
  {env:{NODE_ENV:'test',ZERO_JAMS_ENABLED:'1'},service:f.reader,now:()=>Date.parse(reveal)});
 assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.galleriesDeferred,true);assert.equal(body.events.length,1);
 assert.equal(Object.hasOwn(body.events[0],'entries'),false);assert.equal(calls,0);
 assert.doesNotMatch(JSON.stringify(body),/play\.example\.org|pagesVerification/);
 assert.equal((await f.reader.list()).events[0].entries.length,1);assert.equal(calls,1);
});

test('public observation concurrency is bounded to four and rechecks one complete registry afterward',async()=>{
 let active=0,peak=0,calls=0;
 const f=await setup(async(repository,url,{signal})=>{calls++;active++;peak=Math.max(peak,active);assert.equal(signal.aborted,false);await new Promise(setImmediate);active--;return verified(repository,url);});
 const state=f.store.records.get(id).state,template=state.entries[participant.id][0];
 for(let number=40;number<46;number++) {
  const actorId=String(number),login=`student${number}`,repository={id:String(number+300),ownerId:actorId,fullName:`${login}/project`};
  state.registrations[actorId]={...state.registrations[participant.id],id:actorId,login,repository};
  state.entries[actorId]=[{...template,participantId:actorId,login,repository,revision:digest({actorId}),pagesVerification:{...template.pagesVerification,repositoryId:repository.id,ownerId:actorId}}];
 }
 let snapshots=0;const original=f.store.snapshot.bind(f.store),service=f.withStore({...f.store,snapshot:async options=>{snapshots++;return original(options);}});
 assert.equal((await service.list()).events[0].entries.length,7);
 assert.equal(calls,7);assert.equal(peak,4);assert.equal(snapshots,2);
});

test('registry changes during observation reject stale public projections after complete revalidation',async()=>{
 for(const change of [f=>{f.store.records.get(id).state.entries[participant.id][0].title='Changed';},f=>{const hold=cloneEvent(f,'jam-102');for(const proposal of [...hold.state.proposals,hold.state.accepted])proposal.manifest.schedule.galleryRevealAt='2030-01-06T00:00:00.000Z';}]) {
  let f;f=await setup(async(repository,url)=>{change(f);f.store.bump();return verified(repository,url);});
  await assert.rejects(f.reader.read(id),{status:503,message:'Project visibility is unavailable.'});
 }
});

test('one original deadline includes noncooperative proof and prevents late second discovery',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const lateReject of [false,true]) {
  const reached=Promise.withResolvers(),release=Promise.withResolvers();let signal;
  const f=await setup(async(repository,url,options)=>{signal=options.signal;reached.resolve();return release.promise;});
  let snapshots=0;const original=f.store.snapshot.bind(f.store),service=f.withStore({...f.store,snapshot:async options=>{snapshots++;return original(options);}});
  const pending=assert.rejects(service.read(id),{status:503,message:'Project visibility is unavailable.'});
  await reached.promise;t.mock.timers.tick(17_999);assert.equal(signal.aborted,false);t.mock.timers.tick(1);await pending;
  assert.equal(signal.aborted,true);assert.equal(snapshots,1);
  if(lateReject)release.reject(Error('private late failure'));else release.resolve(await verified({id:'202',ownerId:'33'},demoUrl));
  await new Promise(setImmediate);assert.equal(snapshots,1);
 }
});

test('caller cancellation during proof stops waiting and prevents late authority dispatch',async()=>{
 const reached=Promise.withResolvers(),release=Promise.withResolvers();let signal;
 const f=await setup(async(repository,url,options)=>{signal=options.signal;reached.resolve();return release.promise;});
 let snapshots=0;const original=f.store.snapshot.bind(f.store),service=f.withStore({...f.store,snapshot:async options=>{snapshots++;return original(options);}});
 const controller=new AbortController(),pending=assert.rejects(service.read(id,undefined,{signal:controller.signal}),{status:503});
 await reached.promise;controller.abort();await pending;assert.equal(signal.aborted,true);
 release.reject(Error('secret late rejection'));await new Promise(setImmediate);assert.equal(snapshots,1);
});

test('final complete authority pass uses the original remaining deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const proofReached=Promise.withResolvers(),proofRelease=Promise.withResolvers(),finalReached=Promise.withResolvers(),finalRelease=Promise.withResolvers();
 const f=await setup(async(repository,url)=>{proofReached.resolve();await proofRelease.promise;return verified(repository,url);});
 let snapshots=0,signal;const original=f.store.snapshot.bind(f.store);
 const service=f.withStore({...f.store,snapshot:async options=>{snapshots++;if(snapshots===2){signal=options.signal;finalReached.resolve();await finalRelease.promise;}return original(options);}});
 const pending=assert.rejects(service.read(id),{status:503,message:'Project visibility is unavailable.'});
 await proofReached.promise;t.mock.timers.tick(17_000);proofRelease.resolve();await finalReached.promise;
 t.mock.timers.tick(999);assert.equal(signal.aborted,false);t.mock.timers.tick(1);await pending;
 assert.equal(signal.aborted,true);finalRelease.reject(Error('private late snapshot'));await new Promise(setImmediate);
 assert.equal(snapshots,2);
});


test('directory defers 201 distinct live Pages destinations before proof work and preserves the private maintainer inbox',async()=>{
 let calls=0;const f=await setup(async(repository,url)=>{calls++;return verified(repository,url);});
 const first=f.store.records.get(id).state,second=cloneEvent(f,'jam-102').state,template=structuredClone(first.entries[participant.id][0]);
 for(const [state,count,offset] of [[first,101,1000],[second,100,2000]]) {
  state.registrations={};state.entries={};
  for(let i=0;i<count;i++) {
   const actorId=String(offset+i),login=`student${actorId}`,repository={id:String(offset+i+10000),ownerId:actorId,fullName:`${login}/project`},url=`https://${login}.github.io/project/`;
   state.registrations[actorId]={id:actorId,login,status:'joined',revision:state.accepted.revision,joinedAt:template.submittedAt,updatedAt:template.submittedAt,repository};
   state.entries[actorId]=[{...template,participantId:actorId,login,repository,demoUrl:url,title:`Private entry ${actorId}`,revision:digest({actorId}),pagesVerification:{...template.pagesVerification,pagesUrl:url,repositoryId:repository.id,ownerId:actorId}}];
  }
 }
 await f.service.propose({actor:creator,operationId:'pages-private-inbox',manifest:hostedManifest({title:'Private proposal'})});
 const anonymous=await f.reader.list(),moderation=await f.reader.list(maintainer);
 assert.equal(calls,0);assert.equal(anonymous.galleriesDeferred,true);assert.equal(anonymous.events.length,2);
 assert.ok(anonymous.events.every(event=>!Object.hasOwn(event,'entries')));
 assert.doesNotMatch(JSON.stringify(anonymous),/Private entry|student1000\.github|pagesVerification|Private proposal/);
 assert.equal(Object.hasOwn(anonymous,'proposals'),false);
 assert.equal(moderation.galleriesDeferred,true);assert.equal(moderation.proposals[0].title,'Private proposal');
 assert.ok(moderation.events.every(event=>!Object.hasOwn(event,'entries')));
 assert.equal((await f.reader.read(id)).event.entries.length,101);assert.equal(calls,101);
});
