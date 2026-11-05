import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import contracts from '../../extension/src/sharing/contracts.js';
import {digest} from '../../sharing/registry.mjs';
import {readRequestResults} from '../lib/sharing-requests.mjs';
import {REGISTRY_URL} from '../lib/sharing-catalog.mjs';

const env = {ZERO_SHARING_ARTIFACT_ORIGIN:'https://artifacts.example'};
const decision = (held = []) => ({revision:'f'.repeat(40),observedAt:0,isHeld:id => held.includes(id)});
const binding = (id = '123', ownerId = '7') => ({repositoryId:id,ownerId,owner:'student',repo:`game${id}`,repositoryUrl:`https://github.com/student/game${id}`});
function fixture(entries = [{id:'123'}]) {
  const state = {schema:1,sequence:1,requests:{},releases:{},availability:[],catalog:null}, releases = [];
  for (const {id,kind = 'game',version = '0.1.0'} of entries) {
    const slug = kind === 'game' ? 'game' : 'helper', identity = contracts.identity(kind,id,slug);
    const repository = {id,ownerId:'7',owner:'student',name:`game${id}`,url:`https://github.com/student/game${id}`};
    const frozen = {schema:1,kind,slug,version,repository,requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),
      folder:kind === 'game' ? '.' : `libraries/${slug}`,descriptor:{schema:1,kind,slug,version,title:'Project',description:'Description',license:'MIT',
        ...(kind === 'game' ? {controls:'Arrows'} : {libraryKind:'helper'})},policyRevision:'b'.repeat(40),sourceDigest:'c'.repeat(64),
      ...(kind === 'game' ? {web:{provider:'github-pages',url:`https://student.github.io/game${id}/`,commit:'a'.repeat(40),runId:42}} : {})};
    const requestId = digest(frozen), key = `${kind}/${identity.id}/${version}`;
    const artifact = type => {const path = contracts.artifactPath(identity,version,type);return {path,url:`${env.ZERO_SHARING_ARTIFACT_ORIGIN}/${path}`,size:1,sha256:'d'.repeat(64)};};
    const release = {schema:1,kind,id:identity.id,slug,version,title:'Project',description:'Description',license:'MIT',repository,contributor:frozen.requester,
      source:{commit:frozen.commit,folder:frozen.folder,sha256:frozen.sourceDigest},policyRevision:frozen.policyRevision,status:'available',
      ...(kind === 'game' ? {controls:'Arrows',artifacts:{zip:artifact('zip')},web:frozen.web} :
        {namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',artifacts:{jar:artifact('jar'),sources:artifact('sources'),pom:artifact('pom')}})};
    state.requests[requestId] = {id:requestId,frozen,issueIds:['123'],status:'available',releaseKey:key,
      attempts:[{message:'private operator secret',diagnostics:[{message:'provider token'}]}]};
    state.releases[key] = {requestId,release,delivery:'ready'};releases.push(release);
  }
  const snapshot = {schema:1,revision:'e'.repeat(40),releases}, bytes = JSON.stringify(snapshot), sha256 = createHash('sha256').update(bytes).digest('hex');
  const path = `catalog/snapshots/${sha256}.json`;
  state.catalog = {path,url:`${env.ZERO_SHARING_ARTIFACT_ORIGIN}/${path}`,revision:snapshot.revision,sequence:1,size:Buffer.byteLength(bytes),sha256};
  const fetchImpl = async url => {
    assert.ok(url === REGISTRY_URL || url === state.catalog.url, 'No external provider request');
    return Response.json(url === REGISTRY_URL ? state : snapshot);
  };
  const run = (options = {}) => readRequestResults('123',{env,fetchImpl,visibilityReader:async()=>decision(),
    destinationReader:async url => binding(url.match(/game(\d+)$/)[1]),...options});
  return {state,releases,fetchImpl,run};
}
function noLeak(value) {
  assert.doesNotMatch(JSON.stringify(value),/private operator|provider token|secret|github\.io|runId|ownerId|repositoryId|sourceDigest|attempts|Bearer/);
}

test('active request links require matching current repository and owner IDs, without exposing Pages receipts',async()=>{
  const f = fixture(), signals = [];let reads = 0;
  const result = await f.run({visibilityReader:async({signal})=>{reads++;signals.push(signal);return decision();},
    destinationReader:async(url,{signal})=>{assert.equal(url,f.releases[0].repository.url);signals.push(signal);return binding();}});
  assert.equal(reads,2);assert.ok(signals.every(signal=>signal===signals[0]));
  assert.ok(signals[0].aborted,'Owned work is cancelled on completion');
  assert.equal(result.results[0].status,'available');assert.equal(result.results[0].releaseLink,'/hub?kind=game&id=game-r123-game&version=0.1.0');noLeak(result);
});

test('namespace reuse and ownership mismatch withhold only affected game links',async()=>{
  for (const changed of [{repositoryId:'999'},{ownerId:'8'}]) {
    const f = fixture([{id:'123'},{id:'124'},{id:'456',kind:'library'}]), seen = [];
    const result = await f.run({destinationReader:async url=>url.endsWith('123')?{...binding(),...changed}:binding(url.endsWith('124')?'124':'456'),
      visibilityReader:async()=>({revision:'f'.repeat(40),observedAt:0,isHeld:id=>{seen.push(id);return id==='999';}})});
    assert.equal(result.results.filter(item=>item.status==='available').length,2);
    assert.equal(result.results.filter(item=>item.status==='accepted-pending').length,1);
    assert.ok(result.results.filter(item=>item.status==='accepted-pending').every(item=>!item.releaseLink));
    if (changed.repositoryId) assert.ok(seen.includes('999'),'Fresh authority checks the resolved ID as well');
    noLeak(result);
  }
});

test('changed visibility after destination work withholds the stored or resolved held identity',async()=>{
  for (const resolvedId of ['123','999']) {
    let reads = 0, lookedUp = false;
    const result = await fixture().run({visibilityReader:async()=>++reads===1?decision():decision([resolvedId]),
      destinationReader:async()=>{lookedUp=true;return {...binding(),repositoryId:resolvedId};}});
    assert.ok(lookedUp);assert.equal(reads,2);assert.equal(result.results[0].status,'accepted-pending');assert.equal(result.results[0].releaseLink,undefined);noLeak(result);
  }
});

test('an initially held game performs no destination read or link exposure',async()=>{
  let reads = 0;
  const result = await fixture().run({visibilityReader:async()=>{reads++;return decision(['123']);},destinationReader:async()=>assert.fail('Held destination must not be read')});
  assert.equal(reads,2);assert.equal(result.results[0].status,'accepted-pending');assert.match(result.results[0].message,/after the jam reveal/);noLeak(result);
});

test('provider downtime and malformed destination data fail with sanitized errors',async()=>{
  for (const destinationReader of [async()=>{throw Error('Bearer private provider token');},async()=>null,
    async()=>({...binding(),repositoryId:123}),async()=>({...binding(),repositoryUrl:'https://github.com/other/game123'})]) {
    await assert.rejects(fixture().run({destinationReader}),/^Error: Project destination is unavailable\.$/);
  }
});

test('fresh authority errors, malformed decisions and deployment transitions fail closed',async()=>{
  for (const latest of [null,undefined,{},{revision:'f'.repeat(40),isHeld:()=>undefined},
    {revision:'f'.repeat(40),isHeld:()=>{throw Error('Bearer private provider token');}}]) {
    let reads = 0;
    await assert.rejects(fixture().run({visibilityReader:async()=>++reads===1?decision():latest}),/Project visibility unavailable\./);
  }
  for (const initial of [null,decision()]) {
    let reads = 0;
    await assert.rejects(fixture().run({visibilityReader:async()=>++reads===1?initial:initial===null?decision():null}),/Project visibility unavailable\./);
  }
  let reads = 0;
  await assert.rejects(fixture().run({visibilityReader:async()=>{if(++reads===2)throw Error('Bearer private provider token');return decision();}}),/^Error: Project visibility unavailable\.$/);
});

test('inactive requests preserve links; library requests use repository authority',async()=>{
  let reads = 0;
  const result = await fixture().run({visibilityReader:async()=>{reads++;return null;},destinationReader:async()=>assert.fail('Inactive lookup')});
  assert.equal(reads,2);assert.equal(result.results[0].status,'available');assert.ok(result.results[0].releaseLink);noLeak(result);
  const library = await fixture([{id:'456',kind:'library'}]).run({visibilityReader:async()=>decision(),destinationReader:async()=>binding('456')});
  assert.equal(library.results[0].status,'available');assert.ok(library.results[0].releaseLink);noLeak(library);
});

test('distinct source URLs are verified once per response and never cached across requests',async()=>{
  const f = fixture([{id:'123'},{id:'123',version:'0.2.0'}]);let calls = 0;
  const options = {destinationReader:async()=>{calls++;return binding();}};
  for (let i=0;i<2;i++) assert.equal((await f.run(options)).results.filter(item=>item.releaseLink).length,2);
  assert.equal(calls,2);
});

test('one total deadline bounds injected transports and both authority observations even if cancellation is ignored',async()=>{
  for (const stage of ['registry','catalog','initial','destination','final']) {
    const f = fixture();let reads = 0, observed;
    const stall = signal => {observed=signal;return new Promise(()=>{});};
    // Allow setup to reach the intended stage even when the full suite runs
    // under load; the deliberately stalled operation still must be canceled.
    await assert.rejects(f.run({timeoutMs:500,
      fetchImpl:async(url,{signal})=>(stage==='registry'&&url===REGISTRY_URL||stage==='catalog'&&url!==REGISTRY_URL)?stall(signal):f.fetchImpl(url),
      visibilityReader:async({signal})=>{reads++;return stage==='initial'&&reads===1||stage==='final'&&reads===2?stall(signal):decision();},
      destinationReader:async(_url,{signal})=>stage==='destination'?stall(signal):binding()}),/deadline expired/);
    assert.ok(observed.aborted,`${stage} receives cancellation`);
  }
});

test('caller cancellation rejects stalled owned work and blocks already-cancelled requests',async()=>{
  const controller = new AbortController();let started;
  const entered = new Promise(resolve=>{started=resolve;});
  const pending = fixture().run({signal:controller.signal,destinationReader:async(_url,{signal})=>{started(signal);return new Promise(()=>{});}});
  const signal = await entered;controller.abort(Error('Bearer private provider token'));
  await assert.rejects(pending,/request was cancelled/);assert.ok(signal.aborted);
  await assert.rejects(fixture().run({signal:controller.signal,fetchImpl:async()=>assert.fail('No work after cancellation')}),/request was cancelled/);
});
