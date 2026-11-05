import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,approved,creator,maintainer,participant,COMMIT,hostedManifest,legacyProposal} from './fixtures.mjs';
import {digest} from '../schema.mjs';
import {createJamService} from '../service.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';

const status=code=>error=>error.status===code;
const proposal=(operationId='settled-proposal-001')=>({actor:creator,operationId,manifest:hostedManifest()});
const settleProposal=input=>({actor:input.actor,operationId:input.operationId,scope:'proposals',payload:{manifest:input.manifest}});
const settleAction=({actor,id:scope,operationId,...payload})=>({actor,scope,operationId,payload});
async function fence(f,scope,actor,operationId,payloadDigest) {
  const snapshot=await f.store.snapshot(),ledger=snapshot.settlements;
  ledger.operations[`${scope}:${actor.id}:${operationId}`]={scope,actorId:actor.id,operationId,payloadDigest,settledAt:Date.parse('2030-01-02T12:00:00Z')};
  assert.equal(await f.store.compareAndSwap(null,snapshot.revision,null,{settlements:ledger}),true);
}

test('closed hosted proposals cannot publish; normalized retries recover and changed payloads conflict',async()=>{
  const f=fixture(),input=proposal(),closing=settleProposal(input);
  const closed=await f.service.settle(closing);
  assert.equal(closed.settlement,'not-applied');assert.equal(f.store.records.size,0);
  assert.deepEqual(await f.service.propose(input),closed);
  assert.deepEqual(await f.service.settle(closing),closed);
  assert.deepEqual(await f.service.propose({...input,manifest:hostedManifest({title:' Jam title '})}),closed);
  await assert.rejects(f.service.propose({...input,manifest:hostedManifest({title:'Changed'})}),status(409));
  await assert.rejects(f.service.settle({...closing,payload:{manifest:hostedManifest({title:'Changed'})}}),status(409));
  assert.equal((await f.service.propose({...input,actor:participant})).status,'submitted');
});

test('applied hosted and historical proposals recover through settlement after lost response and changed clocks',async()=>{
  const f=fixture(),input=proposal();let once=true;
  f.store.afterCas=()=>{if(once){once=false;throw Error('Lost response');}};
  await assert.rejects(f.service.propose(input),status(503));f.store.afterCas=null;
  f.setTime('2030-01-06T00:00:00Z');
  const accepted=await f.service.propose(input),settled=await f.service.settle(settleProposal(input));
  assert.deepEqual(settled,{...accepted,scope:'proposals',settlement:'applied'});
  const old=await legacyProposal(f);
  const legacy={actor:creator,scope:'proposals',operationId:old.operationId,payload:{repositoryUrl:'https://github.com/creator/jam/',commit:COMMIT}};
  assert.deepEqual(await f.service.settle(legacy),{...old,scope:'proposals',settlement:'applied'});
  await assert.rejects(f.service.settle({...legacy,payload:{...legacy.payload,commit:'b'.repeat(40)}}),status(409));
  assert.equal(Object.keys((await f.store.snapshot()).settlements.operations).length,0);
});

test('event closes and accepted retries retain their own scope for legacy and hosted IDs',async()=>{
  for(const hosted of [false,true]) {
    const f=fixture(),p=hosted?await f.service.propose(proposal()):{eventId:'jam-101',revision:await approved(f)};
    if(hosted)await f.service.mutate({id:p.eventId,actor:maintainer,operationId:'approve-settlement',action:'approve',revision:p.revision});
    const input={id:p.eventId,actor:participant,operationId:'join-settlement',action:'join',revision:p.revision,...(hosted?{repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'}:{})};
    const closed=await f.service.settle(settleAction(input));
    assert.equal(closed.eventId,p.eventId);assert.deepEqual(await f.service.mutate(input),closed);
    assert.equal((await f.service.read(p.eventId,participant)).registration,null);
    const fresh={...input,operationId:'fresh-settlement'},applied=await f.service.mutate(fresh);
    assert.deepEqual(await f.service.settle(settleAction(fresh)),{...applied,scope:p.eventId,settlement:'applied'});
    f.setTime('2030-02-01T00:00:00Z');assert.deepEqual(await f.service.mutate(fresh),applied);
  }
});

test('old exact invalidJSON fences survive newly valid hosted proposals, repository joins and live submissions',async()=>{
  const f=fixture(),input=proposal();await fence(f,'proposals',creator,input.operationId,digest({invalidJSON:JSON.stringify({manifest:input.manifest})}));
  assert.equal((await f.service.propose(input)).settlement,'not-applied');
  const p=await f.service.propose(proposal('another-proposal-001'));
  await f.service.mutate({id:p.eventId,actor:maintainer,operationId:'approve-legacy-fence',action:'approve',revision:p.revision});
  const join={id:p.eventId,actor:participant,operationId:'legacy-fenced-join',action:'join',revision:p.revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'};
  const closing=settleAction(join);await fence(f,p.eventId,participant,join.operationId,digest({invalidJSON:JSON.stringify(closing.payload)}));
  assert.equal((await f.service.mutate(join)).settlement,'not-applied');
  assert.equal((await f.service.settle(closing)).settlement,'not-applied');
  await f.service.mutate({...join,operationId:'unfenced-join-001'});
  const submission={id:p.eventId,actor:participant,operationId:'legacy-live-submit',action:'submit',revision:p.revision,title:'Project',description:'Description',demoUrl:'https://student.github.io/project/'};
  const submitClose=settleAction(submission);await fence(f,p.eventId,participant,submission.operationId,digest({invalidJSON:JSON.stringify(submitClose.payload)}));
  assert.equal((await f.service.mutate(submission)).settlement,'not-applied');
  assert.equal((await f.service.settle(submitClose)).settlement,'not-applied');
  assert.equal((await f.service.read(p.eventId)).event.id,p.eventId,'valid nonempty ledger stays readable');
});

test('a settlement lost response is unknown until the immutable ledger recovers; capacity preserves recovery',async()=>{
  const f=fixture({limits:{settlements:1,actorSettlements:1}}),closing=settleProposal(proposal());
  f.store.afterCas=()=>{throw Error('Lost settlement response');};
  await assert.rejects(f.service.settle(closing),status(503));f.store.afterCas=null;
  assert.equal((await f.service.settle(closing)).settlement,'not-applied');
  await assert.rejects(f.service.settle({...closing,operationId:'another-close-001'}),status(429));
  assert.equal((await f.service.propose(proposal())).settlement,'not-applied');
});

test('same-branch CAS serializes settlement against an already prepared hosted publication',async()=>{
  const f=fixture(),input=proposal(),write=f.store.compareAndSwap.bind(f.store);let raced=false;
  f.store.compareAndSwap=async(id,...args)=>{
    if(id!==null&&!raced){raced=true;await f.service.settle(settleProposal(input));}
    return write(id,...args);
  };
  const result=await f.service.propose(input);assert.equal(result.settlement,'not-applied');assert.equal(f.store.records.size,0);
  const g=fixture(),other=proposal(),writeOther=g.store.compareAndSwap.bind(g.store);let accepted;
  g.store.compareAndSwap=async(id,...args)=>{
    if(id===null&&!accepted){accepted=await g.service.propose(other);}
    return writeOther(id,...args);
  };
  assert.deepEqual(await g.service.settle(settleProposal(other)),{...accepted,scope:'proposals',settlement:'applied'});
  assert.equal(Object.keys((await g.store.snapshot()).settlements.operations).length,0);
});

test('real atomic registry recovery honors nonempty ledgers and excludes older Contents writers',async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();
  const service=createJamService({store:f.store,verifySource:async()=>{throw Error('No source expected');},now:()=>Date.parse('2030-01-02T12:00:00Z')});
  const input=proposal();assert.equal((await service.settle(settleProposal(input))).settlement,'not-applied');
  assert.equal((await service.propose(input)).settlement,'not-applied');
  assert.deepEqual((await service.list()).events,[]);
  await assert.rejects(f.legacyStore.list(),status(503));
});

test('inconsistent history and fences fail unavailable instead of falsely reporting not applied',async()=>{
  const f=fixture(),input=proposal(),accepted=await f.service.propose(input);
  await fence(f,'proposals',creator,input.operationId,digest({action:'propose',hosting:'zero',manifest:f.store.records.get(accepted.eventId).state.proposals[0].manifest}));
  await assert.rejects(f.service.settle(settleProposal(input)),status(503));
  await assert.rejects(f.service.propose(input),status(503));
});
