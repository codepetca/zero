'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('local workshop preparation preserves spaced paths and rejects Windows shell expansion', async () => {
  const {processSpecification} = await import('../../scripts/process-specification.mjs');
  const posix = processSpecification('/tmp/School App/mvnw',['-Dzero.communityRoot=/tmp/Community Work','compile'],'darwin');
  assert.equal(posix.command,'/tmp/School App/mvnw');
  assert.equal(posix.args[0],'-Dzero.communityRoot=/tmp/Community Work');
  const windows = processSpecification('C:\\School App\\mvnw.cmd',['-Dzero.communityRoot=C:\\Community Work','compile'],'win32');
  assert.equal(windows.command,'cmd.exe');
  assert.equal(windows.windowsVerbatimArguments,true);
  assert.ok(windows.args.at(-1).includes('"-Dzero.communityRoot=C:\\Community Work"'));
  for (const injected of ['& other-command','%PRIVATE_VALUE%','!PRIVATE_VALUE!','bad\ncommand','" & command']) {
    assert.throws(() => processSpecification('C:\\School App\\mvnw.cmd',[injected],'win32'));
  }
});

test('Windows executes a prepared batch wrapper and spaced arguments without quote rewriting', {skip:process.platform!=='win32'}, async () => {
  const {mkdtempSync,writeFileSync,rmSync} = require('node:fs');
  const {tmpdir} = require('node:os');
  const path = require('node:path');
  const {spawnSync} = require('node:child_process');
  const {processSpecification} = await import('../../scripts/process-specification.mjs');
  const directory=mkdtempSync(path.join(tmpdir(),'zero wrapper with spaces '));
  try {
    const wrapper=path.join(directory,'proof.cmd');
    writeFileSync(wrapper,'@echo off\r\necho ZERO_WRAPPER_ARG:%~1\r\nexit /b 0\r\n');
    const spec=processSpecification(wrapper,['community path with spaces']);
    const result=spawnSync(spec.command,spec.args,{cwd:directory,encoding:'utf8',timeout:10000,windowsVerbatimArguments:spec.windowsVerbatimArguments});
    assert.equal(result.status,0,result.error?.message || result.stderr);
    assert.equal(result.stdout.trim(),'ZERO_WRAPPER_ARG:community path with spaces');
  } finally {rmSync(directory,{recursive:true,force:true});}
});
