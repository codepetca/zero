import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {rendezvous} from './github-http-fixture.mjs';
import {creator,maintainer,hostedManifest,verifiedPages} from './fixtures.mjs';

test('30 participants contend and recover with bounded production retries', {timeout:120000}, async t=>{
  const f=await atomicGitHttpFixture(t,{timeoutMs:10000});
  await f.store.migrate();
  const service=createJamService({canCreateJam:()=>true,store:f.store,verifySource:async()=>{},maintainerIds:[maintainer.id],now:()=>Date.parse('2030-01-02T12:00:00Z'),
    verifyRepository:async ({actor})=>({repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:`${actor.login}/project`}}),
    pagesBindingReader:async (repo,url)=>verifiedPages({id:repo.id,ownerId:repo.ownerId},url)});
  const proposed=await service.propose({actor:creator,operationId:'classroom-propose',manifest:hostedManifest()});
  const id=proposed.eventId,revision=proposed.revision;
  const actors=Array.from({length:30},(_,i)=>({id:String(100+i),login:`student${i}`}));
  const joins=actors.map(actor=>({id,revision,actor,operationId:`join-${actor.id}-0001`,action:'join',repositoryUrl:`https://github.com/${actor.login}/project`}));
  const submits=actors.map(actor=>({id,revision,actor,operationId:`submit-${actor.id}-0001`,action:'submit',title:'Project',description:'A student project',demoUrl:`https://${actor.login}.github.io/project/`,instructions:'Open the project.'}));
  async function contend(inputs,label){
    f.beforeRef=rendezvous(inputs.length);
    const start=f.requests.length,commits=f.commits.length;
    let lostResponses=0;
    f.afterRef=({res,json})=>{if(lostResponses++)return false;json(res,503,{message:'synthetic lost success response'});return true;};
    const started=performance.now();
    const first=await Promise.allSettled(inputs.map(input=>service.mutate(input)));
    const firstElapsed=Math.round(performance.now()-started);
    const firstPatches=f.requests.slice(start).filter(request=>request.method==='PATCH').length;
    f.beforeRef=null;f.afterRef=null;
    const failures=first.flatMap((result,i)=>result.status==='rejected'?[i]:[]);
    const statuses=failures.map(i=>first[i].reason.status);
    assert.ok(statuses.includes(503),`${label}: a committed write must have an unknown response`);
    assert.ok(failures.length>0,`${label}: synthetic unknown response should require recovery`);
    assert.ok(statuses.every(status=>status===409||status===503),`${label}: unexpected failure statuses ${statuses}`);
    const results=[];
    for(let i=0;i<inputs.length;i++){
      const result=await service.mutate(inputs[i]);
      if(first[i].status==='fulfilled')assert.deepEqual(result,first[i].value);
      results.push(result);
    }
    const patches=f.requests.slice(start).filter(request=>request.method==='PATCH').length;
    const published=f.commits.length-commits;
    assert.equal(published,30,`${label}: retries must not duplicate commits`);
    t.diagnostic(`${label}: first-pass success=${30-failures.length}, retryable=${failures.length}, statuses=${JSON.stringify(statuses.reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{}))}, first-pass elapsed=${firstElapsed}ms, first-pass ref attempts=${firstPatches}, total ref attempts=${patches}, rejected ref attempts=${patches-published}, committed=${published}`);
    return results;
  }
  await contend(joins,'join');
  await contend(submits,'submit');
  const state=(await f.store.read(id)).state;
  assert.equal(Object.keys(state.registrations).length,30);
  assert.equal(Object.values(state.registrations).filter(x=>x.status==='joined').length,30);
  assert.equal(Object.keys(state.entries).length,30);
  assert.ok(actors.every(actor=>state.entries[actor.id]?.length===1));
  assert.equal(Object.keys(state.operations).length,61);
  await assert.rejects(service.mutate({...submits[0],title:'Changed'}),error=>error.status===409);
});
