import test from 'node:test';
import assert from 'node:assert/strict';
import {atomicGitHttpFixture} from '../../jams/test/git-http-fixture.mjs';
import {createJamService} from '../../jams/service.mjs';
import {creator,maintainer,participant,hostedManifest} from '../../jams/test/fixtures.mjs';
import {createJamPagesBindingReader} from '../lib/jam-pages-binding.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';

for(const type of ['game','app']) test(`hosted ${type} creation, independent approval, prepublication join, verified Pages and reveal share atomic authority`,async t=>{
  const f=await atomicGitHttpFixture(t);await f.store.migrate();
  let time=Date.parse('2030-01-02T12:00:00Z'),pagesAvailable=false,pagesCalls=0;
  const pagesUrl='https://play.example.org/';
  const pagesBindingReader=createJamPagesBindingReader({
    readDestinationBinding:async()=>({repositoryId:'202',ownerId:participant.id,repositoryUrl:'https://github.com/student/project'}),
    fetchImpl:async url=>{assert.equal(url,'https://api.github.com/repos/student/project/pages');pagesCalls++;
      return pagesAvailable?Response.json({html_url:'https://play.example.org',public:true,status:'built'}):new Response(null,{status:404});}
  });
  const service=createJamService({canCreateJam:()=>true,store:f.store,maintainerIds:[creator.id,maintainer.id],now:()=>time,pagesBindingReader,
    verifySource:async()=>assert.fail('Hosted creation requires no organizer repository'),
    verifyRepository:async({actor})=>({repository:{id:'202',ownerId:actor.id,fullName:'student/project'}})});
  const proposed=await service.propose({actor:creator,operationId:`hosted-${type}-proposal`,manifest:hostedManifest({type})});
  assert.equal((await service.read(proposed.eventId)).event.revision,proposed.revision);
  await assert.rejects(service.mutate({id:proposed.eventId,actor:creator,operationId:`self-${type}-approval`,action:'approve',revision:proposed.revision}),error=>error.status===403);
  await service.mutate({id:proposed.eventId,actor:participant,operationId:`join-${type}-before-pages`,action:'join',revision:proposed.revision,repositoryUrl:'https://github.com/student/project'});
  assert.equal(pagesCalls,0);assert.equal((await service.read(proposed.eventId,participant)).entry,null);
  assert.equal((await projectVisibility(await f.store.snapshot(),time)).isHeld('202'),true);
  const submission={id:proposed.eventId,actor:participant,operationId:`submit-${type}-verified`,action:'submit',revision:proposed.revision,title:'Project',description:'A useful project',demoUrl:pagesUrl};
  await assert.rejects(service.mutate(submission),error=>error.status===503);
  assert.equal((await projectVisibility(await f.store.snapshot(),time)).isHeld('202'),true);
  pagesAvailable=true;assert.equal((await service.mutate(submission)).status,'submitted');
  assert.deepEqual((await service.read(proposed.eventId)).event.entries,[]);
  time=Date.parse('2030-01-05T00:00:00Z');
  const shown=await service.read(proposed.eventId);
  assert.equal(shown.event.entries.length,1);assert.equal(shown.event.entries[0].demoUrl,pagesUrl);
  assert.equal((await projectVisibility(await f.store.snapshot(),time)).isHeld('202'),false);
  pagesAvailable=false;assert.deepEqual((await service.read(proposed.eventId)).event.entries,[]);
});
