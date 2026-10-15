import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {macArtifactIdentity} from './mac-artifact.mjs';
import {validateMacUpdaterConfig} from './mac-updater.mjs';

export const updateKeyAccount = 'ca.codepet.zero.updates';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exactKeys = (value, keys) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Unexpected update metadata fields');
const canonicalBase64 = (text, size) => {
  assert.equal(typeof text, 'string');
  const bytes = Buffer.from(text, 'base64');
  assert.equal(bytes.length, size); assert.equal(bytes.toString('base64'), text);
  return bytes;
};
function publicKey(raw) {
  return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'), canonicalBase64(raw,32)]),format:'der',type:'spki'});
}
export function verifyUpdateSignature(bytes, signature, key) {
  assert.ok(verify(null, bytes, publicKey(key), canonicalBase64(signature,64)), 'Invalid Ed25519 update signature');
}
export function verifyFeedSignature(bytes, key) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length < 64 * 1024, 'Bounded feed bytes required');
  const match = bytes.toString('utf8').match(/<!-- sparkle-signatures:\nedSignature: ([A-Za-z0-9+/=]+)\nlength: ([1-9][0-9]*)\n-->\n?$/);
  assert.ok(match, 'Sparkle signed feed trailer required');
  const length = Number(match[2]);
  assert.equal(bytes.indexOf('<!-- sparkle-signatures:'), length, 'Feed signed length must cover all payload bytes');
  assert.equal(bytes.subarray(length).toString('utf8'), match[0], 'Unsigned feed suffix');
  const payload = bytes.subarray(0,length);
  assert.deepEqual(Buffer.from(payload.toString('utf8'),'utf8'),payload,'Feed must be UTF-8');
  verifyUpdateSignature(payload,match[1],key);
  return payload.toString('utf8');
}
function enclosureURL(version) {
  return `https://github.com/codepetca/zero/releases/download/setup-v${version}/${macArtifactIdentity(version).filename}`;
}
function checkedAsset(version, asset) {
  exactKeys(asset,['filename','url','size','sha256','edSignature']);
  assert.equal(asset.filename,macArtifactIdentity(version).filename);
  assert.equal(asset.url,enclosureURL(version));
  assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 128 * 1024 * 1024);
  assert.match(asset.sha256,/^[a-f0-9]{64}$/); canonicalBase64(asset.edSignature,64);
}
function channelBody(manifest, enclosure) {
  return `<channel><title>Zero</title><link>https://zero.codepet.ca</link><description>Zero updates for Mac</description><item><title>Zero ${manifest.kitVersion}</title><pubDate>${new Date(manifest.createdAt).toUTCString()}</pubDate><sparkle:version>${manifest.buildNumber}</sparkle:version><sparkle:shortVersionString>${manifest.kitVersion}</sparkle:shortVersionString><sparkle:minimumSystemVersion>12.0</sparkle:minimumSystemVersion>${enclosure}</item></channel>`;
}
export function createAppcast(manifest) {
  assert.match(manifest.kitVersion,/^\d+\.\d+\.\d+$/);
  assert.ok(Number.isSafeInteger(manifest.buildNumber) && manifest.buildNumber >= 2);
  assert.equal(new Date(manifest.createdAt).toISOString(),manifest.createdAt);
  checkedAsset(manifest.kitVersion,manifest.asset);
  const asset = manifest.asset;
  return `<?xml version="1.0" encoding="utf-8"?><rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">${channelBody(manifest,`<enclosure url="${asset.url}" length="${asset.size}" type="application/octet-stream" sparkle:edSignature="${asset.edSignature}"/>`)}</rss>\n`;
}
// This intentionally accepts only the single-item feed our pinned signing tool
// emits. It is not an XML parser for arbitrary user-authored appcasts.
function verifyFeedContent(payload, manifest) {
  const root = payload.match(/^<\?xml version="1.0" encoding="utf-8"(?: standalone="yes")?\?>(?:<!-- sparkle-sign-warning:[\s\S]*?-->)?<rss xmlns:sparkle="http:\/\/www.andymatuschak.org\/xml-namespaces\/sparkle" version="2.0">([\s\S]*)<\/rss>\n?$/);
  assert.ok(root,'Unexpected signed appcast structure');
  const enclosure = root[1].match(/<enclosure ([^<>]*?)(?:\s*\/>|><\/enclosure>)/g);
  assert.equal(enclosure?.length,1,'Exactly one full DMG enclosure required');
  const attributes = [...enclosure[0].matchAll(/([A-Za-z:]+)="([^"<>]*)"/g)];
  const values = Object.fromEntries(attributes.map(([,key,value]) => [key,value]));
  assert.equal(attributes.length,4);
  exactKeys(values,['url','length','type','sparkle:edSignature']);
  const reconstructed = '<enclosure ' + attributes.map(([,key,value]) => `${key}="${value}"`).join(' ') + '/>';
  assert.equal(enclosure[0].replace(/\s+\/>$/,'/>').replace(/><\/enclosure>$/,'/>'),reconstructed,'Unexpected enclosure syntax');
  assert.deepEqual(values,{url:manifest.asset.url,length:String(manifest.asset.size),type:'application/octet-stream','sparkle:edSignature':manifest.asset.edSignature},'Feed enclosure claims differ from metadata');
  assert.equal(root[1],channelBody(manifest,enclosure[0]),'Feed claims differ from sealed metadata');
}
export function validateMacUpdateFeed(manifest, config, installer, bytes, {allowLocal = false} = {}) {
  validateMacUpdaterConfig(config);
  exactKeys(manifest,['schema','publication','kitVersion','buildNumber','feedURL','publicKeySha256','sourceRevision','createdAt','asset','feed']);
  exactKeys(manifest.publication,['status']); exactKeys(manifest.feed,['filename','size','sha256']);
  assert.equal(manifest.schema,1);
  assert.ok(['local','published'].includes(manifest.publication.status));
  assert.ok(allowLocal || manifest.publication.status === 'published','Unpublished update feed');
  assert.equal(manifest.kitVersion,installer.kitVersion);
  assert.equal(manifest.sourceRevision,installer.sourceRevision); assert.match(manifest.sourceRevision,/^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(manifest.buildNumber) && manifest.buildNumber >= 2 && manifest.buildNumber <= config.buildNumber,'Feed build must be a released native build');
  if (manifest.publication.status === 'local') assert.equal(manifest.buildNumber,config.buildNumber);
  assert.equal(manifest.feedURL,config.feedURL);
  assert.equal(manifest.publicKeySha256,hash(Buffer.from(config.publicKey,'base64')));
  assert.equal(new Date(manifest.createdAt).toISOString(),manifest.createdAt);
  checkedAsset(manifest.kitVersion,manifest.asset);
  for (const key of ['filename','size','sha256']) assert.equal(manifest.asset[key],installer.asset[key],'Update enclosure differs from verified installer');
  if (manifest.publication.status === 'published') {
    assert.equal(installer.publication.status,'published'); assert.equal(manifest.asset.url,installer.asset.url);
  }
  assert.equal(manifest.feed.filename,'appcast.xml');
  assert.equal(manifest.feed.size,bytes.length); assert.equal(manifest.feed.sha256,hash(bytes));
  verifyFeedContent(verifyFeedSignature(bytes,config.publicKey),manifest);
  return manifest;
}
export function verifyUpdateArchive(bytes, manifest, config) {
  assert.equal(bytes.length,manifest.asset.size); assert.equal(hash(bytes),manifest.asset.sha256);
  verifyUpdateSignature(bytes,manifest.asset.edSignature,config.publicKey);
}
export function verifyUpdateBuildOrder(config, version, previous) {
  validateMacUpdaterConfig(config);
  if (!previous) return;
  assert.ok(Number.isSafeInteger(previous.buildNumber) && previous.buildNumber >= 2);
  if (version === previous.kitVersion) {
    assert.equal(config.buildNumber,previous.buildNumber,'A build-number change requires a new immutable kit/app version');
  } else {
    const current=version.split('.').map(BigInt),prior=previous.kitVersion.split('.').map(BigInt);
    assert.equal(current.length,3);assert.equal(prior.length,3);
    const index=current.findIndex((part,i)=>part!==prior[i]);
    assert.ok(index>=0 && current[index]>prior[index],'Native releases must advance kit version');
    assert.ok(config.buildNumber>previous.buildNumber,'Native build number must increase');
  }
}
export function publishedFeedResponse(feed) {
  if (feed === null) return new Response('Updates are not available yet.',{status:404,headers:{'Cache-Control':'no-store'}});
  const bytes = Buffer.from(feed,'utf8');
  return new Response(bytes,{headers:{'Content-Type':'application/rss+xml; charset=utf-8','Content-Length':String(bytes.length),'Cache-Control':'public, max-age=300, s-maxage=300, must-revalidate','X-Content-Type-Options':'nosniff'}});
}
