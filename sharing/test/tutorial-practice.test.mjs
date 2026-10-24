import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileRegistry, digest} from '../registry.mjs';
import {FileStorage, byteHash} from '../file-storage.mjs';
import {ingestRequest} from '../requests.mjs';
import {PublicationService, generateCatalog} from '../publication.mjs';
import {createSharingPlatform} from '../platform.mjs';
import {parseArguments, runCli} from '../cli.mjs';
import practice from '../../extension/src/sharing/tutorial-practice.js';

const origin='https://fixture.public.blob.vercel-storage.com',policyRevision='b'.repeat(40);
const bytes={jar:Buffer.from('inert trusted JAR fixture'),sources:Buffer.from('retained source fixture'),pom:Buffer.from('trusted fixed POM fixture')};
function request(repositoryId='1',version='0.1.0',slug=practice.SLUG) {
  const repository={id:repositoryId,ownerId:'7',owner:'student',name:`game-${repositoryId}`,url:`https://github.com/student/game-${repositoryId}`};
  return {schema:1,kind:'library',slug,version,repository,requester:{githubId:'7',login:'student'},commit:'a'.repeat(40),folder:`libraries/${slug}`,
    descriptor:{schema:1,kind:'library',slug,version,title:'CreditsBadge',description:'Copied tutorial practice.',license:'MIT',libraryKind:'helper'},policyRevision};
}
async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'zero-practice-cleanup-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const registry=new FileRegistry({file:join(directory,'registry.json')});
  const storage=new FileStorage({root:join(directory,'objects')});
  const service=new PublicationService({registry,storage,artifactOrigin:origin,verifyEvidence:async e=>e.fixture===true,
    resolveRepositoryMetadata:async id=>({...request(id).repository,visibility:'public',ownerType:'User'})});
  const publish=async(candidate=request())=>{
    const record=await ingestRequest(registry,{issueId:candidate.repository.id,request:candidate,authenticatedActor:candidate.requester,
      repositoryMetadata:{...candidate.repository,visibility:'public',ownerType:'User'},sourceDigest:digest(candidate)});
    const evidence={fixture:true,status:'passed',requestFingerprint:record.id,sourceDigest:record.frozen.sourceDigest,commit:candidate.commit,policyRevision,
      artifacts:Object.fromEntries(Object.entries(bytes).map(([kind,value])=>[kind,{size:value.length,sha256:byteHash(value)}]))};
    return service.publish({requestId:record.id,evidence,artifacts:bytes});
  };
  const platform=(enabled=false)=>createSharingPlatform({reader:{publicationIssue:async()=>{},publicationIssueState:async()=>{},source:async()=>{},repository:async()=>{}},registry,storage,artifactOrigin:origin,policyRevision,libraryPublicationEnabled:enabled});
  return {registry,storage,service,publish,platform};
}
const key=(id='1',version='0.1.0')=>`library/lib-r${id}-${practice.SLUG}/${version}`;

test('copied practice identities stay repository-specific and accepted versions remain immutable',async t=>{
  const f=await fixture(t);await f.publish();await f.publish(request('2'));await f.publish(request('1','0.2.0'));
  const releases=generateCatalog((await f.registry.read()).state,{artifactOrigin:origin}).releases;
  assert.equal(new Set(releases.map(r=>r.id)).size,2);assert.equal(releases.length,3);
  const changed=request();changed.descriptor.description='Changed source for the same version';
  await assert.rejects(f.publish(changed),/Immutable version conflict/);
});

test('cleanup dry run writes nothing; execute withdraws exact versions and retains every accepted artifact and source record',async t=>{
  const f=await fixture(t),first=await f.publish();await f.publish(request('1','0.2.0'));await f.publish(request('2'));await f.publish(request('3','0.1.0','original-helper'));
  const before=await f.registry.read();
  const plan=await f.platform().cleanupPracticeListings([key()]);
  assert.equal(plan.mode,'dry-run');assert.equal(plan.status,'unchanged');assert.equal(plan.selected[0].key,key());assert.deepEqual(await f.registry.read(),before);
  const outcome=await f.platform(true).cleanupPracticeListings([key()],{execute:true});assert.equal(outcome.status,'withdrawn');
  const after=(await f.registry.read()).state;assert.deepEqual(after.requests,before.state.requests);assert.deepEqual(after.releases,before.state.releases);
  const catalog=generateCatalog(after,{artifactOrigin:origin});
  assert.deepEqual(catalog.releases.map(r=>[r.id,r.version,r.status]),[
    [`lib-r1-${practice.SLUG}`,'0.1.0','withdrawn'],[`lib-r1-${practice.SLUG}`,'0.2.0','available'],[`lib-r2-${practice.SLUG}`,'0.1.0','available'],['lib-r3-original-helper','0.1.0','available']]);
  for(const [kind,artifact] of Object.entries(first.release.artifacts)) {
    assert.deepEqual(await f.storage.get(artifact.path),bytes[kind]);assert.deepEqual(await f.storage.get(first.staged[kind]),bytes[kind]);
  }
  const retry = await f.service.cleanupPracticeListings([key()],{execute:true});
  assert.equal(retry.selected[0].previousStatus,'withdrawn');
  assert.deepEqual((await f.registry.read()).state.availability,after.availability);
});

test('cleanup rejects nonpractice, unknown, duplicate and pending selections atomically',async t=>{
  const f=await fixture(t);await f.publish();await f.publish(request('2','0.1.0','original-helper'));
  for(const selection of [[],[key(),key()],[key(),'library/lib-r2-original-helper/0.1.0'],[key('999')]])
    await assert.rejects(f.service.cleanupPracticeListings(selection,{execute:true}));
  await f.registry.update(state=>{state.releases[key()].delivery='pending';});
  await assert.rejects(f.service.cleanupPracticeListings([key()],{execute:true}),/exact delivery-ready/);
  assert.equal((await f.registry.read()).state.availability.filter(e=>e.status==='withdrawn').length,0);
});

test('CAS retry refuses a concurrent withdraw/restore cycle and never broadens selection',async t=>{
  const f=await fixture(t);await f.publish();await f.publish(request('2'));
  const cas=f.registry.compareAndSwap.bind(f.registry);let armed=true;
  f.registry.compareAndSwap=async(expected,next)=>{
    if(armed&&next.availability.at(-1)?.status==='withdrawn') {
      armed=false;
      await f.registry.update(state=>{state.availability.push({sequence:state.sequence+1,key:key(),status:'withdrawn'},{sequence:state.sequence+1,key:key(),status:'available'});});
    }
    return cas(expected,next);
  };
  await assert.rejects(f.service.cleanupPracticeListings([key()],{execute:true}),/availability changed/);
  const catalog=generateCatalog((await f.registry.read()).state,{artifactOrigin:origin});assert.ok(catalog.releases.every(r=>r.status==='available'));
});

test('cleanup keeps the library publication gate and CLI explicit publisher role',async t=>{
  const f=await fixture(t);await f.publish();
  await assert.rejects(f.platform().cleanupPracticeListings([key()],{execute:true}),/publication is closed/);
  const args=['library-practice-cleanup','--config','fixture.json','--releases',key()];
  assert.equal(parseArguments(args).execute,false);
  assert.throws(()=>parseArguments([...args,'--execute']),/publisher role/);
  assert.throws(()=>parseArguments([...args,'--execute','--role','worker']),/publisher role/);
  for(const value of ['',key()+','+key(),'library/lib-r1-original-helper/0.1.0',key().replace('0.1.0','00.1.0')])
    assert.throws(()=>parseArguments(['library-practice-cleanup','--releases',value]));
  const config={schema:1,repository:'codepetca/zero',registryBranch:'zero-sharing-registry',artifactOrigin:origin,policyRevision,gamePublicationEnabled:false,libraryPublicationEnabled:false};
  const dependencies={loadConfig:async()=>config,createPlatform:async(_config,execute)=>{assert.equal(execute,false);return f.platform();}};
  assert.equal((await runCli(args,dependencies)).mode,'dry-run');
  await assert.rejects(runCli([...args,'--execute','--role','publisher'],dependencies),/Publication remains disabled/);
  config.libraryPublicationEnabled=true;
  assert.equal((await runCli([...args,'--execute','--role','publisher'],{...dependencies,createPlatform:async()=>f.platform(true)})).status,'withdrawn');
});

test('exact cleanup retry repairs a catalogue-write failure after withdrawal without duplicate events or artifact deletion',async t=>{
  const f=await fixture(t),accepted=await f.publish();
  const put=f.storage.putImmutable.bind(f.storage);let failOnce=true;
  f.storage.putImmutable=async(name,...args)=>{
    if(failOnce&&name.startsWith('catalog/snapshots/')){failOnce=false;throw new Error('Injected catalogue write failure');}
    return put(name,...args);
  };
  await assert.rejects(f.platform(true).cleanupPracticeListings([key()],{execute:true}),/Injected catalogue/);
  const partial=(await f.registry.read()).state;
  assert.equal(partial.availability.at(-1).status,'withdrawn');
  assert.equal(JSON.parse((await f.storage.get(partial.catalog.path)).toString()).releases[0].status,'available');
  const preview=await f.platform().cleanupPracticeListings([key()]);
  assert.equal(preview.selected[0].previousStatus,'withdrawn');
  assert.deepEqual((await f.registry.read()).state,partial,'retry preview writes nothing');
  await f.platform(true).cleanupPracticeListings([key()],{execute:true});
  const repaired=(await f.registry.read()).state;
  assert.deepEqual(repaired.availability,partial.availability,'withdrawal remains one event');
  assert.equal(JSON.parse((await f.storage.get(repaired.catalog.path)).toString()).releases[0].status,'withdrawn');
  for(const [kind,artifact]of Object.entries(accepted.release.artifacts))assert.deepEqual(await f.storage.get(artifact.path),bytes[kind]);
});
