import test from 'node:test';
import assert from 'node:assert/strict';
import {validateState} from '../schema.mjs';
import {projectVisibility} from '../project-visibility.mjs';
import {validateState as priorValidateState} from './fixtures/prior-manual-schema.mjs';
import {projectVisibility as priorProjectVisibility} from './fixtures/prior-manual-project-visibility.mjs';
import {fixture,approved,creator,participant,hostedManifest,manifest} from './fixtures.mjs';

// Actual pinned old validators, not a rewritten mock of their human-approval
// condition. The transport/store below is synthetic and never uses a provider.
test('one automatic record makes the prior complete-snapshot Hub reader fail closed even for an unrelated held project',async()=>{
  const f=fixture({source:async()=>({manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:'2030-01-05T00:00:00Z'}})})}),revision=await approved(f);
  await f.service.mutate({id:'jam-101',actor:participant,operationId:'old-reader-join-001',action:'join',revision,repositoryUrl:'https://github.com/student/project'});
  const historical=f.store.records.get('jam-101').state;
  assert.deepEqual(priorValidateState(historical,'jam-101'),validateState(historical,'jam-101'));
  const newEvent=await f.service.propose({actor:{id:'44',login:'other'},operationId:'new-auto-reader-001',manifest:hostedManifest()});
  const automatic=f.store.records.get(newEvent.eventId).state;
  assert.equal(automatic.accepted.approvedBy,null);assert.equal(automatic.accepted.approvalMode,'pro-license-v1');
  assert.doesNotThrow(()=>validateState(automatic,newEvent.eventId));
  assert.throws(()=>priorValidateState(automatic,newEvent.eventId),error=>error.status===503&&error.message==='Official jam records are unavailable.');
  const now=Date.parse('2030-01-02T12:00:00Z'),snapshot=await f.store.snapshot();
  const current=await projectVisibility(snapshot,now);assert.equal(current.isHeld('202'),true,'the compatible reader preserves the unrelated manual event hold');
  await assert.rejects(priorProjectVisibility(snapshot,now),error=>error.status===503&&error.message==='Project visibility is unavailable.');
  // The old reader rejects the entire registry; it cannot safely return even an
  // unrelated destination's hold decision or silently omit the automatic event.
  const single={...snapshot,ids:['jam-101']};assert.equal((await priorProjectVisibility(single,now)).isHeld('202'),true);
});

test('numeric actors and numeric stored creators fail closed rather than bypassing string-ID organizer accounting',async()=>{
  const f=fixture(),request={actor:creator,operationId:'string-id-policy-001',manifest:hostedManifest()};
  await f.service.propose(request);
  await assert.rejects(f.service.propose({...request,actor:{...creator,id:Number(creator.id)},operationId:'numeric-actor-bypass'}),error=>error.status===401);
  const state=f.store.records.values().next().value.state;
  state.creator.id=Number(creator.id);
  assert.throws(()=>validateState(state,state.id),error=>error.status===503);
  await assert.rejects(f.service.propose({...request,operationId:'corrupt-creator-bypass'}),error=>error.status===503);
  assert.equal(f.store.records.size,1);
});
