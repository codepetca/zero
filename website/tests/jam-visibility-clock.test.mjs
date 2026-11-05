import test from 'node:test';
import assert from 'node:assert/strict';
import {assertJamVisibilityTime} from '../lib/jam-hub-visibility.mjs';

test('active visibility requires a current clock at or after the trusted observation',()=>{
  assert.doesNotThrow(()=>assertJamVisibilityTime(null,()=>0));
  assert.throws(()=>assertJamVisibilityTime(null,()=>0,{NODE_ENV:'production'}),/visibility is unavailable/i);
  assert.throws(()=>assertJamVisibilityTime(null,()=>0,{NODE_ENV:'development'}),/visibility is unavailable/i);
  assert.doesNotThrow(()=>assertJamVisibilityTime({observedAt:100},()=>100));
  assert.doesNotThrow(()=>assertJamVisibilityTime({observedAt:100},()=>101));
  for(const [visibility,clock] of [[undefined,()=>100],[{},()=>100],[{observedAt:-1},()=>100],
    [{observedAt:101},()=>100],[{observedAt:100},()=>NaN],[{observedAt:100},()=>-1],[{observedAt:100},null]])
    assert.throws(()=>assertJamVisibilityTime(visibility,clock),/visibility is unavailable/i);
});
