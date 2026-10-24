'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { parseXml, single, value, allNodes } = require('../../project-pom');
const { helperHashes } = require('../adapters');
const contract = require('./contract.json');
const mavenArtifacts = require('./maven-artifacts.json');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function abort(signal) { if (signal?.aborted) { const error = new Error('Browser compatibility check cancelled.'); error.name = 'AbortError'; throw error; } }
function validateDependencies(pom,{libraries=[]}={}) {
  const project = parseXml(pom);
  const nodes = allNodes(project);
  if (nodes.some(n => ['parent', 'profiles', 'dependencyManagement', 'systemPath', 'extensions'].includes(n.name))) throw new Error('Browser compatibility requires the ordinary Zero POM without inherited, profile, BOM or build-extension dependencies.');
  const properties = single(project, 'properties', true);
  const version = properties && single(properties, 'javafx.version', true);
  const deps = single(project, 'dependencies', true);
  for (const node of nodes.filter(n => n.name === 'dependency')) {
    if (node.parent !== deps || node.children.length !== 3 || node.children.some(n => !['groupId', 'artifactId', 'version'].includes(n.name))) throw new Error('Unsupported browser dependency. Use included Java helper sources and the pinned JavaFX controls/media dependencies.');
    const group=value(single(node,'groupId')),artifact=value(single(node,'artifactId')),declared=value(single(node,'version'));
    const managed=libraries.find(l=>l.mode==='published'&&l.identity.coordinate.groupId===group&&l.identity.coordinate.artifactId===artifact&&l.version===declared);
    if(managed)continue;
    if (group !== 'org.openjfx' || !['javafx-base', 'javafx-graphics', 'javafx-controls', 'javafx-media'].includes(artifact)) throw new Error('Unsupported browser dependency. Use included Java helper sources and the pinned JavaFX controls/media dependencies.');
    if ((declared === '${javafx.version}' ? version && value(version) : declared) !== contract.javafxVersion) throw new Error(`Browser compatibility requires JavaFX ${contract.javafxVersion}; update the project setup before running.`);
  }
  return { javafxVersion: contract.javafxVersion, dependencies: (deps?.children || []).map(n => {
    if (n.name !== 'dependency') throw new Error('Unsupported browser dependency declaration.');
    const group=value(single(n,'groupId')),version=value(single(n,'version'));
    return group+':'+value(single(n,'artifactId'))+':'+(group==='org.openjfx'?contract.javafxVersion:version);
  }).sort() };
}
async function ordinary(file) {
  const absolute = path.resolve(file); let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Compatibility cache/source refuses symbolic links: ' + current); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function download(url, signal) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal, timeout: 60000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Compatibility artifact download failed: HTTP ' + response.statusCode)); return; }
      let size = 0; const chunks = [];
      response.on('data', chunk => { size += chunk.length; if (size > 32 * 1024 * 1024) request.destroy(new Error('Compatibility artifact exceeds its download limit.')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks))); response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Compatibility artifact download timed out.'))); request.on('error', reject);
  });
}
async function prepareArtifacts(cacheRoot, signal, get = download) {
  const root = path.join(cacheRoot, 'compatibility-artifacts');
  await ordinary(root); await fs.mkdir(root, { recursive: true });
  const files = [];
  for (const artifact of contract.attributionArtifacts) {
    abort(signal); const file = path.join(root, artifact.file); await ordinary(file);
    let bytes = await fs.readFile(file).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (!bytes || digest(bytes) !== artifact.sha256) {
      // Reuse the existing native dependency cache only after checking its exact reviewed bytes.
      const module = artifact.file.split('-21.')[0];
      const cached = path.join(os.homedir(), '.m2/repository/org/openjfx', module, contract.javafxVersion, artifact.file);
      await ordinary(cached);
      bytes = await fs.readFile(cached).catch(e => { if (e.code !== 'ENOENT') throw e; });
      if (!bytes || digest(bytes) !== artifact.sha256) bytes = await get(artifact.url, signal);
      if (digest(bytes) !== artifact.sha256) throw new Error('Compatibility JavaFX checksum mismatch: ' + artifact.file);
      const temporary = file + '.' + crypto.randomUUID() + '.tmp';
      try { await fs.writeFile(temporary, bytes, { flag: 'wx' }); await fs.rename(temporary, file); }
      finally { await fs.rm(temporary, { force: true }); }
    }
    files.push(file);
  }
  return files;
}
async function readCachedArtifacts(cacheRoot,signal,{stageRoot}={}) {
  const files=[];
  for(const artifact of contract.attributionArtifacts) {
    abort(signal);const file=path.join(cacheRoot,'compatibility-artifacts',artifact.file);await ordinary(file);
    let bytes;
    try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.nlink!==1||stat.size>32*1024*1024)throw new Error('linked or oversized artifact');bytes=await fs.readFile(file);}catch(error){throw Object.assign(new Error('Browser checks unavailable: missing exact cached attribution artifact '+artifact.file+'. Choose preparation explicitly.'),{code:'ZERO_COMPATIBILITY_UNAVAILABLE'});}
    if(digest(bytes)!==artifact.sha256)throw Object.assign(new Error('Browser checks unavailable: cached attribution checksum differs: '+artifact.file),{code:'ZERO_COMPATIBILITY_UNAVAILABLE'});
    if(stageRoot){const target=path.join(stageRoot,artifact.file);await ordinary(target);await fs.writeFile(target,bytes,{flag:'wx'});files.push(target);}else files.push(file);
  }
  return files;
}
function validateWrapperInputs(files, platform = process.platform) {
  const name = platform === 'win32' ? 'mvnw.cmd' : 'mvnw';
  const propertiesName = '.mvn/wrapper/maven-wrapper.properties';
  const entries = new Map(files.map(file => [file.path, file.bytes]));
  for (const file of [name, propertiesName]) {
    if (!entries.has(file) || digest(entries.get(file).toString('utf8').replace(/\r\n/g, '\n')) !== contract.wrapperHashes[file]) throw new Error('Web export requires Zero’s reviewed pinned Maven wrapper and properties: ' + file + '. Update the project setup before running.');
  }
  return { name, wrapperBytes: entries.get(name), propertiesBytes: entries.get(propertiesName) };
}
function verifyArtifactInventory(inventory) {
  const expected = new Map(mavenArtifacts.artifacts.map(file => [file.path, file]));
  for (const file of inventory) {
    const reviewed = expected.get(file.path);
    if (!reviewed || reviewed.sha256 !== file.sha256 || reviewed.bytes !== file.bytes) throw new Error('Unreviewed or modified browser compiler dependency: ' + file.path + '. Restore the supported compiler cache or update the reviewed compatibility contract.');
  }
  return inventory;
}
async function compatibilityProfile() {
  return { id: contract.id, schemaVersion: contract.schemaVersion, contractHash: digest(await fs.readFile(path.join(__dirname, 'contract.json'))), checkerHash: digest(await fs.readFile(path.join(__dirname, 'CheckCompatibility.java'))), mavenArtifactCatalogueHash: digest(await fs.readFile(path.join(__dirname, 'maven-artifacts.json'))), javaRelease: contract.javaRelease, javafxVersion: contract.javafxVersion, attributionArtifacts: contract.attributionArtifacts.map(({ file, sha256 }) => ({ file, sha256 })) };
}
async function checkCompatibility({ sources, pom, libraries=[], sourceOrigins={}, workRoot, cacheRoot, env, signal, onProgress = () => {}, getArtifact, cacheOnly = false }) {
  abort(signal);
  let dependencyProfile;try{dependencyProfile=validateDependencies(pom,{libraries});}catch(error){error.code='ZERO_BROWSER_UNSUPPORTED';throw error;}
  const profile = await compatibilityProfile();
  const root = path.join(workRoot, 'compatibility'); await ordinary(root); await fs.mkdir(root, { recursive: true });
  let jars;
  if(cacheOnly){const staged=path.join(root,'attribution');await fs.mkdir(staged);jars=await readCachedArtifacts(cacheRoot,signal,{stageRoot:staged});}
  else jars=await prepareArtifacts(cacheRoot, signal, getArtifact);
  const sourceRoot = path.join(root, 'sources'); await fs.mkdir(sourceRoot);
  const trusted = [];
  for (const [name, source] of Object.entries(sources)) {
    if (typeof source !== 'string' || !name.endsWith('.java') || path.isAbsolute(name) || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid compatibility source path: ' + name);
    if (helperHashes[name]) {
      if (digest(source.replace(/\r\n/g, '\n')) !== helperHashes[name]) throw new Error(`Web export: ${name}: this Zero helper differs from the reviewed browser adapter. Keep your source and restore the supported helper version.`);
      trusted.push(name);
    }
    const file = path.join(sourceRoot, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, source);
  }
  const api = path.join(root, 'contract.tsv'), trustedFile = path.join(root, 'trusted.txt');
  await fs.writeFile(api, [...contract.types.map(t => 'T\t' + t), ...contract.members.map(m => 'M\t' + m)].join('\n') + '\n');
  await fs.writeFile(trustedFile, trusted.join('\n'));
  const childEnv = { ...process.env, ...env };
  for(const key of Object.keys(childEnv))if(['JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','CLASSPATH'].includes(key.toUpperCase()))delete childEnv[key];
  const java = childEnv.JAVA_HOME ? path.join(childEnv.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  onProgress('Checking every original Java API against ' + contract.id);
  const checkerOutput = await new Promise((resolve, reject) => {
    abort(signal);
    const child = spawn(java, ['-Xmx512m', path.join(__dirname, 'CheckCompatibility.java'), sourceRoot, jars.join(path.delimiter), api, trustedFile], { cwd: root, env: childEnv, windowsHide: true });
    let output = '', settled = false;
    const stop = () => child.kill('SIGKILL');
    const timer = setTimeout(stop, 120000); timer.unref();
    signal?.addEventListener('abort', stop, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
    const receive = chunk => { output += chunk.toString(); if (output.length > 1024 * 1024) { output = output.slice(0, 1024 * 1024); stop(); } };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.on('error', error => { if (!settled) { settled = true; cleanup(); reject(Object.assign(new Error('Cannot start the local JDK browser compatibility checker: ' + error.message),{code:'ZERO_COMPATIBILITY_UNAVAILABLE'})); } });
    child.on('close', code => { if (settled) return; settled = true; cleanup(); try { abort(signal); if (code !== 0) {
      const diagnostic=(output.trim() || 'The JDK checker timed out or stopped. Check the project and local JDK.').split(/\r?\n/).map(line=>{
        const match=/^(.+\.java)(:\d+:\d+:.*)$/.exec(line);
        return match&&sourceOrigins[match[1]]?sourceOrigins[match[1]]+match[2]:line;
      }).join('\n');
      const rejected=code===1&&output.trim().split(/\r?\n/).every(line=>/^.+\.java:\d+:\d+: /.test(line));
      throw Object.assign(new Error('Browser compatibility check failed:\n' + diagnostic),{code:rejected?'ZERO_BROWSER_UNSUPPORTED':'ZERO_COMPATIBILITY_UNAVAILABLE'});
    } resolve(output); } catch (error) { reject(error); } });
  });
  abort(signal);
  const resourceUrlReferences=Object.create(null);
  for(const line of checkerOutput.split(/\r?\n/)) {
    if(!line.startsWith('ZERO_URL\t'))continue;
    const match=/^ZERO_URL\t([A-Za-z0-9+/]+=*)\t(\d+)\t(\d+)$/.exec(line);
    if(!match)throw new Error('Invalid browser type-attribution record.');
    const file=Buffer.from(match[1],'base64').toString('utf8'),start=Number(match[2]),end=Number(match[3]);
    if(!Object.hasOwn(sources,file)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>sources[file].length||trusted.includes(file))throw new Error('Invalid browser type-attribution range.');
    (resourceUrlReferences[file] ||= []).push({start,end});
  }
  return { ...profile, status: 'passed', sourceCount: Object.keys(sources).length, trustedHelpers: trusted.sort().map(file => ({ file, sha256: helperHashes[file] })), resourceUrlReferences, ...dependencyProfile };
}
module.exports = { checkCompatibility, compatibilityProfile, validateDependencies, prepareArtifacts, readCachedArtifacts, verifyArtifactInventory, validateWrapperInputs };
