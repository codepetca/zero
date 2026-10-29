import assert from 'node:assert/strict';
import {accessSync,constants,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha256,msixVersion,storeIdentity} from './windows-msix.mjs';
import {macArtifactIdentity} from './mac-artifact.mjs';

const projectRoot = fileURLToPath(new URL('../',import.meta.url));
const readJson = file => JSON.parse(readFileSync(file,'utf8'));
function execute(command,args,{cwd}) {
 const result=spawnSync(command,args,{cwd,encoding:'utf8',stdio:'pipe',timeout:1800000});
 assert.equal(result.status,0,result.error?.message || result.stderr || `${command} failed`);
 return result.stdout || '';
}
function asset(dir,record) {
 assert.match(record?.filename || '',/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
 assert.ok(Number.isSafeInteger(record.size) && record.size>0 && record.size<=128*1024*1024);
 assert.match(record.sha256 || '',/^[a-f0-9]{64}$/);
 const file=path.join(dir,record.filename); assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
 const bytes=readFileSync(file); assert.equal(bytes.length,record.size); assert.equal(sha256(bytes),record.sha256);
 return {filename:record.filename,size:record.size,sha256:record.sha256};
}
export function buildReleasePair({root=projectRoot,version,sourceRevision,signIdentity,packager,output,host=process.platform,run=execute}) {
 assert.equal(host,'darwin','Local paired build requires macOS');
 assert.match(sourceRevision || '',/^[a-f0-9]{40}$/,'Expected full source SHA');
 assert.match(signIdentity || '',/^[a-f0-9]{40}$/i,'Explicit Developer ID SHA-1 required');
 const packageVersion=msixVersion(version);
 assert.ok(path.isAbsolute(packager || '') && !/[\r\n\0]/.test(packager));
 assert.ok(lstatSync(packager).isFile() && !lstatSync(packager).isSymbolicLink(),'Packager must be a regular file'); accessSync(packager,constants.X_OK);
 assert.ok(path.isAbsolute(output || '') && !/[\r\n\0]/.test(output));
 const destination=path.join(realpathSync(path.dirname(output)),path.basename(output));
 assert.ok(!existsSync(destination),'Output already exists');
 const dist=path.join(root,'dist'); assert.ok(!existsSync(dist),'dist already exists; preserve prior builds');
 const rel=path.relative(root,destination); assert.ok(rel !== 'dist' && !rel.startsWith(`dist${path.sep}`),'Output must be outside dist');
 const release=readJson(path.join(root,'release/kit.json'));
 assert.equal(release.schema,1); assert.equal(release.kitVersion,version); assert.equal(release.publication?.status,'local');
 assert.equal(release.publication?.tag,`v${version}`); assert.equal(release.publication?.repository,'codepetca/zero');
 assert.equal(readJson(path.join(root,'extension/package.json')).version,version);
 assert.ok(readFileSync(path.join(root,'framework/pom.xml'),'utf8').includes(`<artifactId>zero-core</artifactId>\n  <version>${release.coreVersion}</version>`));
 assert.equal(release.assets?.kit?.filename,'zero-bootstrap.zip'); assert.equal(release.assets?.extension?.filename,`zero-${version}.vsix`);
 for(const value of Object.values(release.assets)) assert.ok(!value.url,'Local release must not reference published assets');
 const git=(...args)=>run('git',args,{cwd:root}).trim();
 const checkSource=()=>{assert.equal(git('rev-parse','HEAD'),sourceRevision,'Source revision changed');assert.equal(git('status','--porcelain','--untracked-files=all'),'','Source must be clean');};
 checkSource();
 mkdirSync(dist); // Reserve the fresh output tree before invoking overwrite-capable builders.
 run('npm',['run','package'],{cwd:root}); run('npm',['run','verify:kit'],{cwd:root}); checkSource();
 const kitReceipt=readJson(path.join(dist,'release.json')); assert.equal(kitReceipt.kitVersion,version);
 const kit=asset(dist,kitReceipt.assets.kit); assert.equal(kit.filename,release.assets.kit.filename);
 run(process.execPath,['scripts/build-installers.mjs','--platform','macos','--sign-identity',signIdentity.toUpperCase()],{cwd:root});
 checkSource();
 const mac=readJson(path.join(dist,'installers/build-macos-signed.json'));
 assert.equal(mac.schema,1); assert.equal(mac.kitVersion,version); assert.equal(mac.sourceRevision,sourceRevision); assert.equal(mac.sourceDirty,false);
 assert.deepEqual(mac.kit,kit); assert.equal(mac.artifacts?.length,1);
 const macRecord=mac.artifacts[0]; assert.equal(macRecord.filename,macArtifactIdentity(version).filename);
 assert.equal(macRecord.platform,'macos'); assert.equal(macRecord.developerIdSigned,true); assert.equal(macRecord.notarized,false);
 assert.equal(macRecord.signing?.identitySha1,signIdentity.toUpperCase());
 const macArtifact=asset(path.join(dist,'installers'),macRecord);
 run(process.execPath,['scripts/build-windows-msix.mjs','--packager',packager,'--kind','makemsix','--channel','store','--output',path.join(dist,'msix')],{cwd:root});
 checkSource();
 const win=readJson(path.join(dist,'msix/build-msix.json'));
 assert.equal(win.schema,1); assert.equal(win.kind,'msix-store'); assert.equal(win.kitVersion,version); assert.equal(win.packageVersion,packageVersion);
 assert.equal(win.sourceRevision,sourceRevision); assert.equal(win.sourceDirty,false); assert.deepEqual(win.kit,kit); assert.deepEqual(win.identity,storeIdentity);
 assert.equal(win.architecture,'x64'); assert.equal(win.unsigned,true); assert.equal(win.packager?.kind,'makemsix'); assert.equal(win.packager?.roundTripPassed,true); assert.equal(win.packager?.sha256,sha256(readFileSync(packager)));
 assert.equal(win.artifact?.filename,`Zero-${version}-msix-store-x64.msix`);
 const windowsArtifact=asset(path.join(dist,'msix'),win.artifact);
 // Repeat measured kit after both builders, guarding unexpected modifications.
 assert.deepEqual(asset(dist,kitReceipt.assets.kit),kit);
 const receipt={schema:1,kind:'zero-local-paired-build',sourceRevision,kitVersion:version,packageVersion,kit,mac:macArtifact,windows:windowsArtifact,
  limitations:['Mac DMG is signed but not notarized or release-ready.','Store MSIX is unsigned and has not passed WACK or Store certification.','No publication or upload was performed.']};
 writeFileSync(destination,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'}); return receipt;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2),opts={};
 assert.equal(args.length,10,'Usage: node scripts/build-release-pair.mjs --version <version> --source <full-sha> --sign-identity <sha1> --packager <absolute-makemsix> --output <new-absolute-file>');
 for(let i=0;i<args.length;i+=2){assert.ok(['--version','--source','--sign-identity','--packager','--output'].includes(args[i]) && args[i+1] && !opts[args[i]]);opts[args[i]]=args[i+1];}
 buildReleasePair({version:opts['--version'],sourceRevision:opts['--source'],signIdentity:opts['--sign-identity'],packager:opts['--packager'],output:opts['--output']});
 console.log('Local paired build complete; notarization, WACK and release remain pending.');
}
