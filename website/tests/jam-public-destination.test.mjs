import test from 'node:test';
import assert from 'node:assert/strict';
import {getJamsResponse,getJamResponse,MAX_PUBLIC_JAM_DESTINATIONS} from '../lib/jams-http.mjs';
import {createJamDestinationBindingReader} from '../lib/jam-destination-binding.mjs';
import {fixture,creator,maintainer,participant,hostedManifest} from '../../jams/test/fixtures.mjs';
import {JAM_PROJECTION_REVISION} from '../../jams/service.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';
import {hiddenJamsResponse} from '../lib/jams-visibility.mjs';
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};

const env={NODE_ENV:'development',ZERO_JAMS_ENABLED:'1'};
const now=Date.parse('2030-01-05T00:00:00Z');
const entry=(id='202',ownerId=id==='404'?'44':'33')=>({participantId:ownerId,title:`Project ${id}`,demoUrl:`https://submitted.example/project${id}/`,
  repository:{id,ownerId,fullName:`student/project${id}`}});
const binding=id=>({repositoryId:id,ownerId:id==='404'?'44':'33',owner:'student',repo:`project${id}`,repositoryUrl:`https://github.com/student/project${id}`});
const decision=(held=[])=>({revision:'f'.repeat(40),observedAt:now,isHeld:id=>held.includes(id)});
const request=signal=>new Request('http://127.0.0.1:3000/api/jams/jam-101',{signal});
function setup(entries=[entry(),entry('404')],extra={}) {
  const event={id:'jam-101',entries},privateEntry={...entry(),privateNote:'owner only'},registration={status:'joined'},proposal={repository:{fullName:'creator/jam'}};
  const tagged=value=>Object.defineProperty(value,JAM_PROJECTION_REVISION,{value:'f'.repeat(40)});
  const result=tagged({event,entry:privateEntry,registration,proposal,canMaintain:true});
  let destinationCalls=0,authorityCalls=0;
  const options={env,now,service:{list:async()=>tagged({events:[event],proposals:[proposal]}),read:async()=>result},
    destinationReader:async url=>{destinationCalls++;return binding(url.match(/project(\d+)$/)[1]);},
    visibilityReader:async()=>{authorityCalls++;return decision();},...extra};
  return {options,result,calls:()=>({destinationCalls,authorityCalls}),
    run:directory=>directory?getJamsResponse(request(),options):getJamResponse(request(),'jam-101',options)};
}

test('public list/detail omit a revealed namespace now occupied by a held repository; private records and submitted Pages remain unchanged',async()=>{
  for(const directory of [false,true]) {
    const seen=[];
    const f=setup(undefined,{destinationReader:async url=>url.endsWith('202')?{...binding('202'),repositoryId:'303'}:binding('404'),
      visibilityReader:async()=>({revision:'f'.repeat(40),observedAt:now,isHeld:id=>{seen.push(id);return id==='303';}})});
    const response=await f.run(directory);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json(),event=directory?body.events[0]:body.event;
    assert.deepEqual(event.entries,[entry('404')]);assert.equal(event.galleryIncomplete,undefined);assert.ok(seen.includes('202'));assert.ok(seen.includes('303'));
    if(!directory)assert.equal(event.entries[0].demoUrl,'https://submitted.example/project404/');
    if(!directory)for(const key of ['entry','registration','proposal'])assert.deepEqual(body[key],f.result[key]);
    assert.equal(f.result.event.entries.length,2,'Filtering must not mutate service state');
  }
});

test('fresh authority after bindings observes a newly accepted hold and owner/namespace mismatches suppress entries',async()=>{
  let bound=false,authorityCalls=0;
  const f=setup([entry()],{destinationReader:async()=>{bound=true;return binding('202');},visibilityReader:async()=>{
    authorityCalls++;assert.equal(bound,true);return decision(['202']);}});
  const response=await f.run(false);assert.deepEqual((await response.json()).event.entries,[]);assert.equal(authorityCalls,1);
  for(const replacement of [{...binding('202'),repositoryId:'999'},{...binding('202'),ownerId:'99'}]) {
    const changed=setup([entry()],{destinationReader:async()=>replacement});
    assert.deepEqual((await (await changed.run(false)).json()).event.entries,[]);
  }
});

test('legacy unpaged HTTP lanes do not expose a verification-warning bit after time-dependent holds',async()=>{
  const f=setup([]);f.result.event.galleryIncomplete=true;
  for(const directory of [false,true]) {
    const response=await f.run(directory);assert.equal(response.status,200);
    const body=await response.json(),event=directory?body.events[0]:body.event;
    assert.equal(event.galleryIncomplete,undefined);assert.deepEqual(event.entries,[]);
  }
});

test('legacy responses reject a clock rollback after the final visibility decision',async()=>{
  for(const directory of [false,true]) {
    const f=setup([entry()],{now:()=>now-1,visibilityReader:async()=>decision()});
    const response=await f.run(directory);assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/project202|submitted\.example|owner only/);
  }
});

test('provider and authority failures deny the complete public projection with sanitized no-store errors',async()=>{
  for(const directory of [false,true])for(const extra of [
    {destinationReader:async()=>{throw Error('PRIVATE_PROVIDER_FAILURE');}},
    {destinationReader:async()=>({...binding('202'),repositoryId:undefined})},
    {visibilityReader:async()=>{throw Error('PRIVATE_AUTHORITY_FAILURE');}},
    {visibilityReader:async()=>null},{visibilityReader:async()=>decision().isHeld},
    {visibilityReader:async()=>({...decision(),isHeld:()=>undefined})}]) {
    const f=setup([entry()],extra),response=await f.run(directory);
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(await response.text(),/PRIVATE_|project202|owner only/);
  }
});

test('one bounded request budget and cancellation stop stalled service/binding/authority work',async()=>{
  for(const stage of ['service','binding','authority'])for(const cancelled of [false,true]) {
    const controller=new AbortController();let started,signal;
    const ready=new Promise(resolve=>{started=resolve;});
    const stall=observed=>{signal=observed;started();return new Promise(()=>{});};
    const f=setup([entry()],{responseBudgetMs:25,
      ...(stage==='service'?{service:{read:()=>stall()}}:stage==='binding'?{destinationReader:(_url,options)=>stall(options.signal)}:
        {visibilityReader:options=>stall(options.signal)})});
    const pending=getJamResponse(request(controller.signal),'jam-101',f.options);
    await ready;if(cancelled)controller.abort();
    const response=await pending;assert.equal(response.status,503);if(signal)assert.equal(signal.aborted,true);
  }
});

test('destination admission is bounded, deduplicated and absent galleries need no destination or authority read',async()=>{
  let active=0,peak=0,calls=0;
  const f=setup(Array.from({length:8},(_,i)=>entry(String(i+1))),{destinationReader:async url=>{
    active++;calls++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return binding(url.match(/project(\d+)$/)[1]);}});
  assert.equal((await f.run(false)).status,200);assert.equal(calls,8);assert.equal(peak,4);
  const duplicate=setup([entry(),entry()]);assert.equal((await duplicate.run(false)).status,200);assert.equal(duplicate.calls().destinationCalls,1);
  const excess=setup(Array.from({length:MAX_PUBLIC_JAM_DESTINATIONS+1},(_,i)=>entry(String(i+1))));
  assert.equal((await excess.run(false)).status,503);assert.deepEqual(excess.calls(),{destinationCalls:0,authorityCalls:0});
  const empty=setup([]);assert.equal((await empty.run(false)).status,200);assert.deepEqual(empty.calls(),{destinationCalls:0,authorityCalls:0});
});

test('directory keeps valid events and the review inbox when aggregate galleries exceed the lookup budget',async()=>{
  const first=Array.from({length:100},(_,i)=>entry(String(i+1)));
  const second=Array.from({length:101},(_,i)=>entry(String(i+101)));
  const proposals=[{id:'jam-103',title:'Pending'}];
  const events=[{id:'jam-101',title:'First',entries:first},{id:'jam-102',title:'Second',entries:second}];
  let calls=0;
  const response=await getJamsResponse(request(),{env,now,service:{list:async()=>({events,proposals})},
    destinationReader:async()=>{calls++;throw Error('Must not fetch when deferring');},
    visibilityReader:async()=>{throw Error('No links exposed');}});
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.galleriesDeferred,true);assert.deepEqual(result.events.map(event=>event.id),['jam-101','jam-102']);
  assert.ok(result.events.every(event=>!Object.hasOwn(event,'entries')));assert.deepEqual(result.proposals,proposals);
  assert.equal(calls,0);assert.equal(response.headers.get('cache-control'),'no-store');
});

test('actual hosted service and current public GitHub binding reject reused source identity across galleries',async()=>{
  const f=fixture({verifyRepository:async({repositoryUrl,repositoryId,actor})=>{const held=repositoryId==='303'||repositoryUrl?.endsWith('held');return {repository:{id:held?'303':'202',ownerId:actor.id,fullName:`student/${held?'held':'project202'}`}};},
    pagesBindingReader:async(repository,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repository.id,ownerId:repository.ownerId})});
  const approved=async(op,reveal)=>{
    const proposal=await f.service.propose({actor:{id:String(110+f.store.records.size),login:'creator'+f.store.records.size},operationId:`proposal-${op}`,manifest:hostedManifest({schedule:{...hostedManifest().schedule,galleryRevealAt:reveal}})});
    return proposal;
  };
  const old=await approved('old-0001','2030-01-05T00:00:00Z'),held=await approved('held-0001','2030-01-08T00:00:00Z');
  for(const [proposal,repo]of [[old,'project202'],[held,'held']])await f.service.mutate({id:proposal.eventId,actor:participant,operationId:`join-${repo}-0001`,action:'join',revision:proposal.revision,repositoryUrl:`https://github.com/student/${repo}`});
  await f.service.mutate({id:old.eventId,actor:participant,operationId:'submit-old-0001',action:'submit',revision:old.revision,title:'Project',description:'A project',demoUrl:'https://student.github.io/project202/'});
  f.setTime(now);
  assert.equal((await f.service.read(old.eventId)).event.entries.length,1,'Stored ID202 is revealed before HTTP destination checks');
  const destinationReader=createJamDestinationBindingReader({fetchImpl:async url=>{
    assert.equal(url,'https://api.github.com/repos/student/project202');
    return Response.json({id:303,owner:{id:33,type:'User',login:'student'},name:'project202',full_name:'student/project202',html_url:'https://github.com/student/project202',private:false});}});
  const options={env,now,service:f.service,destinationReader,
    visibilityReader:async()=>projectVisibility(await f.store.snapshot(),now)};
  const detail=await getJamResponse(request(),old.eventId,options);assert.equal(detail.status,200);assert.deepEqual((await detail.json()).event.entries,[]);
  const list=await getJamsResponse(request(),options);assert.equal(list.status,200);assert.ok((await list.json()).events.every(event=>event.entries.length===0));
  assert.equal(hiddenJamsResponse({NODE_ENV:'production',VERCEL_ENV:'production'}).status,404);
});


test('directory preserves eligible public entries without moderation supplements; authorized detail retains suppressed entries once',async()=>{
  const f=setup();
  const directory=await f.run(true);assert.equal(directory.status,200);const listing=await directory.json();
  assert.deepEqual(listing.events[0].entries,[entry(),entry('404')]);assert.equal('moderationEntries' in listing,false);
  const authEnv={...env,ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,
    ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32,7).toString('base64url')};
  const config=hubConfig(authEnv),login=newSession('ghu_'+'a'.repeat(24),{id:22,login:'maintainer'},28800,config,now);
  const signed=()=>new Request('http://127.0.0.1:3000/api/jams/jam-101',{headers:{Cookie:login.cookie.split(';')[0]}});
  for(const authenticated of [false,true])for(const canMaintain of [false,true]) {
    const g=setup(undefined,{env:authEnv,destinationReader:async url=>url.endsWith('202')?{...binding('202'),repositoryId:'303'}:binding('404')});
    g.result.canMaintain=canMaintain;
    if(authenticated&&canMaintain)g.result.moderationEntries=[{...entry(),privateModerationNote:'existing entry'}];
    const response=await getJamResponse(authenticated?signed():request(),'jam-101',g.options);assert.equal(response.status,200);
    const body=await response.json();assert.deepEqual(body.event.entries,[entry('404')]);
    if(authenticated&&canMaintain){assert.equal(body.moderationEntries.length,1);assert.equal(body.moderationEntries[0].participantId,'33');assert.equal(body.moderationEntries[0].privateModerationNote,'existing entry');}
    else assert.equal('moderationEntries' in body,false);
  }
  // A newly suppressed participant is added when service moderation has none.
  const g=setup([entry()],{env:authEnv,destinationReader:async()=>({...binding('202'),repositoryId:'303'})});
  const body=await (await getJamResponse(signed(),'jam-101',g.options)).json();assert.deepEqual(body.moderationEntries,[entry()]);
});

async function actualGallery() {
  const f=fixture({verifyRepository:async({actor})=>({repository:{id:'202',ownerId:actor.id,fullName:'student/project202'}}),
    pagesBindingReader:async(repository,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repository.id,ownerId:repository.ownerId})});
  const proposal=await f.service.propose({actor:creator,operationId:'race-proposal-001',manifest:hostedManifest()});
  const id=proposal.eventId;
  await f.service.mutate({id,actor:participant,operationId:'race-join-001',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student/project202'});
  await f.service.mutate({id,actor:participant,operationId:'race-submit-001',action:'submit',revision:proposal.revision,title:'Original public entry',description:'Original entry details',demoUrl:'https://student.github.io/project202/'});
  f.setTime(now);
  return {...f,id,options:{env,now,service:f.service,destinationReader:async()=>binding('202'),visibilityReader:async()=>projectVisibility(await f.store.snapshot(),now)}};
}

for(const directory of [false,true])test(`actual ${directory?'list':'detail'} fails closed when registry changes during HTTP destination observation`,async()=>{
  for(const action of ['withdraw-entry','replace-entry','suspend','cancel','unrelated-registry-write']) {
    const f=await actualGallery();let changed=false;
    const options={...f.options,destinationReader:async()=>{
      assert.equal(changed,false);changed=true;
      if(action==='replace-entry') {
        // A publication prepared while submissions were open may reach its CAS
        // after closure. Model that valid immutable successor directly.
        const {digest,validateState}=await import('../../jams/schema.mjs');
        const snapshot=await f.store.snapshot(),next=(await snapshot.read(f.id)).state,history=next.entries[participant.id],previous=history.at(-1);
        history.push({...previous,title:'Replacement public entry',revision:digest({replacement:true}),previousRevision:previous.revision});
        validateState(next,f.id);assert.equal(await f.store.compareAndSwap(f.id,snapshot.revision,next),true);
      } else if(action==='unrelated-registry-write') {
        await f.service.propose({actor:creator,operationId:'race-other-proposal',manifest:hostedManifest({schedule:{...hostedManifest().schedule,galleryRevealAt:'2030-01-08T00:00:00Z'}})});
      } else await f.service.mutate({id:f.id,actor:maintainer,operationId:`race-${action}-001`,action,reason:'Independent moderation during lookup.',...(action==='withdraw-entry'?{participantId:participant.id}:{})});
      return binding('202');
    }};
    const response=directory?await getJamsResponse(request(),options):await getJamResponse(request(),f.id,options);
    assert.equal(changed,true);assert.equal(response.status,503,action);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(await response.text(),/Original public entry|Replacement public entry|student\/project202|github.io|moderationEntries/);
    if(action==='withdraw-entry') {
      const retry=directory?await getJamsResponse(request(),f.options):await getJamResponse(request(),f.id,f.options);
      assert.equal(retry.status,200);const body=await retry.json();assert.deepEqual((directory?body.events[0]:body.event).entries,[]);
    }
  }
});

test('actual unchanged projections retain private maintainer data without exposing internal revision provenance',async()=>{
  const f=await actualGallery(),head=(await f.store.snapshot()).revision;
  const list=await f.service.list(maintainer),detail=await f.service.read(f.id,maintainer);
  for(const value of [list,detail]) {
    assert.equal(value[JAM_PROJECTION_REVISION],head);
    assert.equal(Object.getOwnPropertyDescriptor(value,JAM_PROJECTION_REVISION).enumerable,false);
    assert.equal(Object.getOwnPropertySymbols({...value}).length,0);
    assert.doesNotMatch(JSON.stringify(value),new RegExp(head));
  }
  const authEnv={...env,ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,
    ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32,8).toString('base64url')};
  const login=newSession('ghu_'+'a'.repeat(24),{id:22,login:'maintainer'},28800,hubConfig(authEnv),now);
  const signed=()=>new Request(`http://127.0.0.1:3000/api/jams/${f.id}`,{headers:{Cookie:login.cookie.split(';')[0]}});
  for(const directory of [false,true]) {
    const options={...f.options,env:authEnv},response=directory?await getJamsResponse(signed(),options):await getJamResponse(signed(),f.id,options);
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();assert.equal((directory?body.events[0]:body.event).entries[0].title,'Original public entry');
    assert.doesNotMatch(JSON.stringify(body),new RegExp(head));
    if(directory)assert.deepEqual(body.proposals,list.proposals);
    else {assert.deepEqual(body.proposal,detail.proposal);assert.deepEqual(body.moderationEntries,detail.moderationEntries);}
  }
});

test('missing projection provenance and mismatched fresh authority deny nonempty galleries before serialization',async()=>{
  for(const directory of [false,true]) {
    const f=setup([entry()]),original=directory?f.options.service.list:f.options.service.read;
    f.options.service[directory?'list':'read']=async()=>({...await original()});
    const missing=await f.run(directory);assert.equal(missing.status,503);assert.deepEqual(f.calls(),{destinationCalls:0,authorityCalls:0});
    const changed=setup([entry()],{visibilityReader:async()=>({...decision(),revision:'e'.repeat(40)})});
    const response=await changed.run(directory);assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(await response.text(),/project202|owner only/);
  }
});
