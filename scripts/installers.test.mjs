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

import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {installerOptions, installerPlist, signMacArtifact, verifyMacSignature, developerIdRequirement} from './installer-signing.mjs';

const certificate = Buffer.from('fake certificate bytes, never an identity');
const identity = createHash('sha1').update(certificate).digest('hex').toUpperCase();
const team = 'TESTTEAM01';
const authority = `Developer ID Application: Fake Fixture (${team})`;
function signatureRunner({detail, entitlements = '', certificateBytes = certificate, fail = false} = {}) {
  const commands = [];
  const run = (tool, args) => {
    commands.push([tool, args]);
    assert.equal(tool, '/usr/bin/codesign');
    if (args.includes('--verify')) {
      assert.ok(args.includes('--strict')); assert.equal(args[args.indexOf('-R') + 1], developerIdRequirement);
      if (fail) throw new Error('rejected signature');
    }
    if (args.includes('--extract-certificates')) writeFileSync(`${args[args.indexOf('--extract-certificates') + 1]}0`, certificateBytes);
    if (args.includes('--entitlements')) return {stdout:entitlements, stderr:'Executable=fake'};
    return {stdout:'', stderr:detail ?? `Executable=fake\nIdentifier=ca.codepet.zero.setup\nAuthority=${authority}\nTeamIdentifier=${team}\nTimestamp=Oct 11, 2026 at 12:00:00\nCodeDirectory v=20500 size=42 flags=0x10000(runtime) hashes=1+0 location=embedded`};
  };
  return {run, commands};
}

test('signed installer options are explicit, Mac-only and narrowly validated', () => {
  assert.deepEqual(installerOptions([], 'build', 'darwin'), {platform:'all', signed:false, identity:null});
  assert.deepEqual(installerOptions(['--sign-identity', identity.toLowerCase(), '--platform', 'macos'], 'build', 'darwin'), {platform:'macos', signed:true, identity});
  assert.equal(installerOptions(['--platform', 'macos', '--signed'], 'verify', 'darwin').signed, true);
  for (const args of [ ['--sign-identity', identity], ['--platform', 'windows', '--sign-identity', identity], ['--platform', 'macos', '--sign-identity', 'name'], ['--platform', 'macos', '--sign-identity'], ['--platform', 'macos', '--sign-identity', identity, '--sign-identity', identity], ['--signed'] ]) {
    assert.throws(() => installerOptions(args, args.includes('--signed') ? 'verify' : 'build', 'darwin'));
  }
  assert.throws(() => installerOptions(['--platform', 'macos', '--signed'], 'verify', 'linux'), /macOS/);
  assert.throws(() => installerOptions(['--platform', 'macos', '--sign-identity', identity], 'build', 'win32'), /macOS/);
  assert.throws(() => installerOptions(['--platform', 'macos', '--signed', '--signed'], 'verify', 'darwin'));
});

test('bundle metadata separates development UI from production identity', () => {
  const template = readFileSync(new URL('../native-installer/macos/Info.plist', import.meta.url), 'utf8');
  const development = installerPlist(template, '0.5.4', false), signed = installerPlist(template, '0.5.4', true);
  assert.match(development, /ca\.codepet\.zero\.setup\.development/);
  assert.match(development, /ZeroDevelopmentBuild<\/key><true\/>/);
  assert.match(signed, /ca\.codepet\.zero\.setup<\/string>/);
  assert.match(signed, /ZeroDevelopmentBuild<\/key><false\/>/);
  assert.ok(!signed.includes('__') && !signed.includes('Unsigned'));
  assert.throws(() => installerPlist('bad template', '0.5.4', true));
});

test('owned app signing uses runtime/timestamp, DMG uses timestamp, neither uses deep/entitlements', () => {
  const calls = []; const run = (tool, args) => calls.push([tool, args]);
  signMacArtifact(run, '/fake/Zero Setup.app', identity, true);
  signMacArtifact(run, '/fake/Zero.dmg', identity, false);
  assert.deepEqual(calls, [
    ['/usr/bin/codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, '/fake/Zero Setup.app']],
    ['/usr/bin/codesign', ['--timestamp', '--sign', identity, '/fake/Zero.dmg']]
  ]);
});

test('signature verification binds extracted signer, team and both architecture evidence', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-signature-fixture-'));
  try {
    const fake = signatureRunner();
    const evidence = verifyMacSignature(fake.run, '/fake/Zero Setup.app', path.join(folder, 'cert'), {app:true, identity, team});
    assert.deepEqual(evidence.architectures.map(item => item.architecture), ['arm64', 'x86_64']);
    assert.ok(evidence.architectures.every(item => item.identitySha1 === identity && item.teamIdentifier === team && item.authority === authority));
    assert.ok(fake.commands.some(([, args]) => args.includes('--entitlements')));
    assert.equal(existsSync(path.join(folder, 'cert-arm64-0')), false);
    const dmg = verifyMacSignature(signatureRunner({detail:`Authority=${authority}\nTeamIdentifier=${team}\nTimestamp=Oct 11, 2026`}).run, '/fake/Zero.dmg', path.join(folder, 'dmg'), {identity, team});
    assert.equal(dmg.identitySha1, identity);
  } finally {rmSync(folder, {recursive:true, force:true});}
});

test('signature verification rejects absent timestamp/runtime, entitlements and signer/team drift', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-signature-fixture-'));
  try {
    const detail = `Identifier=ca.codepet.zero.setup\nAuthority=${authority}\nTeamIdentifier=${team}\nTimestamp=Oct 11, 2026\nCodeDirectory flags=0x10000(runtime)`;
    for (const config of [ {fail:true}, {detail:detail.replace('Timestamp=', 'Signed Time=')}, {detail:detail.replace('runtime','none')}, {entitlements:'<?xml version="1.0"?><plist><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>'}, {certificateBytes:Buffer.from('wrong certificate')}, {detail:detail.replaceAll(team, 'WRONGTEAM1')} ]) {
      assert.throws(() => verifyMacSignature(signatureRunner(config).run, '/fake/Zero Setup.app', path.join(folder, 'cert'), {app:true, identity, team}));
    }
  } finally {rmSync(folder, {recursive:true, force:true});}
});
