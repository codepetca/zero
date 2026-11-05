import test from 'node:test';
import assert from 'node:assert/strict';
import {createHubMetricsService, hubMetricsResponse} from '../lib/hub-metrics.mjs';
import {resolveHubProject} from '../lib/hub-project-status.mjs';
import {createJamDestinationBindingReader} from '../lib/jam-destination-binding.mjs';

const ids=Array.from({length:8},(_,index)=>`game-r${108-index}-project`);
const repositoryId=id=>id.match(/^game-r(\d+)-/)[1];
const decision=(held=[])=>({revision:'a'.repeat(40),observedAt:0, isHeld:id=>held.includes(id)});
const request=(signal)=>new Request(`https://zero.example/api/hub/metrics?kind=game&ids=${ids.join(',')}`,{signal});
const release=id=>({id,kind:'game',version:'0.1.0',status:'available',title:'Project',description:'A game',contributor:{login:'student'},
  repository:{id:repositoryId(id),ownerId:'7',url:`https://github.com/student/project${repositoryId(id)}`},
  source:{commit:'b'.repeat(40)},web:{provider:'github-pages',url:`https://student.github.io/project${repositoryId(id)}/`,commit:'b'.repeat(40),runId:1}});
function fixture({beforeFetch=async()=>{}, visibilityReader=async()=>decision()}={}) {
  let calls=0,active=0,peak=0,resolves=0;
  const destinationReader=createJamDestinationBindingReader({maxConcurrent:4,fetchImpl:async(url,{signal})=>{
    calls++;active++;peak=Math.max(peak,active);
    try {
      await beforeFetch({url,signal,calls});
      // Complete in a different order from the request without changing output order.
      await new Promise(resolve=>setTimeout(resolve,Number(url.at(-1))%3));
      const numeric=url.match(/project(\d+)$/)[1],name=`project${numeric}`;
      return Response.json({id:Number(numeric),owner:{id:7,type:'User',login:'student'},name,
        full_name:`student/${name}`,html_url:`https://github.com/student/${name}`,private:false});
    } finally {active--;}
  }});
  const service=createHubMetricsService({env:{},visibilityReader:async()=>assert.fail('Enclosing reader must be forwarded'),
    destinationReader,store:{counts:async()=>assert.fail('Unverified Pages remain omitted')},
    resolve:(selection,options)=>{resolves++;return resolveHubProject(selection,{...options,maintainedProjects:[],
      catalogReader:async()=>({releases:ids.map(release)})});}});
  return {service,visibilityReader,destinationReader,stats:()=>({calls,peak,resolves})};
}

test('eight active metrics candidates use actual four-cap reader, preserve order and keep omitted Pages counts unknown',async()=>{
  const f=fixture();
  const response=await hubMetricsResponse(request(),f);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).items,ids.map(id=>({id,kind:'game',opens:null})));
  assert.equal(f.stats().calls,16);assert.equal(f.stats().resolves,8);assert.equal(f.stats().peak,4);
});

test('final authority still filters holds accepted after successful bounded resolution',async()=>{
  let reads=0;
  const f=fixture({visibilityReader:async()=>++reads>ids.length+1?decision(['108']):decision()});
  const response=await hubMetricsResponse(request(),f);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).items.map(item=>item.id),ids.slice(1));
  assert.equal(f.stats().calls,15);
});

test('provider failure returns sanitized unavailable and does not dispatch a later resolution batch',async()=>{
  const f=fixture({beforeFetch:async()=>{throw Error('private provider detail');}});
  const response=await hubMetricsResponse(request(),f);
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Counts unavailable.'});
  assert.equal(f.stats().resolves,4);assert.ok(f.stats().calls<=4);
});

test('cancellation and total deadline stop the next active batch even when provider ignores cancellation',async()=>{
  for(const cancelled of [false,true]) {
    const controller=new AbortController();let started,release;
    const dispatched=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const f=fixture({beforeFetch:async()=>{started();await gate;}});
    const pending=hubMetricsResponse(request(controller.signal),{...f,responseBudgetMs:cancelled?1000:25});
    await dispatched;if(cancelled)controller.abort();
    const response=await pending;assert.equal(response.status,503);assert.equal(f.stats().resolves,4);
    release();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.stats().resolves,4);
  }
});

test('game metrics resolved under inactive authority are suppressed when unheld authority activates',async()=>{
  for(const standalone of [false,true]) {
    let active=false;
    const visibilityReader=async()=>active?decision():null;
    const service=createHubMetricsService({env:{},visibilityReader,
      resolve:async({kind,id})=>({kind,id,repositoryId:'108',playUrl:'https://student.github.io/project108/'}),
      store:{counts:async()=>{active=true;return {[ids[0]]:42};}}});
    if(standalone)assert.deepEqual(await service.metrics('game',[ids[0]]),[]);
    else {
      const selected=new Request(`https://zero.example/api/hub/metrics?kind=game&ids=${ids[0]}`);
      const response=await hubMetricsResponse(selected,{service,env:{},visibilityReader});
      assert.equal(response.status,200);assert.deepEqual(await response.json(),{schema:1,items:[]});
    }
  }
});


test('standalone final authority uses the per-call reader after counts accept a new hold',async()=>{
  let held=false,callReads=0,factoryReads=0;
  const service=createHubMetricsService({env:{},visibilityReader:async()=>{factoryReads++;return decision();},
    resolve:async({kind,id})=>({kind,id,repositoryId:'108',playUrl:'https://student.github.io/project108/'}),
    store:{counts:async()=>{held=true;return {[ids[0]]:42};}}});
  const items=await service.metrics('game',[ids[0]],{visibilityReader:async()=>{callReads++;return decision(held?['108']:[]);}});
  assert.deepEqual(items,[]);assert.equal(callReads,2);assert.equal(factoryReads,0);
});
