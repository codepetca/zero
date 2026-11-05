import test from 'node:test';
import assert from 'node:assert/strict';
import {projectVisibility} from '../project-visibility.mjs';
import {fixture,creator,maintainer,participant,hostedManifest,manifest,legacyProposal,verifiedPages} from './fixtures.mjs';

const status=code=>error=>error.status===code;
const input=(operationId='automatic-pro-001',extra={})=>({actor:creator,operationId,manifest:hostedManifest(),...extra});
const closing=({actor,operationId,manifest})=>({actor,scope:'proposals',operationId,payload:{manifest}});
const future=()=>{const data=hostedManifest();data.schedule=Object.fromEntries(Object.entries(data.schedule).map(([key,value])=>[key,new Date(Date.parse(value)+7*86400000).toISOString()]));return data;};
function transactional(){
  const f=fixture();let tail=Promise.resolve();
  f.store.transact=async work=>{let release;const previous=tail;tail=new Promise(done=>{release=done;});await previous;try{return await work(f.store);}finally{release();}};
  return f;
}

test('two simultaneous Pro creations share one organizer slot atomically; winning operation recovers and settles',async()=>{
  const f=transactional(),requests=[input(),input('automatic-pro-002')];
  const outcomes=await Promise.allSettled(requests.map(request=>f.service.propose(request)));
  const winner=outcomes.findIndex(value=>value.status==='fulfilled'),loser=1-winner;
  assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1);assert.equal(outcomes[loser].reason.status,429);
  assert.deepEqual(await f.service.propose(requests[winner]),outcomes[winner].value);
  assert.equal((await f.service.settle(closing(requests[winner]))).settlement,'applied');
  assert.equal((await f.service.settle(closing(requests[loser]))).settlement,'not-applied');
  assert.equal(f.store.records.size,1);
});

test('future, open and suspended jams occupy a slot; effective end permits another without rewriting the old event',async()=>{
  const f=fixture(),first=await f.service.propose(input());
  await assert.rejects(f.service.propose(input('automatic-pro-blocked')),status(429));
  await f.service.mutate({id:first.eventId,actor:maintainer,operationId:'automatic-suspend-001',action:'suspend',reason:'Review.'});
  await assert.rejects(f.service.propose(input('automatic-pro-suspended')),status(429));
  f.setTime('2030-01-04T00:00:00Z');await assert.rejects(f.service.propose(input('automatic-pro-after-close')),status(429));
  f.setTime('2030-01-05T00:00:00Z');const old=structuredClone(f.store.records.get(first.eventId).state);
  const next=await f.service.propose(input('automatic-pro-ended',{manifest:future()}));assert.notEqual(next.eventId,first.eventId);
  assert.deepEqual(f.store.records.get(first.eventId).state,old);
});

test('creator cancellation is scoped to own auto-approved event and preserves source holds and audit history after Pro revocation',async()=>{
  let licensed=true;const f=fixture({canCreateJam:()=>licensed,pagesBindingReader:verifiedPages}),p=await f.service.propose(input());
  await f.service.mutate({id:p.eventId,actor:participant,operationId:'auto-policy-join',action:'join',revision:p.revision,repositoryUrl:'https://github.com/student/project'});
  licensed=false;
  for(const action of ['suspend','resume','withdraw-entry'])await assert.rejects(f.service.mutate({id:p.eventId,actor:creator,operationId:`no-own-${action}`,action,reason:'Not granted.',...(action==='withdraw-entry'?{participantId:participant.id}:{})}),status(403));
  await assert.rejects(f.service.mutate({id:p.eventId,actor:participant,operationId:'not-owner-cancel',action:'cancel',reason:'Not mine.'}),status(403));
  const cancel={id:p.eventId,actor:{...creator,login:'renamed'},operationId:'own-auto-cancel',action:'cancel',reason:'Organizer ended this jam.'};
  const result=await f.service.mutate(cancel);assert.equal(result.status,'cancelled');assert.deepEqual(await f.service.mutate(cancel),result);
  const state=f.store.records.get(p.eventId).state;
  assert.equal(state.history.at(-1).actorId,creator.id);assert.equal(state.operations[`${creator.id}:${cancel.operationId}`].pool,'safety');
  assert.equal(state.registrations[participant.id].repository.id,'202');
  assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-02T12:00:00Z'))).isHeld('202'),true);
  assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-05T00:00:00Z'))).isHeld('202'),false);
  licensed=true;assert.equal((await f.service.propose(input('after-own-cancel'))).status,'approved');
});

test('repeated create/cancel cycles retain rolling creation-rate limits and accepted retries precede exhaustion',async()=>{
  const f=fixture();let first;
  for(let i=0;i<3;i++){
    const request=input(`cycle-create-${i}`),p=await f.service.propose(request);first??={request,p};
    await f.service.mutate({id:p.eventId,actor:creator,operationId:`cycle-cancel-${i}`,action:'cancel',reason:'End cycle.'});
  }
  await assert.rejects(f.service.propose(input('cycle-create-excess')),error=>error.status===429&&/Too many jam creations/.test(error.message));
  assert.deepEqual(await f.service.propose(first.request),first.p);
  f.setTime('2030-01-02T12:01:00Z');assert.equal((await f.service.propose(input('cycle-create-after-window'))).status,'approved');
});

test('old pending approval, accepted schedule extension and resume cannot bypass another active jam',async()=>{
  const f=fixture();
  const oldSchedule=Object.fromEntries(Object.entries(manifest().schedule).map(([key,value])=>[key,new Date(Date.parse(value)-7*86400000).toISOString()]));
  const expired=await legacyProposal(f,{data:manifest({schedule:oldSchedule})});
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-expired-version',action:'approve',revision:expired.revision});
  const active=await f.service.propose(input());
  const next=await legacyProposal(f,{operationId:'legacy-future-change',commit:'b'.repeat(40),data:manifest()});
  await assert.rejects(f.service.mutate({id:'jam-101',actor:maintainer,operationId:'reject-overlap-approval',action:'approve',revision:next.revision}),status(429));
  assert.equal(f.store.records.get('jam-101').state.accepted.revision,expired.revision);
  // Approve the expired version in an isolated historical record, then make its
  // current accepted schedule overlap to model preexisting deployed state.
  const g=fixture(),old=await legacyProposal(g);
  await g.service.mutate({id:'jam-101',actor:maintainer,operationId:'legacy-existing-approve',action:'approve',revision:old.revision});
  const historical=structuredClone(g.store.records.get('jam-101').state);historical.moderation.status='suspended';
  f.store.records.set('jam-101',{state:historical,revision:'historical'});f.store.bump();
  await assert.rejects(f.service.mutate({id:'jam-101',actor:maintainer,operationId:'reject-overlap-resume',action:'resume',reason:'Try resuming.'}),status(429));
  assert.equal(f.store.records.get('jam-101').state.moderation.status,'suspended');
  await assert.rejects(f.service.mutate({id:'jam-101',actor:creator,operationId:'no-legacy-own-cancel',action:'cancel',reason:'No legacy authority.'}),status(403));
  await f.service.mutate({id:active.eventId,actor:creator,operationId:'release-active-slot',action:'cancel',reason:'Release slot.'});
  assert.equal((await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'allow-legacy-resume',action:'resume',reason:'Now one active.'})).status,'active');
  assert.ok(expired.revision);
});


test('expired legacy pending records free the slot but later manual approval cannot create an overlapping event',async()=>{
  const f=fixture(),oldSchedule=Object.fromEntries(Object.entries(manifest().schedule).map(([key,value])=>[key,new Date(Date.parse(value)-7*86400000).toISOString()]));
  await legacyProposal(f,{data:manifest({schedule:oldSchedule})});
  const p=await f.service.propose(input());assert.equal(p.status,'approved');
  const update=await legacyProposal(f,{operationId:'future-pending-update',commit:'c'.repeat(40),data:manifest()});
  await assert.rejects(f.service.mutate({id:'jam-101',actor:maintainer,operationId:'no-overlapping-manual-approval',action:'approve',revision:update.revision}),status(429));
  assert.equal(f.store.records.get('jam-101').state.accepted,null);
});
