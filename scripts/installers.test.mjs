import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {mkdtempSync, readFileSync, statSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {kitEntries, extractKit} from './installer-payload.mjs';

const member = (text, mode = 0o100644) => [new TextEncoder().encode(text), {os:3, attrs:(mode << 16) >>> 0}];
test('measured kit extraction preserves flat contents and executable modes', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-native-'));
  try {
    const bytes = zipSync({'zero-kit/setup/Setup.command':member('launcher', 0o100755), 'zero-kit/starter/Main.java':member('class Main {}')});
    assert.equal(extractKit(bytes, folder).length, 2);
    assert.equal(readFileSync(path.join(folder, 'setup/Setup.command'), 'utf8'), 'launcher');
    if (process.platform !== 'win32') assert.equal(statSync(path.join(folder, 'setup/Setup.command')).mode & 0o777, 0o755);
    assert.throws(() => extractKit(bytes, folder), /EEXIST/);
  } finally {rmSync(folder, {recursive:true, force:true});}
});
test('unsafe, case-duplicate and symlink members fail before any writes', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-native-'));
  try {
    for (const members of [
      {'zero-kit/../escape':member('bad')}, {'zero-kit/a\\b':member('bad')},
      {'zero-kit/a:b':member('bad')}, {'different-root/a':member('bad')},
      {'zero-kit/a':member('a'), 'zero-kit/A':member('b')},
      {'zero-kit/link':member('target', 0o120777)}
    ]) assert.throws(() => extractKit(zipSync(members), folder));
    assert.equal(existsSync(path.join(folder, 'a')), false);
  } finally {rmSync(folder, {recursive:true, force:true});}
});
test('malformed archive and oversized expanded metadata fail before inflation', () => {
  assert.throws(() => kitEntries(Buffer.from('not zip')), /Invalid/);
  const bytes = Buffer.from(zipSync({'zero-kit/small':member('x')}));
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(65 * 1024 * 1024, central + 24);
  assert.throws(() => kitEntries(bytes), /too large/);
});
