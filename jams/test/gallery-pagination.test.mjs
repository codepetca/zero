import test from 'node:test';
import assert from 'node:assert/strict';
import {createJamService,JAM_PAGE_METADATA,JAM_PROJECTION_REVISION} from '../service.mjs';
import {digest,LIMITS,validateState} from '../schema.mjs';
import {fixture,creator,maintainer,participant,hostedManifest,verifiedPages,COMMIT,approved,submission} from './fixtures.mjs';

const reveal='2030-01-05T00:00:00Z';
async function setup({count=30,ids,reader=verifiedPages}={}) {
  const f=fixture({pagesBindingReader:verifiedPages});
  const proposal=await f.service.propose({actor:creator,operationId:'page-proposal-01',manifest:hostedManifest()});
  const id=proposal.eventId,revision=proposal.revision;
  await f.service.mutate({id,actor:participant,operationId:'page-join-01',action:'join',revision,repositoryUrl:'https://github.com/student/project'});
  await f.service.mutate({id,actor:participant,operationId:'page-submit-01',action:'submit',revision,
    title:'Template',description:'Synthetic page fixture',demoUrl:'https://student.github.io/project/'});
  const state=f.store.records.get(id).state,template=structuredClone(state.entries[participant.id][0]);
  state.registrations={};state.entries={};
  const actors=ids??Array.from({length:count},(_,index)=>String(1001+index));
  for(const [index,actorId] of actors.entries()) {
    const login=`student${actorId}`,repository={id:String(10001+index),ownerId:actorId,fullName:`${login}/project`};
    const pagesUrl=`https://${login}.github.io/project/`;
    state.registrations[actorId]={id:actorId,login,status:'joined',revision,
      joinedAt:template.submittedAt,updatedAt:template.submittedAt,repository};
    state.entries[actorId]=[{...template,participantId:actorId,login,repository,demoUrl:pagesUrl,
      title:`Entry ${actorId}`,revision:digest({actorId}),pagesVerification:{...template.pagesVerification,
        pagesUrl,repositoryId:repository.id,ownerId:actorId}}];
  }
  validateState(state,id);
  let time=Date.parse(reveal),calls=0,active=0,peak=0,snapshots=0;
  const originalSnapshot=f.store.snapshot.bind(f.store);
  const store={...f.store,snapshot:async options=>{snapshots++;return originalSnapshot(options);}};
  const service=createJamService({canCreateJam:()=>true,store,maintainerIds:[maintainer.id],now:()=>time,
    verifySource:async()=>assert.fail('page reads do not verify source'),
    pagesBindingReader:reader===null?undefined:async(...args)=>{
      calls++;active++;peak=Math.max(active,peak);
      try {await new Promise(setImmediate);return await reader(...args);} finally {active--;}
    }});
  return {...f,id,state,service,actors,time:value=>{time=Date.parse(value);},calls:()=>calls,
    peak:()=>peak,snapshots:()=>snapshots,revision:async()=>(await originalSnapshot()).revision};
}
const metadata=result=>result[JAM_PAGE_METADATA];
const participantIds=result=>result.event.entries.map(entry=>entry.participantId);
async function addHold(f,{actors=['1001','1002'],at='2030-01-06T00:00:00Z',status='active'}={}) {
  const proposed=await f.service.propose({actor:{id:String(440+f.store.records.size),login:'other'+f.store.records.size},operationId:`hold-proposal-${f.store.records.size}`,
    manifest:hostedManifest({schedule:{...hostedManifest().schedule,galleryRevealAt:at}})});
  const state=f.store.records.get(proposed.eventId).state;
  state.moderation.status=status;
  state.registrations=Object.fromEntries(actors.map(actorId=>[actorId,
    {...structuredClone(f.state.registrations[actorId]),revision:proposed.revision}]));
  return state;
}

test('30 entries traverse four bounded pages with fresh proof and full authority on every page',async()=>{
  const f=await setup(),seen=[];
  let offset=0,revision,validUntil,notBefore;
  for(const expected of [8,8,8,6]) {
    const before=f.calls(),snapshots=f.snapshots();
    const result=await f.service.readPage(f.id,undefined,{offset,...(revision?{revision,validUntil,notBefore}:{})});
    assert.equal(result.event.entries.length,expected);assert.equal(f.calls()-before,expected);
    assert.equal(f.snapshots()-snapshots,2);assert.ok(f.peak()<=4);
    seen.push(...participantIds(result));
    assert.equal(metadata(result).revision,result[JAM_PROJECTION_REVISION]);
    assert.equal(Object.getOwnPropertyDescriptor(result,JAM_PAGE_METADATA).enumerable,false);
    assert.equal(Object.isFrozen(metadata(result)),true);
    assert.equal(Object.getOwnPropertySymbols({...result}).length,0);
    assert.doesNotMatch(JSON.stringify(result),new RegExp(`${metadata(result).revision}|nextOffset|validUntil|observedAt|notBefore|pagesVerification|"offset"`));
    revision=metadata(result).revision;validUntil=metadata(result).validUntil;notBefore=metadata(result).observedAt;offset=metadata(result).nextOffset;
  }
  assert.equal(offset,null);assert.deepEqual(seen,f.actors);assert.equal(f.calls(),30);
  const retry=await f.service.readPage(f.id,undefined,{offset:0,revision,validUntil,notBefore});
  assert.deepEqual(participantIds(retry),f.actors.slice(0,8));assert.equal(f.calls(),38);
  // Existing unpaged contracts retain their complete result and no page token.
  const full=await f.service.read(f.id);assert.equal(full.event.entries.length,30);assert.equal(metadata(full),undefined);
  assert.equal((await f.service.list()).events[0].entries.length,30);
});

test('numeric participant ordering remains exact beyond safe JavaScript integers',async()=>{
  const ids=['99999999999999999999','9007199254740993','100','9','9007199254740992','99','10'];
  const f=await setup({ids});
  assert.deepEqual(participantIds(await f.service.readPage(f.id,undefined,{offset:0})),
    ['9','10','99','100','9007199254740992','9007199254740993','99999999999999999999']);
});

test('failed proofs produce a retryable empty page and advance by scanned candidates, without hidden entry data',async()=>{
  const f=await setup({reader:async repository=>{
    if(Number(repository.ownerId)<=1008)throw Error('PRIVATE_PROVIDER_BODY');
    return {status:'unverified',reason:'revoked-private-reason'};
  }});
  const first=await f.service.readPage(f.id,undefined,{offset:0});
  assert.deepEqual(first.event.entries,[]);assert.equal(first.event.galleryIncomplete,true);
  assert.equal(metadata(first).nextOffset,8);assert.equal(f.calls(),8);
  assert.doesNotMatch(JSON.stringify(first),/PRIVATE_PROVIDER_BODY|revoked-private-reason|Entry 1001|student1001\.github|pagesVerification/);
  const second=await f.service.readPage(f.id,undefined,{offset:8,revision:metadata(first).revision,validUntil:metadata(first).validUntil,notBefore:metadata(first).observedAt});
  assert.deepEqual(second.event.entries,[]);assert.equal(second.event.galleryIncomplete,true);
  assert.equal(metadata(second).nextOffset,16);assert.equal(f.calls(),16);
});

test('revoked proofs are refreshed on stable retries and can recover without changing page position',async()=>{
  let available=true;
  const f=await setup({reader:async(...args)=>available?verifiedPages(...args):{status:'unverified',reason:'revoked'}});
  const first=await f.service.readPage(f.id,undefined,{offset:0}),revision=metadata(first).revision;
  available=false;
  const revoked=await f.service.readPage(f.id,undefined,{offset:0,revision});
  assert.deepEqual(revoked.event.entries,[]);assert.equal(revoked.event.galleryIncomplete,true);
  assert.deepEqual(metadata(revoked),metadata(first));
  available=true;
  const recovered=await f.service.readPage(f.id,undefined,{offset:0,revision});
  assert.deepEqual(recovered.event.entries,first.event.entries);assert.equal(recovered.event.galleryIncomplete,undefined);
});

test('empty registries, past-end offsets and absent readers remain bounded and distinguish unavailable proof',async()=>{
  const empty=await setup({count:0});
  const result=await empty.service.readPage(empty.id,undefined,{offset:0});
  assert.deepEqual(result.event.entries,[]);assert.equal(metadata(result).nextOffset,null);
  assert.equal(result.event.galleryIncomplete,undefined);assert.equal(empty.calls(),0);assert.equal(empty.snapshots(),2);
  const f=await setup({reader:null}),revision=await f.revision();
  const unavailable=await f.service.readPage(f.id,undefined,{offset:0});
  assert.deepEqual(unavailable.event.entries,[]);assert.equal(unavailable.event.galleryIncomplete,true);
  assert.equal(metadata(unavailable).nextOffset,8);
  const pastEnd=await f.service.readPage(f.id,undefined,{offset:LIMITS.participants,revision,validUntil:null,notBefore:Date.parse(reveal)});
  assert.deepEqual(pastEnd.event.entries,[]);assert.equal(metadata(pastEnd).nextOffset,null);
  assert.equal(pastEnd.event.galleryIncomplete,undefined);
});

test('pre-reveal and global holds yield no selected entries or proof calls, including page moderation',async()=>{
  const f=await setup();f.time('2030-01-04T00:00:00Z');
  const early=await f.service.readPage(f.id,maintainer,{offset:0});
  assert.deepEqual(early.event.entries,[]);assert.deepEqual(early.moderationEntries,[]);
  assert.equal(metadata(early).nextOffset,null);assert.equal(early.event.galleryIncomplete,undefined);assert.equal(f.calls(),0);
  const held=await f.service.propose({actor:{id:'44',login:'other'},operationId:'page-held-proposal',manifest:hostedManifest({
    schedule:{...hostedManifest().schedule,galleryRevealAt:'2030-01-08T00:00:00Z'}})});
  const hold=f.store.records.get(held.eventId).state;
  hold.registrations=structuredClone(f.state.registrations);
  for(const item of Object.values(hold.registrations))item.revision=held.revision;
  f.time(reveal);
  const hidden=await f.service.readPage(f.id,maintainer,{offset:0});
  assert.deepEqual(hidden.event.entries,[]);assert.deepEqual(hidden.moderationEntries,[]);
  assert.equal(metadata(hidden).nextOffset,null);assert.equal(f.calls(),0);
  assert.doesNotMatch(JSON.stringify(hidden.event),/Entry 1001|student1001\.github/);
});

test('legacy exact-commit entries occupy page positions without requiring Pages proof',async()=>{
  const f=await setup();
  for(const actorId of f.actors.slice(0,2)) {
    const entry=f.state.entries[actorId][0];entry.repository={...entry.repository,commit:COMMIT};delete entry.pagesVerification;
  }
  const page=await f.service.readPage(f.id,undefined,{offset:0});
  assert.equal(page.event.entries.length,8);assert.equal(metadata(page).nextOffset,8);assert.equal(f.calls(),6);
  assert.equal(page.event.entries[0].repository.commit,COMMIT);
});

test('archived galleries without reveal schedules remain readable through the page contract',async()=>{
  const f=fixture(),id='jam-101',revision=await approved(f);
  await f.service.mutate({id,actor:participant,operationId:'page-legacy-join',action:'join',revision});
  await f.service.mutate(submission(revision));
  const result=await f.service.readPage(id,undefined,{offset:0});
  assert.equal(result.event.entries.length,1);assert.equal(result.event.entries[0].repository.commit,COMMIT);
  assert.equal(metadata(result).nextOffset,null);assert.equal(result.event.galleryIncomplete,undefined);
});

test('late or missing receipts, withdrawals and departed participants do not occupy page positions',async()=>{
  const f=await setup({count:13});
  const late=f.state.entries['1001'][0];
  late.submittedAt=late.pagesVerification.verifiedAt='2030-01-04T00:00:00.000Z';
  delete f.state.entries['1002'][0].pagesVerification;
  f.state.entries['1003'][0].status='withdrawn';f.state.registrations['1004'].status='left';
  const first=await f.service.readPage(f.id,maintainer,{offset:0});
  assert.deepEqual(participantIds(first),f.actors.slice(4,12));assert.equal(metadata(first).nextOffset,8);
  assert.equal(first.event.galleryIncomplete,undefined);assert.deepEqual(first.moderationEntries,[]);
  assert.doesNotMatch(JSON.stringify(first.event),/Entry 1001|Entry 1002|Entry 1003|Entry 1004/);
  const second=await f.service.readPage(f.id,undefined,{offset:8,revision:metadata(first).revision,validUntil:metadata(first).validUntil,notBefore:metadata(first).observedAt});
  assert.deepEqual(participantIds(second),['1013']);assert.equal(metadata(second).nextOffset,null);
  assert.equal(f.calls(),9);
});

test('maintainer supplements include only suppressed entries from this selected page',async()=>{
  const f=await setup({reader:async repository=>Number(repository.ownerId)%2?{status:'unverified',reason:'private'}:
    verifiedPages(repository,`https://student${repository.ownerId}.github.io/project/`)});
  const revision=await f.revision();
  const first=await f.service.readPage(f.id,maintainer,{offset:0,revision});
  assert.deepEqual(participantIds(first),['1002','1004','1006','1008']);
  assert.deepEqual(first.moderationEntries.map(entry=>entry.participantId),['1001','1003','1005','1007']);
  assert.doesNotMatch(JSON.stringify(first.moderationEntries),/Entry 1009|Entry 1010/);
  const second=await f.service.readPage(f.id,maintainer,{offset:8,revision,validUntil:metadata(first).validUntil,notBefore:metadata(first).observedAt});
  assert.deepEqual(second.moderationEntries.map(entry=>entry.participantId),['1009','1011','1013','1015']);
  const anonymous=await f.service.readPage(f.id,undefined,{offset:0,revision});
  assert.equal(anonymous.moderationEntries,undefined);
  assert.doesNotMatch(JSON.stringify(anonymous.event),/Entry 1001|student1001\.github|"private"/);
});

test('invalid options reject before authority or proof and stale revisions require restart',async()=>{
  const f=await setup();
  for(const options of [{},{offset:-1},{offset:201},{offset:0.5},{offset:'0'},{offset:NaN},{offset:Infinity},
    {offset:8},{offset:0,revision:null},{offset:0,revision:123},{offset:0,revision:'a'.repeat(39)},
    {offset:0,revision:'A'.repeat(40)},{offset:0,signal:{}},{offset:0,limit:9},
    {offset:8,revision:'f'.repeat(40)},{offset:8,revision:'f'.repeat(40),validUntil:undefined},
    {offset:0,validUntil:'2030-01-05T00:00:00Z'},{offset:0,validUntil:0},{offset:0,validUntil:-1},
    {offset:0,validUntil:1.5},{offset:0,validUntil:Infinity},{offset:0,validUntil:NaN},
    {offset:8,revision:'f'.repeat(40),validUntil:null},
    {offset:0,notBefore:null},{offset:0,notBefore:'0'},{offset:0,notBefore:-1},{offset:0,notBefore:0.5}]) {
    await assert.rejects(f.service.readPage(f.id,undefined,options),{status:400});
  }
  assert.equal(f.snapshots(),0);assert.equal(f.calls(),0);
  for(const offset of [0,8])await assert.rejects(f.service.readPage(f.id,undefined,{offset,revision:'f'.repeat(40),validUntil:null,notBefore:0}),
    {status:409,message:'The gallery changed. Restart loading its pages.'});
  assert.equal(f.calls(),0);
  const first=await f.service.readPage(f.id,undefined,{offset:0});f.store.bump();
  await assert.rejects(f.service.readPage(f.id,undefined,{offset:8,revision:metadata(first).revision,validUntil:metadata(first).validUntil,notBefore:metadata(first).observedAt}),{status:409});
});

test('registry changes during proof reject the entire page after complete authority revalidation',async()=>{
  let f,changed=false;
  f=await setup({reader:async(...args)=>{
    if(!changed){changed=true;f.state.entries['1001'][0].title='Private changed entry';f.store.bump();}
    return verifiedPages(...args);
  }});
  await assert.rejects(f.service.readPage(f.id,undefined,{offset:0}),{status:503,message:'Project visibility is unavailable.'});
  assert.equal(f.snapshots(),2);assert.equal(f.calls(),8);
});

test('caller cancellation stops page proof and prevents a late authority pass',async()=>{
  const started=Promise.withResolvers(),release=Promise.withResolvers();let proofSignal;
  const f=await setup({reader:async(_repository,_url,{signal})=>{proofSignal=signal;started.resolve();return release.promise;}});
  const controller=new AbortController();
  const pending=assert.rejects(f.service.readPage(f.id,undefined,{offset:0,signal:controller.signal}),{status:503});
  await started.promise;controller.abort();await pending;
  assert.equal(proofSignal.aborted,true);assert.equal(f.snapshots(),1);
  release.reject(Error('Private late provider failure'));await new Promise(setImmediate);
  assert.equal(f.snapshots(),1);
});

test('same-revision cross-event hold expiry invalidates continuations before offsets can skip or duplicate entries',async()=>{
  const f=await setup();await addHold(f);
  const first=await f.service.readPage(f.id,undefined,{offset:0}),page=metadata(first);
  assert.deepEqual(participantIds(first),f.actors.slice(2,10));
  assert.equal(page.validUntil,Date.parse('2030-01-06T00:00:00Z'));
  assert.equal(page.observedAt,Date.parse(reveal));
  assert.doesNotMatch(JSON.stringify(first),/validUntil|observedAt|nextOffset|1893888000000/);
  f.time('2030-01-06T00:00:00Z');assert.equal(await f.revision(),page.revision);
  const before=f.calls();
  await assert.rejects(f.service.readPage(f.id,undefined,{offset:page.nextOffset,revision:page.revision,
    validUntil:page.validUntil,notBefore:page.observedAt}),{status:409});
  assert.equal(f.calls(),before,'expired pagination dispatches no proof');
  const restarted=await f.service.readPage(f.id,undefined,{offset:0});
  assert.deepEqual(participantIds(restarted),f.actors.slice(0,8));assert.equal(metadata(restarted).validUntil,null);
});

test('hold expiry during proof rejects the complete page despite an unchanged Git revision',async()=>{
  let f,advance=false;
  f=await setup({reader:async(...args)=>{if(advance)f.time('2030-01-06T00:00:00Z');return verifiedPages(...args);}});
  await addHold(f);const revision=await f.revision(),before=f.snapshots();advance=true;
  await assert.rejects(f.service.readPage(f.id,undefined,{offset:0}),{status:409});
  assert.equal(await f.revision(),revision);assert.equal(f.calls(),8);assert.equal(f.snapshots()-before,2);
});

test('the horizon includes every accepted event regardless of moderation and must match supplied validity',async()=>{
  const f=await setup();
  await addHold(f,{actors:[],at:'2030-01-07T00:00:00Z',status:'suspended'});
  await addHold(f,{actors:[],at:'2030-01-06T00:00:00Z',status:'cancelled'});
  const first=await f.service.readPage(f.id,undefined,{offset:0});
  assert.equal(metadata(first).validUntil,Date.parse('2030-01-06T00:00:00Z'));
  for(const validUntil of [null,Date.parse('2030-01-07T00:00:00Z')])
    await assert.rejects(f.service.readPage(f.id,undefined,{offset:0,validUntil}),{status:409});
  const noFuture=await setup({count:0});
  await assert.rejects(noFuture.service.readPage(noFuture.id,undefined,
    {offset:0,validUntil:Date.parse('2030-01-06T00:00:00Z')}),{status:409});
});

test('service clock regression during proof or before continuation requires restart',async()=>{
  let f;
  f=await setup({reader:async(...args)=>{f.time('2030-01-04T23:59:59Z');return verifiedPages(...args);}});
  await assert.rejects(f.service.readPage(f.id,undefined,{offset:0}),{status:409});
  const stable=await setup(),first=await stable.service.readPage(stable.id,undefined,{offset:0}),page=metadata(first);
  const before=stable.calls();
  await assert.rejects(stable.service.readPage(stable.id,undefined,{offset:8,revision:page.revision,
    validUntil:page.validUntil,notBefore:page.observedAt+1}),{status:409});
  assert.equal(stable.calls(),before);
});

test('overview preserves private detail and fresh global authority without gallery proofs or supplements',async()=>{
  const f=await setup({reader:async()=>assert.fail('overview must not observe Pages')});
  const actor={id:'1001',login:'student1001'},before=f.snapshots();
  const own=await f.service.readOverview(f.id,actor);
  assert.equal(own.entry.title,'Entry 1001');assert.equal(own.registration.status,'joined');
  assert.equal(Object.hasOwn(own.event,'entries'),false);assert.equal(own.moderationEntries,undefined);
  assert.equal(own.proposal,undefined);assert.equal(own[JAM_PROJECTION_REVISION],await f.revision());
  assert.equal(f.snapshots()-before,1);assert.equal(f.calls(),0);assert.equal(metadata(own),undefined);
  const moderation=await f.service.readOverview(f.id,maintainer);
  assert.equal(moderation.canMaintain,true);assert.ok(moderation.proposal);
  assert.equal(moderation.moderationEntries,undefined);assert.equal(Object.hasOwn(moderation.event,'entries'),false);
  assert.equal((await f.service.readOverview(f.id)).entry,null);
  await addHold(f);
  const hold=[...f.store.records.values()].find(record=>record.state.id!==f.id).state;
  delete hold.registrations['1001'].repository;
  await assert.rejects(f.service.readOverview(f.id),{status:503});
  await assert.rejects(f.service.readOverview(f.id,undefined,{offset:0}),{status:400});
});

test('private moderation rejects everyone except configured maintainers before reading authority',async()=>{
  const f=await setup({reader:async()=>assert.fail('moderation must not observe Pages')});
  for(const actor of [undefined,null,creator,participant,{id:'1001',login:'student1001'}])
    await assert.rejects(f.service.readModeration(f.id,actor),{status:403});
  assert.equal(f.snapshots(),0);assert.equal(f.calls(),0);
  const unconfigured=createJamService({store:f.store,verifySource:async()=>assert.fail('unused'),maintainerIds:[]});
  await assert.rejects(unconfigured.readModeration(f.id,maintainer),{status:403});
  await assert.rejects(f.service.readModeration('invalid',maintainer),{status:400});
  await assert.rejects(f.service.readModeration(f.id,maintainer,{offset:0}),{status:400});
  const controller=new AbortController();controller.abort();
  await assert.rejects(f.service.readModeration(f.id,maintainer,{signal:controller.signal}),{status:503});
  assert.equal(f.snapshots(),0);
});

test('private moderation includes prereveal, globally held and historically unverified entries without Pages work',async()=>{
  const f=await setup({reader:async()=>assert.fail('moderation must not observe Pages')});
  delete f.state.entries['1001'][0].pagesVerification;
  f.state.entries['1001'][0].providerSecret='PRIVATE_PROVIDER_SECRET';
  f.time('2030-01-04T00:00:00Z');
  const early=await f.service.readModeration(f.id,maintainer);
  assert.equal(early.moderationEntries.length,30);assert.equal(f.calls(),0);assert.equal(f.snapshots(),1);
  assert.equal(early.moderationEntries[0].title,'Entry 1001');
  assert.equal(early.moderationEntries[0].pagesVerification,undefined);
  assert.deepEqual(Object.keys(early),['moderationEntries']);assert.equal(metadata(early),undefined);
  assert.equal(early[JAM_PROJECTION_REVISION],await f.revision());
  assert.equal(Object.getOwnPropertyDescriptor(early,JAM_PROJECTION_REVISION).enumerable,false);
  assert.doesNotMatch(JSON.stringify(early),new RegExp(`${early[JAM_PROJECTION_REVISION]}|PRIVATE_PROVIDER_SECRET|providerSecret|nextOffset|validUntil`));
  await addHold(f);f.time(reveal);
  const held=await f.service.readModeration(f.id,maintainer);
  assert.deepEqual(held.moderationEntries.map(entry=>entry.participantId),f.actors);
  assert.equal(f.calls(),0);
});

test('private moderation refreshes current active joined records and preserves complete visibility validation',async()=>{
  const f=await setup({reader:async()=>assert.fail('moderation must not observe Pages')});
  const first=await f.service.readModeration(f.id,maintainer);
  const previous=f.state.entries['1001'][0];
  f.state.entries['1001'].push({...previous,title:'Current replacement',revision:digest({replacement:true})});
  f.state.entries['1002'][0].status='withdrawn';f.state.registrations['1003'].status='left';f.store.bump();
  const current=await f.service.readModeration(f.id,maintainer);
  assert.equal(current.moderationEntries.length,28);assert.equal(current.moderationEntries[0].title,'Current replacement');
  assert.equal(current.moderationEntries.filter(entry=>entry.participantId==='1001').length,1);
  assert.ok(current.moderationEntries.every(entry=>!['1002','1003'].includes(entry.participantId)));
  assert.notEqual(current[JAM_PROJECTION_REVISION],first[JAM_PROJECTION_REVISION]);
  await assert.rejects(f.service.readModeration('jam-999',maintainer),{status:404});
  await addHold(f);
  const hold=[...f.store.records.values()].find(record=>record.state.id!==f.id).state;
  delete hold.registrations['1001'].repository;
  await assert.rejects(f.service.readModeration(f.id,maintainer),{status:503});
  assert.equal(f.calls(),0);
});

test('private moderation retains the schema participant cap rather than accepting an unbounded private result',async()=>{
  const f=await setup({count:LIMITS.participants,reader:async()=>assert.fail('moderation must not observe Pages')});
  const full=await f.service.readModeration(f.id,maintainer);
  assert.equal(full.moderationEntries.length,LIMITS.participants);
  f.state.registrations['9999']={...structuredClone(f.state.registrations['1001']),id:'9999',login:'student9999',
    repository:{id:'99999',ownerId:'9999',fullName:'student9999/project'}};
  await assert.rejects(f.service.readModeration(f.id,maintainer),{status:503});
  assert.equal(f.calls(),0);
});
