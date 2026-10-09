'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('local workshop preparation preserves spaced paths and rejects Windows shell expansion', async () => {
  const {processSpecification} = await import('../../scripts/workshop-process.mjs');
  const posix = processSpecification('/tmp/School App/mvnw',['-Dzero.communityRoot=/tmp/Community Work','compile'],'darwin');
  assert.equal(posix.command,'/tmp/School App/mvnw');
  assert.equal(posix.args[0],'-Dzero.communityRoot=/tmp/Community Work');
  const windows = processSpecification('C:\\School App\\mvnw.cmd',['-Dzero.communityRoot=C:\\Community Work','compile'],'win32');
  assert.equal(windows.command,'cmd.exe');
  assert.ok(windows.args.at(-1).includes('"-Dzero.communityRoot=C:\\Community Work"'));
  for (const injected of ['& other-command','%PRIVATE_VALUE%','!PRIVATE_VALUE!','bad\ncommand','" & command']) {
    assert.throws(() => processSpecification('C:\\School App\\mvnw.cmd',[injected],'win32'));
  }
});
