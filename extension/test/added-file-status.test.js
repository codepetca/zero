'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {addedFileSource}=require('../src/added-file-status');

test('added-file selection distinguishes untracked, staged and staged-plus-working edits',()=>{
  for(const [code,source] of [['??','untracked'],['A ','index'],['AM','index']]) {
    const result=addedFileSource(`${code} folder/file\0`,'folder/file');
    assert.deepEqual(result,{source,status:code});assert.ok(Object.isFrozen(result));
  }
});
test('added-file selection rejects ambiguous, missing, conflicting and malformed states',()=>{
  for(const status of ['D  file\0?? file\0','?? file\0?? file\0','AD file\0',' M file\0','M  file\0','AA file\0','UU file\0','A  file','', '?? ../bad\0','?? .git/config\0'])assert.throws(()=>addedFileSource(status,'file'));
  for(const name of ['../file','/file','dir/../file','dir\\file','.git/config','',`x${'a'.repeat(4096)}`])assert.throws(()=>addedFileSource('?? file\0',name));
});
test('unrelated safe records do not alter the exact selection',()=>{
  assert.deepEqual(addedFileSource(' M other\0?? file\0A  staged\0','file'),{source:'untracked',status:'??'});
});
