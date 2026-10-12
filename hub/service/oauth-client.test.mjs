import test from 'node:test';
import assert from 'node:assert/strict';
import {githubJson} from './oauth-client.mjs';

const url='https://api.github.com/user';
const fail=error=>error.status===502 && error.message==='GitHub sign-in failed';
const read=(response,options={})=>githubJson(async()=>response,url,{}, {maxBytes:32,...options});

test('provider JSON accepts exact bounded bytes and sets redirect and deadline controls',async()=>{
  const bytes=JSON.stringify({id:101,login:'alice'});
  assert.deepEqual(await githubJson(async(target,options)=>{
    assert.equal(target,url);assert.equal(options.redirect,'error');assert.equal(options.signal.aborted,false);
    return new Response(bytes,{headers:{'Content-Length':String(Buffer.byteLength(bytes))}});
  },url,{headers:{Accept:'application/json'}},{maxBytes:Buffer.byteLength(bytes)}),{id:101,login:'alice'});
});

test('declared oversized bodies are cancelled before reading',async()=>{
  let cancelled=false,pulled=false;
  const response=new Response(new ReadableStream({pull(){pulled=true;},cancel(){cancelled=true;}},{highWaterMark:0}),{headers:{'Content-Length':'33'}});
  await assert.rejects(read(response),fail);
  assert.equal(cancelled,true);assert.equal(pulled,false);
});

test('chunked oversized bodies are cancelled even without a declared length',async()=>{
  let cancelled=false,index=0;
  const chunks=[new Uint8Array(16),new Uint8Array(17)];
  const response=new Response(new ReadableStream({pull(controller){controller.enqueue(chunks[index++]);},cancel(){cancelled=true;}},{highWaterMark:0}));
  await assert.rejects(read(response),fail);
  assert.equal(index,2);assert.equal(cancelled,true);
});

test('invalid provider status, redirects, JSON, error objects and shape expose only a fixed error',async()=>{
  const redirected=Response.json({id:1});Object.defineProperty(redirected,'redirected',{value:true});
  for(const response of [new Response('private detail',{status:500}),new Response('',{status:302}),redirected,new Response('invalid JSON'),new Response(Uint8Array.from([0xff])),Response.json(null),Response.json([]),Response.json({error:'private detail'}),new Response('{}',{headers:{'Content-Length':'invalid'}})])await assert.rejects(read(response),fail);
});

test('provider error status cancels an unread body',async()=>{
  let cancelled=false;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}},{highWaterMark:0}),{status:500});
  await assert.rejects(read(response),fail);assert.equal(cancelled,true);
});

test('deadline includes body reads even when the injected stream ignores abort',async()=>{
  let signal,cancelled=false;
  const started=Date.now();
  await assert.rejects(githubJson(async(_target,options)=>{
    signal=options.signal;
    return new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}},{highWaterMark:0}));
  },url,{}, {maxBytes:32,timeoutMs:30}),fail);
  assert.equal(signal.aborted,true);assert.equal(cancelled,true);
  assert.ok(Date.now()-started<1000,'Body deadline must return without waiting for a stalled stream');
});

test('deadline includes a provider that never returns response headers',async()=>{
  let signal;
  await assert.rejects(githubJson(async(_target,options)=>{signal=options.signal;return new Promise(()=>{});},url,{}, {maxBytes:32,timeoutMs:30}),fail);
  assert.equal(signal.aborted,true);
});
