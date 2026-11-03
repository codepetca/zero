'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {constants}=require('node:fs');
const contracts=require('./contracts');
const consumer=require('./consumer');
const {inspectJar,inspectLibraryJar}=require('./jar');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error('Project-owned library: '+message);};
const names={jar:'library.jar',sources:'sources.jar',pom:'library.pom',license:'LICENSE'};
const attributes=Buffer.from('* -text\n');
const bundleNames=['.gitattributes',...Object.values(names),'manifest.json'];
const maximum=name=>name==='.gitattributes'?attributes.length:name==='manifest.json'?contracts.LIMITS.metadataBytes+4096:name==='LICENSE'?65536:contracts.LIMITS.artifactBytes;
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function identity(id,version) {
 const match=typeof id==='string'&&/^lib-r([1-9][0-9]{0,19})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(id);
 if(!match||contracts.identity('library',match[1],match[2]).id!==id)fail('invalid library identity.');
 contracts.validateVersion(version);
}
async function directory(dir,create=false) {
 if(create)try{await fs.mkdir(dir);}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())fail(`unsafe directory: ${dir}`);
}
async function base(root,id,version,create=false) {
 identity(id,version);root=path.resolve(root);
 await directory(root);if(await fs.realpath(root)!==root)fail('project root contains a symbolic link.');
 let dir=root;for(const part of ['zero-dependencies',id]){dir=path.join(dir,part);await directory(dir,create);}
 return {parent:dir,final:path.join(dir,version)};
}
async function readFile(dir,name,maximum) {
 const filename=path.join(dir,name);const stat=await fs.lstat(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maximum||stat.size<1)fail(`invalid ${name}.`);
 const file=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try {const opened=await file.stat();if(!opened.isFile()||opened.size!==stat.size||opened.ino!==stat.ino||opened.dev!==stat.dev)fail(`${name} changed while reading.`);const bytes=await file.readFile();if(bytes.length!==opened.size)fail(`${name} changed while reading.`);return bytes;}finally{await file.close();}
}
async function validate(release,artifactOrigin,artifacts) {
 release=contracts.validateRelease(release,{artifactOrigin});
 if(release.kind!=='library'||release.status!=='available'||release.license!=='MIT')fail('only available MIT libraries can be stored.');
 for(const kind of ['jar','sources','pom']) {
  const bytes=artifacts[kind],expected=release.artifacts[kind];
  if(!Buffer.isBuffer(bytes)||bytes.length!==expected.size||hash(bytes)!==expected.sha256)fail(`${kind} size or hash differs from the release.`);
 }
 // Run the existing POM and schema-specific JAR checks against the exact local
 // bytes; this fetcher never contacts the artifact host.
 const context={artifactOrigin,catalog:{releases:[release]},fetcher:async url=>{
  const kind=['jar','sources','pom'].find(k=>release.artifacts[k].url===url);
  if(!kind)fail('unexpected artifact URL.');return new Response(artifacts[kind]);
 }};
 await consumer.verifyLibrary(context,release);
 const entries=['jar','sources'].map((kind)=>release.schema===2
  ?inspectLibraryJar(artifacts[kind],{namespace:release.namespace,coordinate:release.coordinate,kind:kind==='jar'?'binary':'sources'})
  :inspectJar(artifacts[kind]));
 const licenses=entries.map(files=>files.filter(file=>file.path==='META-INF/LICENSE'));
 if(licenses.some(list=>list.length!==1||list[0].bytes.length<1||list[0].bytes.length>65536)||!licenses[0][0].bytes.equals(licenses[1][0].bytes))fail('JAR licenses are missing, oversized or differ.');
 return {release,license:licenses[0][0].bytes};
}
// Validate a captured snapshot without consulting the project or network. Paths
// are exact project-relative names; callers retain responsibility for capture.
async function validateOwnedFiles(id,version,files) {
 identity(id,version);
 if(!Array.isArray(files)||files.length!==bundleNames.length)fail('bundle has missing or unowned files.');
 const prefix=`zero-dependencies/${id}/${version}/`,captured=new Map();
 for(const item of files) {
  if(!fields(item,['path','bytes'])||typeof item.path!=='string'||!item.path.startsWith(prefix)||!Buffer.isBuffer(item.bytes))fail('invalid captured bundle file.');
  const name=item.path.slice(prefix.length);
  if(!bundleNames.includes(name)||captured.has(name)||item.bytes.length<1||item.bytes.length>maximum(name))fail('bundle has duplicate, oversized or unowned files.');
  captured.set(name,Buffer.from(item.bytes));
 }
 if(!captured.get('.gitattributes').equals(attributes))fail('Git attributes changed; exact artifact bytes must be preserved.');
 let manifest;try{manifest=JSON.parse(captured.get('manifest.json').toString('utf8'));}catch(error){fail(`invalid manifest: ${error.message}`);}
 if(!fields(manifest,['schema','ownership','artifactOrigin','release','files'])||manifest.schema!==1||manifest.ownership!=='project-owned' || !fields(manifest.files,Object.keys(names)))fail('invalid manifest structure.');
 for(const [kind,name] of Object.entries(names))if(!fields(manifest.files[kind],['name','size','sha256'])||manifest.files[kind].name!==name||!Number.isSafeInteger(manifest.files[kind].size)||manifest.files[kind].size<1||!/^[a-f0-9]{64}$/.test(manifest.files[kind].sha256))fail('invalid manifest file metadata.');
 const artifacts={};for(const [kind,name] of Object.entries(names)) {
  const bytes=captured.get(name),item=manifest.files[kind];
  if(bytes.length!==item.size||hash(bytes)!==item.sha256)fail(`${name} differs from the manifest.`);artifacts[kind]=bytes;
 }
 const checked=await validate(manifest.release,manifest.artifactOrigin,artifacts);
 if(checked.release.id!==id||checked.release.version!==version||!checked.license.equals(artifacts.license))fail('bundle identity or license differs.');
 return {release:checked.release,jar:artifacts.jar,sources:artifacts.sources,pom:artifacts.pom,license:artifacts.license};
}
async function readOwned(root,id,version) {
 const {final}=await base(root,id,version);await directory(final);
 const actual=await fs.readdir(final),expected=bundleNames;
 if(actual.length!==expected.length||actual.some(name=>!expected.includes(name)))fail('bundle has missing or unowned files.');
 const prefix=`zero-dependencies/${id}/${version}/`,files=[];
 for(const name of expected)files.push({path:prefix+name,bytes:await readFile(final,name,maximum(name))});
 return validateOwnedFiles(id,version,files);
}
// A crash between publishing a hard link and unlinking its staged name leaves
// two names for the same bytes. Remove only that duplicate staging name. Never
// remove a sole copy, an unknown file, a directory or a link through a symlink.
async function releaseStagingLinks(parent,final,version,expected) {
 const stagePattern=new RegExp('^\\.'+version.replace(/\./g,'\\.')+'-stage-[A-Za-z0-9]{6}$');
 for(const entry of await fs.readdir(parent,{withFileTypes:true})) {
  if(!stagePattern.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())continue;
  const stage=path.join(parent,entry.name);await directory(stage);
  for(const name of expected.keys()) {
   const target=path.join(final,name),source=path.join(stage,name);
   const dest=await fs.lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!dest||!dest.isFile()||dest.isSymbolicLink()||dest.nlink<2)continue;
   const staged=await fs.lstat(source).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!staged||!staged.isFile()||staged.isSymbolicLink()||staged.dev!==dest.dev||staged.ino!==dest.ino)continue;
   // Recheck both directories and names immediately before releasing the alias.
   await directory(stage);await directory(final);
   const now=await fs.lstat(source),current=await fs.lstat(target);
   if(!now.isFile()||now.isSymbolicLink()||!current.isFile()||current.isSymbolicLink()||now.dev!==dest.dev||now.ino!==dest.ino||current.dev!==dest.dev||current.ino!==dest.ino||current.nlink<2)fail('staging files changed during recovery.');
   await fs.unlink(source);
  }
 }
}
async function installOwned(root,context,release,verified) {
 if(!context||!context.catalog)fail('the selected catalog is required.');
 const catalog=contracts.validateCatalog(context.catalog,{artifactOrigin:context.artifactOrigin});
 const checked=contracts.validateRelease(release,{artifactOrigin:context.artifactOrigin});
 if(!catalog.releases.some(item=>JSON.stringify(item)===JSON.stringify(checked)))fail('choose an exact release in the catalog.');
 const data={};for(const kind of ['jar','sources','pom'])data[kind]=Buffer.isBuffer(verified?.[kind])?Buffer.from(verified[kind]):verified?.[kind];
 const validated=await validate(checked,context.artifactOrigin,data);data.license=validated.license;
 const manifest={schema:1,ownership:'project-owned',artifactOrigin:context.artifactOrigin,release:checked,files:Object.fromEntries(Object.entries(names).map(([kind,name])=>[kind,{name,size:data[kind].length,sha256:hash(data[kind])}]))};
 const expected=new Map([['.gitattributes',attributes],...Object.entries(names).map(([kind,name])=>[name,data[kind]]),['manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')]]);
 const {parent,final}=await base(root,checked.id,checked.version,true);
 await directory(final,true);
 const actual=await fs.readdir(final);
 if(actual.some(name=>!expected.has(name)))fail('an existing bundle has unowned files; keep them and choose another destination.');
 // Validate every existing byte before creating anything. Interrupted copies
 // may be completed, but conflicting or student-authored files are never edited.
 for(const name of actual)if(!(await readFile(final,name,maximum(name))).equals(expected.get(name)))fail(`an existing ${name} conflicts with the selected release.`);
 await releaseStagingLinks(parent,final,checked.version,expected);
 if(actual.length===expected.size)return {...await readOwned(root,checked.id,checked.version),reused:true};
 const stage=await fs.mkdtemp(path.join(parent,`.${checked.version}-stage-`));
 let result,operationError;
 try {
  for(const [name,bytes] of expected)await fs.writeFile(path.join(stage,name),bytes,{flag:'wx'});
  for(const [name,bytes] of expected) {
   await directory(final);await directory(stage);
   const source=path.join(stage,name),target=path.join(final,name);
   // A same-filesystem hard link publishes a complete file exclusively. A crash
   // cannot leave a partially copied artifact at its active destination.
   try{await fs.link(source,target);}catch(error){if(error.code!=='EEXIST')throw error;if(!(await readFile(final,name,maximum(name))).equals(bytes))fail(`an existing ${name} conflicts with the selected release.`);}
   await fs.unlink(source);
  }
  result={...await readOwned(root,checked.id,checked.version),reused:false};
 } catch(error) {operationError=error;}
 // Cleanup is best effort. Do not hide the operation failure, and do not report
 // a validated installation as failed merely because its staging cleanup failed.
 try {await fs.rm(stage,{recursive:true,force:true});}
 catch(error) {if(!operationError)result.cleanupWarning=`Unable to remove staging directory ${stage}: ${error.message}`;}
 if(operationError)throw operationError;
 return result;
}
// This project-owned JSON detects accidental/local edits only; it is not a
// cryptographically authenticated receipt. No credentials or code execution.
module.exports={installOwned,readOwned,validateOwnedFiles};
