import test from 'node:test';
import assert from 'node:assert/strict';
import {runCapacityTest} from './capacity-driver.mjs';
import {fakeCapacityProvider} from './capacity-fake-provider.mjs';
const token='synthetic-test-token';
const runId='a'.repeat(32);
const response=status=>new Response('{}',{status,headers:{'content-type':'application/json'}});

test('full isolated synthetic run bootstraps guarded root and verifies 30 distinct participants', {timeout:120000},async()=>{
  const provider=fakeCapacityProvider();
  const result=await runCapacityTest({token,transport:provider.transport,runId});
  assert.equal(result.status,'verified',JSON.stringify(result));
  assert.deepEqual(result.verification,{joins:30,submissions:30,registrations:30,entries:30,operations:62});
  assert.equal(provider.refs.size,1);assert.ok(provider.refs.has(`zero-jams-capacity-${runId}`));
  const finalFiles=provider.filesAtHead(`zero-jams-capacity-${runId}`);
  assert.equal(finalFiles.get('website/vercel.json')?.toString(),'{"git":{"deploymentEnabled":false}}\n');
  assert.ok(provider.calls.filter(x=>x.method==='PATCH').every(x=>x.path===`refs/heads/zero-jams-capacity-${runId}`&&x.data.force===false));
  const ref=provider.calls.find(x=>x.method==='POST'&&x.path==='refs');assert.equal(ref.data.ref,`refs/heads/zero-jams-capacity-${runId}`);
  const firstBlob=provider.calls.find(x=>x.method==='POST'&&x.path==='blobs');
  assert.equal(Buffer.from(firstBlob.data.content,'base64').toString(),'{"git":{"deploymentEnabled":false}}\n');
  const firstTree=provider.calls.find(x=>x.method==='POST'&&x.path==='trees');
  assert.deepEqual(firstTree.data.tree.map(({path,mode,type})=>({path,mode,type})),[{path:'website/vercel.json',mode:'100644',type:'blob'}]);
  assert.ok(provider.calls.findIndex(x=>x.method==='GET'&&x.path.startsWith('commits/'))<provider.calls.indexOf(ref));
});

test('fake provider rejects the GitHub-invalid empty tree creation',async()=>{
  const provider=fakeCapacityProvider();const result=await provider.transport('https://api.github.com/repos/codepetca/zero/git/trees',{method:'POST',body:JSON.stringify({tree:[]})});
  assert.equal(result.status,422);
});

test('existing branch or throttle stops without changing a ref',async()=>{
  const existing=fakeCapacityProvider();existing.refs.set(`zero-jams-capacity-${runId}`,'f'.repeat(40));
  const first=await runCapacityTest({token,transport:existing.transport,runId});
  assert.equal(first.status,'incomplete');assert.equal(existing.calls.length,1);
  const limited=fakeCapacityProvider();limited.before=()=>response(429);
  const second=await runCapacityTest({token,transport:limited.transport,runId});
  assert.equal(second.status,'incomplete');assert.equal(second.stopReason,'provider-throttle');assert.equal(limited.calls.length,1);assert.equal(limited.refs.size,0);
});

test('deadline during a dispatched ref update reports unresolved and stops new writes',async()=>{
  const provider=fakeCapacityProvider();let release;const wait=new Promise(resolve=>{release=resolve;});let entered;
  const called=new Promise(resolve=>{entered=resolve;});
  provider.before=async call=>{if(call.method==='PATCH'){entered();await wait;return response(503);}};
  const pending=runCapacityTest({token,transport:provider.transport,runId,deadlineMs:1000});
  await called;await new Promise(resolve=>setTimeout(resolve,1100));release();
  const result=await pending;
  assert.equal(result.status,'incomplete');assert.equal(result.stopReason,'deadline');assert.equal(result.unresolved,true);assert.equal(result.verification,null);
  assert.equal(provider.calls.filter(x=>x.method==='PATCH').length,1);
});

test('a response body that never cancels cannot hang bootstrap or permit writes',async()=>{
  const calls=[];
  const transport=async(url,init)=>{calls.push([url,init.method]);return new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}}),{status:404,headers:{'content-type':'application/json'}});};
  const result=await runCapacityTest({token,transport,runId,deadlineMs:30});
  assert.equal(result.status,'incomplete');assert.equal(result.stopReason,'deadline');assert.equal(result.unresolved,true);
  assert.deepEqual(calls.map(([,method])=>method),['GET']);
});

test('a noncooperative transport cannot make the driver wait indefinitely',async()=>{
  const provider=fakeCapacityProvider();
  provider.before=call=>call.method==='POST'&&call.path==='refs'?new Promise(()=>{}):null;
  const result=await runCapacityTest({token,transport:provider.transport,runId,deadlineMs:30});
  assert.equal(result.status,'incomplete');assert.equal(result.stopReason,'deadline');
  assert.equal(result.unresolved,true);assert.equal(result.activeRequests,1);assert.equal(result.verification,null);
});

test('unexpected bootstrap tree and exhausted budgets fail closed',async()=>{
  const provider=fakeCapacityProvider();
  provider.before=call=>call.method==='POST'&&call.path==='trees'?new Response(JSON.stringify({sha:'a'.repeat(40)}),{status:201,headers:{'content-type':'application/json'}}):null;
  const invalid=await runCapacityTest({token,transport:provider.transport,runId});
  assert.equal(invalid.status,'incomplete');assert.equal(provider.refs.size,0);
  const budget=fakeCapacityProvider(),limited=await runCapacityTest({token,transport:budget.transport,runId,maxRequests:1});
  assert.equal(limited.stopReason,'request-budget');assert.equal(budget.refs.size,0);
});

test('a malformed successful PATCH is an unknown outcome, not verified success',async()=>{
  const provider=fakeCapacityProvider();let commits=0;
  const transport=async(url,init)=>{
    const result=await provider.transport(url,init);
    if(init.method==='PATCH'&&result.status===200&&++commits===33)return new Response(JSON.stringify({ref:'refs/heads/wrong'}),{status:200,headers:{'content-type':'application/json'}});
    return result;
  };
  const result=await runCapacityTest({token,transport,runId});
  assert.equal(result.status,'incomplete');assert.equal(result.unresolved,true);assert.equal(result.stopReason,'unknown-ref-response');assert.ok(result.requests.unknownMutations>=1);
});

test('a throttle detected during final verification cannot produce verified status',async()=>{
  const provider=fakeCapacityProvider();
  const transport=async(url,init)=>{
    const result=await provider.transport(url,init);
    if(init.method==='GET'&&url.includes('/git/blobs/')&&result.status===200){
      const blob=await result.clone().json();let state;
      try{state=JSON.parse(Buffer.from(blob.content,'base64').toString());}catch{}
      if(Object.keys(state?.entries||{}).length===30)result.headers.set('x-ratelimit-remaining','0');
    }
    return result;
  };
  const result=await runCapacityTest({token,transport,runId});
  assert.equal(result.status,'incomplete');assert.equal(result.stopReason,'provider-throttle');
});
