import test from 'node:test';
import assert from 'node:assert/strict';
import {jamVisibilityStatus} from '../lib/jam-visibility-status.mjs';

const now=Date.parse('2026-11-11T12:00:00Z');
const event=(extra={})=>({revision:'a'.repeat(40),reviewStatus:'approved',moderation:{status:'active'},timezone:'UTC',schedule:{},...extra});

test('only accepted active jams are described as listed on ZeroHub',()=>{
  assert.deepEqual(jamVisibilityStatus(event(),now),{tone:'listed',listed:true,headline:'Listed on ZeroHub · Anyone can view',details:['Verified entries are public.']});
  for(const status of ['suspended','cancelled']){
    const result=jamVisibilityStatus(event({moderation:{status}}),now);
    assert.equal(result.listed,false);assert.match(result.headline,/Not listed on ZeroHub/);assert.match(result.details[0],/Anyone with the link/);
  }
  const pending=jamVisibilityStatus(event({revision:null,reviewStatus:'submitted'}),now);
  assert.equal(pending.headline,'Not published');assert.match(pending.details[0],/Only you and Zero maintainers/);
  assert.equal(jamVisibilityStatus(event({revision:null,reviewStatus:'rejected'}),now).headline,'Not published · Rejected');
});

test('listed jams explain whether gallery entries are hidden until reveal',()=>{
  const future=jamVisibilityStatus(event({schedule:{galleryRevealAt:'2026-11-20T17:00:00Z'}}),now);
  assert.match(future.details[0],/^Submitted entries stay hidden until the gallery opens \(.+2026.+\)\.$/);
  assert.equal(jamVisibilityStatus(event({schedule:{galleryRevealAt:'2026-11-01T17:00:00Z'}}),now).details[0],'The gallery is open. Verified entries are public.');
});
