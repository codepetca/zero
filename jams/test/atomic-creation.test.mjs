import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {rendezvous} from './github-http-fixture.mjs';
import {creator,maintainer,hostedManifest} from './fixtures.mjs';
const manifest=hostedManifest();
const payload=(operationId,actor=creator)=>({operationId,actor,manifest});
const status=code=>error=>error.status===code;
function service(store,limits={}) {return createJamService({canCreateJam:()=>true,store,verifySource:async()=>{},maintainerIds:[maintainer.id],limits,now:()=>Date.parse('2030-01-02T12:00:00Z')});}

test('branch CAS enforces pending creation capacity across simultaneous distinct IDs and permits retry recovery',async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();const s=service(f.store,{actorCreations:1});
  f.beforeRef=rendezvous();
  const inputs=[payload('creation-0001'),payload('creation-0002')];
  const result=await Promise.allSettled(inputs.map(input=>s.propose(input)));f.beforeRef=null;
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.filter(r=>r.status==='rejected'&&r.reason.status===429).length,1);
  const winner=result.findIndex(r=>r.status==='fulfilled');
  assert.deepEqual(await s.propose(inputs[winner]),result[winner].value);
  await assert.rejects(s.propose({...inputs[winner],manifest:hostedManifest({title:'Changed'})}),status(409));
  assert.equal((await f.store.snapshot()).ids.length,1);
  const approved=await s.mutate({id:result[winner].value.eventId,actor:maintainer,operationId:'approval-0001',action:'approve',revision:result[winner].value.revision});
  assert.equal(approved.status,'approved');await s.propose(inputs[1-winner]);
});

test('different actors have independent pending capacity and total cap is branch atomic',async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();const s=service(f.store,{actorCreations:1,events:1});
  f.beforeRef=rendezvous();const results=await Promise.allSettled([s.propose(payload('creation-0001')),s.propose(payload('creation-0002',{id:'44',login:'other'}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===429).length,1);
});

test('lost successful write response recovers the exact operation before admission checks',async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();const s=service(f.store,{actorCreations:1});
  f.afterRef=()=>true;await assert.rejects(s.propose(payload('creation-0001')),status(503));f.afterRef=null;
  const recovered=await s.propose(payload('creation-0001'));assert.equal(recovered.status,'submitted');assert.equal((await f.store.snapshot()).ids.length,1);
});
