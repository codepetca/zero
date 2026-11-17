'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {mergeGitDiagnostic} = require('../src/merge-git-diagnostic');

test('merge diagnostics do not echo unrecognized output or variable values', () => {
  const failure = {code: 128, stderr: 'fatal: helper failed at https://user:secret@example.invalid/project'};
  assert.equal(mergeGitDiagnostic('rev-parse', failure), 'Git rev-parse failed (exit 128).');
  failure.stderr = "fatal: cannot lock ref 'refs/heads/private': /Users/private/.git/refs/heads/private.lock";
  assert.equal(mergeGitDiagnostic('update-ref', failure), 'Git update-ref failed (exit 128). fatal: Git could not lock a ref or index.');
  failure.stderr = 'fatal: unable to read tree (private)\r\n';
  assert.equal(mergeGitDiagnostic('diff', failure), 'Git diff failed (exit 128). fatal: unable to read tree.');
  failure.stderr = "error: No such remote 'private'";
  assert.equal(mergeGitDiagnostic('remote', failure), 'Git remote failed (exit 128). error: No such remote.');
});
