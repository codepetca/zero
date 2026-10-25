import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {hubConfig,newSession} from '../lib/hub-github-auth.mjs';
import {getJamsResponse,getJamResponse,postJamProposalResponse,postJamActionResponse} from '../lib/jams-http.mjs';
import {fixture,creator,maintainer,participant,COMMIT,submission} from '../../jams/test/fixtures.mjs';

test('HTTP and actual engine complete creator admission, maintainer inbox and participant flow with ambiguous-write recovery',async () => {
  const now = Date.parse('2030-01-02T12:00:00Z');
  const f = fixture();
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
    operationId:'http-propose-001',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}),options(creator));
  assert.equal(proposalResponse.status,200);
  const proposal = await proposalResponse.json();
  assert.equal(proposal.eventId,'jam-101');
  assert.equal((await getJamResponse(new Request(origin+'/api/jams/jam-101'),'jam-101',options(participant))).status,404);
  const inbox = await getJamsResponse(call(maintainer,'/api/jams'),options(maintainer));
  assert.equal((await inbox.json()).proposals[0].id,'jam-101');
  const forged = await postJamActionResponse(call(creator,'/api/jams/jam-101/actions',{
    operationId:'http-approve-000',action:'approve',revision:proposal.revision}),'jam-101',options(creator));
  assert.equal(forged.status,403);
  const approval = await postJamActionResponse(call(maintainer,'/api/jams/jam-101/actions',{
    operationId:'http-approve-001',action:'approve',revision:proposal.revision}),'jam-101',options(maintainer));
  assert.equal(approval.status,200);
  const join = {operationId:'http-join-001',action:'join',revision:proposal.revision};
  f.store.afterCas = async () => {throw new Error('Connection lost after durable write');};
  assert.equal((await postJamActionResponse(call(participant,'/api/jams/jam-101/actions',join),'jam-101',options(participant))).status,503);
  f.store.afterCas = null;
  assert.equal((await postJamActionResponse(call(participant,'/api/jams/jam-101/actions',join),'jam-101',options(participant))).status,200);
  const {actor:_actor,id:_id,...entry} = submission(proposal.revision,{operationId:'http-submit-001'});
  assert.equal((await postJamActionResponse(call(participant,'/api/jams/jam-101/actions',entry),'jam-101',options(participant))).status,200);
  const detail = await getJamResponse(call(participant,'/api/jams/jam-101'),'jam-101',options(participant));
  const result = await detail.json();
  assert.equal(result.registration.status,'joined');assert.equal(result.event.participantCount,1);
  assert.equal(result.entry.repository.commit,COMMIT);assert.equal(result.event.entries.length,1);
  assert.equal('operations' in result,false);assert.equal('token' in result,false);
  const withdraw={operationId:'http-withdraw-001',action:'withdraw'};
  assert.equal((await postJamActionResponse(call(participant,'/api/jams/jam-101/actions',withdraw),'jam-101',options(participant))).status,200);
  assert.equal((await f.service.read('jam-101',participant)).event.entries.length,0);
  assert.equal(f.store.records.get('jam-101').state.entries[participant.id][0].status,'active','Frozen accepted entry is retained');
});
