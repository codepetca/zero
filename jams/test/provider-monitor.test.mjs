import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createJamProviderContext} from '../provider-monitor.mjs';

const TIME=1800000000000;
const config={appId:'11',installationId:'22'};
const api='https://api.github.com/repos/codepetca/zero/git/blobs';
const headers=(remaining=4000,reset=TIME+3600000,extra={})=>({'x-ratelimit-limit':'5000','x-ratelimit-remaining':String(remaining),'x-ratelimit-used':String(5000-remaining),'x-ratelimit-reset':String(Math.floor(reset/1000)),'x-ratelimit-resource':'core',...extra});
const reply=(status=200,h={},body='{}')=>new Response(body,{status,headers:{'content-type':'application/json',...h}});
const context=(options={})=>createJamProviderContext(config,{states:new Map(),now:()=>TIME,writeIntervalMs:0,emit:()=>{},...options});
const consume=async promise=>{const response=await promise;await response.text();return response;};
const rejection=async(promise,seconds)=>assert.rejects(promise,error=>error.status===503&&Number.isInteger(error.retryAfterSeconds)&&error.retryAfterSeconds>=1&&error.retryAfterSeconds<=86400&&(seconds===undefined||error.retryAfterSeconds===seconds));

test('construction, snapshot and finish do not dispatch; snapshot is explicit unknown/process-only',()=>{
  let calls=0;const summaries=[];
  const c=context({fetchImpl:()=>{calls++;},emit:value=>summaries.push(value)});
  assert.equal(c.snapshot().scope,'process');
  assert.equal(c.snapshot().installation.quota.remaining,null);
  assert.equal(c.snapshot().installation.quota.stale,true);
  c.finish('/api/jams',200);c.finish('/api/jams',200);
  assert.equal(calls,0);assert.equal(summaries.length,1);assert.equal(summaries[0].route,'list');
});

test('preserves options, body, method and metadata while protecting origin and redirects',async()=>{
  const body=JSON.stringify({private:'do not log'});let received;
  const c=context({fetchImpl:async(input,options)=>{received={input,options};const r=reply(201,headers());Object.defineProperty(r,'url',{value:api});return r;}});
  const r=await consume(c.fetch('installation')(api,{method:'POST',body,headers:{Authorization:'Bearer private'},cache:'no-store'}));
  assert.equal(received.input,api);assert.equal(received.options.method,'POST');assert.equal(received.options.body,body);
  assert.equal(received.options.redirect,'error');assert.equal(received.options.cache,'no-store');assert.equal(r.url,api);
  for(const url of ['https://elsewhere.example/a','http://api.github.com/a','https://secret@api.github.com/a'])await rejection(c.fetch('installation')(url));
  assert.equal(c.snapshot().installation.counters.dispatched,1);
});

test('captures headers before caller body parsing; missing/malformed headers remain unknown or stale',async()=>{
  const responses=[reply(200,headers(),'broken JSON'),reply(200),reply(200,headers(-1))];
  const c=context({fetchImpl:async()=>responses.shift()});
  const r=await c.fetch('installation')(api);
  assert.equal(c.snapshot().installation.quota.remaining,4000);
  await assert.rejects(r.json());
  await consume(c.fetch('installation')(api));
  assert.equal(c.snapshot().installation.quota.remaining,4000);assert.equal(c.snapshot().installation.quota.stale,true);
  await consume(c.fetch('installation')(api));assert.equal(c.snapshot().installation.quota.remaining,4000);
});

test('concurrent responses keep minimum remaining and maximum used within reset window',async()=>{
  const resolve=[];const c=context({fetchImpl:()=>new Promise(done=>resolve.push(done))});
  const first=c.fetch('installation')(api),second=c.fetch('installation')(api);
  await new Promise(done=>setImmediate(done));
  resolve[1](reply(200,headers(3000)));await consume(second);
  resolve[0](reply(200,headers(4000)));await consume(first);
  assert.equal(c.snapshot().installation.quota.remaining,3000);assert.equal(c.snapshot().installation.quota.used,2000);
});

test('old window cannot overwrite new window; expired quota becomes stale and no longer gates',async()=>{
  let time=TIME;const responses=[reply(200,headers(4000,TIME+7200000)),reply(200,headers(3000)),reply(200,headers(0,TIME+7200000))];
  const c=context({now:()=>time,deadlineMs:120000,fetchImpl:async()=>responses.shift()});
  await consume(c.fetch('installation')(api));await consume(c.fetch('installation')(api));
  assert.equal(c.snapshot().installation.quota.resetAt,TIME+7200000);assert.equal(c.snapshot().installation.quota.remaining,4000);
  await consume(c.fetch('installation')(api));await rejection(c.fetch('installation')(api),7200);
  // A fresh request context is needed after the original HTTP deadline.
  const states=new Map();const a=context({states,fetchImpl:async()=>reply(200,headers(0,TIME+1000))});
  await consume(a.fetch('installation')(api));
  const b=context({states,now:()=>TIME+2000,fetchImpl:async()=>reply()});await consume(b.fetch('installation')(api));
  assert.equal(b.snapshot().installation.quota.stale,true);
});

test('429 respects Retry-After and zero-remaining reset, returns503, never retries automatically',async()=>{
  let calls=0;const c=context({fetchImpl:async()=>{calls++;return reply(429,headers(0,TIME+3600000,{'retry-after':'120'}));}});
  await rejection(c.fetch('installation')(api,{method:'POST'}),3600);
  await rejection(c.fetch('installation')(api),3600);assert.equal(calls,1);
  assert.equal(c.snapshot().installation.counters.statuses['429'],1);
});

test('403 permission failure is not throttling; 403 with valid wait and429 without headers are',async()=>{
  let calls=0;const c=context({fetchImpl:async()=>{calls++;return reply(403);}});
  assert.equal((await consume(c.fetch('installation')(api))).status,403);
  await consume(c.fetch('installation')(api));assert.equal(calls,2);assert.equal(c.snapshot().installation.circuitUntil,null);
  const limited=context({fetchImpl:async()=>reply(403,{'retry-after':'90'})});await rejection(limited.fetch('installation')(api),90);
  const fallback=context({fetchImpl:async()=>reply(429)});await rejection(fallback.fetch('installation')(api),60);
});

test('low headroom reserves writes while reads and separate safety budget remain available',async()=>{
  const states=new Map();let calls=0;const fetchImpl=async()=>{calls++;return reply(200,headers(400));};
  const ordinary=context({states,fetchImpl});await consume(ordinary.fetch('installation')(api));
  await rejection(ordinary.fetch('installation')(api,{method:'POST'}),3600);
  await consume(ordinary.fetch('installation')(api));
  const safety=context({states,fetchImpl,priority:'safety'});await consume(safety.fetch('installation')(api,{method:'POST'}));
  const recovery=context({states,fetchImpl:async()=>reply(200,headers(32)),priority:'recovery'});
  await consume(recovery.fetch('installation')(api));await rejection(recovery.fetch('installation')(api,{method:'PATCH'}),3600);
  await consume(recovery.fetch('installation')(api));assert.equal(calls,3);
});

test('installation/setup circuits are shared by public config; participant circuit is request-local',async()=>{
  const states=new Map();const first=context({states,fetchImpl:async()=>reply(429)});
  await rejection(first.fetch('participant')(api),60);
  first.finish('actions',503);
  const second=context({states,fetchImpl:async()=>reply()});await consume(second.fetch('participant')(api));await consume(second.fetch('installation')(api));
  await rejection(first.fetch('setup')(api),60);await rejection(second.fetch('setup')(api),60);
  await consume(second.fetch('installation')(api));
  await rejection(first.fetch('installation')(api),60);await rejection(second.fetch('installation')(api,{headers:{Authorization:'Bearer rotated'}}),60);
  const other=createJamProviderContext({...config,installationId:'23'},{states,now:()=>TIME,fetchImpl:async()=>reply()});await consume(other.fetch('installation')(api));
});

test('two upstream/network failures open15s circuit; successful response resets consecutive failures',async()=>{
  let calls=0;const responses=[reply(503),reply(),reply(503),reply(502)];
  const c=context({fetchImpl:async()=>{calls++;return responses.shift();}});
  for(let i=0;i<4;i++)await consume(c.fetch('installation')(api));
  await rejection(c.fetch('installation')(api),15);assert.equal(calls,4);
  const n=context({fetchImpl:async()=>{throw Error('secret provider error');}});
  await rejection(n.fetch('installation')(api));await rejection(n.fetch('installation')(api),15);await rejection(n.fetch('installation')(api),15);
  assert.equal(n.snapshot().installation.counters.dispatched,2);
});

test('installation permits cover response bodies and release on cancellation; maximum four shared requests',async()=>{
  let calls=0;const states=new Map();const fetchImpl=async()=>{calls++;return reply();};
  const a=context({states,fetchImpl}),b=context({states,fetchImpl});
  const held=await Promise.all(Array.from({length:4},()=>a.fetch('installation')(api)));
  const fifth=b.fetch('installation')(api);
  await new Promise(done=>setTimeout(done,15));assert.equal(calls,4);assert.equal(a.snapshot().installation.inFlight,4);
  await held[0].body.cancel();await consume(fifth);assert.equal(calls,5);
  await Promise.all(held.slice(1).map(r=>r.body.cancel()));assert.equal(a.snapshot().installation.inFlight,0);
});

test('mutative starts are staggered across contexts and four normal stages complete',async()=>{
  const states=new Map(),starts=[];const fetchImpl=async()=>{starts.push(performance.now());return reply();};
  const a=context({states,fetchImpl,writeIntervalMs:25}),b=context({states,fetchImpl,writeIntervalMs:25});
  await Promise.all(Array.from({length:4},(_,i)=>consume((i%2?a:b).fetch('installation')(api,{method:i===3?'PATCH':'POST'}))));
  assert.equal(starts.length,4);
  for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=24,`${starts[i]-starts[i-1]}ms`);
});

test('caller cancellation and context deadline abort waits without dispatch or replay',async()=>{
  let calls=0;const c=context({writeIntervalMs:1000,fetchImpl:async()=>{calls++;return reply();}});
  await consume(c.fetch('installation')(api,{method:'POST'}));
  const controller=new AbortController(),pending=c.fetch('installation')(api,{method:'POST',signal:controller.signal});
  controller.abort();await rejection(pending);assert.equal(calls,1);assert.equal(c.snapshot().installation.queued,0);
  const d=context({deadlineMs:20,writeIntervalMs:1000,fetchImpl:async()=>reply()});
  await consume(d.fetch('installation')(api,{method:'POST'}));await rejection(d.fetch('installation')(api,{method:'POST'}));
  assert.equal(d.snapshot().installation.counters.dispatched,1);
});

test('upstream fetch receives combined cancellation; timeout error is safe',async()=>{
  const c=context({deadlineMs:25,fetchImpl:(_input,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('secret')),{once:true}))});
  const keepAlive=setTimeout(()=>{},100);
  try{await rejection(c.fetch('installation')(api));}finally{clearTimeout(keepAlive);}
  assert.equal(c.snapshot().installation.counters.timeouts,1);assert.equal(c.snapshot().installation.inFlight,0);
});

test('bounded map evicts idle configurations; logging is once, secret-free and cannot change results',async()=>{
  const states=new Map(),logs=[];
  for(let i=1;i<=20;i++){
    const c=createJamProviderContext({appId:'11',installationId:String(i),privateKey:'PRIVATE_KEY_SECRET'},
      {states,now:()=>TIME,fetchImpl:async()=>reply(),emit:value=>logs.push(value)});
    await consume(c.fetch('installation')(api,{headers:{Authorization:'Bearer TOKEN_SECRET'},body:undefined}));
    c.finish('https://secret.example/OP_ID_SECRET',200);c.finish('read',200);
  }
  assert.equal(states.size,16);assert.equal(logs.length,20);
  const encoded=JSON.stringify(logs);for(const secret of ['PRIVATE_KEY_SECRET','TOKEN_SECRET','OP_ID_SECRET','https://','codepetca'])assert.ok(!encoded.includes(secret));
  const c=context({emit:()=>{throw Error('logger');}});assert.doesNotThrow(()=>c.finish('read',200));
});

test('recognized throttle observes malformed body without reading it and cancels its stream',async()=>{
  let read=0,cancelled=0;
  const stream=new ReadableStream({pull(){read++;},cancel(){cancelled++;}},{highWaterMark:0});
  const c=context({fetchImpl:async()=>new Response(stream,{status:429,headers:headers(0)})});
  await rejection(c.fetch('installation')(api),3600);
  assert.equal(read,0);assert.equal(cancelled,1);assert.equal(c.snapshot().installation.inFlight,0);
  assert.equal(c.snapshot().installation.quota.remaining,0);
});

test('HTTP-date wait is parsed, long Retry-After is safely capped in error but retained internally',async()=>{
  const date=new Date(TIME+120000).toUTCString();
  const dated=context({fetchImpl:async()=>reply(429,{'retry-after':date})});await rejection(dated.fetch('installation')(api),120);
  const long=context({fetchImpl:async()=>reply(429,{'retry-after':'172800'})});await rejection(long.fetch('installation')(api),86400);
  assert.equal(long.snapshot().installation.circuitUntil,TIME+172800000);
  const invalid=context({fetchImpl:async()=>reply(403,{'retry-after':'1e3','x-ratelimit-remaining':'bogus'})});
  await consume(invalid.fetch('installation')(api));assert.equal(invalid.snapshot().installation.circuitUntil,null);
});

test('other quota resources cannot replace a current core floor; resource text is allowlisted',async()=>{
  const responses=[reply(200,headers(400)),reply(200,headers(5000,TIME+3600000,{'x-ratelimit-resource':'search'}))];
  const c=context({fetchImpl:async()=>responses.shift()});await consume(c.fetch('installation')(api));await consume(c.fetch('installation')(api));
  assert.equal(c.snapshot().installation.quota.resource,'core');await rejection(c.fetch('installation')(api,{method:'POST'}));
  const invalid=context({fetchImpl:async()=>reply(200,headers(4000,TIME+3600000,{'x-ratelimit-resource':'secret_header_value'}))});
  await consume(invalid.fetch('installation')(api));assert.equal(invalid.snapshot().installation.quota.resource,null);
});

test('deadline while consuming a stalled body fails the body and releases its permit',async()=>{
  const c=context({deadlineMs:20,fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{}'));}},{highWaterMark:0}))});
  const keepAlive=setTimeout(()=>{},100);
  try {const response=await c.fetch('installation')(api);await assert.rejects(response.json(),error=>error.status===503);}
  finally {clearTimeout(keepAlive);}
  assert.equal(c.snapshot().installation.inFlight,0);assert.equal(c.snapshot().installation.counters.timeouts,1);
});

test('explicit upstream cancellation is separate from timeout and does not poison provider circuit',async()=>{
  const c=context({fetchImpl:async()=>new Response(new ReadableStream({},{highWaterMark:0}))});
  for(let i=0;i<2;i++){
    const controller=new AbortController();const response=await c.fetch('installation')(api,{signal:controller.signal});
    controller.abort();await assert.rejects(response.text());
  }
  assert.equal(c.snapshot().installation.counters.cancelled,2);
  assert.equal(c.snapshot().installation.counters.timeouts,0);assert.equal(c.snapshot().installation.circuitUntil,null);
});

test('full queue fails within four seconds without dispatching a fifth call',async()=>{
  let calls=0;const c=context({fetchImpl:async()=>{calls++;return reply();}});
  const held=await Promise.all(Array.from({length:4},()=>c.fetch('installation')(api)));
  const started=performance.now();
  await rejection(c.fetch('installation')(api));
  assert.ok(performance.now()-started>=3900);assert.ok(performance.now()-started<5000);
  assert.equal(calls,4);assert.equal(c.snapshot().installation.queued,0);
  await Promise.all(held.map(r=>r.body.cancel()));
});

test('bounded state map cannot evict a busy installation and split its semaphore',async()=>{
  const states=new Map(),held=[];
  for(let i=1;i<=16;i++){
    const c=createJamProviderContext({appId:'11',installationId:String(i)},{states,now:()=>TIME,fetchImpl:async()=>reply()});
    held.push(await c.fetch('installation')(api));
  }
  const extra=createJamProviderContext({appId:'11',installationId:'17'},{states,now:()=>TIME,fetchImpl:async()=>reply()});
  await rejection(extra.fetch('installation')(api));assert.equal(states.size,16);
  await Promise.all(held.map(r=>r.body.cancel()));
  await consume(extra.fetch('installation')(api));assert.equal(states.size,16);
});

test('existing GitHub transport parses wrapped responses and retains first-response retry guidance',async()=>{
  const {githubRequest}=await import('../github-transport.mjs');
  const healthy=context({fetchImpl:async()=>reply(200,headers(),'{"sha":"safe"}')});
  const result=await githubRequest('/git/ref',{token:'fake-unit-test-token',fetchImpl:healthy.fetch('installation')});
  assert.deepEqual(result,{status:200,data:{sha:'safe'}});assert.equal(healthy.snapshot().installation.inFlight,0);
  const limited=context({fetchImpl:async()=>reply(429,{'retry-after':'120'},'not JSON')});
  await rejection(githubRequest('/git/ref',{token:'fake-unit-test-token',fetchImpl:limited.fetch('installation')}),120);
});

test('persistent summaries omit participant personal quota observations',async()=>{
  const logs=[],c=context({emit:value=>logs.push(value),fetchImpl:async()=>reply()});
  await consume(c.fetch('participant')(api));
  assert.equal(c.snapshot().participant.quota.scope,'participant-request');
  c.finish('actions',200);
  assert.equal(logs[0].participant.quota,undefined);
  assert.equal(logs[0].participant.counters.dispatched,1);
});

test('concurrent contexts distinguish their own calls from shared process counters',async()=>{
  const states=new Map(),a=context({states,writeIntervalMs:0}),b=context({states,writeIntervalMs:0});
  await Promise.all([consume(a.fetch('installation')(api)),consume(b.fetch('installation')(api))]);
  await consume(a.fetch('installation')(api,{method:'POST'}));
  assert.equal(a.snapshot().installation.counters.dispatched,3);
  assert.equal(a.snapshot().installation.counters.reads,2);assert.equal(a.snapshot().installation.counters.writes,1);
  assert.deepEqual(a.snapshot().request.calls.installation,{reads:1,writes:1});
  assert.deepEqual(b.snapshot().request.calls.installation,{reads:1,writes:0});
  assert.equal(a.snapshot().request.scope,'request');assert.ok(a.snapshot().request.elapsedMs>=0);
});
