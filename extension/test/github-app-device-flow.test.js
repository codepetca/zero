'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {deviceFlow, refreshTokens, requestJson} = require('../src/github-app/device-flow');
const pair = {access_token:'ghu_accessabcdefgh', refresh_token:'ghr_refreshabcdefgh', token_type:'bearer', scope:'', expires_in:28800, refresh_token_expires_in:15897600};
const code = {device_code:'device_code_abcdefgh', user_code:'ABCD-1234', verification_uri:'https://github.com/login/device', expires_in:900, interval:5};
const response = value => new Response(JSON.stringify(value), {status:200});
test('device flow respects pending and slow_down, fixed endpoints and expiry timestamps', async () => {
  let time = 100000; const waits = [], calls = []; const replies = [code, {error:'authorization_pending'}, {error:'slow_down', interval:10}, pair];
  const value = await deviceFlow({clientId:'Iv1234567890', now:() => time, sleep:async ms => { waits.push(ms); time += ms; },
    onCode:async value => assert.deepEqual(value, {userCode:'ABCD-1234', verificationUri:'https://github.com/login/device'}),
    fetchImpl:async (url,options) => { calls.push([url, options]); return response(replies.shift()); }});
  assert.deepEqual(waits, [5000,5000,10000]);
  assert.equal(value.expiresAt, time + 28800000);
  assert.equal(calls[0][0], 'https://github.com/login/device/code');
  assert.equal(new URLSearchParams(calls[0][1].body).get('scope'), 'offline_access');
  for (const [url,options] of calls) { assert.equal(options.redirect,'error'); assert(!url.includes('device_code')); assert(!options.body.includes('repo')); }
});
test('device cancellation stops polling and never returns pair', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(deviceFlow({clientId:'Iv1234567890', signal:controller.signal,
    onCode:async () => controller.abort(), fetchImpl:async () => { calls++; return response(code); }}), error => error.code === 'cancelled');
  assert.equal(calls,1);
});
test('device expiry, denial and unknown OAuth errors fail safely', async () => {
  for (const reply of [{error:'access_denied'}, {error:'expired_token'}, {error:'secret_ghu_sensitive'}]) {
    let time=0, calls=0;
    await assert.rejects(deviceFlow({clientId:'Iv1234567890', now:() => time, sleep:async ms => {time+=ms;}, onCode:async () => {},
      fetchImpl:async () => response(calls++ ? reply : code)}), error => !error.message.includes('sensitive'));
  }
  let time=0;
  await assert.rejects(deviceFlow({clientId:'Iv1234567890', now:() => time, sleep:async ms => {time+=ms;}, onCode:async () => {}, fetchImpl:async () => response({...code,expires_in:3})}), error => error.code === 'device-expired');
});
test('invalid device destination and non-expiring credentials are rejected', async () => {
  let displayed=false;
  await assert.rejects(deviceFlow({clientId:'Iv1234567890', onCode:async () => {displayed=true;}, fetchImpl:async () => response({...code,verification_uri:'https://evil.example'})}), /invalid device/);
  assert.equal(displayed,false);
  await assert.rejects(refreshTokens({clientId:'Iv1234567890',refreshToken:'ghr_refreshabcdefgh',fetchImpl:async () => response({...pair,expires_in:undefined})}), /required expiring/);
});
test('refresh is secretless, body-only, single attempt and sanitizes network/HTTP errors', async () => {
  let calls=0;
  const value=await refreshTokens({clientId:'Iv1234567890',refreshToken:'ghr_refreshabcdefgh',now:() => 100,
    fetchImpl:async (url,options) => {calls++; assert.equal(url,'https://github.com/login/oauth/access_token'); const body=new URLSearchParams(options.body); assert.equal(body.get('refresh_token'),'ghr_refreshabcdefgh'); assert.equal(body.has('client_secret'),false); return response(pair); }});
  assert.equal(calls,1); assert.equal(value.accessToken,pair.access_token);
  await assert.rejects(requestJson(async () => {throw Error('ghu_sensitive');},'https://api.github.com/user'), error => !error.message.includes('sensitive'));
  await assert.rejects(requestJson(async () => new Response('ghu_sensitive',{status:401}),'https://api.github.com/user'), error => error.code==='unauthorized' && !error.message.includes('sensitive'));
  await assert.rejects(requestJson(async () => new Response('a'.repeat(65537)),'https://api.github.com/user'), error => error.code==='invalid-response');
});
test('transport error codes cannot smuggle credential text through sanitized error handling',async()=>{
 await assert.rejects(requestJson(async()=>{throw Object.assign(Error('ghu_sensitive'),{code:'unauthorized'});},'https://api.github.com/user'),error=>!error.message.includes('ghu_sensitive'));
});
