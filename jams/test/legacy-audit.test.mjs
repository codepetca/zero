import test from 'node:test';
import assert from 'node:assert/strict';
import {auditLegacyRegistry,auditLegacyRegistryFixture,LEGACY_AUDIT_LIMITS} from '../legacy-audit.mjs';
import {projectVisibility} from '../project-visibility.mjs';
import {validateState} from '../schema.mjs';
import {fixture,legacyProposal,manifest,hostedManifest,creator,maintainer,participant} from './fixtures.mjs';

const before = Date.parse('2030-01-03T00:00:00Z'), reveal = Date.parse('2030-01-05T00:00:00Z');
const revision = 'a'.repeat(40);

async function record({hosted=false,unbound=true,status='joined',hasReveal=true}={}) {
  const f=fixture();
  const proposal=hosted ? await f.service.propose({actor:creator,operationId:'audit-propose-001',manifest:hostedManifest()}) :
    await legacyProposal(f,{data:manifest({schedule:{...manifest().schedule,
      ...(hasReveal ? {galleryRevealAt:new Date(reveal).toISOString()} : {})}})});
  const id=proposal.eventId;
  await f.service.mutate({id,actor:maintainer,operationId:'audit-approve-001',action:'approve',revision:proposal.revision});
  const state=structuredClone(f.store.records.get(id).state);
  state.registrations[participant.id]={...participant,status,
    ...(!unbound ? {repository:{id:'202',ownerId:participant.id,fullName:'student/project'}} : {})};
  validateState(state,id);
  return {id,state};
}
const snapshot=({id,state})=>({revision,ids:[id],read:async()=>({state})});
const localFixture=({id,state})=>({schema:1,revision,events:{[id]:state}});

for (const hosted of [false,true]) test(`${hosted ? 'hosted' : 'creator-hosted'} schema-valid missing binding blocks only before reveal`,async()=>{
  const item=await record({hosted}), provided=snapshot(item);
  await assert.rejects(projectVisibility(provided,before),error=>error.status===503);
  const blocked=await auditLegacyRegistry(provided,before);
  assert.equal(blocked.status,'blocked');
  assert.deepEqual(blocked.summary,{eventCount:1,blockedEventCount:1,missingRepositoryBindings:1});
  assert.equal(blocked.events[0].classification,'pre-reveal-recovery-required');
  assert.equal(blocked.events[0].hosting,hosted ? 'zero' : 'creator');
  for (const now of [reveal,reveal+1]) {
    await projectVisibility(provided,now);
    const report=await auditLegacyRegistry(provided,now);
    assert.equal(report.status,'clear');assert.equal(report.summary.blockedEventCount,0);
    assert.equal(report.events[0].classification,'historical-unbound');
  }
});

test('left registrations require the same pre-reveal binding as joined registrations',async()=>{
  assert.equal((await auditLegacyRegistry(snapshot(await record({status:'left'})),before)).status,'blocked');
});

test('bound records and historical schedules without reveal do not need this recovery',async()=>{
  const bound=await auditLegacyRegistry(snapshot(await record({unbound:false})),before);
  assert.equal(bound.status,'clear');assert.equal(bound.summary.missingRepositoryBindings,0);
  assert.equal(bound.events[0].classification,'no-unbound-registrations');
  const historical=await auditLegacyRegistry(snapshot(await record({hasReveal:false})),before);
  assert.equal(historical.status,'clear');assert.equal(historical.events[0].classification,'historical-unbound');
});

test('explicit JSON fixture audit reports only sanitized IDs/counts and never changes source state',async()=>{
  const data=localFixture(await record()),saved=JSON.stringify(data);
  const report=await auditLegacyRegistryFixture(data,before),output=JSON.stringify(report);
  assert.equal(report.status,'blocked');assert.equal(JSON.stringify(data),saved);
  for (const secret of ['student','creator/jam','maintainer','ownerId','fullName','repositoryId','login','acceptedAt','Jam title']) {
    assert.equal(output.includes(secret),false,secret);
  }
  assert.deepEqual(report,await auditLegacyRegistry(snapshot(await record()),before));
});

test('audit invokes only supplied snapshot reads, not store writes or global network',async()=>{
  const item=await record(),saved=JSON.stringify(item.state);let reads=0;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('network must not be used');};
  try {
    const report=await auditLegacyRegistry({revision,ids:[item.id],read:async id=>{
      reads++;assert.equal(id,item.id);return {state:item.state};
    },compareAndSwap(){assert.fail('no writes');},snapshot(){assert.fail('no acquisition');}},before);
    assert.equal(report.status,'blocked');assert.equal(reads,1);assert.equal(JSON.stringify(item.state),saved);
  } finally { globalThis.fetch=oldFetch; }
});

test('missing or malformed records invalidate the whole report without disclosing provider errors or partial findings',async()=>{
  const item=await record();
  for (const read of [async()=>({state:null}),async()=>({}),async()=>{throw Error('private-token-owner');},
    async()=>({state:{...item.state,creator:{id:'11',login:'<private-owner>'}}})]) {
    const report=await auditLegacyRegistry({...snapshot(item),read},before);
    assert.equal(report.status,'invalid');assert.equal(report.events,undefined);
    assert.equal(JSON.stringify(report).includes('private'),false);
  }
  const report=await auditLegacyRegistry({revision,ids:[item.id,'jam-999'],read:async id=>({state:id===item.id ? item.state : null})},before);
  assert.equal(report.status,'invalid');assert.equal(report.summary,undefined);
});

test('schema-valid coercible IDs remain invalid under the actual visibility authority rules',async()=>{
  const item=await record({unbound:false});
  item.state.entries[participant.id]=[{participantId:participant.id,status:'active',
    repository:{id:202,ownerId:participant.id,fullName:'student/project',commit:revision}}];
  validateState(item.state,item.id);
  assert.equal((await auditLegacyRegistry(snapshot(item),before)).status,'invalid');
});

test('invalid identity lists, clocks and oversized records fail closed before unnecessary reads',async()=>{
  let reads=0;const base={revision,ids:[],read:async()=>{reads++;throw Error();}};
  for (const input of [{...base,revision:'invalid'},{...base,ids:['<owner>']},
    {...base,ids:['jam-1','jam-1']},{...base,ids:Array.from({length:LEGACY_AUDIT_LIMITS.events+1},(_,n)=>`jam-${n+1}`)}]) {
    assert.equal((await auditLegacyRegistry(input,before)).status,'invalid');
  }
  for (const now of [-1,NaN,Infinity,'2030-01-03',1.5]) assert.equal((await auditLegacyRegistry(base,now)).status,'invalid');
  assert.equal(reads,0);
  const item=await record();item.state.history.push('x'.repeat(LEGACY_AUDIT_LIMITS.eventBytes+1));
  assert.equal((await auditLegacyRegistry(snapshot(item),before)).status,'invalid');
});

test('fixture rejects URLs, extra configuration, cyclic/oversized data and accessors without invoking them',async()=>{
  const item=await record(),good=localFixture(item);
  for(const input of ['https://api.github.com/registry',null,{...good,token:'private-token'},
    {...good,events:{[item.id]:null}}])assert.equal((await auditLegacyRegistryFixture(input,before)).status,'invalid');
  const cycle={};cycle.self=cycle;
  assert.equal((await auditLegacyRegistryFixture(cycle,before)).status,'invalid');
  assert.equal((await auditLegacyRegistryFixture({...good,padding:'x'.repeat(LEGACY_AUDIT_LIMITS.snapshotBytes+1)},before)).status,'invalid');
  let accessed=false;
  const accessor=Object.defineProperty({},'events',{enumerable:true,get(){accessed=true;throw Error();}});
  assert.equal((await auditLegacyRegistryFixture(accessor,before)).status,'invalid');assert.equal(accessed,false);
});

test('array subclasses, sparse arrays and extra array properties are rejected without serialization',async()=>{
  const item=await record();let calls=0;
  class CustomArray extends Array {toJSON(){calls++;return [];}}
  for (const history of [new CustomArray(),Array(100_001),Array(3),Object.assign([], {extra:'x'})]) {
    const state={...item.state,history};
    assert.equal((await auditLegacyRegistry(snapshot({id:item.id,state}),before)).status,'invalid');
  }
  assert.equal(calls,0);
});

test('deep structures, excessive node counts and the aggregate snapshot byte budget fail closed',async()=>{
  let deep={};for(let n=0;n<LEGACY_AUDIT_LIMITS.depth+1;n++)deep={child:deep};
  assert.equal((await auditLegacyRegistryFixture(deep,before)).status,'invalid');
  assert.equal((await auditLegacyRegistryFixture(Array(LEGACY_AUDIT_LIMITS.nodes+1).fill(null),before)).status,'invalid');
  const template=await record();let reads=0;
  const ids=Array.from({length:10},(_,n)=>`jam-${n+1}`);
  const report=await auditLegacyRegistry({revision,ids,read:async id=>{
    reads++;const state=structuredClone(template.state);state.id=id;state.repositoryId=id.slice(4);
    for(const proposal of [...state.proposals,state.accepted])proposal.repository.id=id.slice(4);
    for(const operation of Object.values(state.operations))operation.result.eventId=id;
    state.history.push('x'.repeat(1_900_000));
    return {state};
  }},before);
  assert.equal(report.status,'invalid');assert.equal(report.summary,undefined);
  assert.equal(reads,9,'aggregate limit stops inventory before the tenth event');
});

test('empty supplied snapshot and fixture are valid empty inventories',async()=>{
  const report=await auditLegacyRegistryFixture({schema:1,revision,events:{}},before);
  assert.deepEqual(report,{schema:1,status:'clear',summary:{eventCount:0,blockedEventCount:0,missingRepositoryBindings:0},events:[]});
});
