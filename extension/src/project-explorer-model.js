'use strict';

// This is an on-demand, read-only view of ordinary project files. It does not
// resolve Maven dependencies, contact ZeroHub, or run project-owned tools.
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const core = require('./core-contract');
const authoring = require('./sharing/authoring');
const contracts = require('./sharing/contracts');
const {inspectManagedLibraryPins} = require('./sharing/consumer');

const LIMITS = Object.freeze({entries:500, files:1000, depth:24, metadataBytes:65536, sourceBytes:1048576, totalSourceBytes:16777216});
const toolingDirectories = new Set(['.git','.github','.vscode','.mvn','.zero','.zero-build','.zero-web','.zero-sharing-recovery','target','node_modules']);
const rootToolingFiles = new Set(['zero.json','zero-core.json','zero-libraries.json','zero-library.json','pom.xml','mvnw','mvnw.cmd','.gitignore']);
const fail = message => { throw new Error(`${message} Open the full Explorer to see all project files.`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function relativePath(input, {empty=false}={}) {
  if (empty && input === '') return input;
  if (typeof input !== 'string' || input.length > 2048 || input.includes('\\') || input.includes(':') || input.startsWith('/')) fail('Use an ordinary relative project path.');
  const parts=input.split('/');
  if (parts.length > LIMITS.depth || parts.some(part => !part || part === '.' || part === '..' || /[\x00-\x1f\x7f]/.test(part))) fail('Use an ordinary relative project path.');
  return input;
}
function isToolingPath(relative) {
  const parts = relativePath(relative).split('/');
  return parts.some(part => toolingDirectories.has(part)) || rootToolingFiles.has(relative) || parts.at(-1) === '.DS_Store';
}
async function ordinaryPath(root, relative='', {missing=false}={}) {
  relativePath(relative,{empty:true});
  root = path.resolve(root);
  if (await fs.realpath(root) !== root || !(await fs.lstat(root)).isDirectory()) fail('The project folder must be an ordinary directory without symbolic links.');
  let current = root;
  for (const part of relative.split('/').filter(Boolean)) {
    current = path.join(current,part);
    let stat;
    try { stat = await fs.lstat(current); } catch (error) { if (missing && error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) fail(`Symbolic links cannot be shown here: ${relative}.`);
    if (current !== path.join(root,relative) && !stat.isDirectory()) fail(`A parent path is not a directory: ${relative}.`);
  }
  return current;
}
async function readText(root, relative, {optional=false, maximum=LIMITS.metadataBytes}={}) {
  const filename = await ordinaryPath(root,relative,{missing:optional});
  if (!filename) return null;
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.size > maximum) fail(`Cannot read ordinary bounded project metadata: ${relative}.`);
  const handle = await fs.open(filename,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (!(await handle.stat()).isFile()) fail(`Use an ordinary project file: ${relative}.`);
    // A bounded read also limits a file that grows between stat and read.
    const bytes = Buffer.alloc(maximum+1);
    let length=0;
    while (length < bytes.length) {
      const next = await handle.read(bytes,length,bytes.length-length,null);
      if (!next.bytesRead) break;
      length += next.bytesRead;
    }
    if (length > maximum) fail(`Project file is too large: ${relative}.`);
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length));
  } finally { await handle.close(); }
}
async function entriesAt(root, relative, budget) {
  const filename = await ordinaryPath(root,relative,{missing:true});
  if (!filename) return [];
  if (!(await fs.lstat(filename)).isDirectory()) fail(`Use an ordinary project directory: ${relative}.`);
  const entries=[];
  const directory = await fs.opendir(filename);
  for await (const entry of directory) {
    if (++budget.count > budget.maximum || entries.length >= LIMITS.entries) fail(`This project directory contains too many entries: ${relative || 'project'}.`);
    const name=relative ? `${relative}/${entry.name}` : entry.name;
    relativePath(name);
    if (entry.isSymbolicLink()) fail(`Symbolic links cannot be shown here: ${name}.`);
    if (entry.isFile() || entry.isDirectory()) entries.push({name:entry.name,relative:name,directory:entry.isDirectory()});
  }
  return entries.sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name,'en'));
}

// hideCorePaths/excludePaths are exact project-relative paths. No namespace or
// broad zero/ folder rule can hide a student's zero.contrib or custom source.
async function ordinaryEntries(root, relative='', {hideCorePaths=[],excludePaths=[]}={}) {
  root=path.resolve(root); relativePath(relative,{empty:true});
  const hidden=new Set([...hideCorePaths,...excludePaths].map(name=>relativePath(name)));
  const budget={count:0,maximum:LIMITS.files};
  async function visible(directory, depth=0) {
    if (depth > LIMITS.depth) fail('The project directory nesting is too deep.');
    const result=[];
    for (const entry of await entriesAt(root,directory,budget)) {
      if (isToolingPath(entry.relative) || hidden.has(entry.relative)) continue;
      // Remove empty scaffolding left by exact hidden paths, but keep ordinary
      // empty student folders and every folder with other authored content.
      if (entry.directory && [...hidden].some(name=>name.startsWith(entry.relative+'/')) && !(await visible(entry.relative,depth+1)).length) continue;
      result.push(entry);
    }
    return result;
  }
  return visible(relative);
}

async function corePaths(root) {
  const text = await readText(root,'zero-core.json',{optional:true});
  if (text === null) {
    const paths=[];
    for (const name of core.coreSourcePaths) {
      const source=await readText(root,name,{optional:true,maximum:LIMITS.sourceBytes});
      if (source !== null && hash(source.replace(/\r\n/g,'\n')) === core.helperHashes[name.slice('src/main/java/'.length)]) paths.push(name);
    }
    return paths;
  }
  // Older project-owned records remain readable without upgrading the project.
  // Inventory hashes identify files; this does not certify current compilation
  // compatibility or apply the extension's current framework version.
  const record=JSON.parse(text);
  if (!record || Object.keys(record).sort().join(',') !== 'coordinate,javaRelease,javafxVersion,schema,sourceSha256,sources' || record.schema !== 1 || !record.coordinate || Object.keys(record.coordinate).sort().join(',') !== 'artifactId,groupId,version' || record.coordinate.groupId !== 'school.zero' || record.coordinate.artifactId !== 'zero-core' || !/^\d{1,3}$/.test(record.javaRelease || '') || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(record.javafxVersion || '') || !Array.isArray(record.sources) || !record.sources.length || record.sources.length > 128 || !/^[a-f0-9]{64}$/.test(record.sourceSha256 || '')) fail('Invalid zero-core.json.');
  contracts.validateVersion(record.coordinate.version);
  const names=new Set(),paths=[];
  for (const entry of record.sources) {
    if (!entry || typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || Object.keys(entry).sort().join(',') !== 'path,sha256' || names.has(entry.path)) fail('Invalid zero-core.json source inventory.');
    relativePath(entry.path); names.add(entry.path);
    if (!entry.path.startsWith('src/main/java/zero/') || entry.path.startsWith('src/main/java/zero/contrib/') || !entry.path.endsWith('.java')) fail('Invalid zero-core.json source path.');
    const source=await readText(root,entry.path,{maximum:LIMITS.sourceBytes});
    if (hash(source.replace(/\r\n/g,'\n')) !== entry.sha256) fail(`Core source differs from zero-core.json: ${entry.path}.`);
    // Unknown files remain accessible even if a record claims they are core.
    if (core.coreSourcePaths.includes(entry.path)) paths.push(entry.path);
  }
  if (hash(JSON.stringify(record.sources)) !== record.sourceSha256) fail('Invalid zero-core.json inventory digest.');
  return paths.sort();
}

// discoverLibraries performs the canonical mode/POM/namespace checks. Bound its
// existing recursive reader before invoking it; no project script is executed.
async function boundedSources(root, directory, budget, depth=0) {
  if (depth > LIMITS.depth) fail('Library source nesting is too deep.');
  for (const entry of await entriesAt(root,directory,budget)) {
    if (entry.directory) await boundedSources(root,entry.relative,budget,depth+1);
    else if (entry.name.endsWith('.java')) {
      const text=await readText(root,entry.relative,{maximum:LIMITS.sourceBytes});
      budget.bytes += Buffer.byteLength(text);
      if (budget.bytes > LIMITS.totalSourceBytes) fail('Project library sources exceed the explorer size limit.');
    }
  }
}
async function existing(root, name, directory=false) {
  const filename=await ordinaryPath(root,name,{missing:true});
  if (!filename) return undefined;
  const stat=await fs.lstat(filename);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail(`Use an ordinary ${directory?'directory':'file'}: ${name}.`);
  return name;
}
async function readProjectModel(projectRoot) {
  const root=path.resolve(projectRoot);
  await ordinaryPath(root);
  const marker=JSON.parse(await readText(root,'zero.json'));
  if (!marker || typeof marker !== 'object' || Array.isArray(marker) || marker.name !== undefined && (typeof marker.name !== 'string' || marker.name.length > 200 || /[\x00-\x1f\x7f]/.test(marker.name))) fail('Invalid zero.json project name.');
  const pom=await readText(root,'pom.xml',{maximum:2*1024*1024});
  const paths=await corePaths(root),stateText=await readText(root,'zero-libraries.json',{optional:true});
  let authored=[];
  if (stateText !== null) {
    const state=JSON.parse(stateText);
    if (!state || state.schema !== 1 || !Array.isArray(state.libraries) || state.libraries.length > 64) fail('Invalid or oversized Zero library modes.');
    const budget={count:0,maximum:LIMITS.files,bytes:0};
    await boundedSources(root,'src/main/java',budget);
    for (const lib of state.libraries) {
      contracts.identity('library',lib.repositoryId,lib.slug);
      await readText(root,`libraries/${lib.slug}/zero-library.json`);
      await boundedSources(root,`libraries/${lib.slug}/src/main/java`,budget);
    }
    authored=await authoring.discoverLibraries(root);
  }
  const libraries=[];
  for (const lib of authored) {
    const imports=[];
    for (const name of lib.sources) {
      const declaration=authoring.declaration(await readText(root,name,{maximum:LIMITS.sourceBytes}),name);
      if ((declaration.packageName !== lib.identity.namespace && !declaration.packageName.startsWith(lib.identity.namespace+'.')) || name !== `${lib.folder}/src/main/java/${declaration.className.replaceAll('.','/')}.java`) fail(`Library source differs from its namespace: ${name}.`);
      if (new RegExp(`\\bpublic\\s+(?:(?:abstract|final|sealed|non-sealed|static)\\s+)*(?:class|interface|enum|record)\\s+${declaration.simple}\\b`).test(declaration.masked)) imports.push(declaration.className);
    }
    libraries.push({id:lib.identity.id,title:lib.descriptor.title,slug:lib.slug,mode:lib.mode,version:lib.version,folder:lib.folder,namespace:lib.identity.namespace,
      sourceRoot:`${lib.folder}/src/main/java`,localVersion:lib.descriptor.version,localSourceActive:lib.mode==='local',
      resourceRoot:await existing(root,`${lib.folder}/src/main/resources`,true),checksRoot:await existing(root,`${lib.folder}/src/test/java`,true),
      examplesRoot:await existing(root,`${lib.folder}/examples`,true),readme:await existing(root,`${lib.folder}/README.md`),
      description:lib.descriptor.description,imports:lib.mode==='local'?imports.sort():[],localImports:imports.sort()});
  }
  for (const pin of pom.includes('zero-sharing') ? inspectManagedLibraryPins(pom) : []) {
    if (libraries.some(lib=>lib.id===pin.identity.id)) fail(`Authored and installed library modes overlap: ${pin.identity.id}.`);
    libraries.push({id:pin.identity.id,title:pin.slug,slug:pin.slug,mode:'published',version:pin.version,namespace:pin.identity.namespace,imports:[],localSourceActive:false});
  }
  libraries.sort((a,b)=>a.title.localeCompare(b.title,'en') || a.id.localeCompare(b.id));
  const codeRoot='src/main/java',assetsRoot='src/main/resources';
  const excludePaths=[codeRoot,assetsRoot,...libraries.filter(lib=>lib.folder).map(lib=>lib.folder)];
  const otherEntries=(await ordinaryEntries(root,'',{excludePaths,hideCorePaths:paths})).map(entry=>entry.relative);
  return {root,title:marker.name?.trim() || path.basename(root),codeRoot,assetsRoot,corePaths:paths,libraries,otherEntries,excludePaths};
}

function libraryDetails(library) {
  const lines=[library.title,`Version: ${library.version}`,`Mode: ${library.mode === 'local' ? 'Local source (used by this project)' : 'Published dependency (used by this project)'}`,`Namespace: ${library.namespace}`];
  if (library.description) lines.push('',library.description);
  if (library.folder && library.mode === 'published') lines.push('',`Retained local source: ${library.folder} (${library.localVersion}); not compiled in published mode.`);
  if (library.imports.length) lines.push('','Imports:',...library.imports.map(name=>`import ${name};`));
  else if (library.mode==='published') lines.push('','Exact published API/import examples are not retained in this project. Open ZeroHub for this exact library version.');
  else lines.push('','No ordinary public class declarations were found. Open the local README and source to inspect this library.');
  if (library.readme) lines.push('',`Local README: ${library.readme}${library.mode==='published'?' (describes the retained local copy)':''}`);
  if (library.examplesRoot) lines.push(`Local examples: ${library.examplesRoot}${library.mode==='published'?' (retained local copy)':''}`);
  if (library.mode === 'published') lines.push('','Published source is not installed as an editable source tree. This view does not download library source.');
  return lines.join('\n')+'\n';
}

module.exports={readProjectModel,ordinaryEntries,isToolingPath,libraryDetails,LIMITS};
