import test from 'node:test';
import assert from 'node:assert/strict';
import {atomicGitHttpFixture} from '../../jams/test/git-http-fixture.mjs';
import {createJamService} from '../../jams/service.mjs';
import {creator,maintainer,participant,hostedManifest} from '../../jams/test/fixtures.mjs';
import contracts from '../../extension/src/sharing/contracts.js';
import {catalogResponse} from '../lib/sharing-catalog.mjs';
import {createJamHubVisibilityReader} from '../lib/jam-hub-visibility.mjs';
import {hubDiscoveryResponse} from '../lib/hub-discovery.mjs';
import {resolveHubProject,hubProjectsResponse} from '../lib/hub-project-status.mjs';
import {recordOpen} from '../lib/hub-opens.mjs';

const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'0',ZERO_HUB_ORIGIN:'http://127.0.0.1:3000'};
const origin='https://artifacts.example',commit='b'.repeat(40);
// Independent accepted Hub releases deliberately share one submitted demo URL.
// An unverified URL alone must never create a hold on the unrelated repository.
const demoUrl='https://student.github.io/project202/';
function release(kind,repositoryId,slug) {
  const identity=contracts.identity(kind,repositoryId,slug),version='0.1.0';
  const artifact=type=>{const path=contracts.artifactPath(identity,version,type);return {path,url:`${origin}/${path}`,size:1,sha256:'e'.repeat(64)};};
  return {schema:1,kind,id:identity.id,slug,version,title:'Project',description:'A project',license:'MIT',
    repository:{id:repositoryId,ownerId:participant.id,owner:'student',name:`project${repositoryId}`,url:`https://github.com/student/project${repositoryId}`},
    contributor:{githubId:participant.id,login:'student'},source:{commit,folder:kind==='game'?'.':`libraries/${slug}`,sha256:'c'.repeat(64)},
    policyRevision:'d'.repeat(40),status:'available',...(kind==='game'?{controls:'Arrows',artifacts:{zip:artifact('zip')},
      web:{provider:'github-pages',url:demoUrl,commit,runId:42}}:
      {namespace:identity.namespace,coordinate:{...identity.coordinate,version},libraryKind:'helper',artifacts:{jar:artifact('jar'),sources:artifact('sources'),pom:artifact('pom')}})};
}
const catalog={schema:1,revision:'a'.repeat(40),releases:[release('game','202','project'),release('library','202','helper'),
  release('library','202','tutorial-credits-badge'),release('game','303','project'),release('library','303','helper')]};
const maintained=id=>({id:`maintained-${id}`,title:'Maintained',description:'A project',author:'student',
  repositoryId:id,ownerId:participant.id,repositoryUrl:`https://github.com/student/project${id}`,sourceCommit:commit,
  web:{provider:'github-pages',url:`https://student.github.io/project${id}/`,commit,runId:42}});
const destinationReader=async url=>{const repo=url.split('/').at(-1);return {repositoryId:repo.slice('project'.length),
  ownerId:participant.id,owner:'student',repo,repositoryUrl:url};};
const request=path=>new Request(`${env.ZERO_HUB_ORIGIN}${path}`);

test('repository-only Join and failed Pages submission retain cross-event Hub holds without hiding independent releases',async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();
  let time=Date.parse('2030-01-02T12:00:00Z'),proofCalls=0;
  const service=createJamService({store:f.store,maintainerIds:[maintainer.id],now:()=>time,
    verifySource:async()=>assert.fail('Hosted proposals and live entries have no exact-commit source lookup'),
    verifyRepository:async()=>({repository:{id:'202',ownerId:participant.id,fullName:'student/project202'}}),
    pagesBindingReader:async(repository,url,{signal})=>{
      proofCalls++;assert.deepEqual(repository,{url:'https://github.com/student/project202',id:'202',ownerId:participant.id});
      assert.equal(url,demoUrl);assert.ok(signal instanceof AbortSignal);
      return {status:'unverified',reason:'not-found'};
    }});
  const readVisibility=createJamHubVisibilityReader({clock:()=>time,fetchImpl:async(input,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);
    return f.fetchImpl(input,{...options,headers:{...options.headers,Authorization:'Bearer atomic-http-fixture-only-token'}});
  }});
  const visibilityReader=options=>readVisibility({...options,env});
  const options={env,visibilityReader,destinationReader,decisionNow:()=>time,
    pagesBindingReader:async()=>assert.fail('Independent Hub releases use source holds, not Jam entry Pages eligibility')};
  const catalogReader=async()=>catalog,projects=[maintained('202'),maintained('303')];
  const resolution={...options,catalogReader,maintainedProjects:projects};
  const selection=async(practiceOnly=false)=>{
    const response=await catalogResponse(request('/api/sharing/catalog'),{...options,reader:catalogReader,includeWeb:true,practiceOnly});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');return (await response.json()).releases;
  };
  const discovery=async()=>{
    const response=await hubDiscoveryResponse(request('/api/hub/discovery'),{...options,catalogReader,projects,previews:[],authors:[]});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');return response.json();
  };
  const assertHeld=async()=>{
    assert.deepEqual((await selection()).map(item=>item.repository.id),['303','303']);
    assert.deepEqual(await selection(true),[]);
    const body=await discovery();assert.deepEqual(body.maintained.map(item=>item.repositoryId),['303']);
    assert.deepEqual(body.catalog.releases.map(item=>item.repository.id),['303','303']);
    assert.equal(body.catalog.releases[0].web.url,demoUrl,'Shared unverified URL does not suppress another repository');
    for(const item of catalog.releases.filter(item=>item.repository.id==='202'))
      assert.equal(await resolveHubProject({kind:item.kind,id:item.id},resolution),null);
    assert.equal(await resolveHubProject({kind:'game',id:'maintained-202'},resolution),null);
    const target={id:catalog.releases[0].id,kind:'game',repositoryId:'202',ownerId:participant.id,
      repositoryUrl:'https://github.com/student/project202',playUrl:demoUrl};
    const status=await hubProjectsResponse(request(`/api/hub/projects?kind=game&ids=${target.id}`),{...options,
      service:{resolve:async()=>target,statusTarget:async()=>assert.fail('Held project starts no status work')}});
    assert.equal(status.status,200);assert.deepEqual(await status.json(),{schema:1,items:[]});
    const open=await recordOpen(new Request(`${env.ZERO_HUB_ORIGIN}/api/hub/opens`,{method:'POST',
      headers:{Origin:env.ZERO_HUB_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({id:target.id})}),
      {...options,resolve:input=>resolveHubProject(input,resolution),store:{increment:async()=>assert.fail('Held project starts no count write')}});
    assert.equal(open.status,404);
  };
  assert.equal((await selection()).length,4,'Negative pre-registration decisions are not reused');
  const events=[];
  for(const [index,reveal] of ['2030-01-05T00:00:00Z','2030-01-08T00:00:00Z'].entries()) {
    const manifest=hostedManifest();manifest.schedule.galleryRevealAt=reveal;
    const proposal=await service.propose({actor:creator,operationId:`pages-hold-proposal-${index}`,manifest});events.push(proposal);
    await service.mutate({id:proposal.eventId,actor:maintainer,operationId:`pages-hold-approve-${index}`,action:'approve',revision:proposal.revision});
    await service.mutate({id:proposal.eventId,actor:participant,operationId:`pages-hold-join-${index}`,action:'join',revision:proposal.revision,
      repositoryUrl:'https://github.com/student/project202'});
    const stored=(await f.store.read(proposal.eventId)).state;
    assert.equal(stored.registrations[participant.id].repository.id,'202');
    assert.deepEqual(stored.entries,{});assert.equal(proofCalls,0,'Join permits a project before Pages publication');
  }
  await assertHeld();
  const first=events[0],before=f.head;
  await assert.rejects(service.mutate({id:first.eventId,actor:participant,operationId:'pages-hold-submit-01',action:'submit',
    revision:first.revision,title:'Unpublished game',description:'The site is not observable.',demoUrl,instructions:'Use arrows.'}),
    error=>error.status===503&&/Pages association could not be verified/.test(error.message));
  assert.equal(proofCalls,1);assert.equal(f.head,before,'Unverified Pages submission cannot remove or replace Join authority');
  await assertHeld();
  time=Date.parse('2030-01-05T00:00:00Z');
  assert.deepEqual((await service.read(first.eventId)).event.entries,[],'An unverified project is absent from the Jam gallery');
  await assertHeld();
  time=Date.parse('2030-01-08T00:00:00Z')-1;await assertHeld();
  time++;
  assert.equal((await selection()).length,4);assert.equal((await selection(true)).length,1);
  const revealed=await discovery();assert.deepEqual(revealed.maintained.map(item=>item.repositoryId),['202','303']);
  assert.equal(revealed.catalog.releases[0].web.url,demoUrl);
  assert.equal((await resolveHubProject({kind:'game',id:catalog.releases[0].id},resolution)).repositoryId,'202');
  assert.deepEqual((await service.read(first.eventId)).event.entries,[],'Hub availability does not grant Jam entry eligibility');
  assert.equal(proofCalls,1,'Hub never initiates a Pages observation or changes the failed submission');
  assert.equal(f.head,before,'Reveal, Hub discovery and status are read-only');
});
