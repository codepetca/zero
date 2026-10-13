'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DEFAULTS,validateKitConfiguration}=require('../src/sharing/configuration');
test('packaged classroom settings are disabled by default and validate exact operator configuration',()=>{
  assert.deepEqual(validateKitConfiguration(DEFAULTS),DEFAULTS);
  const active={...DEFAULTS,artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision:'a'.repeat(40)};
  assert.deepEqual(validateKitConfiguration(active),active);
  for(const patch of [{policyRevision:''},{artifactOrigin:'https://foreign.example'},{artifactOrigin:active.artifactOrigin+'/'},{catalogUrl:DEFAULTS.catalogUrl+'?source=foreign'},{secret:'private'}])assert.throws(()=>validateKitConfiguration({...active,...patch}));
});
