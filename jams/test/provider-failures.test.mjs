import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJamService} from '../service.mjs';
import {createGitHubSourceVerifier} from '../github-source.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {githubHttpFixture} from './github-http-fixture.mjs';
import {creator,maintainer,participant,COMMIT,submission} from './fixtures.mjs';

const TOKEN='http-fixture-only-token';
const diagnostic='private-provider-detail Bearer fixture-token must never escape';
const unavailable=error=>error.status===503&&!/private-provider-detail|Bearer|fixture-token|127\.0\.0\.1|ECONNRESET|TimeoutError/.test(error.message);
const join=revision=>({actor:participant,id:'jam-101',operationId:'provider-join-001',action:'join',revision});
const close=({actor,id,operationId,...payload})=>({actor,scope:id||'proposals',operationId,payload});
const writes=requests=>requests.filter(call=>call.method!=='GET');
const at=(call,stage)=>stage==='ref'?call.method==='PATCH':call.method==='POST'&&call.path.endsWith(`/git/${stage}`);
const blobSha=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

// Both adapters retain their production URL/auth/transport checks; only their
// network destinations are translated to independent real loopback listeners.
async function fixture(t,{approve=true}={}) {
  const git=await atomicGitHttpFixture(t),sources=await githubHttpFixture(t);
  await git.store.migrate();
  const f={git,sources,time:Date.parse('2030-01-02T12:00:00Z')};
  f.makeService=(timeoutMs=2000)=>createJamService({
    store:git.makeStore({timeoutMs}),
    verifySource:createGitHubSourceVerifier({token:TOKEN,fetchImpl:sources.fetchImpl,timeoutMs}),
    maintainerIds:[maintainer.id],now:()=>f.time,
  });
  f.service=f.makeService();
  if(approve) {
    const p=await f.service.propose({actor:creator,operationId:'provider-proposal',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT});
    await f.service.mutate({actor:maintainer,id:'jam-101',operationId:'provider-approve',action:'approve',revision:p.revision});
    f.revision=p.revision;
  }
  return f;
}
function before(f) {
  return {head:f.git.head,files:f.git.files,commits:f.git.commits.length,requests:f.git.requests.length,sources:f.sources.requests.length};
}
function unchanged(f,old) {
  assert.equal(f.git.head,old.head);
  assert.equal(f.git.commits.length,old.commits);
  assert.deepEqual(f.git.files,old.files,'unpublished staged objects cannot change authoritative files');
}
async function recoverJoin(f,input,old) {
  const result=await f.makeService().mutate(input);
  assert.equal(result.status,'joined');
  assert.equal(f.git.commits.length,old.commits+1);
  assert.deepEqual(Object.keys(f.git.state().registrations),[participant.id]);
  assert.equal(Object.keys(f.git.state().operations).length,3);
  const published=before(f);
  assert.deepEqual(await f.makeService().mutate(input),result);
  assert.equal((await f.makeService().settle(close(input))).settlement,'applied');
  unchanged(f,published);
  assert.equal(writes(f.git.requests.slice(published.requests)).length,0);
  assert.equal(Object.keys((await f.git.store.snapshot()).settlements.operations).length,0);
}
async function recoverClose(f,input,old) {
  const result=await f.makeService().settle(close(input));
  assert.equal(result.settlement,'not-applied');
  assert.equal(f.git.commits.length,old.commits+1);
  const published=before(f);
  assert.deepEqual(await f.makeService().settle(close(input)),result);
  assert.deepEqual(await f.makeService().mutate(input),result);
  unchanged(f,published);
  assert.equal(writes(f.git.requests.slice(published.requests)).length,0);
  assert.equal(f.git.state().registrations[participant.id],undefined);
  assert.equal(Object.keys(f.git.state().operations).length,2);
  assert.equal(Object.keys((await f.git.store.snapshot()).settlements.operations).length,1);
}

// Unlike the retired Contents writer, this exercises every staging boundary and
// the sole authoritative branch PATCH. A Retry-After does not imply acceptance.
for(const code of [403,429,500,503])for(const stage of ['blobs','trees','commits','ref']) {
  const closing=['trees','ref'].includes(stage);
  test(`atomic ${closing?'close':'join'}: provider ${code} at ${stage} remains unavailable and exact retry publishes once`,{timeout:10000},async t=>{
    const f=await fixture(t),old=before(f),input=join(f.revision);
    f.git.beforeRequest=({call,res,json})=>{
      if(!at(call,stage))return;
      if(code===429)res.setHeader('Retry-After','120');
      json(res,code,{message:diagnostic});return true;
    };
    await assert.rejects(closing?f.service.settle(close(input)):f.service.mutate(input),unavailable);
    unchanged(f,old);
    const attempts=f.git.requests.slice(old.requests);
    assert.equal(attempts.filter(call=>at(call,stage)).length,1,'provider refusal is not automatically retried');
    assert.equal(attempts.some(call=>call.method==='PUT'),false,'never fall back to the retired Contents writer');
    if(stage!=='ref')assert.equal(attempts.some(call=>call.method==='PATCH'),false);
    f.git.beforeRequest=null;
    await (closing?recoverClose(f,input,old):recoverJoin(f,input,old));
  });
}

for(const stage of ['blobs','trees','commits'])for(const loss of ['socket','timeout']) {
  test(`atomic staging ${stage} ${loss} reply loss never publishes and a same-ID join recovers`,{timeout:10000},async t=>{
    const f=await fixture(t),old=before(f),input=join(f.revision);let intercepted=0;
    f.git.beforeRequest=({call,req,res})=>{
      if(!at(call,stage))return;
      intercepted++;
      // The fixture still creates the Git object. Lose only the reply, before
      // any branch PATCH is possible; these objects are non-authoritative.
      res.end=()=>{if(loss==='socket')req.socket.destroy();};
    };
    await assert.rejects(f.makeService(250).mutate(input),unavailable);
    assert.equal(intercepted,1);unchanged(f,old);
    assert.equal(f.git.requests.slice(old.requests).some(call=>call.method==='PATCH'),false);
    f.git.beforeRequest=null;await recoverJoin(f,input,old);
  });
}

for(const loss of ['socket','malformed','timeout']) {
  test(`atomic join accepted before ${loss} reply loss recovers after deadline without another write or fence`,{timeout:10000},async t=>{
    const f=await fixture(t),old=before(f),input=join(f.revision);
    f.git.afterRef=({req,res})=>{
      if(loss==='socket')req.socket.destroy();
      if(loss==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{broken');}
      return true;
    };
    await assert.rejects(f.makeService(250).mutate(input),unavailable);
    assert.equal(f.git.commits.length,old.commits+1);
    const accepted=f.git.state().operations[`${participant.id}:${input.operationId}`].result,published=before(f);
    f.git.afterRef=null;f.sources.sourceUnavailable=true;f.time=Date.parse('2030-01-05T00:00:00Z');
    assert.deepEqual(await f.makeService().mutate(input),accepted);
    assert.equal((await f.makeService().settle(close(input))).settlement,'applied');
    unchanged(f,published);
    assert.equal(writes(f.git.requests.slice(published.requests)).length,0);
    assert.equal(f.sources.requests.length,published.sources);
    assert.equal(Object.keys(f.git.state().registrations).length,1);
    assert.equal(Object.keys((await f.git.store.snapshot()).settlements.operations).length,0);
  });
}

for(const [target,code] of [['head',403],['event',429],['ledger',503]]) {
  test(`atomic ${target} read provider ${code} fails closed for reads, join, proposal and close`,{timeout:10000},async t=>{
    const f=await fixture(t),old=before(f),input=join(f.revision);
    const path=target==='event'?'zero-jams-v2/events/jam-101.json':'zero-jams-v2/settlements.json';
    const sha=target==='head'?null:blobSha(f.git.files.get(path));
    f.git.beforeRequest=({call,res,json})=>{
      if(call.method==='GET'&&(target==='head'?call.path.includes('/git/ref/'):call.path.endsWith(`/git/blobs/${sha}`))) {
        if(code===429)res.setHeader('Retry-After','120');json(res,code,{message:diagnostic});return true;
      }
    };
    for(const attempt of [()=>f.service.read('jam-101'),()=>f.service.list(),()=>f.service.mutate(input),
      ()=>f.service.propose({actor:creator,operationId:'unread-proposal',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}),
      ()=>f.service.settle(close(input)),()=>f.service.settle({actor:creator,scope:'proposals',operationId:'unread-proposal',payload:{repositoryUrl:'https://github.com/creator/jam',commit:COMMIT}})]) {
      await assert.rejects(attempt(),unavailable);
    }
    unchanged(f,old);
    assert.equal(writes(f.git.requests.slice(old.requests)).length,0);
    assert.equal(f.sources.requests.length,old.sources,'unreadable registry prevents source verification too');
    f.git.beforeRequest=null;await recoverJoin(f,input,old);
  });
}

for(const code of [403,429,503])for(const sourceStage of ['repository','commit','manifest']) {
  test(`atomic proposal source ${sourceStage} provider ${code} cannot create an event or fence and same-ID retry succeeds`,{timeout:10000},async t=>{
    const f=await fixture(t,{approve:false}),old=before(f);
    const input={actor:creator,operationId:'source-proposal',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT};
    const path='/repos/creator/jam'+(sourceStage==='commit'?`/git/commits/${COMMIT}`:sourceStage==='manifest'?'/contents/zero-jam.json':'');
    f.sources.beforeRequest=({call,res,json})=>{if(call.path===path){if(code===429)res.setHeader('Retry-After','120');json(res,code,{message:diagnostic});return true;}};
    await assert.rejects(f.service.propose(input),unavailable);unchanged(f,old);
    assert.equal(writes(f.git.requests.slice(old.requests)).length,0);
    assert.equal(f.git.records.size,0);
    f.sources.beforeRequest=null;
    const result=await f.makeService().propose(input);assert.equal(result.status,'submitted');
    assert.equal(f.git.commits.length,old.commits+1);assert.equal(f.git.state().proposals.length,1);
    const published=before(f);f.sources.sourceUnavailable=true;
    assert.deepEqual(await f.makeService().propose(input),result);
    assert.equal((await f.makeService().settle(close(input))).settlement,'applied');
    unchanged(f,published);assert.equal(f.sources.requests.length,published.sources);
    assert.equal(writes(f.git.requests.slice(published.requests)).length,0);
    assert.equal(Object.keys((await f.git.store.snapshot()).settlements.operations).length,0);
  });
}

for(const code of [403,429,503]) {
  test(`atomic submission source commit provider ${code} retains registration and exact retry creates one entry`,{timeout:10000},async t=>{
    const f=await fixture(t);await f.service.mutate(join(f.revision));const old=before(f),input=submission(f.revision);
    f.sources.beforeRequest=({call,res,json})=>{if(call.path===`/repos/student/project/git/commits/${COMMIT}`){if(code===429)res.setHeader('Retry-After','120');json(res,code,{message:diagnostic});return true;}};
    await assert.rejects(f.service.mutate(input),unavailable);unchanged(f,old);
    assert.equal(writes(f.git.requests.slice(old.requests)).length,0);assert.equal(f.git.state().entries[participant.id],undefined);
    assert.equal(f.git.state().registrations[participant.id].status,'joined');f.sources.beforeRequest=null;
    const result=await f.makeService().mutate(input);assert.equal(result.status,'submitted');
    assert.equal(f.git.commits.length,old.commits+1);assert.equal(f.git.state().entries[participant.id].length,1);
    const published=before(f);f.sources.sourceUnavailable=true;f.time=Date.parse('2030-01-05');
    assert.deepEqual(await f.makeService().mutate(input),result);
    assert.equal((await f.makeService().settle(close(input))).settlement,'applied');
    unchanged(f,published);assert.equal(f.sources.requests.length,published.sources);
    assert.equal(writes(f.git.requests.slice(published.requests)).length,0);
    assert.equal(Object.keys((await f.git.store.snapshot()).settlements.operations).length,0);
  });
}
