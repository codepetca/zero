import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as immediate} from 'node:timers/promises';
import {createJamService} from '../service.mjs';
import {digest,operationCounts} from '../schema.mjs';
import {projectVisibility} from '../project-visibility.mjs';
import {fixture,creator,maintainer,participant,hostedManifest,verifiedPages} from './fixtures.mjs';
import {createJamPagesAccess} from '../../website/lib/jam-pages-access.mjs';
import {createJamPagesAccessBinding} from '../../website/lib/jam-pages-access-binding.mjs';
import {createJamDestinationBindingReader} from '../../website/lib/jam-destination-binding.mjs';
import {getJamResponse} from '../../website/lib/jams-http.mjs';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};

// Synthetic scheduling only, not live GitHub capacity, quota or deployment
// acceptance. Provider requests have fixed 250ms latency; the stable registry is
// in memory and adds no modeled latency. Credentials and responses are fixtures.
test('100 workflow entries traverse thirteen actual HTTP pages with complete final-page visibility and moderation',async t=>{
  const f=fixture({limits:{participants:100},pagesBindingReader:verifiedPages});
  const proposal=await f.service.propose({actor:creator,operationId:'paged-capacity-proposal',manifest:hostedManifest()});
  const id=proposal.eventId,revision=proposal.revision;
  await f.service.mutate({id,actor:participant,operationId:'paged-capacity-join',action:'join',revision,repositoryUrl:'https://github.com/student/project'});
  await f.service.mutate({id,actor:participant,operationId:'paged-capacity-submit',action:'submit',revision,
    title:'Template',description:'Synthetic gallery fixture',demoUrl:'https://student.github.io/project/'});
  // Expand a valid submission in memory: write contention/durable admission is
  // outside this test. All observations below use the actual read composition.
  const state=f.store.records.get(id).state,template=structuredClone(state.entries[participant.id][0]);
  state.registrations={};state.entries={};
  for(let index=1;index<=100;index++) {
    const ownerId=String(1000+index),login=`student${ownerId}`;
    const repository={id:String(10000+index),ownerId,fullName:`${login}/project`},pagesUrl=`https://${login}.github.io/project/`;
    state.registrations[ownerId]={id:ownerId,login,status:'joined',revision,
      joinedAt:template.submittedAt,updatedAt:template.submittedAt,repository};
    state.entries[ownerId]=[{...template,participantId:ownerId,login,repository,demoUrl:pagesUrl,title:`Entry ${ownerId}`,
      revision:digest({ownerId}),pagesVerification:{...template.pagesVerification,pagesUrl,repositoryId:repository.id,ownerId}}];
  }
  const prereveal=await f.service.readPage(id,undefined,{offset:0});
  assert.deepEqual(prereveal.event.entries,[]);assert.equal(prereveal.event.galleryRevealed,false);
  const held=await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-04T12:00:00Z'));
  assert.equal(held.isHeld('10100'),true,'the hundredth repository remains held before reveal');
  const privateReview=await f.service.readModeration(id,maintainer);
  assert.equal(privateReview.moderationEntries.length,100);
  assert.equal(privateReview.moderationEntries.at(-1).participantId,'1100');
  const head=(await f.store.snapshot()).revision,epoch=Date.parse('2030-01-05T00:00:00Z');
  t.mock.timers.enable({apis:['setTimeout','Date'],now:epoch});
  let elapsed=0,calls=0,destinationCalls=0;
  const proofs=new Map(),destinations=new Set(),durations=[],seen=[],offsets=[];
  const providerSecret='PRIVATE_SYNTHETIC_PROVIDER_BODY';
  const repo=ownerId=>({id:ownerId+9000,name:'project',full_name:`student${ownerId}/project`,
    html_url:`https://github.com/student${ownerId}/project`,private:false,visibility:'public',
    owner:{id:ownerId,login:`student${ownerId}`,type:'User'},providerSecret});
  const transport=async(url,options)=>{
    calls++;await new Promise(resolve=>setTimeout(resolve,250));
    let body,status=200;
    if(url.endsWith('/access_tokens')) {
      const repositoryId=JSON.parse(options.body).repository_ids[0];
      body={token:'synthetic-private-installation-token',expires_at:new Date(Date.now()+3600000).toISOString(),
        permissions:{pages:'read',metadata:'read'},repository_selection:'selected',repositories:[repo(repositoryId-9000)],providerSecret};
      status=201;
    } else {
      const match=/^https:\/\/api\.github\.com\/repos\/student(\d+)\/project(?:\/|$)/.exec(url);
      assert.ok(match,'every repository call uses the injected synthetic provider');
      const ownerId=Number(match[1]),owner=`student${ownerId}`;
      if(url.endsWith('/installation'))body={id:ownerId,app_id:9,account:{id:ownerId,login:owner,type:'User'},
        target_id:ownerId,target_type:'User',suspended_at:null,permissions:{pages:'read',metadata:'read'},providerSecret};
      else if(url.endsWith('/pages'))body={html_url:`https://${owner}.github.io/project/`,public:true,status:null,build_type:'workflow',providerSecret};
      else if(url.includes('/deployments?'))body=Array.from({length:10},(_,index)=>({sha:String(index+1).padStart(40,'0'),providerSecret}));
      else if(url.includes('/pages/deployments/')) {
        // Nine supported negative candidates precede authenticated Pages success.
        status=url.endsWith(String(10).padStart(40,'0'))?200:404;
        body=status===200?{status:'succeed',providerSecret}:{message:providerSecret};
      } else body=repo(ownerId);
    }
    return Response.json(body,{status});
  };
  const observe=createJamPagesAccess({transport});
  const pagesBindingReader=createJamPagesAccessBinding({appId:9,createAppJwt:async()=> 'synthetic-private-app-jwt',
    observe:async(input,options)=>{
      const result=await observe(input,options);
      if(result.status==='observed')proofs.set(String(input.repositoryId),result.htmlUrl);
      return result;
    }});
  const bind=createJamDestinationBindingReader({fetchImpl:transport});
  const service=createJamService({store:f.store,limits:{participants:100},pagesBindingReader,maintainerIds:[maintainer.id],now:Date.now,
    verifySource:async()=>assert.fail('gallery reads do not verify source')});
  const readPage=service.readPage;service.readPage=(id,actor,options)=>{offsets.push(options.offset);return readPage(id,actor,options);};
  const options={service,env:{NODE_ENV:'test',ZERO_JAMS_ENABLED:'1',ZERO_HUB_ORIGIN:'http://127.0.0.1:3000',
    ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'synthetic-client-secret-0000000000',
    ZERO_HUB_GITHUB_SESSION_SECRET:Buffer.alloc(32,7).toString('base64url')},
    now:Date.now,deadlineNow:()=>elapsed,
    destinationReader:async(...args)=>{destinationCalls++;const result=await bind(...args);destinations.add(result.repositoryId);return result;},
    visibilityReader:async()=>projectVisibility(await f.store.snapshot(),Date.now())};

  let cursor=null;
  const sizes=[...Array(12).fill(8),4];
  for(const [pageIndex,size] of sizes.entries()) {
    proofs.clear();destinations.clear();
    const query=new URLSearchParams({view:'gallery'});if(cursor)query.set('cursor',cursor);
    const request=new Request(`http://127.0.0.1:3000/api/jams/${id}?${query}`);
    let response,settled=false;
    const started=elapsed,pending=getJamResponse(request,id,options).then(value=>{response=value;settled=true;});
    // Each page gets at most 18 virtual seconds; real event-loop turns only drain
    // the promise chains. No real provider calls or wall-clock sleeps are used.
    for(let step=0;!settled&&step<72;step++) {
      await immediate();elapsed+=250;t.mock.timers.tick(250);await immediate();
    }
    assert.equal(settled,true,'each page settles within its original HTTP budget');await pending;
    durations.push(elapsed-started);assert.ok(durations.at(-1)<18000);
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const raw=await response.text(),body=JSON.parse(raw);
    assert.doesNotMatch(raw,new RegExp(`${head}|PRIVATE_SYNTHETIC_PROVIDER_BODY|synthetic-private|nextOffset|observedAt|validUntil|pagesVerification`));
    assert.equal(body.event.entries.length,size);assert.equal(body.event.galleryIncomplete,undefined);
    const expected=Array.from({length:size},(_,index)=>String(1001+pageIndex*8+index));
    assert.deepEqual(body.event.entries.map(entry=>entry.participantId),expected);
    for(const entry of body.event.entries) {
      assert.equal(entry.demoUrl,`https://student${entry.participantId}.github.io/project/`);
      assert.equal(proofs.get(entry.repository.id),entry.demoUrl,'every link has fresh proof in this page');
      assert.equal(destinations.has(entry.repository.id),true,'every link passes current namespace identity binding');
      seen.push(entry.participantId);
    }
    cursor=body.nextCursor;
    if(pageIndex<sizes.length-1) {
      assert.equal(typeof cursor,'string');assert.match(cursor,/^[A-Za-z0-9_-]{40,4096}$/);
      assert.doesNotMatch(Buffer.from(cursor,'base64url').toString('utf8'),new RegExp(`${head}|"offset"|"revision"`));
    } else assert.equal(cursor,null);
    assert.equal((await f.store.snapshot()).revision,head);
    const completeCalls=calls;elapsed+=2000;t.mock.timers.tick(2000);await immediate();
    assert.equal(calls,completeCalls,'completed pages must not leave late provider work');
  }
  assert.deepEqual(seen,Array.from({length:100},(_,index)=>String(1001+index)));
  assert.equal(new Set(seen).size,100);assert.equal(destinationCalls,100);
  assert.equal(calls,100*16+100,'each workflow proof makes 16 requests, plus one namespace GET');
  assert.deepEqual(durations,Array(12).fill(8500).concat(4250));
  assert.deepEqual(offsets,Array.from({length:13},(_,index)=>index*8));
  // Exercise more safety writes than the prior 30-account pool's 32 slots.
  for(let index=61;index<=100;index++) {
    const removed=await service.mutate({id,actor:maintainer,operationId:`capacity-remove-entry-${index}`,action:'withdraw-entry',participantId:String(1000+index),reason:'Synthetic moderation after closure.'});
    assert.equal(removed.status,'withdrawn');
  }
  const moderation=await service.readModeration(id,maintainer);
  assert.equal(moderation.moderationEntries.length,60);
  assert.equal(moderation.moderationEntries.some(entry=>Number(entry.participantId)>1060),false);
  const final=f.store.records.get(id).state;
  assert.equal(operationCounts(final).safety,40);
  const history=final.entries['1100'];
  assert.equal(history.length,2);assert.equal(history[0].status,'active');
  assert.equal(history[1].moderatedBy,maintainer.id);assert.equal(history[1].previousRevision,history[0].revision);
});
