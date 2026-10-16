import assert from 'node:assert/strict';
import {constants,readFileSync,writeFileSync,mkdirSync,lstatSync,openSync,closeSync,renameSync,rmSync,realpathSync} from 'node:fs';
import {createPrivateKey,createPublicKey,generateKeyPairSync,createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readWindowsUpdaterConfig,validateWindowsUpdaterConfig} from './windows-updater.mjs';

export const WINDOWS_FEED_URL = 'https://zero.codepet.ca/updates/windows/stable.json';
export function updaterPublicKey(privateKeyPem) {
  const key=createPrivateKey(privateKeyPem);
  assert.ok(key.asymmetricKeyType==='rsa' && key.asymmetricKeyDetails.modulusLength>=3072,'Expected a private RSA key of at least 3072 bits');
  const publicKey=createPublicKey(key),jwk=publicKey.export({format:'jwk'});
  const publicKeyXml=`<RSAKeyValue><Modulus>${Buffer.from(jwk.n,'base64url').toString('base64')}</Modulus><Exponent>${Buffer.from(jwk.e,'base64url').toString('base64')}</Exponent></RSAKeyValue>`;
  return {publicKeyXml,publicKeySha256:createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex')};
}

// Explicit owner operation, separate from packaging/signing. Private bytes stay
// outside the checkout and are never printed, copied to artifacts or uploaded.
export function provisionWindowsUpdater({root,keyFile}) {
  assert.notEqual(process.platform,'win32','Provision the feed key on a POSIX maintainer host with verifiable private permissions');
  root=realpathSync(root);
  assert.ok(path.isAbsolute(keyFile),'Use an absolute private key path');
  keyFile=path.resolve(keyFile);
  const relative=path.relative(root,keyFile);
  assert.ok(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative),'The private key must be outside the repository');
  const before=readWindowsUpdaterConfig(root);
  const parent=path.dirname(keyFile);
  mkdirSync(parent,{recursive:true,mode:0o700});
  // Resolve parents before checking containment, including symlinked ancestors.
  const actualParent=realpathSync(parent),actualRelative=path.relative(root,actualParent);
  assert.ok(actualRelative.startsWith(`..${path.sep}`) || path.isAbsolute(actualRelative),'Private key directory resolves inside the repository');
  const directory=lstatSync(parent);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && !(directory.mode & 0o077) && directory.uid===process.getuid(),'Private key directory must be owned by this user with mode 0700');
  let key,created=false;
  try {
    const fd=openSync(keyFile,constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat=lstatSync(keyFile);
      assert.ok(stat.isFile() && stat.nlink===1 && stat.uid===process.getuid() && !(stat.mode & 0o077) && stat.size<16384,'Existing key must be a private, single-link, user-owned file (0600)');
      key=readFileSync(fd,'utf8');
    } finally {closeSync(fd);}
  } catch(error) {
    if(error.code!=='ENOENT') throw error;
    assert.equal(before.enabled,false,'An enabled updater already trusts a key; restore that key instead of replacing it');
    key=generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
    writeFileSync(keyFile,key,{flag:'wx',mode:0o600});
    created=true;
  }
  const publicIdentity=updaterPublicKey(key);
  if(before.enabled) {
    assert.equal(before.publicKeyXml,publicIdentity.publicKeyXml,'Existing private key differs from the trusted key; rotation requires a separate migration');
    assert.equal(before.feedUrl,WINDOWS_FEED_URL,'Existing production feed differs from the stable Zero feed');
  }
  const config=validateWindowsUpdaterConfig({...before,enabled:true,feedUrl:WINDOWS_FEED_URL,publicKeyXml:publicIdentity.publicKeyXml},{production:true});
  const target=path.join(root,'release/windows-updater.json'),temporary=`${target}.${randomUUID()}.tmp`;
  try {writeFileSync(temporary,JSON.stringify(config,null,2)+'\n',{flag:'wx'});renameSync(temporary,target);}
  finally {rmSync(temporary,{force:true});}
  return {created,keyFile,feedUrl:config.feedUrl,publicKeySha256:publicIdentity.publicKeySha256};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  assert.ok(args.length===4 && args[0]==='--root' && args[2]==='--private-key','Use --root <repository> --private-key <absolute private file outside repository>');
  console.log(JSON.stringify(provisionWindowsUpdater({root:args[1],keyFile:args[3]}),null,2));
}
