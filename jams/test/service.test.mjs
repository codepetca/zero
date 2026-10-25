import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService,JamError} from '../service.mjs';
import {manifestData} from '../schema.mjs';
import {LIMITS,SAFETY_SLOT_BYTES,safetySlots,stateBudget,operationCounts,validateState} from '../schema.mjs';
import {fixture,approved,creator,maintainer,participant,COMMIT,NEXT_COMMIT,manifest,submission} from './fixtures.mjs';

const status=expected=>error=>error instanceof JamError&&error.status===expected;
const join=(revision,extra={})=>({id:'jam-101',actor:participant,operationId:'join-0001',action:'join',revision,...extra});
test('pending proposals stay private; numeric identity and different maintainer approval are required',async()=>{
  const f=fixture({maintainerIds:[maintainer.id,creator.id]});
  const proposal=await f.service.propose({actor:creator,operationId:'propose-0001',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT});
  assert.deepEqual(await f.service.list(),{events:[],canMaintain:false});
  assert.equal((await f.service.list(participant)).proposals,undefined);
  const inbox=await f.service.list(maintainer);assert.equal(inbox.canMaintain,true);assert.equal(inbox.proposals[0].id,'jam-101');assert.equal(inbox.proposals[0].organizerLogin,creator.login);
  await assert.rejects(f.service.read('jam-101'),status(404));
  await assert.rejects(f.service.read('jam-101',participant),status(404));
  const pending=await f.service.read('jam-101',creator);assert.equal(pending.event.revision,null);assert.equal(pending.event.registrationOpen,false);assert.ok(pending.proposal);
  await assert.rejects(f.service.mutate(join(proposal.revision)),status(409));
  await assert.rejects(f.service.mutate({id:'jam-101',actor:creator,operationId:'approve-own1',action:'approve',revision:proposal.revision}),status(403));
  await assert.rejects(f.service.mutate({id:'jam-101',actor:{...participant,login:maintainer.login},operationId:'approve-fake',action:'approve',revision:proposal.revision}),status(403));
});
test('accepted configuration remains stable through reviewed updates; old acknowledgment is rejected after approval',async()=>{
  const f=fixture(),revision=await approved(f);await f.service.mutate(join(revision));
  const next=await f.service.propose({actor:creator,operationId:'propose-0002',repositoryUrl:'https://github.com/creator/jam',commit:NEXT_COMMIT});
  const publicRead=await f.service.read('jam-101');assert.equal(publicRead.event.title,'Jam title');assert.equal(publicRead.event.revision,revision);assert.equal(publicRead.event.registrationOpen,true);assert.equal(publicRead.proposal,undefined);
  await assert.rejects(f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-stale',action:'approve',revision}),status(409));
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-0002',action:'approve',revision:next.revision});
  await assert.rejects(f.service.mutate(submission(revision)),status(409));
  await f.service.mutate(submission(next.revision));assert.equal((await f.service.read('jam-101')).event.entries.length,1);
});
test('entry source identity, one active entry, replacement history, leave/rejoin and public projection',async()=>{
  const f=fixture(),revision=await approved(f);await f.service.mutate(join(revision));
  await assert.rejects(f.service.mutate(submission(revision,{source:{repositoryUrl:'https://github.com/another/project',commit:COMMIT}})),status(403));
  const first=await f.service.mutate(submission(revision));
  const second=await f.service.mutate(submission(revision,{operationId:'submit-0002',title:'Replacement'}));assert.notEqual(first.revision,second.revision);
  assert.equal(f.store.records.get('jam-101').state.entries['33'].length,2);
  assert.equal((await f.service.read('jam-101')).event.entries.length,1);
  await f.service.mutate({id:'jam-101',actor:participant,operationId:'leave-0001',action:'leave'});
  const history=f.store.records.get('jam-101').state.entries['33'];assert.equal(history.length,3);assert.equal(history[1].status,'active');assert.equal(history[2].status,'withdrawn');assert.equal(history[2].previousRevision,second.revision);
  assert.equal((await f.service.read('jam-101')).event.entries.length,0);
  await f.service.mutate(join(revision,{operationId:'rejoin-0001'}));assert.equal((await f.service.read('jam-101')).event.entries.length,0);
  const read=await f.service.read('jam-101',participant);assert.equal(read.registration.status,'joined');assert.equal(read.entry.status,'withdrawn');assert.equal(JSON.stringify(read).includes('operations'),false);
});
test('half-open boundaries are checked per CAS retry, and accepted retries recover past the deadline',async()=>{
  const f=fixture(),revision=await approved(f);await f.service.mutate(join(revision));
  f.setTime('2030-01-02T00:00:00Z');const result=await f.service.mutate(submission(revision));
  f.setTime('2030-01-04T00:00:00Z');const calls=f.calls();assert.deepEqual(await f.service.mutate(submission(revision)),result);assert.equal(f.calls(),calls);
  await assert.rejects(f.service.mutate(submission(revision,{operationId:'submit-late1'})),status(409));
  f.setTime('2030-01-03T23:59:59Z');let once=true;
  f.store.beforeCas=async()=>{if(once){once=false;f.store.records.get('jam-101').revision='concurrent';f.setTime('2030-01-04T00:00:00Z');}};
  await assert.rejects(f.service.mutate(submission(revision,{operationId:'submit-race1'})),status(409));
  assert.equal(f.store.records.get('jam-101').state.entries['33'].length,1);
});
test('submission instructions may be omitted and normalize to a stored empty string',async()=>{
  const f=fixture(),revision=await approved(f);await f.service.mutate(join(revision));
  const input=submission(revision);delete input.instructions;
  await f.service.mutate(input);
  assert.equal((await f.service.read('jam-101',participant)).entry.instructions,'');
  assert.equal((await f.service.read('jam-101')).event.entries[0].instructions,'');
  assert.equal((await f.service.mutate({...input,instructions:''})).status,'submitted');
});
test('same actor/event/key recovers once; altered payload conflicts; different actor does not collide',async()=>{
  const f=fixture(),revision=await approved(f);const result=await f.service.mutate(join(revision));
  assert.deepEqual(await f.service.mutate(join(revision)),result);
  await assert.rejects(f.service.mutate(join('b'.repeat(64))),status(409));
  await f.service.mutate(join(revision,{actor:{id:'44',login:'other'}}));assert.equal((await f.service.read('jam-101')).event.participantCount,2);
});
test('suspension between read and CAS wins; cancelled event cannot resume; moderation reason required',async()=>{
  const f=fixture(),revision=await approved(f);let once=true;
  f.store.beforeCas=async()=>{if(once){once=false;await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'suspend-0001',action:'suspend',reason:'Review required.'});}};
  await assert.rejects(f.service.mutate(join(revision)),status(409));assert.equal((await f.service.list()).events.length,0);
  await assert.rejects(f.service.mutate({id:'jam-101',actor:maintainer,operationId:'resume-bad01',action:'resume'}),status(400));
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'cancel-0001',action:'cancel',reason:'Cancelled.'});
  await assert.rejects(f.service.mutate({id:'jam-101',actor:maintainer,operationId:'resume-0001',action:'resume',reason:'Return.'}),status(409));
});
test('unknown write result never returns success; same operation recovers committed result',async()=>{
  const f=fixture(),revision=await approved(f);let once=true;
  f.store.afterCas=()=>{if(once){once=false;throw Error('secret operational details');}};
  await assert.rejects(f.service.mutate(join(revision)),error=>error.status===503&&!error.message.includes('secret'));
  const recovered=await f.service.mutate(join(revision));assert.equal(recovered.status,'joined');assert.equal((await f.service.read('jam-101')).event.participantCount,1);
});
test('proposal retries recover unknown acceptance even when creator source is unavailable',async()=>{
  let unavailable=false;
  const f=fixture({source:input=>{if(unavailable)throw Error('repository unavailable');return {repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},manifest:manifest()};}});
  const input={actor:creator,operationId:'propose-lost',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT};
  let once=true;f.store.afterCas=()=>{if(once){once=false;throw Error('lost response');}};
  await assert.rejects(f.service.propose(input),status(503));unavailable=true;
  const result=await f.service.propose(input);assert.equal(result.status,'submitted');assert.equal(f.calls(),1);
  await assert.rejects(f.service.propose({...input,commit:NEXT_COMMIT}),status(409));
});
test('forged source owners, repository transfer, invalid schedules and unsupported fields fail',async()=>{
  const f=fixture({source:input=>({repository:{id:'101',ownerId:'99',fullName:'creator/jam',commit:input.commit},manifest:manifest()})});
  await assert.rejects(f.service.propose({actor:creator,operationId:'propose-0001',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}),status(403));
  assert.throws(()=>manifestData(manifest({websiteUrl:'https://127.0.0.1/private'})),status(400));
  assert.throws(()=>manifestData(manifest({schedule:{...manifest().schedule,startsAt:'2030-02-30T00:00:00Z'}})),status(400));
  const g=fixture(),revision=await approved(g);
  await assert.rejects(g.service.mutate({...join(revision),approvedBy:maintainer.id}),status(400));
  await assert.rejects(g.service.mutate({...join(revision),actor:{...participant,role:'maintainer'}}),status(400));
});
test('durable per-actor rate limit and strict per-event capacities preserve retry recovery',async()=>{
  const f=fixture({limits:{actorWrites:2,participants:1}}),revision=await approved(f);
  await f.service.mutate(join(revision));await f.service.mutate({id:'jam-101',actor:participant,operationId:'leave-0001',action:'leave'});
  await assert.rejects(f.service.mutate(join(revision,{operationId:'rejoin-0001'})),status(429));
  assert.equal((await f.service.mutate(join(revision))).status,'joined');
  f.setTime('2030-01-02T12:01:00Z');await f.service.mutate(join(revision,{operationId:'rejoin-0001'}));
  await assert.rejects(f.service.mutate(join(revision,{actor:{id:'44',login:'other'},operationId:'other-0001'})),status(429));
  const capped=fixture({limits:{operations:2}});const accepted=await approved(capped);
  await assert.rejects(capped.service.mutate(join(accepted)),status(429));
});
test('numeric ownership survives account rename; repository transfer does not grant organizer authority',async()=>{
  const f=fixture();await approved(f);
  const renamed={id:creator.id,login:'renamed'};
  const renamedService=createJamService({store:f.store,maintainerIds:[maintainer.id],now:()=>Date.parse('2030-01-02T00:00:00Z'),verifySource:async input=>({repository:{id:'101',ownerId:input.actor.id,fullName:`${input.actor.login}/jam`,commit:input.commit},manifest:manifest()})});
  const proposed=await renamedService.propose({actor:renamed,operationId:'rename-0001',repositoryUrl:'https://github.com/renamed/jam',commit:NEXT_COMMIT});assert.equal(proposed.status,'submitted');
  assert.equal((await renamedService.read('jam-101',renamed)).proposal.repository.fullName,'renamed/jam');
  await assert.rejects(renamedService.propose({actor:{id:'77',login:'buyer'},operationId:'transfer-001',repositoryUrl:'https://github.com/buyer/jam',commit:NEXT_COMMIT}),status(403));
});
test('only a maintainer can withdraw an entry after deadline and cancellation, retaining the original revision',async()=>{
  const f=fixture(),revision=await approved(f);await f.service.mutate(join(revision));const submitted=await f.service.mutate(submission(revision));
  const removal={id:'jam-101',actor:maintainer,operationId:'remove-0001',action:'withdraw-entry',participantId:participant.id,reason:'Please remove copied material.'};
  await assert.rejects(f.service.mutate({...removal,actor:participant}),status(403));
  await assert.rejects(f.service.mutate({...removal,reason:''}),status(400));
  await assert.rejects(f.service.mutate({...removal,participantId:'../other'}),status(400));
  f.setTime('2030-01-04T00:00:00Z');
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'cancel-0001',action:'cancel',reason:'Cancelled.'});
  const result=await f.service.mutate(removal);assert.equal(result.status,'withdrawn');assert.deepEqual(await f.service.mutate(removal),result);
  const state=f.store.records.get('jam-101').state,history=state.entries[participant.id];
  assert.equal(history.length,2);assert.equal(history[0].status,'active');assert.equal(history[0].revision,submitted.revision);assert.equal(history[1].previousRevision,submitted.revision);
  assert.equal(history[1].moderatedBy,maintainer.id);assert.equal(history[1].reason,removal.reason);assert.equal(state.history.at(-1).action,'withdraw-entry');
  assert.equal((await f.service.read('jam-101')).event.entries.length,0);assert.equal(state.registrations[participant.id].status,'joined');
});
test('moderated entry is not restored automatically, but a corrected submission is allowed while open',async()=>{
  const f=fixture(),revision=await approved(f);await f.service.mutate(join(revision));await f.service.mutate(submission(revision));
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'suspend-0001',action:'suspend',reason:'Review.'});
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'remove-0001',action:'withdraw-entry',participantId:participant.id,reason:'Correction required.'});
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'resume-0001',action:'resume',reason:'Continue.'});
  assert.equal((await f.service.read('jam-101')).event.entries.length,0);
  await f.service.mutate(submission(revision,{operationId:'correct-0001',title:'Corrected project'}));
  assert.equal((await f.service.read('jam-101')).event.entries[0].title,'Corrected project');assert.equal(f.store.records.get('jam-101').state.entries[participant.id].length,3);
});
test('submission history reserves a final slot for maintainer removal',async()=>{
  const f=fixture({limits:{entryHistory:2}}),revision=await approved(f);await f.service.mutate(join(revision));await f.service.mutate(submission(revision));
  await assert.rejects(f.service.mutate(submission(revision,{operationId:'submit-0002'})),status(429));
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'remove-0001',action:'withdraw-entry',participantId:participant.id,reason:'Removal.'});
  assert.equal(f.store.records.get('jam-101').state.entries[participant.id].length,2);
});
test('global event cap is checked for each new event but is not an atomic cross-event quota',async()=>{
  const f=fixture({limits:{events:1}});await approved(f);
  const service=createJamService({store:f.store,maintainerIds:['22'],now:()=>Date.parse('2030-01-02T00:00:00Z'),limits:{events:1},verifySource:async input=>({repository:{id:'303',ownerId:input.actor.id,fullName:'creator/second',commit:COMMIT},manifest:manifest()})});
  await assert.rejects(service.propose({actor:creator,operationId:'propose-next',repositoryUrl:'https://github.com/creator/second',commit:COMMIT}),status(429));
});
test('ordinary operation exhaustion preserves durable safety suspend, cancel and removal with retry recovery',async()=>{
  const f=fixture({limits:{operations:4,actorWrites:2}}),revision=await approved(f);await f.service.mutate(join(revision));await f.service.mutate(submission(revision));
  await assert.rejects(f.service.mutate({id:'jam-101',actor:participant,operationId:'leave-capped',action:'leave'}),status(429));
  const actions=[{action:'suspend',operationId:'safety-suspend'},{action:'cancel',operationId:'safety-cancel'},{action:'withdraw-entry',operationId:'safety-remove',participantId:participant.id}];
  for(const action of actions) {const input={id:'jam-101',actor:maintainer,reason:'Safety remedy',...action};const accepted=await f.service.mutate(input);assert.deepEqual(await f.service.mutate(input),accepted);}
  const state=f.store.records.get('jam-101').state;
  assert.deepEqual(operationCounts(state),{ordinary:4,safety:3});assert.equal(state.moderation.status,'cancelled');assert.equal(state.entries[participant.id].at(-1).repository,undefined);
  assert.equal((await f.service.read('jam-101',participant)).entry.repository.commit,COMMIT);assert.equal((await f.service.read('jam-101')).event.entries.length,0);
});
test('ordinary serialized budget remains bounded while reserved safety writes fit and schema enforces pool counts',async()=>{
  const limits={participants:5,stateBytes:65536+7*SAFETY_SLOT_BYTES},bound={...LIMITS,...limits};
  const f=fixture({limits}),revision=await approved(f),actors=[participant,...Array.from({length:4},(_,index)=>({id:String(100+index),login:`student${index}`}))];
  for(const actor of actors)await f.service.mutate(join(revision,{actor}));
  let exhausted=false,number=0;
  // Actual accepted submissions accumulate bounded source/history until the
  // ordinary serialized budget refuses another full-size entry revision.
  for(let round=0;round<5&&!exhausted;round++)for(const actor of actors) {
    try {await f.service.mutate(submission(revision,{actor,operationId:`fill-entry-${number++}`,source:{repositoryUrl:`https://github.com/${actor.login}/project`,commit:COMMIT},description:'d'.repeat(2000),instructions:'i'.repeat(4000)}));}
    catch(error) {assert.equal(error.status,413);exhausted=true;break;}
  }
  assert.equal(exhausted,true);
  const starting=Buffer.byteLength(JSON.stringify(f.store.records.get('jam-101').state));
  assert.ok(starting<=stateBudget(f.store.records.get('jam-101').state,bound));
  for(const input of [{action:'suspend',operationId:'full-suspend'},{action:'cancel',operationId:'full-cancel'},{action:'withdraw-entry',operationId:'full-remove',participantId:participant.id}])await f.service.mutate({id:'jam-101',actor:maintainer,reason:'漢'.repeat(256),...input});
  const final=f.store.records.get('jam-101').state;
  assert.ok(Buffer.byteLength(JSON.stringify(final))-starting<=3*SAFETY_SLOT_BYTES);assert.ok(Buffer.byteLength(JSON.stringify(final))<=stateBudget(final,bound));validateState(final,'jam-101',bound);
  const malformed=structuredClone(final);malformed.operations[Object.keys(malformed.operations)[0]].pool='unknown';assert.throws(()=>validateState(malformed,'jam-101',bound),status(503));
});
test('safety reserve exhaustion is explicit, idempotent retries recover, and invalid low budgets are rejected',async()=>{
  const f=fixture({limits:{safetyOperations:1}});await approved(f);
  const suspend={id:'jam-101',actor:maintainer,operationId:'only-suspend',action:'suspend',reason:'Review'};const result=await f.service.mutate(suspend);
  await assert.rejects(f.service.mutate({...suspend,operationId:'extra-safety',action:'cancel'}),error=>error.status===429&&error.message.includes('safety'));
  assert.deepEqual(await f.service.mutate(suspend),result);
  assert.throws(()=>fixture({limits:{stateBytes:safetySlots(LIMITS)*SAFETY_SLOT_BYTES+65535}}),status(503));
});
test('approved-only history exposes prior and current rules/dates without disclosing pending proposals or changing acknowledgment',async()=>{
  const f=fixture(),revisionA=await approved(f);await f.service.mutate(join(revisionA));
  const service=createJamService({store:f.store,maintainerIds:[maintainer.id],now:()=>Date.parse('2030-01-02T12:00:00Z'),verifySource:async input=>({repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},manifest:manifest({rules:'Changed public rules',schedule:{...manifest().schedule,submissionsCloseAt:'2030-01-05T00:00:00Z'}})})});
  const revisionB=await service.propose({actor:creator,operationId:'history-propB',repositoryUrl:'https://github.com/creator/jam',commit:NEXT_COMMIT});
  assert.equal((await service.read('jam-101')).event.approvalHistory.length,1);
  await service.mutate({id:'jam-101',actor:maintainer,operationId:'history-approveB',action:'approve',revision:revisionB.revision});
  await service.propose({actor:creator,operationId:'history-pending',repositoryUrl:'https://github.com/creator/jam',commit:'c'.repeat(40)});
  const read=await service.read('jam-101',participant),history=read.event.approvalHistory;
  assert.equal(read.registration.revision,revisionA);assert.equal(history.length,2);assert.equal(history[0].manifest.rules,'Make your own work.');assert.equal(history[1].manifest.rules,'Changed public rules');assert.equal(history[1].manifest.schedule.submissionsCloseAt,'2030-01-05T00:00:00.000Z');assert.equal(read.proposal,undefined);assert.equal(history[1].revision,revisionB.revision);
});
