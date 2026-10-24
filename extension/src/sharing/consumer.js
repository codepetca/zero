'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const c=require('./contracts');
const {parseXml,single,value,allNodes}=require('../project-pom');
const authoring=require('./authoring');
const fail=message=>{throw new Error(message);};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const xml=text=>String(text).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[s]));
function origin(input) {
 const url=new URL(input);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))fail('Configure the public artifact origin as HTTPS, or an explicit loopback test origin.');
 return url.origin;
}
function catalogUrl(input) {
 const url=new URL(input);origin(url.origin);
 if(url.username||url.password||url.search||url.hash)fail('Use an exact catalog URL without credentials, query or fragment.');
 return url.href;
}
async function abortable(promise,signal) {
 if(signal.aborted)fail('Sharing download timed out or was cancelled.');
 let listener; const abort=new Promise((_,reject)=>{listener=()=>reject(new Error('Sharing download timed out or was cancelled.'));signal.addEventListener('abort',listener,{once:true});});
 try{return await Promise.race([promise,abort]);}finally{signal.removeEventListener('abort',listener);}
}
async function readBytes(url,{fetcher=fetch,maximum,signal,timeoutMs=30000}={}) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 try {
 let response;try{response=await abortable(fetcher(url,{redirect:'error',credentials:'omit',cache:'no-cache',signal:combined}),combined);}catch(error){if(combined.aborted)throw error;fail('Sharing downloads are unavailable. Your project has not changed.');}
 if(!response.ok){void response.body?.cancel().catch(()=>{});fail(response.status===410?'This release was withdrawn. Choose another version.':'Sharing downloads are unavailable. Your project has not changed.');}
 const declared=response.headers?.get('content-length'); if(declared!==null&&declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>maximum))fail('Sharing response exceeds the download size limit.');
 if(!response.body)fail('Sharing response has no body.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const part=await abortable(reader.read(),combined);if(part.done)break;size+=part.value.byteLength;if(size>maximum)fail('Sharing response exceeds the download size limit.');chunks.push(Buffer.from(part.value));}}
 finally{try{void reader.cancel().catch(()=>{});}catch{}reader.releaseLock();}
 return Buffer.concat(chunks);
 } finally {clearTimeout(timer);}
}
async function loadCatalog(settings,{fetcher=fetch,signal,timeoutMs=30000}={}) {
 if(!settings?.artifactOrigin)fail('The public artifact origin is not configured. Publication and public downloads are not active yet.');
 const configured=origin(settings.artifactOrigin),url=catalogUrl(settings.catalogUrl);
 const bytes=await readBytes(url,{fetcher,maximum:c.LIMITS.catalogBytes,signal,timeoutMs});
 let input;try{input=JSON.parse(bytes.toString('utf8'));}catch{fail('The sharing catalog is not valid JSON.');}
 const catalog=c.validateCatalog(input,{artifactOrigin:configured});
 return {catalog,catalogUrl:url,artifactOrigin:configured,fingerprint:hash(bytes),fetcher};
}
function selected(context,release) {
 const checked=c.validateRelease(release,{artifactOrigin:context.artifactOrigin});
 if(!context.catalog.releases.some(r=>JSON.stringify(r)===JSON.stringify(checked)))fail('Choose an exact release in this catalog.');
 if(checked.status!=='available')fail('This release was withdrawn.'); return checked;
}
async function downloadArtifact(context,release,kind,{signal,timeoutMs=30000}={}) {
 const checked=selected(context,release),artifact=checked.artifacts[kind];if(!artifact)fail('The selected release has no such artifact.');
 const bytes=await readBytes(artifact.url,{fetcher:context.fetcher,maximum:artifact.size,signal,timeoutMs});
 if(bytes.length!==artifact.size||hash(bytes)!==artifact.sha256)fail('The artifact differs from the catalog size or hash. Your project has not changed.');return bytes;
}
function checkPom(bytes,release) {
 const project=parseXml(bytes.toString('utf8'));
 for(const key of ['groupId','artifactId','version'])if(value(single(project,key))!==release.coordinate[key])fail('Published POM coordinates differ from the selected release.');
 if(allNodes(project).some(n=>['parent','profiles','repositories','pluginRepositories','dependencyManagement','systemPath','build','extensions','reporting'].includes(n.name)))fail('The published POM has unsupported dependency configuration.');
 const properties=single(project,'properties',true),deps=single(project,'dependencies',true);
 const core=release.schema===2;
 const coreProperties=core?{
  'zero.core.minVersion':release.coreRequirement.minVersion,
  'zero.core.maxExclusive':release.coreRequirement.maxExclusive,
  ...Object.fromEntries(Object.entries(release.coreBuild).map(([key,value])=>['zero.core.'+key,value]))
 }:{};
 const declaredCoreProperties=(properties?.children||[]).filter(node=>node.name.startsWith('zero.core.'));
 if(declaredCoreProperties.length!==Object.keys(coreProperties).length||new Set(declaredCoreProperties.map(node=>node.name)).size!==declaredCoreProperties.length||declaredCoreProperties.some(node=>node.children.length||!Object.hasOwn(coreProperties,node.name)||value(node)!==coreProperties[node.name]))fail('Published POM core metadata differs from the selected release.');
 let coreDependencies=0;
 for(const dep of deps?.children||[]) {
  const group=value(single(dep,'groupId')),artifact=value(single(dep,'artifactId')),version=value(single(dep,'version'));
  const javaFx=version==='${javafx.version}'&&properties?value(single(properties,'javafx.version')):version;
  if(core&&group==='school.zero'&&artifact==='zero-core') {
   if(dep.name!=='dependency'||dep.children.length!==4||version!==release.coreBuild.version||value(single(dep,'scope'))!=='provided'||++coreDependencies!==1)fail('Published POM must use the exact provided Zero core input.');
  } else if(dep.name!=='dependency'||dep.children.length!==3||group!=='org.openjfx'||!['javafx-controls','javafx-media','javafx-swing'].includes(artifact)||javaFx!==c.JAVAFX_VERSION)fail('The published POM has unsupported dependencies.');
 }
 if(core&&coreDependencies!==1)fail('Published POM is missing its provided Zero core dependency.');
}
async function verifyLibrary(context,release,options={}) {
 if(release.kind!=='library')fail('Games open as separate projects.');
 const deadline=AbortSignal.timeout(options.timeoutMs||30000),signal=options.signal?AbortSignal.any([deadline,options.signal]):deadline;
 const verified={};
 for(const kind of ['jar','sources','pom']) {
  const bytes=await downloadArtifact(context,release,kind,{signal,timeoutMs:options.timeoutMs||30000});
  if(kind==='pom')checkPom(bytes,release);else if(bytes.length<4||bytes.readUInt32LE(0)!==0x04034b50)fail('A library artifact is not an ordinary JAR.');
  verified[kind]=bytes;
 }
 if(release.schema===2) {
  const {inspectLibraryJar}=require('./jar');
  for(const [artifact,kind]of [['jar','binary'],['sources','sources']])inspectLibraryJar(verified[artifact],{namespace:release.namespace,coordinate:release.coordinate,kind});
 }
 return verified;
}

// This records project-owned inputs, not authority to execute project code.
// Read the verified source inventory again after downloads and before applying
// a reviewed plan; source changes require another review instead of an upgrade.
async function coreSnapshot(root,requirement) {
 const core=require('../core-contract');
 const record=await core.readProjectCore(root,{required:true});
 if(!core.versionSatisfies(record.coordinate.version,requirement))fail(`This library requires Zero core ${requirement.minVersion} up to ${requirement.maxExclusive} (exclusive); this project has ${record.coordinate.version}. Keep its source and choose a compatible library or deliberately upgrade a copy.`);
 const files=[];
 for(const filename of ['zero-core.json',...record.sources.map(source=>source.path)])files.push({path:filename,sha256:hash(await fs.readFile(await authoring.safePath(root,filename)))});
 return {record,files};
}
function managed(parent,text,label) {
 const start=` zero-sharing ${label} start `,end=` zero-sharing ${label} end `;
 const a=parent.comments.filter(n=>n.text===start),b=parent.comments.filter(n=>n.text===end);
 if(!a.length&&!b.length)return null;
 if(a.length!==1||b.length!==1||a[0].end>=b[0].start)fail('A managed sharing POM block was changed. Restore it or use manual Maven configuration.');
 const nodes=parent.children.filter(n=>n.start>a[0].end&&n.end<b[0].start);
 if(nodes.length!==1||text.slice(a[0].end,nodes[0].start).trim()||text.slice(nodes[0].end,b[0].start).trim())fail('A managed sharing POM block is ambiguous.');
 return {start:a[0].start,end:b[0].end,node:nodes[0]};
}
// Browser export reads the exact dependency blocks written by independent
// Browse/Add without changing that editor's Add/Update/Revert write path.
function inspectManagedLibraryPins(text,{artifactOrigin}={}) {
 const project=parseXml(text),properties=single(project,'properties',true),deps=single(project,'dependencies',true),repos=single(project,'repositories',true);
 const ids=new Set();let repositoryMarked=false;
 for(const node of allNodes(project))for(const comment of node.comments) {
  if(!comment.text.startsWith(' zero-sharing '))continue;
  if(comment.text===' zero-sharing source roots '||comment.text===' zero-sharing published libraries ')continue;
  const marker=/^ zero-sharing (.+) (start|end) $/.exec(comment.text);
  if(!marker)fail('A managed sharing POM marker was changed.');
  if(marker[1]==='repository') {
   if(node!==repos)fail('The managed artifact repository marker is misplaced.');
   repositoryMarked=true;continue;
  }
  const label=/^(lib-r([1-9][0-9]{0,19})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)) (dependency|history)$/.exec(marker[1]);
  if(!label||node!==(label[4]==='dependency'?deps:properties))fail('A managed library marker is invalid or misplaced.');
  ids.add(label[1]);
 }
 const repo=repositoryMarked&&repos&&managed(repos,text,'repository');
 if(repositoryMarked&&!repo||ids.size&&!repo)fail('The managed artifact repository is missing.');
 let repositoryOrigin=null;
 if(repo) {
  const matches=allNodes(project).filter(n=>n.name==='repository'&&value(single(n,'id'))==='zero-sharing');
  if(matches.length!==1||matches[0]!==repo.node||repo.node.children.length!==4||value(single(repo.node,'id'))!=='zero-sharing'||value(single(single(repo.node,'releases'),'enabled'))!=='true'||value(single(single(repo.node,'snapshots'),'enabled'))!=='false')fail('The managed artifact repository changed.');
  const url=value(single(repo.node,'url'));
  try{repositoryOrigin=origin(new URL(url).origin);}catch{fail('The managed artifact repository URL is invalid.');}
  if(url!==repositoryOrigin+'/maven'||artifactOrigin&&repositoryOrigin!==origin(artifactOrigin))fail('The managed artifact repository changed.');
 }
 const pins=[];
 for(const id of [...ids].sort()) {
  const parts=/^lib-r([1-9][0-9]{0,19})-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.exec(id),identity=c.identity('library',parts[1],parts[2]);
  if(identity.id!==id)fail('The managed library identity changed.');
  const owned=deps&&managed(deps,text,`${id} dependency`),history=properties&&managed(properties,text,`${id} history`);
  if(!owned||!history||owned.node.name!=='dependency'||owned.node.children.length!==3||history.node.name!==`zero.sharing.${id}.previous`)fail('The managed dependency or version history changed.');
  const group=value(single(owned.node,'groupId')),artifact=value(single(owned.node,'artifactId')),version=c.validateVersion(value(single(owned.node,'version')));
  const previous=value(history.node);
  if(previous!=='none')c.validateVersion(previous);
  if(group!==identity.coordinate.groupId||artifact!==identity.coordinate.artifactId)fail('The managed dependency or version history changed.');
  const matches=allNodes(project).filter(n=>n.name==='dependency'&&value(single(n,'groupId'))===group&&value(single(n,'artifactId'))===artifact);
  const histories=allNodes(project).filter(n=>n.name===`zero.sharing.${id}.previous`);
  if(matches.length!==1||matches[0]!==owned.node||histories.length!==1||histories[0]!==history.node)fail('The managed dependency or version history changed.');
  pins.push({identity,slug:identity.slug,mode:'published',version,source:'consumer',repositoryOrigin});
 }
 return pins;
}
function addArtifactRepository(text,artifactOrigin) {
 artifactOrigin=origin(artifactOrigin);const doc=parseXml(text),repos=single(doc,'repositories',true),owned=repos&&managed(repos,text,'repository');
 const matches=allNodes(doc).filter(n=>n.name==='repository'&&value(single(n,'id'))==='zero-sharing');
 if(owned) {
  if(matches.length!==1||matches[0]!==owned.node||owned.node.children.length!==4||value(single(owned.node,'url'))!==artifactOrigin+'/maven'||value(single(single(owned.node,'releases'),'enabled'))!=='true'||value(single(single(owned.node,'snapshots'),'enabled'))!=='false')fail('The managed artifact repository changed.');
  return text;
 }
 if(matches.length)fail('A manual artifact repository needs manual Maven changes.');
 const block=`<!-- zero-sharing repository start -->\n    <repository><id>zero-sharing</id><url>${xml(artifactOrigin+'/maven')}</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>\n    <!-- zero-sharing repository end -->`;
 if(repos) {if(repos.selfClosing)fail('Use ordinary Maven repositories configuration.');return text.slice(0,repos.close)+'\n    '+block+'\n  '+text.slice(repos.close);}
 return text.slice(0,doc.close)+'\n  <repositories>\n    '+block+'\n  </repositories>\n'+text.slice(doc.close);
}
async function assertNoShadow(root,release) {
 const roots=['src/main/java'];
 for(const lib of await authoring.discoverLibraries(root))if(lib.mode==='local')roots.push(`${lib.folder}/src/main/java`);
 for(const sourceRoot of roots)for(const filename of await authoring.javaFiles(root,sourceRoot)) {
  const source=await authoring.read(root,filename);
  const decl=sourceRoot==='src/main/java'?authoring.applicationDeclaration(source,filename):authoring.declaration(source,filename);
  if(decl.packageName===release.namespace||decl.packageName.startsWith(release.namespace+'.'))fail(`Source shadows the published library: ${filename}. Keep your edits and choose the library's explicit local/published mode or move the copy.`);
 }
}
async function planChange(root,context,release,{operation='add',signal}={}) {
 release=selected(context,release);if(release.kind!=='library'||!['add','update','revert'].includes(operation))fail('Choose Add, Update or Revert for a library.');
 root=path.resolve(root);await authoring.read(root,'zero.json');const beforeText=await authoring.read(root,'pom.xml');
 const coreInputs=release.schema===2?await coreSnapshot(root,release.coreRequirement):null;
 await assertNoShadow(root,release);
 const doc=parseXml(beforeText),properties=single(doc,'properties'),deps=single(doc,'dependencies'),repos=single(doc,'repositories',true);
 if(value(single(properties,'maven.compiler.release'))!==c.JAVA_RELEASE||value(single(properties,'javafx.version'))!==c.JAVAFX_VERSION||properties.selfClosing||deps.selfClosing||repos?.selfClosing)fail('Use the ordinary Zero Java/JavaFX project POM.');
 if(allNodes(doc).some(n=>['parent','profiles','dependencyManagement','pluginManagement','sourceDirectory','testSourceDirectory'].includes(n.name)||(['release','source','target','compilerArgs','compilerArguments','jdkToolchain'].includes(n.name)&&n.parent.name==='configuration')))fail('Custom Maven projects need manual library integration.');
 const id=release.id,owned=managed(deps,beforeText,`${id} dependency`),history=managed(properties,beforeText,`${id} history`),repo=repos&&managed(repos,beforeText,'repository');
 const matches=allNodes(doc).filter(n=>n.name==='dependency'&&value(single(n,'groupId'))===release.coordinate.groupId&&value(single(n,'artifactId'))===release.coordinate.artifactId);
 const histories=allNodes(doc).filter(n=>n.name===`zero.sharing.${id}.previous`),repositoryNodes=allNodes(doc).filter(n=>n.name==='repository'&&value(single(n,'id'))==='zero-sharing');
 let current=null,previous=null;
 if(owned) {
  if(matches.length!==1||matches[0]!==owned.node||owned.node.children.length!==3||!history||history.node.name!==`zero.sharing.${id}.previous`||histories.length!==1||histories[0]!==history.node||!repo)fail('The managed dependency or version history changed.');
  current=c.validateVersion(value(single(owned.node,'version')));const old=value(history.node);previous=old==='none'?null:c.validateVersion(old);
 } else if(matches.length||history||histories.length)fail('An existing manual/authored dependency needs its local/published mode or manual Maven changes.');
 if(repo&&(repositoryNodes.length!==1||repositoryNodes[0]!==repo.node||repo.node.children.length!==4||value(single(repo.node,'url'))!==context.artifactOrigin+'/maven'||value(single(single(repo.node,'releases'),'enabled'))!=='true'||value(single(single(repo.node,'snapshots'),'enabled'))!=='false'))fail('The managed artifact repository changed.');
 if(!repo&&repositoryNodes.length)fail('A manual artifact repository needs manual Maven changes.');
 if(operation==='add'&&current)fail('This library is installed. Choose Update or Revert.');
 if(operation!=='add'&&!current)fail('Add the library first.');
 if(operation==='revert'&&(!previous||release.version!==previous))fail('Choose the recorded preceding exact version to Revert.');
 if(current===release.version)fail('This exact version is already installed.');
 if(operation==='update') {const a=release.version.split('.').map(Number),b=current.split('.').map(Number);if(a[0]!==b[0]||a[1]!==b[1]||a[2]<=b[2])fail('Update supports a newer compatible patch. Choose another exact version manually for a larger API change.');}
 await verifyLibrary(context,release,{signal});
 if(coreInputs&&JSON.stringify(await coreSnapshot(root,release.coreRequirement))!==JSON.stringify(coreInputs))fail('Project Zero core changed during review. Choose the library again; no dependency edit applied.');
 const wrap=(label,body)=>`<!-- zero-sharing ${label} start -->\n${body}\n    <!-- zero-sharing ${label} end -->`,edits=[];
 function edit(parent,old,content){edits.push(old?{start:old.start,end:old.end,text:content}:{start:parent.close,end:parent.close,text:`\n    ${content}\n  `});}
 edit(deps,owned,wrap(`${id} dependency`,`    <dependency><groupId>${release.coordinate.groupId}</groupId><artifactId>${release.coordinate.artifactId}</artifactId><version>${release.version}</version></dependency>`));
 edit(properties,history,wrap(`${id} history`,`    <zero.sharing.${id}.previous>${current||'none'}</zero.sharing.${id}.previous>`));
 if(!repo){const content=wrap('repository',`    <repository><id>zero-sharing</id><url>${xml(context.artifactOrigin+'/maven')}</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>`);if(repos)edit(repos,null,content);else edits.push({start:doc.close,end:doc.close,text:`\n  <repositories>\n    ${content}\n  </repositories>\n`});}
 let afterText=beforeText;for(const e of edits.sort((a,b)=>b.start-a.start))afterText=afterText.slice(0,e.start)+e.text+afterText.slice(e.end);parseXml(afterText);
 return {schema:1,root,beforeText,afterText,beforeHash:hash(beforeText),current,previous,release,operation,fingerprint:context.fingerprint,...(coreInputs?{coreInputs}:{})};
}
async function validatePlan(plan,context,options={}) {
 const fresh=await loadCatalog({catalogUrl:context.catalogUrl,artifactOrigin:context.artifactOrigin},{fetcher:context.fetcher,...options});
 if(fresh.fingerprint!==plan.fingerprint)fail('The catalog changed during review. Choose the release again.');
 const release=fresh.catalog.releases.find(r=>r.id===plan.release.id&&r.version===plan.release.version);
 if(!release)fail('The selected exact release is no longer available.');
 const again=await planChange(plan.root,fresh,release,{operation:plan.operation,...options});
 if(again.beforeText!==plan.beforeText||again.afterText!==plan.afterText)fail('The POM changed during review. No dependency edit applied.');
 if(JSON.stringify(again.coreInputs)!==JSON.stringify(plan.coreInputs))fail('Project Zero core changed after review. Choose the library again; no dependency edit applied.');
}
async function downloadGame(context,release,options={}) {if(release.kind!=='game')fail('Choose a game.');return downloadArtifact(context,release,'zip',options);}
module.exports={origin,catalogUrl,readBytes,loadCatalog,downloadArtifact,verifyLibrary,inspectManagedLibraryPins,planChange,validatePlan,downloadGame,assertNoShadow,addArtifactRepository};
