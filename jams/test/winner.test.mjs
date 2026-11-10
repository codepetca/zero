import test from 'node:test';
import assert from 'node:assert/strict';
import {creator, fixture, hostedManifest, maintainer, participant, verifiedPages} from './fixtures.mjs';
import {projectVisibility} from '../project-visibility.mjs';

test('a changed winner replaces the badge without changing an accepted retry', async () => {
  const {service,store,setTime} = fixture({pagesBindingReader:verifiedPages,
    verifyRepository:async ({actor})=>({repository:{id:actor.id+'0',ownerId:actor.id,fullName:actor.login+'/game'}})});
  const {eventId,revision} = await service.propose({actor:creator,operationId:'winner-jam-create',manifest:hostedManifest()});
  const entries = new Map();
  for (const actor of [creator,participant]) {
    await service.mutate({id:eventId,actor,operationId:'winner-jam-join',action:'join',revision,
      repositoryUrl:`https://github.com/${actor.login}/game`});
    const entry = await service.mutate({id:eventId,actor,operationId:'winner-jam-submit',action:'submit',revision,
      title:actor.login,description:'A game',demoUrl:`https://${actor.login}.github.io/game/`});
    entries.set(actor.id,entry.revision);
  }
  const pick = (actor,operationId,entryRevision=entries.get(actor.id))=>service.mutate({
    id:eventId,actor:creator,operationId,action:'pick-winner',participantId:actor.id,revision:entryRevision
  });
  setTime('2030-01-04T00:00:00Z');
  await assert.rejects(pick(participant,'winner-stale-selection','f'.repeat(64)),{status:409});
  const first = await pick(creator,'winner-first-choice');
  await pick(participant,'winner-second-choice');
  assert.deepEqual(await pick(creator,'winner-first-choice'),first);
  assert.equal((await service.readWinnerSelection(eventId,creator)).winnerSelection.currentRevision,entries.get(participant.id));
  const before = await projectVisibility(await store.snapshot(),Date.parse('2030-01-04T00:00:00Z'));
  assert.equal(before.isGameJamWinner(participant.id+'0',participant.id),false);
  setTime('2030-01-05T00:00:00Z');
  const {event} = await service.read(eventId);
  assert.deepEqual(event.entries.filter(entry=>entry.winner).map(entry=>entry.participantId),[participant.id]);
  const visible = await projectVisibility(await store.snapshot(),Date.parse('2030-01-05T00:00:00Z'));
  assert.equal(visible.isGameJamWinner(participant.id+'0',participant.id),true);
  assert.equal(visible.isGameJamWinner(participant.id+'0',creator.id),false);
  assert.equal(visible.isGameJamWinner(creator.id+'0',creator.id),false);
});

test('App Jam hosts cannot use Game Jam awards', async () => {
  const {service,setTime} = fixture();
  const {eventId} = await service.propose({actor:creator,operationId:'winner-app-create',manifest:hostedManifest({type:'app'})});
  setTime('2030-01-05T00:00:00Z');
  await assert.rejects(service.readWinnerSelection(eventId,creator),{status:409});
  await assert.rejects(service.mutate({id:eventId,actor:creator,operationId:'winner-app-choice',action:'pick-winner',
    participantId:participant.id,revision:'a'.repeat(64)}),{status:409});
});

test('the host can remove a winning entry after reveal without withdrawing its registration', async () => {
  let canCreate=true;
  const {service,store,setTime}=fixture({canCreateJam:()=>canCreate,pagesBindingReader:verifiedPages});
  const {eventId:id,revision}=await service.propose({actor:creator,operationId:'remove-winner-create',manifest:hostedManifest()});
  await service.mutate({id,actor:participant,operationId:'remove-winner-join',action:'join',revision,
    repositoryUrl:'https://github.com/student/project'});
  const entry=await service.mutate({id,actor:participant,operationId:'remove-winner-submit',action:'submit',revision,
    title:'Winning game',description:'A game',demoUrl:'https://student.github.io/project/'});
  const removal={id,actor:creator,operationId:'remove-winner-host',action:'withdraw-entry',
    participantId:participant.id,reason:'Entrant requested removal.'};
  setTime('2030-01-04T00:00:00Z');
  await service.mutate({id,actor:creator,operationId:'remove-winner-pick',action:'pick-winner',
    participantId:participant.id,revision:entry.revision});
  assert.equal((await service.read(id,creator)).canHostRemoveEntry,undefined);
  await assert.rejects(service.mutate(removal),{status:403});
  const reveal='2030-01-05T00:00:00Z';
  setTime(reveal);
  assert.equal((await service.readPage(id,creator,{offset:0})).canHostRemoveEntry,true);
  assert.equal((await service.readPage(id,participant,{offset:0})).canHostRemoveEntry,undefined);
  await assert.rejects(service.mutate({...removal,actor:participant}),{status:403});
  await service.mutate({id,actor:maintainer,operationId:'remove-winner-suspend',action:'suspend',reason:'Review'});
  await assert.rejects(service.mutate(removal),{status:403});
  await service.mutate({id,actor:maintainer,operationId:'remove-winner-resume',action:'resume',reason:'Reviewed'});

  canCreate=false;
  const result=await service.mutate(removal);
  assert.equal(result.status,'withdrawn');
  assert.deepEqual(await service.mutate(removal),result);
  const detail=await service.read(id,participant);
  assert.deepEqual(detail.event.entries,[]);
  assert.equal(detail.registration.status,'joined');
  assert.equal(detail.entry.reason,removal.reason);
  assert.equal(detail.entry.moderatedBy,creator.id);
  const visibility=await projectVisibility(await store.snapshot(),Date.parse(reveal));
  assert.equal(visibility.isGameJamWinner('202',participant.id),false);
  assert.equal(visibility.isHeld('202'),false);
});
