'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {gitExecutable} = require('../src/git-executable');

test('Windows uses the launcher-selected Git ahead of PATH and ignores a project decoy', () => {
  const selected = 'C:\\Zero Data\\runtime\\git-verified\\cmd\\git.exe';
  const environment = {ZERO_GIT_EXECUTABLE:selected, Path:'C:\\Projects\\student;C:\\Program Files\\Git\\cmd'};
  assert.equal(gitExecutable(environment,'win32',()=>assert.fail('Launcher selection must not search PATH')),selected);
  assert.equal(gitExecutable({},'darwin'),'git');
});

test('macOS managed Git must be an absolute executable named git and never falls back', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-git-test-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const selected = path.join(dir, 'git');
  fs.writeFileSync(selected, '#!/bin/sh\n', {mode:0o755});
  assert.equal(gitExecutable({ZERO_GIT_EXECUTABLE:selected}, 'darwin'), selected);
  for (const environment of [
    {ZERO_GIT_SETUP_FAILED:'1'},
    {ZERO_GIT_SETUP_FAILED:'1', ZERO_GIT_EXECUTABLE:selected},
    {ZERO_GIT_EXECUTABLE:'git'},
    {ZERO_GIT_EXECUTABLE:'/usr/bin/git'},
    {ZERO_GIT_EXECUTABLE:path.join(dir, 'missing', 'git')},
    {ZERO_GIT_EXECUTABLE:dir}
  ]) assert.throws(() => gitExecutable(environment, 'darwin'), {code:'ZERO_GIT_SETUP_FAILED'});
  fs.chmodSync(selected, 0o644);
  assert.throws(() => gitExecutable({ZERO_GIT_EXECUTABLE:selected}, 'darwin'), {code:'ZERO_GIT_SETUP_FAILED'});
  assert.equal(gitExecutable({}, 'darwin'), 'git');
  assert.equal(gitExecutable({ZERO_GIT_SETUP_FAILED:'1'}, 'linux'), 'git');
});

test('macOS existing native extension host reads the current launcher selection', t => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-git-profile-')));
  t.after(() => fs.rmSync(home, {recursive:true, force:true}));
  const editor = path.join(home, 'Library', 'Application Support', 'Zero', 'editor');
  const source = path.join(editor, 'extensions', 'zero.zero-1.2.3', 'src');
  fs.mkdirSync(source, {recursive:true});
  const git = path.join(home,'git');
  const selection = path.join(editor, 'git-selection.json');
  fs.writeFileSync(git, '#!/bin/sh\n', {mode:0o755});
  fs.writeFileSync(selection, JSON.stringify({executable:git}), {mode:0o600});
  assert.equal(gitExecutable({ZERO_GIT_SETUP_FAILED:'1'}, 'darwin', fs.statSync, source, home), git);
  assert.equal(gitExecutable({}, 'darwin', fs.statSync, '/other/editor/zero/src', home), 'git');
  fs.writeFileSync(selection, JSON.stringify({executable:null}));
  assert.throws(() => gitExecutable({ZERO_GIT_EXECUTABLE:git}, 'darwin', fs.statSync, source, home), {code:'ZERO_GIT_SETUP_FAILED'});
  fs.unlinkSync(selection);
  fs.symlinkSync(git, selection);
  assert.throws(() => gitExecutable({}, 'darwin', fs.statSync, source, home), {code:'ZERO_GIT_SETUP_FAILED'});
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
