import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,validateState} from '../schema.mjs';
import {requestDigest} from '../requests.mjs';
import {fixture,manifest,approved,creator,maintainer,participant,submission,hostedManifest} from './fixtures.mjs';
import {createJamPagesBindingReader} from '../../website/lib/jam-pages-binding.mjs';

const id='jam-101',reveal='2030-01-05T00:00:00Z',deadline='2030-01-04T00:00:00Z';
const verifiedPages=async(repository,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repository.id,ownerId:repository.ownerId});
async function setup(reader=verifiedPages) {
 const f=fixture({pagesBindingReader:reader,verifyRepository:async({repositoryId,actor})=>({repository:{id:repositoryId||'202',ownerId:actor.id,fullName:`${actor.login}/project`}}),source:async input=>({repository:{id:'101',ownerId:input.actor.id,fullName:`${input.actor.login}/jam`,commit:input.commit},manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:reveal}})})});
 const revision=await approved(f);
 await f.service.mutate({id,actor:participant,operationId:'join-pages-0001',action:'join',revision,repositoryUrl:'https://github.com/student/project'});
 return {...f,revision};
}
async function entry(f,extra={}) {
 const {source,...request}=submission(f.revision,{...extra});
 return request;
}

test('Join before publication creates only registration; custom-domain submission records sanitized same-repo proof',async()=>{
 let calls=0;
 const f=await setup(async(repository,pagesUrl)=>{
  calls++;assert.deepEqual(repository,{url:'https://github.com/student/project',id:'202',ownerId:'33'});
  assert.equal(pagesUrl,'https://play.example.org/');
  return {...await verifiedPages(repository,pagesUrl),providerBody:'not retained'};
 });
 assert.equal(calls,0);assert.equal((await f.service.read(id,participant)).entry,null);
 const request=await entry(f,{demoUrl:'https://play.example.org/'});
 await f.service.mutate(request);
 const saved=(await f.service.read(id,participant)).entry;
 assert.deepEqual(saved.pagesVerification,{pagesUrl:'https://play.example.org/',repositoryId:'202',ownerId:'33',verifiedAt:'2030-01-02T12:00:00.000Z'});
 assert.doesNotMatch(JSON.stringify(saved),/providerBody|not retained/);
 f.setTime(reveal);
 assert.equal((await f.service.read(id)).event.entries[0].demoUrl,'https://play.example.org/');
 assert.equal(calls,2);
});

test('GitHub root custom-domain metadata without trailing slash verifies through submission and reveal',async()=>{
 let calls=0;
 const reader=createJamPagesBindingReader({
  readDestinationBinding:async()=>({repositoryId:'202',ownerId:'33',repositoryUrl:'https://github.com/student/project'}),
  fetchImpl:async()=>{calls++;return Response.json({html_url:'https://play.example.org',public:true,status:'built'});}
 });
 const f=await setup(reader),request=await entry(f,{demoUrl:'https://play.example.org'});
 assert.equal((await f.service.mutate(request)).status,'submitted');
 assert.equal((await f.service.read(id,participant)).entry.pagesVerification.pagesUrl,'https://play.example.org/');
 f.setTime(reveal);
 assert.equal((await f.service.read(id)).event.entries[0].demoUrl,'https://play.example.org/');
 assert.equal(calls,2);
});

test('missing, unavailable, unverified and mismatched trusted Pages observations cannot submit',async()=>{
 for(const reader of [undefined,async()=>{throw Error('secret provider failure');},async()=>({status:'unverified',reason:'not-found'}),
  async(repository,url)=>({...await verifiedPages(repository,url),repositoryId:'999'}),
  async(repository,url)=>({...await verifiedPages(repository,url),ownerId:'99'}),
  async(repository,url)=>({...await verifiedPages(repository,url),pagesUrl:'https://other.example/'}),
  async(repository,url)=>({...await verifiedPages(repository,url),status:'unverified'})]) {
  const f=await setup(reader??null),request=await entry(f);
  await assert.rejects(f.service.mutate(request),error=>error.status===503&&!/secret/.test(error.message));
  assert.equal((await f.service.read(id,participant)).entry,null);
  assert.equal(Object.hasOwn(f.store.records.get(id).state.operations,`${participant.id}:${request.operationId}`),false);
 }
});

test('verification completing at the submission deadline cannot create an entry',async()=>{
 let f;
 f=await setup(async(repository,url)=>{f.setTime(deadline);return verifiedPages(repository,url);});
 const request=await entry(f);f.setTime(Date.parse(deadline)-1);
 await assert.rejects(f.service.mutate(request),error=>error.status===409);
 assert.equal((await f.service.read(id,participant)).entry,null);
});

test('CAS conflict rechecks deadline after an earlier successful Pages observation',async()=>{
 const f=await setup(),request=await entry(f),cas=f.store.compareAndSwap.bind(f.store);let first=true;
 f.setTime(Date.parse(deadline)-1);
 f.store.compareAndSwap=async(...args)=>{if(first){first=false;f.setTime(deadline);return false;}return cas(...args);};
 await assert.rejects(f.service.mutate(request),error=>error.status===409);
 assert.equal((await f.service.read(id,participant)).entry,null);
});

test('known limitation: an already-dispatched successful ref update can publish after the deadline',async()=>{
 const f=await setup(),request=await entry(f),reached=Promise.withResolvers(),release=Promise.withResolvers();
 f.setTime(Date.parse(deadline)-1);
 // Model a provider that receives the CAS before the deadline but delays its
 // atomic publication. A successful reply supplies no provider commit clock.
 f.store.beforeCas=async()=>{reached.resolve();await release.promise;};
 const pending=f.service.mutate(request);
 await reached.promise;f.setTime(Date.parse(deadline)+1);release.resolve();
 assert.equal((await pending).status,'submitted');
 const saved=(await f.service.read(id,participant)).entry;
 assert.equal(saved.submittedAt,'2030-01-03T23:59:59.999Z');
 assert.equal(saved.pagesVerification.verifiedAt,'2030-01-03T23:59:59.999Z');
 // Both recorded timestamps are pre-publication service observations. Neither
 // establishes that the provider published the official result by the cutoff.
 assert.equal(f.store.records.get(id).state.entries[participant.id].length,1);
});

test('accepted submission recovers after lost reply, deadline and verifier outage without re-verification',async()=>{
 let calls=0,available=true;
 const f=await setup(async(repository,url)=>{calls++;if(!available)throw Error('outage');return verifiedPages(repository,url);});
 const request=await entry(f);let lose=true;
 f.store.afterCas=()=>{if(lose){lose=false;throw Error('lost reply');}};
 await assert.rejects(f.service.mutate(request),error=>error.status===503);
 const recorded=f.store.records.get(id).state.operations[`${participant.id}:${request.operationId}`].result;
 available=false;f.setTime(reveal);
 assert.deepEqual(await f.service.mutate(request),recorded);assert.equal(calls,1);
 assert.equal(f.store.records.get(id).state.entries[participant.id].length,1);
});

test('old unverified showcase records stay private and their exact Join operation still recovers',async()=>{
 const f=await setup();
 const record=f.store.records.get(id),registration=record.state.registrations[participant.id];
 const oldPayload={action:'join',revision:f.revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'};
 const oldOperation='join-old-policy-01',result={eventId:id,operationId:oldOperation,status:'joined',revision:f.revision};
 record.state.operations[`${participant.id}:${oldOperation}`]={actorId:participant.id,acceptedAt:Date.parse(registration.joinedAt),payloadDigest:requestDigest(id,oldPayload),result,pool:'ordinary'};
 record.state.entries[participant.id]=[{participantId:participant.id,login:participant.login,title:'Old project',description:'',demoUrl:oldPayload.demoUrl,instructions:'',repository:registration.repository,submittedAt:registration.joinedAt,status:'active',eventRevision:f.revision,revision:digest({oldOperation}),previousRevision:null}];
 validateState(record.state,id);f.setTime(reveal);
 assert.deepEqual((await f.service.read(id)).event.entries,[]);
 assert.deepEqual((await f.service.list()).events[0].entries,[]);
 assert.equal((await f.service.read(id,participant)).entry.demoUrl,oldPayload.demoUrl);
 assert.equal((await f.service.read(id,maintainer)).moderationEntries[0].demoUrl,oldPayload.demoUrl);
 assert.deepEqual(await f.service.mutate({id,actor:participant,operationId:oldOperation,...oldPayload}),result);
});

test('corrupted durable Pages receipts fail closed while omitted old receipts remain readable',async()=>{
 const f=await setup();await f.service.mutate(await entry(f));
 const original=structuredClone(f.store.records.get(id));
 for(const corrupt of [receipt=>{receipt.repositoryId='999';},receipt=>{receipt.ownerId='99';},receipt=>{receipt.pagesUrl='https://unrelated.example/';},receipt=>{receipt.verifiedAt='invalid';},receipt=>{receipt.secret='unexpected';},receipt=>{receipt.verifiedAt=reveal;}]) {
  const record=structuredClone(original);corrupt(record.state.entries[participant.id][0].pagesVerification);f.store.records.set(id,record);
  await assert.rejects(f.service.read(id),error=>error.status===503);
 }
 const old=structuredClone(original);delete old.state.entries[participant.id][0].pagesVerification;f.store.records.set(id,old);
 assert.equal((await f.service.read(id,participant)).entry.title,'Project');
});

test('legacy exact-commit submissions and public gallery do not require a Pages reader',async()=>{
 const f=fixture(),revision=await approved(f);
 await f.service.mutate({id,actor:participant,operationId:'join-legacy-0001',action:'join',revision});
 await f.service.mutate(submission(revision));
 const shown=(await f.service.read(id)).event.entries[0];
 assert.equal(shown.repository.commit,'a'.repeat(40));
 assert.equal(Object.hasOwn(shown,'pagesVerification'),false);
});


test('both hosted types Join before publication and reject client receipt injection before server-verified submission',async()=>{
 for(const type of ['game','app']) {
  let observations=0;
  const f=fixture({pagesBindingReader:async(repository,url)=>{observations++;return verifiedPages(repository,url);}});
  const proposed=await f.service.propose({actor:creator,operationId:`pages-${type}-proposal`,manifest:hostedManifest({type})}),eventId=proposed.eventId;
  await f.service.mutate({id:eventId,actor:maintainer,operationId:`pages-${type}-approval`,action:'approve',revision:proposed.revision});
  await f.service.mutate({id:eventId,actor:participant,operationId:`pages-${type}-join`,action:'join',revision:proposed.revision,repositoryUrl:'https://github.com/student/project'});
  assert.equal(observations,0);assert.equal((await f.service.read(eventId,participant)).entry,null);
  const request=submission(proposed.revision,{id:eventId});delete request.source;
  await assert.rejects(f.service.mutate({...request,pagesVerification:{pagesUrl:request.demoUrl,repositoryId:'202',ownerId:participant.id,verifiedAt:'2030-01-02T12:00:00.000Z'}}),error=>error.status===400);
  assert.equal(observations,0);
  await f.service.mutate(request);assert.equal(observations,1);
  f.setTime(reveal);assert.equal((await f.service.read(eventId)).event.entries.length,1);assert.equal(observations,2);
 }
});

test('submission caller cancellation during Pages proof cannot publish after its reader resolves',async()=>{
 const reached=Promise.withResolvers(),release=Promise.withResolvers();let signal;
 const f=await setup(async(repository,url,options)=>{signal=options.signal;reached.resolve();await release.promise;return verifiedPages(repository,url);});
 const request=await entry(f),controller=new AbortController();
 const pending=assert.rejects(f.service.mutate(request,{signal:controller.signal}),error=>error.status===503);
 await reached.promise;controller.abort();await pending;assert.equal(signal.aborted,true);
 release.resolve();await new Promise(setImmediate);
 assert.equal(f.store.records.get(id).state.entries[participant.id],undefined);
 assert.equal(f.store.records.get(id).state.operations[`${participant.id}:${request.operationId}`],undefined);
});


test('archived exact-commit entries keep their original projection after an approved optional reveal',async()=>{
 const f=fixture(),revision=await approved(f);
 await f.service.mutate({id,actor:participant,operationId:'legacy-reveal-join',action:'join',revision});
 await f.service.mutate(submission(revision));
 const state=f.store.records.get(id).state;
 for(const proposal of [...state.proposals,state.accepted])proposal.manifest.schedule.galleryRevealAt=reveal;
 f.store.bump();f.setTime(reveal);
 const shown=(await f.service.read(id)).event.entries;
 assert.equal(shown.length,1);assert.equal(shown[0].repository.commit,'a'.repeat(40));
 assert.equal(Object.hasOwn(shown[0],'pagesVerification'),false);
});
