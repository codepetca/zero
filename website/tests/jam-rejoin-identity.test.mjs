import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,hostedManifest,creator,participant,verifiedPages} from '../../jams/test/fixtures.mjs';

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
