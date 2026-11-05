import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,hostedManifest,creator,maintainer,participant,submission,legacyProposal,verifiedPages} from './fixtures.mjs';
import {HOSTED_ID,hostedManifestData,validateState} from '../schema.mjs';

const input=(extra={})=>({actor:creator,operationId:'hosted-proposal-001',manifest:hostedManifest(),...extra});
const status=expected=>error=>error.status===expected;

test('Pro-hosted creation is immediately public and explicitly auto-approved without a reviewer account',async()=>{
  const f=fixture({maintainerIds:[creator.id,maintainer.id]}),proposal=await f.service.propose(input());
  assert.match(proposal.eventId,HOSTED_ID);assert.equal(proposal.status,'approved');assert.equal(proposal.approvalMode,'pro-license-v1');assert.equal(f.calls(),0);
  const publicRead=await f.service.read(proposal.eventId);assert.deepEqual(publicRead.event.creator,creator);assert.equal(publicRead.event.registrationOpen,true);
  assert.equal(publicRead.event.approvalMode,'pro-license-v1');assert.equal(publicRead.proposal,undefined);
  const own=await f.service.read(proposal.eventId,creator);assert.equal(own.proposal.repository,null);assert.equal(own.proposal.reviewedBy,null);
  assert.equal((await f.service.list(maintainer)).proposals.length,0);
  const state=f.store.records.get(proposal.eventId).state;assert.equal(state.accepted.approvedBy,null);assert.equal(state.accepted.hosting,'zero');validateState(state,proposal.eventId);
  const forged=structuredClone(state);forged.accepted.approvedBy=creator.id;assert.throws(()=>validateState(forged,proposal.eventId),status(503));
});
test('unknown hosted acceptance recovers after clock passes reveal; altered payload conflicts and normalization preserves retries',async()=>{
  const f=fixture();let once=true;
  f.store.afterCas=()=>{if(once){once=false;throw Error('lost response');}};
  await assert.rejects(f.service.propose(input()),status(503));
  f.setTime('2030-01-06T00:00:00Z');
  const result=await f.service.propose(input());assert.equal(result.status,'approved');assert.equal(f.store.records.size,1);
  assert.deepEqual(await f.service.propose(input({actor:{...creator,login:'renamed'},manifest:hostedManifest({title:'  Jam title  '})})),result);
  await assert.rejects(f.service.propose(input({manifest:hostedManifest({title:'Changed'})})),status(409));
  assert.equal(f.calls(),0);
});

test('distinct operations and numeric identities produce distinct event IDs, concurrent retries record only one proposal',async()=>{
  const f=fixture();
  const [a,retry]=await Promise.all([f.service.propose(input()),f.service.propose(input())]);
  assert.deepEqual(a,retry);assert.equal(f.store.records.get(a.eventId).state.proposals.length,1);
  await assert.rejects(f.service.propose(input({operationId:'hosted-proposal-blocked'})),status(429));
  await f.service.mutate({id:a.eventId,actor:creator,operationId:'cancel-first-for-next',action:'cancel',reason:'Start another jam.'});
  const b=await f.service.propose(input({operationId:'hosted-proposal-002'}));
  const c=await f.service.propose(input({actor:participant}));
  assert.equal(new Set([a.eventId,b.eventId,c.eventId]).size,3);assert.ok([a,b,c].every(value=>HOSTED_ID.test(value.eventId)));
});

test('hosted manifest rejects custom destinations, forged authority and missing/equal/past reveal dates before write',async()=>{
  const f=fixture();
  for(const data of [
    {...input(),manifest:hostedManifest({websiteUrl:'https://creator.github.io/'})},
    {...input(),repositoryUrl:'https://github.com/creator/jam'},
    {...input(),hosting:'creator'},
    {...input(),manifest:hostedManifest({creatorId:'999'})},
    {...input(),manifest:hostedManifest({schedule:{...hostedManifest().schedule,galleryRevealAt:undefined}})},
    {...input(),manifest:hostedManifest({schedule:{...hostedManifest().schedule,galleryRevealAt:hostedManifest().schedule.submissionsCloseAt}})}
  ])await assert.rejects(f.service.propose(data),status(400));
  f.setTime('2030-01-05T00:00:00Z');await assert.rejects(f.service.propose(input()),status(400));
  assert.equal(f.store.records.size,0);assert.equal(f.calls(),0);
  assert.equal(hostedManifestData(hostedManifest()).schedule.galleryRevealAt,'2030-01-05T00:00:00.000Z');
});

test('hosted gallery withholds submitted projects through approval/list/detail until the explicit reveal instant',async()=>{
  const f=fixture({pagesBindingReader:verifiedPages}),proposal=await f.service.propose(input()),id=proposal.eventId;
  await f.service.mutate({id,actor:participant,operationId:'hosted-join-001',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'});
  const entry=submission(proposal.revision,{id});delete entry.source;await f.service.mutate(entry);
  for(const actor of [undefined,creator,maintainer,participant]){
    const read=await f.service.read(id,actor);assert.deepEqual(read.event.entries,[]);assert.equal(read.event.galleryRevealed,false);
    if(actor===participant)assert.equal(read.entry.title,'Project');
  }
  assert.deepEqual((await f.service.list()).events[0].entries,[]);
  f.setTime('2030-01-05T00:00:00Z');
  const read=await f.service.read(id);assert.equal(read.event.galleryRevealed,true);assert.equal(read.event.entries[0].title,'Project');
});

test('archived pending and approved creator-hosted records remain readable and reviewable but intake stays closed',async()=>{
  const f=fixture(),proposal=await legacyProposal(f);
  const pending=await f.service.read('jam-101',creator);assert.equal(pending.proposal.repository.id,'101');assert.equal(pending.event.hosting,'creator');
  await assert.rejects(f.service.propose({actor:creator,operationId:'old-intake-0001',repositoryUrl:'https://github.com/creator/jam',commit:'a'.repeat(40)}),status(400));
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'legacy-approve',action:'approve',revision:proposal.revision});
  assert.equal((await f.service.read('jam-101')).event.websiteUrl,'https://creator.github.io/jam/');
  assert.equal((await f.service.list()).events[0].id,'jam-101');
});

test('hosted intake rechecks future reveal on CAS retry and malformed hosting records fail closed',async()=>{
  const f=fixture();
  // Force a CAS conflict without storing an event, then advance the trusted clock.
  const write=f.store.compareAndSwap.bind(f.store);let attempt=0;
  f.store.compareAndSwap=async(...args)=>{if(attempt++===0){f.setTime('2030-01-05T00:00:00Z');return false;}return write(...args);};
  await assert.rejects(f.service.propose(input()),status(400));assert.equal(f.store.records.size,0);
  const g=fixture(),proposal=await g.service.propose(input()),original=g.store.records.get(proposal.eventId).state;
  for(const mutate of [state=>{state.repositoryId='101';},state=>{delete state.hosting;},state=>{state.proposals[0].repository={id:'101'};},state=>{delete state.proposals[0].hosting;}]){
    const corrupted=structuredClone(original);mutate(corrupted);
    assert.throws(()=>validateState(corrupted,proposal.eventId),status(503));
  }
});

test('showcase join binds the verified repository, rejects replacement, and keeps it on leave',async()=>{
  let project='202';const f=fixture({verifyRepository:async({actor})=>({repository:{id:project,ownerId:actor.id,fullName:`${actor.login}/project`}})});
  const p=await f.service.propose(input());
  const join={id:p.eventId,actor:participant,operationId:'join-binding-001',action:'join',revision:p.revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'};
  await f.service.mutate(join);assert.equal((await f.service.read(p.eventId,participant)).registration.repository.id,'202');
  project='203';await assert.rejects(f.service.mutate({...join,operationId:'join-binding-002'}),status(409));
  await f.service.mutate({id:p.eventId,actor:participant,operationId:'leave-binding-001',action:'leave'});
  assert.equal((await f.service.read(p.eventId,participant)).registration.repository.id,'202');
  await assert.rejects(f.service.mutate({...join,operationId:'join-binding-003'}),status(409));
});
