'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {recoveryMessage}=require('../src/local-recovery-message');
test('reports an absolute recovery path without accepting control characters or relative paths',()=>{
 const location=path.resolve('project','.git','zero-recovery');
 assert.equal(recoveryMessage('Interrupted.',location),`Interrupted. Recovery copy: ${location}`);
 for(const invalid of [undefined,'relative/path',location+'\nmisleading',location+'\0',location+'a'.repeat(4097)])assert.equal(recoveryMessage('Interrupted.',invalid),'Interrupted.');
});
