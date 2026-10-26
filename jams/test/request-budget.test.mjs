import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService} from '../service.mjs';
import {atomicGitHttpFixture} from './git-http-fixture.mjs';
import {githubHttpFixture} from './github-http-fixture.mjs';
import {createGitHubSourceVerifier} from '../github-source.mjs';
import {approved,fixture,creator,maintainer,participant,submission} from './fixtures.mjs';

const status=code=>error=>error.status===code;
const clock=()=>Date.parse('2030-01-02T12:00:00Z');
async function prepared(t,options){
  const memory=fixture();const revision=await approved(memory),state=memory.store.records.get('jam-101').state;
  const git=await atomicGitHttpFixture(t,options);git.seed('jam-101',state);await git.store.migrate();
  const sources=await githubHttpFixture(t);
  const service=createJamService({store:git.store,verifySource:createGitHubSourceVerifier({token:'http-fixture-only-token',fetchImpl:sources.fetchImpl}),maintainerIds:[maintainer.id],now:clock});
  return {git,sources,service,revision,state};
}
const join=revision=>({id:'jam-101',actor:participant,operationId:'budget-join-0001',action:'join',revision});
function duplicate(state){
  const next=structuredClone(state);next.id='jam-102';next.repositoryId='102';
  for(const proposal of next.proposals)proposal.repository.id='102';next.accepted.repository.id='102';
  next.operations={};next.registrations={};next.entries={};next.history=[];
  return next;
}
const reads=calls=>calls.filter(call=>call.method==='GET');

test('one request preflight plus fresh-head CAS bounds Join, submit, recovery, and close traffic',async t=>{
  const {git,sources,service,revision}=await prepared(t);
  async function measure(fn,expected){
    const begin=git.requests.length,sourceBegin=sources.requests.length;const result=await fn();
    const calls=git.requests.slice(begin);
    assert.equal(reads(calls).length,expected.reads);assert.equal(calls.length-reads(calls).length,expected.writes);
    assert.equal(sources.requests.length-sourceBegin,expected.sources||0);
    return result;
  }
  await measure(()=>service.mutate(join(revision)),{reads:9,writes:4});
  await measure(()=>service.mutate(join(revision)),{reads:8,writes:0});
  const input=submission(revision);
  await measure(()=>service.mutate(input),{reads:9,writes:4,sources:2});
  await measure(()=>service.mutate(input),{reads:8,writes:0});
  const closing={actor:participant,scope:'jam-101',operationId:'budget-close-0001',payload:{action:'join',revision}};
  assert.equal((await measure(()=>service.settle(closing),{reads:9,writes:4})).settlement,'not-applied');
  await measure(()=>service.settle(closing),{reads:8,writes:0});
  for(const call of git.requests.filter(call=>call.method==='PATCH'))assert.equal(call.body.force,false);
});

test('listing validates one fresh pinned authority snapshot and reads each event once',async t=>{
  const {git,service,state}=await prepared(t);git.seed('jam-102',duplicate(state),{legacy:false});
  const start=git.requests.length;let changed=false;
  git.beforeRequest=()=>{
    if(!changed&&git.requests.length-start===8){changed=true;git.replaceFile('jams','removed protocol marker');}
  };
  assert.equal((await service.list()).events.length,2);assert.equal(changed,true);
  const calls=git.requests.slice(start);assert.equal(calls.length,9);assert.ok(calls.every(call=>call.method==='GET'));
  assert.equal(calls.filter(call=>call.path.includes('/git/ref/')).length,1);
  await assert.rejects(service.list(),status(503));
});

test('each snapshot reloads authority while memoized immutable reads return independent clones',async t=>{
  const {git,state}=await prepared(t);const start=git.requests.length;
  const snapshot=await git.store.snapshot();assert.equal(git.requests.length-start,7);
  const readStart=git.requests.length;
  const [one,two]=await Promise.all([snapshot.read('jam-101'),snapshot.read('jam-101')]);
  assert.equal(git.requests.length-readStart,1);one.state.proposals[0].manifest.title='caller mutation';
  assert.deepEqual(two.state,state);assert.deepEqual((await snapshot.read('jam-101')).state,state);
  snapshot.ids.splice(0);snapshot.settlements.operations.bad={};snapshot.revision='f'.repeat(40);
  const nextStart=git.requests.length,next=await git.store.snapshot();
  assert.equal(git.requests.length-nextStart,7);assert.deepEqual(next.ids,['jam-101']);
  assert.deepEqual(next.settlements,{schema:1,operations:{}});assert.equal(next.revision,git.head);
  await next.read('jam-101');assert.equal(git.requests.length-nextStart,8);
});

test('a rejected immutable event read is evicted without poisoning the snapshot',async t=>{
  const {git,state}=await prepared(t);const snapshot=await git.store.snapshot();let failures=0;
  git.beforeRequest=({call,res,json})=>{if(call.path.includes('/git/blobs/')&&failures++===0){json(res,503,{});return true;}};
  const start=git.requests.length;
  await assert.rejects(Promise.all([snapshot.read('jam-101'),snapshot.read('jam-101')]),status(503));
  assert.equal(git.requests.length-start,1);assert.deepEqual((await snapshot.read('jam-101')).state,state);
  await snapshot.read('jam-101');assert.equal(git.requests.length-start,2);
});

test('CAS uses only a private issued base after fresh head and ignores caller snapshot mutations',async t=>{
  const {git,state}=await prepared(t,{maxEvents:1});const snapshot=await git.store.snapshot(),revision=snapshot.revision;
  snapshot.ids.length=0;snapshot.settlements.operations.bad={};
  await assert.rejects(git.store.compareAndSwap('jam-102',revision,duplicate(state)),status(429));
  const start=git.requests.length;
  assert.equal(await git.store.compareAndSwap('jam-101',revision,state),true);
  const calls=git.requests.slice(start);assert.equal(calls.length,5);
  assert.equal(calls[0].method,'GET');assert.ok(calls[0].path.includes('/git/ref/'));
  assert.deepEqual(calls.find(call=>call.path.endsWith('/git/commits')).body.parents,[revision]);
  assert.equal(calls.at(-1).body.force,false);
  assert.deepEqual((await git.store.snapshot()).settlements,{schema:1,operations:{}});
});

test('unissued and conflict-invalidated CAS bases reread all immutable authority',async t=>{
  const {git,state}=await prepared(t);const fresh=git.makeStore(),revision=git.head,start=git.requests.length;
  assert.equal(await fresh.compareAndSwap('jam-101',revision,state),true);assert.equal(git.requests.length-start,11);
  const snapshot=await git.store.snapshot();
  git.beforeRequest=({call,res,json})=>{if(call.method==='PATCH'){json(res,422,{});return true;}};
  let before=git.requests.length;assert.equal(await git.store.compareAndSwap('jam-101',snapshot.revision,state),false);assert.equal(git.requests.length-before,5);
  before=git.requests.length;assert.equal(await git.store.compareAndSwap('jam-101',snapshot.revision,state),false);assert.equal(git.requests.length-before,11);
});

test('fresh heads and missing protocol markers reject old issued bases without writes',async t=>{
  const {git,state}=await prepared(t);const snapshot=await git.store.snapshot();
  git.replaceFile('jams','missing marker');let start=git.requests.length;
  assert.equal(await git.store.compareAndSwap('jam-101',snapshot.revision,state),false);
  assert.equal(git.requests.length-start,1);await assert.rejects(git.store.snapshot(),status(503));
  start=git.requests.length;await assert.rejects(git.store.compareAndSwap('jam-101',git.head,state),status(503));
  assert.ok(git.requests.slice(start).every(call=>call.method==='GET'));
});

test('issued base cache is bounded and old revisions fall back to validation',async t=>{
  const {git,state}=await prepared(t);const old=await git.store.snapshot();
  for(let index=0;index<16;index++){git.replaceFile('README.md',`new immutable root ${index}`);await git.store.snapshot();}
  // Simulate an external ref rewind: the oldest issued base must have been
  // evicted, even though immutable data at that exact commit remains usable.
  git.head=old.revision;const start=git.requests.length;
  assert.equal(await git.store.compareAndSwap('jam-101',old.revision,state),true);
  assert.equal(git.requests.length-start,11);
});

test('proposal preflight reuses its own pinned event scan before the fresh-head CAS',async t=>{
  const {git,sources,service}=await prepared(t);const input={actor:creator,operationId:'budget-proposal-0001',repositoryUrl:'https://github.com/creator/jam',commit:'b'.repeat(40)};
  const start=git.requests.length,sourceStart=sources.requests.length;
  await service.propose(input);assert.equal(git.requests.length-start,13);assert.equal(sources.requests.length-sourceStart,3);
});

test('eight ref conflicts stay bounded and validate a fresh snapshot before every retry',async t=>{
  const {git,service,revision}=await prepared(t);const start=git.requests.length,commits=git.commits.length;
  git.beforeRequest=({call,res,json})=>{if(call.method==='PATCH'){json(res,422,{});return true;}};
  await assert.rejects(service.mutate(join(revision)),status(409));
  const calls=git.requests.slice(start);assert.equal(calls.length,104);assert.equal(reads(calls).length,72);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,8);assert.equal(git.commits.length,commits);
  assert.equal(calls.filter(call=>call.path.includes('/git/ref/')).length,16);
  assert.equal(calls.filter(call=>call.method==='GET'&&call.path.includes('/git/commits/')).length,8);
});
