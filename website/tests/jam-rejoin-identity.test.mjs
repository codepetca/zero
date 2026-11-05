import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,hostedManifest,creator,maintainer,participant} from '../../jams/test/fixtures.mjs';

test('renamed repository can rejoin only when GitHub returns the same numeric ID',async()=>{
  let currentId='202';
  const f=fixture({verifyRepository:async({repositoryUrl,actor})=>({repository:{id:currentId,ownerId:actor.id,fullName:new URL(repositoryUrl).pathname.slice(1)}})});
  const p=await f.service.propose({actor:creator,operationId:'rename-propose-01',manifest:hostedManifest()});
  await f.service.mutate({id:p.eventId,actor:maintainer,operationId:'rename-approve-01',action:'approve',revision:p.revision});
  const join={id:p.eventId,actor:participant,action:'join',revision:p.revision};
  await f.service.mutate({...join,operationId:'rename-join-old-01',repositoryUrl:'https://github.com/student/old-name'});
  await f.service.mutate({id:p.eventId,actor:participant,operationId:'rename-leave-01',action:'leave'});
  currentId='203';
  await assert.rejects(f.service.mutate({...join,operationId:'rename-wrong-id-01',repositoryUrl:'https://github.com/student/new-name'}),e=>e.status===409);
  currentId='202';
  await f.service.mutate({...join,operationId:'rename-join-new-01',repositoryUrl:'https://github.com/student/new-name'});
  assert.equal((await f.service.read(p.eventId,participant)).registration.repository.fullName,'student/new-name');
});
