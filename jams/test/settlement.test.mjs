import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService,JamError} from '../service.mjs';
import {creator,maintainer,participant,manifest,COMMIT,submission} from './fixtures.mjs';
import {deferred} from './github-http-fixture.mjs';
function atomicFixture(limits={}) {
  const f={records:new Map(),ledger:{schema:1,operations:{}},head:0,commits:[],time:Date.parse('2030-01-02T12:00:00Z'),beforeCommit:null,afterCommit:null,beforeSource:null,sourceUnavailable:false,sourceCalls:0};
  const store={
    async read(id){return {state:structuredClone(f.records.get(id)||null),revision:String(f.head)};},async list(){return [...f.records.keys()];},
    async snapshot(){const revision=String(f.head),records=structuredClone(f.records);return {revision,ids:[...records.keys()],settlements:structuredClone(f.ledger),read:async id=>({state:structuredClone(records.get(id)||null)})};},
    async compareAndSwap(id,expected,state,{settlements}={}) {
      await f.beforeCommit?.({id,expected,state,settlements});if(expected!==String(f.head))return false;
      if(id)f.records.set(id,structuredClone(state));if(settlements)f.ledger=structuredClone(settlements);f.head++;f.commits.push({id,state:structuredClone(state),settlements:structuredClone(settlements)});await f.afterCommit?.({id,state,settlements});return true;
    }
  };
  f.service=createJamService({store,maintainerIds:[maintainer.id],now:()=>f.time,limits,verifySource:async input=>{f.sourceCalls++;await f.beforeSource?.(input);if(f.sourceUnavailable)throw new JamError(503,'Source unavailable.');return {repository:{id:input.manifest?'101':'202',ownerId:input.actor.id,fullName:input.manifest?'creator/jam':'student/project',commit:input.commit},...(input.manifest?{manifest:manifest()}:{})};}});
  f.approve=async()=>{const result=await f.service.propose({actor:creator,operationId:'proposal-original',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT});await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-original',action:'approve',revision:result.revision});return result.revision;};
  return f;
}
const join=(revision,operationId='join-unknown')=>({actor:participant,id:'jam-101',operationId,action:'join',revision});
const close=input=>{const {actor,id,operationId,...payload}=input;return {actor,scope:id||'proposals',operationId,payload};};
const bounded=(name,fn)=>test(name,{timeout:10000},fn);
bounded('an uncommitted expired Join closes durably; delayed original cannot join after the schedule reopens',async()=>{
  const f=atomicFixture(),revision=await f.approve(),input=join(revision);f.time=Date.parse('2030-01-05');
  await assert.rejects(f.service.mutate(input),{status:409});const before=f.commits.length;
  assert.equal((await f.service.settle(close(input))).settlement,'not-applied');assert.equal(f.commits.length,before+1);
  f.time=Date.parse('2030-01-02T12:00Z');assert.equal((await f.service.mutate(input)).settlement,'not-applied');assert.equal(f.records.get('jam-101').registrations[participant.id],undefined);
  assert.equal((await f.service.mutate({...input,operationId:'join-new-intent'})).status,'joined');
});
for(const winner of ['close','original'])bounded(`branch CAS race: ${winner} wins and the other request recovers its durable outcome`,async()=>{
  const f=atomicFixture(),revision=await f.approve(),input=join(revision),ready=deferred(),release=deferred();let paused=false;
  f.beforeCommit=async({id})=>{if(!paused&&((winner==='close'&&id)||(winner==='original'&&!id))){paused=true;ready.resolve();await release.promise;}};
  const loser=winner==='close'?f.service.mutate(input):f.service.settle(close(input));await ready.promise;
  const first=winner==='close'?await f.service.settle(close(input)):await f.service.mutate(input);release.resolve();const last=await loser;
  assert.equal(first.settlement,winner==='close'?'not-applied':undefined);assert.equal(last.settlement,winner==='close'?'not-applied':'applied');
  assert.equal(f.records.get('jam-101').registrations[participant.id]?.status,winner==='original'?'joined':undefined);
});
bounded('settlement fences submission paused in source verification without withdrawing the existing registration',async()=>{
  const f=atomicFixture(),revision=await f.approve();await f.service.mutate(join(revision));const input=submission(revision),ready=deferred(),release=deferred();
  f.beforeSource=async()=>{ready.resolve();await release.promise;};const pending=f.service.mutate(input);await ready.promise;
  assert.equal((await f.service.settle(close(input))).settlement,'not-applied');release.resolve();assert.equal((await pending).settlement,'not-applied');assert.equal(f.records.get('jam-101').entries[participant.id],undefined);assert.equal(f.records.get('jam-101').registrations[participant.id].status,'joined');
});
bounded('proposal with no event ID is fenced before its paused verification creates anything, including after later event creation',async()=>{
  const f=atomicFixture(),input={actor:creator,operationId:'propose-unknown',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT},ready=deferred(),release=deferred();
  f.beforeSource=async()=>{ready.resolve();await release.promise;};const pending=f.service.propose(input);await ready.promise;
  assert.equal((await f.service.settle(close(input))).settlement,'not-applied');assert.equal(f.records.size,0);release.resolve();assert.equal((await pending).settlement,'not-applied');assert.equal(f.records.size,0);
  f.beforeSource=null;await f.service.propose({...input,operationId:'proposal-new-intent'});assert.equal(f.records.size,1);assert.equal((await f.service.propose(input)).settlement,'not-applied');assert.equal(f.records.get('jam-101').proposals.length,1);
});
bounded('accepted action and proposal recover after deadline, rename and source outage without a rejection write',async()=>{
  const f=atomicFixture(),revision=await f.approve(),input=join(revision);await f.service.mutate(input);const before=f.commits.length;f.time=Date.parse('2030-01-05');f.sourceUnavailable=true;
  const accepted=await f.service.settle(close(input));assert.equal(accepted.status,'joined');assert.equal(accepted.settlement,'applied');
  const proposal=await f.service.settle({actor:{...creator,login:'renamed'},scope:'proposals',operationId:'proposal-original',payload:{repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}});assert.equal(proposal.settlement,'applied');assert.equal(proposal.status,'submitted');assert.equal(f.commits.length,before);assert.equal(Object.keys(f.ledger.operations).length,0);
});
bounded('a lost close reply retains one durable fence, and altered payloads cannot reuse it',async()=>{
  const f=atomicFixture(),revision=await f.approve(),input=close(join(revision));let lose=true;
  f.afterCommit=async({settlements})=>{if(settlements&&lose){lose=false;throw Error('lost reply');}};await assert.rejects(f.service.settle(input),{status:503});const before=f.commits.length;
  assert.equal((await f.service.settle(input)).settlement,'not-applied');assert.equal(f.commits.length,before);await assert.rejects(f.service.settle({...input,payload:{action:'leave'}}),{status:409});
});
bounded('settlement budgets do not consume ordinary or safety capacity; full settlement capacity never evicts a fence',async()=>{
  const f=atomicFixture({operations:2,settlements:1,actorSettlements:1}),revision=await f.approve(),state=structuredClone(f.records.get('jam-101'));
  assert.equal((await f.service.settle(close(join(revision)))).settlement,'not-applied');assert.deepEqual(f.records.get('jam-101'),state);
  await assert.rejects(f.service.settle(close(join(revision,'different-unknown'))),{status:429});assert.equal(Object.keys(f.ledger.operations).length,1);
  assert.equal((await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'safety-suspend',action:'suspend',reason:'Safety remains available.'})).status,'suspended');
});
bounded('malformed storage, invalid identity and another actor never settle the original actor key',async()=>{
  const f=atomicFixture(),revision=await f.approve(),input=join(revision);await f.service.mutate(input);
  const other=await f.service.settle({...close(input),actor:{id:'44',login:'other'}});assert.equal(other.settlement,'not-applied');assert.equal((await f.service.settle(close(input))).settlement,'applied');assert.equal(f.records.get('jam-101').registrations[participant.id].status,'joined');
  await assert.rejects(f.service.settle({...close(input),actor:{id:'0',login:'bad'}}),{status:401});f.ledger.operations.bad={};await assert.rejects(f.service.settle(close(input)),{status:503});
});
bounded('missing events and malformed old public forms get fences without fake events or source access',async()=>{
  const f=atomicFixture(),input={actor:participant,scope:'jam-999',operationId:'missing-request',payload:{action:'join',revision:'a'.repeat(64)}};
  assert.equal((await f.service.settle(input)).settlement,'not-applied');assert.equal((await f.service.mutate({actor:participant,id:'jam-999',operationId:input.operationId,...input.payload})).settlement,'not-applied');
  assert.equal((await f.service.settle({actor:creator,scope:'proposals',operationId:'invalid-old-form',payload:{repositoryUrl:'invalid',commit:'bad'}})).settlement,'not-applied');assert.equal(f.records.size,0);assert.equal(f.sourceCalls,0);
  await assert.rejects(f.service.propose({actor:creator,operationId:'invalid-old-form',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}),{status:409});
});

bounded('proposal intake cannot overwrite an existing event action under the same actor/key',async()=>{
  const f=atomicFixture(),revision=await f.approve();await f.service.mutate({...join(revision,'cross-scope-key'),actor:creator});const before=structuredClone(f.records.get('jam-101'));
  await assert.rejects(f.service.propose({actor:creator,operationId:'cross-scope-key',repositoryUrl:'https://github.com/creator/jam',commit:'b'.repeat(40)}),{status:409});assert.deepEqual(f.records.get('jam-101'),before);
});
