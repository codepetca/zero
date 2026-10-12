import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryPage,catalogPath,appendDiscoveryPage} from '../lib/hub-client.mjs';
import {proxyHub} from '../lib/hub-proxy.mjs';
const origin='https://zero.codepet.ca';
const release=(id='ui1',version='1.0.0')=>({libraryId:id,version,status:'automatically-checked'});
test('discovery sends search and cursor to the server with cancellation; appends pages without duplicate cards',async()=>{
  const signal=new AbortController().signal;let called;
  const page=await discoveryPage({search:'  Far word ',cursor:'abc',signal,fetcher:async(path,options)=>{called=path;assert.equal(options.signal,signal);return Response.json({mode:'production',libraries:[release('uiz')],nextCursor:null});}});
  assert.equal(called,'/api/hub/catalog?q=Far+word&cursor=abc');assert.equal(page.libraries[0].libraryId,'uiz');
  const first={libraries:[release()],nextCursor:'abc'};
  assert.deepEqual(appendDiscoveryPage(first,page).libraries.map(r=>r.libraryId),['ui1','uiz']);
  assert.throws(()=>appendDiscoveryPage(first,{libraries:[release()],nextCursor:null}),/catalog changed/);
  assert.throws(()=>appendDiscoveryPage(first,{libraries:[release('ui2')],nextCursor:'abc'}),/did not advance/);
  assert.equal(catalogPath(' '),'/api/hub/catalog');
});
test('exact links fetch one immutable release plus separate capabilities, without scanning catalog',async()=>{
  const calls=[];
  const page=await discoveryPage({selection:{library:'ui1',version:'1.0.0'},fetcher:async path=>{calls.push(path);return Response.json(path==='/api/hub/session'?{mode:'production',capabilities:{uploads:false}}:release());}});
  assert.deepEqual(calls,['/api/hub/libraries/ui1?version=1.0.0','/api/hub/session']);assert.equal(page.capabilities.uploads,false);assert.equal(page.nextCursor,null);assert.equal(page.libraries[0].version,'1.0.0');
  await assert.rejects(discoveryPage({selection:{library:'ui1',version:'1.0.0'},fetcher:async path=>Response.json(path==='/api/hub/session'?{}:release('ui1','1.0.1'))}),/No newer release/);
});
test('invalid page or exact selection produces an explicit error; aborted requests propagate',async()=>{
  for(const data of [{libraries:[],nextCursor:'bad+'},{libraries:Array.from({length:21},(_,i)=>release('ui'+i)),nextCursor:null},{libraries:[release(),release()],nextCursor:null}])
    await assert.rejects(discoveryPage({fetcher:async()=>Response.json(data)}),/invalid/);
  await assert.rejects(discoveryPage({selection:{library:'ui1',version:'latest'},fetcher:()=>assert.fail()}),/exact checked release/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(discoveryPage({signal:controller.signal,fetcher:async(_,{signal})=>{signal.throwIfAborted();}}),error=>error.name==='AbortError');
});
test('fixed proxy shares bounded catalog and exact-version grammar before network access',async()=>{
  let calls=0;
  const options={destination:'https://hub.example',fetch:async target=>{calls++;assert.ok(['?q=hud','?version=1.0.0'].includes(target.search));return Response.json({libraries:[],nextCursor:null});}};
  for(const [path,parts]of [['catalog?q=+HUD+',['catalog']],['libraries/ui1?version=1.0.0',['libraries','ui1']]])assert.equal((await proxyHub(new Request(origin+'/api/hub/'+path),parts,options)).status,200);
  assert.equal(calls,2);
  for(const query of ['q=a&q=b','q=%00','history=0','cursor=bad','version=1.0.0','q='+ 'x'.repeat(201)])assert.equal((await proxyHub(new Request(origin+'/api/hub/catalog?'+query),['catalog'],options)).status,400);
  assert.equal(calls,2);
});
