import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, lstatSync, readdirSync, readlinkSync, cpSync, existsSync} from 'node:fs';
import path from 'node:path';
import {verifyMacSignature} from './installer-signing.mjs';

export const sparklePin = Object.freeze({version:'2.10.0', url:'https://github.com/sparkle-project/Sparkle/releases/download/2.10.0/Sparkle-2.10.0.tar.xz', size:16319840, sha256:'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c'});
export const updaterFeedURL = 'https://zero.codepet.ca/updates/macos/appcast.xml';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function updaterEnabledForVersion(version) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const [major, minor, patch] = version.split('.').map(Number);
  return major > 0 || minor > 5 || (minor === 5 && patch >= 15);
}
export function validateMacUpdaterConfig(value) {
  assert.deepEqual(Object.keys(value).sort(), ['buildNumber','feedURL','publicKey','schema','sparkle']);
  assert.equal(value.schema, 1);
  assert.ok(Number.isSafeInteger(value.buildNumber) && value.buildNumber >= 2, 'Updater build number must be an integer >=2');
  assert.equal(value.feedURL, updaterFeedURL);
  assert.match(value.publicKey, /^[A-Za-z0-9+/]{43}=$/, 'Canonical Ed25519 public key');
  assert.equal(Buffer.from(value.publicKey, 'base64').length, 32);
  assert.equal(Buffer.from(value.publicKey, 'base64').toString('base64'), value.publicKey);
  assert.deepEqual(value.sparkle, sparklePin, 'Sparkle dependency must match reviewed binary pin');
  return value;
}
export function readMacUpdaterConfig(root) { return validateMacUpdaterConfig(JSON.parse(readFileSync(path.join(root, 'release/mac-updater.json'), 'utf8'))); }
export function verifySparkleArchive(bytes, config) {
  assert.equal(bytes.length, config.sparkle.size, 'Pinned Sparkle archive size');
  assert.equal(sha256(bytes), config.sparkle.sha256, 'Pinned Sparkle archive digest');
}
// Validate every tar member before extraction; never permit links outside this archive.
const extractScript = `import tarfile,pathlib,posixpath,sys
archive,destination=sys.argv[1:]
with tarfile.open(archive,'r:xz') as tar:
 members=tar.getmembers(); seen=set(); total=0
 for m in members:
  name=m.name.removeprefix('./'); p=pathlib.PurePosixPath(name)
  assert name and not p.is_absolute() and '..' not in p.parts and '\\\\' not in name and ':' not in name
  assert name not in seen; seen.add(name)
  assert m.isfile() or m.isdir() or m.issym()
  assert not m.mode & 0o7000
  total+=m.size; assert total <= 160*1024*1024
  if m.issym():
   target=posixpath.normpath(posixpath.join(posixpath.dirname(name),m.linkname))
   assert not m.linkname.startswith('/') and target!='..' and not target.startswith('../')
 # Reject any member placed beneath an archive symlink, regardless of ordering.
 links={m.name.removeprefix('./') for m in members if m.issym()}
 for m in members:
  p=pathlib.PurePosixPath(m.name.removeprefix('./'))
  assert not any(str(parent) in links for parent in p.parents)
 tar.extractall(destination, members=members, filter='data')
`;
export function selectSparklePython(run,root,configuredPython=process.env.ZERO_MAC_BUILD_PYTHON) {
  if(configuredPython) assert.ok(path.isAbsolute(configuredPython),'ZERO_MAC_BUILD_PYTHON must be an absolute maintainer Python path');
  const candidates=configuredPython ? [configuredPython] : [path.join(root,'.verification/native-installer/dmg-layout-venv/bin/python'),'/opt/homebrew/bin/python3','/usr/local/bin/python3','python3'];
  for(const candidate of candidates) {
    try {
      run(candidate,['-c',"import sys,inspect,tarfile; assert sys.version_info >= (3,12); assert 'filter' in inspect.signature(tarfile.TarFile.extractall).parameters"]);
      return candidate;
    } catch { /* CLT Python and missing paths are not suitable extraction runtimes. */ }
  }
  throw new Error('Sparkle acquisition requires maintainer Python 3.12+ with safe tar extraction. Set ZERO_MAC_BUILD_PYTHON to its absolute path. Students do not need Python.');
}
export function acquireSparkle(run, root, config) {
  validateMacUpdaterConfig(config);
  const cache = path.join(root, '.verification/sparkle-cache', config.sparkle.sha256);
  mkdirSync(cache, {recursive:true});
  for (const directory of [path.join(root,'.verification'),path.dirname(cache),cache]) {
    const stat = lstatSync(directory); assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Owned Sparkle cache directory');
  }
  const archive = path.join(cache, 'Sparkle.tar.xz');
  if (!existsSync(archive)) {
    const existing = path.join(root, `.verification/sparkle-${config.sparkle.version}/Sparkle-${config.sparkle.version}.tar.xz`);
    if (existsSync(existing)) { const bytes = readFileSync(existing); verifySparkleArchive(bytes, config); writeFileSync(archive, bytes, {flag:'wx'}); }
    else {
      const temporary = path.join(cache, 'download.partial');
      rmSync(temporary, {force:true});
      try {
        run('/usr/bin/curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '20', '--max-time', '180', '--max-filesize', String(config.sparkle.size), '--output', temporary, config.sparkle.url], 200000);
        const bytes = readFileSync(temporary); verifySparkleArchive(bytes, config); writeFileSync(archive, bytes, {flag:'wx'});
      } finally { rmSync(temporary, {force:true}); }
    }
  }
  assert.ok(lstatSync(archive).isFile() && !lstatSync(archive).isSymbolicLink(), 'Owned cached archive');
  verifySparkleArchive(readFileSync(archive), config);
  // Re-extract authenticated bytes, so an altered old extraction can never enter a build.
  const directory = mkdtempSync(path.join(cache, 'distribution-'));
  try {
    run(selectSparklePython(run,root), ['-c', extractScript, archive, directory]);
    const framework = path.join(directory, 'Sparkle.framework');
    verifySparkleLayout(run, framework, config);
    const source = {...config.sparkle, frameworkManifestSha256:sha256(Buffer.from(JSON.stringify(frameworkManifest(framework))))};
    return {directory, framework, source};
  } catch (error) { rmSync(directory, {recursive:true, force:true}); throw error; }
}
export function frameworkManifest(folder) {
  assert.ok(lstatSync(folder).isDirectory() && !lstatSync(folder).isSymbolicLink(), 'Owned framework directory');
  const entries = [];
  function walk(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name, file = path.join(directory, name), stat = lstatSync(file);
      assert.ok(!/[\\:]/.test(relative), 'Portable framework path');
      const mode = stat.mode & 0o777;
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(file), resolved = path.resolve(path.dirname(file), target);
        assert.ok(!path.isAbsolute(target) && resolved.startsWith(`${path.resolve(folder)}/`), `Unsafe framework symlink ${relative}`);
        entries.push({path:relative, type:'symlink', target});
      } else if (stat.isDirectory()) { entries.push({path:relative,type:'directory',mode}); walk(file, relative); }
      else { assert.ok(stat.isFile(), `Special framework entry ${relative}`); entries.push({path:relative,type:'file',mode,size:stat.size,sha256:sha256(readFileSync(file))}); }
    }
  }
  walk(folder); return entries;
}
const links = {Autoupdate:'Versions/Current/Autoupdate', Headers:'Versions/Current/Headers', Modules:'Versions/Current/Modules', PrivateHeaders:'Versions/Current/PrivateHeaders', Resources:'Versions/Current/Resources', Sparkle:'Versions/Current/Sparkle', 'Updater.app':'Versions/Current/Updater.app', 'Versions/Current':'B', XPCServices:'Versions/Current/XPCServices'};
export const sparkleComponents = Object.freeze([
  {path:'Versions/B/Autoupdate', executable:'Versions/B/Autoupdate', identifier:'org.sparkle-project.Sparkle.Autoupdate'},
  {path:'Versions/B/Updater.app', executable:'Versions/B/Updater.app/Contents/MacOS/Updater', identifier:'org.sparkle-project.Sparkle.Updater', plist:'Versions/B/Updater.app/Contents/Info.plist'},
  {path:'Versions/B/XPCServices/Installer.xpc', executable:'Versions/B/XPCServices/Installer.xpc/Contents/MacOS/Installer', identifier:'org.sparkle-project.InstallerLauncher', plist:'Versions/B/XPCServices/Installer.xpc/Contents/Info.plist'},
  {path:'Versions/B/XPCServices/Downloader.xpc', executable:'Versions/B/XPCServices/Downloader.xpc/Contents/MacOS/Downloader', identifier:'org.sparkle-project.DownloaderService', plist:'Versions/B/XPCServices/Downloader.xpc/Contents/Info.plist'},
  {path:'.', executable:'Versions/B/Sparkle', identifier:'org.sparkle-project.Sparkle', plist:'Versions/B/Resources/Info.plist'}
]);
const plistJSON = (run, file) => JSON.parse(run('/usr/bin/plutil', ['-convert','json','-o','-',file]).stdout);
export function verifySparkleLayout(run, framework, config) {
  const manifest = frameworkManifest(framework);
  assert.deepEqual(manifest.filter(entry => entry.type === 'symlink').map(({path:relative,target}) => [relative,target]).sort(), Object.entries(links).sort(), 'Exact internal framework symlinks');
  assert.deepEqual(readdirSync(framework).sort(), ['Autoupdate','Headers','Modules','PrivateHeaders','Resources','Sparkle','Updater.app','Versions','XPCServices'].sort());
  assert.deepEqual(readdirSync(path.join(framework,'Versions')).sort(), ['B','Current']);
  assert.deepEqual(readdirSync(path.join(framework,'Versions/B')).sort(), ['Autoupdate','Headers','Modules','PrivateHeaders','Resources','Sparkle','Updater.app','XPCServices','_CodeSignature'].sort());
  assert.deepEqual(readdirSync(path.join(framework,'Versions/B/XPCServices')).sort(), ['Downloader.xpc','Installer.xpc']);
  for (const component of sparkleComponents) {
    const executable = path.join(framework,component.executable), stat = lstatSync(executable);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o111), 'Executable framework component');
    assert.deepEqual(run('/usr/bin/lipo',['-archs',executable]).stdout.trim().split(/\s+/).sort(), ['arm64','x86_64']);
    if (component.plist) {
      const plist = plistJSON(run,path.join(framework,component.plist));
      assert.equal(plist.CFBundleIdentifier, component.identifier);
      assert.equal(plist.CFBundleShortVersionString, config.sparkle.version);
      assert.equal(plist.CFBundleVersion, '2064');
      assert.equal(plist.CFBundleExecutable, path.basename(executable));
      assert.equal(plist.LSMinimumSystemVersion, '12.0');
    }
  }
  // No additional Mach-O payload can hide among the framework's resources/headers.
  const expected = sparkleComponents.map(component => component.executable).sort();
  const magic = new Set(['cafebabe','bebafeca','cafebabf','bfbafeca','feedfacf','cffaedfe','feedface','cefaedfe']);
  assert.deepEqual(manifest.filter(entry => entry.type === 'file' && magic.has(readFileSync(path.join(framework,entry.path)).subarray(0,4).toString('hex'))).map(entry => entry.path).sort(), expected);
  return manifest;
}
export function copySparkleFramework(distribution, contents) {
  const framework = path.join(contents,'Frameworks/Sparkle.framework');
  mkdirSync(path.dirname(framework),{recursive:true});
  cpSync(distribution.framework, framework, {recursive:true,dereference:false,verbatimSymlinks:true,errorOnExist:true,force:false,preserveTimestamps:true});
  mkdirSync(path.join(contents,'Resources'),{recursive:true});
  writeFileSync(path.join(contents,'Resources/Sparkle-LICENSE.txt'),readFileSync(path.join(distribution.directory,'LICENSE')));
  return framework;
}
export function signSparkleFramework(run, framework, identity) {
  for (const component of sparkleComponents) run('/usr/bin/codesign', ['--force','--options','runtime', ...(identity === '-' ? ['--timestamp=none'] : ['--timestamp']), '--identifier',component.identifier,'--sign',identity,path.join(framework,component.path)]);
}
const signatureMutable = relative => relative.includes('/_CodeSignature/') || relative.endsWith('/_CodeSignature') || sparkleComponents.some(component => component.executable === relative);
export function verifySparkleFramework(run, framework, config, {sourceFramework, identity, team, scratchPrefix} = {}) {
  const manifest = verifySparkleLayout(run,framework,config);
  if (sourceFramework) {
    const source = frameworkManifest(sourceFramework);
    assert.deepEqual(manifest.map(({path,type,mode,target}) => ({path,type,mode,target})),source.map(({path,type,mode,target}) => ({path,type,mode,target})), 'Pinned framework layout/modes');
    assert.deepEqual(manifest.filter(entry => !signatureMutable(entry.path)),source.filter(entry => !signatureMutable(entry.path)), 'Unsigned framework resources match authenticated archive');
  }
  const components = [];
  for (const component of sparkleComponents) run('/usr/bin/codesign',['--verify','--strict',path.join(framework,component.path)]);
  if (identity) {
    assert.ok(scratchPrefix, 'Signature scratch prefix required');
    for (const [index, component] of sparkleComponents.entries()) components.push({path:component.path, identifier:component.identifier, signature:verifyMacSignature(run,path.join(framework,component.path),`${scratchPrefix}-${index}`,{app:true,identity,team,bundleIdentifier:component.identifier})});
  }
  return {manifestSha256:sha256(Buffer.from(JSON.stringify(manifest))),components};
}
export function updaterReceipt(config, distribution, framework) {
  return {schema:1,buildNumber:config.buildNumber,feedURL:config.feedURL,publicKeySha256:sha256(Buffer.from(config.publicKey,'base64')),sparkle:distribution.source,framework};
}
export function verifyUpdaterPlist(plist, config, signed) {
  assert.equal(plist.CFBundleVersion, String(config.buildNumber));
  for (const [key,value] of Object.entries({SUEnableAutomaticChecks:signed,SUAutomaticallyUpdate:signed,SUAllowsAutomaticUpdates:true,SUEnableSystemProfiling:false,SUEnableJavaScript:false,SUVerifyUpdateBeforeExtraction:true,SURequireSignedFeed:true,SUSignedFeedFailureExpirationInterval:0,SUScheduledCheckInterval:86400})) assert.equal(plist[key], value, key);
  if (signed) {
    assert.equal(plist.SUFeedURL,config.feedURL); assert.equal(plist.SUPublicEDKey,config.publicKey);
    assert.deepEqual(plist.CFBundleURLTypes,[{CFBundleURLName:'ca.codepet.zero.updates',CFBundleURLSchemes:['zero-updates'],CFBundleTypeRole:'Viewer'}]);
  } else {
    for (const key of ['SUFeedURL','SUPublicEDKey','CFBundleURLTypes']) assert.equal(plist[key],undefined,`Development must omit ${key}`);
  }
  for (const key of ['SUEnableInstallerLauncherService','SUEnableDownloaderService','SUEnableInstallerConnectionService','SUEnableInstallerStatusService']) assert.equal(plist[key] ?? false,false);
}
export function updaterPlistFields(config, signed) {
  validateMacUpdaterConfig(config);
  return `${signed ? `<key>SUFeedURL</key><string>${config.feedURL}</string>\n  <key>SUPublicEDKey</key><string>${config.publicKey}</string>\n  <key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>ca.codepet.zero.updates</string><key>CFBundleURLSchemes</key><array><string>zero-updates</string></array><key>CFBundleTypeRole</key><string>Viewer</string></dict></array>\n  ` : ''}<key>SUEnableAutomaticChecks</key><${signed}/>\n  <key>SUAutomaticallyUpdate</key><${signed}/>\n  <key>SUAllowsAutomaticUpdates</key><true/>\n  <key>SUVerifyUpdateBeforeExtraction</key><true/>\n  <key>SURequireSignedFeed</key><true/>\n  <key>SUSignedFeedFailureExpirationInterval</key><integer>0</integer>\n  <key>SUScheduledCheckInterval</key><integer>86400</integer>\n  <key>SUEnableSystemProfiling</key><false/>\n  <key>SUEnableJavaScript</key><false/>`;
}

export function verifyUpdaterAppLayout(contents) {
  for (const relative of ['', 'Frameworks','MacOS','Resources','Resources/kit','_CodeSignature']) {
    const stat = lstatSync(path.join(contents,relative));
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `Owned app directory ${relative}`);
  }
  assert.deepEqual(readdirSync(contents).sort(), ['Frameworks','Info.plist','MacOS','Resources','_CodeSignature'].sort(), 'Scoped updater app layout');
  assert.deepEqual(readdirSync(path.join(contents,'Frameworks')), ['Sparkle.framework']);
  assert.deepEqual(readdirSync(path.join(contents,'MacOS')), ['ZeroSetup']);
  assert.deepEqual(readdirSync(path.join(contents,'Resources')).sort(), ['Sparkle-LICENSE.txt','Zero.icns','kit']);
  assert.deepEqual(readdirSync(path.join(contents,'_CodeSignature')), ['CodeResources']);
  for (const relative of ['_CodeSignature/CodeResources','Info.plist','MacOS/ZeroSetup','Resources/Sparkle-LICENSE.txt','Resources/Zero.icns']) {
    const stat = lstatSync(path.join(contents,relative));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Owned app file ${relative}`);
  }
}

// This validates sealed provenance shape and signer consistency. Actual artifact
// verification must also authenticate the archive/resources and final signatures.
export function validateUpdaterReceipt(value, config, {identitySha1, teamIdentifier}) {
  validateMacUpdaterConfig(config);
  assert.match(identitySha1 ?? '', /^[A-F0-9]{40}$/, 'Expected Developer ID signer');
  assert.match(teamIdentifier ?? '', /^[A-Z0-9]{10}$/, 'Expected Developer ID team');
  const keys = (object, expected, label) => {
    assert.ok(object !== null && typeof object === 'object' && !Array.isArray(object), label);
    assert.deepEqual(Object.keys(object).sort(), [...expected].sort(), label);
  };
  const hash = (value, label) => assert.match(value ?? '', /^[a-f0-9]{64}$/, label);
  keys(value, ['schema','buildNumber','feedURL','publicKeySha256','sparkle','framework'], 'Updater receipt fields');
  assert.equal(value.schema, 1);
  assert.equal(value.buildNumber, config.buildNumber);
  assert.equal(value.feedURL, config.feedURL);
  assert.equal(value.publicKeySha256, sha256(Buffer.from(config.publicKey,'base64')));
  keys(value.sparkle, ['version','url','size','sha256','frameworkManifestSha256'], 'Pinned Sparkle receipt fields');
  for (const [key, expected] of Object.entries(config.sparkle)) assert.equal(value.sparkle[key], expected, `Pinned Sparkle ${key}`);
  hash(value.sparkle.frameworkManifestSha256, 'Authenticated framework manifest digest');
  keys(value.framework, ['manifestSha256','components'], 'Signed framework receipt fields');
  hash(value.framework.manifestSha256, 'Signed framework manifest digest');
  assert.ok(Array.isArray(value.framework.components));
  assert.equal(value.framework.components.length, sparkleComponents.length, 'Exactly five signed Sparkle components');
  let expectedAuthority;
  for (const [index, expected] of sparkleComponents.entries()) {
    const component = value.framework.components[index];
    keys(component, ['path','identifier','signature'], 'Signed component receipt fields');
    assert.equal(component.path, expected.path, 'Signed component path/order');
    assert.equal(component.identifier, expected.identifier, 'Signed component identifier');
    keys(component.signature, ['architectures'], 'Signed component architecture evidence fields');
    assert.ok(Array.isArray(component.signature.architectures));
    assert.equal(component.signature.architectures.length, 2);
    for (const [architectureIndex, architecture] of ['arm64','x86_64'].entries()) {
      const evidence = component.signature.architectures[architectureIndex];
      keys(evidence, ['architecture','identitySha1','teamIdentifier','authority','timestamp'], 'Signature evidence fields');
      assert.equal(evidence.architecture, architecture, 'Universal architecture evidence/order');
      assert.equal(evidence.identitySha1, identitySha1, 'Nested component signer');
      assert.equal(evidence.teamIdentifier, teamIdentifier, 'Nested component team');
      assert.equal(typeof evidence.authority, 'string');
      assert.ok(evidence.authority.length <= 512 && !/[\r\n\0]/.test(evidence.authority));
      assert.ok(evidence.authority.startsWith('Developer ID Application: ') && evidence.authority.endsWith(`(${teamIdentifier})`), 'Developer ID authority');
      expectedAuthority ??= evidence.authority;
      assert.equal(evidence.authority, expectedAuthority, 'Nested component authority consistency');
      assert.equal(typeof evidence.timestamp, 'string');
      assert.ok(evidence.timestamp.trim().length > 0 && evidence.timestamp.length <= 128 && !/[\r\n\0]/.test(evidence.timestamp) && evidence.timestamp !== 'none' && /\b\d{4}\b/.test(evidence.timestamp) && /\d{1,2}:\d{2}/.test(evidence.timestamp), 'Secure signing timestamp evidence');
    }
  }
  return value;
}
