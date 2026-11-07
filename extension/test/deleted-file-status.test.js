'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {deletedFileSource} = require('../src/deleted-file-status');

test('selects the staged blob for working-tree deletions and HEAD for a staged deletion', () => {
  for (const code of [' D', 'MD', 'AD']) assert.equal(deletedFileSource(`${code} folder/file\0`, 'folder/file'), 'index');
  assert.equal(deletedFileSource('D  folder/file\0', 'folder/file'), 'head');
});

test('rejects recreated, conflicting, stale, malformed and unsafe selections', () => {
  for (const status of ['D  file\0?? file\0', 'UU file\0', ' M file\0', '', ' D file', ' D file\0 D file\0', ' D ../outside\0']) {
    assert.throws(() => deletedFileSource(status, 'file'));
  }
  for (const name of ['../outside', '/outside', 'dir/../file', 'dir\\file', '']) {
    assert.throws(() => deletedFileSource(' D file\0', name));
  }
});
