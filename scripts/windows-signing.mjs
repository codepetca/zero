import {readFileSync,lstatSync} from 'node:fs';
import path from 'node:path';

const sha1 = /^[A-Fa-f0-9]{40}$/;
export const NEWTONSOFT_SIGNER_SHA1 = '1A9FF7E5BDC4E3E5E2F14E4B2DA6029C5AE58DBF';

function absoluteFile(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\r\n\0]/.test(value)) throw new Error('Azure signing metadata must be an absolute JSON file path');
  const stat = lstatSync(value);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error('Azure signing metadata must be a bounded regular JSON file');
  return value;
}
export function validateAzureSigningMetadata(value) {
  const keys = ['CertificateProfileName','CodeSigningAccountName','Endpoint'];
  if (!value || Array.isArray(value) || typeof value !== 'object' || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys))
    throw new Error('Azure signing metadata accepts only Endpoint, CodeSigningAccountName and CertificateProfileName; credentials must be supplied separately');
  if (typeof value.Endpoint !== 'string' || !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.codesigning\.azure\.net\/?$/.test(value.Endpoint))
    throw new Error('Azure signing Endpoint must be an HTTPS regional codesigning.azure.net endpoint');
  for (const key of ['CodeSigningAccountName','CertificateProfileName'])
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(value[key])) throw new Error(`Invalid Azure signing ${key}`);
  return {...value};
}
export function windowsSigningPolicy({certificate,azureSigning} = {}) {
  if (certificate && azureSigning) throw new Error('Select exactly one Windows signing method');
  if (azureSigning) {
    const subject = azureSigning.publisherSubject;
    if (typeof subject !== 'string' || subject !== subject.trim() || subject.length > 4096 || /[\x00-\x1f\x7f]/.test(subject) || !/^(?:[A-Za-z][A-Za-z0-9.]*|[0-9]+(?:\.[0-9]+)+)=.+/.test(subject))
      throw new Error('Azure signing requires the exact publisher X.500 subject');
    const metadataFile = absoluteFile(azureSigning.metadataFile);
    let metadata;
    try { metadata = JSON.parse(readFileSync(metadataFile,'utf8')); } catch { throw new Error('Azure signing metadata must contain valid JSON'); }
    return {mode:'azure-artifact-signing',expectedSubject:subject,metadata:validateAzureSigningMetadata(metadata)};
  }
  if (!certificate || !sha1.test(certificate.thumbprint || '')) throw new Error('Production Windows packaging requires an existing certificate thumbprint or Azure signing metadata');
  const url = certificate.timestampUrl;
  // vpk 1.2 invokes signtool through cmd.exe. Limit URL characters so the
  // certificate option cannot introduce shell expansion/operators.
  if (typeof url !== 'string' || !/^https:\/\/[A-Za-z0-9][A-Za-z0-9./?=_-]*$/.test(url)) throw new Error('Production Windows signing requires a shell-safe HTTPS timestamp URL');
  const parsed = new URL(url);
  if (!parsed.hostname || parsed.username || parsed.password || parsed.hash) throw new Error('Invalid timestamp URL');
  const expectedThumbprint = certificate.thumbprint.toUpperCase();
  return {mode:'certificate',expectedThumbprint,signParams:`/sha1 ${expectedThumbprint} /fd SHA256 /tr ${url} /td SHA256`};
}
export function parseWindowsSigningArguments(args) {
  if (args.length === 4 && args[0] === '--certificate-sha1' && args[2] === '--timestamp-url')
    return {certificate:{thumbprint:args[1],timestampUrl:args[3]}};
  if (args.length === 4 && args[0] === '--azure-signing-metadata' && args[2] === '--publisher-subject')
    return {azureSigning:{metadataFile:args[1],publisherSubject:args[3]}};
  throw new Error('Use --certificate-sha1 <existing 40-hex thumbprint> --timestamp-url <HTTPS timestamp service>, or --azure-signing-metadata <absolute JSON file> --publisher-subject <exact X.500 subject>');
}

export const windowsSignatureVerifier = `param([Parameter(Mandatory=$true)][string]$Target,[string]$ExpectedThumbprint,[string]$ExpectedSubject)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$signature = Get-AuthenticodeSignature -LiteralPath $Target
if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) { throw 'Expected a valid timestamped Authenticode signature.' }
$subject = $signature.SignerCertificate.Subject
$thumbprint = $signature.SignerCertificate.Thumbprint.ToUpperInvariant()
if ($ExpectedThumbprint -and $thumbprint -cne $ExpectedThumbprint) { throw 'Unexpected Authenticode certificate.' }
if ($ExpectedSubject -and $subject -cne $ExpectedSubject) { throw 'Unexpected Authenticode publisher subject.' }
$details = @{status='Valid';subject=$subject;thumbprint=$thumbprint;timestamped=$true} | ConvertTo-Json -Compress
Write-Output ('ZERO_AUTHENTICODE_VERIFIED:' + $details)
`;

export function readWindowsSignatureResult(stdout,policy,file) {
  const lines = String(stdout || '').split(/\r?\n/).filter(line => line.startsWith('ZERO_AUTHENTICODE_VERIFIED:'));
  let value;
  try { if (lines.length === 1) value = JSON.parse(lines[0].slice('ZERO_AUTHENTICODE_VERIFIED:'.length)); } catch {}
  if (!value || value.status !== 'Valid' || value.timestamped !== true || !sha1.test(value.thumbprint || '') || typeof value.subject !== 'string' || !value.subject ||
      (policy.expectedSubject && value.subject !== policy.expectedSubject) || (policy.expectedThumbprint && value.thumbprint.toUpperCase() !== policy.expectedThumbprint))
    throw new Error(`Windows signature verification did not succeed: ${file}`);
  return {file,status:'Valid',subject:value.subject,thumbprint:value.thumbprint.toUpperCase(),timestamped:true};
}
