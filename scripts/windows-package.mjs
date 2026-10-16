import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {windowsSigningPolicy,windowsSignatureVerifier,readWindowsSignatureResult,NEWTONSOFT_SIGNER_SHA1} from './windows-signing.mjs';
import {readWindowsUpdaterConfig, validateWindowsUpdaterConfig, VELOPACK_VERSION} from './windows-updater.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function absolute(value, name) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}
function directory(value, name) {
  absolute(value,name); mkdirSync(value,{recursive:true});
  if (!lstatSync(value).isDirectory() || lstatSync(value).isSymbolicLink() || readdirSync(value).length) throw new Error(`${name} must be an empty owned directory`);
}
function pe(bytes, description) {
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) throw new Error(`${description} is not a Windows PE file`);
  const offset = bytes.readUInt32LE(0x3c);
  if (offset > bytes.length - 4 || bytes.readUInt32LE(offset) !== 0x00004550) throw new Error(`${description} has an invalid PE header`);
}
function text(result) { return `${result?.stdout || ''}\n${result?.stderr || ''}`; }

// Explicit DLL overrides use a separately provisioned local runtime. Without an
// override, dotnet resolves a locally installed tool manifest; no global install.
export function windowsVpkInvocation(env = process.env) {
  const command = env.ZERO_WINDOWS_DOTNET ? absolute(env.ZERO_WINDOWS_DOTNET,'ZERO_WINDOWS_DOTNET') : 'dotnet';
  if (env.ZERO_WINDOWS_VPK_DLL) return {command,prefix:[absolute(env.ZERO_WINDOWS_VPK_DLL,'ZERO_WINDOWS_VPK_DLL')]};
  if (env.ZERO_WINDOWS_DOTNET) throw new Error('A private tool runtime also requires ZERO_WINDOWS_VPK_DLL');
  return {command,prefix:['tool','run','vpk','--']};
}

export function buildWindowsPackage({root,kitFile,version,output,work,run,production = false,certificate,azureSigning,platform = process.platform,env = process.env}) {
  absolute(root,'root'); absolute(kitFile,'kitFile'); absolute(output,'output'); absolute(work,'work');
  if (!/^\d+\.\d+\.\d+$/.test(version) || typeof run !== 'function') throw new Error('Windows packaging requires a three-part release version and process runner');
  if (production && platform !== 'win32') throw new Error('Production Windows Authenticode packaging requires Windows; cross-build development packages are unsigned');
  if (!production && (certificate || azureSigning)) throw new Error('Signing options are accepted only for explicit production builds');
  // VPK_SIGN_TEMPLATE is executable command text. Ambient VPK_* options must
  // never add signing, change package identity, or bypass the startup check.
  const childEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !name.toUpperCase().startsWith('VPK_')));
  Object.assign(childEnv,{DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'});
  const execute = (command,args,timeout) => run(command,args,timeout,{env:childEnv,capture:true});
  const signingPolicy = production ? windowsSigningPolicy({certificate,azureSigning}) : undefined;
  const config = production ? readWindowsUpdaterConfig(root,{production:true}) : validateWindowsUpdaterConfig({schema:1,enabled:false,packageId:'Zero',channel:'win',feedUrl:'',publicKeyXml:'',velopackVersion:VELOPACK_VERSION});
  const tool = windowsVpkInvocation(env);
  const help = text(execute(tool.command,[...tool.prefix,'[win]','--help'],60000));
  if (!new RegExp(`Velopack CLI ${VELOPACK_VERSION.replaceAll('.','\\.')}(?:[,\\s])`).test(help)) throw new Error(`Expected pinned Velopack CLI ${VELOPACK_VERSION}; provision the local tool or explicit ZERO_WINDOWS_VPK_DLL`);
  const publishedDirectory = path.join(work,'windows-publish'), packageDirectory = path.join(work,'windows-packages');
  directory(publishedDirectory,'Windows publish directory'); directory(packageDirectory,'Windows package directory');
  mkdirSync(output,{recursive:true});
  const updaterFile = path.join(work,'windows-updater-build.json');
  writeFileSync(updaterFile,`${JSON.stringify(config,null,2)}\n`,{flag:'wx'});
  const kit = readFileSync(kitFile);
  execute('dotnet',['publish',path.join(root,'native-installer/windows/ZeroSetup.csproj'),'-c','Release','-o',publishedDirectory,
    `-p:ZeroKitZip=${kitFile}`,`-p:ZeroUpdaterConfig=${updaterFile}`,`-p:Version=${version}`,`-p:AssemblyVersion=${version}.0`,
    `-p:BaseIntermediateOutputPath=${path.join(work,'windows-obj')}${path.sep}`,`-p:BaseOutputPath=${path.join(work,'windows-bin')}${path.sep}`,
    `-p:RestorePackagesPath=${path.join(root,'.verification/native-installer/nuget')}`,'-p:NuGetAudit=false','-p:RestoreLockedMode=true'],240000);
  const executable = path.join(publishedDirectory,'Zero.exe'), executableBytes = readFileSync(executable);
  pe(executableBytes,'Zero.exe');
  if (executableBytes.indexOf(kit) < 0) throw new Error('Zero.exe must embed the exact measured kit');
  const dlls = readdirSync(publishedDirectory).filter(name => name.endsWith('.dll')).sort();
  if (JSON.stringify(dlls) !== JSON.stringify(['Newtonsoft.Json.dll','Velopack.dll'])) throw new Error(`Unexpected Windows runtime dependencies: ${dlls.join(', ')}`);
  const packArgs = [...tool.prefix,'[win]','pack','--packId','Zero','--packTitle','Zero','--packVersion',version,'--packDir',publishedDirectory,
    '--mainExe','Zero.exe','--runtime','win10.0.19041-x64','--channel','win','--outputDir',packageDirectory,'--delta','None','--noPortable',
    '--shortcuts','StartMenuRoot','--skip-updates','--yes'];
  if (production) {
    if (signingPolicy.mode === 'azure-artifact-signing') {
      // Snapshot only the three validated public configuration values. Never pass
      // a mutable source file or credential-bearing metadata through to vpk.
      const metadataFile = path.join(work,'azure-signing-metadata.json');
      if (/["%!]/.test(metadataFile)) throw new Error('Azure signing work path cannot contain cmd.exe expansion characters');
      writeFileSync(metadataFile,JSON.stringify(signingPolicy.metadata,null,2)+'\n',{flag:'wx'});
      packArgs.push('--azureTrustedSignFile',metadataFile);
    } else packArgs.push('--signParams',signingPolicy.signParams);
    packArgs.push('--signParallel','1');
  }
  const packLog = text(execute(tool.command,packArgs,300000));
  // The upstream compatibility checker logs some failures without failing pack.
  if (!/Verified VelopackApp\.Run\(\)/.test(packLog) || /Unable to verify VelopackApp|Velopack library version is (?:greater|lower)/.test(packLog))
    throw new Error('Velopack did not verify the pinned startup hook in the actual executable');
  const fullName = `Zero-${version}-full.nupkg`, packageFile = path.join(packageDirectory,fullName);
  const packageBytes = readFileSync(packageFile);
  const contents = unzipSync(packageBytes);
  const appName = 'lib/app/Zero.exe', updaterName = 'lib/app/Squirrel.exe', stubName = 'lib/app/Zero_ExecutionStub.exe';
  for (const name of [appName,updaterName,stubName]) {
    if (!contents[name]) throw new Error(`Windows package is missing ${name}`);
    pe(Buffer.from(contents[name]),name);
  }
  if (Buffer.from(contents[appName]).indexOf(kit) < 0) throw new Error('Windows update package lost the measured embedded kit');
  const nuspecNames = Object.keys(contents).filter(name => name.endsWith('.nuspec'));
  if (nuspecNames.length !== 1) throw new Error('Windows update package requires one manifest');
  const manifest = Buffer.from(contents[nuspecNames[0]]).toString('utf8');
  for (const [key,value] of Object.entries({id:'Zero',version,mainExe:'Zero.exe',channel:'win',shortcutLocations:'StartMenuRoot',os:'win',rid:'win-x64',osMinVersion:'10.0.19041',machineArchitecture:'x64'}))
    if (!manifest.includes(`<${key}>${value}</${key}>`)) throw new Error(`Windows package manifest has unexpected ${key}`);
  if (/<runtimeDependencies>[^<]+<\/runtimeDependencies>/.test(manifest)) throw new Error('Windows package must not bootstrap privileged runtime prerequisites');
  const index = JSON.parse(readFileSync(path.join(packageDirectory,'releases.win.json'),'utf8'));
  const full = index.Assets?.find(asset => asset.FileName === fullName);
  if (!full || full.PackageId !== 'Zero' || full.Version !== version || full.Type !== 'Full' || full.Size !== packageBytes.length || full.SHA256?.toLowerCase() !== digest(packageBytes)) throw new Error('Velopack index does not match the measured full package');
  const setupCandidates = readdirSync(packageDirectory).filter(name => /-Setup\.exe$/.test(name));
  if (setupCandidates.length !== 1) throw new Error('Expected exactly one Windows Setup executable');
  const setupFile = path.join(packageDirectory,setupCandidates[0]), setupBytes = readFileSync(setupFile);
  pe(setupBytes,'Windows Setup');
  if (setupBytes.indexOf(packageBytes) < 0) throw new Error('Windows Setup must embed the exact measured full update package');
  let authenticodeSigned = false, signing;
  if (production) {
    const verifier = path.join(work,'verify-authenticode.ps1'); writeFileSync(verifier,windowsSignatureVerifier,{flag:'wx'});
    const signatureTargets = [{target:setupFile,file:path.basename(setupFile),policy:signingPolicy}];
    const expectedPeNames = [appName,updaterName,stubName,'lib/app/Velopack.dll','lib/app/Newtonsoft.Json.dll'].sort();
    const packagedPeNames = Object.keys(contents).filter(name => /\.(exe|dll)$/i.test(name) || (contents[name].length >= 2 && contents[name][0] === 0x4d && contents[name][1] === 0x5a)).sort();
    if (JSON.stringify(packagedPeNames) !== JSON.stringify(expectedPeNames)) throw new Error('Windows package contains missing or unexpected packaged PE files');

    for (const name of [appName,updaterName,stubName,'lib/app/Velopack.dll','lib/app/Newtonsoft.Json.dll']) {
      if (!contents[name]) throw new Error(`Signed Windows package is missing ${name}`);
      pe(Buffer.from(contents[name]),name);
      let policy = signingPolicy;
      if (name === 'lib/app/Newtonsoft.Json.dll') {
        // Locked Newtonsoft.Json 13.0.4 is already signed by Json.NET. vpk
        // preserves trusted upstream signatures; require the exact published DLL
        // and its upstream signer instead of pretending we re-signed it.
        if (!Buffer.from(contents[name]).equals(readFileSync(path.join(publishedDirectory,'Newtonsoft.Json.dll')))) throw new Error('Windows package changed the upstream Newtonsoft.Json dependency');
        policy = {expectedThumbprint:NEWTONSOFT_SIGNER_SHA1};
      }
      const target = path.join(work,`signature-${path.basename(name)}`); writeFileSync(target,contents[name],{flag:'wx'});
      signatureTargets.push({target,file:name,policy});
    }
    const signatures = signatureTargets.map(({target,file,policy}) => {
      const args = ['-NoProfile','-NonInteractive','-File',verifier,'-Target',target];
      if (policy.expectedThumbprint) args.push('-ExpectedThumbprint',policy.expectedThumbprint);
      if (policy.expectedSubject) args.push('-ExpectedSubject',policy.expectedSubject);
      const result = execute('powershell.exe',args,60000);
      return readWindowsSignatureResult(result?.stdout,policy,file);
    });
    signing = {mode:signingPolicy.mode,thumbprint:signatures[0].thumbprint,subject:signatures[0].subject,
      thumbprints:[...new Set(signatures.map(signature => signature.thumbprint))].sort(),signatures,
      ...(signingPolicy.expectedSubject ? {expectedSubject:signingPolicy.expectedSubject,metadataSha256:digest(Buffer.from(JSON.stringify(signingPolicy.metadata)))} : {})};
    authenticodeSigned = true;
  }
  const fields = {platform:'windows',architectures:['x64'],runtime:'.NET Framework 4.8',minimumOS:'Windows 10 build 19041',packageId:'Zero',mainExe:'Zero.exe',velopackVersion:VELOPACK_VERSION,hookVerified:true,updaterEnabled:config.enabled,authenticodeSigned,nativeWindowsTested:false};
  const assets = [{source:setupFile,filename:`Zero-Setup-${version}-windows${production ? '' : '-development'}.exe`,kind:'installer'}, {source:packageFile,filename:fullName,kind:'update-package'}];
  for (const {filename} of assets) if (existsSync(path.join(output,filename))) throw new Error(`Refusing to replace an existing Windows artifact: ${filename}`);
  const artifacts = assets.map(({source,filename,kind}) => {
    const destination = path.join(output,filename);
    const bytes = readFileSync(source); copyFileSync(source,destination);
    return {filename,size:bytes.length,sha256:digest(bytes),kind,...fields};
  });
  return {artifacts,...fields,...(signing ? {signing} : {}),publishedDirectory,packageDirectory,kit:{size:kit.length,sha256:digest(kit)},updaterConfigSha256:digest(readFileSync(updaterFile)),untrustedIndex:path.join(packageDirectory,'releases.win.json')};
}
