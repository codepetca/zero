#!/usr/bin/env node
'use strict';
// Explicit standalone entrypoint. A trusted editor must verify/freeze these bytes
// before spawning this file; self-checking project code is not an authorization gate.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const format = require('./src/project-builder-format');
const root = __dirname;
async function ordinary(filename) {
  let current = path.parse(path.resolve(filename)).root;
  for (const part of path.resolve(filename).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Saved tooling refuses symbolic links: ' + current);
  }
}
async function readClosure() {
  await ordinary(root);
  const files = [], folded = new Set(); let total = 0;
  async function walk(folder, prefix = '') {
    for (const entry of await fs.readdir(folder, {withFileTypes: true})) {
      const name = prefix + entry.name, file = path.join(folder, entry.name);
      if (!format.relativePath(name) || folded.has(name.toLowerCase())) throw new Error('Unsafe or case-colliding saved tooling path: ' + name);
      folded.add(name.toLowerCase());
      if (entry.isDirectory()) await walk(file, name + '/');
      else if (entry.isFile()) {
        const stat = await fs.lstat(file);
        if (stat.nlink !== 1 || stat.size > format.LIMITS.fileBytes || name === 'builder.json' && stat.size > format.LIMITS.manifestBytes) throw new Error('Linked or oversized saved tooling file: ' + name);
        const bytes = await fs.readFile(file); total += bytes.length;
        if (total > format.LIMITS.totalBytes || files.length >= format.LIMITS.files + 1) throw new Error('Saved tooling exceeds inventory limits.');
        files.push({path: name, bytes});
      } else throw new Error('Saved tooling refuses links or special files: ' + name);
    }
  }
  await walk(root);
  const metadata = files.find(file => file.path === 'builder.json');
  if (!metadata) throw new Error('Saved tooling is missing builder.json.');
  const manifest = format.validateBuilderFiles(JSON.parse(metadata.bytes.toString('utf8')), files.filter(file => file.path !== 'builder.json'));
  const runtime = format.validateRuntimeLock(JSON.parse(files.find(file => file.path === 'runtime-lock.json').bytes.toString('utf8')));
  return {manifest, runtime};
}
function validateRequest(request) {
  const allowed = new Set(['protocol', 'operation', 'projectRoot', 'cacheRoot']);
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !allowed.has(key)) || request.protocol !== 1 || !['inspect', 'capture', 'export', 'validate', 'compatibility', 'compatibilityCached'].includes(request.operation)) throw new Error('Unsupported saved builder request. Use protocol 1 and a documented operation.');
  for (const key of ['projectRoot', 'cacheRoot']) if (Object.hasOwn(request, key) && (typeof request[key] !== 'string' || !path.isAbsolute(request[key]) || request[key].includes('\0') || request[key].length > 4096)) throw new Error(key + ' must be an absolute path.');
  return request;
}
function sanitizeEnvironment() {
  const environment = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'JAVA_HOME', 'LANG', 'LC_ALL']) if (process.env[key]) environment[key] = process.env[key];
  process.env = environment;
  return environment;
}
function checkRuntimes(runtime, environment) {
  if (Number(process.versions.node.split('.')[0]) !== runtime.requirements.nodeMajor) throw new Error('Browser tooling needs standalone Node ' + runtime.requirements.nodeMajor + '. See .zero-build/README.md.');
  if (!environment.JAVA_HOME || !path.isAbsolute(environment.JAVA_HOME)) throw new Error('Browser tooling needs JAVA_HOME pointing to standalone JDK ' + runtime.requirements.javaMajor + '. See .zero-build/README.md.');
  const java = path.join(environment.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  const result = spawnSync(java, ['-version'], {env: environment, encoding: 'utf8', timeout: 5000, maxBuffer: 32768, windowsHide: true});
  const version = /version "(\d+)(?:\.|\")/.exec((result.stderr || '') + (result.stdout || ''));
  if (result.error || result.status !== 0 || Number(version?.[1]) !== runtime.requirements.javaMajor) throw new Error('The selected JAVA_HOME does not provide the required JDK ' + runtime.requirements.javaMajor + '. See .zero-build/README.md.');
}
function resultMetadata(result) {
  return Object.fromEntries(['buildId', 'sitePath', 'zipPath', 'manifestPath', 'sourceHash', 'profileHash', 'totalBytes', 'files', 'logPath', 'manifest'].filter(key => result[key] !== undefined).map(key => [key, result[key]]));
}
async function execute(request, controller) {
  const before = await readClosure();
  const projectRoot = path.resolve(request.projectRoot || path.dirname(root));
  const snapshot = require('./src/web-export/snapshot');
  const selected = await snapshot.assertSelectedBuilder(projectRoot, path.join(root, 'src/web-export'));
  if (request.operation === 'inspect') return {protocol: 1, closureSha256: before.manifest.closureSha256, files: before.manifest.files.length, runtime: before.runtime};
  const environment = sanitizeEnvironment();
  const captured = await snapshot.captureBuildInputs(projectRoot);
  if (request.operation === 'capture') return {sourceHash: captured.sourceHash, inputs: snapshot.commitInputMetadata(captured.files), profileHash: selected.profileHash, closureSha256: before.manifest.closureSha256};
  if (request.operation !== 'validate') {
    try {checkRuntimes(before.runtime, environment);} catch(error) {if(request.operation==='compatibilityCached')return {status:'unavailable',identity:null,diagnostics:[{code:'RUNTIME_UNAVAILABLE',message:String(error.message).slice(0,8192)}]};throw error;}
  }
  const cacheBase = request.cacheRoot || path.join(os.homedir(), '.cache', 'zero', 'project-builder');
  const cacheRoot = path.join(cacheBase, before.manifest.closureSha256);
  if (cacheRoot === projectRoot || cacheRoot.startsWith(projectRoot + path.sep)) throw new Error('Browser tooling cache must be outside the project.');
  const options = {projectRoot, cacheRoot, inheritedProcessGroup: true, env: environment, signal: controller.signal, onProgress: message => process.stderr.write(String(message).slice(0, 4096) + '\n')};
  let result;
  if (request.operation === 'compatibilityCached') result=await require('./src/web-export/compatibility/cached-project').checkCachedProject(options);
  else if (request.operation === 'export') result = resultMetadata(await require('./src/web-export').exportForWeb(options));
  else if (request.operation === 'validate') result = resultMetadata(await snapshot.validateExport(options));
  else {
    const recording=require('./src/web-export/compatibility/cache').createRecordingFetcher();
    const resolved = await require('./src/web-export/libraries').resolveLibrarySources(projectRoot, captured, {...options,fetcher:recording.fetcher});
    await recording.commit(cacheRoot);
    const javaFiles = [...captured.files.filter(file => file.path.startsWith('src/main/java/') && file.path.endsWith('.java')).map(file => ({...file, originalPath: file.path, path: file.path.slice('src/main/java/'.length)})), ...resolved.sources];
    const workRoot = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'zero-compatibility-'));
    try {result = await require('./src/web-export/compatibility').checkCompatibility({...options, workRoot, sources: Object.fromEntries(javaFiles.map(file => [file.path, file.bytes.toString('utf8')])), sourceOrigins: Object.fromEntries(javaFiles.map(file => [file.path, file.originalPath])), libraries: captured.libraries, pom: captured.files.find(file => file.path === 'pom.xml').bytes.toString('utf8')});}
    catch(error){
      // Preparation remains usable when the saved Java itself is rejected. Tool,
      // cache and dependency-setup failures still fail the explicit operation.
      if(error.code!=='ZERO_BROWSER_UNSUPPORTED'||!String(error.message).startsWith('Browser compatibility check failed:\n'))throw error;
      result={status:'unsupported',prepared:true,diagnostics:[{code:error.code,message:String(error.message).slice(0,8192)}]};
    }
    finally {await fs.rm(workRoot, {recursive: true, force: true});}
  }
  if ((await readClosure()).manifest.closureSha256 !== before.manifest.closureSha256) throw new Error('Saved browser tooling changed during the operation.');
  if ((await snapshot.captureBuildInputs(projectRoot)).sourceHash !== captured.sourceHash) throw new Error('Project inputs changed during the operation.');
  return result;
}
async function main() {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
  let bytes = 0, chunks = [];
  for await (const chunk of process.stdin) {bytes += chunk.length; if (bytes > format.LIMITS.requestBytes) throw new Error('Saved builder request exceeds 64 KiB.'); chunks.push(chunk);}
  return execute(validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))), controller);
}
if (require.main === module) main().then(result => {
  const response = JSON.stringify({protocol: 1, ok: true, result});
  if (Buffer.byteLength(response) > 2 * 1024 * 1024) throw new Error('Saved builder response exceeds its limit.');
  process.stdout.write(response + '\n');
}).catch(error => {process.stdout.write(JSON.stringify({protocol: 1, ok: false, error: {code: error.name === 'AbortError' ? 'cancelled' : 'failed', message: String(error.message).slice(0, 4096), ...(typeof error.logPath === 'string' ? {logPath: error.logPath.slice(0, 4096)} : {})}}) + '\n'); process.exitCode = error.name === 'AbortError' ? 130 : 1;});
module.exports = {readClosure, validateRequest};
