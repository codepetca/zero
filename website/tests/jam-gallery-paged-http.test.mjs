import test from 'node:test';
import assert from 'node:assert/strict';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {getJamResponse} from '../lib/jams-http.mjs';
import {JamError,JAM_PAGE_METADATA,JAM_PROJECTION_REVISION} from '../../jams/service.mjs';
import {fixture,creator,maintainer,hostedManifest,verifiedPages} from '../../jams/test/fixtures.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';

const revision='a'.repeat(40),now=1_800_000_000_000,id='jam-123';
const env={NODE_ENV:'test',ZERO_JAMS_ENABLED:'1',ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
  ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),
  ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32,7).toString('base64url')};
const request=(event=id,query='view=gallery')=>new Request(`http://127.0.0.1:3000/api/jams/${event}?${query}`);
function httpFixture() {
  const calls=[];
  const service={async readPage(event,actor,page){
    calls.push({event,actor,page});
    if(page.revision&&page.revision!==revision)throw new JamError(409,'The gallery changed. Start again.');
    const result={event:{id:event,entries:[]},registration:null,entry:null,canMaintain:false};
    Object.defineProperty(result,JAM_PROJECTION_REVISION,{value:revision});
    Object.defineProperty(result,JAM_PAGE_METADATA,{value:{revision,validUntil:null,observedAt:now,nextOffset:page.offset===0?8:null}});
    return result;
  }};
  return {calls,options:{env,service,now:()=>now}};
}

test('paged HTTP responses use opaque, event-bound cursors and pass trusted positions to the service',async()=>{
  const f=httpFixture(),first=await getJamResponse(request(),id,f.options);
  assert.equal(first.status,200);const page=await first.json();
  assert.equal(typeof page.nextCursor,'string');assert.doesNotMatch(JSON.stringify(page),/aaaaaaaaaaaaaaaa/);
  assert.equal(f.calls[0].page.offset,0);assert.equal(first.headers.get('cache-control'),'no-store');
  const second=await getJamResponse(request(id,`view=gallery&cursor=${page.nextCursor}`),id,f.options);
  assert.equal(second.status,200);assert.equal((await second.json()).nextCursor,null);
  assert.equal(f.calls[1].page.offset,8);assert.equal(f.calls[1].page.revision,revision);
  const wrongEvent=await getJamResponse(request('jam-124',`view=gallery&cursor=${page.nextCursor}`),'jam-124',f.options);
  assert.equal(wrongEvent.status,409);assert.equal(f.calls.length,2);
  const bytes=Buffer.from(page.nextCursor,'base64url');bytes[bytes.length-1]^=1;
  const forged=await getJamResponse(request(id,`view=gallery&cursor=${bytes.toString('base64url')}`),id,f.options);
  assert.equal(forged.status,409);assert.equal(f.calls.length,2);
});

test('paged HTTP responses reject missing provenance, bad configuration and duplicate cursors',async()=>{
  const f=httpFixture();
  const noKey=await getJamResponse(request(),id,{...f.options,env:{NODE_ENV:'test',ZERO_JAMS_ENABLED:'1'}});
  assert.equal(noKey.status,503);assert.equal(f.calls.length,0);
  const duplicate=await getJamResponse(request(id,'view=gallery&cursor=x&cursor=y'),id,f.options);
  assert.equal(duplicate.status,503);assert.equal(f.calls.length,0);
  const bad={...f.options,service:{readPage:async()=>({event:{id,entries:[]}})}};
  const response=await getJamResponse(request(),id,bad);
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/aaaaaaaaaaaaaaaa/);
  const noRevision={...f.options,service:{readPage:async()=>{
    const result={event:{id,entries:[]}};
    Object.defineProperty(result,JAM_PAGE_METADATA,{value:{observedAt:now,validUntil:null,nextOffset:null}});
    return result;
  }}};
  assert.equal((await getJamResponse(request(),id,noRevision)).status,503);
});

test('HTTP refuses a page if a cross-gallery reveal horizon expires before response',async()=>{
  let clock=now;
  const service={async readPage(){
    const result={event:{id,entries:[]},registration:null,entry:null,canMaintain:false};
    Object.defineProperty(result,JAM_PROJECTION_REVISION,{value:revision});
    Object.defineProperty(result,JAM_PAGE_METADATA,{value:{revision,validUntil:now+1,observedAt:now,nextOffset:null}});
    clock=now+1;return result;
  }};
  const response=await getJamResponse(request(),id,{env,service,now:()=>clock});
  assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/aaaaaaaaaaaaaaaa/);
});

test('a page uses one checked time for its final horizon check and response timestamp',async()=>{
  let afterRead=false,checks=0;
  const service={async readPage(){
    const result={event:{id,entries:[]},registration:null,entry:null,canMaintain:false};
    Object.defineProperty(result,JAM_PROJECTION_REVISION,{value:revision});
    Object.defineProperty(result,JAM_PAGE_METADATA,{value:{revision,validUntil:now+1,observedAt:now,nextOffset:null}});
    afterRead=true;return result;
  }};
  const clock=()=>afterRead?(checks++===0?now:now+2):now;
  const response=await getJamResponse(request(),id,{env,service,now:clock});
  assert.equal(response.status,200);assert.equal((await response.json()).checkedAt,new Date(now).toISOString());
  assert.equal(checks,1);
});

test('a paged namespace mismatch withholds the entry and reports incomplete verification',async()=>{
  const service={async readPage(){
    const result={event:{id,entries:[{participantId:'33',repository:{id:'202',ownerId:'33',fullName:'student/project'}}]},canMaintain:false};
    Object.defineProperty(result,JAM_PROJECTION_REVISION,{value:revision});
    Object.defineProperty(result,JAM_PAGE_METADATA,{value:{revision,validUntil:null,observedAt:now,nextOffset:null}});
    return result;
  }};
  const options={env,service,now:()=>now,
    destinationReader:async()=>({repositoryId:'303',ownerId:'33',owner:'student',repo:'project',repositoryUrl:'https://github.com/student/project'}),
    visibilityReader:async()=>({revision,observedAt:now,isHeld:()=>false})};
  const response=await getJamResponse(request(),id,options);assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.event.entries,[]);assert.equal(body.event.galleryIncomplete,true);
  assert.doesNotMatch(JSON.stringify(body),/student\/project|"303"/);
});

test('real service pages verify bounded entries and reject a cursor after registry authority changes',async()=>{
  let proofs=0;
  const f=fixture({verifyRepository:async({actor})=>({repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:`${actor.login}/project`}}),
    pagesBindingReader:async(repository,url)=>{proofs++;return verifiedPages(repository,url);}});
  const proposed=await f.service.propose({actor:creator,operationId:'page-proposal-0001',manifest:hostedManifest()});
  const eventId=proposed.eventId;
  for(let i=0;i<9;i++) {
    const actor={id:String(100+i),login:`student${i}`};
    await f.service.mutate({id:eventId,actor,operationId:`page-join-${i}-0001`,action:'join',revision:proposed.revision,repositoryUrl:`https://github.com/${actor.login}/project`});
    await f.service.mutate({id:eventId,actor,operationId:`page-submit-${i}-01`,action:'submit',revision:proposed.revision,
      title:`Project ${i}`,description:'A project',demoUrl:`https://${actor.login}.github.io/project/`});
  }
  let observedAt=Date.parse('2030-01-03T12:00:00Z');f.setTime(observedAt);proofs=0;
  const options={env,service:f.service,now:()=>observedAt,
    destinationReader:async url=>{const login=new URL(url).pathname.split('/')[1],i=Number(login.slice(7));
      return {repositoryId:String(1100+i),ownerId:String(100+i),owner:login,repo:'project',repositoryUrl:url};},
    visibilityReader:async()=>projectVisibility(await f.store.snapshot(),observedAt)};
  const hidden=await getJamResponse(request(eventId,'view=moderation'),eventId,options);
  assert.equal(hidden.status,403);assert.doesNotMatch(await hidden.text(),/Project 0|student0/);
  const auth=newSession('ghu_'+'a'.repeat(24),{id:22,login:'maintainer'},28800,hubConfig(env),observedAt);
  const reviewRequest=new Request(`http://127.0.0.1:3000/api/jams/${eventId}?view=moderation`,{headers:{Cookie:auth.cookie.split(';')[0]}});
  const review=await getJamResponse(reviewRequest,eventId,options);
  assert.equal(review.status,200);assert.equal((await review.json()).moderationEntries.length,9);assert.equal(proofs,0);
  observedAt=Date.parse('2030-01-05T00:00:00Z');f.setTime(observedAt);
  const head=(await f.store.snapshot()).revision;
  const overview=await getJamResponse(request(eventId,'view=overview'),eventId,options);
  assert.equal(overview.status,200);assert.equal(Object.hasOwn((await overview.json()).event,'entries'),false);assert.equal(proofs,0);
  const first=await getJamResponse(request(eventId),eventId,options);assert.equal(first.status,200);
  const body=await first.json();assert.equal(body.event.entries.length,8);assert.equal(proofs,8);
  assert.equal(typeof body.nextCursor,'string');assert.doesNotMatch(JSON.stringify(body),new RegExp(head));
  const nextQuery=`view=gallery&cursor=${body.nextCursor}`;
  const second=await getJamResponse(request(eventId,nextQuery),eventId,options);assert.equal(second.status,200);
  assert.equal((await second.json()).event.entries.length,1);assert.equal(proofs,9);
  f.store.bump();
  const stale=await getJamResponse(request(eventId,nextQuery),eventId,options);
  assert.equal(stale.status,409);assert.doesNotMatch(await stale.text(),new RegExp(head));assert.equal(proofs,9);
});
