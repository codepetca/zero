import assert from 'node:assert/strict';
import {writeFileSync, realpathSync} from 'node:fs';
import {resolve, relative, isAbsolute, dirname, basename, join, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
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
  const archive = unzipSync(msixBytes);
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
