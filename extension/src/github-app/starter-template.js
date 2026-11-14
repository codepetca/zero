'use strict';
const {createHash}=require('node:crypto');
const path=require('node:path');
const {coreSourcePaths}=require('../core-contract');
const {loadBundle}=require('../lesson-projects');

const ORIGINAL_TEMPLATE=Object.freeze({owner:'codepetca',repo:'zero-starter'});
const originalRepositoryId=1418150992;
const starterPaths=new Set(['zero-core.json','pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties',...coreSourcePaths]);
const builderPath=name=>name==='.zero-build'||name.startsWith('.zero-build/');
const compatibilityPath=name=>starterPaths.has(name)||builderPath(name)||name==='src/main/java/zero'||name.startsWith('src/main/java/zero/');

function starterError(message,code) {
  return Object.assign(Error(message),{code});
}
function starterMismatch() {
  return starterError('The GitHub starter uses a different version of Zero’s project files. Check for a Zero update, then try Project → New again. If Zero is up to date, ask your teacher to check the starter. No repository was created.','ZERO_STARTER_INCOMPATIBLE');
}
function starterUnavailable() {
  return starterError('Zero could not check the GitHub starter. Check your connection and try Project → New again. No repository was created.','ZERO_STARTER_UNAVAILABLE');
}
function starterInstallInvalid() {
  return starterError('Zero’s starter compatibility files are missing or damaged. Reinstall Zero, then try Project → New again. No repository was created.','ZERO_STARTER_INSTALL_INVALID');
}
async function installedStarterInventory(extensionPath=path.resolve(__dirname,'../..')) {
  const projects=await loadBundle(extensionPath);
  const files=projects.find(project=>project.id==='greeting')?.files;
  const inventory=new Map(files?.filter(file=>compatibilityPath(file.path)).map(file=>[file.path,{
    sha:createHash('sha1').update(`blob ${file.content.length}\0`).update(file.content).digest('hex'),
    mode:file.mode&0o111?'100755':'100644'
  }]));
  if(!inventory.has('.zero-build/builder.json')||[...starterPaths].some(name=>!inventory.has(name)))throw starterInstallInvalid();
  return inventory;
}
function assertStarterIdentity(source) {
  if(source?.id!==originalRepositoryId||source.full_name!==`${ORIGINAL_TEMPLATE.owner}/${ORIGINAL_TEMPLATE.repo}`||
     source.private!==false||source.is_template!==true||source.default_branch!=='main')throw starterUnavailable();
}
function starterTreeId(branch) {
  const sha=branch?.commit?.commit?.tree?.sha;
  if(branch?.name!=='main'||!/^[a-f0-9]{40}$/.test(sha||''))throw starterUnavailable();
  return sha;
}
function assertCompatibleStarter(tree,sha,inventory) {
  if(tree?.sha!==sha||tree.truncated!==false||!Array.isArray(tree.tree)||tree.tree.length>512)throw starterUnavailable();
  const remaining=new Map(inventory), directories=new Set();
  for(const filename of inventory.keys()) {
    const parts=filename.split('/');
    while(parts.length>1){parts.pop();directories.add(parts.join('/'));}
  }
  const seen=new Set();
  for(const entry of tree.tree) {
    const name=entry?.path;
    if(typeof name!=='string')throw starterUnavailable();
    const lower=name.toLowerCase();
    if(!compatibilityPath(lower))continue;
    if(seen.has(lower))throw starterMismatch();
    seen.add(lower);
    if(entry.type==='tree'&&entry.mode==='040000'&&directories.has(name))continue;
    const file=remaining.get(name);
    if(!file||entry.type!=='blob'||entry.mode!==file.mode||entry.sha!==file.sha)throw starterMismatch();
    remaining.delete(name);
  }
  if(remaining.size)throw starterMismatch();
}
module.exports={ORIGINAL_TEMPLATE,installedStarterInventory,assertStarterIdentity,starterTreeId,assertCompatibleStarter,starterUnavailable,starterInstallInvalid};
