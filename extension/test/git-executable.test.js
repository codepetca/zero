'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {gitExecutable} = require('../src/git-executable');

test('Windows uses the launcher-selected Git ahead of PATH and ignores a project decoy', () => {
  const selected = 'C:\\Zero Data\\runtime\\git-verified\\cmd\\git.exe';
  const environment = {ZERO_GIT_EXECUTABLE:selected, Path:'C:\\Projects\\student;C:\\Program Files\\Git\\cmd'};
  assert.equal(gitExecutable(environment,'win32',()=>assert.fail('Launcher selection must not search PATH')),selected);
  assert.equal(gitExecutable(environment,'darwin'),'git');
});

test('manual Windows searches absolute PATH directories for git.exe only', () => {
  const tested = [];
  const stat = candidate => {tested.push(candidate);return {isFile:()=>candidate.startsWith('C:\\Program Files')};};
  assert.equal(gitExecutable({Path:'.;bin;C:relative;\\root-relative;"C:\\Program Files\\Git\\cmd"'},'win32',stat),
    'C:\\Program Files\\Git\\cmd\\git.exe');
  assert.deepEqual(tested,['C:\\Program Files\\Git\\cmd\\git.exe']);
});

test('failed managed selection and invalid hints never fall back to a different Windows Git', () => {
  for (const environment of [{ZERO_GIT_SETUP_FAILED:'1'}, {ZERO_GIT_SETUP_FAILED:'1',ZERO_GIT_EXECUTABLE:'C:\\Temp\\git.exe'}, {ZERO_GIT_EXECUTABLE:'git.exe'}, {ZERO_GIT_EXECUTABLE:'C:\\Temp\\git.com'}]) {
    assert.throws(()=>gitExecutable({...environment,PATH:'C:\\Git'},'win32',()=>assert.fail('Unexpected fallback')),
      {code:'ENOENT'});
  }
});
