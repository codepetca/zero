import test from 'node:test';
import assert from 'node:assert/strict';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig, newSession} from '../lib/hub-github-auth.mjs';
import {hubProjectsResponse, createHubProjectStatusService} from '../lib/hub-project-status.mjs';
import {hubMetricsResponse, createHubMetricsService} from '../lib/hub-metrics.mjs';
import {getStarResponse, postStarResponse} from '../lib/hub-stars.mjs';
import {recordOpen} from '../lib/hub-opens.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';
import {fixture, manifest, creator, participant, approved} from '../../jams/test/fixtures.mjs';

const observedAt = Date.parse('2030-01-05T00:00:00Z');
const origin = 'http://127.0.0.1:3000';
const env = {NODE_ENV:'test', ZERO_HUB_ORIGIN:origin, ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,
  ZERO_HUB_GITHUB_CLIENT_SECRET:'s'.repeat(32), ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32, 2).toString('base64url')};
const config = hubConfig(env);
const {cookie, session} = newSession('ghu_'+'a'.repeat(24), {id:123, login:'student'}, 28800, config, observedAt);
const target = {id:'drawing-pad', kind:'game', repositoryId:'202', repositoryUrl:'https://github.com/student/project',
  playUrl:'https://student.github.io/project/'};
const destinationReader = async () => ({repositoryId:'202', ownerId:'7', owner:'student', repo:'project', repositoryUrl:target.repositoryUrl});
const statusService = {resolve:async () => target, statusTarget:async () => ({...target, stars:7})};
const metricService = {metricsSelection:async () => ({targets:[target], items:[{id:target.id, kind:'game', opens:7}]})};
const request = route => new Request(`${origin}/api/hub/${route}?kind=game&ids=${target.id}`);
const starRequest = (method, requestOrigin=origin) => new Request(`${requestOrigin}/api/hub/github/stars${method==='GET'?`?kind=game&id=${target.id}`:''}`, {
  method, headers:{Cookie:cookie.split(';')[0], ...(method==='POST'?{Origin:requestOrigin,'X-Hub-CSRF':session.csrf,'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({kind:'game', id:target.id, starred:true})}:{})});
const openRequest = (requestOrigin=origin) => new Request(`${requestOrigin}/api/hub/opens`, {method:'POST',
  headers:{Origin:requestOrigin,'Content-Type':'application/json'}, body:JSON.stringify({id:target.id})});
const decision = (timestamp = observedAt, isHeld = () => false) => ({revision:'a'.repeat(40), observedAt:timestamp, isHeld});

async function runRoute(route, options = {}) {
  const common = {env, destinationReader, decisionNow:() => observedAt, visibilityReader:async () => decision(), ...options};
  if (route==='status') return hubProjectsResponse(request('projects'), {...common, service:statusService});
  if (route==='metrics') return hubMetricsResponse(request('metrics'), {...common, service:metricService});
  if (route==='stars') return getStarResponse(starRequest('GET', common.env.ZERO_HUB_ORIGIN), {...common, now:observedAt, resolver:async () => target,
    fetchImpl:async () => new Response(null, {status:204})});
  return recordOpen(openRequest(common.env.ZERO_HUB_ORIGIN), {...common, resolve:async () => target, store:{increment:async () => 1}});
}

for (const route of ['status','metrics','stars','opens']) {
  test(`${route} accepts a valid decision timestamp and fails closed for missing, malformed or future timestamps`, async () => {
    const valid = await runRoute(route);
    assert.equal(valid.status, route==='opens'?204:200);
    for (const timestamp of [undefined, null, '1800000000000', -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER+1, observedAt+1]) {
      const visibilityReader = async () => ({...decision(), observedAt:timestamp});
      const response = await runRoute(route, {visibilityReader});
      assert.equal(response.status,503,`${route}: ${String(timestamp)}`);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.doesNotMatch(await response.text(), /student|drawing-pad|starred|opens":7/);
    }
  });
}

for (const route of ['status','metrics']) {
  test(`${route} checks the clock after the final authority decision filters the response`, async () => {
    let wall = observedAt, reads = 0;
    const finalRead = route==='status'?5:4;
    const visibilityReader = async () => {
      const number = ++reads;
      return decision(observedAt, () => { if (number===finalRead) wall=observedAt-1; return false; });
    };
    const response = await runRoute(route, {visibilityReader, decisionNow:() => wall});
    assert.equal(reads,finalRead,'Reached the last complete authority observation.');
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(), /student|drawing-pad|opens":7/);
  });
}

test('star reads check the clock after the last binding decision returns across the await boundary', async () => {
  let wall=observedAt, reads=0, scheduled=false, fetches=0;
  const response = await getStarResponse(starRequest('GET'), {env, now:observedAt, destinationReader,
    resolver:async () => target, visibilityReader:async () => { reads++; return decision(); },
    fetchImpl:async () => { fetches++; return new Response(null,{status:204}); },
    decisionNow:() => {
      const current=wall;
      // The binding's own check succeeds. Roll back before the caller resumes
      // and could emit the already completed GitHub result.
      if (reads===4 && !scheduled) { scheduled=true; queueMicrotask(() => {wall=observedAt-1;}); }
      return current;
    }});
  assert.equal(reads,4); assert.equal(fetches,1); assert.equal(scheduled,true);
  assert.equal(response.status,503); assert.equal('starred' in await response.json(),false);
});

test('Play recording rechecks wall time inside the external write dispatch callback', async () => {
  let wall=observedAt, reads=0, writes=0;
  const response=await recordOpen(openRequest(), {env, resolve:async () => target, decisionNow:() => wall,
    visibilityReader:async () => { const number=++reads; return decision(observedAt, () => {
      if (number===2) queueMicrotask(() => {wall=observedAt-1;});
      return false;
    }); }, store:{increment:async () => {writes++;}}});
  assert.equal(reads,2); assert.equal(writes,0); assert.equal(response.status,503); assert.equal(await response.text(),'');
});

test('a Play write followed by rollback returns unavailable without retrying the dispatched increment', async () => {
  let wall=observedAt, writes=0;
  const response=await recordOpen(openRequest(), {env, resolve:async () => target,
    visibilityReader:async () => decision(), decisionNow:() => wall,
    store:{increment:async () => {writes++;wall=observedAt-1;return 1;}}});
  assert.equal(writes,1); assert.equal(response.status,503); assert.equal(await response.text(),'');
});

test('active authority never dispatches a GitHub star mutation, including rollback and invalid timestamps', async () => {
  for (const timestamp of [observedAt, undefined, '1800000000000']) {
    let fetches=0;
    const response=await postStarResponse(starRequest('POST'), {env, now:observedAt, destinationReader,
      resolver:async () => target, decisionNow:() => observedAt-1,
      visibilityReader:async () => ({...decision(), observedAt:timestamp}),
      fetchImpl:async () => {fetches++;return new Response(null,{status:204});}});
    assert.equal(fetches,0); assert.equal(response.status,503);
    assert.equal((await response.json()).outcome,'not_dispatched');
  }
});

test('explicitly inactive authority retains existing star and Play write behavior without sampling a decision clock', async () => {
  let writes=0;
  const common={env, visibilityReader:async () => null, decisionNow:() => assert.fail('Inactive decisions do not use reveal time.')};
  const star=await postStarResponse(starRequest('POST'), {...common, now:observedAt, resolver:async () => target,
    fetchImpl:async () => {writes++;return new Response(null,{status:204});}});
  assert.equal(star.status,200); assert.deepEqual(await star.json(),{starred:true});
  const open=await recordOpen(openRequest(common.env.ZERO_HUB_ORIGIN), {...common, resolve:async () => target, store:{increment:async () => {writes++;return 1;}}});
  assert.equal(open.status,204); assert.equal(writes,2);
});

for (const caller of ['status','statusTarget']) {
  test(`standalone ${caller} retains its binding's last decision through the final await`, async () => {
    let wall=observedAt, reads=0, scheduled=false;
    const finalRead=caller==='status'?4:3;
    const service=createHubProjectStatusService({env, destinationReader, decisionNow:() => {
      const current=wall;
      if(reads===finalRead&&!scheduled){scheduled=true;queueMicrotask(()=>{wall=observedAt-1;});}
      return current;
    }, visibilityReader:async () => {reads++;return decision();}, maintainedProjects:[{...target}],
    fetchImpl:async (_url,{method}) => method==='HEAD'?new Response(null,{status:200}):Response.json({id:202,owner:{id:7},stargazers_count:7,has_issues:true})});
    await assert.rejects(service[caller](caller==='status'?{kind:'game',id:target.id}:target),/visibility is unavailable/i);
    assert.equal(scheduled,true); assert.equal(reads,finalRead);
  });
}

test('standalone metrics checks wall time after its last authority projection', async () => {
  let wall=observedAt, reads=0;
  const service=createHubMetricsService({env, destinationReader, resolve:async () => target, store:{counts:async () => ({[target.id]:7})},
    decisionNow:() => wall, visibilityReader:async () => {const number=++reads;return decision(observedAt,()=>{
      if(number===4)wall=observedAt-1;return false;
    });}});
  await assert.rejects(service.metrics('game',[target.id]),/visibility is unavailable/i);
  assert.equal(reads,4);
});


test('real cross-gallery decisions become held again after rollback without a registry revision change', async () => {
  const f=fixture({verifyRepository:async()=>({repository:{id:'202', ownerId:participant.id, fullName:'student/project'}}),
    source:async input=>({repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},
      manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:new Date(observedAt).toISOString()}})})});
  const revision=await approved(f);
  await f.service.mutate({id:'jam-101',actor:participant,operationId:'join-0001',action:'join',revision,
    repositoryUrl:target.repositoryUrl,demoUrl:target.playUrl});
  const state=structuredClone(f.store.records.get('jam-101').state);
  const snapshot={revision:'a'.repeat(40),ids:['jam-101'],read:async()=>({state})};
  const revealed=await projectVisibility(snapshot,observedAt),held=await projectVisibility(snapshot,observedAt-1);
  assert.equal(revealed.revision,held.revision); assert.equal(revealed.isHeld('202'),false); assert.equal(held.isHeld('202'),true);
  for(const route of ['status','metrics','stars','opens']) {
    let wall=observedAt,reads=0,writes=0;
    const finalRead={status:5,metrics:4,stars:4,opens:2}[route];
    const options={decisionNow:()=>wall,visibilityReader:async()=>{
      const number=++reads,visibility=await projectVisibility(snapshot,wall);
      return {...visibility,isHeld:id=>{const answer=visibility.isHeld(id);if(number===finalRead)wall=observedAt-1;return answer;}};
    }};
    const response=route==='opens'?await recordOpen(openRequest(),{env,...options,resolve:async()=>target,
      store:{increment:async()=>{writes++;return 1;}}}):await runRoute(route,options);
    assert.equal(reads,finalRead,route); assert.equal(response.status,503,route); assert.equal(writes,0,route);
    assert.doesNotMatch(await response.text(),/student|drawing-pad|starred|opens":7/);
  }
});


for(const route of ['status','metrics','stars','opens']) {
  test(`${route} rejects a null decision when enforcement activates before its final response or dispatch`, async()=>{
    const changingEnv={...env,NODE_ENV:'test',ZERO_HUB_ORIGIN:'https://zero.codepet.ca'};
    let reads=0,writes=0;
    const finalRead={status:3,metrics:2,stars:4,opens:2}[route];
    const options={env:changingEnv,visibilityReader:async()=>{
      if(++reads===finalRead)queueMicrotask(()=>{changingEnv.NODE_ENV='development';});
      return null;
    }};
    const response=route==='opens'?await recordOpen(openRequest(changingEnv.ZERO_HUB_ORIGIN),{...options,resolve:async()=>target,
      store:{increment:async()=>{writes++;return 1;}}}):await runRoute(route,options);
    assert.equal(reads,finalRead,route); assert.equal(response.status,503,route); assert.equal(writes,0,route);
    assert.doesNotMatch(await response.text(),/student|drawing-pad|starred|opens":7/);
  });
}

test('disabled Play counting cannot return an inactive acknowledgement after enforcement activates',async()=>{
  const changingEnv={...env,NODE_ENV:'test',ZERO_HUB_ORIGIN:'https://zero.codepet.ca'};
  let resolves=0;
  const response=await recordOpen(openRequest(changingEnv.ZERO_HUB_ORIGIN),{env:changingEnv,store:null,
    visibilityReader:async()=>{queueMicrotask(()=>{changingEnv.NODE_ENV='development';});return null;},
    resolve:async()=>{resolves++;return target;}});
  assert.equal(response.status,503); assert.equal(resolves,0); assert.equal(await response.text(),'');
});

test('star mutations do not dispatch after inactive authority becomes enforced during the final binding',async()=>{
  const changingEnv={...env,NODE_ENV:'test',ZERO_HUB_ORIGIN:'https://zero.codepet.ca'};
  let reads=0,writes=0;
  const response=await postStarResponse(starRequest('POST',changingEnv.ZERO_HUB_ORIGIN),{env:changingEnv,now:observedAt,resolver:async()=>target,
    visibilityReader:async()=>{if(++reads===4)queueMicrotask(()=>{changingEnv.NODE_ENV='development';});return null;},
    fetchImpl:async()=>{writes++;return new Response(null,{status:204});}});
  assert.equal(reads,4); assert.equal(response.status,503); assert.equal(writes,0);
  assert.equal((await response.json()).outcome,'not_dispatched');
});

test('star response and mutation dispatch recheck enforcement after the final inactive binding check succeeds',async t=>{
  t.mock.method(console,'warn',()=>{});
  for(const method of ['GET','POST']) {
    let reads=0,writes=0,active=false,scheduled=false,inactiveChecks=0;
    const changingEnv={...env,ZERO_HUB_ORIGIN:'https://zero.codepet.ca'};
    Object.defineProperty(changingEnv,'NODE_ENV',{get(){
      if(reads===4&&!scheduled) {
        // Let the binding's last null assertion succeed, then activate before
        // the route resumes to serialize or dispatch its external mutation.
        scheduled=true;inactiveChecks++;queueMicrotask(()=>{active=true;});
      }
      return active?'development':'test';
    }});
    const response=await (method==='GET'?getStarResponse:postStarResponse)(starRequest(method,changingEnv.ZERO_HUB_ORIGIN),{
      env:changingEnv,now:observedAt,resolver:async()=>target,visibilityReader:async()=>{reads++;return null;},
      fetchImpl:async()=>{writes++;return new Response(null,{status:204});}});
    assert.equal(reads,4);assert.equal(inactiveChecks,1);assert.equal(active,true);assert.equal(response.status,503,method);
    assert.equal(writes,method==='GET'?1:0,method);
    const data=await response.json();assert.equal('starred' in data,false);
    if(method==='POST')assert.equal(data.outcome,'not_dispatched');
  }
});
