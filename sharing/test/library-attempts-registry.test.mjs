import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileRegistry, digest, initialState, revisionOf } from '../registry.mjs';
import { ingestRequest } from '../requests.mjs';
import { FileStorage, byteHash } from '../file-storage.mjs';
import { PublicationService } from '../publication.mjs';

const origin = 'http://127.0.0.1:8080';
const request = {schema:1,kind:'library',slug:'health-bar',version:'0.1.0',repository:{id:'1',ownerId:'1',owner:'student1',name:'game',url:'https://github.com/student1/game'},requester:{githubId:'1',login:'student1'},commit:'a'.repeat(40),folder:'libraries/health-bar',descriptor:{schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health bar',description:'Useful game progress',license:'MIT',libraryKind:'widget'},policyRevision:'b'.repeat(40)};
const metadata = {...request.repository,visibility:'public',ownerType:'User'};
const files = label => ({jar:Buffer.from(`jar ${label}`),sources:Buffer.from(`sources ${label}`),pom:Buffer.from(`<project>${label}</project>`)});
const evidence = (record, artifacts) => ({status:'passed',requestFingerprint:record.id,sourceDigest:record.frozen.sourceDigest,commit:record.frozen.commit,policyRevision:record.frozen.policyRevision,artifacts:Object.fromEntries(Object.entries(artifacts).map(([kind,bytes])=>[kind,{sha256:byteHash(bytes),size:bytes.length}])),provenance:{fixture:true}});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };

async function fixture(t, hooks = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(),'zero-attempts-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  let state = initialState(), revision = revisionOf(state);
  const adapter = {
    read: async () => ({state:structuredClone(state),revision}),
    compareAndSwap: async (expected,next) => {
      if (hooks.beforeCas) await hooks.beforeCas(expected,next);
      if (expected !== revision) { hooks.conflicts = (hooks.conflicts || 0) + 1; return false; }
      state = structuredClone(next); revision = revisionOf(state);
      if (hooks.afterCas) await hooks.afterCas(next);
      return true;
    }
  };
  const registry = new FileRegistry({adapter});
  const storage = new FileStorage({root:path.join(dir,'objects')});
  const service = new PublicationService({registry,storage,artifactOrigin:origin,verifyEvidence:async e=>e.provenance?.fixture===true,resolveRepositoryMetadata:async()=>metadata});
  const ingest = async (value=request, sourceDigest=digest(value.commit)) => ingestRequest(registry,{issueId:'1',request:value,authenticatedActor:value.requester,repositoryMetadata:metadata,sourceDigest});
  return {registry,storage,service,ingest};
}

async function assertAccepted(f, record, expected) {
  const state = (await f.registry.read()).state;
  assert.equal(Object.keys(state.releases).length,1);
  const [key,accepted] = Object.entries(state.releases)[0];
  assert.equal(accepted.requestId,record.id);
  assert.equal(state.requests[record.id].releaseKey,key);
  assert.equal(accepted.delivery,'ready');
  assert.deepEqual(accepted.release.source,{commit:record.frozen.commit,folder:record.frozen.folder,sha256:record.frozen.sourceDigest});
  for (const [kind,bytes] of Object.entries(expected)) {
    const artifact = accepted.release.artifacts[kind];
    assert.equal(artifact.sha256,byteHash(bytes));
    assert.equal(artifact.size,bytes.length);
    assert.deepEqual(await f.storage.get(accepted.staged[kind]),bytes);
    assert.deepEqual(await f.storage.get(artifact.path),bytes);
  }
  return accepted;
}

test('competing valid attempts for the same frozen request preserve the CAS winner',async t=>{
  const both = deferred(), winnerCommitted = deferred();
  let arrivals = 0;
  const hooks = {beforeCas:async (_expected,next)=>{
    if (!Object.keys(next.releases).length || next.sequence !== 2) return;
    const position = ++arrivals;
    if (position === 2) both.resolve();
    await both.promise;
    if (position === 2) await winnerCommitted.promise;
  },afterCas:async next=>{if (Object.keys(next.releases).length && next.sequence === 2) winnerCommitted.resolve();}};
  const f = await fixture(t,hooks), record = await f.ingest();
  const a = files('first'), b = files('second');
  const outcomes = await Promise.allSettled([a,b].map(artifacts=>f.service.publish({requestId:record.id,evidence:evidence(record,artifacts),artifacts})));
  assert.equal(arrivals,2);
  assert.equal(hooks.conflicts,1);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const rejected = outcomes.find(x=>x.status==='rejected');
  assert.match(rejected.reason.message,/Immutable version conflict/);
  const winner = outcomes[0].status === 'fulfilled' ? a : b;
  const accepted = await assertAccepted(f,record,winner);
  assert.equal(accepted.evidenceDigest,digest(evidence(record,winner)));
  const replay = await f.service.publish({requestId:record.id,evidence:evidence(record,winner === a ? b : a),artifacts:winner === a ? b : a});
  assert.deepEqual(replay.release.artifacts,accepted.release.artifacts);
  await assertAccepted(f,record,winner);
});

test('lost acceptance CAS response recovers the accepted evidence and exact source',async t=>{
  let armed = true;
  const hooks = {afterCas:async next=>{if (armed && Object.keys(next.releases).length) {armed=false;throw new Error('lost CAS response');}}};
  const f = await fixture(t,hooks), record = await f.ingest();
  const winner = files('committed'), retry = files('retry');
  await assert.rejects(f.service.publish({requestId:record.id,evidence:evidence(record,winner),artifacts:winner}),/lost CAS response/);
  const pending = (await f.registry.read()).state;
  const accepted = Object.values(pending.releases)[0];
  assert.equal(accepted.delivery,'pending');
  assert.equal(accepted.evidenceDigest,digest(evidence(record,winner)));
  assert.equal(pending.requests[record.id].releaseKey,Object.keys(pending.releases)[0]);
  await f.service.publish({requestId:record.id,evidence:evidence(record,retry),artifacts:retry});
  await assertAccepted(f,record,winner);
  const different = {...request,commit:'c'.repeat(40)};
  const other = await f.ingest(different,digest('different exact source'));
  assert.notEqual(other.id,record.id);
  await assert.rejects(f.service.publish({requestId:other.id,evidence:evidence(other,retry),artifacts:retry}),/Immutable version conflict/);
  await assertAccepted(f,record,winner);
});

test('a late divergent upload cannot replace a release accepted while it was paused',async t=>{
  const f = await fixture(t), record = await f.ingest();
  const winner = files('winner'), loser = files('delayed loser');
  const paused = deferred(), resume = deferred();
  const originalPut = f.storage.putImmutable.bind(f.storage);
  let delayed = false;
  f.storage.putImmutable = async (key,bytes) => {
    if (!delayed && key.startsWith(`staging/${record.id}/`) && byteHash(bytes) === byteHash(loser.jar)) {
      delayed = true;
      paused.resolve();
      await resume.promise;
    }
    return originalPut(key,bytes);
  };
  const late = f.service.publish({requestId:record.id,evidence:evidence(record,loser),artifacts:loser});
  await paused.promise;
  await f.service.publish({requestId:record.id,evidence:evidence(record,winner),artifacts:winner});
  const before = await assertAccepted(f,record,winner);
  resume.resolve();
  await assert.rejects(late,/Immutable version conflict/);
  const after = await assertAccepted(f,record,winner);
  assert.deepEqual(after,before);
  assert.equal(after.evidenceDigest,digest(evidence(record,winner)));
});
