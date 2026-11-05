import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamPagesAccessBinding} from '../lib/jam-pages-access-binding.mjs';

const saved = {url:'https://github.com/Student/Game',id:'42',ownerId:'7'};
const url = 'https://student.github.io/Game/';
const result = {status:'observed',htmlUrl:url,public:true,pagesStatus:'built',evidence:'pages-built'};
const make = (observe = async () => result, options = {}) => createJamPagesAccessBinding({observe,appId:9,createAppJwt:async () => 'synthetic-jwt',...options});

test('adapts built observation and captures stable identities as service receipt',async () => {
  let observedInput, observedOptions, producerOptions;
  const read=make(async (input,options) => {observedInput=input; observedOptions=options; return result;}, {createAppJwt:async options => {producerOptions=options; return 'synthetic-jwt';}});
  const receipt=await read(saved,url);
  assert.deepEqual(receipt,{status:'verified',pagesUrl:url,repositoryId:'42',ownerId:'7'});
  assert.deepEqual({...observedInput},{owner:'Student',repo:'Game',repositoryId:42,ownerId:7,appId:9,appJwt:'synthetic-jwt',expectedPagesUrl:url});
  assert.equal(producerOptions.signal,observedOptions.signal);
  assert.ok(Object.isFrozen(receipt));
  assert.doesNotMatch(JSON.stringify(receipt),/synthetic/);
});
test('accepts only Pages-specific success for a null workflow status',async () => {
  const read=make(async () => ({...result,pagesStatus:null,evidence:'pages-deployment-succeed'}));
  assert.equal((await read(saved,url)).status,'verified');
});
for (const [name,observation] of [
  ['unavailable',{status:'unavailable'}], ['private',{...result,public:false}], ['wrong URL',{...result,htmlUrl:'https://evil.example/'}],
  ['missing evidence',{...result,evidence:undefined}], ['generic success',{...result,pagesStatus:null,evidence:'success'}],
  ['mismatched evidence',{...result,pagesStatus:'built',evidence:'pages-deployment-succeed'}],
  ['building',{...result,pagesStatus:'building'}], ['malformed',null]
]) test(`fails closed for ${name}`,async () => {
  assert.deepEqual(await make(async () => observation)(saved,url),{status:'unverified',reason:'unavailable'});
});
test('legacy missing stable IDs are unsupported and do not invoke credentials',async () => {
  let invoked=0; const read=make(undefined,{createAppJwt:async () => {invoked++; return 'jwt';}});
  for (const item of [{...saved,ownerId:undefined},{...saved,id:undefined},{...saved,id:'9007199254740992'}])
    assert.deepEqual(await read(item,url),{status:'unverified',reason:'unsupported'});
  assert.equal(invoked,0);
});
test('rejects unsafe input without invoking credentials',async () => {
  let invoked=0; const read=make(undefined,{createAppJwt:async () => {invoked++; return 'jwt';}});
  for (const [repo,target] of [[{...saved,url:'https://evil.example/a/b'},url],[{...saved,url:'https://github.com/Student/../x'},url],[saved,'https://user:pass@example.com/']])
    assert.deepEqual(await read(repo,target),{status:'unverified',reason:'invalid'});
  assert.equal(invoked,0);
});
test('producer and observer errors and secrets never appear in receipt',async () => {
  const secret='synthetic-jwt';
  const producer=make(undefined,{createAppJwt:async () => {throw new Error(secret);}});
  const observer=make(async () => {throw new Error(secret);});
  for (const read of [producer,observer]) assert.deepEqual(await read(saved,url),{status:'unverified',reason:'unavailable'});
});
test('captures input before asynchronous producer and rejects cancellation',async () => {
  let release; const ready=new Promise(resolve => {release=resolve;}); let received;
  const read=make(async input => {received=input; return result;},{createAppJwt:async () => {await ready; return 'jwt';}});
  const copy={...saved}; const pending=read(copy,url); copy.id='99'; copy.ownerId='88'; release();
  assert.equal((await pending).repositoryId,'42'); assert.equal(received.ownerId,7);
  const controller=new AbortController(); controller.abort();
  assert.deepEqual(await read(saved,url,{signal:controller.signal}),{status:'unverified',reason:'canceled'});
});
test('bounds a stalled producer and rejects concurrent calls',async () => {
  const read=make(undefined,{timeoutMs:15,maxConcurrent:1,createAppJwt:() => new Promise(() => {})});
  const pending=read(saved,url);
  assert.deepEqual(await read(saved,url),{status:'unverified',reason:'busy'});
  assert.deepEqual(await pending,{status:'unverified',reason:'timeout'});
});
