import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPagesUrl, createHubProjectStatusService, hubProjectsResponse, repositoryParts, resolveHubProject} from '../lib/hub-project-status.mjs';

const commit = 'a'.repeat(40);
const id = 'game-r123-sample';
const repo = 'https://github.com/student/sample';
const pages = 'https://student.github.io/sample/';
const release = (overrides = {}) => ({kind:'game', id, version:'0.1.0', status:'available', title:'Sample',
  description:'A game', contributor:{login:'student'}, repository:{url:repo}, source:{commit},
  web:{provider:'github-pages',url:pages,commit,runId:1}, ...overrides});
const catalogReader = async () => ({releases:[release()]});
const request = query => new Request(`https://zero.example/api/hub/projects?${query}`);

test('resolver allows only canonical maintained and available catalog IDs', async () => {
  let reads = 0;
  const reader = async () => { reads++; return {releases:[release(),release({version:'0.2.0',status:'withdrawn'})]}; };
  const maintained = await resolveHubProject({kind:'game',id:'drawing-pad'}, {catalogReader:async()=>{throw Error('outage');}});
  assert.equal(maintained.repositoryUrl,'https://github.com/codepetca/zero-drawing-pad');
  assert.equal(maintained.playUrl,'https://codepetca.github.io/zero-drawing-pad/');
  assert.deepEqual(await resolveHubProject({kind:'game',id}, {catalogReader:reader}),
    {id,kind:'game',repositoryUrl:repo,playUrl:pages,sourceCommit:commit,version:'0.1.0'});
  assert.equal(reads,1);
  assert.equal(await resolveHubProject({kind:'game',id:'attacker'}, {catalogReader:reader}),null);
  assert.equal(reads,1);
  assert.equal(await resolveHubProject({kind:'game',id}, {catalogReader:async()=>({releases:[release({status:'withdrawn'})]})}),null);
  assert.equal(await resolveHubProject({kind:'game',id}, {catalogReader:async()=>{throw Error('down');}}),null);
});

test('repo and Pages URL checks reject custom or malformed destinations', async () => {
  for (const invalid of ['https://github.com/u/r?x=1','https://github.com/u/r/','https://github.com/u/%2e%2e',
    'https://u:secret@github.com/u/r','http://github.com/u/r','https://github.com:443/u/r',
    'https://github.com.evil.test/u/r','https://github.com/u/r.git','https://github.com/u/..'])
    assert.equal(repositoryParts(invalid),null,invalid);
  assert.equal(canonicalPagesUrl(repo),pages);
  assert.equal(canonicalPagesUrl('https://github.com/Student/Student.github.io'),'https://student.github.io/');
  const custom = await resolveHubProject({kind:'game',id},{catalogReader:async()=>({releases:[release({web:{provider:'github-pages',url:'https://custom.example/play',commit,runId:1}})]})});
  assert.equal(custom.playUrl,undefined);
  const malformed = await resolveHubProject({kind:'game',id},{catalogReader:async()=>({releases:[release({repository:{url:'http://127.0.0.1/private'}})]})});
  assert.equal(malformed,null);
});

test('public endpoint bounds IDs and excludes unknown projects before network work', async () => {
  let calls = 0;
  const service = createHubProjectStatusService({catalogReader, fetchImpl:async (url) => {
    calls++;
    return new Response(JSON.stringify({stargazers_count:4,has_issues:true}),{headers:{'content-type':'application/json'}});
  }});
  for (const query of ['kind=game','kind=game&ids=','kind=game&ids=x&ids=y','kind=game&ids=x&kind=library',
    'kind=game&ids='+Array(13).fill('x').join(','),'kind=game&ids=x,x','kind=game&ids=x&url=http://localhost'])
    assert.equal((await hubProjectsResponse(request(query),{service})).status,400,query);
  const result = await (await hubProjectsResponse(request('kind=game&ids=unknown,drawing-pad'),{service})).json();
  assert.deepEqual(result.items.map(item=>item.id),['drawing-pad']);
  assert.equal(calls,2);
});

test('endpoint returns unknown for resolved cards after its response budget', async () => {
  let external=0;
  const service=createHubProjectStatusService({catalogReader,fetchImpl:async()=>{external++;throw Error('unexpected fetch');}});
  const result=await (await hubProjectsResponse(request(`kind=game&ids=${id}`),
    {service,now:()=>1000,responseBudgetMs:0})).json();
  assert.deepEqual(result.items,[{id,kind:'game',repositoryUrl:repo,stars:null,issuesEnabled:null,site:{status:'unknown'}}]);
  assert.equal(external,0);
});

test('status classifies site results, parses counts and deduplicates concurrent requests', async () => {
  let time = 1000, repoCalls = 0, pageCalls = 0;
  const fetchImpl = async (url, options) => {
    if (url.includes('api.github.com')) {repoCalls++; return new Response(JSON.stringify({stargazers_count:7,has_issues:false}));}
    pageCalls++; assert.equal(options.method,'HEAD'); assert.equal(options.redirect,'error');
    return new Response(null,{status:404});
  };
  const service = createHubProjectStatusService({catalogReader, fetchImpl, now:()=>time});
  const [first,second] = await Promise.all([service.status({kind:'game',id}),service.status({kind:'game',id})]);
  assert.deepEqual(first,second);
  assert.equal(first.stars,7); assert.equal(first.issuesEnabled,false);
  assert.equal(first.site.status,'unreachable'); assert.equal(first.site.checkedAt,new Date(time).toISOString());
  assert.equal(repoCalls,1); assert.equal(pageCalls,1);
  time += 15*60*1000 - 1; await service.status({kind:'game',id});
  assert.equal(repoCalls,1); assert.equal(pageCalls,1);
  time += 2; await service.status({kind:'game',id});
  assert.equal(repoCalls,2); assert.equal(pageCalls,2);
});

test('a library in the same repository shares repo stars and has no site check', async () => {
  const libId='lib-r123-helper';
  const reader=async()=>({releases:[release(), release({kind:'library',id:libId,version:'0.3.0',web:undefined})]});
  let repoCalls=0, pageCalls=0;
  const service=createHubProjectStatusService({catalogReader:reader,fetchImpl:async url=>{
    if (url.includes('api.github.com')) {repoCalls++;return new Response(JSON.stringify({stargazers_count:2,has_issues:true}));}
    pageCalls++;return new Response(null,{status:200});
  }});
  const values=await Promise.all([service.status({kind:'game',id}),service.status({kind:'library',id:libId})]);
  assert.equal(values[1].stars,2);
  assert.equal(values[1].site.status,'not-checked');
  assert.equal(repoCalls,1);
  assert.equal(pageCalls,1);
});

test('unavailable API, oversized body and uncertain site results stay unknown, with short failure cache', async () => {
  let time=1000, calls=0;
  const service = createHubProjectStatusService({catalogReader, now:()=>time, fetchImpl:async (url,options) => {
    calls++;
    if (url.includes('api.github.com')) return new Response('x'.repeat(128*1024+1));
    if (options.method==='HEAD') return new Response(null,{status:405});
    throw Error('unexpected');
  }});
  const first=await service.status({kind:'game',id});
  assert.equal(first.stars,null); assert.equal(first.issuesEnabled,null); assert.equal(first.site.status,'unknown');
  await service.status({kind:'game',id}); assert.equal(calls,2);
  time += 60001; await service.status({kind:'game',id}); assert.equal(calls,4);
});

test('redirects, timeouts and custom domains never report a broken site', async () => {
  const custom = createHubProjectStatusService({catalogReader:async()=>({releases:[release({web:{provider:'github-pages',url:'https://my.example/play',commit,runId:1}})]}),
    fetchImpl:async url => {assert.match(url,/api.github.com/);return new Response(JSON.stringify({stargazers_count:0,has_issues:true}));}});
  assert.equal((await custom.status({kind:'game',id})).site.status,'not-checked');
  const redirect = createHubProjectStatusService({catalogReader, fetchImpl:async url => url.includes('api.github.com')
    ? new Response('{}',{status:429}) : new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}})});
  const value=await redirect.status({kind:'game',id});
  assert.equal(value.stars,null); assert.equal(value.site.status,'unknown');
  const timeout = createHubProjectStatusService({catalogReader,timeoutMs:5,fetchImpl:async (_url,{signal}) =>
    new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
  const timed = await timeout.status({kind:'game',id});
  assert.equal(timed.stars,null); assert.equal(timed.site.status,'unknown');
});
