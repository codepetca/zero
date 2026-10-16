import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,constants} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readWindowsUpdaterConfig,validateWindowsUpdaterConfig,createWindowsUpdatePayload,signWindowsUpdatePayload,VELOPACK_VERSION} from '../../scripts/windows-updater.mjs';

test('Windows production updater pins stable Velopack and the provisioned stable trust key', () => {
  const config = readWindowsUpdaterConfig(path.resolve(import.meta.dirname,'../..'),{production:true});
  assert.equal(config.velopackVersion,VELOPACK_VERSION);
  assert.equal(config.enabled,true);
  assert.equal(config.feedUrl,'https://zero.codepet.ca/updates/windows/stable.json');
  assert.throws(() => validateWindowsUpdaterConfig({...config,enabled:false,feedUrl:'',publicKeyXml:''},{production:true}),/authenticated updater/);
});
test('Windows update descriptor authenticates complete package bytes with exact matching RSA key', () => {
  const directory = mkdtempSync(path.join(tmpdir(),'zero-sign-update-'));
  try {
    const pair = generateKeyPairSync('rsa',{modulusLength:3072});
    const jwk = pair.publicKey.export({format:'jwk'});
    const xml = `<RSAKeyValue><Modulus>${Buffer.from(jwk.n,'base64url').toString('base64')}</Modulus><Exponent>${Buffer.from(jwk.e,'base64url').toString('base64')}</Exponent></RSAKeyValue>`;
    const config = {schema:1,enabled:true,packageId:'Zero',channel:'win',feedUrl:'https://updates.example/windows.json',publicKeyXml:xml,velopackVersion:VELOPACK_VERSION};
    const packageFile = path.join(directory,'Zero-0.5.99-full.nupkg'); writeFileSync(packageFile,'full kit bytes');
    const payload = createWindowsUpdatePayload({version:'0.5.99',packageFile,url:'https://example.test/Zero-0.5.99-full.nupkg'});
    const envelope = signWindowsUpdatePayload(payload,pair.privateKey.export({format:'pem',type:'pkcs8'}),config);
    assert.equal(verify('sha256',Buffer.from(envelope.payload,'base64'),{key:pair.publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(envelope.signature,'base64')),true);
    assert.equal(verify('sha256',Buffer.from(`${envelope.payload}changed`),pair.publicKey,Buffer.from(envelope.signature,'base64')),false);
    assert.throws(() => createWindowsUpdatePayload({version:'0.5.99',packageFile,url:'http://example.test/package'}),/HTTPS/);
    assert.throws(() => validateWindowsUpdaterConfig({...config,publicKeyXml:xml.replace('<Modulus>','<D>')}),/public RSA/);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
