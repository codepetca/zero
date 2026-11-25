'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {DEFAULTS,validateKitConfiguration}=require('../src/sharing/configuration');
test('packaged classroom settings are disabled by default and validate exact operator configuration',()=>{
  assert.deepEqual(validateKitConfiguration(DEFAULTS),DEFAULTS);
  const active={...DEFAULTS,artifactOrigin:'https://fixture.public.blob.vercel-storage.com',policyRevision:'a'.repeat(40)};
  assert.deepEqual(validateKitConfiguration(active),active);
  for(const patch of [{policyRevision:''},{artifactOrigin:'https://foreign.example'},{artifactOrigin:active.artifactOrigin+'/'},{catalogUrl:DEFAULTS.catalogUrl+'?source=foreign'},{secret:'private'}])assert.throws(()=>validateKitConfiguration({...active,...patch}));
});


test('practice catalog URL retains legacy settings and selects v2 for capable clients',()=>{
 const {practiceCatalogUrl}=require('../src/sharing/tutorial-practice');
 for(const suffix of ['', '/web', '/practice']) assert.equal(practiceCatalogUrl(`https://zero.example/api/sharing/catalog${suffix}`),'https://zero.example/api/sharing/catalog/practice');
 for(const suffix of ['/v2', '/v2/practice']) assert.equal(practiceCatalogUrl(`https://zero.example/api/sharing/catalog${suffix}`),'https://zero.example/api/sharing/catalog/v2/practice');
 assert.throws(()=>practiceCatalogUrl('https://zero.example/api/sharing/catalog/v2?x=1'));
});
