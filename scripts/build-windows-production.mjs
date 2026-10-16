import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root,releaseDefinition} from './release.mjs';
import {kitEntries} from './installer-payload.mjs';
import {buildWindowsPackage} from './windows-package.mjs';
import {parseWindowsSigningArguments,windowsSigningPolicy} from './windows-signing.mjs';

// Explicit use of an existing certificate or previously provisioned Azure
// profile only. No enrollment, credential import or publication occurs here.
const signingOptions = parseWindowsSigningArguments(process.argv.slice(2));
windowsSigningPolicy(signingOptions);
assert.equal(process.platform,'win32','Production Windows signing requires Windows');
const release=releaseDefinition();
assert.equal(release.publication.status,'local','A published kit version is immutable; advance the local version first');
function run(command,parameters,timeout=180000,options={}) {
  const result=spawnSync(command,parameters,{cwd:root,encoding:'utf8',timeout,maxBuffer:8*1024*1024,env:options.env || {...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}});
  assert.equal(result.status,0,`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return {stdout:result.stdout || '',stderr:result.stderr || ''};
}
const sourceRevision=run('git',['rev-parse','HEAD']).stdout.trim();
assert.equal(run('git',['status','--porcelain']).stdout.trim(),'','Production packaging requires clean, reviewed source');
const dist=path.join(root,'dist'),output=path.join(dist,'installers');
const receiptFile=path.join(output,'build-windows-signed.json');
assert.ok(!existsSync(receiptFile),'Preserve the existing signed candidate receipt before a new build');
const kitFile=path.join(dist,release.assets.kit.filename),kit=readFileSync(kitFile);
const built=JSON.parse(readFileSync(path.join(dist,'release.json'),'utf8'));
assert.equal(built.kitVersion,release.kitVersion);
assert.equal(built.assets.kit.size,kit.length);
assert.equal(built.assets.kit.sha256,createHash('sha256').update(kit).digest('hex'));
kitEntries(kit);
mkdirSync(path.join(root,'.verification/native-installer'),{recursive:true});
const work=mkdtempSync(path.join(root,'.verification/native-installer/windows-signed-'));
const result=buildWindowsPackage({root,kitFile,version:release.kitVersion,output,work,run,production:true,
  ...signingOptions});
writeFileSync(receiptFile,JSON.stringify({schema:1,kitVersion:release.kitVersion,sourceRevision,sourceDirty:false,
  kit:{filename:release.assets.kit.filename,...result.kit},builtAt:new Date().toISOString(),artifacts:result.artifacts,
  signing:result.signing,updaterConfigSha256:result.updaterConfigSha256},null,2)+'\n',{flag:'wx'});
console.log(`Verified signed Windows candidate: ${receiptFile}. Physical Windows acceptance and publication remain separate.`);
