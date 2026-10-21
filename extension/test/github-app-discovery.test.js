'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGitHubAppRepositories}=require('../src/github-app/repositories');
const configuration={appId:41,slug:'zero-development',owner:'codepetca'};
const token='DISCOVERY_FAKE_TOKEN';
const ordinaryMarker={name:'My Zero App',templateVersion:'0.1.0',mainClass:'Main'};
function repo(id,name='project-'+id,extra={}) {
  return {id,name,full_name:'student/'+name,owner:{id:17,login:'student',type:'User'},html_url:'https://github.com/student/'+name,clone_url:'https://github.com/student/'+name+'.git',default_branch:'main',private:true,pushed_at:'2026-10-01T12:00:00Z',...extra};
}
function contents(marker=ordinaryMarker,path='zero.json') {
  const bytes=Buffer.from(typeof marker==='string'?marker:JSON.stringify(marker));
  return {type:'file',path,encoding:'base64',size:bytes.length,content:bytes.toString('base64')};
}
function response(data,status=200) {return {status,ok:status<400,json:async()=>data};}
function fixture({pages=[[repo(32)]],markers=new Map(),handler}={}) {
  let active=true;
  const session={accountId:'17',accessToken:token},ticket={session};
  const authentication={capture:async()=>ticket,assertCurrent:async value=>{if(!active||value!==ticket)throw Error('account changed');return session;},assertCurrentNow:value=>{if(!active||value!==ticket)throw Error('account changed');return session;}};
  const installed={id:51,app_id:41,app_slug:configuration.slug,account:{id:17,type:'User'},target_type:'User',repository_selection:'selected',permissions:{contents:'read'}};
  const f={authentication,ticket,installed,pages,markers,calls:[],user:{id:17,login:'student',type:'User'},installations:[installed],set active(value){active=value;}};
  f.fetchImpl=async(url,options)=>{
    const parsed=new URL(url);f.calls.push({url,options});
    assert.equal(parsed.origin,'https://api.github.com');assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer '+token);
    if(handler) {const custom=await handler(parsed,options,f);if(custom)return custom;}
    if(parsed.pathname==='/user')return response(f.user);
    if(parsed.pathname==='/user/installations')return response({installations:f.installations});
    if(parsed.pathname==='/user/installations/51/repositories')return response({repositories:(Number(parsed.searchParams.get('page'))<=f.pages.length?f.pages[Number(parsed.searchParams.get('page'))-1]:[])});
    if(parsed.pathname.includes('/contents/')) {
      const marker=f.markers.get(parsed.pathname);
      return marker?response(marker):response({},404);
    }
    throw Error('Unexpected fake request '+parsed.pathname);
  };
  f.api=createGitHubAppRepositories({authentication,configuration,fetchImpl:f.fetchImpl});
  return f;
}
function markerPath(repository,path='zero.json') {return '/repos/'+repository.full_name+'/contents/'+path;}

test('discovers selected private/public Zero repositories using contents read and sorted safe metadata',async()=>{
  for(const selection of ['selected','all']) {
    const older=repo(32,'older',{pushed_at:'2025-01-01T00:00:00Z',extra:'untrusted'}),newer=repo(33,'newer',{private:false,pushed_at:'2026-10-20T00:00:00Z'});
    const f=fixture({pages:[[older,newer]],markers:new Map([[markerPath(older),contents()],[markerPath(newer),contents()]])});
    f.installed.repository_selection=selection;
    const emitted=[];const result=await f.api.listZero({ticket:f.ticket,onRepository:item=>emitted.push(item)});
    assert.deepEqual(result.repositories.map(item=>item.id),[33,32]);assert.equal(result.truncated,false);assert.equal(emitted.length,2);
    assert.equal(result.repositories[1].private,true);assert.equal(result.repositories[1].extra,undefined);assert.ok(Object.isFrozen(result.repositories[0]));assert.ok(Object.isFrozen(result.repositories));
    assert.ok(!f.calls.some(call=>call.url.includes('/user/repos?')));
  }
});

test('repository pagination uses fixed paths, deduplicates identities and ignores untrusted next/download URLs',async()=>{
  const first=Array.from({length:100},(_,index)=>repo(index+1));
  const last=repo(101,'last',{pushed_at:'2026-10-20T00:00:00Z'});
  const file={...contents(),download_url:'https://evil.invalid/token',url:'https://evil.invalid/file'};
  const f=fixture({pages:[first,[last,first[0]]],markers:new Map([[markerPath(last),file]]),handler:async(url,options,state)=>url.pathname==='/user/installations'?response({installations:[{...state.installed,app_id:9},state.installed],next:'https://evil.invalid'}):undefined});
  const result=await f.api.listZero();assert.deepEqual(result.repositories.map(item=>item.id),[101]);
  assert.equal(f.calls.filter(call=>new URL(call.url).pathname.endsWith('/repositories')).length,2);
  assert.equal(f.calls.filter(call=>new URL(call.url).pathname===markerPath(first[0])).length,1);
});

test('only the pinned installation of the same numeric personal account grants discovery',async()=>{
  for(const change of [f=>{f.installed.app_id=42;},f=>{f.installed.app_slug='foreign';},f=>{f.installed.account.id=18;},f=>{f.installed.account.id='17';},f=>{f.installed.account.type='Organization';},f=>{f.installed.target_type='Organization';},f=>{f.installed.repository_selection='invalid';},f=>{f.installed.suspended_at='today';},f=>{f.installed.permissions={};}]) {
    const f=fixture();change(f);await assert.rejects(f.api.listZero(),error=>['installation-required','permission-required'].includes(error.code));
    assert.ok(!f.calls.some(call=>call.url.includes('/contents/')||call.url.includes('/51/repositories')));
  }
  for(const user of [{id:18,login:'student',type:'User'},{id:'17',login:'student',type:'User'},{id:17,login:'student',type:'Organization'}]) {
    const f=fixture();f.user=user;await assert.rejects(f.api.listZero(),error=>error.code==='account-mismatch');assert.equal(f.calls.length,1);
  }
});

test('foreign owners and malformed repository identities never become contents request paths',async()=>{
  const changes=[{owner:{id:18,login:'student',type:'User'}},{owner:{id:17,login:'student',type:'Organization'}},{owner:{id:'17',login:'student',type:'User'}},{name:'../bad'},{html_url:'https://evil.invalid/student/project-32'},{clone_url:'https://evil.invalid/repo.git'},{full_name:'evil/../../user'},{id:'32'},{private:'true'},{default_branch:''}];
  const f=fixture({pages:[[null,[],...changes.map(change=>repo(32,'project-32',change))]]});
  assert.deepEqual(await f.api.listZero(),{repositories:[],truncated:false});assert.ok(!f.calls.some(call=>call.url.includes('/contents/')));
});

test('malformed and conflicting repository pages fail with safe errors',async()=>{
  for(const invalid of [null,{},Array(101).fill(repo(32)),[repo(32),repo(32,'renamed')],[repo(32),repo(33,'project-32')]]) {
    const f=fixture({pages:[invalid]});await assert.rejects(f.api.listZero(),error=>error.code==='invalid-response'&&!error.message.includes(token));
  }
  const f=fixture({handler:async(url)=>url.pathname.endsWith('/repositories')?response({repositories:[],total_count:-1}):undefined});
  await assert.rejects(f.api.listZero(),error=>error.code==='invalid-response');
});

test('ordinary and legacy Zero markers are identified without reading arbitrary repository files',async()=>{
  const roots=[repo(1),repo(2),repo(3)];
  const markers=new Map([[markerPath(roots[0]),contents({...ordinaryMarker,tutorialProjectId:'greeting',repositoryRequired:true})],[markerPath(roots[1],'student-template/zero.json'),contents({...ordinaryMarker,mainClass:'school.Main'},'student-template/zero.json')],[markerPath(roots[2]),contents({description:'Not Zero'})]]);
  const f=fixture({pages:[roots],markers});const result=await f.api.listZero();assert.deepEqual(result.repositories.map(item=>item.id),[1,2]);
  assert.ok(f.calls.filter(call=>call.url.includes('/contents/')).every(call=>/\/contents\/(?:student-template\/)?zero\.json$/.test(call.url)));
});

test('missing, malformed, non-file, foreign-path and oversized markers are skipped safely',async()=>{
  const invalid=[contents('not JSON'),contents([]),contents({name:'x',mainClass:'Main'}),contents({...ordinaryMarker,mainClass:'../Main'}),contents({...ordinaryMarker,name:''}),contents({...ordinaryMarker,templateVersion:{}}),{...contents(),path:'../../zero.json'},{...contents(),type:'symlink'},{...contents(),encoding:'none'},{...contents(),size:65537},{...contents(),size:1},{...contents(),content:'%%%='},{...contents(),content:'A'.repeat(100000)}];
  const values=invalid.map((_,index)=>repo(index+1));
  const f=fixture({pages:[values],markers:new Map(values.map((item,index)=>[markerPath(item),invalid[index]]))});
  assert.deepEqual(await f.api.listZero(),{repositories:[],truncated:false});
});

test('caps repository metadata at ten pages and reports truncation without scanning later pages',async()=>{
  const pages=Array.from({length:11},(_,page)=>Array.from({length:100},(_,index)=>repo(page*100+index+1)));
  const f=fixture({pages});const result=await f.api.listZero();assert.equal(result.truncated,true);assert.equal(result.repositories.length,0);
  const pagesRead=f.calls.filter(call=>new URL(call.url).pathname.endsWith('/repositories'));
  assert.equal(pagesRead.length,10);assert.ok(!f.calls.some(call=>call.url.includes('/project-1001/')));
});

test('bounded response reading cancels an oversized body and never follows a raw download URL',async()=>{
  let cancelled=false;
  const f=fixture({handler:async(url)=>url.pathname.includes('/contents/')?{status:200,ok:true,body:{getReader:()=>({read:async()=>({done:false,value:Buffer.alloc(128*1024+1)}),cancel:async()=>{cancelled=true;}})}}:undefined});
  assert.deepEqual(await f.api.listZero(),{repositories:[],truncated:false});assert.equal(cancelled,true);
});

test('discovery bounds simultaneous marker requests to four and emits progressively',async()=>{
  const values=Array.from({length:7},(_,index)=>repo(index+1)),pending=[];let inFlight=0,maximum=0;
  const f=fixture({pages:[values],handler:async(url)=>{
    if(!url.pathname.includes('/contents/'))return;
    inFlight++;maximum=Math.max(maximum,inFlight);
    await new Promise(resolve=>pending.push(resolve));inFlight--;return response(contents());
  }});
  const emitted=[];const operation=f.api.listZero({onRepository:item=>emitted.push(item)});
  while(pending.length<4)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(maximum,4);pending.shift()();
  while(!emitted.length)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(emitted.length,1);
  while(emitted.length<values.length) {while(pending.length)pending.shift()();await new Promise(resolve=>setImmediate(resolve));}
  assert.equal((await operation).repositories.length,7);assert.equal(maximum,4);
});

test('cancelled discovery captures no credentials, stops requests, and emits nothing after dismissal',async()=>{
  const before=fixture(),abort=new AbortController();abort.abort();before.authentication.capture=async()=>{throw Error('must not capture');};
  await assert.rejects(before.api.listZero({signal:abort.signal}),error=>error.code==='cancelled');assert.equal(before.calls.length,0);
  const during=new AbortController(),emitted=[];
  const f=fixture({handler:async(url)=>{if(url.pathname.includes('/contents/')){during.abort();return response(contents());}}});
  await assert.rejects(f.api.listZero({signal:during.signal,onRepository:item=>emitted.push(item)}),error=>error.code==='cancelled');assert.equal(emitted.length,0);
});

test('account drift during marker body parsing is rechecked before progressive callbacks',async()=>{
  const emitted=[];
  const f=fixture({handler:async(url,options,state)=>url.pathname.includes('/contents/')?{status:200,ok:true,json:async()=>{state.active=false;return contents();}}:undefined});
  await assert.rejects(f.api.listZero({ticket:f.ticket,onRepository:item=>emitted.push(item)}),/account changed/);assert.equal(emitted.length,0);
  const g=fixture();g.active=false;g.authentication.capture=async()=>{throw Error('must not recapture');};
  await assert.rejects(g.api.listZero({ticket:g.ticket}),/account changed/);assert.equal(g.calls.length,0);
});

test('network and provider errors redact response details and retain cancellation guards',async()=>{
  const f=fixture({handler:async(url)=>{if(url.pathname.includes('/contents/'))throw Error(token);}});
  await assert.rejects(f.api.listZero(),error=>error.code==='network-error'&&!error.message.includes(token));
  const g=fixture({handler:async(url)=>url.pathname.includes('/contents/')?response({message:token},403):undefined});
  await assert.rejects(g.api.listZero(),error=>error.status===403&&!error.message.includes(token));
});
