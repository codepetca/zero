import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseIssue,readRequestResults} from '../lib/sharing-requests.mjs';
import {REGISTRY_URL,REGISTRY_BYTES} from '../lib/sharing-catalog.mjs';
import {canonical,digest} from '../../sharing/registry.mjs';
import contracts from '../../extension/src/sharing/contracts.js';
const env={ZERO_SHARING_ARTIFACT_ORIGIN:'https://artifacts.example'};
function fixture(kind='game') {
  const frozen={schema:1,kind,slug:'health-bar',version:'0.1.0',repository:{id:'1',ownerId:'1',owner:'student',name:'game',url:'https://github.com/student/game'},requester:{githubId:'1',login:'student'},commit:'a'.repeat(40),folder:kind==='game'?'.':'libraries/health-bar',descriptor:{schema:1,kind,slug:'health-bar',version:'0.1.0',title:'Health bar',description:'Game progress',license:'MIT',...(kind==='game'?{controls:'Arrows'}:{libraryKind:'helper'})},policyRevision:'b'.repeat(40),sourceDigest:'c'.repeat(64)};
  const id=digest(frozen), record={id,frozen,issueIds:['123'],status:'queued',attempts:[{message:'operator secret',diagnostics:[{message:'private stack'}]}],releaseKey:null};
  return {record,state:{schema:1,sequence:1,requests:{[id]:record},releases:{},availability:[],catalog:null}};
}
function fetcher(state, snapshot) {return async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');return new Response(JSON.stringify(url===REGISTRY_URL?state:snapshot));};}
function accept(f) {
  const {record,state}=f, request=record.frozen, id=contracts.identity(request.kind,'1',request.slug);
  const artifact={path:`games/${id.id}/0.1.0/project.zip`,url:`${env.ZERO_SHARING_ARTIFACT_ORIGIN}/games/${id.id}/0.1.0/project.zip`,size:1,sha256:'d'.repeat(64)};
  const release={schema:1,kind:'game',id:id.id,slug:request.slug,version:request.version,title:'Health bar',description:'Game progress',license:'MIT',repository:request.repository,contributor:request.requester,source:{commit:request.commit,folder:'.',sha256:request.sourceDigest},policyRevision:request.policyRevision,status:'available',artifacts:{zip:artifact},controls:'Arrows'};
  record.releaseKey=`game/${id.id}/0.1.0`;record.status='delivery-pending';state.releases[record.releaseKey]={requestId:record.id,release,delivery:'pending'};
  return release;
}
function catalog(state,releases) {
  const snapshot={schema:1,revision:'e'.repeat(40),releases}, bytes=JSON.stringify(snapshot), hash=createHash('sha256').update(bytes).digest('hex'),path=`catalog/snapshots/${hash}.json`;
  state.catalog={path,url:`${env.ZERO_SHARING_ARTIFACT_ORIGIN}/${path}`,revision:snapshot.revision,sequence:1,size:Buffer.byteLength(bytes),sha256:hash};return snapshot;
}
test('only positive issue numbers and exact official issue URLs are accepted',()=>{
  for(const input of ['123','#123','https://github.com/codepetca/zero/issues/123'])assert.equal(parseIssue(input),'123');
  for(const input of ['',0,'0','01','-1','9007199254740992','https://github.com/student/zero/issues/123','https://github.com/codepetca/zero/issues/123?x=1','https://github.com/codepetca/zero/issues/123/','https://github.com/codepetca/zero/issues/123#top','https://short.example/123'])assert.throws(()=>parseIssue(input));
});
test('empty registry reports unconfirmed waiting without substituting a request',async()=>{
  const f=fixture();const result=await readRequestResults('124',{env,fetchImpl:fetcher(f.state)});
  assert.deepEqual(result.results,[]);assert.match(result.message,/no release is confirmed/);
});
test('selected summaries distinguish source failure, infrastructure retry and pause, cancellation and closed library checking',async()=>{
  for(const [status,failures,kind,expected] of [['queued',0,'game','queued'],['queued',1,'game','retrying'],['failed',0,'game','source-failure'],['paused',3,'game','paused'],['cancelled',0,'game','cancelled'],['paused',1,'library','library-closed']]){
    const f=fixture(kind);f.record.status=status;f.record.infrastructureFailures=failures;
    const data=await readRequestResults('#123',{env,fetchImpl:fetcher(f.state)});
    assert.equal(data.results[0].status,expected);assert.deepEqual(Object.keys(data.results[0]).sort(),['commit','kind','message','requestId','status','version']);
    assert.doesNotMatch(JSON.stringify(data),/operator secret|private stack|sourceDigest|descriptor|attempts/);
  }
});
test('accepted-pending is distinct from available; exact snapshot is required for a release link',async()=>{
  const f=fixture(),release=accept(f);
  let data=await readRequestResults('123',{env,fetchImpl:fetcher(f.state)});
  assert.equal(data.results[0].status,'accepted-pending');assert.equal(data.results[0].releaseLink,undefined);
  f.state.releases[f.record.releaseKey].delivery='ready';let snapshot=catalog(f.state,[]);
  data=await readRequestResults('123',{env,fetchImpl:fetcher(f.state,snapshot)});assert.equal(data.results[0].status,'accepted-pending');
  snapshot=catalog(f.state,[release]);data=await readRequestResults('123',{env,fetchImpl:fetcher(f.state,snapshot)});
  assert.equal(data.results[0].status,'available');assert.equal(data.results[0].releaseLink,'/hub?kind=game&id=game-r1-health-bar&version=0.1.0');
  f.state.availability.push({key:f.record.releaseKey,status:'withdrawn'});snapshot=catalog(f.state,[{...release,status:'withdrawn'}]);
  data=await readRequestResults('123',{env,fetchImpl:fetcher(f.state,snapshot)});assert.equal(data.results[0].status,'withdrawn');assert.equal(data.results[0].releaseLink,undefined);
});
test('a used version has typed correction without reflecting operational messages',async()=>{
  const f=fixture();f.record.status='failed';f.record.attempts=[{kind:'source-failure',message:'operator secret',sourceDiagnostic:{code:'version-conflict'}}];
  const data=await readRequestResults('123',{env,fetchImpl:fetcher(f.state)});
  assert.equal(data.results[0].status,'version-conflict');assert.match(data.results[0].message,/Choose a new version/);
  assert.match(data.results[0].correction.message,/Choose a new version/);assert.doesNotMatch(JSON.stringify(data),/operator secret/);
  delete f.record.attempts[0].sourceDiagnostic;f.record.attempts[0].message='Immutable version conflict; use a new version';
  const hidden=await readRequestResults('123',{env,fetchImpl:fetcher(f.state)});assert.equal(hidden.results[0].status,'source-failure');assert.equal(hidden.results[0].correction,undefined);
});
test('license, main and dependency failures give distinct defined corrections and supported paths',async()=>{
  for(const [code,file,instruction] of [
    ['game-license','LICENSE',/readable license and Maven wrapper notices/],
    ['game-main','src/main/java/student/Main.java',/main Java file, its package and main method/],
    ['game-pins',undefined,/exact dependency\/plugin releases, Java 17 and JavaFX 21\.0\.12/]
  ]){
    const f=fixture();f.record.status='failed';f.record.attempts=[{kind:'source-failure',message:'operator secret',diagnostics:[{file:'/private/operator/config',message:'private stack'}],sourceDiagnostic:{code,...(file?{file}:{})}}];
    const data=await readRequestResults('123',{env,fetchImpl:fetcher(f.state)}), result=data.results[0];
    assert.equal(result.status,'source-failure');assert.equal(result.correction.code,code);assert.equal(result.correction.file,file);assert.match(result.correction.message,instruction);
    assert.deepEqual(Object.keys(result.correction).sort(),file?['code','file','message']:['code','message']);
    assert.doesNotMatch(JSON.stringify(data),/operator secret|private stack|private\/operator|diagnostics|sourceDiagnostic/);
  }
});
test('only the latest typed source failure on a failed request exposes correction',async()=>{
  for(const [status,kind,expected] of [['queued','source-failure','queued'],['paused','source-failure','paused'],['failed','infrastructure-failure','source-failure'],['cancelled','source-failure','cancelled']]){
    const f=fixture();f.record.status=status;f.record.attempts=[{kind:'source-failure',sourceDiagnostic:{code:'game-license',file:'LICENSE'}},{kind,message:'operator secret',diagnostics:[{message:'private stack'}],sourceDiagnostic:{code:'game-main',file:'src/main/java/Main.java'}}];
    const result=await readRequestResults('123',{env,fetchImpl:fetcher(f.state)});
    assert.equal(result.results[0].status,expected);assert.equal(result.results[0].correction,undefined);assert.doesNotMatch(JSON.stringify(result),/operator secret|private stack|game-license|game-main|Main\.java/);
  }
  const f=fixture('library');f.record.status='paused';f.record.attempts=[{kind:'infrastructure-failure',message:'operator secret',sourceDiagnostic:{code:'game-license'}}];
  const result=await readRequestResults('123',{env,fetchImpl:fetcher(f.state)});assert.equal(result.results[0].status,'library-closed');assert.equal(result.results[0].correction,undefined);
});
test('unknown typed codes and unsafe paths fail closed without reflecting their payload',async()=>{
  for(const sourceDiagnostic of [{code:'unknown'},{code:'game-main',file:'/private/operator/config'},{code:'game-main',file:'src/main/java/../Secret.java'},{code:'game-main',file:'src/main/java/<script>.java'},{code:'game-pins',message:'operator secret'}]){
    const f=fixture();f.record.status='failed';f.record.attempts=[{kind:'source-failure',sourceDiagnostic}];
    await assert.rejects(readRequestResults('123',{env,fetchImpl:fetcher(f.state)}),/^Error: Invalid public source diagnostic(?: path)?\.$/);
  }
});
test('reject mismatched frozen digest, selected issue binding, accepted request and source',async()=>{
  for(const change of [f=>f.record.frozen.commit='f'.repeat(40),f=>f.record.id='f'.repeat(64),f=>f.record.issueIds.push(123),f=>{accept(f);f.state.releases[f.record.releaseKey].requestId='f'.repeat(64);},f=>{const release=accept(f);release.source.commit='f'.repeat(40);}]){
    const f=fixture();change(f);await assert.rejects(readRequestResults('123',{env,fetchImpl:fetcher(f.state)}));
  }
});
test('32 related records maximum; no silent selection from larger sets',async()=>{
  const f=fixture();for(let i=1;i<33;i++){const frozen={...f.record.frozen,commit:i.toString(16).padStart(40,'0')},id=digest(frozen);f.state.requests[id]={...f.record,id,frozen};}
  await assert.rejects(readRequestResults('123',{env,fetchImpl:fetcher(f.state)}),/Too many/);
});
test('fixed registry origin, stream limit, redirect refusal and cancellation are enforced',async()=>{
  await assert.rejects(readRequestResults('123',{env,fetchImpl:async(url)=>{assert.equal(url,REGISTRY_URL);return new Response(new Uint8Array(REGISTRY_BYTES+1));}}),/size limit/);
  await assert.rejects(readRequestResults('123',{env,fetchImpl:async()=>{const r=new Response('{}');Object.defineProperty(r,'redirected',{value:true});return r;}}),/could not be retrieved/);
  const aborted=new AbortController();aborted.abort();await assert.rejects(readRequestResults('123',{env,signal:aborted.signal,fetchImpl:()=>assert.fail('No network after cancellation')}));
});
test('registry and accepted catalog share a single cumulative deadline',async()=>{
  const f=fixture(),release=accept(f),snapshot=catalog(f.state,[release]);let observed;
  await assert.rejects(readRequestResults('123',{env,timeoutMs:30,fetchImpl:async(url,{signal})=>{
    if(url===REGISTRY_URL){observed=signal;await new Promise(resolve=>setTimeout(resolve,20));return new Response(JSON.stringify(f.state));}
    assert.equal(signal,observed);return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('deadline'))));
  }}),/deadline|abort/i);
});

test('public request status binds accepted web provenance and keeps receipts out of its legacy summary payload',async()=>{
  const f=fixture(),oldId=f.record.id,web={provider:'github-pages',url:'https://student.github.io/game/',commit:f.record.frozen.commit,runId:42};
  f.record.frozen.web=web;f.record.id=digest(f.record.frozen);delete f.state.requests[oldId];f.state.requests[f.record.id]=f.record;
  const release=accept(f);release.web=web;f.state.releases[f.record.releaseKey].delivery='ready';
  const snapshot=catalog(f.state,[release]),result=await readRequestResults('123',{env,fetchImpl:fetcher(f.state,snapshot)});
  assert.equal(result.results[0].status,'available');assert.equal(Object.hasOwn(result.results[0],'web'),false);assert.doesNotMatch(JSON.stringify(result),/runId|github-pages|student.github.io/);
  release.web={...web,runId:43};await assert.rejects(readRequestResults('123',{env,fetchImpl:fetcher(f.state,snapshot)}),/Invalid accepted source/);
});


test('an accepted practice request links to its exact version in the separate practice catalog',async()=>{
  const f=fixture('library'),frozen=f.record.frozen;frozen.slug='tutorial-credits-badge';frozen.folder=`libraries/${frozen.slug}`;frozen.descriptor.slug=frozen.slug;
  f.record.id=digest(frozen);f.state.requests={[f.record.id]:f.record};
  const identity=contracts.identity('library',frozen.repository.id,frozen.slug),version=frozen.version;
  const release=contracts.validateRelease({schema:1,kind:'library',id:identity.id,slug:identity.slug,version,title:'CreditsBadge',description:'Copied tutorial practice.',license:'MIT',
    repository:frozen.repository,contributor:frozen.requester,source:{commit:frozen.commit,folder:frozen.folder,sha256:frozen.sourceDigest},policyRevision:frozen.policyRevision,status:'available',
    namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>{
      const path=contracts.artifactPath(identity,version,kind);return [kind,{path,url:`${env.ZERO_SHARING_ARTIFACT_ORIGIN}/${path}`,size:1,sha256:'d'.repeat(64)}];
    }))},{artifactOrigin:env.ZERO_SHARING_ARTIFACT_ORIGIN});
  f.record.releaseKey=`library/${identity.id}/${version}`;f.record.status='available';f.state.releases[f.record.releaseKey]={requestId:f.record.id,release,delivery:'ready'};
  const snapshot=catalog(f.state,[release]);const results=await readRequestResults('123',{env,fetchImpl:fetcher(f.state,snapshot)});
  assert.equal(results.results[0].releaseLink,`/hub?kind=practice&id=${identity.id}&version=${version}`);
});
