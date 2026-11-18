import assert from 'node:assert/strict';
import test from 'node:test';
import {createPlayObservationReader,hubPlayResponse} from '../lib/hub-play.mjs';
import {projectPlayRef} from '../lib/hub-play-reference.mjs';
import {parseProjectPlayRef} from '../lib/hub-play-selector.mjs';
import app from '../../extension/src/github-app/config.json' with {type:'json'};

const sha = 'a'.repeat(40);
const repositoryUrl = 'https://github.com/student/sample';
const canonical = 'https://student.github.io/sample/';
const project = {id:'student-game',title:'Student game',description:'Jump.',author:'student',
  repositoryId:'11',repositoryUrl,sourceCommit:sha,web:{provider:'github-pages',url:canonical,commit:sha,runId:42}};
const entry = {accountId:'7',repositoryId:'11',repositoryUrl,pagesUrl:canonical,commit:sha,runId:'42',order:'3'};
const shared = {kind:'game',status:'available',id:'game-r11-sample',slug:'sample',version:'1.0.0',title:'Sample',
  description:'Jump.',license:'MIT',contributor:{login:'student'},source:{folder:'.',commit:sha},
  repository:{id:'11',ownerId:'7',url:repositoryUrl},web:project.web};
const observed = {siteStatus:'reachable'};
const bound = {repositoryId:'11',ownerId:'7',owner:'student',repo:'sample',repositoryUrl};
const env = {NODE_ENV:'test',ZERO_HUB_LISTINGS_ENABLED:'1',ZERO_HUB_GITHUB_CLIENT_ID:app.clientId,
  ZERO_HUB_GITHUB_CLIENT_SECRET:'fixture-only-secret-value',ZERO_HUB_GITHUB_SESSION_SECRET:'11'.repeat(32)};
const visible = (held=false) => ({revision:sha,observedAt:Date.now(),isHeld:()=>held});
const options = () => ({env,projectRecords:[project],visibilityReader:async()=>visible(),destinationReader:async()=>bound,
  catalogReader:async()=>({releases:[shared]}),observationReader:async()=>observed,
  listingDestinationReader:async()=>true,getStore:()=>({listedForPlay:async()=>[entry],stillListed:async items=>items})});
const projectRef = projectPlayRef('maintained',{...project,ownerId:'7'});
const listingRef = projectPlayRef('listing',entry);
async function check(ref,overrides={}) {
  const request = new Request('https://zero.example/api/hub/projects/play?'+new URLSearchParams({ref}));
  const response = await hubPlayResponse(request,{...options(),...overrides});
  assert.equal(response.headers.get('cache-control'),'no-store');
  return {status:response.status,body:await response.json()};
}

test('only the selected maintained publication is verified, including its live owner', async()=>{
  let probes=0, bindings=0;
  const found=await check(projectRef,{
    catalogReader:async()=>assert.fail('unrelated catalog read'), getStore:()=>assert.fail('unrelated listing read'),
    destinationReader:async()=>{bindings++;return bound;},
    observationReader:async(ref,lane,record,url)=>{
      probes++; assert.equal(ref,projectRef); assert.equal(lane,'maintained');
      assert.equal(record.ownerId,'7'); assert.equal(url,canonical); return observed;
    }
  });
  assert.equal(found.status,200);
  assert.equal(found.body.url,canonical);
  assert.equal(found.body.siteStatus,'reachable');
  assert.equal(found.body.projectId,project.id);
  assert.equal(bindings,2); assert.equal(probes,1);
  for (const changed of [{ownerId:'12'},{repositoryId:'12'}]) {
    const result=await check(projectRef,{destinationReader:async()=>({...bound,...changed}),
      observationReader:async()=>assert.fail('publication changed')});
    assert.equal(result.status,404); assert.equal(result.body.url,undefined);
  }
});

test('held, replaced and removed publications cannot launch after a slow check',async()=>{
  let held=false;
  let result=await check(projectRef,{visibilityReader:async()=>visible(held),
    observationReader:async()=>{held=true;return observed;}});
  assert.equal(result.status,404);
  let checks=0;
  result=await check(listingRef,{listingDestinationReader:async()=>++checks===1});
  assert.equal(result.status,404);
  result=await check(listingRef,{getStore:()=>({listedForPlay:async()=>[entry],stillListed:async()=>[]})});
  assert.equal(result.status,404);
  let reads=0;
  const ref=projectPlayRef('release',shared);
  result=await check(ref,{catalogReader:async()=>({releases:[++reads===1?shared:{...shared,version:'2.0.0'}]})});
  assert.equal(result.status,404); assert.equal(reads,2);
});

test('listing launch requires its exact canonical marker, current membership and fresh authority',async()=>{
  let probes=0;
  const found=await check(listingRef,{observationReader:async(ref,lane,record,url)=>{
    probes++; assert.equal(ref,listingRef); assert.equal(lane,'listing'); assert.equal(record.commit,sha);
    assert.equal(record.runId,'42'); assert.equal(url,canonical); return observed;
  }});
  assert.equal(found.body.url,canonical); assert.equal(probes,1);
  assert.equal(found.body.thumbnail,`/api/hub/listings/thumbnail/11/${sha}`);
  assert.equal(found.body.projectId,undefined);
  const missingMarker = await check(listingRef,{observationReader:async()=>({siteStatus:'unknown'})});
  assert.equal(missingMarker.status,200); assert.equal(missingMarker.body.url,null);
  assert.equal(missingMarker.body.thumbnail,undefined);
  const republished = await check(listingRef,{getStore:()=>({listedForPlay:async()=>[{...entry,runId:'43'}]}),
    observationReader:async()=>assert.fail('stale run')});
  assert.equal(republished.status,404);
  for (const overrides of [{visibilityReader:async()=>visible(true)}, {env:{NODE_ENV:'test',ZERO_HUB_LISTINGS_ENABLED:'1'}}]) {
    const unavailable=await check(listingRef,{...overrides,getStore:()=>assert.fail('not eligible')});
    assert.equal(unavailable.status,404);
  }
  assert.equal(projectPlayRef('listing',{...entry,pagesUrl:'https://apps.example/'}),undefined);
});

test('an independently reviewed external browser destination is never a server probe',async()=>{
  const editorial={...project,web:{...project.web,url:'https://apps.example/game/'}};
  const found=await check(projectPlayRef('maintained',{...editorial,ownerId:'7'}),{projectRecords:[editorial],
    observationReader:async()=>assert.fail('external URL probe')});
  assert.equal(found.status,200); assert.equal(found.body.url,editorial.web.url);
  assert.equal(found.body.siteStatus,'not-checked');
});

test('availability observations coalesce for one exact run and never cache a failed marker',async()=>{
  let calls=0, end, time=0;
  const observe=createPlayObservationReader({now:()=>time,listingPlayReader:async()=>{
    calls++; return new Promise(resolve=>{end=resolve;});
  }});
  const a=observe(listingRef,'listing',entry,canonical);
  const b=observe(listingRef,'listing',entry,canonical);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1); end(canonical);
  assert.equal((await a).siteStatus,'reachable'); assert.equal((await b).siteStatus,'reachable');
  assert.equal((await observe(listingRef,'listing',entry,canonical)).siteStatus,'reachable');
  assert.equal(calls,1); time=30_001;
  const next=observe(listingRef,'listing',entry,canonical);
  await new Promise(resolve=>setImmediate(resolve));
  end(undefined); assert.equal((await next).siteStatus,'unknown');
  const retry=observe(listingRef,'listing',entry,canonical);
  await new Promise(resolve=>setImmediate(resolve)); end(canonical);
  assert.equal((await retry).siteStatus,'reachable'); assert.equal(calls,3);
});

test('invalid input, deadline and clock rollback never disclose a launch destination',async()=>{
  assert.equal(parseProjectPlayRef(projectRef+'\n'),null);
  assert.equal((await check('https://apps.example')).status,400);
  const invalid=await hubPlayResponse(new Request('https://zero.example/play?ref='+projectRef+'&url=https://example.com'),options());
  assert.equal(invalid.status,400); assert.equal(invalid.headers.get('location'),null);
  const late=await check(projectRef,{responseBudgetMs:10,observationReader:()=>new Promise(()=>{})});
  assert.equal(late.status,503); assert.equal(late.body.url,undefined);
  let clock=100;
  const rollback=await check(listingRef,{decisionNow:()=>clock,
    visibilityReader:async()=>({revision:sha,observedAt:100,isHeld:()=>false}),
    observationReader:async()=>{clock=99;return observed;}});
  assert.equal(rollback.status,503); assert.equal(rollback.body.url,undefined);
});

test('authority outages are distinct from optional health and provider failures', async()=>{
  const outage=await check(projectRef,{visibilityReader:async()=>{throw new Error('registry unavailable');}});
  assert.equal(outage.status,503); assert.equal(outage.body.code,'visibility-unavailable');
  const pending=await check(projectRef,{responseBudgetMs:10,visibilityReader:()=>new Promise(()=>{})});
  assert.equal(pending.status,503); assert.equal(pending.body.code,'visibility-unavailable');
  let count=0;
  const drift=await check(projectRef,{visibilityReader:async()=>++count===1?visible():null});
  assert.equal(drift.status,503); assert.equal(drift.body.code,'visibility-unavailable');
  const provider=await check(projectRef,{destinationReader:async()=>{throw new Error('temporary GitHub failure');}});
  assert.equal(provider.status,503); assert.equal(provider.body.code,undefined);
});

test('background verification leaves shared capacity for a foreground launch',async()=>{
  let unblock;
  const gate=new Promise(resolve=>{unblock=resolve;});
  const background=()=>hubPlayResponse(new Request('https://zero.example/api/hub/projects/play?ref='+projectRef,
    {headers:{'X-ZeroHub-Background':'1'}}),{...options(),observationReader:()=>gate});
  const a=background(), b=background();
  try {
    const busy=await background();
    assert.equal(busy.status,503);
    assert.equal((await busy.json()).code,undefined);
    const foreground=await check(projectRef);
    assert.equal(foreground.status,200); assert.equal(foreground.body.url,canonical);
  } finally { unblock(observed); }
  assert.equal((await a).status,200); assert.equal((await b).status,200);
});

test('canonical browser availability uses only a direct credential-free HEAD and does not follow redirects',async t=>{
  const replies=[200,301,503];
  const called=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    called.push({url,options});
    return new Response(null,{status:replies.shift()});
  });
  for (const expected of ['reachable','unknown','unreachable']) {
    const result=await check(projectRef,{observationReader:createPlayObservationReader()});
    assert.equal(result.status,200);
    assert.equal(result.body.siteStatus,expected);
    assert.equal(result.body.url,expected==='reachable'?canonical:null);
  }
  for (const {url,options} of called) {
    assert.equal(url,canonical);
    assert.equal(options.method,'HEAD');
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
  }
});
