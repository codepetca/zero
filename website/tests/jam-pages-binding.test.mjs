import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamPagesBindingReader} from '../lib/jam-pages-binding.mjs';

// Synthetic transport only: these responses do not establish GitHub's actual
// Pages metadata shape, anonymous/authenticated capability, quota or capacity.
const url = 'https://github.com/student/project';
const api = 'https://api.github.com/repos/student/project';
const play = 'https://student.github.io/project/';
const saved = {url,id:'123',ownerId:'7'};
const repo = (changes={}) => ({id:123,name:'project',full_name:'student/project',html_url:url,
  private:false,visibility:'public',owner:{id:7,login:'student',type:'User'},...changes});
const site = (changes={}) => ({html_url:play,public:true,status:'built',...changes});
const response = (data, options={}) => new Response(JSON.stringify(data),{status:200,
  headers:{'content-type':'application/json'},...options});
const identity = (changes={}) => ({repositoryId:'123',ownerId:'7',repositoryUrl:url,...changes});
const deferred = () => {let resolve; const promise = new Promise(done => {resolve=done;}); return {promise,resolve};};
const transport = (pages=()=>response(site()), source=()=>response(repo())) => async (input,init) =>
  input === `${api}/pages` ? pages(input,init) : source(input,init);
const unverified = (value,reason) => assert.deepEqual(value,{status:'unverified',reason});

test('fresh default composition makes exactly source, Pages, source fixed GETs and captures no ambient credentials',async () => {
  const calls=[];
  const read=createJamPagesBindingReader({fetchImpl:async (input,init) => {
    calls.push({input,init}); return response(input.endsWith('/pages') ? site() : repo());
  }});
  const first=await read(saved,play), second=await read(saved,play);
  assert.deepEqual(first,{status:'verified',pagesUrl:play,repositoryId:'123',ownerId:'7'});
  assert.equal(Object.isFrozen(first),true); assert.notEqual(first,second);
  assert.deepEqual(calls.map(call=>call.input),[api,`${api}/pages`,api,api,`${api}/pages`,api]);
  for (const {init} of calls) {
    assert.equal(init.method,'GET'); assert.equal(init.credentials,'omit');
    assert.equal(init.redirect,'manual'); assert.equal(init.cache,'no-store');
    assert.equal(init.referrerPolicy,'no-referrer'); assert.equal(init.body,undefined);
    assert.deepEqual(Object.keys(init.headers).sort(),['Accept','User-Agent','X-GitHub-Api-Version']);
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('saved ID/owner and before/after identity must match; namespace replacement never verifies',async () => {
  const sequences=[ [identity({repositoryId:'202'})], [identity({ownerId:'8'})],
    [identity(),identity({repositoryId:'202'})], [identity(),identity({ownerId:'8'})],
    [identity(),identity({repositoryUrl:'https://github.com/student/replacement'})] ];
  for (const sequence of sequences) {
    const read=createJamPagesBindingReader({readDestinationBinding:async()=>sequence.shift(),fetchImpl:transport()});
    unverified(await read(saved,play),'identity-mismatch');
  }
  const sequence=[identity(),identity({ownerId:'8'})];
  unverified(await createJamPagesBindingReader({readDestinationBinding:async()=>sequence.shift(),fetchImpl:transport()})({url,id:123},play),'identity-mismatch');
});

test('repository private, rename, deletion and redirected source observations do not reach Pages',async () => {
  for (const make of [()=>response(repo({private:true})),()=>response(repo(),{status:404}),
    ()=>response(repo(),{status:301}),()=>response(repo({name:'renamed',full_name:'student/renamed'}))]) {
    let pagesCalls=0;
    const read=createJamPagesBindingReader({fetchImpl:transport(()=>{pagesCalls++;return response(site());},make)});
    unverified(await read(saved,play),'unavailable'); assert.equal(pagesCalls,0);
  }
});

test('source ABA is deliberately not detectable between fresh observations; receipt is not an atomic guarantee',async () => {
  let current=123, sources=0;
  const read=createJamPagesBindingReader({fetchImpl:transport(()=>{
    // A namespace can point at B while the site observation occurs, then return
    // to A before the second source read. Bracketing alone cannot detect this.
    current=202;
    const observed=response(site());
    current=123;
    return observed;
  },()=>{sources++;return response(repo({id:current}));})});
  assert.equal((await read(saved,play)).status,'verified');
  assert.equal(sources,2);
});

test('exact metadata html_url, public true and built state are required',async () => {
  for (const data of [null,[],{},site({html_url:play.slice(0,-1)}),site({html_url:'https://other.github.io/project/'}),
    site({html_url:`${play}?next=evil`}),site({public:false}),site({public:undefined}),site({public:'true'}),
    site({status:'building'}),site({status:'errored'}),site({status:undefined})]) {
    unverified(await createJamPagesBindingReader({fetchImpl:transport(()=>response(data))})(saved,play),'invalid');
  }
});

test('verified exact custom domain is metadata-only and never fetched; casing must match expected URL',async () => {
  const custom='https://play.example.edu/app/'; const calls=[];
  const read=createJamPagesBindingReader({fetchImpl:async (input)=> {
    calls.push(input);return response(input.endsWith('/pages')?site({html_url:custom}):repo());
  }});
  assert.equal((await read(saved,custom)).pagesUrl,custom);
  assert.deepEqual(calls,[api,`${api}/pages`,api]);
  unverified(await read(saved,'https://play.example.edu/App/'),'invalid');
});

test('provider custom-domain root may omit its slash without relaxing path or URL safety',async()=>{
  const root='https://developer.github.com/';
  for(const html_url of [root,root.slice(0,-1)]) {
    const calls=[];
    const read=createJamPagesBindingReader({fetchImpl:async input=>{
      calls.push(input);return response(input.endsWith('/pages')?site({html_url}):repo());
    }});
    assert.equal((await read(saved,root)).pagesUrl,root);
    assert.deepEqual(calls,[api,`${api}/pages`,api],'The destination itself is never fetched or followed.');
  }
  for(const html_url of ['https://user:secret@developer.github.com','https://developer.github.com?',
    'https://developer.github.com?next=elsewhere','https://developer.github.com#',
    'https://developer.github.com#fragment','https://developer.github.com:443',
    'https://DEVELOPER.github.com','https://developer.github.com\\evil',
    'https://developer.github.com/%2e/','https://developer.github.com/a/../',
    'https://developer.github.com/Path/','https://other.example']) {
    unverified(await createJamPagesBindingReader({fetchImpl:transport(()=>response(site({html_url})))})(saved,root),'invalid');
  }
  const path='https://developer.github.com/Project/';
  for(const html_url of [path.slice(0,-1),'https://developer.github.com/project/'])
    unverified(await createJamPagesBindingReader({fetchImpl:transport(()=>response(site({html_url})))})(saved,path),'invalid');
});

test('404 is unavailable metadata, never evidence of absent Pages; rate limit and outage stay distinct',async () => {
  for (const [status,headers,reason] of [[404,{},'not-found'],[429,{},'rate-limited'],
    [403,{'x-ratelimit-remaining':'0'},'rate-limited'],[403,{'retry-after':'60'},'rate-limited'],
    [403,{},'unavailable'],[500,{},'unavailable'],[503,{},'unavailable']]) {
    let calls=0;
    const read=createJamPagesBindingReader({fetchImpl:transport(()=>{calls++;return response({secret:'never reflected'},{status,headers});})});
    unverified(await read(saved,play),reason); assert.equal(calls,1,'no retry or anonymous fallback');
  }
});

test('redirects and unexpected effective URLs reject without following location',async () => {
  for (const make of [()=>response(site(),{status:301,headers:{location:'http://127.0.0.1/private'}}),
    ()=>{const r=response(site());Object.defineProperty(r,'redirected',{value:true});return r;},
    ()=>{const r=response(site());Object.defineProperty(r,'url',{value:'https://api.github.com/repos/other/project/pages'});return r;}]) {
    const read=createJamPagesBindingReader({fetchImpl:transport(make)});
    unverified(await read(saved,play),'unavailable');
  }
});

test('unsafe and ambiguous source/expected URLs never reach transport or injected source reader',async () => {
  let calls=0;
  const read=createJamPagesBindingReader({fetchImpl:async()=>{calls++;throw Error('unexpected');},
    readDestinationBinding:async()=>{calls++;return identity();}});
  for (const source of [null,'http://github.com/student/project','https://github.com:443/student/project',
    'https://github.com.evil/student/project','https://github.com@127.0.0.1/student/project',
    'https://github.com/student/%70roject','https://github.com/student/..',`${url}/`,`${url}?x=1`,
    'https://github.com/student\n/project','https://github.com/student/project\\x']) {
    unverified(await read({...saved,url:source},play),'invalid');
  }
  for (const expected of [undefined,'http://student.github.io/project/','https://user:secret@play.example/app/',
    'https://play.example:443/app/','https://play.example/a/../app/','https://play.example/%2e/app/',
    `${play}?`,`${play}#`,`${play}?x=1`,`${play}#fragment`,'https://PLAY.example/app/','https://play.example\\evil/app/']) {
    unverified(await read(saved,expected),'invalid');
  }
  assert.equal(calls,0);
});

test('invalid options and numeric IDs fail closed before provider work',async () => {
  for (const options of [null,[],{timeoutMs:0},{timeoutMs:8001},{maxConcurrent:0},{maxConcurrent:5},
    {fetchImpl:7},{readDestinationBinding:7},{headers:{Authorization:'secret'}}]) {
    assert.throws(()=>createJamPagesBindingReader(options),/Pages destination is unverified/);
  }
  let calls=0;
  const read=createJamPagesBindingReader({fetchImpl:async()=>{calls++;throw Error('unexpected');}});
  for (const bad of [null,[],{}, {...saved,id:0},{...saved,id:'0123'},{...saved,id:2**53},{...saved,ownerId:'secret'}]) {
    unverified(await read(bad,play),'invalid');
  }
  for (const options of [null,[],{signal:{}},{headers:{}},{timeoutMs:50}]) unverified(await read(saved,play,options),'invalid');
  unverified(await read(saved,play,{signal:AbortSignal.abort(Error('secret'))}),'canceled');
  assert.equal(calls,0);
});

test('malformed MIME, length, JSON, UTF-8 and missing/oversized body remain unverified',async () => {
  const variants=[()=>response(site(),{headers:{'content-type':'text/html'}}),
    ()=>response(site(),{headers:{'content-type':'application/jsonp'}}),
    ()=>response(site(),{headers:{'content-type':'application/json','content-length':'65537'}}),
    ()=>response(site(),{headers:{'content-type':'application/json','content-length':'1e3'}}),
    ()=>new Response('{private',{headers:{'content-type':'application/json'}}),
    ()=>new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}}),
    ()=>new Response(null,{headers:{'content-type':'application/json'}}),
    ()=>new Response(' '.repeat(65537),{headers:{'content-type':'application/json','content-length':'1'}})];
  for (const make of variants) unverified(await createJamPagesBindingReader({fetchImpl:transport(make)})(saved,play),'invalid');
});

test('streamed byte count and chunk count are bounded and body is canceled',async () => {
  let canceled=false;
  const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array([32]));},cancel(){canceled=true;}});
  unverified(await createJamPagesBindingReader({fetchImpl:transport(()=>new Response(body,
    {headers:{'content-type':'application/json','content-length':'1'}}))})(saved,play),'invalid');
  assert.equal(canceled,true);
});

test('injected transport errors and late failures cannot disclose secrets or become authorization',async () => {
  for (const options of [{readDestinationBinding:async()=>{throw Error('secret-source-token');},fetchImpl:transport()},
    {fetchImpl:transport(()=>{throw Error('secret-pages-token');})},
    {fetchImpl:transport(()=>{throw Object.defineProperty({},'reason',{get(){throw Error('secret getter');}});})},
    {fetchImpl:transport(()=>new Response(new ReadableStream({start(c){c.error(Error('secret body'));}}),
      {headers:{'content-type':'application/json'}}))}]) {
    unverified(await createJamPagesBindingReader(options)(saved,play),'unavailable');
  }
});

test('total timeout bounds injected source reader even when it ignores cancellation',async () => {
  const read=createJamPagesBindingReader({timeoutMs:20,readDestinationBinding:async()=>new Promise(()=>{}),fetchImpl:transport()});
  unverified(await read(saved,play),'timeout');
});

test('timeout bounds fetch ignoring cancellation and discards its late response',async () => {
  const pending=deferred(); let observed,canceled=false;
  const read=createJamPagesBindingReader({timeoutMs:20,fetchImpl:transport((_input,init)=>{observed=init.signal;return pending.promise;})});
  unverified(await read(saved,play),'timeout'); assert.equal(observed.aborted,true);
  pending.resolve(new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{'content-type':'application/json'}}));
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(canceled,true);
});

test('stalled body and stalled cancellation cannot outlive total timeout',async () => {
  let canceled=0;
  const body={getReader:()=>({read:()=>new Promise(()=>{}),cancel(){canceled++;return new Promise(()=>{});},releaseLock(){}})};
  const read=createJamPagesBindingReader({timeoutMs:20,fetchImpl:transport(()=>({status:200,headers:new Headers({'content-type':'application/json'}),body}))});
  unverified(await read(saved,play),'timeout'); assert.ok(canceled>=1);
});

test('caller cancellation releases bounded admission while uncancelled call succeeds; no queue or retry',async () => {
  const started=deferred(),pending=deferred(),controller=new AbortController(); let calls=0;
  const read=createJamPagesBindingReader({maxConcurrent:1,fetchImpl:transport(()=>{
    if(++calls===1){started.resolve();return pending.promise;}return response(site());
  })});
  const first=read(saved,play,{signal:controller.signal}); await started.promise;
  unverified(await read(saved,play),'busy'); assert.equal(calls,1);
  controller.abort(Error('secret cancel reason'));unverified(await first,'canceled');
  assert.equal((await read(saved,play)).status,'verified'); assert.equal(calls,2);
  pending.resolve(Promise.reject(Error('secret late failure')));
  await new Promise(resolve=>setImmediate(resolve));
});

test('cancellation after metadata cannot authorize and saved caller input is pinned across awaits',async () => {
  const controller=new AbortController();let sourceCalls=0;
  const read=createJamPagesBindingReader({fetchImpl:transport(),readDestinationBinding:async()=>{
    if(++sourceCalls===2)controller.abort(Error('secret'));return identity();
  }});
  unverified(await read(saved,play,{signal:controller.signal}),'canceled');
  const mutable={...saved};
  const pinned=createJamPagesBindingReader({fetchImpl:transport(()=>{mutable.id='202';mutable.ownerId='8';mutable.url='https://github.com/evil/replaced';return response(site());})});
  assert.equal((await pinned(mutable,play)).repositoryId,'123');
});
