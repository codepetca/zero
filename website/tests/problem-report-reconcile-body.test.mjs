import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {reconcileProblemReportsResponse} from '../lib/problem-reports-reconcile.mjs';

const {privateKey} = generateKeyPairSync('rsa', {modulusLength:2048});
const secret = 'a'.repeat(40);
const env = {
  ZERO_REPORTS_ENABLED:'true', ZERO_REPORTS_ENVIRONMENT:'development',
  ZERO_REPORTS_DATABASE_URL:'postgresql://fixture:secret@localhost/reports',
  ZERO_REPORTS_GITHUB_APP_ID:'42', ZERO_REPORTS_GITHUB_INSTALLATION_ID:'43',
  ZERO_REPORTS_REPOSITORY:'example/public-reports', ZERO_REPORTS_REPOSITORY_ID:'44',
  ZERO_REPORTS_GITHUB_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),
  ZERO_REPORTS_RECONCILE_SECRET:secret
};
const headers = {Authorization:'Bearer '+secret};
const request = (body, options = {}) => new Request('https://zero.example/api/problem-reports/reconcile', {
  method:'POST',headers,...(body === undefined ? {} : {body,duplex:'half'}),...options
});
const result = {status:'ok',delivered:2,pending:1,needsAttention:0,attempted:3};

test('scheduler accepts both a null body and an explicitly empty Node/Next stream', async () => {
  let calls = 0;
  for (const req of [request(), request(new ReadableStream({start(controller) { controller.close(); }})),
    request(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(0)); controller.close(); }}))]) {
    const response = await reconcileProblemReportsResponse(req,{env,reconcile:async options => {
      calls++;
      assert.equal(options.apply,true); assert.equal(options.limit,5);
      assert.equal(options.responseBudgetMs,20000); assert.equal(options.providerBudgetMs,6000);
      assert.equal(options.signal.aborted,false);
      return {...result,unwanted:'private provider detail'};
    }});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),result);
  }
  assert.equal(calls,3);
});

test('every nonempty body, including whitespace and NUL, is rejected without reconciliation', async () => {
  let calls = 0;
  for (const body of [' ', '\n', '{}', new Uint8Array([0])]) {
    const response = await reconcileProblemReportsResponse(request(body),{env,reconcile:async () => { calls++; return result; }});
    assert.equal(response.status,400);
    assert.deepEqual(await response.json(),{status:'invalid'});
  }
  let cancelled = false, pulls = 0;
  const stream = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array([32])); },
    cancel() { cancelled = true; }
  },{highWaterMark:0});
  assert.equal((await reconcileProblemReportsResponse(request(stream),{env,reconcile:async () => { calls++; }})).status,400);
  assert.equal(pulls,1,'a first byte rejects without reading the rest of the stream');
  assert.equal(cancelled,true);
  assert.equal(calls,0);
});

test('delayed EOF can succeed while delayed nonempty bytes still fail', async () => {
  let calls = 0;
  for (const [nonempty,expected] of [[false,200],[true,400]]) {
    let timer;
    const stream = new ReadableStream({
      start(controller) { timer = setTimeout(() => {
        if (nonempty) controller.enqueue(new Uint8Array([32]));
        controller.close();
      },20); },
      cancel() { clearTimeout(timer); }
    });
    const response = await reconcileProblemReportsResponse(request(stream),{env,bodyBudgetMs:200,
      reconcile:async () => { calls++; return result; }});
    assert.equal(response.status,expected);
  }
  assert.equal(calls,1);
});

test('a hanging stream and cancellation that never settles are bounded by the body deadline', async () => {
  let calls = 0, cancelled = 0;
  const stream = new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancelled++; return new Promise(() => {}); }
  },{highWaterMark:0});
  const started = performance.now();
  const response = await reconcileProblemReportsResponse(request(stream),{env,bodyBudgetMs:25,
    reconcile:async () => { calls++; return result; }});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:'unavailable'});
  assert.ok(performance.now()-started < 1500,'does not wait for the stream/cancellation or full server budget');
  assert.equal(cancelled,1);
  assert.equal(calls,0);
});

test('body errors fail closed without disclosing their contents', async () => {
  let calls = 0;
  const stream = new ReadableStream({start(controller) { controller.error(new Error('private stream detail')); }});
  const response = await reconcileProblemReportsResponse(request(stream),{env,
    reconcile:async () => { calls++; return result; }});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:'unavailable'});
  assert.equal(calls,0);
});

test('caller cancellation before and during an empty-body read prevents reconciliation', async () => {
  let calls = 0;
  const reconcile = async () => { calls++; return result; };
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  assert.equal((await reconcileProblemReportsResponse(request(undefined,{signal:alreadyAborted.signal}),{env,reconcile})).status,503);
  const controller = new AbortController();
  let cancelled = 0;
  const stream = new ReadableStream({cancel() { cancelled++; }},{highWaterMark:0});
  const pending = reconcileProblemReportsResponse(request(stream,{signal:controller.signal}),{env,reconcile});
  setTimeout(() => controller.abort(),20);
  const response = await pending;
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:'unavailable'});
  assert.equal(cancelled,1);
  assert.equal(calls,0);
});

test('body validation and reconciliation share the total response deadline', async () => {
  let signal;
  const started = performance.now();
  const stream = new ReadableStream({start(controller) { setTimeout(() => controller.close(),25); }});
  const response = await reconcileProblemReportsResponse(request(stream),{env,responseBudgetMs:60,bodyBudgetMs:200,
    reconcile:options => { signal = options.signal; return new Promise(() => {}); }});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:'unavailable'});
  assert.ok(performance.now()-started < 1500);
  assert.equal(signal.aborted,true,'total deadline cancels even a noncooperative reconciliation');
});

test('configuration, secret and method guards run before accessing a request body', async () => {
  let bodyAccesses = 0, calls = 0;
  const guardedRequest = (authorization,method = 'POST') => ({headers:new Headers({Authorization:authorization}),method,
    get body() { bodyAccesses++; throw Error('body must not be accessed'); }});
  const reconcile = async () => { calls++; return result; };
  assert.equal((await reconcileProblemReportsResponse(guardedRequest('Bearer wrong'),{env,reconcile})).status,401);
  assert.equal((await reconcileProblemReportsResponse(guardedRequest(headers.Authorization),{env:{...env,VERCEL_ENV:'preview'},reconcile})).status,503);
  assert.equal((await reconcileProblemReportsResponse(guardedRequest(headers.Authorization,'GET'),{env,reconcile})).status,400);
  assert.equal(bodyAccesses,0);
  assert.equal(calls,0);
});
