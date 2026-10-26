import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtomicGitHubJamStore,JAM_REGISTRY_PROTOCOL_MARKER} from '../git-store.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {approved,fixture} from './fixtures.mjs';
import {deferred,rendezvous} from './github-http-fixture.mjs';

async function eventState(){const f=fixture();await approved(f);return structuredClone(f.store.records.get('jam-101').state);}
const ledger=()=>({schema:1,operations:{'jam-101:33:closing-0001':{scope:'jam-101',actorId:'33',operationId:'closing-0001',payloadDigest:'a'.repeat(64),settledAt:1000}}});
const status=code=>error=>error.status===code;

test('atomic store requires an explicitly migrated registry; migration preserves all existing bytes and is idempotent',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);
  const old=f.files,head=f.head;
  await assert.rejects(f.store.snapshot(),status(503));assert.equal(f.head,head);assert.equal(f.commits.length,0);
  const snapshot=await f.store.migrate();assert.deepEqual(snapshot.ids,['jam-101']);assert.deepEqual((await snapshot.read('jam-101')).state,state);
  assert.deepEqual(await snapshot.read('jam-999'),{state:null});assert.deepEqual(snapshot.settlements,{schema:1,operations:{}});
  assert.equal(f.files.get('jams').toString(),JAM_REGISTRY_PROTOCOL_MARKER);
  assert.deepEqual(f.files.get('zero-jams-v2/events/jam-101.json'),old.get('jams/jam-101.json'));
  assert.deepEqual(f.files.get('README.md'),old.get('README.md'));assert.deepEqual(f.files.get('website/vercel.json'),old.get('website/vercel.json'));
  assert.equal(f.files.has('jams/jam-101.json'),false);
  await f.store.migrate();assert.equal(f.commits.length,1);
  assert.ok(f.requests.every(call=>!call.path.includes('/git/refs/heads/main')));
});

test('snapshot event reads stay pinned; event plus ledger publish in the same sole-parent commit',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);const before=await f.store.migrate();
  const next={...state,updatedAt:'2030-01-02T12:01:00.000Z'};
  assert.equal(await f.store.compareAndSwap('jam-101',before.revision,next,{settlements:ledger()}),true);
  assert.deepEqual((await before.read('jam-101')).state,state);
  const after=await f.store.snapshot();assert.deepEqual((await after.read('jam-101')).state,next);assert.deepEqual(after.settlements,ledger());
  assert.equal(f.commits.at(-1).parent,before.revision);
  assert.equal((await f.store.read('jam-999')).revision,after.revision);
  assert.equal(await f.store.compareAndSwap('jam-101',before.revision,state),false);
});

test('sibling event and fence commits cannot both fast-forward; the losing transaction can retry',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);const snapshot=await f.store.migrate();
  const meet=rendezvous();f.beforeRef=meet;
  const results=await Promise.all([f.store.compareAndSwap('jam-101',snapshot.revision,{...state,updatedAt:'2030-01-02T12:01:00.000Z'}),f.store.compareAndSwap(null,snapshot.revision,null,{settlements:ledger()})]);
  assert.deepEqual(results.slice().sort(),[false,true]);assert.equal(f.commits.length,2);
  f.beforeRef=null;const current=await f.store.snapshot();
  if(!results[1])assert.equal(await f.store.compareAndSwap(null,current.revision,null,{settlements:ledger()}),true);
  else assert.equal(await f.store.compareAndSwap('jam-101',current.revision,{...state,updatedAt:'2030-01-02T12:01:00.000Z'}),true);
  assert.deepEqual((await f.store.snapshot()).settlements,ledger());
});

test('a lost ref response remains unknown while the durable fence can be recovered',async t=>{
  const f=await atomicGitHttpFixture(t,{timeoutMs:80});await f.store.migrate();const snapshot=await f.store.snapshot();
  f.afterRef=()=>true;
  await assert.rejects(f.store.compareAndSwap(null,snapshot.revision,null,{settlements:ledger()}),status(503));
  f.afterRef=null;assert.deepEqual((await f.store.snapshot()).settlements,ledger());assert.equal(f.commits.length,2);
});

test('migration retries and re-copies a legacy writer that wins the first branch conflict',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);
  const changed={...state,updatedAt:'2030-01-02T12:03:00.000Z'};let raced=false;
  f.beforeRef=async()=>{if(raced)return;raced=true;const old=await f.legacyStore.read('jam-101');assert.equal(await f.legacyStore.compareAndSwap('jam-101',old.revision,changed),true);};
  await f.store.migrate();assert.equal(raced,true);assert.deepEqual((await f.store.read('jam-101')).state,changed);assert.equal(f.commits.length,2);
});

test('migration winning blocks an already-started legacy Contents write and new legacy creates',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);const old=await f.legacyStore.read('jam-101');
  const entered=deferred(),release=deferred();f.beforeContents=async()=>{entered.resolve();await release.promise;};
  const pending=f.legacyStore.compareAndSwap('jam-101',old.revision,{...state,updatedAt:'2030-01-02T12:04:00.000Z'});
  await entered.promise;await f.store.migrate();release.resolve();assert.equal(await pending,false);
  await assert.rejects(f.legacyStore.list(),status(503));assert.deepEqual((await f.store.read('jam-101')).state,state);
  assert.equal(f.files.get('jams').toString(),JAM_REGISTRY_PROTOCOL_MARKER);
});

test('an in-flight legacy creation cannot recreate the retired directory after migration',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState(),entered=deferred(),release=deferred();
  f.beforeContents=async()=>{entered.resolve();await release.promise;};
  const pending=f.legacyStore.compareAndSwap('jam-101',null,state);
  await entered.promise;await f.store.migrate();release.resolve();assert.equal(await pending,false);
  assert.deepEqual(await f.store.list(),[]);assert.equal(f.files.get('jams').toString(),JAM_REGISTRY_PROTOCOL_MARKER);
});

test('capacity bounds creations without consuming settlement capacity, and invalid input never publishes',async t=>{
  const f=await atomicGitHttpFixture(t,{maxEvents:1}),state=await eventState();f.seed('jam-101',state);const snapshot=await f.store.migrate();
  const second=JSON.parse(JSON.stringify(state).replaceAll('jam-101','jam-102'));second.repositoryId='102';for(const proposal of second.proposals)proposal.repository.id='102';if(second.accepted)second.accepted.repository.id='102';
  await assert.rejects(f.store.compareAndSwap('jam-102',snapshot.revision,second),status(429));
  assert.equal(await f.store.compareAndSwap(null,snapshot.revision,null,{settlements:ledger()}),true);
  const count=f.commits.length;
  await assert.rejects(f.store.compareAndSwap(null,f.head,null,{settlements:{schema:1,operations:{bad:{}}}}),status(503));
  await assert.rejects(f.store.compareAndSwap('../bad',f.head,state),status(400));
  await assert.rejects(f.store.compareAndSwap(null,null,null,{settlements:ledger()}),status(400));assert.equal(f.commits.length,count);
  assert.throws(()=>createAtomicGitHubJamStore({token:'fixture-token-long',registryBranch:'main'}),status(503));
});

test('malformed marker/ledger and a recreated legacy directory fail closed without fallback',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);await f.store.migrate();
  f.replaceFile('zero-jams-v2/settlements.json','{"schema":1,"operations":{"bad":{}}}\n');
  await assert.rejects(f.store.snapshot(),status(503));
  f.replaceFile('zero-jams-v2/settlements.json','{"schema":1,"operations":{}}\n');f.replaceFile('jams','{"schema":2}\n');
  await assert.rejects(f.store.snapshot(),status(503));await assert.rejects(f.store.migrate(),status(503));
  // A provider unexpectedly recreating the legacy tree cannot become v2 state.
  // Locally replace the parent atomically, as an adversarial provider simulation.
  f.replaceFile('jams',JAM_REGISTRY_PROTOCOL_MARKER);f.replaceFile('jams/recreated.json','{}');
  await assert.rejects(f.store.snapshot(),status(503));assert.deepEqual(f.state(),state);
});

test('tree truncation and forged blob integrity fail closed',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);await f.store.migrate();
  let mode='tree';f.beforeRequest=({call,res,json})=>{
    if(mode==='tree'&&call.path.includes('/git/trees/')){json(res,200,{sha:call.path.split('/').at(-1),truncated:true,tree:[]});return true;}
    if(mode==='blob'&&call.path.includes('/git/blobs/')){json(res,200,{sha:call.path.split('/').at(-1),size:3,encoding:'base64',content:Buffer.from('bad').toString('base64')});return true;}
  };
  await assert.rejects(f.store.snapshot(),status(503));mode='blob';await assert.rejects(f.store.snapshot(),status(503));
});

test('missing branches never provision; invalid UTF-8 and over-capacity snapshots are unavailable',async t=>{
  const f=await atomicGitHttpFixture(t),state=await eventState();f.seed('jam-101',state);
  f.beforeRequest=({call,res,json})=>{if(call.path.includes('/git/ref/')){json(res,404,{});return true;}};
  await assert.rejects(f.store.migrate(),status(503));assert.ok(f.requests.every(call=>call.method==='GET'));
  f.beforeRequest=null;await f.store.migrate();
  f.replaceFile('zero-jams-v2/events/jam-101.json',Buffer.from([0xff]));await assert.rejects(f.store.read('jam-101'),status(503));
  f.replaceFile('zero-jams-v2/events/jam-101.json',JSON.stringify(state));
  f.seed('jam-102',state,{legacy:false});await assert.rejects(f.makeStore({maxEvents:1}).snapshot(),status(503));
});

test('an incorrect successful ref response is unknown and exact migration retries recover publication',async t=>{
  const f=await atomicGitHttpFixture(t);
  f.afterRef=({res,json})=>{json(res,200,{ref:'refs/heads/zero-jams-pilot-registry',object:{type:'commit',sha:'f'.repeat(40)}});return true;};
  await assert.rejects(f.store.migrate(),error=>error.status===503&&error.message.includes('unknown'));
  f.afterRef=null;const snapshot=await f.store.migrate();assert.deepEqual(snapshot.ids,[]);assert.equal(f.commits.length,1);
});
