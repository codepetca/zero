import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';

export const feasibilityIdentity = Object.freeze({
  name:'Zero.MsixFeasibility', publisher:'CN=Zero MSIX Feasibility',
  displayName:'Zero MSIX Feasibility', applicationId:'Zero',
  minimumOS:'10.0.19041.0', maxVersionTested:'10.0.26100.0'
});
export const storeIdentity = Object.freeze({
  name:'Codepet.zerostudio', publisher:'CN=DC9AEBC0-4CAE-4681-9E52-20B0B1C14919',
  displayName:'Zero Studio', publisherDisplayName:'Codepet', applicationId:'Zero',
  packageFamilyName:'Codepet.zerostudio_g62pw1js6rhjp',
  minimumOS:'10.0.19041.0', maxVersionTested:'10.0.26100.0'
});
export const msixLogos = Object.freeze({
  'Assets/StoreLogo.png':50, 'Assets/Square44x44Logo.png':44, 'Assets/Square150x150Logo.png':150
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function msixVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      version.split('.').some(value => Number(value) > 65534) || Number(version.split('.')[0]) > 65533) throw new Error('Store mapping requires a major between 0 and 65533 and minor/patch between 0 and 65534');
  // The mapped version is also used by .NET AssemblyVersion (max65534).
  // Store major must be positive, even while Zero uses 0.x versions. Offset
  // every major consistently so 0.x -> 1.x and 1.x -> 2.x remain monotonic.
  // The fourth component is reserved for the Store and must be zero.
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major + 1}.${minor}.${patch}.0`;
}

export function msixManifest(version, identity = feasibilityIdentity) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap rescap">
 <Identity Name="${identity.name}" Publisher="${identity.publisher}" Version="${msixVersion(version)}" ProcessorArchitecture="x64" />
 <Properties>
  <DisplayName>${identity.displayName}</DisplayName>
  <PublisherDisplayName>${identity.publisherDisplayName || 'Zero feasibility build'}</PublisherDisplayName>
  <Description>Local Java teaching kit</Description>
  <Logo>Assets\\StoreLogo.png</Logo>
 </Properties>
 <Resources><Resource Language="en-US" /></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="${identity.minimumOS}" MaxVersionTested="${identity.maxVersionTested}" /></Dependencies>
 <Applications>
  <Application Id="${identity.applicationId}" Executable="Zero.exe" EntryPoint="Windows.FullTrustApplication">
   <uap:VisualElements DisplayName="${identity.displayName}" Description="Local Java teaching kit"
    BackgroundColor="transparent" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
  </Application>
 </Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
`;
}

// This checks the measured local package in addition to the SDK's schema and
// package validation. It is not Windows installation or Store certification.
export function verifyMsixArchive(bytes, {version, files, kit, identity = feasibilityIdentity}) {
  const archive = unzipSync(bytes);
  const expected = [...Object.keys(files),'AppxBlockMap.xml','[Content_Types].xml'].sort();
  const actual = Object.keys(archive).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('MSIX package file inventory differs from the staged payload');
  if (Buffer.from(archive['AppxManifest.xml']).toString('utf8') !== msixManifest(version, identity)) throw new Error('MSIX package identity/manifest differs from the feasibility contract');
  for (const [name, contents] of Object.entries(files)) {
    if (!Buffer.from(archive[name]).equals(contents)) throw new Error(`MSIX changed staged bytes: ${name}`);
  }
  const exe = Buffer.from(archive['Zero.exe']);
  if (exe.length < 64 || exe.readUInt16LE(0) !== 0x5a4d) throw new Error('MSIX launcher is not a Windows PE');
  const offset = exe.readUInt32LE(0x3c);
  if (offset > exe.length - 6 || exe.readUInt32LE(offset) !== 0x00004550) throw new Error('MSIX launcher PE header is invalid');
  if (exe.readUInt16LE(offset + 4) !== 0x8664) throw new Error('MSIX launcher must be an x64 PE matching the package architecture');
  if (exe.indexOf(kit) < 0) throw new Error('MSIX launcher lost its measured embedded kit');
  const blockMap = Buffer.from(archive['AppxBlockMap.xml']).toString('utf8');
  if (!blockMap.includes('HashMethod="http://www.w3.org/2001/04/xmlenc#sha256"')) throw new Error('MSIX block map must use SHA-256');
  const mapped = new Set();
  for (const match of blockMap.matchAll(/<File\s+([^>]+)>([\s\S]*?)<\/File>/g)) {
    const name = /\bName="([^"]+)"/.exec(match[1])?.[1].replaceAll('\\','/');
    const length = Number(/\bSize="(\d+)"/.exec(match[1])?.[1]);
    if (!name || !Object.hasOwn(files,name) || mapped.has(name) || length !== files[name].length) throw new Error('MSIX block map has an unexpected file');
    mapped.add(name);
    const blocks = [...match[2].matchAll(/<Block\s+[^>]*\bHash="([^"]+)"[^>]*\/?\s*>/g)];
    const data = files[name];
    if (blocks.length !== Math.ceil(data.length / 65536)) throw new Error(`MSIX block count mismatch: ${name}`);
    blocks.forEach((block,index) => {
      const hash = createHash('sha256').update(data.subarray(index * 65536,(index + 1) * 65536)).digest('base64');
      if (hash !== block[1]) throw new Error(`MSIX block hash mismatch: ${name}`);
    });
  }
  if (mapped.size !== Object.keys(files).length) throw new Error('MSIX block map does not cover the complete payload');
  return {size:bytes.length,sha256:sha256(bytes),files:Object.entries(files).map(([name,data]) => ({name,size:data.length,sha256:sha256(data)}))};
}
