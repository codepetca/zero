import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {createProjectVisibilityReader} from '../project-visibility-reader.mjs';
import {LIMITS,validateState,validateSettlements} from '../schema.mjs';
import {atomicGitHttpFixture,ATOMIC_REGISTRY_BRANCH} from './git-http-fixture.mjs';
import {fixture,manifest,creator,participant,approved} from './fixtures.mjs';

const reveal='2030-01-05T00:00:00Z',instant=Date.parse(reveal);
const unavailable={status:503};
const transportA='a'.repeat(64),transportB='b'.repeat(64),transportC='c'.repeat(64);
async function state(){
  const f=fixture({verifyRepository:async()=>({repository:{id:'202',ownerId:participant.id,fullName:'student/project'}}),source:async input=>({repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:reveal}})})});
  const revision=await approved(f);
  await f.service.mutate({id:'jam-101',actor:participant,operationId:'join-0001',action:'join',revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'});
  return structuredClone(f.store.records.get('jam-101').state);
}
async function setup(t,{empty=false}={}){
  const f=await atomicGitHttpFixture(t);
  if(!empty)f.seed('jam-101',await state());
  await f.store.migrate();f.requests.length=0;
  // Only the adapter has the loopback fixture's synthetic auth. The reader
  // supplies no credential, and no URL can reach external network in this test.
  f.publicFetch=async(input,options)=>{
    const url=new URL(input);
    assert.equal(url.origin,'https://api.github.com');
    assert.match(url.pathname,/^\/repos\/codepetca\/zero\/git\/(?:ref\/heads\/zero-jams-registry|(?:commits|trees|blobs)\/[a-f0-9]{40})$/);
    assert.equal(url.search,'');assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.authorization,undefined);
    assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    return f.fetchImpl(input,{...options,headers:{...options.headers,Authorization:'Bearer atomic-http-fixture-only-token'}});
  };
  f.reader=()=>createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:f.publicFetch});
  return f;
}
async function rewriteResponse(f,transform){
  const original=f.publicFetch;
  f.publicFetch=async(input,options)=>{
    const response=await original(input,options);
    const data=await response.json();
    const transformed=transform(new URL(input),data);
    const replacement=new Response(JSON.stringify(transformed),{status:200,headers:{'content-type':'application/json'}});
    Object.defineProperty(replacement,'url',{value:input});return replacement;
  };
}
async function capturedResponses(t){
  const f=await setup(t),responses=new Map(),original=f.publicFetch;
  f.publicFetch=async(...args)=>{
    const response=await original(...args);responses.set(args[0],await response.clone().text());return response;
  };
  await f.reader().snapshot();
  return {f,respond:input=>{
    assert.ok(responses.has(input));return new Response(responses.get(input),{headers:{'content-type':'application/json'}});
  }};
}

test('fresh public snapshots validate all records and read only fixed official GET URLs',async t=>{
  const f=await setup(t),reader=f.reader(),head=f.head,commits=f.commits.length;
  const snap=await reader.snapshot();assert.equal(snap.revision,head);assert.deepEqual(snap.ids,['jam-101']);
  const readsPerSnapshot=f.requests.length;assert.equal(readsPerSnapshot,9);
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),true);
  assert.equal((await reader.visibility(instant)).isHeld('202'),false);
  assert.equal(f.requests.length,readsPerSnapshot+2,'Warm decisions each perform their own fresh head GET.');
  t.diagnostic(`One-event fixture: ${readsPerSnapshot} unauthenticated Git reads cold, one per warm snapshot; not a hosted capacity result.`);
  assert.equal(f.head,head);assert.equal(f.commits.length,commits);
  assert.ok(f.requests.every(call=>call.method==='GET'));
  assert.equal(f.requests.filter(call=>call.path.includes('/git/ref/')).length,4);
  assert.equal(reader.compareAndSwap,undefined);assert.equal(reader.migrate,undefined);
  assert.throws(()=>{reader.compareAndSwap=()=>{};},TypeError);
  for(const options of [{registryBranch:'main'},{url:'http://127.0.0.1/'},{token:'do-not-use'},{method:'POST'},{timeoutMs:8001},{totalTimeoutMs:15001}])assert.throws(()=>createProjectVisibilityReader(options),unavailable);
});

test('empty authoritative registry is complete, but no negative decision survives a new head',async t=>{
  const f=await setup(t,{empty:true}),reader=f.reader();
  const old=await reader.snapshot();assert.deepEqual(old.ids,[]);
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),false);
  f.seed('jam-101',await state(),{legacy:false});
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),true);
  assert.deepEqual(old.ids,[]);assert.deepEqual(await old.read('jam-101'),{state:null});
  assert.notEqual((await reader.snapshot()).revision,old.revision);
  // A previously successful result is not reused after authority becomes unavailable.
  f.beforeRequest=({call,res,json})=>{if(call.path.includes('/git/ref/')){json(res,503,{});return true;}};
  await assert.rejects(reader.visibility(instant-1),unavailable);
});

test('head changes during assembly fail closed while prior snapshots stay pinned',async t=>{
  const f=await setup(t),reader=f.reader(),old=await reader.snapshot(),oldState=(await old.read('jam-101')).state;
  f.seed('jam-101',{...oldState,updatedAt:'2030-01-02T12:00:01.000Z'},{legacy:false});
  let changed=false;
  f.beforeRequest=({call})=>{
    if(!changed&&call.path.includes('/git/blobs/')){changed=true;f.seed('jam-101',{...oldState,updatedAt:'2030-01-02T12:01:00.000Z'},{legacy:false});}
  };
  await assert.rejects(reader.snapshot(),unavailable);
  assert.deepEqual((await old.read('jam-101')).state,oldState);
  f.beforeRequest=null;assert.equal((await reader.snapshot()).revision,f.head);
  const altered=await old.read('jam-101');altered.state.registrations={};
  assert.deepEqual((await old.read('jam-101')).state,oldState);
});

test('missing, auth, rate limit, network, redirect and invalid response failures are closed',async t=>{
  const f=await setup(t);
  for(const status of [301,401,403,404,429,500]){
    f.beforeRequest=({res,json})=>{json(res,status,{});return true;};
    await assert.rejects(f.reader().snapshot(),unavailable,`HTTP ${status}`);
  }
  f.beforeRequest=null;
  const original=f.publicFetch;
  for(const make of [
    ()=>{throw Error('offline');},
    ()=>new Response('{}',{headers:{'content-type':'text/html'}}),
    ()=>new Response('{',{headers:{'content-type':'application/json'}}),
    ()=>new Response('{}',{headers:{'content-type':'application/json','content-length':'999999999'}}),
    ()=>{const r=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(r,'redirected',{value:true});return r;},
    ()=>{const r=new Response('{}',{headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:'https://example.invalid/'});return r;},
    ()=>new Response('x'.repeat(16385),{headers:{'content-type':'application/json'}}),
  ]){f.publicFetch=async()=>make();await assert.rejects(f.reader().snapshot(),unavailable);}
  f.publicFetch=original;
  await assert.rejects(createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async(...args)=>{await new Promise(resolve=>setTimeout(resolve,5));return original(...args);},totalTimeoutMs:1}).snapshot(),unavailable);
});

test('tree truncation, silent omission, forged blob hashes and malformed layout fail closed',async t=>{
  const f=await setup(t),original=f.publicFetch;
  for(const transform of [
    (url,data)=>url.pathname.includes('/git/trees/')?{...data,truncated:true}:data,
    (url,data)=>url.pathname.includes('/git/trees/')?{...data,tree:[]}:data,
    (url,data)=>url.pathname.includes('/git/trees/')?{...data,tree:[...data.tree,...data.tree.slice(0,1)]}:data,
    (url,data)=>url.pathname.includes('/git/blobs/')?{...data,content:Buffer.from('forged').toString('base64'),size:6}:data,
  ]){f.publicFetch=original;await rewriteResponse(f,transform);await assert.rejects(f.reader().snapshot(),unavailable);}
  f.publicFetch=original;
  for(const [path,bytes]of [
    ['jams','wrong protocol'],
    ['zero-jams-v2/settlements.json','{"schema":1,"operations":{"bad":{}}}'],
    ['zero-jams-v2/unexpected.json','{}'],
  ]){
    const saved=f.files;f.replaceFile(path,bytes);await assert.rejects(f.reader().snapshot(),unavailable);
    // Restore affected files through the fixture, never through the reader.
    for(const [name,value]of saved)if(name===path)f.replaceFile(name,value);
    if(!saved.has(path))break;
  }
});

test('invalid state/UTF-8 and unexpected event names never become missing events',async t=>{
  const f=await setup(t),valid=f.files.get('zero-jams-v2/events/jam-101.json');
  for(const bytes of [Buffer.from([0xff]),Buffer.from('{'),Buffer.from('{}')]){
    f.replaceFile('zero-jams-v2/events/jam-101.json',bytes);
    await assert.rejects(f.reader().snapshot(),unavailable);
  }
  f.replaceFile('zero-jams-v2/events/jam-101.json',valid);
  f.replaceFile('zero-jams-v2/events/readme.json','{}');
  await assert.rejects(f.reader().snapshot(),unavailable);
});


test('aggregate response bytes and complete event count have independent hard caps',async t=>{
  const f=await setup(t,{empty:true}),original=await state();
  const copy=id=>{
    const s=structuredClone(original);s.id=`jam-${id}`;s.repositoryId=id;
    for(const proposal of s.proposals)proposal.repository.id=id;
    s.accepted.repository.id=id;
    for(const operation of Object.values(s.operations))operation.result.eventId=s.id;
    return s;
  };
  // Each event is individually schema-valid and under its 2 MB limit. The
  // complete HTTP JSON transfer still exceeds the independent 16 MB budget.
  for(let i=101;i<110;i++){
    const s=copy(String(i));s.history=['x'.repeat(1_500_000)];
    f.seed(s.id,s,{legacy:false});
  }
  await assert.rejects(f.reader().snapshot(),unavailable);
  assert.ok(f.requests.filter(call=>call.path.includes('/git/blobs/')).length<11);
  // Over-capacity event listings must fail before reading any event contents.
  for(let i=101;i<202;i++){const s=copy(String(i));f.seed(s.id,s,{legacy:false});}
  f.requests.length=0;await assert.rejects(f.reader().snapshot(),unavailable);
  assert.equal(f.requests.filter(call=>call.path.includes('/git/blobs/')).length,2);
});


test('matches atomic-store JSON byte boundaries including the serialization newline',async t=>{
  const f=await setup(t),s=await state();
  s.history=[''];
  s.history[0]='x'.repeat(LIMITS.stateBytes-Buffer.byteLength(JSON.stringify(s)));
  validateState(s,s.id,LIMITS,{enforceReserve:false});
  const stateBytes=Buffer.from(JSON.stringify(s)+'\n');
  assert.equal(stateBytes.length,LIMITS.stateBytes+1);
  f.replaceFile('zero-jams-v2/events/jam-101.json',stateBytes);
  assert.deepEqual((await (await f.store.snapshot()).read(s.id)).state,s);
  assert.deepEqual((await (await f.reader().snapshot()).read(s.id)).state,s);
  f.replaceFile('zero-jams-v2/events/jam-101.json',Buffer.concat([stateBytes,Buffer.from(' ')]));
  await assert.rejects(f.reader().snapshot(),unavailable);
  f.replaceFile('zero-jams-v2/events/jam-101.json',stateBytes);

  // Current settlement cardinality/string bounds keep canonical ledgers below
  // the byte ceiling. Whitespace is valid JSON and reaches the decoder's exact
  // wire boundary without inventing schema fields or bypassing validation.
  const ledger={schema:1,operations:{}};validateSettlements(ledger);
  const ledgerJson=JSON.stringify(ledger);
  const ledgerBytes=Buffer.from(ledgerJson+' '.repeat(LIMITS.settlementBytes-Buffer.byteLength(ledgerJson))+'\n');
  assert.equal(ledgerBytes.length,LIMITS.settlementBytes+1);
  f.replaceFile('zero-jams-v2/settlements.json',ledgerBytes);
  assert.deepEqual((await f.store.snapshot()).settlements,ledger);
  assert.deepEqual((await f.reader().snapshot()).settlements,ledger);
  f.replaceFile('zero-jams-v2/settlements.json',Buffer.concat([ledgerBytes,Buffer.from(' ')]));
  await assert.rejects(f.reader().snapshot(),unavailable);
});


test('cached bodies never preserve an old Join absence and reveal time is reevaluated',async t=>{
  const f=await setup(t),joined=f.state(),without=structuredClone(joined);
  without.registrations={};without.entries={};
  f.seed('jam-101',without,{legacy:false});
  const reader=f.reader();
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),false);
  f.requests.length=0;
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),false);
  assert.equal(f.requests.length,1);
  f.seed('jam-101',joined,{legacy:false});f.requests.length=0;
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),true);
  assert.equal(f.requests.length,9,'A new authoritative head bypasses the cached absence.');
  f.requests.length=0;
  assert.equal((await reader.visibility(instant)).isHeld('202'),false);
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),true);
  assert.equal(f.requests.length,2,'Only immutable bodies are cached, never time-based decisions.');
});

test('caller mutation of issued snapshots cannot alter the cached authority',async t=>{
  const f=await setup(t),reader=f.reader(),snapshot=await reader.snapshot();
  const original=(await snapshot.read('jam-101')).state;
  snapshot.settlements.operations.evil={};
  const result=await snapshot.read('jam-101');result.state.registrations={};
  assert.throws(()=>snapshot.ids.push('jam-999'),TypeError);
  assert.deepEqual((await snapshot.read('jam-101')).state,original);
  const next=await reader.snapshot();assert.deepEqual(next.settlements,{schema:1,operations:{}});
  assert.deepEqual((await next.read('jam-101')).state,original);
  assert.equal((await reader.visibility(instant-1)).isHeld('202'),true);
});

test('concurrent cold calls share only body work, with independent fresh head checks and admission bounds',async t=>{
  const f=await setup(t),original=f.publicFetch;let release,heads=0,allHeads;
  const gate=new Promise(resolve=>{release=resolve;}),observed=new Promise(resolve=>{allHeads=resolve;});
  f.publicFetch=async(input,options)=>{
    if(input.includes('/git/commits/'))await gate;
    const response=await original(input,options);
    if(input.includes('/git/ref/')&&++heads===4)allHeads();
    return response;
  };
  const reader=f.reader(),pending=Array.from({length:4},()=>reader.visibility(instant-1));
  await observed;
  await assert.rejects(reader.snapshot(),unavailable,'Excess active calls fail closed.');
  release();
  const results=await Promise.all(pending);assert.ok(results.every(result=>result.isHeld('202')));
  assert.equal(f.requests.filter(call=>call.path.includes('/git/ref/')).length,8);
  assert.equal(f.requests.filter(call=>call.path.includes('/git/commits/')).length,1);
  assert.equal(f.requests.length,15,'Seven immutable reads plus two independent heads per cold caller.');
  f.requests.length=0;
  await Promise.all([reader.snapshot(),reader.snapshot()]);
  assert.equal(f.requests.length,2,'Warm concurrent callers also read heads independently.');
});

test('preaborted snapshot and visibility calls perform zero transport work and consume no admission',async()=>{
  let calls=0;
  const reader=createProjectVisibilityReader({fetchImpl:async()=>{calls++;throw Error('offline');}});
  const controller=new AbortController();controller.abort();
  for(let i=0;i<8;i++){
    await assert.rejects(reader.snapshot({signal:controller.signal}),unavailable);
    await assert.rejects(reader.visibility(instant-1,{signal:controller.signal}),unavailable);
  }
  assert.equal(calls,0);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  await assert.rejects(reader.snapshot(),unavailable);assert.equal(calls,1);
});

test('synchronous transport cancellation still observes its rejected promise',async()=>{
  const controller=new AbortController();
  const reader=createProjectVisibilityReader({fetchImpl:()=>{
    controller.abort();return Promise.reject(Error('transport aborted'));
  }});
  await assert.rejects(reader.snapshot({signal:controller.signal}),unavailable);
  assert.equal(getEventListeners(controller.signal,'abort').length,0);
  await new Promise(resolve=>setImmediate(resolve));
});

test('aborting stalled warm heads promptly cancels owned transport and releases all admission',async t=>{
  const {f,respond}=await capturedResponses(t);let stalled=false,calls=0;
  const ownedSignals=[],lateRejects=[];
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:(input,options)=>{
    calls++;
    if(stalled){ownedSignals.push(options.signal);return new Promise((_,reject)=>{lateRejects.push(reject);});}
    return Promise.resolve(respond(input));
  }});
  await reader.snapshot();assert.equal(calls,9);
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  stalled=true;
  const controllers=Array.from({length:4},()=>new AbortController());
  const failures=controllers.map(controller=>assert.rejects(reader.visibility(instant-1,{signal:controller.signal}),unavailable));
  assert.equal(ownedSignals.length,4);
  await assert.rejects(reader.snapshot(),unavailable);
  controllers.forEach(controller=>controller.abort());
  await Promise.all(failures); // No clock advancement: cancellation, not timeout.
  assert.ok(ownedSignals.every(signal=>signal.aborted));
  assert.ok(controllers.every(controller=>getEventListeners(controller.signal,'abort').length===0));
  stalled=false;const before=calls;
  assert.equal((await reader.snapshot()).revision,f.head);assert.equal(calls,before+1,'Cancellation preserves the immutable cache but still requires a fresh head.');
  lateRejects.forEach(reject=>reject(Error('late transport failure')));
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(20000);t.mock.timers.reset();
});

test('aborting the final authorization head cannot issue or cache a completed body',async t=>{
  const {f,respond}=await capturedResponses(t);let heads=0,calls=0,releaseHead,startedHead,ownedSignal;
  const gate=new Promise(resolve=>{releaseHead=resolve;}),started=new Promise(resolve=>{startedHead=resolve;});
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async(input,options)=>{
    calls++;
    if(input.includes('/git/ref/')&&++heads===2){ownedSignal=options.signal;startedHead();await gate;}
    return respond(input);
  }});
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const controller=new AbortController(),failure=assert.rejects(reader.snapshot({signal:controller.signal}),unavailable);
  await started;controller.abort();await failure;
  assert.equal(ownedSignal.aborted,true);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  releaseHead();await new Promise(resolve=>setImmediate(resolve));
  const before=calls;assert.equal((await reader.snapshot()).revision,f.head);
  assert.equal(calls,before+9,'An aborted final check never populates the body cache.');
  t.mock.timers.tick(20000);t.mock.timers.reset();
});

for(const cancelled of [0,1])test(`aborted shared ${cancelled===0?'initiator':'waiter'} releases admission while other callers complete`,async t=>{
  const {f,respond}=await capturedResponses(t);let releaseBuild,startedBuild,heads=0,builds=0,buildSignal;
  const gate=new Promise(resolve=>{releaseBuild=resolve;}),started=new Promise(resolve=>{startedBuild=resolve;});
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async(input,options)=>{
    if(input.includes('/git/ref/'))heads++;
    if(input.includes('/git/commits/')){builds++;buildSignal=options.signal;startedBuild();await gate;}
    return respond(input);
  }});
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const controllers=Array.from({length:4},()=>new AbortController());
  const first=reader.visibility(instant-1,{signal:controllers[0].signal});await started;
  const pending=[first,...controllers.slice(1).map(controller=>reader.visibility(instant-1,{signal:controller.signal}))];
  const aborted=assert.rejects(pending[cancelled],unavailable);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(heads,4);await assert.rejects(reader.snapshot(),unavailable);
  controllers[cancelled].abort();await aborted;
  assert.equal(buildSignal.aborted,false,'Immutable shared transport is independent of caller cancellation.');
  assert.equal(getEventListeners(controllers[cancelled].signal,'abort').length,0);
  const replacement=reader.visibility(instant-1);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(heads,5,'A replacement caller is admitted before the stalled build completes.');
  releaseBuild();
  const results=await Promise.all([...pending.filter((_,index)=>index!==cancelled),replacement]);
  assert.ok(results.every(result=>result.isHeld('202')));
  assert.equal(builds,1);assert.equal(heads,9,'Every surviving caller makes its own final head read.');
  assert.ok(controllers.every(controller=>getEventListeners(controller.signal,'abort').length===0));
  assert.equal((await reader.snapshot()).revision,f.head);assert.equal(heads,10);
  t.mock.timers.tick(20000);t.mock.timers.reset();
});

test('an abandoned shared build has bounded lifetime and its late failure is handled',async t=>{
  const {f,respond}=await capturedResponses(t);let startedBuild,builds=0,stall=true;
  const started=new Promise(resolve=>{startedBuild=resolve;});
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,timeoutMs:100,totalTimeoutMs:100,fetchImpl:async input=>{
    if(input.includes('/git/commits/')){builds++;if(stall){startedBuild();return new Promise(()=>{});}}
    return respond(input);
  }});
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const controller=new AbortController(),failure=assert.rejects(reader.snapshot({signal:controller.signal}),unavailable);
  await started;controller.abort();await failure;
  t.mock.timers.tick(100);await new Promise(resolve=>setImmediate(resolve));
  stall=false;
  assert.equal((await reader.snapshot()).revision,f.head);assert.equal(builds,2,'An orphaned failed build is removed and never cached.');
  t.mock.timers.reset();
});

test("shared build failure is not cached and one caller cannot accept another caller's changed head",async t=>{
  const f=await setup(t),original=f.publicFetch;let release,initialHeads=0,allHeads,failBuild=true;
  const gate=new Promise(resolve=>{release=resolve;}),observed=new Promise(resolve=>{allHeads=resolve;});
  f.publicFetch=async(input,options)=>{
    if(failBuild&&input.includes('/git/commits/')){await gate;return new Response('{}',{status:503});}
    const response=await original(input,options);
    if(failBuild&&input.includes('/git/ref/')&&++initialHeads===2)allHeads();
    return response;
  };
  const reader=f.reader(),pending=[reader.snapshot(),reader.snapshot()];await observed;release();
  const failed=await Promise.allSettled(pending);assert.ok(failed.every(result=>result.status==='rejected'&&result.reason.status===503));
  failBuild=false;f.requests.length=0;await reader.snapshot();assert.equal(f.requests.length,9,'A failed build is retried completely.');
  f.requests.length=0;await reader.snapshot();assert.equal(f.requests.length,1);

  let checks=0,allowChange;const accepted=new Promise(resolve=>{allowChange=resolve;});
  const changing=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async(...args)=>{
    if(args[0].includes('/git/ref/')&&++checks===4){
      await accepted;
      f.seed('jam-101',{...f.state(),updatedAt:'2030-01-02T12:00:02.000Z'},{legacy:false});
    }
    return original(...args);
  }});
  const calls=Array.from({length:2},()=>changing.snapshot().then(value=>{allowChange();return value;}));
  const decisions=await Promise.allSettled(calls);
  assert.equal(decisions.filter(result=>result.status==='rejected'&&result.reason.status===503).length,1);
  assert.equal(decisions.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await changing.snapshot()).revision,f.head);
});

test('an earlier caller with a slow head independently times out while a later shared build succeeds',async t=>{
  const f=await setup(t),original=f.publicFetch,responses=new Map();
  // Capture validated fixture responses before enabling the deterministic clock;
  // the staggered transport below performs no network or real-time sleeps.
  f.publicFetch=async(...args)=>{
    const response=await original(...args);responses.set(args[0],await response.clone().text());return response;
  };
  await f.reader().snapshot();
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  let releaseHead,releaseBuild,buildStarted,heads=0,builds=0,laterSettled=false;
  const headGate=new Promise(resolve=>{releaseHead=resolve;}),buildGate=new Promise(resolve=>{releaseBuild=resolve;});
  const started=new Promise(resolve=>{buildStarted=resolve;});
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,timeoutMs:100,totalTimeoutMs:100,fetchImpl:async(input)=>{
    if(input.includes('/git/ref/')&&++heads===1)await headGate;
    if(input.includes('/git/commits/')){builds++;buildStarted();await buildGate;}
    assert.ok(responses.has(input));return new Response(responses.get(input),{headers:{'content-type':'application/json'}});
  }});
  const earlier=reader.snapshot(),earlierRejected=assert.rejects(earlier,unavailable);
  t.mock.timers.tick(40);
  const later=reader.snapshot().finally(()=>{laterSettled=true;});await started;
  releaseHead();await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(60);await earlierRejected;
  assert.equal(laterSettled,false,"The timed-out waiter must not cancel the later caller's build.");
  releaseBuild();assert.equal((await later).revision,f.head);
  assert.equal(builds,1);assert.equal(heads,3,'The expired waiter never makes a final authorization head read.');
  assert.equal((await reader.snapshot()).revision,f.head);assert.equal(heads,4);
  t.mock.timers.reset();
});

test('at most two distinct immutable builds can be in flight and failures release admission',async t=>{
  const f=await setup(t),original=f.publicFetch;let release,started=0,notify;
  const gate=new Promise(resolve=>{release=resolve;});
  f.publicFetch=async(...args)=>{
    if(args[0].includes('/git/commits/')){started++;notify?.();await gate;}
    return original(...args);
  };
  const reader=f.reader();
  const firstStarted=new Promise(resolve=>{notify=resolve;}),first=reader.snapshot();await firstStarted;
  f.seed('jam-101',{...f.state(),updatedAt:'2030-01-02T12:00:01.000Z'},{legacy:false});
  const secondStarted=new Promise(resolve=>{notify=resolve;}),second=reader.snapshot();await secondStarted;
  f.seed('jam-101',{...f.state(),updatedAt:'2030-01-02T12:00:02.000Z'},{legacy:false});
  await assert.rejects(reader.snapshot(),unavailable);assert.equal(started,2);
  release();const failed=await Promise.allSettled([first,second]);
  assert.ok(failed.every(result=>result.status==='rejected'&&result.reason.status===503));
  f.requests.length=0;assert.equal((await reader.snapshot()).revision,f.head);assert.equal(f.requests.length,9);
});

test('a warm body never provides fallback for malformed, failed or stalled head reads',{timeout:4000},async t=>{
  const f=await setup(t),original=f.publicFetch;let transport=original;
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:(...args)=>transport(...args),timeoutMs:200,totalTimeoutMs:3000});
  await reader.snapshot();
  for(const make of [
    ()=>new Response('{}',{status:503}),
    ()=>new Response(JSON.stringify({ref:`refs/heads/${ATOMIC_REGISTRY_BRANCH}`,object:{type:'commit',sha:'bad'}}),{headers:{'content-type':'application/json'}}),
    ()=>new Response('{',{headers:{'content-type':'application/json'}}),
    ()=>{throw Error('offline');},
    ()=>new Promise(()=>{}),
    ()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){return new Promise(()=>{});}}),{headers:{'content-type':'application/json'}}),
  ]){
    transport=async()=>make();
    await assert.rejects(reader.visibility(instant-1),unavailable);
  }
  transport=original;f.requests.length=0;await reader.snapshot();assert.equal(f.requests.length,1,'Failures do not poison immutable bodies, but never authorize fallback.');
});

test('cache evicts old bodies by entry count and total serialized bytes, and skips oversized bodies',async t=>{
  const f=await setup(t),reader=f.reader(),initial=f.head;
  await reader.snapshot();
  for(let i=1;i<=4;i++){
    f.seed('jam-101',{...f.state(),updatedAt:`2030-01-02T12:00:0${i}.000Z`},{legacy:false});await reader.snapshot();
  }
  f.head=initial;f.requests.length=0;await reader.snapshot();assert.equal(f.requests.length,9,'The fifth distinct body evicts the oldest of four entries.');

  const large=await state();large.history=['x'.repeat(1_400_000)];
  const byteReader=f.reader();let oldest;
  for(let i=1;i<=3;i++){
    large.updatedAt=`2030-01-02T12:00:0${i}.000Z`;f.seed('jam-101',large,{legacy:false});
    if(i===1)oldest=f.head;
    await byteReader.snapshot();
  }
  f.head=oldest;f.requests.length=0;await byteReader.snapshot();assert.equal(f.requests.length,9,'Three 1.4 MB bodies exceed the independent 4 MB cache bound.');
  for(const id of ['102','103']){
    const copy=structuredClone(large);copy.id=`jam-${id}`;copy.repositoryId=id;
    for(const proposal of copy.proposals)proposal.repository.id=id;
    copy.accepted.repository.id=id;
    for(const operation of Object.values(copy.operations))operation.result.eventId=copy.id;
    f.seed(copy.id,copy,{legacy:false});
  }
  const oversized=f.reader();await oversized.snapshot();f.requests.length=0;await oversized.snapshot();
  assert.equal(f.requests.length,11,'A valid body above 4 MB is served uncached rather than growing cache storage.');
});

test('per-call transports retain fixed requests and each authorize their own warm cached body',async t=>{
  const {f,respond}=await capturedResponses(t);let defaults=0,denyB=false;
  const calls={a:[],b:[]};
  const transport=name=>async(input,options)=>{
    calls[name].push(input);
    assert.equal(new URL(input).origin,'https://api.github.com');
    assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Authorization,undefined);
    if(name==='b'&&denyB)return new Response('{}',{status:401});
    return respond(input);
  };
  const a={fetchImpl:transport('a'),transportIdentity:transportA},b={fetchImpl:transport('b'),transportIdentity:transportB};
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async()=>{defaults++;throw Error('default must not be selected');}});
  assert.equal((await reader.snapshot(a)).revision,f.head);assert.equal(calls.a.length,9);
  assert.equal((await reader.visibility(instant-1,b)).isHeld('202'),true);
  assert.equal(calls.b.length,1);assert.match(calls.b[0],/\/git\/ref\//);
  denyB=true;await assert.rejects(reader.snapshot(b),unavailable);
  denyB=false;assert.equal((await reader.snapshot(b)).revision,f.head);
  assert.equal(calls.b.length,3,'Every caller must pass its own head even after another credential cached the body.');
  assert.equal(defaults,0);
});

test('same-identity calls share initiating transport while each final head uses its own transport',async t=>{
  const {f,respond}=await capturedResponses(t);let release,notify,buildSignal;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{notify=resolve;});
  const calls={a:[],b:[]};
  const a=async(input,options)=>{
    calls.a.push(input);
    if(input.includes('/git/commits/')){buildSignal=options.signal;notify();await gate;}
    return respond(input);
  };
  const b=async input=>{calls.b.push(input);assert.match(input,/\/git\/ref\//,'A waiter cannot replace the initiating build transport.');return respond(input);};
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async()=>{throw Error('no fallback');}});
  const controller=new AbortController();
  const first=reader.snapshot({fetchImpl:a,transportIdentity:transportA,signal:controller.signal}),failure=assert.rejects(first,unavailable);
  await started;
  const second=reader.snapshot({fetchImpl:b,transportIdentity:transportA});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.b.length,1);controller.abort();await failure;
  assert.equal(buildSignal.aborted,false);
  assert.equal(getEventListeners(controller.signal,'abort').length,0);
  release();assert.equal((await second).revision,f.head);
  assert.equal(calls.a.length,8,'Aborted initiator retains only its initial head and immutable work.');
  assert.equal(calls.b.length,2,'Surviving waiter uses its own initial and final heads.');
});

test('distinct transport identities isolate concurrent credential failures without default fallback',async t=>{
  const {f,respond}=await capturedResponses(t);let release,notify,started=0,defaults=0;
  const gate=new Promise(resolve=>{release=resolve;}),bothStarted=new Promise(resolve=>{notify=resolve;});
  const calls={a:[],b:[]},secret='credential-must-never-appear-in-errors';
  const transport=name=>async input=>{
    calls[name].push(input);
    if(input.includes('/git/commits/')){
      if(++started===2)notify();await gate;
      if(name==='a')throw Error(secret);
    }
    return respond(input);
  };
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,fetchImpl:async()=>{defaults++;return respond('unexpected');}});
  const first=reader.snapshot({fetchImpl:transport('a'),transportIdentity:transportA});
  const rejected=assert.rejects(first,error=>error.status===503&&!String(error).includes(secret));
  const second=reader.snapshot({fetchImpl:transport('b'),transportIdentity:transportB});
  await bothStarted;release();await rejected;
  assert.equal((await second).revision,f.head);assert.equal(started,2);
  assert.equal(calls.a.length,2);assert.equal(calls.b.length,9);assert.equal(defaults,0);
});

test('transport identities share the global two-flight bound and do not become retained cache keys',async t=>{
  const {f,respond}=await capturedResponses(t);let release,notify,started=0;
  const gate=new Promise(resolve=>{release=resolve;}),bothStarted=new Promise(resolve=>{notify=resolve;});
  const transport=async input=>{
    if(input.includes('/git/commits/')){if(++started===2)notify();await gate;}
    return respond(input);
  };
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH});
  const first=reader.snapshot({fetchImpl:transport,transportIdentity:transportA});
  const second=reader.snapshot({fetchImpl:transport,transportIdentity:transportB});
  await bothStarted;
  await assert.rejects(reader.snapshot({fetchImpl:transport,transportIdentity:transportC}),unavailable);
  assert.equal(started,2);release();await Promise.all([first,second]);
  let reads=0;
  const third=await reader.snapshot({transportIdentity:transportC,fetchImpl:async input=>{reads++;assert.match(input,/\/git\/ref\//);return respond(input);}});
  assert.equal(third.revision,f.head);assert.equal(reads,1);
});

test('an expired initiating per-call transport fails all shared waiters without switching transport',async t=>{
  const {f,respond}=await capturedResponses(t);let notify,stall=true,buildsA=0,buildsB=0,headsB=0;
  const started=new Promise(resolve=>{notify=resolve;});
  const a=async input=>{
    if(input.includes('/git/commits/')){buildsA++;notify();if(stall)return new Promise(()=>{});}
    return respond(input);
  };
  const b=async input=>{if(input.includes('/git/commits/'))buildsB++;if(input.includes('/git/ref/'))headsB++;return respond(input);};
  const reader=createProjectVisibilityReader({registryBranch:ATOMIC_REGISTRY_BRANCH,timeoutMs:100,totalTimeoutMs:100,fetchImpl:async()=>{throw Error('no fallback');}});
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const first=reader.snapshot({fetchImpl:a,transportIdentity:transportA}),firstRejected=assert.rejects(first,unavailable);
  await started;t.mock.timers.tick(40);
  const second=reader.snapshot({fetchImpl:b,transportIdentity:transportA}),secondRejected=assert.rejects(second,unavailable);
  await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(60);
  await Promise.all([firstRejected,secondRejected]);
  assert.equal(buildsA,1);assert.equal(buildsB,0);assert.equal(headsB,1,'A failed build cannot authorize a final head or fall back to the waiter transport.');
  stall=false;
  assert.equal((await reader.snapshot({fetchImpl:b,transportIdentity:transportA})).revision,f.head);
  assert.equal(buildsB,1,'Failed flights are removed and never cached.');
  t.mock.timers.reset();
});

test('malformed per-call transport options fail closed before admission or transport',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('offline');};
  const reader=createProjectVisibilityReader({fetchImpl});
  for(const options of [null,[],42,{fetchImpl},{transportIdentity:transportA},{fetchImpl:undefined,transportIdentity:transportA},{fetchImpl:null,transportIdentity:transportA},{fetchImpl,transportIdentity:undefined},{fetchImpl,transportIdentity:''},{fetchImpl,transportIdentity:'A'.repeat(64)},{fetchImpl,transportIdentity:'a'.repeat(63)},{fetchImpl,transportIdentity:'a'.repeat(65)},{fetchImpl,transportIdentity:{}},{fetchImpl,transportIdentity:transportA,headers:{Authorization:'never include me'}},{signal:{}},{signal:null}]){
    await assert.rejects(reader.snapshot(options),unavailable);
    await assert.rejects(reader.visibility(instant-1,options),unavailable);
  }
  const controller=new AbortController();controller.abort();
  await assert.rejects(reader.snapshot({fetchImpl,transportIdentity:transportA,signal:controller.signal}),unavailable);
  assert.equal(calls,0);assert.equal(getEventListeners(controller.signal,'abort').length,0);
  await assert.rejects(reader.snapshot(),unavailable);assert.equal(calls,1);
});
