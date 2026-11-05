import test from 'node:test';
import assert from 'node:assert/strict';
import {selectJamPagesBinding} from '../lib/jam-pages-policy.mjs';

test('Pages observation is enabled by default only in local preview', async()=>{
  const env={NODE_ENV:'development'};let calls=0;
  const reader=async()=>{calls++;return {status:'verified'};};
  const selected=selectJamPagesBinding({env,reader});
  assert.deepEqual(await selected(),{status:'verified'});assert.equal(calls,1);
  assert.equal(selectJamPagesBinding({env:{NODE_ENV:'production'},reader}),undefined);
  assert.equal(selectJamPagesBinding({env:{NODE_ENV:'development',VERCEL_ENV:'production'},reader}),undefined);
  env.NODE_ENV='production';assert.equal((await selected()).status,'unverified');assert.equal(calls,1);
});

test('a local policy change during an observation suppresses its receipt',async()=>{
  const env={NODE_ENV:'development'};let finish;
  const selected=selectJamPagesBinding({env,reader:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=selected();env.NODE_ENV='production';finish({status:'verified'});
  assert.equal((await pending).status,'unverified');
});
