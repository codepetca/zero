import test from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../../extension/src/sharing/contracts.js';
import {catalogResponse, MAX_JAM_CATALOG_DESTINATIONS} from '../lib/sharing-catalog.mjs';
import {createJamDestinationBindingReader} from '../lib/jam-destination-binding.mjs';

const origin='https://artifacts.example';
function release(kind,id,version='0.1.0') {
  const slug=kind==='game'?'game':'helper', identity=contracts.identity(kind,id,slug);
  const artifact=type=>{const path=contracts.artifactPath(identity,version,type);return {path,url:`${origin}/${path}`,size:1,sha256:'e'.repeat(64)};};
  return {schema:1,kind,id:identity.id,slug,version,title:'Title',description:'Description',license:'MIT',
    repository:{id,ownerId:'7',owner:'student',name:`game${id}`,url:`https://github.com/student/game${id}`},
    contributor:{githubId:'7',login:'student'},source:{commit:'b'.repeat(40),folder:kind==='game'?'.':`libraries/${slug}`,sha256:'c'.repeat(64)},
    policyRevision:'d'.repeat(40),status:'available',...(kind==='game'?{controls:'Arrows',artifacts:{zip:artifact('zip')},
      web:{provider:'github-pages',url:`https://student.github.io/game${id}/`,commit:'b'.repeat(40),runId:42}}:
      {namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',artifacts:{jar:artifact('jar'),sources:artifact('sources'),pom:artifact('pom')}})};
}
const decision=(held=[])=>({revision:'f'.repeat(40),observedAt:0, isHeld:id=>held.includes(id)});
const binding=id=>({repositoryId:id,ownerId:'7',owner:'student',repo:`game${id}`,repositoryUrl:`https://github.com/student/game${id}`});
const request=()=>new Request('https://zero.example/api/sharing/catalog');
const snapshot=releases=>({schema:1,revision:'a'.repeat(40),releases});
async function run(releases,options={}) {
  return catalogResponse(request(),{reader:async()=>snapshot(releases),visibilityReader:async()=>decision(),destinationReader:async url=>binding(url.match(/game(\d+)$/)[1]),includeWeb:true,...options});
}

test('verifies distinct source URLs once per response and retains submitted Pages without Pages proof',async()=>{
  const releases=[release('game','123'),release('game','123','0.2.0'),release('library','456')];let calls=0;
  for(let i=0;i<2;i++) {
    const response=await run(releases,{destinationReader:async url=>{calls++;return binding(url.match(/game(\d+)$/)[1]);}});
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.releases.length,3);
    assert.deepEqual(result.releases,releases);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(calls,4);assert.ok(releases[0].web);
});

test('hides reused namespaces and owner mismatches without losing libraries',async()=>{
  const releases=[release('game','123'),release('game','124'),release('library','456')];
  const response=await run(releases,{destinationReader:async url=>{
    if(url.endsWith('123'))return binding('999');
    if(url.endsWith('124'))return {...binding('124'),ownerId:'8'};
    return binding('456');
  }});
  assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.releases.map(item=>item.kind),['library']);
});

test('provider failures return unavailable rather than a misleading empty catalog',async()=>{
  const response=await run([release('game','125'),release('library','456')],{destinationReader:async()=>{throw Error('private provider details');}});
  assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/private provider details/);
});

test('fresh authority gates original and resolved IDs and a disappearing authority fails closed',async()=>{
  for(const held of ['123','999']) {
    let reads=0,seen=[];
    const response=await run([release('game','123')],{visibilityReader:async()=>++reads===1?decision():({revision:'f'.repeat(40),observedAt:0, isHeld:id=>{seen.push(id);return id===held;}}),
      destinationReader:async()=>binding(held==='999'?'999':'123')});
    assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[]);assert.equal(reads,2);assert.ok(seen.includes(held));
  }
  let reads=0;const response=await run([release('game','123')],{visibilityReader:async()=>++reads===1?decision():null});
  assert.equal(response.status,503);
});

test('inactive paths skip destination reads; practice fails closed on authority failure',async()=>{
  const releases=[release('game','123'),release('library','456')];let calls=0;
  const response=await run(releases,{visibilityReader:async()=>null,destinationReader:async()=>{calls++;throw Error();}});
  assert.deepEqual((await response.json()).releases,releases);assert.equal(calls,0);
  const practice=await run(releases,{practiceOnly:true,visibilityReader:async()=>{throw Error();},destinationReader:async()=>{calls++;}});
  assert.equal(practice.status,503);assert.equal(calls,0);
});

test('caps distinct candidates and bounds a stalled lookup with the response deadline',async()=>{
  let calls=0;const releases=Array.from({length:MAX_JAM_CATALOG_DESTINATIONS+1},(_,i)=>release('game',String(i+1)));
  const capped=await run(releases,{destinationReader:async()=>{calls++;return binding('1');}});
  assert.equal(capped.status,503);assert.equal(calls,0);
  const stalled=await run([release('game','123')],{responseBudgetMs:30,destinationReader:()=>new Promise(()=>{})});
  assert.equal(stalled.status,503);
});

test('admits at most four lookups at once and processes every candidate within the cap',async()=>{
  const releases=Array.from({length:10},(_,i)=>release('game',String(i+1)));let active=0,peak=0,calls=0;
  const response=await run(releases,{destinationReader:async url=>{
    active++;calls++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;
    return binding(url.match(/game(\d+)$/)[1]);
  }});
  assert.equal(response.status,200);assert.equal((await response.json()).releases.length,10);assert.equal(calls,10);assert.equal(peak,4);
});

test('shared reader contention returns unavailable instead of a successful empty catalog',async()=>{
  let releaseFetch, started;
  const waiting=new Promise(resolve=>{releaseFetch=resolve;});
  const dispatched=new Promise(resolve=>{started=resolve;});
  const destinationReader=createJamDestinationBindingReader({maxConcurrent:1,maxPending:0,fetchImpl:async()=>{
    started();await waiting;
    return Response.json({id:123,owner:{id:7,type:'User',login:'student'},name:'game123',
      full_name:'student/game123',html_url:'https://github.com/student/game123',private:false});
  }});
  const first=run([release('game','123')],{destinationReader});
  await dispatched;
  const overloaded=await run([release('game','123')],{destinationReader});
  assert.equal(overloaded.status,503);
  assert.deepEqual(await overloaded.json(),{error:'ZeroHub is unavailable. Try again shortly.'});
  releaseFetch();
  const completed=await first;assert.equal(completed.status,200);assert.equal((await completed.json()).releases.length,1);
});


function observedDestinations(statuses, calls = []) {
  return createJamDestinationBindingReader({fetchImpl:async (url, options) => {
    calls.push({url, options});
    const name=url.split('/').at(-1),id=name.slice('game'.length),status=statuses[id] ?? 200;
    if (status instanceof Error) throw status;
    const result=Response.json(status===200 ? {id:Number(id),owner:{id:7,type:'User',login:'student'},name,
      full_name:`student/${name}`,html_url:`https://github.com/student/${name}`,private:false} : {message:'private upstream detail'}, {status});
    Object.defineProperty(result,'url',{value:url});
    return result;
  }});
}

test('confirmed missing public repositories omit only their releases and leave the available catalog usable',async()=>{
  const releases=[release('game','123'),release('game','123','0.2.0'),release('library','456'),release('game','789')],calls=[];
  const response=await run(releases,{destinationReader:observedDestinations({'123':404,'456':410},calls)});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[releases[3]]);
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls.length,3);
  assert.ok(calls.every(({url,options})=>url.startsWith('https://api.github.com/repos/')&&options.redirect==='manual'&&options.credentials==='omit'));
});

test('all confirmed missing repositories yield an empty catalog, while any uncertain provider failure still makes it unavailable',async()=>{
  const releases=[release('game','123'),release('library','456')];
  const empty=await run(releases,{destinationReader:observedDestinations({'123':404,'456':410})});
  assert.equal(empty.status,200);assert.deepEqual((await empty.json()).releases,[]);
  for(const failure of [401,403,429,500,502,503,Object.assign(Error('secret'),{status:404})]){
    const response=await run(releases,{destinationReader:observedDestinations({'123':404,'456':failure})});
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'ZeroHub is unavailable. Try again shortly.'});
  }
});

test('missing destination omission does not bypass initial holds, refreshed holds or identity checks',async()=>{
  const releases=[release('game','123'),release('game','124'),release('game','125'),release('library','456')],calls=[];
  let reads=0;
  const observe=observedDestinations({'123':404},calls);
  const response=await run(releases,{
    visibilityReader:async()=>++reads===1?decision(['125']):decision(['124','125']),
    destinationReader:async(url,options)=>url.endsWith('456')?{...binding('456'),ownerId:'8'}:observe(url,options)
  });
  assert.equal(response.status,200);assert.deepEqual((await response.json()).releases,[]);assert.equal(reads,2);
  assert.equal(calls.some(({url})=>url.endsWith('125')),false,'initially held repositories remain unread');
  for(const latest of [null,Error('private authority failure')]){
    let count=0;
    const response=await run([releases[0]],{destinationReader:observedDestinations({'123':404}),
      visibilityReader:async()=>{if(++count===1)return decision();if(latest instanceof Error)throw latest;return latest;}});
    assert.equal(response.status,503,'missing-only catalogs still require fresh authority');
  }
});
