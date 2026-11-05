import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamPagesAccess} from '../../website/lib/jam-pages-access.mjs';
import {createJamPagesAccessBinding} from '../../website/lib/jam-pages-access-binding.mjs';
import {fixture,creator,maintainer,participant,hostedManifest} from './fixtures.mjs';
import {projectVisibility} from '../project-visibility.mjs';

const base='https://api.github.com/repos/student/project';
const pagesUrl='https://play.example.org/';
const jwt='synthetic-pages-app-jwt',token='synthetic-pages-installation-token';
const sha='a'.repeat(40);
const permissions={pages:'read',metadata:'read'};
const repository=()=>({id:202,name:'project',full_name:'student/project',private:false,visibility:'public',
  owner:{id:Number(participant.id),login:participant.login}});

// No default fetch or real credentials: all provider endpoints are exhaustively
// matched here. The actual observer and binding adapter remain unmodified.
function syntheticPages({workflow}) {
  let mode='unpublished',jwtCalls=0;
  const calls=[];
  const transport=async(url,options)=>{
    calls.push({url,method:options.method,authorization:options.headers.Authorization});
    assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);
    const auth=options.headers.Authorization;
    if(url===base){
      assert.equal(options.method,'GET');assert.equal(auth,`Bearer ${token}`);
      return Response.json({...repository(),...(mode==='wrong-repository'?{id:999}:{})});
    }
    if(url===`${base}/installation`){
      assert.equal(options.method,'GET');assert.equal(auth,`Bearer ${jwt}`);
      if(mode==='revoked')return new Response(null,{status:404});
      return Response.json({id:404,app_id:9,account:{id:Number(participant.id),login:participant.login,type:'User'},
        target_id:Number(participant.id),target_type:'User',suspended_at:null,permissions});
    }
    if(url==='https://api.github.com/app/installations/404/access_tokens'){
      assert.equal(options.method,'POST');assert.equal(auth,`Bearer ${jwt}`);
      assert.deepEqual(JSON.parse(options.body),{repository_ids:[202],permissions});
      return Response.json({token,expires_at:new Date(Date.now()+3_600_000).toISOString(),permissions,
        repository_selection:'selected',repositories:[repository()]},{status:201});
    }
    if(url===`${base}/pages`){
      assert.equal(options.method,'GET');assert.equal(auth,`Bearer ${token}`);
      if(mode==='unpublished')return new Response(null,{status:404});
      return Response.json({html_url:mode==='wrong-url'?'https://other.example.org/':pagesUrl,public:true,
        status:workflow?null:'built',...(workflow?{build_type:'workflow'}:{})});
    }
    if(url===`${base}/deployments?per_page=10&page=1`){
      assert.equal(options.method,'GET');assert.equal(auth,`Bearer ${token}`);
      return Response.json([{sha,status:'success',environment_url:'https://untrusted.example.org/'}]);
    }
    if(url===`${base}/pages/deployments/${sha}`){
      assert.equal(options.method,'GET');assert.equal(auth,`Bearer ${token}`);
      return Response.json({status:mode==='failed-deployment'?'failure':'succeed'});
    }
    assert.fail('Unexpected synthetic provider endpoint');
  };
  const observe=createJamPagesAccess({transport});
  return {calls,setMode(value){mode=value;},jwtCalls:()=>jwtCalls,
    binding:createJamPagesAccessBinding({observe,appId:9,createAppJwt:async()=>{jwtCalls++;return jwt;}})};
}

for(const type of ['game','app'])for(const workflow of [false,true]){
  test(`hosted ${type} ${workflow?'workflow':'built'} Pages access composes submission and fresh reveal authority`,async()=>{
    const access=syntheticPages({workflow}),f=fixture({pagesBindingReader:access.binding});
    const proposed=await f.service.propose({actor:creator,operationId:`access-${type}-propose`,manifest:hostedManifest({type})});
    const id=proposed.eventId;
    await assert.rejects(f.service.read(id),error=>error.status===404);
    await assert.rejects(f.service.mutate({id,actor:creator,operationId:`access-${type}-self`,action:'approve',revision:proposed.revision}),error=>error.status===403);
    await f.service.mutate({id,actor:maintainer,operationId:`access-${type}-approve`,action:'approve',revision:proposed.revision});
    await f.service.mutate({id,actor:participant,operationId:`access-${type}-join`,action:'join',revision:proposed.revision,
      repositoryUrl:'https://github.com/student/project'});
    assert.equal(access.calls.length,0,'Join before publication requires no Pages grant or observation');
    assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-02T12:00:00Z'))).isHeld('202'),true);
    const submit={id,actor:participant,operationId:`access-${type}-submit`,action:'submit',revision:proposed.revision,
      title:'Project',description:'A public project',demoUrl:pagesUrl,instructions:'Open the project.'};
    const beforeFailure=structuredClone(f.store.records.get(id));
    await assert.rejects(f.service.mutate(submit),error=>error.status===503);
    assert.deepEqual(f.store.records.get(id),beforeFailure,'unavailable Pages proof cannot create an entry or operation');
    access.setMode('wrong-url');
    await assert.rejects(f.service.mutate(submit),error=>error.status===503);
    assert.deepEqual(f.store.records.get(id),beforeFailure,'a mismatched reported URL cannot submit');
    access.setMode('available');
    const accepted=await f.service.mutate(submit);
    assert.equal(accepted.status,'submitted');
    const saved=structuredClone(f.store.records.get(id));
    assert.equal(saved.state.entries[participant.id].length,1);
    assert.deepEqual(saved.state.entries[participant.id][0].pagesVerification,{pagesUrl,repositoryId:'202',ownerId:participant.id,
      verifiedAt:'2030-01-02T12:00:00.000Z'});
    assert.doesNotMatch(JSON.stringify(saved),/synthetic-pages/,'credentials must never enter official records');
    const grantsBeforeReveal=access.jwtCalls();
    assert.deepEqual((await f.service.read(id)).event.entries,[]);
    assert.equal(access.jwtCalls(),grantsBeforeReveal,'a hidden gallery performs no Pages observation');

    f.setTime('2030-01-05T00:00:00Z');
    for(let n=0;n<2;n++){
      const prior=access.jwtCalls(),shown=await f.service.read(id);
      assert.equal(shown.event.entries.length,1);assert.equal(shown.event.entries[0].demoUrl,pagesUrl);
      assert.equal(access.jwtCalls(),prior+1,'every revealed public read obtains a fresh grant and Pages proof');
      assert.doesNotMatch(JSON.stringify(shown),/synthetic-pages|untrusted\.example/);
    }
    assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-05T00:00:00Z'))).isHeld('202'),false);
    for(const mode of ['revoked','wrong-url','wrong-repository',...(workflow?['failed-deployment']:[])]){
      access.setMode(mode);
      const prior=access.jwtCalls();
      assert.deepEqual((await f.service.read(id)).event.entries,[],`${mode} must omit the public entry`);
      assert.equal(access.jwtCalls(),prior+1);
      assert.deepEqual(f.store.records.get(id),saved,'failed fresh proof must preserve the durable entry');
      assert.ok((await f.service.read(id,participant)).entry,'the owner retains their accepted entry for recovery');
    }
    access.setMode('revoked');
    const beforeRecovery=access.calls.length;
    assert.deepEqual(await f.service.mutate(submit),accepted,'accepted original request recovers after deadline and access revocation');
    assert.equal(access.calls.length,beforeRecovery,'accepted recovery does not mint or re-verify Pages access');
    access.setMode('available');
    assert.equal((await f.service.read(id)).event.entries.length,1,'restored fresh proof restores public projection');
    assert.deepEqual(f.store.records.get(id),saved);
  });
}
