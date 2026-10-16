import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('Windows-style Git checkout preserves canonical release text and CRLF batch launchers', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'zero-checkout-'));
  const source = path.join(directory, 'source'), checkout = path.join(directory, 'checkout');
  const config = path.join(directory, 'empty-gitconfig');
  writeFileSync(config, ''); mkdirSync(source);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(env, {GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:config});
  function git(args, cwd = source) {
    const result = spawnSync('git', args, {cwd, env, encoding:'utf8', timeout:30000});
    assert.equal(result.status, 0, result.error?.message || result.stderr);
  }
  try {
    git(['init', '--quiet']);
    writeFileSync(path.join(source, '.gitattributes'), readFileSync(new URL('../../.gitattributes', import.meta.url)));
    const pom = readFileSync(new URL('../../framework/pom.xml', import.meta.url));
    const batch = Buffer.from('@echo off\r\necho fixture\r\n');
    const binary = Buffer.from([137, 80, 78, 71, 0, 13, 10, 26, 10]);
    writeFileSync(path.join(source, 'pom.xml'), pom);
    writeFileSync(path.join(source, 'mvnw.cmd'), batch);
    writeFileSync(path.join(source, 'fixture.png'), binary);
    git(['add', '.']);
    git(['-c', 'user.name=Checkout fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture']);
    git(['clone', '--quiet', '--no-local', '-c', 'core.autocrlf=true', source, checkout], directory);
    const checkedPom = readFileSync(path.join(checkout, 'pom.xml'));
    assert.deepEqual(checkedPom, pom, 'Windows checkout must retain exact release/build text');
    assert.ok(!checkedPom.includes(Buffer.from('\r\n')), 'POM metadata matching expects canonical LF');
    assert.deepEqual(readFileSync(path.join(checkout, 'mvnw.cmd')), batch);
    assert.deepEqual(readFileSync(path.join(checkout, 'fixture.png')), binary);
  } finally { rmSync(directory, {recursive:true, force:true}); }
});
