import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,hostedManifest,participant,creator} from './fixtures.mjs';

async function linked(service,actor,operationId,overrides={}) {
  const event=await service.propose({actor,operationId,manifest:hostedManifest(overrides)});
  await service.mutate({id:event.eventId,actor:participant,operationId:'join-'+operationId,action:'join',
    revision:event.revision,repositoryUrl:'https://github.com/student/project',
    ...(overrides.type==='app'?{}:{repositoryId:'202'})},{joinChannel:overrides.type==='app'?'browser':'editor'});
  return event;
}

test('destination choices are opt-in, account/project scoped, and exact selection cannot fall through',async()=>{
  const {service,setTime}=fixture();
  const first=await linked(service,creator,'first-destination');
  const second=await linked(service,{id:'12',login:'second'},'second-destination',{
    title:'Second jam',schedule:{...hostedManifest().schedule,submissionsCloseAt:'2030-01-04T12:00:00Z'}});
  await linked(service,{id:'13',login:'third'},'third-destination',{type:'app'});
  assert.deepEqual(await service.projectDestination('202',participant),{destination:null,ambiguous:true});
  const options={includeDestinations:true};
  const choices=await service.projectDestination('202',participant,options);
  assert.equal(choices.ambiguous,true);
  assert.deepEqual(choices.destinations.map(item=>item.id),[first.eventId,second.eventId]);
  assert.equal(choices.destinations[0].projectRevision,'');
  assert.deepEqual(await service.projectDestination('202',creator,options),{destination:null,destinations:[]});
  assert.deepEqual(await service.projectDestination('203',participant,options),{destination:null,destinations:[]});
  const selected=await service.projectDestination('202',participant,{...options,destinationId:second.eventId});
  assert.equal(selected.destination.id,second.eventId);
  assert.equal(selected.ambiguous,undefined);
  await assert.rejects(service.projectDestination('202',creator,{...options,destinationId:second.eventId}),error=>error.status===409);
  setTime('2030-01-04T01:00:00Z');
  const recovering=await service.projectDestination('202',participant,{...options,destinationId:first.eventId});
  assert.equal(recovering.destination.id,first.eventId);
  assert.equal(recovering.destination.submissionsOpen,false);
  assert.deepEqual(recovering.destinations.map(item=>item.id),[second.eventId]);
  await service.mutate({id:second.eventId,actor:participant,operationId:'leave-selected-jam',action:'leave'});
  await assert.rejects(service.projectDestination('202',participant,{...options,destinationId:second.eventId}),error=>error.status===409);
  assert.equal((await service.projectDestination('202',participant)).destination.id,first.eventId);
});

test('destination options reject malformed selection and honor cancellation',async()=>{
  const {service}=fixture();
  for(const options of [{includeDestinations:false},{destinationId:'jam-1'},
    {includeDestinations:true,destinationId:'invalid'},{includeDestinations:true,unknown:1}])
    await assert.rejects(service.projectDestination('202',participant,options),error=>error.status===400);
  await assert.rejects(service.projectDestination('202',participant,{includeDestinations:true,signal:AbortSignal.abort()}));
});
