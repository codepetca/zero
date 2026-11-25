import test from 'node:test';
import assert from 'node:assert/strict';
import {creator, fixture, hostedManifest, maintainer, participant, verifiedPages} from './fixtures.mjs';
import {projectVisibility} from '../project-visibility.mjs';

async function game(options={}) {
  const registry=fixture({pagesBindingReader:verifiedPages,scheduleEditsEnabled:true,...options});
  const manifest=hostedManifest({style:{theme:'violet',backdrop:'stars'}});
  const {eventId:id,revision}=await registry.service.propose({actor:creator,operationId:'create-schedule-jam',manifest});
  const edit=(schedule,overrides={})=>registry.service.mutate({
    id,actor:creator,operationId:'edit-schedule-jam',action:'edit-schedule',revision,schedule,...overrides
  });
  return {...registry,id,revision,edit};
}

test('schedule edits are disabled during the reader compatibility rollout', async () => {
  const {service,id,revision,edit}=await game({scheduleEditsEnabled:false});
  assert.equal((await service.read(id,creator)).canEditSchedule,undefined);
  await assert.rejects(edit({galleryRevealAt:'2030-01-06T00:00:00Z'}),{status:503});
  assert.equal((await service.read(id)).event.revision,revision);
});

test('the owner edits upcoming times in the same jam and can recover the receipt after reveal', async () => {
  const {service,id,revision,edit,setTime}=await game();
  assert.equal((await service.read(id,creator)).canEditSchedule,true);
  assert.equal((await service.read(id,participant)).canEditSchedule,undefined);
  assert.equal((await service.read(id)).canEditSchedule,undefined);
  const schedule={submissionsCloseAt:'2030-01-03T18:00:00Z',galleryRevealAt:'2030-01-04T00:00:00Z'};
  for(const actor of [participant,maintainer]) await assert.rejects(edit(schedule,{actor}),{status:403});

  const result=await edit(schedule);
  assert.equal(result.eventId,id);
  assert.equal(result.status,'schedule-updated');
  assert.notEqual(result.revision,revision);
  const {event}=await service.read(id);
  assert.equal(event.revision,result.revision);
  assert.equal(event.schedule.submissionsCloseAt,'2030-01-03T18:00:00.000Z');
  assert.equal(event.schedule.galleryRevealAt,'2030-01-04T00:00:00.000Z');
  assert.equal(event.schedule.registrationClosesAt,'2030-01-03T00:00:00.000Z');
  assert.deepEqual(event.style,{theme:'violet',backdrop:'stars'});
  assert.deepEqual(event.approvalHistory.map(item=>item.revision),[revision,result.revision]);
  assert.equal(event.approvalHistory[0].manifest.schedule.submissionsCloseAt,'2030-01-04T00:00:00.000Z');

  setTime('2030-01-04T00:00:00Z');
  assert.equal((await service.read(id,creator)).canEditSchedule,undefined);
  assert.deepEqual(await edit(schedule),result);
  await assert.rejects(edit({galleryRevealAt:'2030-01-05T00:00:00Z'},{
    revision:result.revision,operationId:'move-revealed-gallery'
  }),{status:409});
});

test('passed dates, already-passed destinations, and stale or inconsistent edits are rejected', async () => {
  const {service,id,revision,edit,setTime}=await game();
  setTime('2030-01-03T00:00:00Z');
  await assert.rejects(edit({registrationClosesAt:'2030-01-03T12:00:00Z'}),{status:409});
  await assert.rejects(edit({submissionsCloseAt:'2030-01-03T00:00:00Z'}),{status:400});
  await assert.rejects(edit({galleryRevealAt:'2030-01-04T00:00:00Z'}),{status:400});
  await assert.rejects(edit({submissionsCloseAt:'2030-01-04T00:00:00Z'}),{status:400});
  await assert.rejects(edit({theme:'ocean'}),{status:400});
  assert.equal((await service.read(id)).event.revision,revision);

  const result=await edit({galleryRevealAt:'2030-01-06T00:00:00Z'});
  await assert.rejects(edit({galleryRevealAt:'2030-01-07T00:00:00Z'},{operationId:'stale-schedule-form'}),{status:409});
  const restored=await edit({galleryRevealAt:'2030-01-05T00:00:00Z'},{
    operationId:'restore-schedule-date',revision:result.revision
  });
  const {event}=await service.read(id);
  assert.equal(new Set([revision,result.revision,restored.revision]).size,3);
  assert.equal(event.schedule.galleryRevealAt,event.approvalHistory[0].manifest.schedule.galleryRevealAt);
});

test('an edit rechecks the current deadline after a rejected concurrent write', async () => {
  const {edit,id,service,setTime,store}=await game();
  store.beforeCas=()=>{store.beforeCas=null;setTime('2030-01-04T00:00:00Z');store.bump();};
  await assert.rejects(edit({submissionsCloseAt:'2030-01-04T12:00:00Z'}),{status:409});
  assert.equal((await service.read(id)).event.schedule.submissionsCloseAt,'2030-01-04T00:00:00.000Z');
});

test('registrations and entries survive a schedule change and a selected winner survives a later gallery edit', async () => {
  const {service,store,id,revision,edit,setTime}=await game();
  await service.mutate({id,actor:participant,operationId:'schedule-test-join',action:'join',revision,
    repositoryUrl:'https://github.com/student/project'});
  const submitted=await service.mutate({id,actor:participant,operationId:'schedule-test-submit',action:'submit',revision,
    title:'First entry',description:'A tiny game',demoUrl:'https://student.github.io/project/'});

  const edited=await edit({submissionsCloseAt:'2030-01-03T12:00:00Z'});
  const {registration,entry}=await service.read(id,participant);
  assert.equal(registration.revision,revision);
  assert.equal(entry.eventRevision,revision);
  assert.equal(entry.revision,submitted.revision);
  assert.deepEqual((await service.read(id)).event.entries,[]);

  setTime('2030-01-03T12:00:00Z');
  const picked=await service.mutate({id,actor:creator,operationId:'schedule-test-winner',action:'pick-winner',
    revision:submitted.revision,participantId:participant.id});
  assert.equal(picked.status,'winner-selected');
  assert.equal((await service.read(id,creator)).canEditSchedule,true);
  await edit({galleryRevealAt:'2030-01-06T00:00:00Z'},{operationId:'move-future-gallery',revision:edited.revision});

  const oldReveal='2030-01-05T00:00:00Z';
  setTime(oldReveal);
  assert.deepEqual((await service.read(id)).event.entries,[]);
  assert.equal((await projectVisibility(await store.snapshot(),Date.parse(oldReveal))).isHeld('202'),true);
  setTime('2030-01-06T00:00:00Z');
  const {event}=await service.read(id);
  assert.deepEqual(event.entries.map(item=>[item.participantId,item.winner]),[[participant.id,true]]);
});

test('a previously settled schedule edit cannot mutate the jam', async () => {
  const {service,id,revision,edit}=await game();
  const schedule={galleryRevealAt:'2030-01-06T00:00:00Z'};
  const result=await service.settle({scope:id,actor:creator,operationId:'edit-schedule-jam',
    payload:{action:'edit-schedule',revision,schedule}});
  assert.equal(result.settlement,'not-applied');
  assert.deepEqual(await edit(schedule),result);
  assert.equal((await service.read(id)).event.revision,revision);
});
