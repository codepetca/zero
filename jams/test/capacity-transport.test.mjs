import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityTransport} from './capacity-transport.mjs';
import {createAtomicGitHubJamStore} from '../git-store.mjs';

const branch=`zero-jams-capacity-${'a'.repeat(32)}`;
const root='https://api.github.com/repos/codepetca/zero/git/';
const digest='b'.repeat(40);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

test('requires a uniquely named isolated branch and an explicitly supplied transport',()=>{
  for(const name of ['main','zero-jams-registry','zero-jams-pilot-registry','zero-jams-capacity-short','zero-jams-capacity-'+('a'.repeat(32))+'/other'])assert.throws(()=>capacityTransport({branch:name,transport:()=>{}}));
  assert.throws(()=>capacityTransport({branch}));
});

test('rewrites only the production logical ref, validates response and preserves conflicts',async()=>{
  const calls=[];let status=200;
  const fetchImpl=capacityTransport({branch,transport:async(url,init)=>{calls.push([url,init]);return status===200?json({ref:`refs/heads/${branch}`,object:{type:'commit',sha:digest}}):json({},409);}});
  const result=await fetchImpl(`${root}ref/heads/zero-jams-registry`,{method:'GET'});
  assert.equal((await result.json()).ref,'refs/heads/zero-jams-registry');
  assert.equal(calls[0][0],`${root}ref/heads/${branch}`);
  status=409;
  const conflict=await fetchImpl(`${root}refs/heads/zero-jams-registry`,{method:'PATCH',body:JSON.stringify({sha:digest,force:false})});
  assert.equal(conflict.status,409);assert.equal(calls[1][0],`${root}refs/heads/${branch}`);assert.equal(calls[1][1].redirect,'error');
  const wrong=capacityTransport({branch,transport:async()=>json({ref:'refs/heads/zero-jams-registry'})});
  await assert.rejects(wrong(`${root}ref/heads/zero-jams-registry`));
});

test('blocks other repositories, branches, methods and unsafe updates before dispatch',async()=>{
  let calls=0;const guarded=capacityTransport({branch,transport:async()=>{calls++;return json({});}});
  const blocked=[
    ['https://example.com/'+root,{method:'GET'}],
    [root.replace('/zero/','/other/')+'blobs',{method:'POST'}],
    [root+'refs/heads/main',{method:'PATCH',body:'{}'}],
    [root+'refs/heads/zero-jams-pilot-registry',{method:'PATCH',body:'{}'}],
    [root+'refs/heads/zero-jams-registry?x=1',{method:'PATCH',body:'{}'}],
    [root+'refs/heads/zero-jams-registry',{method:'DELETE'}],
    [root+'refs/heads/zero-jams-registry',{method:'PATCH',body:JSON.stringify({sha:digest,force:true})}],
    [root+'refs/heads/zero-jams-registry',{method:'PATCH',body:JSON.stringify({sha:digest,force:false,extra:1})}],
    [root+'refs',{method:'POST',body:'{}'}],
  ];
  for(const [url,init] of blocked)await assert.rejects(guarded(url,init));
  assert.equal(calls,0);
});

test('dispatches only the validated method and canonical non-forced update',async()=>{
  const calls=[];const guarded=capacityTransport({branch,transport:async(url,init)=>{calls.push({url,init});return json({ref:`refs/heads/${branch}`,object:{type:'commit',sha:digest}});}});
  const changing={toString(){return JSON.stringify({sha:digest,force:false});}};
  await assert.rejects(guarded(`${root}refs/heads/zero-jams-registry`,{method:'PATCH',body:changing}));
  let count=0;
  const init={get method(){return ++count===1?'PATCH':'DELETE';},body:JSON.stringify({force:false,sha:digest})};
  await guarded(`${root}refs/heads/zero-jams-registry`,init);
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'PATCH');
  assert.deepEqual(JSON.parse(calls[0].init.body),{sha:digest,force:false});
  assert.equal(calls[0].url,`${root}refs/heads/${branch}`);
});

test('rejects redirected and oversized ref responses',async()=>{
  const redirected=capacityTransport({branch,transport:async()=>({redirected:true})});
  await assert.rejects(redirected(`${root}ref/heads/zero-jams-registry`));
  const oversized=capacityTransport({branch,transport:async()=>json({ref:`refs/heads/${branch}`,padding:'x'.repeat(17000)})});
  await assert.rejects(oversized(`${root}ref/heads/zero-jams-registry`));
});

test('actual atomic writer reaches only the isolated ref through the adapter',async()=>{
  const calls=[];
  const fetchImpl=capacityTransport({branch,transport:async(url,init)=>{calls.push([url,init.method]);return json({ref:`refs/heads/${branch}`,object:{type:'commit',sha:digest}});}});
  const store=createAtomicGitHubJamStore({token:'fixture-token-long',fetchImpl});
  // An invalid commit response ends the read, after exercising the real head path.
  await assert.rejects(store.snapshot());
  assert.deepEqual(calls.map(([url])=>url),[`${root}ref/heads/${branch}`,`${root}commits/${digest}`]);
  assert.throws(()=>createAtomicGitHubJamStore({token:'fixture-token-long',registryBranch:branch}));
});
