import test from 'node:test';
import assert from 'node:assert/strict';
import {creator, fixture, hostedManifest, participant, verifiedPages} from './fixtures.mjs';
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
  assert.equal(before.gameJamWinnerFor(participant.id+'0',participant.id),undefined);
  setTime('2030-01-05T00:00:00Z');
  const {event} = await service.read(eventId);
  assert.deepEqual(event.entries.filter(entry=>entry.winner).map(entry=>entry.participantId),[participant.id]);
  const visible = await projectVisibility(await store.snapshot(),Date.parse('2030-01-05T00:00:00Z'));
  assert.equal(visible.gameJamWinnerFor(participant.id+'0',participant.id).id,eventId);
  assert.equal(visible.gameJamWinnerFor(participant.id+'0',creator.id),undefined);
  assert.equal(visible.gameJamWinnerFor(creator.id+'0',creator.id),undefined);
});

test('App Jam hosts cannot use Game Jam awards', async () => {
  const {service,setTime} = fixture();
  const {eventId} = await service.propose({actor:creator,operationId:'winner-app-create',manifest:hostedManifest({type:'app'})});
  setTime('2030-01-05T00:00:00Z');
  await assert.rejects(service.readWinnerSelection(eventId,creator),{status:409});
  await assert.rejects(service.mutate({id:eventId,actor:creator,operationId:'winner-app-choice',action:'pick-winner',
    participantId:participant.id,revision:'a'.repeat(64)}),{status:409});
});
