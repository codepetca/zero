import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {constants, createPublicKey, verify} from 'node:crypto';
import {readWindowsUpdaterConfig, validateWindowsUpdaterConfig} from '../../scripts/windows-updater.mjs';

const versionPattern = /^\d+\.\d+\.\d+$/;
const fail = message => {throw new Error(`Invalid Windows release: ${message}`);};
function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value,key))) fail('unexpected or missing fields');
}
function boundedAsset(asset, max) {
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > max ||
      typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) fail('bounded measured size and SHA256 required');
}
export function validateWindowsInstallerManifest(manifest, kit) {
  if (manifest === null) return null;
  exactKeys(manifest,['schema','kitVersion','sourceRevision','publication','asset','signing','nativeWindowsTested','updatePackage']);
  exactKeys(manifest.publication,['status','repository','tag']);
  exactKeys(manifest.asset,['filename','platform','architectures','minimumOS','size','sha256','url']);
  exactKeys(manifest.signing,['thumbprint']);
  exactKeys(manifest.updatePackage,['filename','size','sha256','url']);
  const version = manifest.kitVersion;
  if (manifest.schema !== 1 || typeof version !== 'string' || !versionPattern.test(version) ||
      typeof kit?.kitVersion !== 'string' || !versionPattern.test(kit.kitVersion)) fail('version/schema');
  const candidate = version.split('.').map(BigInt), current = kit.kitVersion.split('.').map(BigInt);
  const differing = candidate.findIndex((part,index) => part !== current[index]);
  if (differing !== -1 && candidate[differing] > current[differing]) fail('installer is newer than current kit');
  const publication = manifest.publication;
  if (publication.status !== 'published' || publication.repository !== 'codepetca/zero' || publication.tag !== `windows-v${version}`) fail('published immutable release required');
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceRevision) || !/^[A-Fa-f0-9]{40}$/.test(manifest.signing.thumbprint) || manifest.nativeWindowsTested !== true) fail('source/signing/Windows acceptance required');
  const asset = manifest.asset;
  if (asset.filename !== `Zero-Setup-${version}-windows.exe` || asset.platform !== 'windows' ||
      asset.minimumOS !== '10.0.19041' || JSON.stringify(asset.architectures) !== '["x64"]') fail('Windows x64 installer required');
  boundedAsset(asset,256 * 1024 * 1024);
  boundedAsset(manifest.updatePackage,2 * 1024 * 1024 * 1024);
  if (manifest.updatePackage.filename !== `Zero-${version}-full.nupkg`) fail('exact full update package required');
  for (const item of [asset,manifest.updatePackage]) {
    if (item.url !== `https://github.com/codepetca/zero/releases/download/${publication.tag}/${item.filename}`) fail('exact immutable GitHub asset URL required');
  }
  return manifest;
}
export function windowsInstallerHref(manifest) {
  return manifest?.publication.status === 'published' ? manifest.asset.url : null;
}
async function optionalText(file) {
  try {return await readFile(file,'utf8');}
  catch(error) {if(error.code !== 'ENOENT') throw error; return null;}
}
export async function loadWindowsInstaller(root, kit) {
  const text = await optionalText(resolve(root,'release/windows-installer.json'));
  return text === null ? null : validateWindowsInstallerManifest(JSON.parse(text),kit);
}
function canonicalBase64(value, max) {
  if (typeof value !== 'string' || value.length > max || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('invalid signed envelope encoding');
  const bytes = Buffer.from(value,'base64');
  if (!bytes.length || bytes.toString('base64') !== value) fail('invalid signed envelope encoding');
  return bytes;
}
export function validateWindowsUpdateFeed(text, config, installer, kit) {
  validateWindowsUpdaterConfig(config,{production:true});
  validateWindowsInstallerManifest(installer,kit);
  if (!installer || typeof text !== 'string' || Buffer.byteLength(text,'utf8') > 64 * 1024) fail('published installer and bounded feed required');
  const envelope = JSON.parse(text);
  exactKeys(envelope,['payload','signature']);
  const payloadBytes = canonicalBase64(envelope.payload,24 * 1024);
  const signature = canonicalBase64(envelope.signature,2048);
  const modulus = config.publicKeyXml.match(/<Modulus>([^<]+)</)[1];
  const exponent = config.publicKeyXml.match(/<Exponent>([^<]+)</)[1];
  const key = createPublicKey({key:{kty:'RSA',n:Buffer.from(modulus,'base64').toString('base64url'),e:Buffer.from(exponent,'base64').toString('base64url')},format:'jwk'});
  if (!verify('sha256',payloadBytes,{key,padding:constants.RSA_PKCS1_PADDING},signature)) fail('update signature mismatch');
  const payload = JSON.parse(payloadBytes.toString('utf8'));
  exactKeys(payload,['schema','packageId','channel','version','fileName','url','size','sha256']);
  const asset = installer.updatePackage;
  if (payload.schema !== 1 || payload.packageId !== 'Zero' || payload.channel !== 'win' ||
      payload.version !== installer.kitVersion || payload.fileName !== asset.filename || payload.url !== asset.url ||
      payload.size !== asset.size || payload.sha256 !== asset.sha256) fail('signed package differs from published Windows release');
  return text;
}
export async function loadWindowsUpdateFeed(root, kit, installer) {
  const text = await optionalText(resolve(root,'release/windows-update-feed.json'));
  if (text === null) return null;
  return validateWindowsUpdateFeed(text,readWindowsUpdaterConfig(root),installer,kit);
}
export function publishedWindowsFeedResponse(feed) {
  if (feed === null) return new Response('Windows updates are not available yet.',{status:503,headers:{'Retry-After':'3600','Cache-Control':'no-store'}});
  const bytes = Buffer.from(feed,'utf8');
  return new Response(bytes,{headers:{'Content-Type':'application/json; charset=utf-8','Content-Length':String(bytes.length),'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}
