import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,lstatSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {root,releaseDefinition} from './release.mjs';
import {readMacUpdaterConfig,acquireSparkle} from './mac-updater.mjs';
import {createAppcast,hash,updateKeyAccount,validateMacUpdateFeed,verifyUpdateArchive} from './mac-update-feed.mjs';
import {validateInstallerManifest} from '../website/lib/installer.mjs';
import {boundedFile,verifiedLocalInstaller,verifyInstallerSource} from '../website/lib/local-installer.mjs';
import {sealMacCandidate} from './mac-release.mjs';

function run(command,args,timeout=180000) {
  const result=spawnSync(command,args,{encoding:'utf8',timeout,maxBuffer:1024*1024});
  assert.equal(result.status,0,result.error?.message || result.stderr || 'Update signing failed');
  return {stdout:result.stdout,stderr:result.stderr};
}
export async function prepareMacUpdate({keyFile,output} = {}) {
  assert.equal(process.platform,'darwin');
  const release=releaseDefinition(), config=readMacUpdaterConfig(root);
  const installer=validateInstallerManifest(JSON.parse(await boundedFile(root,'release/installer.json',128*1024)),release);
  assert.equal(installer.publication.status,'local');
  const source=verifyInstallerSource(root,installer.sourceRevision,{clean:true});
  const native=await verifiedLocalInstaller(root,installer,release);
  const distribution=acquireSparkle(run,root,config);
  const scratch=mkdtempSync(join(root,'.verification/native-installer/feed-'));
  try {
    if (keyFile) {
      assert.ok(isAbsolute(keyFile));
      const stat=lstatSync(keyFile);
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid(),'Signing key must be a private owned file');
    }
    const keyArgs=keyFile ? ['--ed-key-file',keyFile] : ['--account',updateKeyAccount];
    const signature=run(join(distribution.directory,'bin/sign_update'),[...keyArgs,'-p',join(root,'dist/installers',installer.asset.filename)],30000).stdout.trim();
    const manifest={schema:1,publication:{status:'local'},kitVersion:release.kitVersion,buildNumber:config.buildNumber,feedURL:config.feedURL,publicKeySha256:hash(Buffer.from(config.publicKey,'base64')),sourceRevision:installer.sourceRevision,createdAt:new Date(Math.floor(Date.now()/1000)*1000).toISOString(),asset:{...Object.fromEntries(['filename','size','sha256'].map(key=>[key,installer.asset[key]])),url:`https://github.com/codepetca/zero/releases/download/${installer.publication.tag}/${installer.asset.filename}`,edSignature:signature}};
    const file=join(scratch,'appcast.xml'); writeFileSync(file,createAppcast(manifest),{flag:'wx'});
    run(join(distribution.directory,'bin/sign_update'),[...keyArgs,file],30000);
    const bytes=readFileSync(file);
    manifest.feed={filename:'appcast.xml',size:bytes.length,sha256:hash(bytes)};
    validateMacUpdateFeed(manifest,config,installer,bytes,{allowLocal:true}); verifyUpdateArchive(native.bytes,manifest,config);
    assert.deepEqual(verifyInstallerSource(root,installer.sourceRevision,{clean:true}),source);
    const final=await verifiedLocalInstaller(root,installer,release); assert.deepEqual(final.bytes,native.bytes); assert.deepEqual(final.receiptBytes,native.receiptBytes);
    output=resolve(output || join(root,`dist/installers/updates-${release.kitVersion}`));
    sealMacCandidate(output,{'appcast.xml':bytes,'mac-update-feed.json':JSON.stringify(manifest,null,2)+'\n'});
    console.log(`Sealed signed update feed at ${output}. No feed or release was published.`);
    return {output,manifest};
  } finally {rmSync(scratch,{recursive:true,force:true});rmSync(distribution.directory,{recursive:true,force:true});}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2) {
    assert.ok(['--key-file','--output'].includes(args[i]) && args[i+1],'Usage: node scripts/mac-update-release.mjs [--key-file <private-path>] [--output <new-directory>]');
    const key=args[i]==='--key-file'?'keyFile':'output'; assert.equal(options[key],undefined); options[key]=args[i+1];
  }
  await prepareMacUpdate(options);
}
