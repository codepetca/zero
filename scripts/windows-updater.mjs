import {createHash, createPrivateKey, createPublicKey, sign, verify, constants} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const VELOPACK_VERSION = '1.2.161';
const keys = ['schema', 'enabled', 'packageId', 'channel', 'feedUrl', 'publicKeyXml', 'velopackVersion'];
function https(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Updater URLs require HTTPS without credentials or fragments');
  return value;
}
function publicKey(xml) {
  if (typeof xml !== 'string' || !/^<RSAKeyValue><Modulus>[A-Za-z0-9+/=]+<\/Modulus><Exponent>[A-Za-z0-9+/=]+<\/Exponent><\/RSAKeyValue>$/.test(xml)) throw new Error('Expected public RSA XML key');
  const n = xml.match(/<Modulus>([^<]+)</)[1], e = xml.match(/<Exponent>([^<]+)</)[1];
  const key = createPublicKey({key:{kty:'RSA',n:Buffer.from(n,'base64').toString('base64url'),e:Buffer.from(e,'base64').toString('base64url')},format:'jwk'});
  if (key.asymmetricKeyDetails.modulusLength < 3072) throw new Error('Updater RSA key must be at least 3072 bits');
  return key;
}
export function validateWindowsUpdaterConfig(config, {production = false} = {}) {
  if (!config || Object.keys(config).length !== keys.length || keys.some(key => !Object.hasOwn(config,key)) || config.schema !== 1 || typeof config.enabled !== 'boolean' || config.packageId !== 'Zero' || config.channel !== 'win' || config.velopackVersion !== VELOPACK_VERSION) throw new Error('Invalid Windows updater configuration');
  if (production && !config.enabled) throw new Error('Production Windows releases require an authenticated updater');
  if (config.enabled) { https(config.feedUrl); publicKey(config.publicKeyXml); }
  else if (config.feedUrl !== '' || config.publicKeyXml !== '') throw new Error('Disabled development updater must not contain a feed/key');
  return config;
}
export function readWindowsUpdaterConfig(root, options) { return validateWindowsUpdaterConfig(JSON.parse(readFileSync(path.join(root,'release/windows-updater.json'),'utf8')),options); }
export function createWindowsUpdatePayload({version, packageFile, url, channel = 'win'}) {
  const fileName = path.basename(packageFile);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version) || channel !== 'win' || fileName !== `Zero-${version}-full.nupkg`) throw new Error('Expected exact Zero versioned full package');
  const bytes = readFileSync(packageFile);
  if (!bytes.length || bytes.length > 2147483648) throw new Error('Invalid update package size');
  return {schema:1,packageId:'Zero',channel,version,fileName,url:https(url),size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function signWindowsUpdatePayload(payload, privateKeyPem, config) {
  validateWindowsUpdaterConfig(config,{production:true});
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength < 3072) throw new Error('Updater signing requires RSA3072 or stronger');
  const bytes = Buffer.from(JSON.stringify(payload));
  const signature = sign('sha256', bytes, {key:privateKey,padding:constants.RSA_PKCS1_PADDING});
  if (!verify('sha256',bytes,{key:publicKey(config.publicKeyXml),padding:constants.RSA_PKCS1_PADDING},signature)) throw new Error('Signing key does not match the configured public key');
  return {payload:bytes.toString('base64'),signature:signature.toString('base64')};
}

// Signing is explicit and receives an existing key; this tool never creates or provisions credentials.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i=0;i<args.length;i+=2) {
    if (!['--root','--version','--package','--url','--private-key','--output'].includes(args[i]) || !args[i+1] || Object.hasOwn(options,args[i])) throw new Error('Use --root --version --package --url --private-key --output');
    options[args[i]] = args[i+1];
  }
  if (Object.keys(options).length !== 6) throw new Error('Use --root --version --package --url --private-key --output');
  const config = readWindowsUpdaterConfig(options['--root'],{production:true});
  const payload = createWindowsUpdatePayload({version:options['--version'],packageFile:options['--package'],url:options['--url']});
  const envelope = signWindowsUpdatePayload(payload,readFileSync(options['--private-key'],'utf8'),config);
  writeFileSync(options['--output'],`${JSON.stringify(envelope,null,2)}\n`,{flag:'wx'});
}
