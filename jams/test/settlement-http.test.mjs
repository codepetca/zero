import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {createGitHubSourceVerifier} from '../github-source.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {githubHttpFixture,deferred} from './github-http-fixture.mjs';
import {creator,maintainer,participant,manifest,COMMIT,submission} from './fixtures.mjs';
async function fixture(t,limits={}) {
  const git=await atomicGitHttpFixture(t),sources=await githubHttpFixture(t);await git.store.migrate();
  const f={git,sources,time:Date.parse('2030-01-02T12:00Z')};
  f.service=createJamService({store:git.store,verifySource:createGitHubSourceVerifier({token:'http-fixture-only-token',fetchImpl:sources.fetchImpl}),maintainerIds:[maintainer.id],now:()=>f.time,limits});
  f.approve=async()=>{const p=await f.service.propose({actor:creator,operationId:'proposal-source',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT});await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-source',action:'approve',revision:p.revision});return p.revision;};
  return f;
}
const close=input=>{const {actor,id,operationId,...payload}=input;return {actor,scope:id||'proposals',operationId,payload};};
for(const winner of ['close','original'])test(`real HTTP branch transaction race: ${winner} wins against a delayed Join`,{timeout:10000},async t=>{
  const f=await fixture(t),revision=await f.approve(),input={actor:participant,id:'jam-101',operationId:'delayed-http-join',action:'join',revision};
  const ready=deferred(),release=deferred();let paused=false;
  f.git.beforeRef=async({call})=>{const closing=f.git.requests.find(r=>r.path.endsWith('/git/commits')&&r.method==='POST'&&r.body.message==='ZeroJams close request');if(!paused&&((winner==='close'&&!closing)||(winner==='original'&&closing))){paused=true;ready.resolve();await release.promise;}};
  const loser=winner==='close'?f.service.mutate(input):f.service.settle(close(input));await ready.promise;
  const first=winner==='close'?await f.service.settle(close(input)):await f.service.mutate(input);release.resolve();const last=await loser;
  assert.equal(first.settlement,winner==='close'?'not-applied':undefined);assert.equal(last.settlement,winner==='close'?'not-applied':'applied');assert.equal(f.git.state().registrations[participant.id]?.status,winner==='original'?'joined':undefined);
});
test('real HTTP submission source verification can finish after closing without publishing the entry',{timeout:10000},async t=>{
  const f=await fixture(t),revision=await f.approve();await f.service.mutate({actor:participant,id:'jam-101',operationId:'fixture-registration',action:'join',revision});
  const ready=deferred(),release=deferred();let paused=false;
  f.sources.beforeRequest=async({call})=>{if(!paused&&call.path==='/repos/student/project'){paused=true;ready.resolve();await release.promise;}};
  const input=submission(revision),pending=f.service.mutate(input);await ready.promise;assert.equal((await f.service.settle(close(input))).settlement,'not-applied');release.resolve();assert.equal((await pending).settlement,'not-applied');assert.equal(f.git.state().entries[participant.id],undefined);
});
test('real HTTP proposal with no event ID closes during source verification and never creates an event',{timeout:10000},async t=>{
  const f=await fixture(t),ready=deferred(),release=deferred();let paused=false;
  f.sources.beforeRequest=async({call})=>{if(!paused&&call.path==='/repos/creator/jam'){paused=true;ready.resolve();await release.promise;}};
  const input={actor:creator,operationId:'proposal-delayed',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT},pending=f.service.propose(input);await ready.promise;
  assert.equal((await f.service.settle(close(input))).settlement,'not-applied');release.resolve();assert.equal((await pending).settlement,'not-applied');assert.deepEqual(await f.git.store.list(),[]);
});
for(const loss of ['socket','malformed','timeout'])test(`real HTTP lost close ${loss} reply recovers one fence without reissuing the action`,{timeout:10000},async t=>{
  const f=await fixture(t),revision=await f.approve(),input=close({actor:participant,id:'jam-101',operationId:'unknown-http-close',action:'join',revision});
  let lose=true;f.git.afterRef=({req,res,json})=>{if(!lose)return;lose=false;if(loss==='socket'){req.socket.destroy();return true;}if(loss==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{broken');return true;}return true;};
  await assert.rejects(f.service.settle(input),{status:503});const count=f.git.commits.length;f.git.afterRef=null;f.sources.sourceUnavailable=true;f.time=Date.parse('2030-01-05');assert.equal((await f.service.settle(input)).settlement,'not-applied');assert.equal(f.git.commits.length,count);assert.equal(f.git.state().registrations[participant.id],undefined);
});
test('atomic runtime enforces the final event slot across simultaneous different-repository proposals',{timeout:10000},async t=>{
  const git=await atomicGitHttpFixture(t,{maxEvents:1});await git.store.migrate();
  const service=createJamService({store:git.store,maintainerIds:[maintainer.id],limits:{events:1},verifySource:async input=>({repository:{id:input.repositoryUrl.endsWith('/one')?'101':'102',ownerId:creator.id,fullName:input.repositoryUrl.slice('https://github.com/'.length),commit:input.commit},manifest:manifest()})});
  const ready=deferred();let arrivals=0;git.beforeRef=async()=>{if(++arrivals===2)ready.resolve();await ready.promise;};
  const result=await Promise.allSettled(['one','two'].map(name=>service.propose({actor:creator,operationId:'proposal-'+name,repositoryUrl:'https://github.com/creator/'+name,commit:COMMIT})));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.status,429);assert.equal((await git.store.list()).length,1);
});
