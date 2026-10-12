import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceDigest, validateBundle, validatePng, expectedPom } from '../runner.mjs';
import { fixture } from './fixture.mjs';
test('canonical digest binds every source, descriptor field and file independent of key order',()=>{
 const bundle=fixture(), swapped={files:Object.fromEntries(Object.entries(bundle.files).reverse()),descriptor:Object.fromEntries(Object.entries(bundle.descriptor).reverse())};
 assert.equal(sourceDigest(bundle),sourceDigest(swapped));
 bundle.files['API.md']+='More API.';assert.notEqual(sourceDigest(bundle),sourceDigest(swapped));
 assert.match(expectedPom(bundle).toString(),/<artifactId>ui1<\/artifactId>/);
});
test('rejects forged keys, namespace and POM injection',()=>{
 for(const mutate of [b=>b.descriptor.passed=true,b=>b.files['pom.xml']='hooks',b=>b.files['../host']='x',b=>b.files['src/zero/ui1/Display.java']=b.files['src/zero/ui1/Display.java'].replace('zero.ui1','java.lang'),b=>b.descriptor.version='1.0.0-SNAPSHOT',b=>b.descriptor.title='bad\u0000title',b=>b.descriptor.title='bad\u202Etitle',b=>b.files['src/zero/ui1/Display.java']+='\\u0061',b=>b.files.LICENSE='MIT',b=>b.files['API.md']='x'.repeat(65537)]) {const bundle=fixture();mutate(bundle);assert.throws(()=>validateBundle(bundle));}
});
test('PNG validator decodes pixels and verifies CRC, bound and trailing content',()=>{
 const bundle=fixture();assert.ok(validatePng(bundle.files['preview.png']).length>0);
 const png=Buffer.from(bundle.files['preview.png'],'base64');png[20]^=1;assert.throws(()=>validatePng(png.toString('base64')));
 assert.throws(()=>validatePng(Buffer.concat([Buffer.from(bundle.files['preview.png'],'base64'),Buffer.from('x')]).toString('base64')));
});
