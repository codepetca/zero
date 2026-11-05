import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createJamService} from '../service.mjs';
import {projectVisibility} from '../project-visibility.mjs';
import {creator,maintainer,participant,hostedManifest} from './fixtures.mjs';

const context=new AsyncLocalStorage();
const clone=value=>structuredClone(value);
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const closing=({actor,id:scope,operationId,...payload})=>({actor,scope,operationId,payload});

// A serialized, rollback-capable test store. Root CAS is forbidden so these
// tests catch accidentally escaping the transaction-local facade.
function transactionStore() {
  let document={events:{},settlements:{schema:1,operations:{}}},generation=0,tail=Promise.resolve();
  const revision=n=>n.toString(16).padStart(40,'0');
  const issue=(data,version)=>{const pinned=clone(data);return {revision:revision(version),ids:Object.keys(pinned.events),settlements:clone(pinned.settlements),async read(id){return {state:clone(pinned.events[id]??null)};}};};
  const store={transactions:0,commits:0,transactionSignals:[],failAfterCommit:false,onEnqueue:null,beforeTransaction:null,afterCommitDispatch:null,
    async snapshot(){assert.equal(context.getStore(),undefined,'root snapshot used inside transaction');return issue(document,generation);},
    async compareAndSwap(){assert.fail('root CAS used instead of transaction facade');},
    async transact(work,options){
      const signal=options?.signal;store.transactionSignals.push(signal);
      const checkSignal=()=>{if(signal?.aborted)throw new Error('Transaction canceled before dispatch.');};
      checkSignal();const previous=tail,release=deferred();tail=release.promise;store.onEnqueue?.(signal);
      let active=true,dirty=false,local,version;
      try {
        await previous;checkSignal();await store.beforeTransaction?.();checkSignal();store.transactions++;
        local=clone(document);version=generation;
        const check=()=>{assert.ok(active,'expired transaction facade');checkSignal();};
        const tx={async snapshot(){check();assert.equal(context.getStore(),'transaction');return issue(local,version);},async compareAndSwap(id,expected,state,{settlements}={}){
          check();assert.equal(context.getStore(),'transaction');if(expected!==revision(version))return false;
          if(id!==null)local.events[id]=clone(state);if(settlements!==undefined)local.settlements=clone(settlements);
          version++;dirty=true;return true;
        }};
        const result=await context.run('transaction',()=>work(tx));active=false;
        // This gate models a COMMIT already dispatched to the database. Abort
        // cannot establish absence while that command's outcome is unknown.
        await store.afterCommitDispatch?.();
        if(dirty){document=local;generation=version;store.commits++;}
        if(dirty&&store.failAfterCommit){store.failAfterCommit=false;throw new Error('synthetic lost COMMIT response');}
        return result;
      } finally {active=false;release.resolve();}
    }};
  return store;
}
function fixture({canCreateJam=()=>true,limits={},verifyRepository,pagesBindingReader}={}) {
  const store=transactionStore();let time=Date.parse('2030-01-02T12:00:00Z'),repositoryCalls=0,pagesCalls=0;
  const options={canCreateJam,store,maintainerIds:[maintainer.id],limits,now:()=>time,
    verifySource:async()=>assert.fail('no source verification expected'),
    verifyRepository:async input=>{assert.equal(context.getStore(),undefined,'repository verification held the transaction');repositoryCalls++;return verifyRepository?verifyRepository(input):{repository:{id:String(1000+Number(input.actor.id)),ownerId:input.actor.id,fullName:`${input.actor.login}/project`}};},
    pagesBindingReader:async(repo,pagesUrl)=>{assert.equal(context.getStore(),undefined,'Pages verification held the transaction');pagesCalls++;return pagesBindingReader?pagesBindingReader(repo,pagesUrl):{status:'verified',pagesUrl,repositoryId:repo.id,ownerId:repo.ownerId};}};
  return {store,service:createJamService(options),serviceFor:()=>createJamService(options),setTime:value=>{time=Date.parse(value);},calls:()=>({repositoryCalls,pagesCalls})};
}
async function approved(f) {
  const proposal=await f.service.propose({actor:creator,operationId:'transaction-proposal',manifest:hostedManifest()});
  await f.service.mutate({id:proposal.eventId,revision:proposal.revision,actor:maintainer,operationId:'transaction-approval',action:'approve'});
  return proposal;
}
const join=(proposal,actor=participant,operationId=`transaction-join-${actor.id}`)=>({id:proposal.eventId,revision:proposal.revision,actor,operationId,action:'join',repositoryUrl:`https://github.com/${actor.login}/project`});
const submit=(proposal,actor)=>({id:proposal.eventId,revision:proposal.revision,actor,operationId:`transaction-submit-${actor.id}`,action:'submit',title:'Project',description:'Synthetic project',demoUrl:`https://${actor.login}.github.io/project/`});

test('30 concurrent joins and submissions use only final transaction-local writes and recover once',async()=>{
  const f=fixture(),proposal=await approved(f),actors=Array.from({length:30},(_,i)=>({id:String(100+i),login:`student${i}`}));
  const services=actors.map(()=>f.serviceFor());
  await Promise.all(actors.map((actor,i)=>services[i].mutate(join(proposal,actor))));
  const pinned=await f.store.snapshot();
  const results=await Promise.all(actors.map((actor,i)=>services[i].mutate(submit(proposal,actor))));
  const state=(await (await f.store.snapshot()).read(proposal.eventId)).state;
  assert.equal(Object.keys(state.registrations).length,30);assert.equal(Object.keys(state.entries).length,30);
  assert.ok(actors.every(actor=>state.entries[actor.id].length===1));assert.equal(Object.keys(state.operations).length,62);
  assert.equal(Object.keys((await pinned.read(proposal.eventId)).state.entries).length,0);
  const commits=f.store.commits,transactions=f.store.transactions,calls=f.calls();
  assert.deepEqual(await Promise.all(actors.map((actor,i)=>services[i].mutate(submit(proposal,actor)))),results);
  assert.equal(f.store.commits,commits);assert.equal(f.store.transactions,transactions+30);assert.deepEqual(f.calls(),calls);
  await assert.rejects(f.service.mutate({...submit(proposal,actors[0]),title:'Changed'}),error=>error.status===409);
});

test('global event and creator proposal caps are rechecked inside serialized transactions',async()=>{
  for(const limits of [{events:1},{actorCreations:1}]) {
    const f=fixture({limits}),other=limits.events?{id:'44',login:'other'}:creator;
    const result=await Promise.allSettled([f.service.propose({actor:creator,operationId:'transaction-cap-one',manifest:hostedManifest()}),f.serviceFor().propose({actor:other,operationId:'transaction-cap-two',manifest:hostedManifest()})]);
    assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(result.find(x=>x.status==='rejected').reason.status,429);assert.equal((await f.store.snapshot()).ids.length,1);
  }
});

test('transactional writes preserve cross-gallery holds through suspension and cancellation until the later reveal',async()=>{
  const f=fixture(),proposals=[];
  for(let i=0;i<2;i++){
    const manifest=hostedManifest();manifest.schedule.galleryRevealAt=i?'2030-01-06T00:00:00Z':'2030-01-05T00:00:00Z';
    const proposal=await f.service.propose({actor:creator,operationId:`transaction-held-proposal-${i}`,manifest});
    proposals.push(proposal);
    await f.service.mutate({id:proposal.eventId,revision:proposal.revision,actor:maintainer,operationId:`transaction-held-approval-${i}`,action:'approve'});
    await f.service.mutate(join(proposal));
    await f.service.mutate(submit(proposal,participant));
  }
  const pinned=await f.store.snapshot(),repositoryId=String(1000+Number(participant.id)),pagesCalls=f.calls().pagesCalls;
  f.setTime('2030-01-05T00:00:00Z');
  const first=await f.service.read(proposals[0].eventId);
  assert.equal(first.event.galleryRevealed,true,'the first gallery has reached its own reveal time');
  assert.deepEqual(first.event.entries,[],'the later event still holds their shared repository');
  assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-05T00:00:00Z'))).isHeld(repositoryId),true);
  for(const action of ['suspend','cancel']){
    const before=await f.store.snapshot();
    await f.service.mutate({id:proposals[1].eventId,actor:maintainer,operationId:`transaction-held-${action}`,action,reason:'Synthetic moderation.'});
    const current=await f.store.snapshot();
    assert.notEqual(current.revision,before.revision);
    assert.equal((await current.read(proposals[1].eventId)).state.moderation.status,action==='suspend'?'suspended':'cancelled');
    assert.equal((await projectVisibility(current,Date.parse('2030-01-05T00:00:00Z'))).isHeld(repositoryId),true);
    assert.deepEqual((await f.service.read(proposals[0].eventId)).event.entries,[]);
  }
  assert.equal((await pinned.read(proposals[1].eventId)).state.moderation.status,'active','later writes cannot mutate the earlier snapshot');
  assert.equal(f.calls().pagesCalls,pagesCalls,'a globally held entry requires no public Pages proof');
  f.setTime('2030-01-06T00:00:00Z');
  const released=await f.service.read(proposals[0].eventId);
  assert.equal(released.event.entries.length,1);assert.equal(released.event.entries[0].repository.id,repositoryId);
  assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-06T00:00:00Z'))).isHeld(repositoryId),false);
  assert.equal(f.calls().pagesCalls,pagesCalls+1,'release still requires fresh Pages proof outside the transaction');
});

test('settlement can fence prepared provider work, and an accepted action wins the reverse ordering',async()=>{
  const entered=deferred(),resume=deferred();let block=true;
  const f=fixture({verifyRepository:async({actor})=>{if(block){block=false;entered.resolve();await resume.promise;}return {repository:{id:'1033',ownerId:actor.id,fullName:`${actor.login}/project`}};}}),proposal=await approved(f),input=join(proposal);
  const pending=f.service.mutate(input);await entered.promise;
  const closed=await f.serviceFor().settle(closing(input));assert.equal(closed.settlement,'not-applied');resume.resolve();
  assert.deepEqual(await pending,closed);
  const snapshot=await f.store.snapshot(),state=(await snapshot.read(proposal.eventId)).state;
  assert.equal(Object.keys(state.registrations).length,0);assert.equal(Object.keys(snapshot.settlements.operations).length,1);
  const fresh=join(proposal,participant,'transaction-join-fresh'),applied=await f.service.mutate(fresh);
  assert.deepEqual(await f.serviceFor().settle(closing(fresh)),{...applied,scope:proposal.eventId,settlement:'applied'});
});

test('unknown transaction commits recover after closure without rerunning verification',async()=>{
  const f=fixture(),proposal=await approved(f),input=join(proposal);f.store.failAfterCommit=true;
  await assert.rejects(f.service.mutate(input),error=>error.status===503&&!error.message.includes('COMMIT'));
  const commits=f.store.commits,calls=f.calls();f.setTime('2030-02-01T00:00:00Z');
  assert.equal((await f.service.mutate(input)).status,'joined');assert.deepEqual(f.calls(),calls);assert.equal(f.store.commits,commits);
  assert.equal((await f.service.settle(closing(input))).settlement,'applied');
});

test('queue admission rechecks the current clock and cancellation before any final write',async()=>{
  const f=fixture(),proposal=await approved(f),input=join(proposal),commits=f.store.commits;
  f.store.beforeTransaction=()=>f.setTime('2030-01-03T00:00:00Z');
  await assert.rejects(f.service.mutate(input),error=>error.status===409);assert.equal(f.store.commits,commits);
  f.setTime('2030-01-02T12:00:00Z');const entered=deferred(),resume=deferred(),controller=new AbortController();
  f.store.beforeTransaction=async()=>{entered.resolve();await resume.promise;};
  const pending=f.service.mutate(input,{signal:controller.signal});await entered.promise;controller.abort();
  await assert.rejects(pending,error=>error.status===503);resume.resolve();
  f.store.beforeTransaction=null;await f.service.settle(closing(input));
  assert.equal(Object.keys((await (await f.store.snapshot()).read(proposal.eventId)).state.registrations).length,0);
});

test('pre-aborted and queued mutations cannot enter a transaction callback or write',async()=>{
  const f=fixture(),proposal=await approved(f),input=join(proposal),pre=new AbortController();
  const originalTransactions=f.store.transactions,commits=f.store.commits,signals=f.store.transactionSignals.length,calls=f.calls();
  pre.abort();await assert.rejects(f.service.mutate(input,{signal:pre.signal}),error=>error.status===503);
  assert.equal(f.store.transactions,originalTransactions);assert.equal(f.store.transactionSignals.length,signals);assert.equal(f.store.commits,commits);assert.deepEqual(f.calls(),calls);
  const entered=deferred(),resume=deferred(),queued=deferred(),controller=new AbortController();let transactionSignal;
  const holding=f.store.transact(async()=>{entered.resolve();await resume.promise;});await entered.promise;
  f.store.onEnqueue=signal=>{if(signal){transactionSignal=signal;queued.resolve();}};
  const pending=f.service.mutate(input,{signal:controller.signal});await queued.promise;
  assert.ok(transactionSignal instanceof AbortSignal);controller.abort();
  await assert.rejects(pending,error=>error.status===503);assert.equal(transactionSignal.aborted,true);
  assert.equal(f.store.transactions,originalTransactions+1,'queued mutation never called its transaction callback');assert.equal(f.store.commits,commits);
  resume.resolve();await holding;f.store.onEnqueue=null;
  assert.equal((await f.service.settle(closing(input))).settlement,'not-applied');
  assert.equal(f.store.transactions,originalTransactions+2,'only the holder and settlement callbacks ran');
  assert.equal(f.store.transactionSignals.at(-1),undefined,'unscoped settlement does not inherit an aborted mutation signal');
  assert.equal(Object.keys((await (await f.store.snapshot()).read(proposal.eventId)).state.registrations).length,0);
});

test('cancellation after COMMIT dispatch remains unknown until same-ID recovery',async()=>{
  const f=fixture(),proposal=await approved(f),input=join(proposal),entered=deferred(),resume=deferred(),controller=new AbortController();
  f.store.afterCommitDispatch=async()=>{entered.resolve();await resume.promise;};
  const pending=f.service.mutate(input,{signal:controller.signal});await entered.promise;controller.abort();
  await assert.rejects(pending,error=>error.status===503);assert.equal(f.store.transactionSignals.at(-1).aborted,true);
  resume.resolve();f.store.afterCommitDispatch=null;
  assert.equal((await f.service.mutate(input)).status,'joined');
  assert.equal(Object.keys((await (await f.store.snapshot()).read(proposal.eventId)).state.registrations).length,1);
});

test('invalid transaction facades and unexpected local CAS rejection fail closed',async()=>{
  for(const facade of [{}, {snapshot:async()=>({revision:'a'.repeat(40),ids:[],settlements:{schema:1,operations:{}},read:async()=>({state:null})}),compareAndSwap:async()=>false}]) {
    let transactions=0;const store={snapshot:async()=>assert.fail('root snapshot'),compareAndSwap:async()=>assert.fail('root CAS'),transact:async work=>{transactions++;return work(facade);}};
    const service=createJamService({canCreateJam:()=>true,store,verifySource:async()=>{}});
    await assert.rejects(service.propose({actor:creator,operationId:'transaction-invalid',manifest:hostedManifest()}),error=>error.status===503);assert.equal(transactions,1);
  }
});


test('queued Pro revocation denies new proposals but transaction recovery precedes entitlement checks',async()=>{
  let pro=true,checks=0;
  const f=fixture({canCreateJam:id=>{assert.equal(context.getStore(),'transaction');checks++;return pro&&id===creator.id;}});
  const request={actor:creator,operationId:'transaction-pro-grant-001',manifest:hostedManifest()};
  f.store.failAfterCommit=true;
  await assert.rejects(f.service.propose(request),error=>error.status===503);
  pro=false;checks=0;
  const recovered=await f.service.propose(request);assert.equal(recovered.status,'submitted');assert.equal(checks,0);
  assert.equal((await f.service.settle({actor:creator,scope:'proposals',operationId:request.operationId,payload:{manifest:request.manifest}})).settlement,'applied');
  assert.equal(checks,0);assert.equal(f.store.commits,1);
  pro=true;f.store.beforeTransaction=()=>{pro=false;};
  await assert.rejects(f.service.propose({...request,operationId:'transaction-pro-revoked-001'}),error=>error.status===403);
  assert.equal(f.store.commits,1);assert.equal((await f.store.snapshot()).ids.length,1);
});
