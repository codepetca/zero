import assert from 'node:assert/strict';
import {writeFileSync, realpathSync} from 'node:fs';
import {resolve, relative, isAbsolute, dirname, basename, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {boundedFile} from '../website/lib/local-installer.mjs';
import {validateInstallerManifest} from '../website/lib/installer.mjs';
import {msixManifest, msixVersion, sha256, storeIdentity} from './windows-msix.mjs';

const limit = 128 * 1024 * 1024;
const json = async (dir, name) => JSON.parse((await boundedFile(dir, name, 1024 * 1024)).toString('utf8'));
const same = (a,b, message) => assert.deepEqual(a,b,message);
const measured = async (dir, item) => {
  assert.match(item?.filename || '', /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
  assert.ok(Number.isSafeInteger(item.size) && item.size > 0 && item.size <= limit);
  assert.match(item.sha256 || '', /^[a-f0-9]{64}$/);
  const bytes = await boundedFile(dir,item.filename,item.size);
  assert.equal(bytes.length,item.size); assert.equal(sha256(bytes),item.sha256,`Digest mismatch: ${item.filename}`);
  return bytes;
};
const fields = item => ({filename:item.filename,size:item.size,sha256:item.sha256});

// Parse and bound the central directory before decompressing any member.
// Multi-disk, duplicate and unexpected members are outside the MSIX contract.
export function readCandidateMsix(bytes) {
  const allowed = new Set(['AppxManifest.xml','Zero.exe','Zero.exe.config','Newtonsoft.Json.dll',
    'Assets/Square44x44Logo.png','Assets/Square150x150Logo.png','Assets/StoreLogo.png',
    'AppxBlockMap.xml','[Content_Types].xml']);
  const fail = message => { throw new Error(`Invalid MSIX archive: ${message}`); };
  const requireRange = (offset, size, end = bytes.length) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > end) fail('truncated structure');
  };
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0) fail('missing end record');
  const u64 = offset => { requireRange(offset,8); const value = bytes.readBigUInt64LE(offset); if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail('oversized ZIP64 value'); return Number(value); };
  let disk = bytes.readUInt16LE(eocd + 4), cdDisk = bytes.readUInt16LE(eocd + 6);
  let count = bytes.readUInt16LE(eocd + 10), onDisk = bytes.readUInt16LE(eocd + 8);
  let cdSize = bytes.readUInt32LE(eocd + 12), cdOffset = bytes.readUInt32LE(eocd + 16), directoryEnd = eocd;
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const locator = eocd - 20; requireRange(locator,20,eocd);
    if (bytes.readUInt32LE(locator) !== 0x07064b50 || bytes.readUInt32LE(locator + 4) !== 0 || bytes.readUInt32LE(locator + 16) !== 1) fail('invalid ZIP64 locator');
    const record = u64(locator + 8); requireRange(record,56,locator);
    if (bytes.readUInt32LE(record) !== 0x06064b50 || u64(record + 4) !== 44 || record + 56 !== locator) fail('invalid ZIP64 record');
    disk = bytes.readUInt32LE(record + 16); cdDisk = bytes.readUInt32LE(record + 20);
    onDisk = u64(record + 24); count = u64(record + 32); cdSize = u64(record + 40); cdOffset = u64(record + 48); directoryEnd = record;
  }
  if (disk || cdDisk || count !== onDisk || count < 2 || count > allowed.size || cdOffset + cdSize !== directoryEnd) fail('invalid directory');
  requireRange(cdOffset, cdSize, directoryEnd);
  let offset = cdOffset, total = 0;
  const entries = new Map(), intervals = [];
  for (let i = 0; i < count; i++) {
    requireRange(offset, 46, eocd);
    if (bytes.readUInt32LE(offset) !== 0x02014b50) fail('invalid directory entry');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    let compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    let local = bytes.readUInt32LE(offset + 42);
    requireRange(offset, 46 + nameLength + extraLength + commentLength, eocd);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (size === 0xffffffff || compressed === 0xffffffff || local === 0xffffffff) {
      let extra = offset + 46 + nameLength, extraEnd = extra + extraLength, found = false;
      while (extra < extraEnd) {
        requireRange(extra,4,extraEnd); const id = bytes.readUInt16LE(extra), length = bytes.readUInt16LE(extra + 2); extra += 4; requireRange(extra,length,extraEnd);
        if (id === 1) {
          if (found) fail('duplicate ZIP64 extra'); found = true; let cursor = extra;
          const next = () => { requireRange(cursor,8,extra + length); const n = u64(cursor); cursor += 8; return n; };
          if (size === 0xffffffff) size = next(); if (compressed === 0xffffffff) compressed = next(); if (local === 0xffffffff) local = next();
        }
        extra += length;
      }
      if (!found) fail('missing ZIP64 extra');
    }
    if (!allowed.has(name) || entries.has(name) || flags & ~0x808 || ![0,8].includes(method) || bytes.readUInt16LE(offset + 34) !== 0) fail('unsupported member');
    total += size;
    if (size > limit || total > limit || (name === 'AppxManifest.xml' && size > 1024 * 1024) || (method === 0 && size !== compressed)) fail('decoded size limit');
    requireRange(local, 30, cdOffset);
    if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) fail('local header mismatch');
    const localNameLength = bytes.readUInt16LE(local + 26), localExtraLength = bytes.readUInt16LE(local + 28);
    requireRange(local, 30 + localNameLength + localExtraLength + compressed, cdOffset);
    if (!bytes.subarray(local + 30, local + 30 + localNameLength).equals(bytes.subarray(offset + 46, offset + 46 + nameLength))) fail('member name mismatch');
    const start = local + 30 + localNameLength + localExtraLength, end = start + compressed;
    if (intervals.some(([a,b]) => local < b && end > a)) fail('overlapping members');
    intervals.push([local,end]); entries.set(name, {method,size,start,end});
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== directoryEnd || !entries.has('AppxManifest.xml') || !entries.has('Zero.exe')) fail('incomplete inventory');
  const result = {};
  for (const name of ['AppxManifest.xml','Zero.exe']) {
    const entry = entries.get(name), compressed = bytes.subarray(entry.start,entry.end);
    // zlib enforces the bound even when a malicious stream expands beyond its
    // claimed central-directory size; verify exact size after decompression.
    const data = entry.method === 0 ? compressed : inflateRawSync(compressed, {maxOutputLength: Math.max(1, entry.size)});
    if (data.length !== entry.size) fail('decoded size mismatch');
    result[name] = data;
  }
  return result;
}

// Pairing validates receipts and actual bytes. It does not rerun native signature,
// notarization, WACK, installation or certification checks.
export async function pairCandidates({macDir, windowsDir, version, sourceRevision, output}) {
  const destination = join(realpathSync(dirname(resolve(output))), basename(resolve(output)));
  for (const directory of [macDir, windowsDir]) {
    const path = relative(realpathSync(directory), destination);
    assert.ok(path && (path.startsWith('..' + sep) || path === '..' || isAbsolute(path)), 'Output must be outside sealed input directories');
  }
  assert.match(sourceRevision || '', /^[a-f0-9]{40}$/, 'Exact source commit required');
  const packageVersion = msixVersion(version);
  const [candidate, release, manifest, macBuild, win, source] = await Promise.all([
    json(macDir,'candidate.json'),json(macDir,'release.json'),json(macDir,'installer.json'),json(macDir,'build-macos-signed.json'),
    json(windowsDir,'build-msix.json'),json(windowsDir,'source-and-kit.json')]);
  assert.equal(candidate.schema,1); assert.equal(candidate.kind,'zero-mac-release-candidate');
  assert.equal(candidate.kitVersion,version); assert.equal(candidate.builtSourceRevision,sourceRevision);
  assert.match(candidate.preparationRevision || '', /^[a-f0-9]{40}$/); assert.equal(candidate.sourceEquivalent,true);
  same(candidate.verification,{kitSourceAndArchives:true,signedPayload:true,staple:true,gatekeeper:true});
  assert.equal(release.schema,1); assert.equal(release.kitVersion,version);
  assert.equal(release.publication?.status,'local'); assert.equal(release.publication?.tag,`v${version}`);
  validateInstallerManifest(manifest,release);
  assert.equal(manifest.publication.status,'local'); assert.equal(manifest.sourceRevision,sourceRevision);
  assert.equal(candidate.nativeTag,manifest.publication.tag); assert.equal(candidate.kitTag,release.publication.tag);
  assert.equal(macBuild.schema,1); assert.equal(macBuild.kitVersion,version);
  assert.equal(macBuild.sourceRevision,sourceRevision); assert.equal(macBuild.sourceDirty,false);
  same(macBuild.kit,manifest.kit); same(fields(release.assets.kit),manifest.kit);
  assert.equal(macBuild.artifacts?.length,1);
  const macAsset = macBuild.artifacts[0];
  for (const key of ['filename','size','sha256','platform','minimumOS','architectures']) same(macAsset[key],manifest.asset[key],`Mac ${key} mismatch`);
  assert.equal(macAsset.developerIdSigned,true); assert.equal(macAsset.notarized,true);
  for (const key of ['identitySha1','teamIdentifier']) assert.equal(macAsset.signing?.[key],manifest.signing[key]);
  assert.equal(macAsset.notarization?.submissionId,manifest.notarizationSubmissionId);
  assert.equal(macAsset.notarization?.status,'Accepted'); assert.equal(macAsset.notarization?.stapled,true);
  same(macAsset.notarization?.gatekeeper,{dmg:'accepted',app:'accepted'});
  assert.equal(candidate.artifacts?.length,4);
  for (const item of [release.assets.kit,release.assets.starter,release.assets.extension,manifest.asset]) {
    assert.ok(candidate.artifacts.some(other => JSON.stringify(fields(other)) === JSON.stringify(fields(item))), 'Mac candidate artifact missing');
    await measured(macDir,item);
  }
  const kitBytes = await measured(macDir,manifest.kit);
  assert.equal(win.schema,1); assert.equal(win.kind,'msix-store'); assert.equal(win.kitVersion,version);
  assert.equal(win.sourceRevision,sourceRevision); assert.equal(win.sourceDirty,false); assert.equal(win.packageVersion,packageVersion);
  assert.equal(win.architecture,'x64'); assert.equal(win.unsigned,true); assert.equal(win.storeIdentityAssigned,true);
  same(win.identity,storeIdentity); same(win.kit,manifest.kit);
  assert.equal(win.packager?.kind,'makeappx'); assert.equal(win.packager?.roundTripPassed,true);
  assert.match(win.packager?.sha256 || '', /^[a-f0-9]{64}$/);
  assert.equal(source.schema,1); assert.equal(source.sourceRevision,sourceRevision); assert.equal(source.githubSha,sourceRevision);
  assert.equal(source.kit?.kitVersion,version); same(fields(source.kit.assets.kit),manifest.kit);
  assert.equal(source.packager?.sha256,win.packager.sha256); assert.equal(source.packager?.signatureStatus,'Valid');
  assert.equal(win.artifact.filename,`Zero-${version}-msix-store-x64.msix`);
  const msixBytes = await measured(windowsDir,win.artifact);
  const archive = readCandidateMsix(msixBytes);
  assert.equal(Buffer.from(archive['AppxManifest.xml'] || []).toString('utf8'),msixManifest(version,storeIdentity));
  assert.ok(Buffer.from(archive['Zero.exe'] || []).includes(kitBytes),'MSIX launcher does not contain the measured kit bytes');
  const receipt = {schema:1,kind:'zero-paired-local-candidate',kitVersion:version,packageVersion,sourceRevision,
    kit:manifest.kit,mac:fields(manifest.asset),windows:fields(win.artifact),
    verification:{macReceiptAndArtifact:true,windowsReceiptAndArtifact:true,windowsEmbeddedKitBytes:true},
    limitations:['Mac embedded kit and native signing evidence rely on the sealed Mac build and verification receipts.', 'Pairing does not establish WACK, installation, Store certification or publication.']};
  writeFileSync(destination,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2), opts={};
  assert.equal(args.length,10,'Usage: node scripts/pair-release-candidates.mjs --mac <dir> --windows <dir> --version <version> --source <40-hex> --output <new-file>');
  for(let i=0;i<args.length;i+=2) { assert.ok(['--mac','--windows','--version','--source','--output'].includes(args[i]) && args[i+1] && !opts[args[i]]); opts[args[i]]=args[i+1]; }
  await pairCandidates({macDir:opts['--mac'],windowsDir:opts['--windows'],version:opts['--version'],sourceRevision:opts['--source'],output:opts['--output']});
  console.log(`Local paired receipt written to ${resolve(opts['--output'])}; no publication or certification performed.`);
}
