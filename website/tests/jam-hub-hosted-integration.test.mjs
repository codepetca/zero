import test from 'node:test';
import assert from 'node:assert/strict';
import {atomicGitHttpFixture} from '../../jams/test/git-http-fixture.mjs';
import {createJamService} from '../../jams/service.mjs';
import {creator,maintainer,participant,hostedManifest} from '../../jams/test/fixtures.mjs';
import contracts from '../../extension/src/sharing/contracts.js';
import {catalogResponse} from '../lib/sharing-catalog.mjs';
import {createJamHubVisibilityReader,isJamHubVisibilityEnforced} from '../lib/jam-hub-visibility.mjs';
import {hubProjectsResponse,resolveHubProject} from '../lib/hub-project-status.mjs';

const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'0'};
const reveal='2030-01-05T00:00:00Z',instant=Date.parse(reveal);
const origin='https://artifacts.example';
function release(kind,repositoryId,slug) {
  const identity=contracts.identity(kind,repositoryId,slug),version='0.1.0';
  const artifact=type=>{const path=contracts.artifactPath(identity,version,type);return {path,url:`${origin}/${path}`,size:1,sha256:'e'.repeat(64)};};
  return {schema:1,kind,id:identity.id,slug,version,title:'Project',description:'A project',license:'MIT',
    repository:{id:repositoryId,ownerId:participant.id,owner:'student',name:`project${repositoryId}`,url:`https://github.com/student/project${repositoryId}`},
    contributor:{githubId:participant.id,login:'student'},source:{commit:'b'.repeat(40),folder:kind==='game'?'.':`libraries/${slug}`,sha256:'c'.repeat(64)},
    policyRevision:'d'.repeat(40),status:'available',...(kind==='game'?{controls:'Arrows',artifacts:{zip:artifact('zip')}}:
      {namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',artifacts:{jar:artifact('jar'),sources:artifact('sources'),pom:artifact('pom')}})};
}
const catalog={schema:1,revision:'a'.repeat(40),releases:[release('game','202','project'),
  release('library','202','helper'),release('library','202','tutorial-credits-badge'),release('library','303','helper')]};
const destinationReader=async url=>{const repo=url.split('/').at(-1);return {repositoryId:repo.slice('project'.length),ownerId:participant.id,owner:'student',repo,repositoryUrl:url};};

test('hosted null-repository event holds all project kinds across fresh atomic snapshots through reveal and outage',async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();
  let time=Date.parse('2030-01-02T12:00:00Z'),outage=false,verificationCalls=0;
  const service=createJamService({store:f.store,maintainerIds:[maintainer.id],now:()=>time,
    verifySource:async()=>assert.fail('Hosted proposal needs no source repository'),
    verifyRepository:async()=>{verificationCalls++;return {repository:{id:'202',ownerId:participant.id,fullName:'student/project202'}};}});
  const readVisibility=createJamHubVisibilityReader({clock:()=>time,fetchImpl:async(input,options)=>{
    if(outage)throw Error('PRIVATE_PROVIDER_FAILURE');
    assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);
    return f.fetchImpl(input,{...options,headers:{...options.headers,Authorization:'Bearer atomic-http-fixture-only-token'}});
  }});
  const visibilityReader=options=>readVisibility({...options,env});
  const options={env,reader:async()=>catalog,visibilityReader,destinationReader,decisionNow:()=>time};
  const request=()=>new Request('http://127.0.0.1:3000/api/sharing/catalog');
  const selection=async(practiceOnly=false)=>{
    const response=await catalogResponse(request(),{...options,practiceOnly,includeWeb:true});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');return response.json();
  };
  // Prime a negative snapshot before a hosted event or registration exists.
  assert.equal((await selection()).releases.length,3);
  const proposal=await service.propose({actor:creator,operationId:'hosted-integrate-01',manifest:hostedManifest()});
  assert.match(proposal.eventId,/^jam-zero-[a-f0-9]{32}$/);
  await service.mutate({id:proposal.eventId,actor:maintainer,operationId:'approve-integrate-01',action:'approve',revision:proposal.revision});
  const join={id:proposal.eventId,actor:participant,operationId:'join-integrate-01',action:'join',revision:proposal.revision,
    repositoryUrl:'https://github.com/student/project202',demoUrl:'https://student.github.io/project202/'};
  await service.mutate(join);await service.mutate(join);
  assert.equal(verificationCalls,1,'Accepted retry recovers without ownership verification');
  assert.deepEqual((await selection()).releases.map(item=>item.repository.id),['303']);
  assert.deepEqual((await selection(true)).releases,[]);
  const resolution={env,catalogReader:async()=>catalog,visibilityReader,destinationReader,decisionNow:()=>time};
  for(const kind of ['game','library']) {
    const selected=catalog.releases.find(item=>item.kind===kind);
    assert.equal(await resolveHubProject({kind,id:selected.id},resolution),null);
    const response=await hubProjectsResponse(new Request(`http://127.0.0.1:3000/api/hub/projects?kind=${kind}&ids=${selected.id}`),
      {env,visibilityReader,destinationReader,decisionNow:()=>time,service:{resolve:async()=>({...selected,repositoryId:selected.repository.id}),statusTarget:async()=>assert.fail('Held status provider work')}});
    assert.deepEqual(await response.json(),{schema:1,items:[]});
  }
  time=instant-1;assert.deepEqual((await selection()).releases.map(item=>item.repository.id),['303']);
  time=instant;assert.equal((await selection()).releases.length,3);assert.equal((await selection(true)).releases.length,1);
  const head=f.head;
  outage=true;
  for(const practiceOnly of [false,true]) {
    const response=await catalogResponse(request(),{...options,practiceOnly});
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(await response.text(),/PRIVATE_PROVIDER|project202|lib-r202/);
  }
  outage=false;assert.equal((await selection()).releases.length,3);assert.equal(f.head,head,'Reveal and visibility reads never write');
});

test('local visibility persists with UI writes disabled; production and preview remain held without source reads',async()=>{
  let calls=0;
  const reader=createJamHubVisibilityReader({fetchImpl:async()=>{calls++;throw Error('uninitialized registry');}});
  assert.equal(isJamHubVisibilityEnforced({env}),true);
  await assert.rejects(reader({env}),/visibility is unavailable/);assert.equal(calls,1);
  assert.equal(isJamHubVisibilityEnforced({env:{NODE_ENV:'production',VERCEL_ENV:'production'}}),true);
  const preview={NODE_ENV:'production',VERCEL_ENV:'preview',ZERO_JAMS_ENABLED:'1'};
  assert.equal(isJamHubVisibilityEnforced({env:preview}),true);await assert.rejects(reader({env:preview}));
  assert.equal(calls,1);
});
