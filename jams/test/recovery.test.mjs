import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {githubHttpFixture,deferred,rendezvous} from './github-http-fixture.mjs';
import {creator,maintainer,participant,COMMIT,NEXT_COMMIT,submission} from './fixtures.mjs';

const other={id:'44',login:'other'};
const join=(revision,actor=participant,operationId='join-0001')=>({id:'jam-101',actor,operationId,action:'join',revision});
const status=n=>error=>error.status===n;
const operations=f=>Object.keys(f.state().operations).length;
const test=(name,run)=>nodeTest(name,{timeout:10000},run);

test('parallel writers to one real-adapter record retain both users after a blob conflict',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve(),before=f.commits.length;
  f.beforePut=rendezvous();
  const values=await Promise.all([f.service.mutate(join(revision)),f.service.mutate(join(revision,other))]);
  assert.deepEqual(values.map(v=>v.status),['joined','joined']);
  assert.equal(f.commits.length-before,2);assert.equal(operations(f),4);
  assert.deepEqual(Object.keys(f.state().registrations).sort(),['33','44']);
  assert.equal(f.puts().length,5,'two initial PUTs plus one stale-blob retry, in addition to setup');
});

test('concurrent last-slot joins recheck capacity after the winning commit',async t=>{
  const f=await githubHttpFixture(t,{limits:{participants:1}}),revision=await f.approve();
  f.beforePut=rendezvous();
  const results=await Promise.allSettled([f.service.mutate(join(revision)),f.service.mutate(join(revision,other))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
  assert.equal(Object.keys(f.state().registrations).length,1);assert.equal(operations(f),3);
});

test('parallel identical submission keys produce one entry and the same confirmed result',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const before=f.commits.length,puts=f.puts().length;f.beforePut=rendezvous();
  const [a,b]=await Promise.all([f.service.mutate(submission(revision)),f.service.mutate(submission(revision))]);
  assert.deepEqual(a,b);assert.equal(f.commits.length-before,1);assert.equal(f.puts().length-puts,2);
  assert.equal(f.state().entries[participant.id].length,1);assert.equal(operations(f),4);
});

test('parallel reuse of one key for different payloads returns one success and one conflict',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const before=f.commits.length;f.beforePut=rendezvous();
  const result=await Promise.allSettled([f.service.mutate(submission(revision)),f.service.mutate(submission(revision,{title:'Different payload'}))]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').reason.status,409);
  assert.equal(f.commits.length-before,1);assert.equal(f.state().entries[participant.id].length,1);
});

test('concurrent different participant submissions retain both galleries and operation records',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();
  await f.service.mutate(join(revision));await f.service.mutate(join(revision,other));
  f.beforePut=rendezvous();
  await Promise.all([f.service.mutate(submission(revision)),f.service.mutate(submission(revision,{actor:other,source:{repositoryUrl:'https://github.com/other/project',commit:COMMIT}}))]);
  assert.equal((await f.service.read('jam-101')).event.entries.length,2);
  for(const entry of (await f.service.read('jam-101')).event.entries)
    assert.equal(entry.revision,f.state().entries[entry.participantId].at(-1).revision,'gallery review context identifies the exact immutable entry');
  assert.deepEqual(Object.keys(f.state().entries).sort(),['33','44']);assert.equal(operations(f),6);
});

for(const mode of ['socket loss','invalid JSON','wrong success SHA','timeout']) {
  test(`a committed submission with ${mode} recovers once after source outage and deadline`,async t=>{
    const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
    const before=f.commits.length;
    f.afterCommit=({res,json})=>{
      if(mode==='socket loss')res.destroy();
      if(mode==='invalid JSON'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{broken');}
      if(mode==='wrong success SHA')json(res,200,{content:{sha:'f'.repeat(40)}});
      return true; // timeout deliberately leaves this local response pending
    };
    const service=mode==='timeout'?f.makeService({timeoutMs:1000}):f.service;
    await assert.rejects(service.mutate(submission(revision)),e=>e.status===503&&!/fixture|token|Bearer/.test(e.message));
    assert.equal(f.commits.length-before,1);assert.equal(f.state().entries[participant.id].length,1);
    const puts=f.puts().length,sourceCalls=f.sourceCalls(),recorded=f.state().operations[`${participant.id}:submit-0001`].result;
    f.afterCommit=null;f.sourceUnavailable=true;f.time=Date.parse('2030-01-05T00:00:00Z');
    assert.deepEqual(await f.makeService().mutate(submission(revision)),recorded);
    assert.equal(f.puts().length,puts);assert.equal(f.sourceCalls(),sourceCalls);assert.equal(f.commits.length-before,1);
    await assert.rejects(f.service.mutate(submission(revision,{title:'Altered retry'})),status(409));
  });
}

test('a lost proposal response recovers without rechecking unavailable creator source',async t=>{
  const f=await githubHttpFixture(t),input={actor:creator,operationId:'lost-proposal',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT};
  f.afterCommit=({res})=>{res.destroy();return true;};
  await assert.rejects(f.service.propose(input),status(503));
  const calls=f.sourceCalls();f.afterCommit=null;f.sourceUnavailable=true;
  assert.equal((await f.makeService().propose(input)).status,'submitted');
  assert.equal(f.sourceCalls(),calls);assert.equal(f.commits.length,1);assert.equal(f.state().proposals.length,1);
});

for(const code of [403,429,500]) {
  test(`upstream ${code} before a commit reports failure and allows an exact retry`,async t=>{
    const f=await githubHttpFixture(t),revision=await f.approve(),before=f.commits.length;
    f.beforeRequest=({res,call,json})=>{if(call.method==='PUT'){json(res,code,{message:'fixture provider detail must not escape'});return true;}};
    await assert.rejects(f.service.mutate(join(revision)),e=>e.status===503&&!e.message.includes('fixture provider'));
    assert.equal(f.commits.length,before);assert.equal(f.state().registrations[participant.id],undefined);
    f.beforeRequest=null;assert.equal((await f.service.mutate(join(revision))).status,'joined');
    assert.equal(f.commits.length,before+1);assert.equal(operations(f),3);
  });
}

for(const code of [409,422]) {
  test(`persistent ${code} conflicts stop at the configured retry bound without false success`,async t=>{
    const f=await githubHttpFixture(t,{limits:{retries:3}}),revision=await f.approve();
    const before=f.commits.length,puts=f.puts().length,bytes=Buffer.from(f.records.get('jam-101'));
    f.beforeRequest=({res,call,json})=>{if(call.method==='PUT'){json(res,code,{message:'conflict'});return true;}};
    await assert.rejects(f.service.mutate(join(revision)),e=>e.status===409&&e.message.includes('same operation ID'));
    assert.equal(f.puts().length-puts,3);assert.equal(f.commits.length,before);assert.deepEqual(f.records.get('jam-101'),bytes);
    f.beforeRequest=null;assert.equal((await f.service.mutate(join(revision))).status,'joined');
  });
}

test('a failed authoritative read never becomes an empty record or a write',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve(),before=f.commits.length,puts=f.puts().length;
  f.beforeRequest=({res,call,json})=>{if(call.path.includes('/contents/jams/jam-')){json(res,503,{message:'private fixture diagnostic'});return true;}};
  await assert.rejects(f.service.mutate(join(revision)),status(503));
  assert.equal(f.commits.length,before);assert.equal(f.puts().length,puts);
  f.beforeRequest=null;await f.service.mutate(join(revision));assert.equal(f.commits.length,before+1);
});

test('a malformed successful read is unavailable, never a new empty event',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve(),before=f.commits.length,puts=f.puts().length;
  f.beforeRequest=({res,call})=>{if(call.path.includes('/contents/jams/jam-')){res.writeHead(200,{'Content-Type':'application/json'});res.end('{broken');return true;}};
  await assert.rejects(f.service.mutate(join(revision)),status(503));
  assert.equal(f.commits.length,before);assert.equal(f.puts().length,puts);
  f.beforeRequest=null;await f.service.mutate(join(revision));assert.equal(f.commits.length,before+1);
});

test('an actual pre-commit HTTP timeout leaves no change and can retry the same operation',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve(),before=f.commits.length;
  f.beforeRequest=({call})=>call.method==='PUT'; // hold the local response until Node fetch aborts
  await assert.rejects(f.makeService({timeoutMs:1000}).mutate(join(revision)),status(503));
  assert.equal(f.commits.length,before);assert.equal(f.state().registrations[participant.id],undefined);
  f.beforeRequest=null;assert.equal((await f.service.mutate(join(revision))).status,'joined');
  assert.equal(f.commits.length,before+1);
});

test('leave winning a conflict prevents the pending submission of an unregistered participant',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const arrived=deferred(),release=deferred();
  f.beforePut=async({operationId})=>{if(operationId==='submit-0001'){arrived.resolve();await release.promise;}};
  const pending=assert.rejects(f.service.mutate(submission(revision)),e=>e.status===409&&e.message.includes('Join this jam'));
  await arrived.promise;await f.service.mutate({id:'jam-101',actor:participant,operationId:'leave-wins',action:'leave'});
  release.resolve();await pending;
  assert.equal(f.state().registrations[participant.id].status,'left');assert.equal(f.state().entries[participant.id],undefined);
});

test('submission winning a conflict is preserved in history and withdrawn by the later leave',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const arrived=deferred(),release=deferred();
  f.beforePut=async({operationId})=>{if(operationId==='leave-loses'){arrived.resolve();await release.promise;}};
  const pending=f.service.mutate({id:'jam-101',actor:participant,operationId:'leave-loses',action:'leave'});
  await arrived.promise;const entry=await f.service.mutate(submission(revision));release.resolve();
  assert.equal((await pending).status,'left');
  const history=f.state().entries[participant.id];assert.equal(history.length,2);
  assert.equal(history[0].revision,entry.revision);assert.equal(history[1].previousRevision,entry.revision);
  assert.equal(history[1].status,'withdrawn');assert.equal((await f.service.read('jam-101')).event.entries.length,0);
});

test('suspension winning a real-adapter conflict prevents a pending submission',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const arrived=deferred(),release=deferred();
  f.beforePut=async({operationId})=>{if(operationId==='submit-0001'){arrived.resolve();await release.promise;}};
  const pending=assert.rejects(f.service.mutate(submission(revision)),status(409));
  await arrived.promise;
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'suspend-race',action:'suspend',reason:'Review required'});
  release.resolve();await pending;
  assert.equal(f.state().moderation.status,'suspended');assert.equal(f.state().entries[participant.id],undefined);
  assert.equal(f.state().operations[`${participant.id}:submit-0001`],undefined);
});

test('approval of B winning a conflict rejects a submission acknowledging A',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const next=await f.service.propose({actor:creator,operationId:'propose-next',repositoryUrl:'https://github.com/creator/jam',commit:NEXT_COMMIT});
  const arrived=deferred(),release=deferred();
  f.beforePut=async({operationId})=>{if(operationId==='submit-0001'){arrived.resolve();await release.promise;}};
  const pending=assert.rejects(f.service.mutate(submission(revision)),e=>e.status===409&&e.message.includes('current event rules'));
  await arrived.promise;
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-next',action:'approve',revision:next.revision});
  release.resolve();await pending;
  assert.equal(f.state().accepted.revision,next.revision);assert.equal(f.state().entries[participant.id],undefined);
});

test('a conflict crossing the deadline is revalidated; it cannot write a late entry',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  f.beforeRequest=({res,call,json})=>{if(call.method==='PUT'){f.time=Date.parse('2030-01-04T00:00:00Z');json(res,409,{message:'conflict'});return true;}};
  const puts=f.puts().length;
  await assert.rejects(f.service.mutate(submission(revision)),e=>e.status===409&&e.message==='Submissions are closed.');
  assert.equal(f.puts().length-puts,1);assert.equal(f.state().entries[participant.id],undefined);
});

test('a submission accepted before suspension is retained and exact retries recover its historical result',async t=>{
  const f=await githubHttpFixture(t),revision=await f.approve();await f.service.mutate(join(revision));
  const result=await f.service.mutate(submission(revision));
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'suspend-after',action:'suspend',reason:'Review required'});
  f.sourceUnavailable=true;const before=f.commits.length;
  assert.deepEqual(await f.makeService().mutate(submission(revision)),result);
  assert.equal(f.state().moderation.status,'suspended');assert.equal(f.state().entries[participant.id].length,1);
  assert.equal(f.commits.length,before);
});
