import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync} from 'fflate';
import {msixVersion,msixManifest,verifyMsixArchive,storeIdentity} from './windows-msix.mjs';

const version='0.5.47';
function fixture() {
  const kit=Buffer.from('measured teaching kit'), exe=Buffer.alloc(150000);
  exe.writeUInt16LE(0x5a4d); exe.writeUInt32LE(64,0x3c); exe.writeUInt32LE(0x00004550,64); kit.copy(exe,100);
  const files={'Zero.exe':exe,'AppxManifest.xml':Buffer.from(msixManifest(version))};
  const members={...files,'[Content_Types].xml':Buffer.from('<Types/>')};
  members['AppxBlockMap.xml']=Buffer.from(`<BlockMap HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">${Object.entries(files).map(([name,data]) => {
    const blocks=[];
    for(let offset=0;offset<data.length;offset+=65536) blocks.push(`<Block Hash="${createHash('sha256').update(data.subarray(offset,offset+65536)).digest('base64')}"/>`);
    return `<File Name="${name}" Size="${data.length}">${blocks.join('')}</File>`;
  }).join('')}</BlockMap>`);
  return {files,kit,members,bytes:zipSync(members)};
}
test('Store version uses reserved zero component and rejects invalid/overflowing versions',() => {
  assert.equal(msixVersion(version),'1.5.47.0');
  assert.equal(msixVersion('65533.65534.65534'),'65534.65534.65534.0');
  for(const value of ['65534.0.0','0.65535.0','0.0.65535','65535.0.0','1.2','1.2.3.4','1.2.65536','01.2.3','1.-2.3','1.2.3<script>',null]) assert.throws(() => msixVersion(value));
});
test('Store versions stay ordered across product minor and major boundaries', () => {
  const versions=['0.0.0','0.5.55','0.5.56','0.6.0','1.0.0','2.0.0'];
  const mapped=versions.map(msixVersion).map(v=>v.split('.').map(Number));
  for(const v of mapped) { assert.ok(v[0]>0); assert.equal(v[3],0); }
  for(let i=1;i<mapped.length;i++) {
    const firstDifference=mapped[i].findIndex((v,j)=>v!==mapped[i-1][j]);
    assert.ok(mapped[i][firstDifference]>mapped[i-1][firstDifference]);
  }
  assert.equal(msixVersion('1.0.0'),'2.0.0.0');
});
test('feasibility manifest has a temporary identity, desktop entry point and only full-trust capability',() => {
  const xml=msixManifest(version);
  assert.match(xml,/Name="Zero.MsixFeasibility"/);
  assert.match(xml,/EntryPoint="Windows.FullTrustApplication"/);
  assert.match(xml,/ProcessorArchitecture="x64"/);
  assert.match(xml,/MinVersion="10.0.19041.0"/);
  assert.equal((xml.match(/<rescap:Capability /g)||[]).length,1);
  assert.match(xml,/Name="runFullTrust"/);
});
test('verifier checks exact payload and all 64KiB blocks, including the last partial block',() => {
  const data=fixture();
  assert.equal(verifyMsixArchive(data.bytes,{version,files:data.files,kit:data.kit}).size,data.bytes.length);
  const archive=unzipSync(data.bytes);
  archive['Zero.exe'][149999]=1;
  // A changed stage and archive still cannot evade the original block map.
  assert.throws(() => verifyMsixArchive(zipSync(archive),{version,files:{...data.files,'Zero.exe':Buffer.from(archive['Zero.exe'])},kit:data.kit}),/block hash mismatch/);
});
test('verifier rejects unexpected updater files, changed identity and a missing embedded kit',() => {
  const data=fixture();
  assert.throws(() => verifyMsixArchive(zipSync({...data.members,'Velopack.dll':Buffer.from('unexpected')}),{version,files:data.files,kit:data.kit}),/inventory/);
  assert.throws(() => verifyMsixArchive(data.bytes,{version:'0.5.48',files:data.files,kit:data.kit}),/identity\/manifest/);
  assert.throws(() => verifyMsixArchive(data.bytes,{version,files:data.files,kit:Buffer.from('different kit')}),/embedded kit/);
});

test('production manifest uses the assigned Store identity', () => {
  const xml = msixManifest(version, storeIdentity);
  assert.match(xml, /Name="Codepet\.zerostudio"/);
  assert.match(xml, /Publisher="CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919"/);
  assert.match(xml, /<PublisherDisplayName>Codepet<\/PublisherDisplayName>/);
  assert.match(xml, /DisplayName="Zero Studio"/);
  assert.equal(storeIdentity.packageFamilyName, 'Codepet.zerostudio_g62pw1js6rhjp');
});
