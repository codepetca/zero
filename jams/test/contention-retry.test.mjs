import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,creator,maintainer,participant,hostedManifest} from './fixtures.mjs';

async function setup() {
  const f=fixture();
  const proposal=await f.service.propose({actor:creator,operationId:'retry-proposal-01',manifest:hostedManifest()});
  const join={id:proposal.eventId,actor:participant,operationId:'retry-join-00001',action:'join',revision:proposal.revision,
    repositoryUrl:'https://github.com/student/project'};
  return {...f,join};
}

test('a rejected update followed by a deadline crossing cannot accept a late join',async()=>{
  const f=await setup();let attempts=0;
  f.store.beforeCas=()=>{attempts++;f.store.bump();f.setTime('2030-01-03T00:00:00Z');};
  await assert.rejects(f.service.mutate(f.join),error=>error.status===409&&/Registration is closed/.test(error.message));
  assert.equal(attempts,1);assert.equal((await f.store.read(f.join.id)).state.registrations[participant.id],undefined);
});

test('cancellation after a rejected update stops retry work and its timer',async t=>{
  const f=await setup(),controller=new AbortController(),rejected=Promise.withResolvers();let attempts=0,snapshots=0;
  t.mock.timers.enable({apis:['setTimeout']});
  const originalSnapshot=f.store.snapshot.bind(f.store);
  f.store.snapshot=async(...args)=>{snapshots++;return originalSnapshot(...args);};
  f.store.beforeCas=()=>{attempts++;f.store.bump();rejected.resolve();};
  const pending=assert.rejects(f.service.mutate(f.join,{signal:controller.signal}),error=>error.status===503);
  await rejected.promise;await new Promise(setImmediate);controller.abort();await pending;
  const atAbort=snapshots;t.mock.timers.tick(350);await new Promise(setImmediate);
  assert.equal(attempts,1);assert.equal(snapshots,atAbort);
  assert.equal((await f.store.read(f.join.id)).state.registrations[participant.id],undefined);
});

test('an unknown update error is not retried internally',async()=>{
  const f=await setup();let attempts=0;
  f.store.beforeCas=()=>{attempts++;throw Error('private provider error');};
  await assert.rejects(f.service.mutate(f.join),error=>error.status===503&&!error.message.includes('private'));
  assert.equal(attempts,1);
});

test('non-boolean store results never confirm or retry a write or settlement',async()=>{
  for(const malformed of [null,undefined,{applied:false},1]) {
    const f=await setup();let attempts=0;
    f.store.compareAndSwap=async()=>{attempts++;return malformed;};
    await assert.rejects(f.service.mutate(f.join),error=>error.status===503);
    assert.equal(attempts,1);assert.equal((await f.store.read(f.join.id)).state.registrations[participant.id],undefined);
    await assert.rejects(f.service.settle({actor:participant,scope:f.join.id,operationId:'retry-fence-00001',payload:{action:'leave'}}),error=>error.status===503);
    assert.equal(attempts,2);
  }
});

test('safety actions and unscoped proposals retry rejected updates without jitter',async t=>{
  const random=t.mock.method(Math,'random',()=>0.5);
  for(const action of ['safety','proposal']) {
    const f=await setup();let attempts=0;
    f.store.beforeCas=()=>{if(++attempts===1)f.store.bump();};
    if(action==='safety')await f.service.mutate({id:f.join.id,actor:maintainer,operationId:'retry-suspend-001',action:'suspend',reason:'Review'});
    else await f.service.propose({actor:{id:'44',login:'other'},operationId:'retry-second-proposal',manifest:hostedManifest({title:'Another jam'})});
    assert.equal(attempts,2);
  }
  assert.equal(random.mock.callCount(),0);
});
