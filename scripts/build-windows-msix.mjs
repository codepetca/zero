import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,releaseDefinition} from './release.mjs';
import {kitEntries} from './installer-payload.mjs';
import {buildWindowsIcon} from './windows-icon.mjs';
import {iconPng} from './mac-icon.mjs';
import {readBrand} from './brand-icon.mjs';
import {feasibilityIdentity,storeIdentity,msixLogos,msixManifest,msixVersion,sha256,verifyMsixArchive} from './windows-msix.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Build an unsigned local Store MSIX candidate. First run npm run package && npm run verify:kit.\nnode scripts/build-windows-msix.mjs --packager /absolute/makemsix --kind makemsix [--output /absolute/empty-directory] [--channel store|feasibility]\nOn Windows use Windows SDK MakeAppx.exe with --kind makeappx. No signing, account access or publication is performed.');
  process.exit(0);
}
const options = {};
for (let index=0;index<args.length;index+=2) {
  const key=args[index];
  if (!['--packager','--kind','--output','--channel'].includes(key) || !args[index+1] || options[key]) throw new Error('Expected unique --packager, --kind and optional --output arguments; use --help');
  options[key]=args[index+1];
}
const packager=options['--packager'], kind=options['--kind'];
const channel = options['--channel'] || 'store';
if (!['store','feasibility'].includes(channel)) throw new Error('Channel must be store or feasibility');
const identity = channel === 'store' ? storeIdentity : feasibilityIdentity;
if (!packager || !path.isAbsolute(packager) || /[\r\n\0]/.test(packager) || !['makemsix','makeappx'].includes(kind)) throw new Error('Supply an absolute --packager path and --kind makemsix|makeappx');
const output=options['--output'] || path.join(root,'dist/msix');
if (!path.isAbsolute(output) || /[\r\n\0]/.test(output)) throw new Error('MSIX output must be an absolute path');
mkdirSync(output,{recursive:true});
if (lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory() || readdirSync(output).length) throw new Error('MSIX output must be an empty directory; existing candidates are never replaced');
const release=releaseDefinition(), kitFile=path.join(root,'dist',release.assets.kit.filename);
const kit=readFileSync(kitFile), kitReceipt=JSON.parse(readFileSync(path.join(root,'dist/release.json'),'utf8'));
if (kitReceipt.kitVersion !== release.kitVersion || kitReceipt.assets.kit.size !== kit.length || kitReceipt.assets.kit.sha256 !== sha256(kit)) throw new Error('Build and verify the current kit before MSIX packaging');
kitEntries(kit);
const scratch=path.join(root,'.verification/msix'); mkdirSync(scratch,{recursive:true});
const work=mkdtempSync(path.join(scratch,'build-')), stage=path.join(work,'payload'); mkdirSync(stage);
const run=(command,arguments_,timeout=240000) => {
  const result=spawnSync(command,arguments_,{cwd:root,encoding:'utf8',timeout,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}});
  if (result.error || result.status !== 0) throw new Error(`MSIX build failed (${path.basename(command)}): ${result.error?.message || ''}\n${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout || '';
};
const icon=path.join(work,'Zero.ico'); buildWindowsIcon(root,icon);
run('dotnet',['publish',path.join(root,'native-installer/windows/ZeroSetup.csproj'),'-c','Release','-o',stage,
  `-p:ZeroDistribution=${channel === 'store' ? 'Store' : 'StoreFeasibility'}`,`-p:ZeroIcon=${icon}`,`-p:ZeroKitZip=${kitFile}`,`-p:Version=${release.kitVersion}`,`-p:AssemblyVersion=${msixVersion(release.kitVersion)}`,
  `-p:BaseIntermediateOutputPath=${path.join(work,'obj')}${path.sep}`,`-p:BaseOutputPath=${path.join(work,'bin')}${path.sep}`,
  `-p:RestorePackagesPath=${path.join(root,'.verification/native-installer/nuget')}`,'-p:NuGetAudit=false','-p:RestoreLockedMode=true']);
const files={};
for (const name of readdirSync(stage)) {
  if (!['Zero.exe','Zero.exe.config','Newtonsoft.Json.dll'].includes(name) || !lstatSync(path.join(stage,name)).isFile() || lstatSync(path.join(stage,name)).isSymbolicLink()) throw new Error(`Unexpected MSIX runtime payload: ${name}`);
  files[name]=readFileSync(path.join(stage,name));
}
if (!files['Zero.exe'] || !files['Zero.exe.config']) throw new Error('MSIX launcher and DPI configuration must be present');
files['AppxManifest.xml']=Buffer.from(msixManifest(release.kitVersion,identity));
mkdirSync(path.join(stage,'Assets'));
const brand=readBrand(root);
for (const [name,size] of Object.entries(msixLogos)) files[name]=iconPng(size,brand.color,brand,0);
for (const [name,data] of Object.entries(files)) writeFileSync(path.join(stage,name),data);
const filename=`Zero-${release.kitVersion}-msix-${channel}-x64.msix`, artifact=path.join(output,filename);
const packLog=run(packager,kind === 'makemsix' ? ['pack','-d',stage,'-p',artifact] : ['pack','/d',stage,'/p',artifact]);
writeFileSync(path.join(work,'pack.log'),packLog);
const measured=verifyMsixArchive(readFileSync(artifact),{version:release.kitVersion,files,kit,identity});
// Unpacking through Microsoft's SDK performs an independent package/block-map
// read. Only signature validation is skipped: this local candidate is unsigned.
const unpack=path.join(work,'unpacked');
run(packager,kind === 'makemsix' ? ['unpack','-p',artifact,'-d',unpack,'-ss'] : ['unpack','/p',artifact,'/d',unpack]);
for (const [name,data] of Object.entries(files)) if (!readFileSync(path.join(unpack,name)).equals(data)) throw new Error(`Microsoft package round-trip changed ${name}`);
const revision=run('git',['rev-parse','HEAD']).trim(), diff=run('git',['diff','--binary','HEAD']);
const status=run('git',['status','--porcelain']);
const receipt={schema:1,kind:`msix-${channel}`,kitVersion:release.kitVersion,packageVersion:msixVersion(release.kitVersion),
  builtAt:new Date().toISOString(),sourceRevision:revision,sourceDirty:!!status.trim(),trackedDiffSha256:sha256(Buffer.from(diff)),
  identity,architecture:'x64',runtime:'.NET Framework 4.8',unsigned:true,storeIdentityAssigned:channel === 'store',storeCertified:false,nativeWindowsTested:false,
  updateAuthority:'Microsoft Store (not published)',velopackIncluded:false,
  kit:{filename:release.assets.kit.filename,size:kit.length,sha256:sha256(kit)},
  packager:{kind,path:packager,sha256:sha256(readFileSync(packager)),roundTripPassed:true},artifact:{filename,...measured},work};
writeFileSync(path.join(output,'build-msix.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(`Built unsigned MSIX candidate: ${artifact}\nReceipt: ${path.join(output,'build-msix.json')}\nWindows installation, Store signing and certification are pending.`);
