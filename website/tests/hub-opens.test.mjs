import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpensStore, opensConfiguration, recordOpen} from '../lib/hub-opens.mjs';
import {recordPlayOpen, metricLabel} from '../lib/hub-metrics-client.mjs';

const env = {ZERO_HUB_OPENS_REDIS_URL: 'https://counter.upstash.io', ZERO_HUB_OPENS_REDIS_TOKEN: 'fixture-token'};
const request = (body = {id: 'drawing-pad'}, headers = {}) => new Request('https://zero.codepet.ca/api/hub/opens', {
  method: 'POST', headers: {origin: 'https://zero.codepet.ca', 'content-type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('only explicit server Redis config is enabled, and preview credentials stay inactive', () => {
  assert.equal(opensConfiguration({}), null);
  assert.ok(opensConfiguration({...env, VERCEL: '1', VERCEL_ENV: 'production'}));
  for (const mode of ['preview', 'development', undefined]) assert.equal(opensConfiguration({...env, VERCEL: '1', VERCEL_ENV: mode}), null);
  for (const url of ['http://counter.upstash.io', 'https://upstash.io.evil.test', 'https://user:pass@counter.upstash.io', 'https://counter.upstash.io/path', 'https://counter.upstash.io?token=x', 'https://localhost'])
    assert.equal(opensConfiguration({...env, ZERO_HUB_OPENS_REDIS_URL: url}), null);
  assert.equal(opensConfiguration({...env, ZERO_HUB_OPENS_REDIS_TOKEN: 'bad\ntoken'}), null);
});

test('Vercel Marketplace credentials work as a pair, with explicit override and disable controls', () => {
  const marketplace = {KV_REST_API_URL: 'https://marketplace.upstash.io', KV_REST_API_TOKEN: 'marketplace-token', VERCEL: '1', VERCEL_ENV: 'production'};
  assert.deepEqual(opensConfiguration(marketplace), {endpoint: 'https://marketplace.upstash.io', token: 'marketplace-token'});
  assert.equal(opensConfiguration({...marketplace, VERCEL_ENV: 'preview'}), null);
  assert.equal(opensConfiguration({...marketplace, ZERO_HUB_OPENS_DISABLED: '1'}), null);
  assert.deepEqual(opensConfiguration({...marketplace, ...env}), {endpoint: 'https://counter.upstash.io', token: 'fixture-token'});
  for (const override of [{ZERO_HUB_OPENS_REDIS_URL: env.ZERO_HUB_OPENS_REDIS_URL}, {ZERO_HUB_OPENS_REDIS_TOKEN: env.ZERO_HUB_OPENS_REDIS_TOKEN}, {ZERO_HUB_OPENS_REDIS_URL: ''}])
    assert.equal(opensConfiguration({...marketplace, ...override}), null);
});

test('atomic increments and batched reads use fixed namespaced keys, no URLs or visitor data', async () => {
  const values = new Map(), calls = [];
  const store = createOpensStore({env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://counter.upstash.io');
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    const command = JSON.parse(options.body); calls.push(command);
    if (command[0] === 'INCR') {const count = (values.get(command[1]) ?? 0) + 1; values.set(command[1], count); return Response.json({result: count});}
    return Response.json({result: command.slice(1).map(key => values.has(key) ? String(values.get(key)) : null)});
  }});
  await Promise.all(Array.from({length: 20}, () => store.increment('drawing-pad')));
  assert.deepEqual(await store.counts(['drawing-pad', 'new-project']), {'drawing-pad': 20, 'new-project': 0});
  assert.ok(calls.every(command => command.slice(1).every(key => key.startsWith('zero:hub:opens:v1:'))));
  await assert.rejects(store.increment('../other'));
  await assert.rejects(store.counts(Array(13).fill('drawing-pad')));
});

test('provider errors, unsafe numbers, oversized responses and uncertain writes never become zero or retries', async () => {
  for (const response of [new Response('', {status: 429}), Response.json({error: 'unavailable'}), Response.json({result: '9007199254740992'}), new Response('x'.repeat(4097))]) {
    let calls = 0;
    const store = createOpensStore({env, fetchImpl: async () => {calls++; return response;}});
    await assert.rejects(store.increment('drawing-pad')); assert.equal(calls, 1);
  }
  for (const result of [[-1], ['broken'], [], [9007199254740992]]) {
    const store = createOpensStore({env, fetchImpl: async () => Response.json({result})});
    await assert.rejects(store.counts(['drawing-pad']));
  }
  let calls = 0;
  const store = createOpensStore({env, fetchImpl: async () => {calls++; throw Error('connection closed after write');}});
  await assert.rejects(store.increment('drawing-pad')); assert.equal(calls, 1);
});

test('recording requires same origin, bounded selection and a known playable project before writing', async () => {
  const writes = [], resolved = [];
  const options = {env, store: {increment: async id => writes.push(id)}, resolve: async selection => {resolved.push(selection); return selection.id === 'drawing-pad' ? {playUrl: 'https://codepetca.github.io/zero-drawing-pad/'} : null;}};
  assert.equal((await recordOpen(request(), options)).status, 204);
  assert.deepEqual(writes, ['drawing-pad']); assert.deepEqual(resolved, [{kind: 'game', id: 'drawing-pad'}]);
  for (const headers of [{origin: 'https://evil.test'}, {origin: 'null'}, {'sec-fetch-site': 'cross-site'}])
    assert.equal((await recordOpen(request(undefined, headers), options)).status, 403);
  assert.equal((await recordOpen(request(undefined, {'content-type': 'text/plain'}), options)).status, 415);
  for (const body of [{id: '../other'}, {id: 'drawing-pad', url: 'https://evil.test'}, 'not JSON', null])
    assert.equal((await recordOpen(request(body), options)).status, 400);
  assert.equal((await recordOpen(request('x'.repeat(257)), options)).status, 413);
  assert.equal((await recordOpen(request({id: 'not-in-catalog'}), options)).status, 404);
  assert.deepEqual(writes, ['drawing-pad']);
});

test('disabled counting, downtime and explicitly configured local development are harmless', async () => {
  assert.equal((await recordOpen(request(), {store: null})).status, 204);
  assert.equal((await recordOpen(request(), {store: {increment: async () => {throw Error('down');}}, resolve: async () => ({playUrl: 'https://example.test'})})).status, 503);
  const local = new Request('http://127.0.0.1:3168/api/hub/opens', {method: 'POST', headers: {origin: 'http://127.0.0.1:3168', 'content-type': 'application/json'}, body: JSON.stringify({id: 'drawing-pad'})});
  assert.equal((await recordOpen(local, {env: {NODE_ENV: 'development', ZERO_HUB_ORIGIN: 'http://127.0.0.1:3168'}, store: null,
    visibilityReader: async () => ({revision:'a'.repeat(40),observedAt:0,isHeld:()=>false}),
    resolve:async () => ({repositoryId:'123',playUrl:'https://example.test'})})).status, 204);
});

test('open resolution receives the same visibility authority and destination reader', async () => {
  const visibilityReader=async()=>({revision:'a'.repeat(40),observedAt:0,isHeld:()=>false});
  const destinationReader=async()=>{throw Error('not called by this fixture');};
  let observed;
  const result=await recordOpen(request(),{env,visibilityReader,destinationReader,
    store:{increment:async()=>assert.fail('unverified page must not be counted')},
    resolve:async(_selection,options)=>{observed=options;return {repositoryId:'202'};}});
  assert.equal(result.status,404);
  assert.equal(observed.visibilityReader,visibilityReader);
  assert.equal(observed.destinationReader,destinationReader);
});

test('client records without credentials and swallows errors without touching navigation', async () => {
  let seen;
  recordPlayOpen('drawing-pad', async (...args) => {seen = args; throw Error('offline');});
  assert.equal(seen[0], '/api/hub/opens'); assert.equal(seen[1].credentials, 'omit'); assert.equal(seen[1].keepalive, true);
  assert.deepEqual(JSON.parse(seen[1].body), {id: 'drawing-pad'});
  assert.doesNotThrow(() => recordPlayOpen('drawing-pad', () => {throw Error('blocked');}));
});

test('labels distinguish opens, incomplete adoption coverage, unknown and observed zero', () => {
  assert.equal(metricLabel('game', {opens: 0}).text, '0 opens');
  assert.equal(metricLabel('game', {opens: 1}).text, '1 open');
  assert.equal(metricLabel('game', {opens: 42}).text, '42 opens');
  assert.equal(metricLabel('game', {opens: null}), null);
  assert.equal(metricLabel('library', {projects: 2, observedProjects: 4, totalProjects: 5}).text, 'Used by at least 2 shared projects');
  assert.equal(metricLabel('library', {projects: 0, observedProjects: 0, totalProjects: 5}).text, 'Usage not measured yet');
  assert.equal(metricLabel('library', {projects: 0, observedProjects: 5, totalProjects: 5}).text, 'Used by 0 shared projects');
  assert.equal(metricLabel('library', {projects: null}), null);
});

test('stalled caller bodies finish before fresh authority can authorize a Play activation', async () => {
  for (const outcome of ['held', 'offline']) {
    let body, started, held=false, reads=0, resolved=0, writes=0;
    const reading=new Promise(done=>{started=done;});
    const stream=new ReadableStream({start(controller){body=controller;},pull(){started();}});
    const slow=new Request('https://zero.codepet.ca/api/hub/opens',{method:'POST',duplex:'half',
      headers:{Origin:'https://zero.codepet.ca','Content-Type':'application/json'},body:stream});
    const result=recordOpen(slow,{env,visibilityReader:async()=>{
      reads++;
      if(held&&outcome==='offline')throw Error('private authority failure');
      const captured=held;return {revision:'a'.repeat(40),observedAt:0,isHeld:()=>captured};
    },resolve:async()=>{resolved++;return {repositoryId:'202',playUrl:'https://student.github.io/project/'};},
    store:{increment:async()=>{writes++;}}});
    await reading;await new Promise(done=>setImmediate(done));
    assert.equal(reads,0,'No decision may precede completion of attacker-controlled body reads.');
    held=true;body.enqueue(new TextEncoder().encode(JSON.stringify({id:'game-r202-project'})));body.close();
    const response=await result;assert.equal(response.status,outcome==='held'?404:503);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'');
    assert.equal(reads,1);assert.equal(resolved,outcome==='held'?1:0);assert.equal(writes,0);
  }
});

test('a hold accepted during catalog resolution prevents the later counter write', async () => {
  let resolveStarted, release, held=false, reads=0, writes=0;
  const started=new Promise(done=>{resolveStarted=done;}),gate=new Promise(done=>{release=done;});
  const pending=recordOpen(request({id:'game-r202-project'}),{env,visibilityReader:async()=>{
    reads++;const captured=held;return {revision:'a'.repeat(40),observedAt:0,isHeld:()=>captured};
  },resolve:async()=>{resolveStarted();await gate;return {repositoryId:'202',playUrl:'https://student.github.io/project/'};},
  store:{increment:async()=>{writes++;}}});
  await started;held=true;release();
  assert.equal((await pending).status,404);assert.equal(reads,2);assert.equal(writes,0);
});

test('Play recording and the actual counter store preserve 100, 101 and 128-character IDs alongside unrelated projects',async()=>{
  const ids=[...([100,101,128].map(length=>'a'.repeat(length))),'unrelated-project'];
  for(const active of [true,false]) {
    const values=new Map(),commands=[];
    const store=createOpensStore({env,fetchImpl:async(_url,options)=>{
      const command=JSON.parse(options.body);commands.push(command);
      if(command[0]==='INCR'){const count=(values.get(command[1])??0)+1;values.set(command[1],count);return Response.json({result:count});}
      return Response.json({result:command.slice(1).map(key=>values.get(key)??null)});
    }});
    const visibilityReader=async()=>active?{revision:'a'.repeat(40),observedAt:0,isHeld:()=>false}:null;
    const options={env,store,visibilityReader,resolve:async({id})=>ids.includes(id)?
      {id,kind:'game',repositoryId:'123',playUrl:'https://student.github.io/game/'}:null};
    for(const id of ids) {
      let pending;
      recordPlayOpen(id,async(_url,init)=>{assert.ok(Buffer.byteLength(init.body)<=256);pending=recordOpen(request(init.body),options);return pending;});
      assert.equal((await pending).status,204);
    }
    assert.deepEqual(await store.counts(ids),Object.fromEntries(ids.map(id=>[id,1])));
    const before=commands.length;
    assert.equal((await recordOpen(request({id:'z'.repeat(128)}),options)).status,404);
    assert.equal((await recordOpen(request({id:'a'.repeat(129)}),options)).status,400);
    assert.equal((await recordOpen(request('x'.repeat(257)),options)).status,413);
    await assert.rejects(store.increment('a'.repeat(129)));
    await assert.rejects(store.counts(['unrelated-project','a'.repeat(129)]));
    assert.equal(commands.length,before,'Rejected selections must not reach the counter provider');
  }
});
