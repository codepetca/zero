import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {getJamsResponse,getJamResponse,postJamProposalResponse,postJamActionResponse} from '../lib/jams-http.mjs';
import {fixture,creator,maintainer,participant,submission,hostedManifest,verifiedPages} from '../../jams/test/fixtures.mjs';

for(const type of ['game','app'])test(`HTTP and actual engine complete hosted ${type} proposal, approval and repository-bound participation with ambiguous-write recovery`,async () => {
  const now = Date.parse('2030-01-02T12:00:00Z');
  let pagesAvailable=false,pagesCalls=0;
  const f = fixture({pagesBindingReader:async(repository,url)=>{pagesCalls++;return pagesAvailable?verifiedPages(repository,url):{status:'unverified',reason:'not-found'};}});
  const env = {NODE_ENV:'test',ZERO_JAMS_ENABLED:'1',ZERO_HUB_ORIGIN:'http://127.0.0.1:3025',
    ZERO_HUB_GITHUB_CLIENT_ID:zeroApp.clientId,ZERO_HUB_GITHUB_CLIENT_SECRET:'a'.repeat(32),
    ZERO_HUB_GITHUB_SESSION_SECRET:randomBytes(32).toString('base64url')};
  const config = hubConfig(env),origin=config.origin;
  function call(actor,path,body) {
    const login = newSession('ghu_'+'x'.repeat(24),{id:Number(actor.id),login:actor.login},28800,config,now);
    return new Request(origin+path,{method:body?'POST':'GET',headers:{Cookie:login.cookie.split(';')[0],
      ...(body?{Origin:origin,'Content-Type':'application/json','X-Hub-CSRF':login.session.csrf}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
  }
  const options = actor => ({env,now,service:f.service,
    fetchImpl:async () => Response.json({id:Number(actor.id),login:actor.login})});
  const proposalResponse = await postJamProposalResponse(call(creator,'/api/jams/proposals',{
    operationId:'http-propose-001',manifest:hostedManifest({type})}),options(creator));
  assert.equal(proposalResponse.status,200);
  const proposal = await proposalResponse.json();
  const id=proposal.eventId;assert.match(id,/^jam-zero-[a-f0-9]{32}$/);
  assert.equal(f.calls(),0);
  assert.equal((await getJamResponse(new Request(origin+`/api/jams/${id}`),id,options(participant))).status,200);
  const inbox = await getJamsResponse(call(maintainer,'/api/jams'),options(maintainer));
  assert.equal((await inbox.json()).proposals.length,0);assert.equal(proposal.status,'approved');
  const forged = await postJamActionResponse(call(creator,`/api/jams/${id}/actions`,{
    operationId:'http-approve-000',action:'approve',revision:proposal.revision}),id,options(creator));
  assert.equal(forged.status,403);
  const join = {operationId:'http-join-001',action:'join',revision:proposal.revision,repositoryUrl:'https://github.com/student/project'};
  f.store.afterCas = async () => {throw new Error('Connection lost after durable write');};
  assert.equal((await postJamActionResponse(call(participant,`/api/jams/${id}/actions`,join),id,options(participant))).status,503);
  f.store.afterCas = null;
  assert.equal((await postJamActionResponse(call(participant,`/api/jams/${id}/actions`,join),id,options(participant))).status,200);
  assert.equal((await f.service.read(id,participant)).entry,null);assert.equal(pagesCalls,0);
  const {actor:_actor,id:_id,source:_source,...entry} = submission(proposal.revision,{operationId:'http-submit-001'});
  assert.equal((await postJamActionResponse(call(participant,`/api/jams/${id}/actions`,{...entry,pagesVerification:{status:'verified'}}),id,options(participant))).status,400);
  assert.equal(pagesCalls,0);
  assert.equal((await postJamActionResponse(call(participant,`/api/jams/${id}/actions`,entry),id,options(participant))).status,503);
  assert.equal((await f.service.read(id,participant)).entry,null);
  pagesAvailable=true;
  assert.equal((await postJamActionResponse(call(participant,`/api/jams/${id}/actions`,entry),id,options(participant))).status,200);
  assert.equal(pagesCalls,2);
  const detail = await getJamResponse(call(participant,`/api/jams/${id}`),id,options(participant));
  const result = await detail.json();
  assert.equal(result.registration.status,'joined');assert.equal(result.event.participantCount,1);
  assert.equal(result.entry.repository.id,'202');assert.equal(result.entry.repository.commit,undefined);assert.equal(result.event.entries.length,0);assert.equal(result.event.galleryRevealed,false);
  assert.equal(result.entry.pagesVerification.repositoryId,'202');
  assert.equal(result.event.hosting,'zero');assert.deepEqual(result.event.creator,creator);
  assert.equal('operations' in result,false);assert.equal('token' in result,false);
  const withdraw={operationId:'http-withdraw-001',action:'withdraw'};
  assert.equal((await postJamActionResponse(call(participant,`/api/jams/${id}/actions`,withdraw),id,options(participant))).status,200);
  assert.equal((await f.service.read(id,participant)).event.entries.length,0);
  assert.equal(f.store.records.get(id).state.entries[participant.id][0].status,'active','Frozen accepted entry is retained');
});
