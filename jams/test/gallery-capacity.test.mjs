import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as immediate} from 'node:timers/promises';
import {createJamService} from '../service.mjs';
import {digest} from '../schema.mjs';
import {fixture,creator,maintainer,participant,hostedManifest,verifiedPages} from './fixtures.mjs';
import {createJamPagesAccess} from '../../website/lib/jam-pages-access.mjs';
import {createJamPagesAccessBinding} from '../../website/lib/jam-pages-access-binding.mjs';
import {getJamResponse} from '../../website/lib/jams-http.mjs';

// Synthetic scheduling evidence only: this models fixed transport latency and
// valid provider responses. It does not establish live GitHub capacity or quota.
test('30 workflow gallery proofs exceed one HTTP deadline without returning partial success',async t=>{
  const f=fixture({pagesBindingReader:verifiedPages});
  const proposal=await f.service.propose({actor:creator,operationId:'capacity-proposal-01',manifest:hostedManifest()});
  const id=proposal.eventId,revision=proposal.revision;
  await f.service.mutate({id,actor:maintainer,operationId:'capacity-approve-01',action:'approve',revision});
  await f.service.mutate({id,actor:participant,operationId:'capacity-join-01',action:'join',revision,repositoryUrl:'https://github.com/student/project'});
  await f.service.mutate({id,actor:participant,operationId:'capacity-submit-01',action:'submit',revision,
    title:'Private capacity entry',description:'Synthetic gallery fixture',demoUrl:'https://student.github.io/project/'});

  // Expand one valid submitted record in memory. This test measures the read
  // schedule, not concurrent registration/submission writes or durable capacity.
  const state=f.store.records.get(id).state,template=structuredClone(state.entries[participant.id][0]);
  state.registrations={};state.entries={};
  for(let index=1;index<=30;index++) {
    const ownerId=String(1000+index),login=`student${ownerId}`;
    const repository={id:String(10000+index),ownerId,fullName:`${login}/project`};
    const pagesUrl=`https://${login}.github.io/project/`;
    state.registrations[ownerId]={id:ownerId,login,status:'joined',revision,
      joinedAt:template.submittedAt,updatedAt:template.submittedAt,repository};
    state.entries[ownerId]=[{...template,participantId:ownerId,login,repository,demoUrl:pagesUrl,
      revision:digest({ownerId}),pagesVerification:{...template.pagesVerification,
        pagesUrl,repositoryId:repository.id,ownerId}}];
  }

  t.mock.timers.enable({apis:['setTimeout']});
  let elapsed=0,calls=0,observationsSucceeded=0,destinationCalls=0;
  const providerBody='PRIVATE_SYNTHETIC_PROVIDER_BODY';
  const repo=ownerId=>({id:ownerId+9000,name:'project',full_name:`student${ownerId}/project`,
    private:false,visibility:'public',owner:{id:ownerId,login:`student${ownerId}`},providerBody});
  const observe=createJamPagesAccess({transport:async(url,options)=>{
    calls++;
    await new Promise(resolve=>setTimeout(resolve,250));
    let body,status=200;
    if(url.endsWith('/access_tokens')) {
      const repositoryId=JSON.parse(options.body).repository_ids[0];
      body={token:'synthetic-private-installation-token',expires_at:new Date(Date.now()+3600000).toISOString(),
        permissions:{pages:'read',metadata:'read'},repository_selection:'selected',
        repositories:[repo(repositoryId-9000)],providerBody};
      status=201;
    } else {
      const match=/\/repos\/student(\d+)\/project(?:\/|$)/.exec(url);
      assert.ok(match,'all repository requests use the synthetic repository');
      const ownerId=Number(match[1]),owner=`student${ownerId}`;
      if(url.endsWith('/installation')) {
        body={id:ownerId,app_id:9,account:{id:ownerId,login:owner,type:'User'},
          target_id:ownerId,target_type:'User',suspended_at:null,
          permissions:{pages:'read',metadata:'read'},providerBody};
      } else if(url.endsWith('/pages')) {
        body={html_url:`https://${owner}.github.io/project/`,public:true,status:null,build_type:'workflow',providerBody};
      } else if(url.includes('/deployments?')) {
        body=Array.from({length:10},(_,index)=>({sha:String(index+1).padStart(40,'0'),providerBody}));
      } else if(url.includes('/pages/deployments/')) {
        // The tenth candidate is valid; preceding 404s are supported negatives.
        status=url.endsWith(String(10).padStart(40,'0'))?200:404;
        body=status===200?{status:'succeed',providerBody}:{message:providerBody};
      } else body=repo(ownerId);
    }
    return Response.json(body,{status});
  }});
  const reader=createJamPagesAccessBinding({appId:9,createAppJwt:async()=> 'synthetic-private-app-jwt',
    observe:async(...args)=>{
      const result=await observe(...args);
      if(result.status==='observed')observationsSucceeded++;
      return result;
    }});
  const now=()=>Date.parse('2030-01-05T00:00:00Z');
  const service=createJamService({store:f.store,pagesBindingReader:reader,maintainerIds:[maintainer.id],now,
    verifySource:async()=>assert.fail('gallery reads do not verify source')});
  let response,settled=false;
  const pending=getJamResponse(new Request(`http://127.0.0.1:3000/api/jams/${id}`),id,{
    service,env:{NODE_ENV:'test',ZERO_JAMS_ENABLED:'1'},now,deadlineNow:()=>elapsed,
    destinationReader:async()=>{destinationCalls++;assert.fail('the unfinished proof pass must not reach HTTP destinations');},
    visibilityReader:async()=>assert.fail('the unfinished proof pass must not reach final HTTP authority')
  }).then(value=>{response=value;settled=true;});

  // Give each virtual transport completion a real event-loop turn to drain its
  // promise chain. At most 20 seconds of virtual time, with no wall-clock sleeps.
  for(let step=0;!settled&&step<80;step++) {
    await immediate();elapsed+=250;t.mock.timers.tick(250);await immediate();
  }
  assert.equal(settled,true,'the request must settle within bounded virtual time');
  await pending;
  assert.equal(elapsed,18000);
  assert.ok(observationsSucceeded>0&&observationsSucceeded<30,'some proofs succeed before the whole request expires');
  assert.equal(destinationCalls,0);
  assert.equal(response.status,503,'a deadline cannot turn a partially verified gallery into HTTP success');
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.text();
  assert.doesNotMatch(body,/PRIVATE_SYNTHETIC_PROVIDER_BODY|synthetic-private|Private capacity entry|student1001|github\.io|"event"|"entries"/);
  assert.equal(typeof JSON.parse(body).error,'string');
  const callsAtExpiry=calls;
  elapsed+=2000;t.mock.timers.tick(2000);await immediate();
  assert.equal(calls,callsAtExpiry,'late completions must not dispatch another provider request');
});
