'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createGameJamPublish}=require('../src/game-jam-publish');

const root='/projects/student-game',repository='https://github.com/student/game';
const event={id:'jam-17',title:'Moon Games',revision:'a'.repeat(64),entryRevision:'',submissionsOpen:true,
  submissionsCloseAt:'2026-12-01T12:00:00Z',rules:'Build a game.',eligibility:'Students.'};
const live={status:'live',sha:'b'.repeat(40),url:'https://student.github.io/game/',
  resume:{repositoryId:321,runId:456,repository,sha:'b'.repeat(40),destination:{url:'https://student.github.io/game/',cname:null}}};
const response=(body,status=200)=>Response.json(body,{status});
function fixture() {
  const saved=new Map(),requests=[];
  const state={account:'123',repository,repoId:321};
  const authentication={
    async capture(){return {session:{accountId:state.account,accessToken:'ghu_test'}};},
    async assertCurrent(ticket){return this.assertCurrentNow(ticket);},
    assertCurrentNow(ticket){assert.equal(ticket.session.accountId,state.account);return ticket.session;}
  };
  const globalState={get:key=>saved.get(key),keys:()=>[...saved.keys()],async update(key,value){
    if(value===undefined)saved.delete(key);else saved.set(key,value);
  }};
  const make=()=>createGameJamPublish({authentication,globalState,
    repositoryForRoot:async project=>{assert.equal(project,root);return state.repository;},
    repositories:{async readOwnedRepository(url){assert.equal(url,state.repository);return {html_url:url,id:state.repoId,owner:{id:Number(state.account)}};}},
    request:async(url,options)=>{
      assert.equal(new URL(url).origin,'https://zero.codepet.ca');
      assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer ghu_test');
      assert.equal(options.headers['X-Zero-Desktop'],'1');
      const request={method:options.method,url,body:options.body&&JSON.parse(options.body)};
      requests.push(request);
      if(options.method==='GET')return state.lookup?.() || response({configured:true,destination:event});
      assert.ok([...saved.values()].some(item=>item?.body?.operationId===request.body.operationId));
      return state.post?.() || response({configured:true,status:'submitted',revision:event.revision});
    }});
  return {make,state,saved,requests};
}

test('publication uses the verified live build and fresh repository destination',async()=>{
  const f=fixture(),jam=f.make();
  const route=await jam.resolve(root);
  assert.equal(route.rules,event.rules);
  assert.equal(route.repositoryId,'321');
  assert.equal(f.requests[0].url,'https://zero.codepet.ca/api/desktop/jams/project?repositoryId=321&includeDestinations=1');
  assert.ok(jam.hasKnownLink('123',repository));
  assert.deepEqual(await jam.submit(route,live),{status:'submitted'});
  const post=f.requests.at(-1);
  assert.equal(post.url,'https://zero.codepet.ca/api/desktop/jams/jam-17/submit');
  assert.deepEqual(post.body,{operationId:post.body.operationId,revision:event.revision,entryRevision:'',
    repositoryId:'321',pagesUrl:live.url,commit:live.sha,runId:'456'});
  assert.equal(await jam.recover(route),null);
});

test('older websites still route publishing and cannot substitute another jam for a saved one',async()=>{
  const f=fixture(),jam=f.make();
  f.state.lookup=()=>new URL(f.requests.at(-1).url).searchParams.has('includeDestinations')?
    response({configured:true,error:'Choose a GitHub project in Zero.'},400):
    response({configured:true,destination:event});
  assert.equal((await jam.resolve(root)).id,event.id);
  assert.equal(new URL(f.requests.at(-1).url).searchParams.size,1);
  assert.equal((await jam.resolve(root,{destinationId:event.id})).id,event.id);
  await assert.rejects(jam.resolve(root,{destinationId:'jam-43'}),{
    code:'ZERO_JAM_DESTINATION_UNAVAILABLE',message:/selected Game Jam/});
});

test('an uncertain result survives restart and retries the exact operation after closing',async()=>{
  const f=fixture(),jam=f.make(),route=await jam.resolve(root);
  f.state.post=()=>new Response('unavailable',{status:503});
  assert.equal((await jam.submit(route,live)).status,'pending');
  const first=f.requests.at(-1).body;
  const changed={...live,sha:'c'.repeat(40),resume:{...live.resume,sha:'c'.repeat(40),runId:550}};
  assert.equal((await jam.submit(route,changed)).status,'pending');
  assert.equal(f.requests.filter(item=>item.method==='POST').length,1);
  f.state.post=undefined;
  f.state.lookup=()=>{throw Error('Closed');};
  const fresh=f.make(),old=await fresh.resolve(root);
  assert.equal(old.pending,true);
  assert.equal(old.id,route.id);
  assert.equal((await fresh.recover(old)).status,'submitted');
  assert.deepEqual(f.requests.at(-1).body,first);
  assert.equal(await fresh.recover(old),null);
});

test('missing or disabled routes preserve ordinary publishing for unknown repos and protect known links',async()=>{
  const f=fixture(),jam=f.make();
  f.state.lookup=()=>new Response('Not found',{status:404});
  assert.equal((await jam.resolve(root)).id,undefined);
  f.state.lookup=()=>response({configured:false},503);
  assert.equal((await jam.resolve(root)).id,undefined);
  await jam.rememberJoined('123',repository,event.id);
  await assert.rejects(jam.resolve(root),/could not check/);
  f.state.lookup=()=>response({configured:true,destination:null,ambiguous:true});
  await assert.rejects(jam.resolve(root),/more than one/);
  f.state.lookup=()=>response({configured:true,destination:null});
  await assert.rejects(jam.resolve(root),/no longer linked/);
  assert.equal(jam.hasKnownLink('123',repository),false);
  assert.equal((await jam.resolve(root)).id,undefined);
});

test('account, project and live receipt mismatches do not send submissions',async()=>{
  const f=fixture(),jam=f.make(),route=await jam.resolve(root);
  for(const wrong of [{...live,status:'pending'},{...live,resume:{...live.resume,repositoryId:322}},
    {...live,resume:{...live.resume,repository:repository+'2'}},{...live,url:'https://unrelated.example/'},
    {...live,sha:'bad'},{...live,resume:{...live.resume,sha:'d'.repeat(40)}},
    {...live,resume:{...live.resume,sha:undefined}},{...live,resume:{...live.resume,destination:undefined}},
    {...live,resume:{...live.resume,destination:{url:'https://another.github.io/'}}}]) await assert.rejects(jam.submit(route,wrong),/Verify the live Pages build/);
  f.state.account='234';
  await assert.rejects(jam.submit(route,live),/account or repository changed/);
  f.state.account='123';f.state.repository=repository+'2';
  await assert.rejects(jam.submit(route,live),/account or repository changed/);
  assert.equal(await jam.recover(route),null);
  assert.equal(f.requests.filter(item=>item.method==='POST').length,0);
});

test('ambiguous destinations expose only the verified repository identity for a Pages-only choice',async()=>{
  const f=fixture(),jam=f.make();
  f.state.lookup=()=>response({configured:true,destination:null,ambiguous:true});
  await assert.rejects(jam.resolve(root),error=>{
    assert.equal(error.code,'ZERO_JAM_DESTINATION_AMBIGUOUS');
    assert.deepEqual(error.publishTarget,{root,account:'123',repository,repositoryId:'321'});
    assert.equal(Object.isFrozen(error.publishTarget),true);
    return true;
  });
  assert.equal(jam.hasKnownLink('123',repository),true);
  assert.equal(f.requests.filter(item=>item.method==='POST').length,0);
  f.state.lookup=()=>{throw Error('offline');};
  await assert.rejects(jam.resolve(root),error=>!error.code);
});

test('pending receipts are scoped to owning account and immutable repository ID',async()=>{
  const f=fixture(),jam=f.make(),route=await jam.resolve(root);
  f.state.post=()=>response({configured:true,error:'Retry'},503);
  await jam.submit(route,live);
  f.state.account='234';f.state.repoId=322;f.state.repository='https://github.com/school/other';
  f.state.lookup=()=>response({configured:true,destination:null});
  assert.equal((await f.make().resolve(root)).id,undefined);
  f.state.account='123';f.state.repoId=321;f.state.repository='https://github.com/student/renamed';
  const renamed=await f.make().resolve(root);
  assert.equal(renamed.pending,true);
  f.state.post=()=>response({configured:true,error:'Submissions are closed.'},409);
  assert.deepEqual(await jam.recover(renamed),{status:'rejected',message:'Submissions are closed.'});
  assert.equal(await jam.recover(renamed),null);
});

test('only unconfirmed routing outages on unknown repositories qualify for an explicit ordinary publish fallback',async()=>{
  const f=fixture(),jam=f.make();
  const unknown=error=>error.code==='ZERO_JAM_STATUS_UNKNOWN' && error.publishTarget.root===root &&
    error.publishTarget.repository===repository && error.publishTarget.repositoryId==='321' && error.publishTarget.account==='123';
  for(const lookup of [()=>{throw Error('offline');},()=>new Response('<html/>',{status:402}),
    ()=>response({configured:true,error:'Unavailable'},503),()=>new Response('invalid',{status:200})]) {
    f.state.lookup=lookup;
    await assert.rejects(jam.resolve(root),unknown);
  }
  for(const status of [401,403]){
    f.state.lookup=()=>new Response('unauthorized',{status});
    await assert.rejects(jam.resolve(root),error=>!error.code && /Reconnect/.test(error.message));
  }
  f.state.lookup=()=>response({configured:true,ambiguous:true,destination:null});
  await assert.rejects(jam.resolve(root),/more than one/);
  f.state.lookup=()=>{throw Error('offline');};
  await assert.rejects(jam.resolve(root),error=>!unknown(error));
  const other=fixture(),linked=other.make();
  await linked.rememberJoined('123',repository,event.id);
  other.state.lookup=()=>response({error:'Outage'},503);
  await assert.rejects(linked.resolve(root),error=>!unknown(error));
});

test('pending retries preserve the observed entry revision across replacement or withdrawal',async()=>{
  const f=fixture(),jam=f.make(),active='c'.repeat(64),withdrawn='d'.repeat(64);
  f.state.lookup=()=>response({configured:true,destination:{...event,entryRevision:active}});
  const route=await jam.resolve(root);
  f.state.post=()=>new Response('lost',{status:503});
  assert.equal((await jam.submit(route,live)).status,'pending');
  const first=f.requests.at(-1).body;
  assert.equal(first.entryRevision,active);
  assert.equal((await jam.submit({...route,entryRevision:withdrawn},live)).status,'pending');
  assert.equal(f.requests.filter(item=>item.method==='POST').length,1);
  const fresh=f.make();
  f.state.lookup=()=>response({configured:true,destination:{...event,entryRevision:withdrawn}});
  const retry=await fresh.resolve(root);
  assert.equal(retry.entryRevision,active);
  f.state.post=()=>response({configured:true,error:'Your entry changed. Choose Publish to Jam again to submit.'},409);
  assert.equal((await fresh.recover(retry)).status,'rejected');
  assert.deepEqual(f.requests.at(-1).body,first);
  assert.equal(await fresh.recover(retry),null);
  assert.equal((await fresh.resolve(root)).entryRevision,withdrawn);
  assert.equal(f.requests.filter(item=>item.method==='POST').length,2);
});

test('invalid entry revisions cannot authorize or restore a submission',async()=>{
  const f=fixture(),jam=f.make();
  for(const value of [null,undefined,'old',Array(64).fill('a'),'a'.repeat(64)+'\n']){
    f.state.lookup=()=>response({configured:true,destination:{...event,entryRevision:value}});
    await assert.rejects(jam.resolve(root),/could not check/);
  }
  f.state.lookup=undefined;
  const route=await jam.resolve(root);
  f.state.post=()=>new Response('lost',{status:503});
  await jam.submit(route,live);
  const key=[...f.saved.keys()].find(key=>key.startsWith('zero.gameJam.submission:'));
  delete f.saved.get(key).body.entryRevision;
  await assert.rejects(jam.recover(route),/could not be read/);
  assert.equal(f.requests.filter(item=>item.method==='POST').length,1);
});

test('multiple destinations expose validated choices and recheck only the explicit selected jam',async()=>{
  const f=fixture(),jam=f.make(),second={...event,id:'jam-18',title:'Second jam',projectRevision:'c'.repeat(64)};
  f.state.lookup=()=>response({configured:true,destination:null,ambiguous:true,destinations:[event,second]});
  await assert.rejects(jam.resolve(root),error=>{
    assert.deepEqual(error.destinations.map(item=>item.id),[event.id,second.id]);
    assert.equal(error.destinations[1].account,'123');
    assert.equal(Object.isFrozen(error.destinations[1]),true);
    return error.code==='ZERO_JAM_DESTINATION_AMBIGUOUS';
  });
  f.state.lookup=()=>response({configured:true,destination:second,destinations:[event,second]});
  const selected=await jam.resolve(root,{destinationId:second.id});
  assert.equal(selected.id,second.id);
  assert.equal(selected.projectRevision,second.projectRevision);
  assert.equal(new URL(f.requests.at(-1).url).searchParams.get('jamId'),second.id);
  f.state.lookup=()=>response({configured:true,destination:event});
  await assert.rejects(jam.resolve(root,{destinationId:second.id}),/selected Game Jam/);
  f.state.lookup=()=>response({configured:true,destination:null,ambiguous:true,destinations:[event,{...second,entryRevision:'invalid'}]});
  await assert.rejects(jam.resolve(root),/could not check/);
  f.state.lookup=()=>response({configured:true,destination:null,ambiguous:true,destinations:[event,event]});
  await assert.rejects(jam.resolve(root),/could not check/);
});

test('selection cannot retarget a pending submission or bypass an aborted request',async()=>{
  const f=fixture(),jam=f.make(),route=await jam.resolve(root);
  f.state.post=()=>response({configured:true,error:'Unavailable'},503);
  await jam.submit(route,live);
  const count=f.requests.length;
  await assert.rejects(jam.resolve(root,{destinationId:'jam-18'}),/previous submission/);
  assert.equal(f.requests.length,count);
  const retry=await jam.resolve(root,{destinationId:event.id});
  assert.equal(retry.pending,true);
  await assert.rejects(jam.resolve(root,{destinationId:event.id,signal:AbortSignal.abort()}));
  assert.equal(f.requests.length,count);
});
