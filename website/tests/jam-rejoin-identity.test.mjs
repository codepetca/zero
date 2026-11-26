import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,hostedManifest,creator,participant,verifiedPages} from '../../jams/test/fixtures.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';

test('renamed repository can rejoin only when GitHub returns the same numeric ID',async()=>{
  let currentId='202';
  const f=fixture({verifyRepository:async({repositoryId,repositoryUrl,actor})=>({repository:{
    id:repositoryId??currentId,ownerId:actor.id,fullName:repositoryId?'student/new-name':new URL(repositoryUrl).pathname.slice(1)
  }})});
  const p=await f.service.propose({actor:creator,operationId:'rename-propose-01',manifest:hostedManifest()});
  const join={id:p.eventId,actor:participant,action:'join',revision:p.revision};
  await f.service.mutate({...join,operationId:'rename-join-old-01',repositoryUrl:'https://github.com/student/old-name'});
  await f.service.mutate({id:p.eventId,actor:participant,operationId:'rename-leave-01',action:'leave'});
  currentId='203';
  await assert.rejects(f.service.mutate({...join,operationId:'rename-wrong-id-01',repositoryUrl:'https://github.com/student/new-name'}),e=>e.status===409);
  currentId='202';
  await f.service.mutate({...join,operationId:'rename-join-new-01',repositoryUrl:'https://github.com/student/new-name'});
  assert.equal((await f.service.read(p.eventId,participant)).registration.repository.fullName,'student/new-name');
});


test('a competing Game Jam rejoin cannot replace the binding that just won',async()=>{
  const verification=Promise.withResolvers(),resume=Promise.withResolvers();
  const f=fixture({verifyRepository:async({repositoryId,repositoryUrl,actor})=>{
    if(repositoryId==='202') {
      verification.resolve();
      await resume.promise;
      return null;
    }
    const name=new URL(repositoryUrl).pathname.split('/').at(-1);
    return {repository:{id:name==='original'?'202':'203',ownerId:actor.id,fullName:`student/${name}`}};
  }});
  const p=await f.service.propose({actor:creator,operationId:'race-propose-01',manifest:hostedManifest()});
  const join={id:p.eventId,actor:participant,action:'join',revision:p.revision};
  await f.service.mutate({...join,operationId:'race-join-01',repositoryUrl:'https://github.com/student/original'});
  await f.service.mutate({id:p.eventId,actor:participant,action:'leave',operationId:'race-leave-01'});
  const replace=f.service.mutate({...join,operationId:'race-replace-01',repositoryUrl:'https://github.com/student/replacement'});
  await verification.promise;
  await f.service.mutate({...join,operationId:'race-join-02',repositoryUrl:'https://github.com/student/original'});
  resume.resolve();
  await assert.rejects(replace,{status:409});
  assert.equal((await f.service.read(p.eventId,participant)).registration.repository.id,'202');
});

test('an App Jam retains the original binding after leaving even if the repository is gone',async()=>{
  const f=fixture({verifyRepository:async({repositoryId,repositoryUrl,actor})=>{
    assert.equal(repositoryId,undefined);
    const name=new URL(repositoryUrl).pathname.split('/').at(-1);
    return {repository:{id:name==='original'?'202':'203',ownerId:actor.id,fullName:`student/${name}`}};
  }});
  const p=await f.service.propose({actor:creator,operationId:'app-rejoin-propose',manifest:hostedManifest({type:'app'})});
  const join={id:p.eventId,actor:participant,action:'join',revision:p.revision};
  await f.service.mutate({...join,operationId:'app-rejoin-original',repositoryUrl:'https://github.com/student/original'});
  await f.service.mutate({id:p.eventId,actor:participant,action:'leave',operationId:'app-rejoin-leave'});
  await assert.rejects(f.service.mutate({...join,operationId:'app-rejoin-replacement',repositoryUrl:'https://github.com/student/replacement'}),{status:409});
});


test('publishing a replacement keeps the withdrawn entry in history and uses the new project name',async()=>{
  const f=fixture({pagesBindingReader:verifiedPages,verifyRepository:async({repositoryId,repositoryUrl,actor,allowMissing})=>{
    if(allowMissing&&repositoryId==='202')return null;
    const name=repositoryUrl?new URL(repositoryUrl).pathname.split('/').at(-1):repositoryId==='202'?'original':'replacement';
    return {repository:{id:name==='original'?'202':'203',ownerId:actor.id,fullName:`student/${name}`}};
  }});
  const {eventId:id,revision}=await f.service.propose({actor:creator,operationId:'publish-rejoin-propose',manifest:hostedManifest()});
  const base={id,actor:participant};
  await f.service.mutate({...base,action:'join',operationId:'publish-rejoin-original',revision,repositoryUrl:'https://github.com/student/original'});
  await f.service.mutate({...base,action:'submit',operationId:'publish-rejoin-old-entry',revision,title:'Original game',description:'Original description',demoUrl:'https://student.github.io/original/'});
  await f.service.mutate({...base,action:'leave',operationId:'publish-rejoin-leave'});
  await f.service.mutate({...base,action:'join',operationId:'publish-rejoin-new-project',revision,repositoryUrl:'https://github.com/student/replacement'});
  const withdrawn=(await f.service.read(id,participant)).entry;
  assert.equal(withdrawn.status,'withdrawn');
  assert.equal(withdrawn.title,'Original game');
  const pagesUrl='https://student.github.io/replacement/';
  await f.service.mutate({...base,action:'submit',operationId:'publish-rejoin-new-entry',revision,
    publication:{repositoryId:'203',pagesUrl,commit:'a'.repeat(40),runId:'30',entryRevision:withdrawn.revision}
  },{verifyPublication:async()=>({pagesUrl})});
  const history=(await f.store.read(id)).state.entries[participant.id];
  assert.deepEqual(history.map(entry=>[entry.status,entry.repository.id]),[['active','202'],['withdrawn','202'],['active','203']]);
  assert.equal(history.at(-1).title,'replacement');
  assert.equal(history.at(-1).description,'');
});

test('a joined student can replace a deleted repository after registration closes and keep one official entry',async()=>{
  const repositories=new Map([['202','student/game'],['203','student/another-game']]);
  const lookups=[];
  const f=fixture({pagesBindingReader:verifiedPages,verifyRepository:async({repositoryId,repositoryUrl,actor})=>{
    lookups.push(repositoryId??repositoryUrl);
    const id=repositoryId??[...repositories].find(([,name])=>name===new URL(repositoryUrl).pathname.slice(1))?.[0];
    const fullName=repositories.get(id);
    if(!fullName)throw Error('Repository was deleted');
    return {repository:{id,ownerId:actor.id,fullName}};
  }});
  const manifest=hostedManifest();
  const schedule={...manifest.schedule,registrationClosesAt:'2030-01-02T13:00:00Z'};
  const {eventId:id,revision}=await f.service.propose({actor:creator,operationId:'replace-active-propose',manifest:{...manifest,schedule}});
  const base={id,actor:participant},editor={joinChannel:'editor'};
  await f.service.mutate({...base,action:'join',operationId:'replace-active-join',revision,
    repositoryId:'202',repositoryUrl:'https://github.com/student/game'},editor);
  await f.service.mutate({...base,action:'submit',operationId:'submit-old-project',revision,
    title:'First game',description:'First entry',demoUrl:'https://student.github.io/game/'});

  f.setTime('2030-01-03T10:00:00Z');
  assert.equal((await f.service.readEditorJoin(id,participant)).canManageProjects,true);
  repositories.delete('202');
  const remove={...base,action:'remove-project',operationId:'remove-old-project',repositoryId:'202'};
  const before=lookups.length;
  await assert.rejects(f.service.mutate(remove,{joinChannel:'browser'}),{status:403});
  const removed=await f.service.mutate(remove,editor);
  assert.deepEqual(await f.service.mutate(remove,editor),removed);
  assert.equal(lookups.length,before);
  const detached=await f.service.readEditorJoin(id,participant);
  assert.equal(detached.registration.status,'joined');
  assert.deepEqual(detached.registration.repositories,[]);
  assert.equal(detached.registration.repository,undefined);
  assert.equal(detached.entry.status,'withdrawn');
  assert.equal((await f.service.projectDestination('202',participant)).destination,null);
  assert.ok((await projectVisibility(await f.store.snapshot(),Date.parse('2030-01-03T10:00:00Z'))).isHeld('202'));

  repositories.set('204','student/game');
  const add={...base,action:'add-project',repositoryId:'204',repositoryUrl:'https://github.com/student/game'};
  await assert.rejects(f.service.mutate({...add,operationId:'add-someone-else',actor:{id:'505',login:'classmate'}},editor),{status:409});
  await assert.rejects(f.service.mutate({...add,operationId:'add-wrong-identity',repositoryId:'202'},editor),{status:409});
  await f.service.mutate({...add,operationId:'add-recreated-project'},editor);
  await f.service.mutate({...add,operationId:'add-another-project',repositoryId:'203',repositoryUrl:'https://github.com/student/another-game'},editor);
  assert.deepEqual((await f.service.readEditorJoin(id,participant)).registration.repositories.map(repo=>repo.id),['204','203']);
  assert.equal((await f.service.projectDestination('203',participant)).destination.id,id);
  // Older Hub readers only consult the singular registration and this set.
  assert.ok((await f.store.read(id)).state.replacedRepositoryIds.includes('203'));

  const pagesUrl='https://student.github.io/another-game/';
  const submit={...base,action:'submit',operationId:'submit-new-project',revision,
    publication:{repositoryId:'203',pagesUrl,commit:'a'.repeat(40),runId:'30',entryRevision:detached.entry.revision}};
  await f.service.mutate(submit,{verifyPublication:async()=>({pagesUrl})});
  const after=await f.service.readEditorJoin(id,participant);
  assert.equal(after.event.participantCount,1);
  assert.equal(after.entry.repository.id,'203');
  assert.equal(after.entry.status,'active');
  const history=(await f.store.read(id)).state.entries[participant.id];
  assert.deepEqual(history.map(entry=>[entry.status,entry.repository.id]),[['active','202'],['withdrawn','202'],['active','203']]);

  f.setTime(manifest.schedule.submissionsCloseAt);
  await assert.rejects(f.service.mutate({...remove,repositoryId:'203',operationId:'too-late-to-remove'},editor),{status:409});
  assert.equal((await f.service.readEditorJoin(id,participant)).entry.status,'active');
  f.setTime(manifest.schedule.galleryRevealAt);
  assert.equal((await projectVisibility(await f.store.snapshot(),Date.parse(manifest.schedule.galleryRevealAt))).isHeld('202'),false);
});

test('a publish verified during project removal cannot apply after reattaching the same repository',async()=>{
  const f=fixture();
  const {eventId:id,revision}=await f.service.propose({actor:creator,operationId:'publish-remove-race',manifest:hostedManifest()});
  const base={id,actor:participant},editor={joinChannel:'editor'};
  await f.service.mutate({...base,action:'join',operationId:'join-remove-race',revision,
    repositoryId:'202',repositoryUrl:'https://github.com/student/project'},editor);
  const verificationStarted=Promise.withResolvers(),allowVerification=Promise.withResolvers();
  const pagesUrl='https://student.github.io/project/';
  const publishing=f.service.mutate({...base,action:'submit',operationId:'publish-during-remove',revision,
    publication:{repositoryId:'202',pagesUrl,commit:'a'.repeat(40),runId:'30',entryRevision:''}
  },{verifyPublication:async()=>{
    verificationStarted.resolve();
    await allowVerification.promise;
    return {pagesUrl};
  }});
  await verificationStarted.promise;
  await f.service.mutate({...base,action:'remove-project',operationId:'race-remove-project',repositoryId:'202'},editor);
  await f.service.mutate({...base,action:'add-project',operationId:'race-reattach-project',repositoryId:'202',
    repositoryUrl:'https://github.com/student/project'},editor);
  allowVerification.resolve();
  await assert.rejects(publishing,{status:409});
  const state=await f.service.readEditorJoin(id,participant);
  assert.equal(state.entry,null);
  assert.equal(state.registration.repositories[0].id,'202');
  await assert.rejects(f.service.mutate({...base,action:'submit',operationId:'stale-reviewed-project',revision,
    publication:{repositoryId:'202',pagesUrl,commit:'a'.repeat(40),runId:'30',entryRevision:'',projectRevision:''}
  },{verifyPublication:()=>assert.fail('Reject stale consent before provider verification')}),{status:409});
});

test('a delayed add cannot undo a later remove from another editor',async()=>{
  const started=Promise.withResolvers(),finish=Promise.withResolvers();
  let delay=false;
  const f=fixture({verifyRepository:async({repositoryUrl,actor})=>{
    const name=new URL(repositoryUrl).pathname.slice(1),id=name.endsWith('/first')?'202':'203';
    if(delay) {delay=false;started.resolve();await finish.promise;}
    return {repository:{id,ownerId:actor.id,fullName:name}};
  }});
  const {eventId:id,revision}=await f.service.propose({actor:creator,operationId:'two-editors-propose',manifest:hostedManifest()});
  const base={id,actor:participant},editor={joinChannel:'editor'};
  await f.service.mutate({...base,action:'join',operationId:'two-editors-join',revision,
    repositoryId:'202',repositoryUrl:'https://github.com/student/first'},editor);
  const add={...base,action:'add-project',repositoryId:'203',repositoryUrl:'https://github.com/student/second',projectRevision:''};
  delay=true;
  const earlier=f.service.mutate({...add,operationId:'two-editors-earlier'},editor);
  await started.promise;
  await f.service.mutate({...add,operationId:'two-editors-add'},editor);
  const {registration}=await f.service.readEditorJoin(id,participant);
  await f.service.mutate({...base,action:'remove-project',operationId:'two-editors-remove',repositoryId:'203',
    projectRevision:registration.projectRevision},editor);
  finish.resolve();
  await assert.rejects(earlier,{status:409});
  assert.deepEqual((await f.service.readEditorJoin(id,participant)).registration.repositories.map(repo=>repo.id),['202']);
});
