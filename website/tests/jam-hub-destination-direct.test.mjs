import test from 'node:test';
import assert from 'node:assert/strict';
import {bindHubProjectDestination, createHubProjectStatusService, hubProjectsResponse, resolveHubProject} from '../lib/hub-project-status.mjs';

const repositoryUrl='https://github.com/student/project', playUrl='https://student.github.io/project/';
const decision=(held=[])=>({revision:'a'.repeat(40),observedAt:0, isHeld:id=>held.includes(id)});
const target={id:'game-r123-project',kind:'game',repositoryId:'123',ownerId:'7',repositoryUrl,playUrl};
const binding={repositoryId:'123',ownerId:'7',owner:'student',repo:'project',repositoryUrl};
const options={visibility:decision(),visibilityReader:async()=>decision(),destinationReader:async()=>binding};
const release={id:target.id,kind:'game',status:'available',version:'0.1.0',repository:{id:'123',ownerId:'7',url:repositoryUrl},
  web:{provider:'github-pages',url:playUrl,commit:'b'.repeat(40),runId:1},source:{commit:'b'.repeat(40)}};
const request=()=>new Request(`https://zero.example/api/hub/projects?kind=game&ids=${target.id}`);

test('shared and maintained resolution use fresh source identity and retain submitted Pages',async()=>{
  for(const source of [{catalogReader:async()=>({releases:[release]}),maintainedProjects:[]},
    {maintainedProjects:[{...target,web:release.web,sourceCommit:'b'.repeat(40)}]}]) {
    let calls=0,reads=0;
    const result=await resolveHubProject({kind:'game',id:target.id},{...source,...options,
      destinationReader:async(url,{signal})=>{calls++;assert.equal(url,repositoryUrl);assert.equal(signal.aborted,false);return binding;},
      visibilityReader:async()=>{reads++;return decision();}});
    assert.equal(result.repositoryId,'123');assert.equal(result.ownerId,'7');assert.equal(result.repositoryUrl,repositoryUrl);
    assert.equal(result.playUrl,playUrl);assert.equal(calls,1);assert.equal(reads,1);
  }
});

test('namespace reuse and known owner mismatch suppress candidates; unknown owner remains supported',async()=>{
  for(const current of [{...binding,repositoryId:'202'},{...binding,ownerId:'8'}])
    assert.equal(await bindHubProjectDestination(target,decision(),{...options,destinationReader:async()=>current}),null);
  const {ownerId,...unknownOwner}=target;
  assert.equal((await bindHubProjectDestination(unknownOwner,decision(),options)).repositoryId,'123');
});

test('fresh authority after lookup observes holds on both original and current repository IDs',async()=>{
  for(const id of ['123','202']) {
    const seen=[];
    const result=await bindHubProjectDestination(target,decision(),{...options,
      destinationReader:async()=>({...binding,repositoryId:id}),
      visibilityReader:async()=>({revision:'b'.repeat(40),observedAt:0, isHeld:checked=>{seen.push(checked);return checked===id;}})});
    assert.equal(result,null);assert.ok(seen.includes(id));
  }
  await assert.rejects(bindHubProjectDestination(target,decision(),{...options,visibilityReader:async()=>null}),/unavailable/);
});

test('provider failure and malformed observations fail closed without exposing provider details',async()=>{
  for(const destinationReader of [async()=>{throw Error('private upstream detail');},async()=>({...binding,ownerId:undefined})])
    await assert.rejects(bindHubProjectDestination(target,decision(),{...options,destinationReader}),error=>
      error.message==='Project visibility is unavailable.');
});

test('inactive behavior preserves Pages; libraries also require destination observations',async()=>{
  let calls=0;
  const destinationReader=async()=>{calls++;throw Error('unexpected');};
  assert.equal(await bindHubProjectDestination(target,null,{destinationReader}),target);
  const library={...target,kind:'library'};
  await assert.rejects(bindHubProjectDestination(library,decision(),{destinationReader}),/visibility is unavailable/);
  assert.equal(calls,1);
});

test('caller cancellation and deadline bound injected stalled readers and stop subsequent authority work',async()=>{
  for(const cancelled of [false,true]) {
    const controller=new AbortController();let reads=0,started,observedSignal;
    const dispatched=new Promise(resolve=>{started=resolve;});
    const pending=bindHubProjectDestination(target,decision(),{signal:controller.signal,destinationTimeoutMs:20,
      destinationReader:(_url,{signal})=>{observedSignal=signal;started();return new Promise(()=>{});},
      visibilityReader:async()=>{reads++;return decision();}});
    await dispatched;if(cancelled)controller.abort();
    await assert.rejects(pending,/unavailable/);assert.equal(reads,0);assert.equal(observedSignal.aborted,true);
  }
});

test('statusTarget binds even supplied targets and rechecks holds after provider work including Pages status',async()=>{
  let held=false,calls=0;
  const service=createHubProjectStatusService({...options,visibilityReader:async()=>decision(held?['123']:[]),
    fetchImpl:async(_url,{method})=>{calls++;held=true;return method==='HEAD'?new Response(null,{status:200}):Response.json({id:123,owner:{id:7},stargazers_count:3,has_issues:true});}});
  assert.equal(await service.statusTarget(target,undefined,{visibility:decision()}),null);assert.equal(calls,2);
  held=false;
  const mismatched=createHubProjectStatusService({...options,destinationReader:async()=>({...binding,repositoryId:'202'}),
    fetchImpl:async()=>{assert.fail('Mismatched target reached provider');}});
  assert.equal(await mismatched.statusTarget(target,undefined,{visibility:decision()}),null);
});

test('batch route independently binds custom resolver output and retains submitted Pages response fields',async()=>{
  let statuses=0;
  const service={resolve:async()=>target,statusTarget:async()=>{statuses++;return {...target,stars:3,site:{status:'reachable',url:playUrl}};}};
  const response=await hubProjectsResponse(request(),{...options,service});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.items.length,1);
  assert.deepEqual(body.items[0].site,{status:'reachable'});
  assert.equal(statuses,1);
  const denied=await hubProjectsResponse(request(),{...options,service,destinationReader:async()=>({...binding,repositoryId:'202'})});
  assert.deepEqual(await denied.json(),{schema:1,items:[]});assert.equal(statuses,1);
  const unavailable=await hubProjectsResponse(request(),{...options,service,destinationReader:async()=>{throw Error('secret');}});
  assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/secret|student/);
});

test('inactive decisions cannot authorize results after authority activates during resolution or status work',async()=>{
  for(const caller of ['resolve','status','statusTarget','explicitStatus','explicitTarget']) {
    let active=false,lookups=0;
    const visibilityReader=async()=>active?decision():null;
    const service=createHubProjectStatusService({visibilityReader,destinationReader:async()=>{lookups++;return binding;},
      maintainedProjects:[],catalogReader:async()=>{if(caller==='resolve')active=true;return {releases:[release]};},
      fetchImpl:async(_url,{method})=>{active=true;return method==='HEAD'?new Response(null,{status:200}):Response.json({id:123,owner:{id:7},stargazers_count:3,has_issues:true});}});
    const result=caller==='resolve'?await service.resolve({kind:'game',id:target.id}):
      caller.endsWith('Target')||caller==='statusTarget'?await service.statusTarget(target,undefined,caller==='explicitTarget'?{visibility:null}:{}):
      await service.status({kind:'game',id:target.id},caller==='explicitStatus'?{visibility:null}:{});
    assert.equal(result,null,caller);assert.equal(lookups,0,caller);
  }
});

test('route fails closed when authority activates after unchecked status output, preserving inactive responses',async()=>{
  for(const activate of [false,true]) {
    let active=false;
    const service={resolve:async()=>target,statusTarget:async()=>{active=activate;return {...target,stars:3,site:{status:'reachable'}};}};
    const response=await hubProjectsResponse(request(),{service,visibilityReader:async()=>active?decision():null,
      destinationReader:async()=>assert.fail('Inactive response must not perform destination lookup')});
    assert.equal(response.status,activate?503:200);
    const body=await response.text();
    if(activate)assert.doesNotMatch(body,/student|github.io|game-r123/);
    else assert.match(body,/github.io/);
  }
});

test('active repository status caches and in-flight requests are separated by bound repository ID',async()=>{
  for(const overlap of [false,true]) {
    let currentId='123',calls=0,releaseFirst,startedFirst;
    const started=new Promise(resolve=>{startedFirst=resolve;}),gate=new Promise(resolve=>{releaseFirst=resolve;});
    const service=createHubProjectStatusService({visibilityReader:async()=>decision(),
      destinationReader:async()=>({...binding,repositoryId:currentId}),fetchImpl:async(_url,{method})=>{
        if(method==='HEAD')return new Response(null,{status:200});
        const call=++calls;startedFirst();if(call===1&&overlap)await gate;
        return Response.json({id:call===1?123:456,owner:{id:7},stargazers_count:call===1?123:456,has_issues:true});
      }});
    const first=service.statusTarget(target);
    await started;if(!overlap)assert.equal((await first).stars,123);
    currentId='456';
    const second=service.statusTarget({...target,id:'game-r456-project',repositoryId:'456'});
    assert.equal((await second).stars,456);assert.equal(calls,2);
    releaseFirst();
    if(overlap)assert.equal(await first,null);else assert.equal((await first).stars,123);
  }
});
