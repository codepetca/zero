import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {mkdtempSync, readFileSync, statSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
      assert.ok(args.includes('--strict')); assert.equal(args[args.indexOf('-R') + 1], `=${developerIdRequirement}`);
      if (fail) throw new Error('rejected signature');
    }
    assert.ok(!args.includes('--extract-certificates'), 'Optional certificate prefix must use --option=value');
    const extract = args.find(value => value.startsWith('--extract-certificates='));
    if (extract) writeFileSync(`${extract.slice('--extract-certificates='.length)}0`, certificateBytes);
    if (args.includes('--entitlements')) return {stdout:entitlements, stderr:'Executable=fake'};
    return {stdout:'', stderr:detail ?? `Executable=fake\nIdentifier=ca.codepet.zero\nAuthority=${authority}\nTeamIdentifier=${team}\nTimestamp=Oct 11, 2026 at 12:00:00\nCodeDirectory v=20500 size=42 flags=0x10000(runtime) hashes=1+0 location=embedded`};
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
  assert.match(development, /ca\.codepet\.zero\.development/);
  assert.match(development, /ZeroDevelopmentBuild<\/key><true\/>/);
  assert.match(signed, /ca\.codepet\.zero<\/string>/);
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
    const detail = `Identifier=ca.codepet.zero\nAuthority=${authority}\nTeamIdentifier=${team}\nTimestamp=Oct 11, 2026\nCodeDirectory flags=0x10000(runtime)`;
    for (const config of [ {fail:true}, {detail:detail.replace('Timestamp=', 'Signed Time=')}, {detail:detail.replace('runtime','none')}, {entitlements:'<?xml version="1.0"?><plist><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>'}, {entitlements:'<?xml version="1.0"?><plist version="1.0"><dict><key>danger</key><dict/></dict></plist>'}, {certificateBytes:Buffer.from('wrong certificate')}, {detail:detail.replaceAll(team, 'WRONGTEAM1')} ]) {
      assert.throws(() => verifyMacSignature(signatureRunner(config).run, '/fake/Zero Setup.app', path.join(folder, 'cert'), {app:true, identity, team}));
    }
  } finally {rmSync(folder, {recursive:true, force:true});}
});

import {mkdirSync, symlinkSync, readlinkSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {macArtifactIdentity} from './mac-artifact.mjs';
import {iconPng, verifyMacIcon} from './mac-icon.mjs';
import {readBrand, editorBrandSvg, brandSample} from './brand-icon.mjs';
import {windowsIcon} from './windows-icon.mjs';
import {verifyMacVolume, verifyMacPlist, macInstallInstructions} from './mac-volume.mjs';

test('Mac release generation binds conventional app and immutable legacy artifact identities', () => {
  assert.deepEqual(macArtifactIdentity('0.5.13'), {legacy:false, styled:false, filename:'Zero-0.5.13-macos.dmg', appName:'Zero.app', displayName:'Zero', bundleIdentifier:'ca.codepet.zero'});
  assert.equal(macArtifactIdentity('0.5.13', false).bundleIdentifier, 'ca.codepet.zero.development');
  assert.equal(macArtifactIdentity('0.5.13', false).filename, 'Zero-0.5.13-macos-development.dmg');
  assert.equal(macArtifactIdentity('0.5.12').filename, 'Zero-Setup-0.5.12-macos.dmg');
  assert.equal(macArtifactIdentity('0.5.12').bundleIdentifier, 'ca.codepet.zero.setup');
  assert.equal(macArtifactIdentity('1.0.0').appName, 'Zero.app');
  assert.throws(() => macArtifactIdentity('../13'));
});

test('legacy signature opt-in requires its bound version and filename; default rejects old identifier', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-legacy-signature-'));
  const detail = `Identifier=ca.codepet.zero.setup\nAuthority=${authority}\nTeamIdentifier=${team}\nTimestamp=Oct 11, 2026\nCodeDirectory flags=0x10000(runtime)`;
  try {
    const verify = legacyArtifact => verifyMacSignature(signatureRunner({detail}).run, '/fake/Zero Setup.app', path.join(folder, 'cert'), {app:true, identity, team, ...(legacyArtifact ? {legacyArtifact} : {})});
    assert.throws(() => verify(), /bundle identifier/);
    assert.equal(verify({kitVersion:'0.5.12', filename:'Zero-Setup-0.5.12-macos.dmg'}).architectures.length, 2);
    for (const legacyArtifact of [{kitVersion:'0.5.13', filename:'Zero-Setup-0.5.13-macos.dmg'}, {kitVersion:'0.5.12', filename:'Zero-0.5.12-macos.dmg'}, {kitVersion:'0.5.12', filename:'Zero-Setup-0.5.12-macos.dmg', identifier:'evil'}]) assert.throws(() => verify(legacyArtifact));
  } finally {rmSync(folder, {recursive:true, force:true});}
});

function iconFixture() {
  const png = iconPng(1024, '#683bef'), icon = Buffer.alloc(png.length + 16);
  icon.write('icns'); icon.writeUInt32BE(icon.length, 4); icon.write('ic10', 8); icon.writeUInt32BE(png.length + 8, 12); png.copy(icon, 16);
  return icon;
}
test('brand raster contains approved circle/diagonal, PNG size and usable ICNS representation', () => {
  const png = iconPng(24, '#683bef');
  assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16), 24); assert.equal(png.readUInt32BE(20), 24);
  const raw = inflateSync(png.subarray(41, png.length - 16));
  const pixel = (x, y) => [...raw.subarray(y * 97 + 1 + x * 4, y * 97 + 4 + x * 4)];
  assert.deepEqual(pixel(0, 0), [255,255,255]);
  assert.ok(pixel(12, 11)[0] < 255, 'Diagonal crosses the middle');
  assert.ok(pixel(12, 4)[0] < 255, 'Circle remains visible');
  verifyMacIcon(iconFixture());
  assert.throws(() => verifyMacIcon(Buffer.from('fake icon')));
  const invalid = iconFixture(); invalid.writeUInt32BE(invalid.length + 1, 4);
  assert.throws(() => verifyMacIcon(invalid));
});

test('DMG verification permits exactly the app, owned instructions and an unfollowed Applications link', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-volume-')), identity = macArtifactIdentity('0.5.13');
  try {
    mkdirSync(path.join(folder, 'Zero.app/Contents/Resources'), {recursive:true});
    writeFileSync(path.join(folder, 'INSTALL.txt'), macInstallInstructions);
    symlinkSync('/Applications', path.join(folder, 'Applications'));
    const app = verifyMacVolume(folder, identity, true);
    assert.equal(readlinkSync(path.join(folder, 'Applications')), '/Applications');
    const icon = path.join(app, 'Contents/Resources/Zero.icns'); writeFileSync(icon, iconFixture());
    const plist = {CFBundleName:'Zero', CFBundleDisplayName:'Zero', CFBundleShortVersionString:'0.5.13', CFBundleExecutable:'ZeroSetup', CFBundleIdentifier:'ca.codepet.zero', ZeroDevelopmentBuild:false, CFBundleIconFile:'Zero.icns'};
    verifyMacPlist(plist, identity, '0.5.13', true, path.join(app, 'Contents'));
    assert.throws(() => verifyMacPlist({...plist, CFBundleIdentifier:'ca.codepet.zero.setup'}, identity, '0.5.13', true, path.join(app, 'Contents')));
    assert.throws(() => verifyMacPlist({...plist, CFBundleIconFile:'../outside.icns'}, identity, '0.5.13', true, path.join(app, 'Contents')));
    writeFileSync(path.join(folder, 'unexpected.txt'), 'x'); assert.throws(() => verifyMacVolume(folder, identity, true)); rmSync(path.join(folder, 'unexpected.txt'));
    rmSync(path.join(folder, 'Applications')); symlinkSync('/does-not-exist', path.join(folder, 'Applications')); assert.throws(() => verifyMacVolume(folder, identity, true), /exactly/);
    rmSync(path.join(folder, 'Applications')); mkdirSync(path.join(folder, 'Applications')); assert.throws(() => verifyMacVolume(folder, identity, true), /symlink/);
    rmSync(path.join(folder, 'Applications'), {recursive:true}); symlinkSync('/Applications', path.join(folder, 'Applications'));
    rmSync(path.join(folder, 'INSTALL.txt')); symlinkSync('/does-not-exist', path.join(folder, 'INSTALL.txt')); assert.throws(() => verifyMacVolume(folder, identity, true), /regular/);
  } finally {rmSync(folder, {recursive:true, force:true});}
});

import {macDmgLayout, macArrowPng, verifyMacStyledFiles, verifyMacDmgLayout} from './mac-dmg-layout.mjs';

test('styled images begin at14 while legacy and13 volume contracts remain immutable', () => {
  for (const version of ['0.0.1', '0.4.99', '0.5.12', '0.5.13']) assert.equal(macArtifactIdentity(version).styled, false);
  for (const version of ['0.5.14', '0.5.99', '0.6.0', '1.0.0']) {
    const identity = macArtifactIdentity(version); assert.equal(identity.styled, true);
    assert.equal(identity.volumeName, `Zero ${version}`); assert.equal(identity.displayName, 'Zero');
  }
  assert.equal(macArtifactIdentity('0.5.13').volumeName, undefined);
  for (const name of [undefined, 'Zero', 'Zero 0.5.13', 'Zero ../0.5.14']) assert.throws(() => verifyMacDmgLayout('/unused', name), /Styled image|Invalid styled/);
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-styled-'));
  try {
    mkdirSync(path.join(folder, 'Zero.app'));
    symlinkSync('/Applications', path.join(folder, 'Applications'));
    writeFileSync(path.join(folder, 'INSTALL.txt'), macInstallInstructions);
    assert.throws(() => verifyMacVolume(folder, macArtifactIdentity('0.5.14'), true), /Unexpected DMG contents/);
    assert.equal(verifyMacVolume(folder, macArtifactIdentity('0.5.13'), true), path.join(folder, 'Zero.app'));
    rmSync(path.join(folder, 'INSTALL.txt')); rmSync(path.join(folder, 'Applications'));
    rmSync(path.join(folder, 'Zero.app'), {recursive:true}); mkdirSync(path.join(folder, 'Zero Setup.app'));
    assert.equal(verifyMacVolume(folder, macArtifactIdentity('0.5.12'), true), path.join(folder, 'Zero Setup.app'));
  } finally {rmSync(folder, {recursive:true, force:true});}
});

test('styled background is an arrow alone with reviewed native icon positions and labels below', () => {
  assert.deepEqual(macDmgLayout.iconLocations, {'Zero.app':[200,159], Applications:[460,159]});
  assert.equal(macDmgLayout.iconSize, 128); assert.equal(macDmgLayout.textSize, 16);
  const png = macArrowPng(); assert.equal(png.readUInt32BE(16), 660); assert.equal(png.readUInt32BE(20), 360);
  const rows = inflateSync(png.subarray(41, png.length - 16));
  const pixel = (x, y) => [...rows.subarray(y * (660 * 4 + 1) + 1 + x * 4, y * (660 * 4 + 1) + 5 + x * 4)];
  assert.deepEqual(pixel(330,159), [125,125,125,255]);
  for (let y = 0; y < 360; y++) for (let x = 0; x < 660; x++) {
    if (x < 298 || x > 361 || y < 135 || y > 183) assert.deepEqual(pixel(x,y), [255,255,255,255], 'No painted icons, labels or instructions');
  }
});

test('styled hidden assets reject symlinks, oversized metadata, extra files and substituted background', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zero-layout-assets-'));
  const background = path.join(folder, '.background'), ds = path.join(folder, '.DS_Store'), png = path.join(background, 'arrow.png');
  try {
    mkdirSync(background); writeFileSync(ds, 'metadata'); writeFileSync(png, macArrowPng());
    verifyMacStyledFiles(folder);
    writeFileSync(path.join(background, 'extra'), 'x'); assert.throws(() => verifyMacStyledFiles(folder), /Unexpected/); rmSync(path.join(background, 'extra'));
    writeFileSync(png, Buffer.from('wrong')); assert.throws(() => verifyMacStyledFiles(folder), /deterministic/); writeFileSync(png, macArrowPng());
    writeFileSync(ds, Buffer.alloc(65537)); assert.throws(() => verifyMacStyledFiles(folder), /bounded/);
    rmSync(ds); symlinkSync(png, ds); assert.throws(() => verifyMacStyledFiles(folder), /regular/);
    rmSync(ds); writeFileSync(ds, 'metadata'); rmSync(png); symlinkSync(ds,png); assert.throws(() => verifyMacStyledFiles(folder), /regular/);
    rmSync(background,{recursive:true}); symlinkSync(folder,background); assert.throws(() => verifyMacStyledFiles(folder), /owned directory/);
  } finally {rmSync(folder, {recursive:true, force:true});}
});

test('styled build writes Finder metadata on a mounted intermediate before conversion and signing', () => {
  const build = readFileSync(new URL('./build-installers.mjs', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('./mac-dmg-layout.mjs', import.meta.url), 'utf8');
  const python = readFileSync(new URL('./mac-dmg-layout.py', import.meta.url), 'utf8');
  assert.ok(build.indexOf('buildStyledMacDmg(run') < build.indexOf('signMacArtifact(run, staged'));
  assert.match(helper, /'UDRW'/); assert.match(helper, /'UDZO'/); assert.match(python, /volume_open_folder\(mount, write=True\)/);
  assert.ok(helper.indexOf("'write', mount") < helper.indexOf("['convert', writable"));
  assert.match(build, /buildStyledMacDmg\(run, volume, work, staged, artifactIdentity.volumeName\)/);
  assert.match(helper, /'-volname', volumeName/);
  assert.match(helper, /'--volume-name', volumeName/);
  assert.match(python, /parsed.volume.name == volume_name/);
  assert.match(python, /os\.path\.ismount/); assert.match(python, /resolve_alias\(alias\) == background\.resolve\(\)/);
  for (const source of [build, helper, python]) assert.doesNotMatch(source, /osascript|System Events|tell application|AppleScript|open -a/);
  const protectedSource = readFileSync(new URL('../website/lib/local-installer.mjs', import.meta.url), 'utf8');
  for (const file of ['mac-dmg-layout.mjs', 'mac-dmg-layout.py', 'mac-dmg-layout.json', 'mac-dmg-layout-requirements.txt']) assert.ok(protectedSource.includes(`scripts/${file}`), `${file} must be protected by installer provenance`);
});

test('editor and native icons use the canonical thicker ring and softened slash geometry', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const brand = readBrand(root);
  assert.equal(brand.stroke, 2.4); assert.equal(brand.corner, .6);
  assert.equal(editorBrandSvg(root), readFileSync(new URL('../extension/media/zero.svg', import.meta.url),'utf8'));
  assert.match(editorBrandSvg(root), /stroke="currentColor"/);
  assert.doesNotMatch(editorBrandSvg(root), /#683bef/);
  assert.ok(brandSample(12, 1.9, brand), 'Thicker ring includes the new outer edge');
  assert.ok(!brandSample(12, 1.7, brand), 'Ring has a defined outer boundary');
  const rotate = (u,v) => [12 + (u+v)/Math.SQRT2, 12 + (-u+v)/Math.SQRT2];
  assert.ok(brandSample(...rotate(brand.width/2-.1,0), brand), 'Slash endpoint has a flat center');
  assert.ok(!brandSample(...rotate(brand.width/2-.05,brand.height/2-.05), brand), 'Slash corner is softened');
  const ico = windowsIcon(root);
  assert.deepEqual([...ico.subarray(0,6)], [0,0,1,0,7,0]);
  let cursor = 6 + 7 * 16;
  for (let index = 0; index < 7; index++) {
    const entry=6+index*16, size=ico[entry] || 256;
    const count=ico.readUInt32LE(entry+8), offset=ico.readUInt32LE(entry+12);
    assert.equal(offset,cursor); assert.equal(ico.readUInt16LE(entry+6),32);
    const png=ico.subarray(offset,offset+count);
    assert.equal(png.toString('ascii',12,16),'IHDR');
    assert.equal(png.readUInt32BE(16),size); assert.equal(png.readUInt32BE(20),size);
    cursor += count;
  }
  assert.equal(cursor,ico.length);
});
