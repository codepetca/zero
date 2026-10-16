import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {NEWTONSOFT_SIGNER_SHA1} from '../../scripts/windows-signing.mjs';
import {buildWindowsPackage,windowsVpkInvocation} from '../../scripts/windows-package.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function pe(embedded = Buffer.alloc(0)) { const bytes=Buffer.alloc(512); bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(0x80,0x3c); bytes.writeUInt32LE(0x00004550,0x80); return Buffer.concat([bytes,embedded]); }
function fixture({enabled=false,packLog='Verified VelopackApp.Run() in Program.Main',toolVersion='1.2.161',tamperIndex=false,signature=false,extraDll=false,wrongPublisher=false,wrongThumbprint=false,signatureStatus='Valid',timestamped=true,tamperUpstream=false,extraPackagePe=false,rotateSigner=false}={}) {
  const root=mkdtempSync(path.join(tmpdir(),'zero-windows-package-')),work=path.join(root,'work'),output=path.join(root,'output'),kitFile=path.join(root,'kit.zip');
  mkdirSync(work);mkdirSync(path.join(root,'release'));writeFileSync(kitFile,'measured exact kit bytes');
  let publicKeyXml='';
  if(enabled) { const pair=generateKeyPairSync('rsa',{modulusLength:3072}); const jwk=pair.publicKey.export({format:'jwk'}); publicKeyXml=`<RSAKeyValue><Modulus>${Buffer.from(jwk.n,'base64url').toString('base64')}</Modulus><Exponent>${Buffer.from(jwk.e,'base64url').toString('base64')}</Exponent></RSAKeyValue>`; }
  writeFileSync(path.join(root,'release/windows-updater.json'),JSON.stringify({schema:1,enabled,packageId:'Zero',channel:'win',feedUrl:enabled?'https://updates.example/stable.json':'',publicKeyXml,velopackVersion:'1.2.161'}));
  const calls=[];
  const run=(command,args,timeout,options)=>{
    calls.push({command,args,timeout,options});
    if(args.at(-1)==='--help') return {stdout:`Velopack CLI ${toolVersion}, for distributing applications.`};
    if(args[0]==='publish') {
      const published=args[args.indexOf('-o')+1];
      writeFileSync(path.join(published,'Zero.exe'),pe(readFileSync(kitFile)));
      for(const name of ['Newtonsoft.Json.dll','Velopack.dll',...(extraDll?['Unpinned.dll']:[])]) writeFileSync(path.join(published,name),pe());
      return {stdout:'Build succeeded'};
    }
    if(args.includes('pack')) {
      const directory=args[args.indexOf('--outputDir')+1],version=args[args.indexOf('--packVersion')+1];
      const manifest=`<package><metadata><id>Zero</id><version>${version}</version><mainExe>Zero.exe</mainExe><channel>win</channel><shortcutLocations>StartMenuRoot</shortcutLocations><os>win</os><rid>win-x64</rid><osMinVersion>10.0.19041</osMinVersion><machineArchitecture>x64</machineArchitecture><runtimeDependencies></runtimeDependencies></metadata></package>`;
      const contents={'Zero.nuspec':strToU8(manifest),'lib/app/Zero.exe':pe(readFileSync(kitFile)),'lib/app/Squirrel.exe':pe(),'lib/app/Zero_ExecutionStub.exe':pe(),'lib/app/Velopack.dll':pe(),'lib/app/Newtonsoft.Json.dll':pe()};
      if(tamperUpstream) contents['lib/app/Newtonsoft.Json.dll']=pe(Buffer.from('modified'));
      if(extraPackagePe) contents['lib/app/Unexpected.dll']=pe();
      const bytes=Buffer.from(zipSync(contents)),fileName=`Zero-${version}-full.nupkg`;
      writeFileSync(path.join(directory,fileName),bytes);writeFileSync(path.join(directory,'Zero-win-Setup.exe'),pe(bytes));
      writeFileSync(path.join(directory,'releases.win.json'),JSON.stringify({Assets:[{PackageId:'Zero',Version:version,Type:'Full',FileName:fileName,Size:bytes.length,SHA256:tamperIndex?'0'.repeat(64):hash(bytes)}]}));
      return {stdout:packLog};
    }
    if(command==='powershell.exe') {
      if (!signature) return {stdout:'invalid'};
      const target=args[args.indexOf('-Target')+1],upstream=target.endsWith('Newtonsoft.Json.dll');
      const subject=wrongPublisher?'CN=Wrong publisher':args.includes('-ExpectedSubject')?args[args.indexOf('-ExpectedSubject')+1]:upstream?'CN=Json.NET (.NET Foundation)':'CN=Zero Publisher';
      const thumbprint=wrongThumbprint?'F'.repeat(40):upstream?NEWTONSOFT_SIGNER_SHA1:rotateSigner&&target.endsWith('Zero.exe')?'B'.repeat(40):'A'.repeat(40);
      return {stdout:'ZERO_AUTHENTICODE_VERIFIED:'+JSON.stringify({status:signatureStatus,timestamped,subject,thumbprint})};
    }
    throw new Error(`Unexpected process ${command} ${args.join(' ')}`);
  };
  return {root,work,output,kitFile,calls,run,options:{root,work,output,kitFile,version:'0.5.18',run,platform:'darwin',env:{ZERO_WINDOWS_DOTNET:'/pinned/dotnet',ZERO_WINDOWS_VPK_DLL:'/pinned/vpk.dll'}},cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('Windows development cross-package forces disabled updater, verifies hook, emits measured Setup and full package',()=>{
  const f=fixture({enabled:true});try {
    const result=buildWindowsPackage(f.options),pack=f.calls.find(call=>call.args.includes('pack'));
    assert.deepEqual(result.artifacts.map(asset=>asset.kind),['installer','update-package']);
    assert.equal(result.hookVerified,true);assert.equal(result.authenticodeSigned,false);assert.equal(result.updaterEnabled,false);assert.equal(result.nativeWindowsTested,false);
    assert.equal(JSON.parse(readFileSync(path.join(f.work,'windows-updater-build.json'))).enabled,false);
    assert.ok(pack.args.includes('[win]'));assert.equal(pack.args[pack.args.indexOf('--packId')+1],'Zero');assert.equal(pack.args[pack.args.indexOf('--mainExe')+1],'Zero.exe');
    assert.equal(pack.args[pack.args.indexOf('--runtime')+1],'win10.0.19041-x64');assert.ok(pack.args.includes('--noPortable'));assert.ok(!pack.args.includes('--skipVeloAppCheck'));assert.ok(!pack.args.includes('--signParams'));
    assert.equal(result.artifacts[0].sha256,hash(readFileSync(path.join(f.output,result.artifacts[0].filename))));
    assert.ok(!readdirSync(f.output).some(name=>name.endsWith('.json')),'Unsigned vpk index is not a trusted published feed');
    assert.ok(f.calls.every(call=>call.options.capture));
  } finally {f.cleanup();}
});
test('Windows production packaging requires Windows, enabled key/feed and narrowly specified existing certificate',()=>{
  for(const override of [{production:true},{production:true,platform:'win32'},{certificate:{thumbprint:'bad'}}]) {
    const f=fixture();try {assert.throws(()=>buildWindowsPackage({...f.options,...override}),/requires Windows|certificate thumbprint|only for explicit production/);assert.equal(f.calls.length,0);}finally{f.cleanup();}
  }
  const f=fixture();try { assert.throws(()=>buildWindowsPackage({...f.options,production:true,platform:'win32',certificate:{thumbprint:'A'.repeat(40),timestampUrl:'https://timestamp.example'}}),/authenticated updater/);assert.equal(f.calls.length,0); }finally{f.cleanup();}
});
test('Windows production signed=true only follows all actual certificate verification results',()=>{
  for(const signature of [true,false]) {
    const f=fixture({enabled:true,signature});try {
      const options={...f.options,production:true,platform:'win32',certificate:{thumbprint:'A'.repeat(40),timestampUrl:'https://timestamp.example'}};
      if(signature){const result=buildWindowsPackage(options);assert.equal(result.authenticodeSigned,true);assert.equal(f.calls.filter(call=>call.command==='powershell.exe').length,6);assert.equal(result.nativeWindowsTested,false);}
      else {assert.throws(()=>buildWindowsPackage(options),/signature verification did not succeed/);assert.deepEqual(readdirSync(f.output),[]);}
      const pack=f.calls.find(call=>call.args.includes('pack'));assert.match(pack.args[pack.args.indexOf('--signParams')+1],/^\/sha1 A{40} \/fd SHA256 \/tr https:\/\/timestamp.example \/td SHA256$/);
    }finally{f.cleanup();}
  }
});
test('Windows packaging rejects unverified startup hook, mismatched tool/dependencies/package metadata and existing artifacts',()=>{
  for(const options of [{packLog:'Unable to verify VelopackApp'},{toolVersion:'1.2.0'},{tamperIndex:true},{extraDll:true}]) {
    const f=fixture(options);try {assert.throws(()=>buildWindowsPackage(f.options),/startup hook|pinned Velopack|index does not match|runtime dependencies/);}finally{f.cleanup();}
  }
  const f=fixture();try {mkdirSync(f.output);writeFileSync(path.join(f.output,'Zero-0.5.18-full.nupkg'),'existing immutable');assert.throws(()=>buildWindowsPackage(f.options),/Refusing to replace/);assert.deepEqual(readdirSync(f.output),['Zero-0.5.18-full.nupkg']);}finally{f.cleanup();}
});
test('Windows package tool overrides are absolute and do not install global tools',()=>{
  assert.deepEqual(windowsVpkInvocation({}),{command:'dotnet',prefix:['tool','run','vpk','--']});
  assert.throws(()=>windowsVpkInvocation({ZERO_WINDOWS_DOTNET:'relative'}),/absolute/);
  assert.throws(()=>windowsVpkInvocation({ZERO_WINDOWS_DOTNET:'/private/dotnet'}),/requires ZERO_WINDOWS_VPK_DLL/);
  assert.throws(()=>windowsVpkInvocation({ZERO_WINDOWS_VPK_DLL:'vpk.dll'}),/absolute/);
});
test('Windows package subprocesses strip ambient VPK command and policy overrides',()=>{
  const f=fixture();try {
    buildWindowsPackage({...f.options,env:{...f.options.env,PATH:'/allowed/path',VPK_SIGN_TEMPLATE:'unapproved command',VPK_SKIP_VELO_APP_CHECK:'true',vpk_no_inst:'true'}});
    for(const call of f.calls){assert.equal(call.options.env.PATH,'/allowed/path');assert.ok(!Object.keys(call.options.env).some(name=>name.toUpperCase().startsWith('VPK_')));}
  }finally{f.cleanup();}
});

function azureOptions(f) {
  const metadataFile=path.join(f.root,'metadata.json');
  writeFileSync(metadataFile,JSON.stringify({Endpoint:'https://eus.codesigning.azure.net/',CodeSigningAccountName:'zero-signing',CertificateProfileName:'public-trust'}));
  return {...f.options,production:true,platform:'win32',azureSigning:{metadataFile,publisherSubject:'CN=Zero Publisher, O=Codepet, C=CA'}};
}
test('Azure packaging uses the pinned built-in signer with a validated public metadata snapshot and records rotating identities',()=>{
  const f=fixture({enabled:true,signature:true,rotateSigner:true});try {
    const options=azureOptions(f),result=buildWindowsPackage(options),pack=f.calls.find(call=>call.args.includes('pack'));
    assert.equal(result.authenticodeSigned,true);assert.equal(result.signing.mode,'azure-artifact-signing');
    assert.equal(result.signing.subject,options.azureSigning.publisherSubject);assert.equal(result.signing.thumbprint,'A'.repeat(40));
    assert.deepEqual(result.signing.thumbprints,[NEWTONSOFT_SIGNER_SHA1,'A'.repeat(40),'B'.repeat(40)].sort());
    assert.equal(result.signing.signatures.length,6);assert.equal(result.signing.signatures.filter(value=>value.subject===options.azureSigning.publisherSubject).length,5);
    assert.ok(!pack.args.includes('--signParams'));assert.ok(!pack.args.includes('--signTemplate'));
    const snapshot=pack.args[pack.args.indexOf('--azureTrustedSignFile')+1];assert.notEqual(snapshot,options.azureSigning.metadataFile);
    assert.deepEqual(JSON.parse(readFileSync(snapshot,'utf8')),JSON.parse(readFileSync(options.azureSigning.metadataFile,'utf8')));
    const checks=f.calls.filter(call=>call.command==='powershell.exe');assert.equal(checks.filter(call=>call.args.includes('-ExpectedSubject')).length,5);
    assert.equal(checks.at(-1).args[checks.at(-1).args.indexOf('-ExpectedThumbprint')+1],NEWTONSOFT_SIGNER_SHA1);
    const script=readFileSync(path.join(f.work,'verify-authenticode.ps1'),'utf8');
    assert.match(script,/Get-AuthenticodeSignature -LiteralPath/);assert.match(script,/Status -ne 'Valid'/);assert.match(script,/TimeStamperCertificate/);assert.match(script,/subject -cne \$ExpectedSubject/);
  } finally {f.cleanup();}
});
test('Azure packaging rejects wrong publisher, invalid trust, missing timestamps and unexpected upstream identity or bytes',()=>{
  for(const overrides of [{wrongPublisher:true},{signatureStatus:'NotTrusted'},{timestamped:false},{wrongThumbprint:true},{tamperUpstream:true},{extraPackagePe:true}]) {
    const f=fixture({enabled:true,signature:true,...overrides});try {
      assert.throws(()=>buildWindowsPackage(azureOptions(f)),/signature verification did not succeed|upstream Newtonsoft.Json|unexpected packaged PE/);
      assert.deepEqual(readdirSync(f.output),[]);
    } finally {f.cleanup();}
  }
});
