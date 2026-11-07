'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {cleanupAfterMerge} = require('../src/branch-cleanup');

const receipt = Object.freeze({branch:'add-coins', featureHead:'a'.repeat(40), head:'b'.repeat(40)});
function fixture({main=receipt.head, feature=receipt.featureHead, changedLocal=false, deleteFailure=false, confirmation=undefined, localFailure=false}={}) {
  const calls=[];
  let inspections=0;
  return {calls, options:{receipt,
    inspectLocal:async()=>{calls.push('inspect');if(changedLocal && ++inspections===2)throw Error('changed');},
    readRemote:async branch=>{calls.push(`read:${branch}`);return branch==='main'?main:feature;},
    deleteRemote:async()=>{calls.push('delete:remote');if(deleteFailure)throw Error('unknown');feature=confirmation===undefined?null:confirmation;},
    deleteLocal:async()=>{calls.push('delete:local');if(localFailure)throw Error('unknown');}
  }};
}
test('deletes only the confirmed feature and checks GitHub before local deletion',async()=>{
  const f=fixture();assert.deepEqual(await cleanupAfterMerge(f.options),{local:'deleted',remote:'deleted'});
  assert.deepEqual(f.calls,['inspect','read:main','read:add-coins','inspect','read:main','delete:remote','read:add-coins','delete:local']);
});
test('keeps both branches if main or feature moved',async()=>{
  for(const options of [{main:'c'.repeat(40)},{feature:'c'.repeat(40)},{changedLocal:true}]){
    const f=fixture(options), outcome=await cleanupAfterMerge(f.options);
    assert.equal(outcome.local,'kept');assert.equal(outcome.remote,'kept');
    assert.ok(!f.calls.includes('delete:remote'));assert.ok(!f.calls.includes('delete:local'));
  }
});
test('keeps the branch if GitHub main changes immediately before cleanup',async()=>{
  const f=fixture(), original=f.options.readRemote;let mainChecks=0;
  f.options.readRemote=async branch=>branch==='main' && ++mainChecks===2?'c'.repeat(40):original(branch);
  const outcome=await cleanupAfterMerge(f.options);
  assert.equal(outcome.local,'kept');assert.equal(outcome.remote,'kept');
  assert.ok(!f.calls.includes('delete:remote'));assert.ok(!f.calls.includes('delete:local'));
});
test('uncertain remote deletion never deletes the local branch',async()=>{
  for(const options of [{deleteFailure:true},{confirmation:'c'.repeat(40)}]){
    const f=fixture(options), outcome=await cleanupAfterMerge(f.options);
    assert.equal(outcome.remote,'uncertain');assert.equal(outcome.local,'kept');
    assert.ok(!f.calls.includes('delete:local'));
  }
});
test('an absent GitHub branch allows guarded local cleanup',async()=>{
  const f=fixture({feature:null});assert.deepEqual(await cleanupAfterMerge(f.options),{local:'deleted',remote:'absent'});
  assert.ok(!f.calls.includes('delete:remote'));
});
test('keeps the local branch when an absent GitHub branch reappears',async()=>{
  const f=fixture({feature:null}), original=f.options.readRemote;let reads=0;
  f.options.readRemote=async branch=>branch===receipt.branch && ++reads===2?'c'.repeat(40):original(branch);
  const outcome=await cleanupAfterMerge(f.options);
  assert.equal(outcome.local,'kept');assert.equal(outcome.remote,'kept');
  assert.ok(!f.calls.includes('delete:local'));assert.ok(!f.calls.includes('delete:remote'));
});
test('reports an uncertain local outcome after a confirmed remote deletion',async()=>{
  const f=fixture({localFailure:true}), outcome=await cleanupAfterMerge(f.options);
  assert.equal(outcome.remote,'deleted');assert.equal(outcome.local,'uncertain');
});
test('never accepts main as the feature branch',async()=>{
  const f=fixture();f.options.receipt={...receipt,branch:'main'};
  await assert.rejects(cleanupAfterMerge(f.options),/confirmed merge cleanup/);assert.deepEqual(f.calls,[]);
});
