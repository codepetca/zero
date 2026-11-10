import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import contracts from '../../extension/src/sharing/contracts.js';
import {hubDiscoveryResponse, MAX_MAINTAINED_DISCOVERY_PROJECTS} from '../lib/hub-discovery.mjs';
import {selectReleases, selectMaintainedProjects} from '../lib/sharing-client.mjs';

const commit = 'b'.repeat(40), origin = 'https://artifacts.example';
const decision = (held=[]) => ({revision:'a'.repeat(40), observedAt:Date.now(), isHeld:id=>held.includes(id)});
function game(repositoryId='123', version='0.1.0', sourceCommit=commit) {
  const identity=contracts.identity('game',repositoryId,'sample'), path=contracts.artifactPath(identity,version,'zip');
  return {schema:1,kind:'game',id:identity.id,slug:identity.slug,version,title:`Game ${repositoryId}`,description:'Move a ship.',license:'MIT',
    repository:{id:repositoryId,ownerId:'7',owner:'student',name:`game-${repositoryId}`,url:`https://github.com/student/game-${repositoryId}`},
    contributor:{githubId:'7',login:'student'},source:{commit:sourceCommit,folder:'.',sha256:'c'.repeat(64)},
    policyRevision:'d'.repeat(40),status:'available',artifacts:{zip:{path,url:`${origin}/${path}`,size:10,sha256:'e'.repeat(64)}},
    controls:'Arrows',web:{provider:'github-pages',url:`https://student.github.io/game-${repositoryId}/`,commit:sourceCommit,runId:42}};
}
function library(slug='normal', repositoryId='456') {
  const {web,controls,...base}=game(repositoryId), identity=contracts.identity('library',repositoryId,slug);
  return {...base,kind:'library',id:identity.id,slug,source:{...base.source,folder:`libraries/${slug}`},namespace:identity.namespace,
    coordinate:{...identity.coordinate,version:base.version},libraryKind:'helper',artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>{
      const path=contracts.artifactPath(identity,base.version,kind);return [kind,{path,url:`${origin}/${path}`,size:1,sha256:'e'.repeat(64)}];
    }))};
}
const snapshot = releases => ({schema:1,revision:'a'.repeat(40),releases});
const project = (id='maintained', repositoryId='321') => ({id,title:`Maintained ${repositoryId}`,description:'Draw with a mouse.',author:'student',
  repositoryId,ownerId:'7',repositoryUrl:`https://github.com/student/game-${repositoryId}`,sourceCommit:commit,image:'/project-previews/drawing-pad.png',
  web:{provider:'github-pages',url:`https://student.github.io/game-${repositoryId}/`,commit,runId:42},privateMetadata:'never serialize'});
const destination = async url => {const [,owner,repo]=new URL(url).pathname.split('/');return {repositoryUrl:url,owner,repo,repositoryId:repo.slice(5),ownerId:'7'};};
const request = query => new Request(`https://zero.example/api/hub/discovery${query ? `?${query}` : ''}`);
const options = (extra={}) => ({projects:[project()],previews:[],authors:[],catalogReader:async()=>snapshot([game(),library()]),
  visibilityReader:async()=>decision(),destinationReader:destination,...extra});
const invoke = async extra => {const response=await hubDiscoveryResponse(request(),options(extra));return {response,body:await response.json()};};

test('active mixed projection hides held metadata while retaining submitted Pages for bound projects',async()=>{
  const hidden=game('202'), shown=game();
  const {response,body}=await invoke({projects:[project(),project('hidden-maintained','202')],
    catalogReader:async()=>snapshot([shown,hidden,library()]),visibilityReader:async()=>decision(['202']),
    previews:[{id:shown.id,sourceCommit:commit,image:'/project-previews/sky-hop.png',description:'Allowed summary',capturedFrom:{url:'secret-source'}},
      {id:hidden.id,sourceCommit:commit,image:'/project-previews/hidden.png',description:'HELD_PRESENTATION'}]});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(body.maintained.length,1);assert.equal(body.maintained[0].repositoryId,'321');assert.equal(body.maintained[0].ownerId,'7');
  assert.deepEqual(body.catalog.releases.map(item=>item.repository.id),['123','456']);
  assert.deepEqual(body.presentation,[{id:shown.id,sourceCommit:commit,image:'/project-previews/sky-hop.png',description:'Allowed summary'}]);
  assert.deepEqual(body.maintained[0].web,project().web);
  assert.deepEqual(body.catalog.releases[0].web,shown.web);
  assert.doesNotMatch(JSON.stringify(body),/game-202|HELD_PRESENTATION|hidden-maintained|secret-source|capturedFrom|privateMetadata|playUrl/);
  assert.deepEqual(contracts.validateCatalog(body.catalog),body.catalog);
});

test('maintained custom-domain links survive source binding, but held cards remain hidden',async()=>{
  const custom=project();custom.web.url='https://games.example/student/';
  const visible=await invoke({projects:[custom]});
  assert.equal(visible.body.maintained[0].web.url,custom.web.url);
  const held=await invoke({projects:[custom],visibilityReader:async()=>decision(['321'])});
  assert.deepEqual(held.body.maintained,[]);
});

test('presentation matches exact projected source and excludes unrelated editorial records',async()=>{
  const first=game(), second=game('123','0.2.0','f'.repeat(40)), lib=library();
  const {body}=await invoke({catalogReader:async()=>snapshot([first,second,lib]),previews:[
    {id:first.id,sourceCommit:commit,description:'old source'},
    {id:first.id,sourceCommit:'e'.repeat(40),description:'STALE_SECRET'},
    {id:'absent',sourceCommit:commit,description:'ABSENT_SECRET'}],authors:[
    {id:lib.id,sourceCommits:[commit],author:'curated'},
    {id:first.id,sourceCommits:[commit],author:'WRONG_KIND_SECRET'}]});
  assert.deepEqual(body.presentation,[{id:first.id,sourceCommit:commit,description:'old source'},{id:lib.id,sourceCommit:commit,author:'curated'}]);
  assert.equal(selectReleases(body.catalog,{kind:'game'})[0].version,'0.2.0');
  assert.equal(selectReleases(body.catalog,{kind:'game',id:first.id,version:'0.1.0'})[0].source.commit,commit);
  assert.equal(selectMaintainedProjects(body.maintained,{id:first.id,version:first.version}).length,0);
  assert.doesNotMatch(JSON.stringify(body.presentation),/SECRET/);
});

test('fresh final global hold suppresses both lanes and their presentation',async()=>{
  let finalHold=false;
  const {body}=await invoke({visibilityReader:async()=>decision(finalHold?['123','321']:[]),
    catalogReader:async()=>{finalHold=true;return snapshot([game()]);},previews:[{id:game().id,sourceCommit:commit,description:'held summary'}]});
  assert.deepEqual(body.maintained,[]);assert.deepEqual(body.catalog.releases,[]);assert.deepEqual(body.presentation,[]);
});

test('current namespace reuse and owner transfer omit confirmed mismatches',async()=>{
  for(const override of [{repositoryId:'202'},{ownerId:'8'}]) {
    const {response,body}=await invoke({destinationReader:async url=>({...await destination(url),...override})});
    assert.equal(response.status,200);assert.deepEqual(body.maintained,[]);
    assert.deepEqual(body.catalog.releases,[]);
  }
});

test('maintained provider failures and malformed bindings return sanitized 503',async()=>{
  for(const destinationReader of [async()=>{throw Error('PRIVATE_PROVIDER_SECRET');},async()=>({repositoryId:'321'})]) {
    const {response,body}=await invoke({destinationReader});
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);assert.deepEqual(body.presentation,[]);
    assert.doesNotMatch(JSON.stringify(body),/SECRET|student|Maintained|game-/);
  }
});

test('shared catalog failure preserves independently bound maintained metadata only',async()=>{
  const {response,body}=await invoke({catalogReader:async()=>{throw Error('PRIVATE_CATALOG');}});
  assert.equal(response.status,200);assert.equal(body.maintained.length,1);assert.equal(body.catalog,null);assert.ok(body.catalogError);
  assert.deepEqual(body.presentation,[]);assert.deepEqual(body.maintained[0].web,project().web);
  assert.doesNotMatch(JSON.stringify(body),/PRIVATE_CATALOG/);
});

test('authority unavailability and malformed decisions fail closed without catalog or metadata',async()=>{
  for(const visibilityReader of [async()=>{throw Error('PRIVATE_AUTHORITY');},async()=>undefined,async()=>({...decision(),isHeld:()=>undefined})]) {
    const {response,body}=await invoke({visibilityReader});
    assert.equal(response.status,503);assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);
    assert.doesNotMatch(JSON.stringify(body),/PRIVATE|student|Maintained/);
  }
});

test('authority-mode transitions during slow work reject the entire envelope',async()=>{
  for(const initiallyActive of [true,false]) {
    let active=initiallyActive;
    const {response,body}=await invoke({visibilityReader:async()=>active?decision():null,
      catalogReader:async()=>{active=!initiallyActive;return snapshot([game()]);}});
    assert.equal(response.status,503);assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);
    assert.deepEqual(body.presentation,[]);assert.doesNotMatch(JSON.stringify(body),/github|student|Maintained/);
  }
});

test('inactive production-compatible mode retains reviewed Pages without destination reads',async()=>{
  const {response,body}=await invoke({visibilityReader:async()=>null,destinationReader:async()=>assert.fail('Inactive destination read')});
  assert.equal(response.status,200);assert.equal(body.maintained[0].web.url,project().web.url);
  assert.equal(body.catalog.releases[0].web.url,game().web.url);
  assert.doesNotMatch(JSON.stringify(body),/privateMetadata/);
});

test('explicit practice returns only canonical practice libraries and their exact credits under fresh repository authority',async()=>{
  const practice=library('tutorial-credits-badge');
  const response=await hubDiscoveryResponse(request('practice=1'),options({
    catalogReader:async()=>snapshot([game(),library(),practice]),
    visibilityReader:async()=>decision(),destinationReader:destination,
    authors:[{id:practice.id,sourceCommits:[commit],author:'practice-author'},{id:library().id,sourceCommits:[commit],author:'hidden-author'}]}));
  assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.maintained,[]);
  assert.deepEqual(body.catalog.releases,[practice]);assert.deepEqual(body.presentation,[{id:practice.id,sourceCommit:commit,author:'practice-author'}]);
});

test('total deadline and caller cancellation bound stalled injected readers',async()=>{
  for(const cancel of [false,true]) {
    const controller=new AbortController();let start,signal;
    const started=new Promise(resolve=>{start=resolve;});
    const pending=hubDiscoveryResponse(new Request(request(),{signal:controller.signal}),options({responseBudgetMs:1000,
      destinationReader:(_url,opts)=>{signal=opts.signal;start();return new Promise(()=>{});}}));
    assert.equal(await Promise.race([started.then(()=>true),pending.then(()=>false)]),true,'destination reader did not start before the deadline');
    if(cancel)controller.abort();
    const response=await pending;assert.equal(response.status,503);assert.equal(signal.aborted,true);
    assert.deepEqual((await response.json()).maintained,[]);
  }
});

test('destination lanes serialize, concurrency stays at four, and maintained size is bounded',async()=>{
  let running=0,maximum=0,maintainedDone=0;
  const items=Array.from({length:9},(_,i)=>project(`maintained-${i}`,String(400+i)));
  const {response}=await invoke({projects:items,destinationReader:async url=>{
    running++;maximum=Math.max(maximum,running);await new Promise(resolve=>setImmediate(resolve));running--;maintainedDone++;
    return destination(url);
  },catalogReader:async()=>{assert.equal(running,0);assert.equal(maintainedDone,9);return snapshot([game()]);}});
  assert.equal(response.status,200);assert.equal(maximum,4);
  const tooMany=await invoke({projects:Array.from({length:MAX_MAINTAINED_DISCOVERY_PROJECTS+1},()=>project())});
  assert.equal(tooMany.response.status,503);
});

test('discovery route is dynamic Node and the projection owns all three editorial imports',async()=>{
  const route=await readFile(new URL('../app/api/hub/discovery/route.ts',import.meta.url),'utf8');
  assert.match(route,/runtime = 'nodejs'/);assert.match(route,/dynamic = 'force-dynamic'/);assert.match(route,/hubDiscoveryResponse\(request\)/);
  const source=await readFile(new URL('../lib/hub-discovery.mjs',import.meta.url),'utf8');
  for(const file of ['projects','project-previews','release-authors']) assert.ok(source.includes(`../content/${file}.json`));
});

test('whole-gallery revalidation retains both trusted lanes and requires active authority',async()=>{
  for(const active of [true,false]) {
    const response=await hubDiscoveryResponse(request('revalidate=1'),options({visibilityReader:async()=>active?decision():null}));
    assert.equal(response.status,active?200:503);
    const body=await response.json();
    assert.equal(body.maintained.length,active?1:0);assert.equal(body.catalog?.releases.length,active?2:undefined);
  }
  for(const query of ['revalidate=0','revalidate=1&revalidate=1','revalidate=1&ids=maintained']) {
    const response=await hubDiscoveryResponse(request(query),options({visibilityReader:async()=>assert.fail('Malformed input reached authority')}));
    assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'Invalid discovery request.'});
  }
});

test('final full discovery preserves forty distinct 128-character maintained IDs',async()=>{
  const records=Array.from({length:MAX_MAINTAINED_DISCOVERY_PROJECTS},(_,i)=>project(`id${i}`.padEnd(128,'a'),String(321+i)));
  for(const active of [true,false]) {
    const {response,body}=await invoke({projects:records,catalogReader:async()=>snapshot([]),visibilityReader:async()=>active?decision():null});
    assert.equal(response.status,200);assert.deepEqual(body.maintained.map(p=>p.id),records.map(p=>p.id));
  }
  const response=await hubDiscoveryResponse(request('revalidate=1'),options({projects:records,catalogReader:async()=>snapshot([])}));
  assert.equal(response.status,200);assert.deepEqual((await response.json()).maintained.map(p=>p.id),records.map(p=>p.id));
});

test('revalidation final authority cancellation and deadline fail closed for both lanes',async()=>{
  for(const cancel of [false,true]) {
    const controller=new AbortController();let reads=0,started,observed;
    const ready=new Promise(resolve=>{started=resolve;});
    // Empty catalog: initial + maintained binding + catalog + catalog final + envelope final.
    const pending=hubDiscoveryResponse(new Request(request('revalidate=1'),{signal:controller.signal}),options({
      responseBudgetMs:1000,catalogReader:async()=>snapshot([]),visibilityReader:async({signal}={})=>{
        if(++reads===5){observed=signal;started();return new Promise(()=>{});}return decision();
      }}));
    assert.equal(await Promise.race([ready.then(()=>true),pending.then(()=>false)]),true,'final authority reader did not start before the deadline');
    if(cancel)controller.abort();const response=await pending;
    assert.equal(response.status,503);assert.equal(observed.aborted,true);const body=await response.json();
    assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);
  }
});


test('discovery serialization rejects rollback after the final envelope visibility decision',async()=>{
  let now=1000,catalogRead=false,rolledBack=false;
  const {response,body}=await invoke({decisionNow:()=>now,
    catalogReader:async()=>{catalogRead=true;return snapshot([]);},
    visibilityReader:async()=>({revision:'a'.repeat(40),observedAt:now,isHeld:id=>{
      // Only the envelope filters maintained cards after the catalog lane.
      if(catalogRead&&id==='321'){now=999;rolledBack=true;}return false;
    }})
  });
  assert.equal(rolledBack,true);assert.equal(response.status,503);
  assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);assert.deepEqual(body.presentation,[]);
});

test('discovery rejects malformed decision timestamps and leaves inactive mode clock independent',async()=>{
  for(const observedAt of [undefined,null,'1000',NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1]) {
    const {response,body}=await invoke({decisionNow:()=>1000,
      visibilityReader:async()=>({...decision(),observedAt}),
      destinationReader:async()=>assert.fail('Invalid observation reached destinations')});
    assert.equal(response.status,503);assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);
  }
  const {response}=await invoke({visibilityReader:async()=>null,decisionNow:()=>assert.fail('Inactive authority read clock')});
  assert.equal(response.status,200);
});


test('discovery denies inactive authority if deployment activates in the final envelope microtask',async()=>{
  const runtimeEnv={NODE_ENV:'test'};let reads=0,switched=false;
  const {response,body}=await invoke({env:runtimeEnv,projects:[],catalogReader:async()=>snapshot([game()]),
    visibilityReader:async()=>{
      // Initial envelope, nested catalog, then final envelope authority.
      if(++reads===3)queueMicrotask(()=>{runtimeEnv.NODE_ENV='development';switched=true;});
      return null;
    },destinationReader:async()=>assert.fail('Inactive observation started destination reads')
  });
  assert.equal(switched,true);assert.equal(response.status,503);
  assert.deepEqual(body.maintained,[]);assert.equal(body.catalog,null);assert.deepEqual(body.presentation,[]);
});
