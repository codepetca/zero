import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,creator,maintainer,participant,approved,hostedManifest,submission,verifiedPages} from './fixtures.mjs';
const other={id:'44',login:'other'};
const status=code=>error=>error.status===code;
async function showcase(f){
  const p=await f.service.propose({actor:creator,operationId:'create-hidden-001',manifest:hostedManifest()});
  await f.service.mutate({id:p.eventId,actor:maintainer,operationId:'approve-hidden-001',action:'approve',revision:p.revision});
  await f.service.mutate({id:p.eventId,actor:participant,operationId:'join-hidden-001',action:'join',revision:p.revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'});
  const entry=submission(p.revision,{id:p.eventId});delete entry.source;await f.service.mutate(entry);
  return p;
}
test('only maintainers can inspect and remove held entries before reveal',async()=>{
  const f=fixture({pagesBindingReader:verifiedPages}),p=await showcase(f),id=p.eventId;
  const review=await f.service.read(id,maintainer);assert.equal(review.event.entries.length,0);assert.equal(review.moderationEntries.length,1);assert.equal(review.moderationEntries[0].repository.id,'202');
  for(const actor of [undefined,creator,participant,other]){
    const detail=await f.service.read(id,actor);assert.equal(detail.event.entries.length,0);assert.equal(Object.hasOwn(detail,'moderationEntries'),false);
    if(actor===participant)assert.equal(detail.entry.repository.id,'202');else assert.equal(detail.entry,null);
  }
  for(const actor of [undefined,creator,participant,maintainer])assert.equal(Object.hasOwn((await f.service.list(actor)).events[0],'moderationEntries'),false);
  const removal={id,actor:maintainer,operationId:'remove-hidden-001',action:'withdraw-entry',participantId:participant.id,reason:'Please correct this entry.'};
  await assert.rejects(f.service.mutate({...removal,actor:creator}),status(403));
  f.store.afterCas=async()=>{throw Error('lost response');};await assert.rejects(f.service.mutate(removal),status(503));
  f.store.afterCas=null;assert.deepEqual((await f.service.read(id,maintainer)).moderationEntries,[]);
  await f.service.mutate(removal);assert.deepEqual((await f.service.read(id,maintainer)).moderationEntries,[]);
  assert.equal((await f.service.read(id,participant)).entry.status,'withdrawn');
  f.setTime('2030-01-05T00:00:00Z');assert.deepEqual((await f.service.read(id)).event.entries,[]);
});

test('cross-event hold exposes a legacy entry only to maintainers and never duplicates revealed entries',async()=>{
  const f=fixture({pagesBindingReader:verifiedPages}),revision=await approved(f);
  await f.service.mutate({id:'jam-101',actor:participant,operationId:'legacy-join-001',action:'join',revision});
  await f.service.mutate(submission(revision));
  assert.equal((await f.service.read('jam-101',maintainer)).event.entries.length,1);
  assert.deepEqual((await f.service.read('jam-101',maintainer)).moderationEntries,[]);
  await showcase(f);
  const held=await f.service.read('jam-101',maintainer);assert.deepEqual(held.event.entries,[]);assert.equal(held.moderationEntries[0].title,'Project');
  for(const actor of [undefined,creator,participant,other]){
    const read=await f.service.read('jam-101',actor);assert.deepEqual(read.event.entries,[]);assert.equal(Object.hasOwn(read,'moderationEntries'),false);
  }
  f.setTime('2030-01-05T00:00:00Z');const revealed=await f.service.read('jam-101',maintainer);
  assert.equal(revealed.event.entries.length,1);assert.deepEqual(revealed.moderationEntries,[]);
});
