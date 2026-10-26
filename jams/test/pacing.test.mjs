import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {PILOT_PROVIDER_PACING} from '../pacing.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {deferred} from './github-http-fixture.mjs';
import {fixture,approved,participant,maintainer,creator,COMMIT} from './fixtures.mjs';

async function prepared(t,policy=PILOT_PROVIDER_PACING) {
  const old=fixture(),revision=await approved(old),git=await atomicGitHttpFixture(t);
  git.seed('jam-101',old.store.records.get('jam-101').state);await git.store.migrate();
  let time=Date.parse('2030-01-02T12:01:01Z');
  const make=()=>createJamService({store:git.makeStore(),verifySource:async()=>{throw Error('No source verification expected');},maintainerIds:[maintainer.id],now:()=>time,limits:{retries:2},pacing:policy});
  return {git,revision,make,get time(){return time;},set time(value){time=value;}};
}
const joining=(revision,id='33',operationId='paced-join-0001')=>({id:'jam-101',actor:{id,login:id==='33'?'student':'student'+id},operationId,action:'join',revision});
const closing=({actor,id,operationId,...payload})=>({actor,scope:id,operationId,payload});
const onePerMinute={...PILOT_PROVIDER_PACING,ordinary:{minute:1,hour:20}};

function duplicate(state) {
  const next=structuredClone(state);next.id='jam-102';next.repositoryId='102';
  for(const p of next.proposals)p.repository.id='102';next.accepted.repository.id='102';
  next.operations={};next.registrations={};next.entries={};next.history=[];
  return next;
}

test('separate service/store instances share accepted-intent limits across actors and events',async t=>{
  const f=await prepared(t),other=duplicate(f.git.state());f.git.seed('jam-102',other,{legacy:false});
  const first=joining(f.revision),second={...joining(f.revision,'44','paced-join-0002'),id:'jam-102'};
  await f.make().mutate(first);await f.make().mutate(second);
  const head=f.git.head,count=f.git.commits.length;
  await assert.rejects(f.make().mutate(joining(f.revision,'55','paced-join-0003')),e=>e.status===429&&e.retryAfterSeconds===60);
  assert.equal(f.git.head,head);assert.equal(f.git.commits.length,count);
  assert.equal((await f.make().mutate(first)).status,'joined','an accepted same-key result bypasses admission');
  f.time+=60_000;
  assert.equal((await f.make().mutate(joining(f.revision,'55','paced-join-0003'))).status,'joined');
});

test('a CAS loser reloads the winning intent and cannot exceed the shared minute cap',async t=>{
  const f=await prepared(t,onePerMinute),ready=deferred();let arrivals=0;
  f.git.beforeRef=async()=>{if(++arrivals===2)ready.resolve();if(arrivals<=2)await ready.promise;};
  const result=await Promise.allSettled(['33','44'].map(id=>f.make().mutate(joining(f.revision,id,'race-join-'+id))));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').reason.status,429);
  assert.equal(Object.keys(f.git.state().registrations).length,1);
  assert.equal(arrivals,2,'loser does not stage a second mutation after seeing the quota');
});

test('ordinary traffic cannot spend the safety pool, and safety recovery precedes its cap',async t=>{
  const f=await prepared(t,{...PILOT_PROVIDER_PACING,safety:{minute:1,hour:10}});
  await f.make().mutate(joining(f.revision));await f.make().mutate(joining(f.revision,'44','second-join-0001'));
  const suspend={id:'jam-101',actor:maintainer,operationId:'safety-suspend-001',action:'suspend',reason:'Disposable test'};
  assert.equal((await f.make().mutate(suspend)).status,'suspended');
  const count=f.git.commits.length;
  await assert.rejects(f.make().mutate({...suspend,action:'cancel',operationId:'safety-cancel-001'}),e=>e.status===429&&e.retryAfterSeconds===60);
  assert.equal((await f.make().mutate(suspend)).status,'suspended');assert.equal(f.git.commits.length,count);
});

test('closing has separate capacity and existing fences/results recover after all pools fill',async t=>{
  const f=await prepared(t,{...PILOT_PROVIDER_PACING,settlement:{minute:1,hour:10}});
  const first=joining(f.revision),second=joining(f.revision,'44','second-join-0001');
  await f.make().mutate(first);await f.make().mutate(second);
  const unknown=closing(joining(f.revision,'55','unknown-join-001'));
  assert.equal((await f.make().settle(unknown)).settlement,'not-applied');
  const count=f.git.commits.length;
  await assert.rejects(f.make().settle({...unknown,operationId:'unknown-join-002'}),e=>e.status===429);
  assert.equal((await f.make().settle(unknown)).settlement,'not-applied');
  assert.equal((await f.make().settle(closing(first))).settlement,'applied');
  assert.equal((await f.make().mutate(first)).status,'joined');
  assert.equal(f.git.commits.length,count);assert.equal(f.git.state().registrations['55'],undefined);
});

test('hourly admission stays shared after minute slots reopen',async t=>{
  const f=await prepared(t);
  // Two setup intents plus eighteen new intents fill the hourly ordinary pool.
  for(let index=0;index<18;index++) {
    await f.make().mutate(index%2===0?joining(f.revision,'33','hourly-join-'+index):
      {id:'jam-101',actor:participant,operationId:'hourly-leave-'+index,action:'leave'});
    f.time+=61_000;
  }
  const count=f.git.commits.length;
  await assert.rejects(f.make().mutate(joining(f.revision,'33','hourly-final-join')),e=>e.status===429&&e.retryAfterSeconds>2000&&e.retryAfterSeconds<=3600);
  assert.equal(f.git.commits.length,count);
});

test('future timestamps retain slots; serious clock rollback stops new writes but not recovery',async t=>{
  const f=await prepared(t,onePerMinute),first=joining(f.revision);
  await f.make().mutate(first);const acceptedAt=f.time;
  f.time-=20_000;
  await assert.rejects(f.make().mutate(joining(f.revision,'44','future-join-001')),e=>e.status===429&&e.retryAfterSeconds===80);
  f.time=acceptedAt-31_000;
  await assert.rejects(f.make().mutate(joining(f.revision,'44','future-join-002')),e=>e.status===503&&/clock/.test(e.message));
  assert.equal((await f.make().mutate(first)).status,'joined');
  assert.equal((await f.make().settle(closing(first))).settlement,'applied');
});

test('a no-event proposal fence remains recoverable after ordinary admission fills',async t=>{
  const f=await prepared(t);await f.make().mutate(joining(f.revision));await f.make().mutate(joining(f.revision,'44','second-join-0001'));
  const request={actor:creator,scope:'proposals',operationId:'unknown-proposal-001',payload:{repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}};
  assert.equal((await f.make().settle(request)).settlement,'not-applied');
  const count=f.git.commits.length;
  assert.equal((await f.make().propose({actor:creator,operationId:request.operationId,...request.payload})).settlement,'not-applied');
  assert.equal(f.git.commits.length,count);
});

test('an unreadable other event cannot be omitted from shared admission',async t=>{
  const f=await prepared(t),other=duplicate(f.git.state());f.git.seed('jam-102',other,{legacy:false});
  const head=f.git.head,count=f.git.commits.length;
  const bytes=f.git.files.get('zero-jams-v2/events/jam-102.json');
  const {createHash}=await import('node:crypto');const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  f.git.beforeRequest=({call,res,json})=>{if(call.path.endsWith('/git/blobs/'+sha)){json(res,503,{});return true;}};
  await assert.rejects(f.make().mutate(joining(f.revision)),{status:503});
  assert.equal(f.git.head,head);assert.equal(f.git.commits.length,count);
});

test('pacing requires atomic snapshots and rejects weaker or malformed policies',()=>{
  const memory=fixture();
  const options={store:memory.store,verifySource:async()=>{},pacing:PILOT_PROVIDER_PACING};
  assert.throws(()=>createJamService(options),{status:503});
  for(const pacing of [{},{...PILOT_PROVIDER_PACING,ordinary:{minute:3,hour:20}},
    {...PILOT_PROVIDER_PACING,clockSkewMs:31_000},{...PILOT_PROVIDER_PACING,safety:{minute:2,hour:1}}])
    assert.throws(()=>createJamService({...options,pacing}),{status:503});
});

test('two-event pilot admission adds one event read, without duplicating the immutable snapshot',async t=>{
  const f=await prepared(t);f.git.seed('jam-102',duplicate(f.git.state()),{legacy:false});
  let start=f.git.requests.length;
  await f.make().mutate(joining(f.revision));
  let calls=f.git.requests.slice(start);
  assert.equal(calls.length,14);assert.equal(calls.filter(c=>c.method==='GET').length,10);
  assert.equal(calls.filter(c=>c.method==='PATCH').length,1);
  start=f.git.requests.length;
  await f.make().settle(closing(joining(f.revision,'55','pilot-fence-0001')));
  calls=f.git.requests.slice(start);assert.equal(calls.length,14);
  start=f.git.requests.length;await f.make().list();calls=f.git.requests.slice(start);
  assert.equal(calls.length,9);assert.ok(calls.every(c=>c.method==='GET'));
});
