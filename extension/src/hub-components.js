'use strict';
const {createHash} = require('node:crypto');
const {parseXml, single, value, allNodes, projectFiles} = require('./project-pom');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => {throw new Error(message);};
const GROUP = 'ca.codepet.zero.library';
const idPattern = /^ui[1-9a-z][0-9a-z]{0,11}$/;
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const xml = text => text.replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
function origin(input) {
  const url = new URL(input);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) fail('Choose an HTTPS hub origin, or an explicit loopback origin for local development.');
  return url.origin;
}
async function readBytes(url, fetcher, limit, timeoutMs=15_000) {
  const response = await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  if (!response.ok || !response.body) fail('The component hub is unavailable. Your app has not changed.');
  const chunks=[]; let size=0;
  const reader=response.body.getReader();
  try {
    while (true) {
      const {done,value:chunk}=await reader.read(); if (done) break;
      size+=chunk.byteLength; if(size>limit) fail('The hub response is too large.'); chunks.push(Buffer.from(chunk));
    }
  } finally {await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}
function validateCatalog(catalog) {
  if (!catalog || !['local','production'].includes(catalog.mode) || !Array.isArray(catalog.libraries) || catalog.libraries.length>500) fail('Invalid hub catalog.');
  const seen=new Set();
  for (const release of catalog.libraries) {
    const {libraryId:id,version}=release;
    if (!idPattern.test(id||'') || !versionPattern.test(version||'') || seen.has(`${id}:${version}`) || release.status!=='automatically-checked' || release.namespace!==`zero.${id}` || release.coordinate?.groupId!==GROUP || release.coordinate?.artifactId!==id || release.coordinate?.version!==version || !/^[a-f0-9]{64}$/.test(release.sourceDigest||'')) fail('Invalid immutable hub release.');
    seen.add(`${id}:${version}`);
    if(typeof release.title!=='string' || !release.title.trim() || release.title.length>200 || !Array.isArray(release.components) || !release.components.length || release.components.length>32) fail('Invalid hub library metadata.');
    const classes=new Set();
    for(const component of release.components) {
      if(!/^[A-Z][A-Za-z0-9]{0,63}$/.test(component.className||'') || classes.has(component.className)) fail('Invalid hub component name.');
      classes.add(component.className);
    }
    for(const [kind,suffix] of Object.entries({jar:'.jar',sources:'-sources.jar',pom:'.pom'})) {
      const artifact=release.artifacts?.[kind];
      const expected=`/api/hub/maven/ca/codepet/zero/library/${id}/${version}/${id}-${version}${suffix}`;
      if(artifact?.path!==expected || !/^[a-f0-9]{64}$/.test(artifact.sha256||'') || !Number.isSafeInteger(artifact.size) || artifact.size<1 || artifact.size>10*1024*1024) fail('Invalid hub artifact binding.');
    }
  }
  return catalog;
}
async function loadCatalog(input,{fetcher=fetch,now=()=>performance.now()}={}) {
  const hubOrigin=origin(input),pages=[],libraries=[],cursors=new Set();let cursor=null,catalog;
  const started=now();let transferred=0;
  do {
    const remaining=30_000-Math.ceil(now()-started);
    if(remaining<=0)fail('Catalog download timed out. Browse the ZeroHub website for exact versions and manual Maven instructions.');
    const query=new URLSearchParams({history:'1'});if(cursor)query.set('cursor',cursor);
    const bytes=await readBytes(`${hubOrigin}/api/hub/catalog?${query}`,fetcher,4*1024*1024,Math.min(15_000,remaining));
    transferred+=bytes.length;
    if(transferred>16*1024*1024)fail('Catalog download exceeds 16 MiB. Browse the ZeroHub website for exact versions and manual Maven instructions.');
    if(now()-started>=30_000)fail('Catalog download timed out. Browse the ZeroHub website for exact versions and manual Maven instructions.');
    const page=validateCatalog(JSON.parse(bytes.toString('utf8')));
    if(Object.hasOwn(page,'nextCursor')&&(page.libraries.length>20||!(page.nextCursor===null||typeof page.nextCursor==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(page.nextCursor))))fail('Invalid hub catalog page.');
    if(catalog&&(page.mode!==catalog.mode||JSON.stringify(page.capabilities)!==JSON.stringify(catalog.capabilities)))fail('The hub catalog changed. Browse again.');
    libraries.push(...page.libraries);pages.push(hash(bytes));catalog=page;
    cursor=page.nextCursor??null;
    if(libraries.length>500||cursor&&libraries.length>=500)fail('This hub has more than 500 releases. Browse the ZeroHub website for exact versions and manual Maven instructions.');
    if(cursor&&!page.libraries.length)fail('Invalid hub catalog page. Browse the ZeroHub website.');
    if(cursor&&cursors.has(cursor))fail('The hub catalog did not advance. Browse the ZeroHub website.');
    if(cursor)cursors.add(cursor);
  }while(cursor);
  catalog=validateCatalog({...catalog,libraries,nextCursor:null});
  return {catalog,origin:hubOrigin,fingerprint:hash(JSON.stringify(pages)),fetcher};
}
async function verifyRelease(context,release) {
  for(const kind of ['jar','sources','pom']) {
    const artifact=release.artifacts[kind];
    const bytes=await readBytes(context.origin+artifact.path,context.fetcher,artifact.size);
    if(bytes.length!==artifact.size || hash(bytes)!==artifact.sha256) fail('A hub artifact changed after checking. No dependency edit applied.');
    if(kind==='pom') {
      const pom=parseXml(bytes.toString('utf8'));
      if(value(single(pom,'groupId'))!==GROUP || value(single(pom,'artifactId'))!==release.libraryId || value(single(pom,'version'))!==release.version) fail('Hub POM coordinates do not match the checked release.');
      if(allNodes(pom).some(node=>['parent','profiles','repositories','pluginRepositories','build','dependencyManagement'].includes(node.name))) fail('Hub release has unsupported Maven configuration.');
      for(const dep of single(pom,'dependencies').children) {
        if(dep.name!=='dependency' || value(single(dep,'groupId'))!=='org.openjfx' || !['javafx-controls','javafx-swing'].includes(value(single(dep,'artifactId'))) || value(single(dep,'version'))!=='21.0.12' || dep.children.length!==3) fail('Hub dependency policy is unsupported.');
      }
      const license=single(pom,'licenses');
      if(!license.children.some(node=>node.name==='license' && ['MIT','MIT License'].includes(value(single(node,'name'))))) fail('The hub POM must declare MIT.');
    }
  }
}
function block(parent,text,label,required=false) {
  const start=` Zero hub ${label}: start `,end=` Zero hub ${label}: end `;
  const a=parent.comments.filter(c=>c.text===start),b=parent.comments.filter(c=>c.text===end);
  if(!a.length&&!b.length&&!required)return null;
  if(a.length!==1||b.length!==1||a[0].end>b[0].start)fail('A managed hub block was edited. Restore it or manage the dependency manually.');
  const nodes=parent.children.filter(n=>n.start>a[0].end&&n.end<b[0].start);
  if(nodes.length!==1||text.slice(a[0].end,nodes[0].start).trim()||text.slice(nodes[0].end,b[0].start).trim())fail('A managed hub block is ambiguous.');
  return {start:a[0].start,end:b[0].end,node:nodes[0]};
}
async function planChange(root,context,release,{operation='add'}={}) {
  if(!['add','update','revert'].includes(operation))fail('Choose Add, Update or Revert.');
  const id=release.libraryId;
  if(!context.catalog.libraries.some(item=>JSON.stringify(item)===JSON.stringify(release)))fail('Choose a listed release.');
  const snapshot=await projectFiles(root,{components:release.components.map(c=>({className:`zero.${id}.${c.className}`}))});
  const text=snapshot.beforeText,doc=parseXml(text),properties=single(doc,'properties'),deps=single(doc,'dependencies'),repos=single(doc,'repositories',true);
  if(properties.selfClosing||deps.selfClosing||repos?.selfClosing||value(single(properties,'maven.compiler.release'))!=='17'||value(single(properties,'javafx.version'))!=='21.0.12')fail('Use the ordinary Zero Java 17 / JavaFX 21.0.12 POM.');
  for(const node of allNodes(doc)) {
    if(['parent','profiles','dependencyManagement','pluginManagement','sourceDirectory','testSourceDirectory'].includes(node.name))fail('Managed Maven projects require manual hub configuration.');
    if(['release','source','target','compilerArgs','compilerArguments','jdkToolchain'].includes(node.name)&&node.parent.name==='configuration')fail('Compiler overrides require manual configuration.');
    if(['maven.compiler.release','maven.compiler.source','maven.compiler.target','javafx.version'].includes(node.name)&&node.parent!==properties)fail('Java compatibility overrides require manual configuration.');
    if(node.name==='dependency') {
      const group=value(single(node,'groupId')),artifact=value(single(node,'artifactId'));
      if(group.includes('${')||artifact.includes('${')|| (group==='org.openjfx'&&!['21.0.12','${javafx.version}'].includes(value(single(node,'version')))))fail('Dependency overrides require manual configuration.');
    }
  }
  const owned=block(deps,text,`${id} dependency`),history=block(properties,text,`${id} history`),repo=repos&&block(repos,text,'repository');
  const matches=allNodes(doc).filter(n=>n.name==='dependency'&&value(single(n,'groupId'))===GROUP&&value(single(n,'artifactId'))===id);
  const histories=allNodes(doc).filter(n=>n.name===`zero.hub.${id}.previous`);
  const repositoryNodes=allNodes(doc).filter(n=>n.name==='repository'&&value(single(n,'id'))==='zero-hub');
  let current=null,previous=null;
  if(owned) {
    if(matches.length!==1||matches[0]!==owned.node||owned.node.children.length!==3||!history||history.node.name!==`zero.hub.${id}.previous`||histories.length!==1||histories[0]!==history.node||!repo)fail('The managed hub dependency is incomplete or manually changed.');
    current=value(single(owned.node,'version'));previous=value(history.node);if(previous==='none')previous=null;
    if(!versionPattern.test(current)|| (previous&&!versionPattern.test(previous)))fail('Invalid managed hub version history.');
  } else if(matches.length||history||histories.length)fail('A manual or duplicate hub dependency needs manual configuration.');
  const repositoryUrl=`${context.origin}/api/hub/maven`;
  if(repo&&(repositoryNodes.length!==1||repositoryNodes[0]!==repo.node||repo.node.children.length!==4||value(single(repo.node,'id'))!=='zero-hub'||value(single(repo.node,'url'))!==repositoryUrl||value(single(single(repo.node,'releases'),'enabled'))!=='true'||value(single(single(repo.node,'snapshots'),'enabled'))!=='false'))fail('The managed hub repository changed. Choose its original hub.');
  if(!repo&&repositoryNodes.length)fail('A manual hub repository requires manual configuration.');
  if(operation==='add'&&current)fail(`Library ${id} is already installed at ${current}. Choose Update or Revert.`);
  if(operation!=='add'&&!current)fail('Add the library first.');
  if(operation==='revert'&&(!previous||release.version!==previous))fail('Choose the recorded preceding library version to Revert.');
  if(operation==='update') {
    const a=release.version.split('.').map(Number),b=current.split('.').map(Number);
    if(a[0]!==b[0]||a[1]!==b[1]||a[2]<=b[2])fail('Update supports a newer compatible patch; use Revert for the preceding pin.');
  }
  if(current===release.version)fail('That exact version is already installed.');
  await verifyRelease(context,release);
  const newline=text.includes('\r\n')?'\r\n':'\n';
  const wrap=(label,body)=>`<!-- Zero hub ${label}: start -->${newline}${body}${newline}    <!-- Zero hub ${label}: end -->`;
  const changes=[];
  function edit(parent,old,content) {
    if(old)changes.push({start:old.start,end:old.end,text:content});
    else changes.push({start:parent.close,end:parent.close,text:`${newline}    ${content}${newline}  `});
  }
  edit(deps,owned,wrap(`${id} dependency`,`    <dependency><groupId>${GROUP}</groupId><artifactId>${id}</artifactId><version>${release.version}</version></dependency>`));
  edit(properties,history,wrap(`${id} history`,`    <zero.hub.${id}.previous>${current||'none'}</zero.hub.${id}.previous>`));
  if(!repo) {
    const content=wrap('repository',`    <repository><id>zero-hub</id><url>${xml(repositoryUrl)}</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>`);
    if(repos)edit(repos,null,content);
    else changes.push({start:doc.close,end:doc.close,text:`${newline}  <repositories>${newline}    ${content}${newline}  </repositories>${newline}`});
  }
  let afterText=text;for(const change of changes.sort((a,b)=>b.start-a.start))afterText=afterText.slice(0,change.start)+change.text+afterText.slice(change.end);
  parseXml(afterText);
  return {...snapshot,afterText,operation,release,current,previous,fingerprint:context.fingerprint,origin:context.origin};
}
async function validatePlan(plan,context) {
  const fresh=await loadCatalog(context.origin,{fetcher:context.fetcher});
  if(fresh.fingerprint!==plan.fingerprint)fail('The hub catalog changed. Review a fresh dependency plan.');
  const release=fresh.catalog.libraries.find(r=>r.libraryId===plan.release.libraryId&&r.version===plan.release.version);
  const again=await planChange(plan.root,fresh,release,{operation:plan.operation});
  if(again.beforeHash!==plan.beforeHash||again.afterText!==plan.afterText)fail('Your POM changed during review. No dependency edit applied.');
}
module.exports={origin,validateCatalog,loadCatalog,verifyRelease,planChange,validatePlan};
