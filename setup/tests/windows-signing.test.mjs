import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {validateAzureSigningMetadata,windowsSigningPolicy,parseWindowsSigningArguments,readWindowsSignatureResult,windowsSignatureVerifier} from '../../scripts/windows-signing.mjs';

const metadata = {Endpoint:'https://eus.codesigning.azure.net/',CodeSigningAccountName:'zero-signing',CertificateProfileName:'public-trust'};
const subject = 'CN=Zero Publisher, O=Codepet, C=CA';
test('Azure metadata contains only public account/profile selectors at a regional HTTPS endpoint',()=>{
  assert.deepEqual(validateAzureSigningMetadata(metadata),metadata);
  for(const invalid of [null,[],{}, {...metadata,AccessToken:'secret'}, {...metadata,ExcludeCredentials:[]}, {...metadata,ClientSecret:'secret'}, {...metadata,Endpoint:'https://codesigning.azure.net/'}, {...metadata,Endpoint:'http://eus.codesigning.azure.net/'}, {...metadata,Endpoint:'https://eus.codesigning.azure.net.attacker.example/'}, {...metadata,Endpoint:'https://user@eus.codesigning.azure.net/'}, {...metadata,Endpoint:'https://eus.codesigning.azure.net:443/'}, {...metadata,Endpoint:'https://eus.codesigning.azure.net/path'}, {...metadata,Endpoint:'https://eus.codesigning.azure.net/?token=x'}, {...metadata,CertificateProfileName:'profile\nsecret'}, {...metadata,CodeSigningAccountName:'../other'}])
    assert.throws(()=>validateAzureSigningMetadata(invalid),/Azure signing/);
});
test('Azure policy reads bounded explicit metadata and requires exact X.500 identity',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'zero-signing-')),file=path.join(root,'metadata.json');
  try {
    writeFileSync(file,JSON.stringify(metadata));
    const azureSigning={metadataFile:file,publisherSubject:subject};
    const result=windowsSigningPolicy({azureSigning});assert.equal(result.expectedSubject,subject);assert.deepEqual(result.metadata,metadata);
    for(const publisherSubject of ['', 'Publisher', ' '+subject,subject+' ',subject+'\n',subject+'\0']) assert.throws(()=>windowsSigningPolicy({azureSigning:{...azureSigning,publisherSubject}}),/X.500/);
    assert.throws(()=>windowsSigningPolicy({azureSigning:{...azureSigning,metadataFile:'metadata.json'}}),/absolute/);
    assert.throws(()=>windowsSigningPolicy({azureSigning,certificate:{thumbprint:'A'.repeat(40),timestampUrl:'https://timestamp.example'}}),/exactly one/);
    const link=path.join(root,'linked.json');symlinkSync(file,link);assert.throws(()=>windowsSigningPolicy({azureSigning:{...azureSigning,metadataFile:link}}),/regular JSON/);
    writeFileSync(file,'{');assert.throws(()=>windowsSigningPolicy({azureSigning}),/valid JSON/);
    writeFileSync(file,' '.repeat(16385));assert.throws(()=>windowsSigningPolicy({azureSigning}),/bounded regular/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('Production command selects one complete signing mode without arbitrary templates',()=>{
  assert.deepEqual(parseWindowsSigningArguments(['--azure-signing-metadata','/metadata.json','--publisher-subject',subject]),{azureSigning:{metadataFile:'/metadata.json',publisherSubject:subject}});
  assert.deepEqual(parseWindowsSigningArguments(['--certificate-sha1','A'.repeat(40),'--timestamp-url','https://timestamp.example']),{certificate:{thumbprint:'A'.repeat(40),timestampUrl:'https://timestamp.example'}});
  for(const args of [[],['--signTemplate','command'],['--azure-signing-metadata','/metadata.json'],['--azure-signing-metadata','/metadata.json','--publisher-subject',subject,'--certificate-sha1','A'.repeat(40)]]) assert.throws(()=>parseWindowsSigningArguments(args),/Use --certificate-sha1/);
  for(const timestampUrl of ['http://timestamp.example','https://timestamp.example/?a=x&whoami','https://timestamp.example/%PATH%','https://timestamp.example/!secret!']) assert.throws(()=>windowsSigningPolicy({certificate:{thumbprint:'A'.repeat(40),timestampUrl}}),/HTTPS timestamp/);
});
test('Signature evidence rejects untrusted status, absent timestamp and non-exact publisher while accepting rotation',()=>{
  const policy={expectedSubject:subject},result={status:'Valid',timestamped:true,subject,thumbprint:'B'.repeat(40)};
  const line=value=>'ZERO_AUTHENTICODE_VERIFIED:'+JSON.stringify(value);
  assert.equal(readWindowsSignatureResult(line(result),policy,'Zero.exe').thumbprint,'B'.repeat(40));
  for(const value of [{...result,status:'UnknownError'},{...result,status:'NotTrusted'},{...result,timestamped:false},{...result,subject:subject.toLowerCase()},{...result,thumbprint:'bad'}]) assert.throws(()=>readWindowsSignatureResult(line(value),policy,'Zero.exe'),/did not succeed/);
  for(const stdout of ['ZERO_AUTHENTICODE_VERIFIED',line(result)+'\n'+line(result),'ZERO_AUTHENTICODE_VERIFIED:{']) assert.throws(()=>readWindowsSignatureResult(stdout,policy,'Zero.exe'),/did not succeed/);
  assert.throws(()=>readWindowsSignatureResult(line(result),{expectedThumbprint:'A'.repeat(40)},'Zero.exe'),/did not succeed/);
});

const powerShell = process.env.ZERO_TEST_PWSH || (process.platform === 'win32' ? 'powershell.exe' : undefined);
test('PowerShell verifier executes its identity, trust and timestamp rejection branches with fake Authenticode results',{skip:!powerShell},()=>{
  const root=mkdtempSync(path.join(tmpdir(),'zero-signature-script-'));
  try {
    const verifier=path.join(root,'verify.ps1'),wrapper=path.join(root,'fixture.ps1'),values=path.join(root,'values.json');
    writeFileSync(verifier,windowsSignatureVerifier);
    writeFileSync(wrapper,`param([string]$Values,[string]$ExpectedSubject)
$ErrorActionPreference = 'Stop'
$global:zeroFixtureSignature = Get-Content -LiteralPath $Values -Raw | ConvertFrom-Json
function Get-AuthenticodeSignature { param([string]$LiteralPath) return $global:zeroFixtureSignature }
& (Join-Path $PSScriptRoot 'verify.ps1') -Target 'fake-Zero.exe' -ExpectedSubject $ExpectedSubject
`);
    const expectedSubject='CN=Zéro Publisher, O=Codepet, C=CA';
    const good={Status:'Valid',SignerCertificate:{Subject:expectedSubject,Thumbprint:'B'.repeat(40)},TimeStamperCertificate:{Subject:'Timestamp'}};
    const cases=[good,{...good,Status:'NotTrusted'},{...good,TimeStamperCertificate:null},{...good,SignerCertificate:null},{...good,SignerCertificate:{...good.SignerCertificate,Subject:expectedSubject.toLowerCase()}}];
    for(const [index,value] of cases.entries()) {
      writeFileSync(values,JSON.stringify(value));
      const result=spawnSync(powerShell,['-NoProfile','-NonInteractive','-File',wrapper,'-Values',values,'-ExpectedSubject',expectedSubject],{encoding:'utf8',timeout:20000});
      if(index===0) {assert.equal(result.status,0,result.stderr);assert.equal(readWindowsSignatureResult(result.stdout,{expectedSubject},'Zero.exe').subject,expectedSubject);}
      else {assert.notEqual(result.status,0,`Rejected fixture ${index}`);assert.ok(!result.stdout.includes('ZERO_AUTHENTICODE_VERIFIED:'));}
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});
