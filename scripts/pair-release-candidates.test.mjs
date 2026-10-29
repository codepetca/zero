import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync} from 'fflate';
import {pairCandidates} from './pair-release-candidates.mjs';
import {msixManifest,sha256,storeIdentity} from './windows-msix.mjs';

const version='0.5.56', sourceRevision='a'.repeat(40), packHash='b'.repeat(64);
const item=(filename,bytes)=>({filename,size:bytes.length,sha256:sha256(bytes)});
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'zero-pair-')),macDir=join(root,'mac'),windowsDir=join(root,'win'); mkdirSync(macDir); mkdirSync(windowsDir);
 const kit=Buffer.from('measured kit'),dmg=Buffer.from('signed dmg'),starter=Buffer.from('starter'),vsix=Buffer.from('vsix');
 const k=item('zero-bootstrap.zip',kit),asset={...item('Zero-0.5.56-macos.dmg',dmg),platform:'macos',architectures:['arm64','x86_64'],minimumOS:'12.0'};
 const signing={identitySha1:'A'.repeat(40),teamIdentifier:'A'.repeat(10)}, submission='a'.repeat(36);
 const release={schema:1,kitVersion:version,publication:{status:'local',repository:'codepetca/zero',tag:`v${version}`},assets:{kit:k,starter:item('zero-starter.zip',starter),extension:item(`zero-${version}.vsix`,vsix)}};
 const manifest={schema:1,kitVersion:version,publication:{status:'local',repository:'codepetca/zero',tag:`setup-v${version}`},sourceRevision,kit:k,asset,signing,notarizationSubmissionId:submission};
 const build={schema:1,kitVersion:version,sourceRevision,sourceDirty:false,kit:k,artifacts:[{...asset,developerIdSigned:true,notarized:true,signing,notarization:{submissionId:submission,status:'Accepted',stapled:true,gatekeeper:{dmg:'accepted',app:'accepted'}}}]};
 const candidate={schema:1,kind:'zero-mac-release-candidate',kitVersion:version,builtSourceRevision:sourceRevision,preparationRevision:sourceRevision,sourceEquivalent:true,nativeTag:`setup-v${version}`,kitTag:`v${version}`,verification:{kitSourceAndArchives:true,signedPayload:true,staple:true,gatekeeper:true},artifacts:[...Object.values(release.assets),asset]};
 const msix=Buffer.from(zipSync({'AppxManifest.xml':Buffer.from(msixManifest(version,storeIdentity)),'Zero.exe':Buffer.concat([Buffer.from('exe'),kit])}));
 const win={schema:1,kind:'msix-store',kitVersion:version,packageVersion:'1.5.56.0',sourceRevision,sourceDirty:false,architecture:'x64',unsigned:true,storeIdentityAssigned:true,identity:storeIdentity,kit:k,packager:{kind:'makeappx',roundTripPassed:true,sha256:packHash},artifact:item(`Zero-${version}-msix-store-x64.msix`,msix)};
 const source={schema:1,sourceRevision,githubSha:sourceRevision,kit:release,packager:{sha256:packHash,signatureStatus:'Valid'}};
 const put=(dir,name,obj)=>writeFileSync(join(dir,name),JSON.stringify(obj));
 for(const [name,bytes] of [[k.filename,kit],[asset.filename,dmg],[release.assets.starter.filename,starter],[release.assets.extension.filename,vsix]]) writeFileSync(join(macDir,name),bytes);
 writeFileSync(join(windowsDir,win.artifact.filename),msix);
 for(const [name,obj] of [['candidate.json',candidate],['release.json',release],['installer.json',manifest],['build-macos-signed.json',build]]) put(macDir,name,obj);
 put(windowsDir,'build-msix.json',win);put(windowsDir,'source-and-kit.json',source);
 return {root,macDir,windowsDir,output:join(root,'paired.json'),version,sourceRevision,win,build,put};
}
test('pairs verified source and measured artifacts without claiming certification or overwriting',async()=>{
 const f=fixture(); try { const receipt=await pairCandidates(f); assert.equal(receipt.packageVersion,'1.5.56.0'); assert.match(receipt.limitations.join(' '),/does not establish WACK/); assert.deepEqual(JSON.parse(readFileSync(f.output)),receipt); await assert.rejects(pairCandidates(f),/EEXIST/); } finally {rmSync(f.root,{recursive:true,force:true});}
});
test('rejects mismatched receipt fields and tampered artifact bytes',async()=>{
 for(const change of [f=>f.win.sourceRevision='c'.repeat(40),f=>f.win.sourceDirty=true,f=>f.win.packageVersion='0.5.56.0',f=>f.win.identity={...storeIdentity,name:'other'},f=>f.win.kit.sha256='f'.repeat(64),f=>f.build.sourceDirty=true]) {
  const f=fixture(); try {change(f);f.put(f.windowsDir,'build-msix.json',f.win);f.put(f.macDir,'build-macos-signed.json',f.build);await assert.rejects(pairCandidates(f));} finally {rmSync(f.root,{recursive:true,force:true});}
 }
 const f=fixture(); try {writeFileSync(join(f.windowsDir,f.win.artifact.filename),'changed');await assert.rejects(pairCandidates(f));} finally {rmSync(f.root,{recursive:true,force:true});}
});
test('rejects missing source evidence and a package that does not embed the kit',async()=>{
 const f=fixture(); try {rmSync(join(f.windowsDir,'source-and-kit.json'));await assert.rejects(pairCandidates(f));} finally {rmSync(f.root,{recursive:true,force:true});}
 const g=fixture(); try {const bytes=Buffer.from(zipSync({'AppxManifest.xml':Buffer.from(msixManifest(version,storeIdentity)),'Zero.exe':Buffer.from('different')}));writeFileSync(join(g.windowsDir,g.win.artifact.filename),bytes);g.win.artifact=item(g.win.artifact.filename,bytes);g.put(g.windowsDir,'build-msix.json',g.win);await assert.rejects(pairCandidates(g),/does not contain/);} finally {rmSync(g.root,{recursive:true,force:true});}
});

test('bounds and validates MSIX inventory before decompression', async () => {
 const {readCandidateMsix} = await import('./pair-release-candidates.mjs');
 const make = extra => Buffer.from(zipSync({'AppxManifest.xml':Buffer.from('manifest'),'Zero.exe':Buffer.alloc(4096),...extra}));
 assert.throws(() => readCandidateMsix(make({'unexpected':Buffer.from('x')})), /unsupported member/);
 const truncated = make({}).subarray(0,20); assert.throws(() => readCandidateMsix(truncated), /missing end record/);
 const oversized = make({});
 const eocd = oversized.length - 22, central = oversized.readUInt32LE(eocd + 16);
 oversized.writeUInt32LE(129 * 1024 * 1024, central + 24);
 assert.throws(() => readCandidateMsix(oversized), /decoded size limit/);
 // Forge a small declared size around an actually larger deflate stream. The
 // decoder itself must enforce the limit rather than trusting the ZIP header.
 const forged = make({});
 let entry = forged.readUInt32LE(forged.length - 6);
 entry += 46 + forged.readUInt16LE(entry + 28) + forged.readUInt16LE(entry + 30) + forged.readUInt16LE(entry + 32);
 forged.writeUInt32LE(8, entry + 24);
 assert.throws(() => readCandidateMsix(forged), /larger than|buffer|size/i);
});
