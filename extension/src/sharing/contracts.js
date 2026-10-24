'use strict';

// Pure sharing contracts shared by the packaged editor and trusted platform code.
// Validation does not authenticate a requester or establish execution authority.
const SCHEMA=1;
const JAVA_RELEASE='17';
const JAVAFX_VERSION='21.0.12';
const LIMITS=Object.freeze({metadataBytes:65536,librarySourceBytes:1048576,
  artifactBytes:16777216,gameSourceBytes:52428800,gameArchiveBytes:104857600,
  libraryFiles:64,gameFiles:512,catalogBytes:4194304,catalogReleases:5000});
const HEX40=/^[a-f0-9]{40}$/;
const HEX64=/^[a-f0-9]{64}$/;
const OWNER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const SLUG=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const JAVA_NAME=/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const fail=message=>{throw new Error(message);};
const bytes=value=>new TextEncoder().encode(value).length;
function record(value,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${label}.`);
  return value;
}
function keys(value,allowed,required,label) {
  record(value,label);
  if(Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key))) fail(`Unsupported ${label} fields.`);
}
function text(value,label,max=200,{empty=false}={}) {
  if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`Invalid ${label}.`);
  return value;
}
function numericId(value,label='GitHub ID') {
  if(typeof value!=='string'||! /^[1-9][0-9]{0,19}$/.test(value)) fail(`Invalid ${label}; use its decimal string.`);
  return value;
}
function kind(value) {if(!['library','game'].includes(value))fail('Choose library or game.');return value;}
function digest(value,pattern,label) {if(typeof value!=='string'||!pattern.test(value))fail(`Invalid ${label}.`);return value;}
function bounded(value,max,label) {if(bytes(JSON.stringify(value))>max)fail(`${label} is too large.`);return value;}
function validateSlug(value) {if(typeof value!=='string'||value.length>48||!SLUG.test(value))fail('Use a lowercase library/game name with single hyphens.');return value;}
function validateVersion(value) {if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(value))fail('Use an exact version such as 0.1.0.');return value;}
function validateCoreRequirement(value) {
  keys(value,['minVersion','maxExclusive'],['minVersion','maxExclusive'],'core requirement');
  validateVersion(value.minVersion);validateVersion(value.maxExclusive);
  const min=value.minVersion.split('.').map(Number),max=value.maxExclusive.split('.').map(Number);
  if(min[0]!==0||max[0]!==0||max[1]!==min[1]+1||max[2]!==0)fail('Core requirements must stay within one 0.x minor line.');
  return {...value};
}
function versionSatisfies(version,requirement) {
  validateVersion(version);const range=validateCoreRequirement(requirement);
  const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return 0;};
  return compare(version,range.minVersion)>=0&&compare(version,range.maxExclusive)<0;
}
function validateCoreInput(value,requirement) {
  keys(value,['version','sourceSha256'],['version','sourceSha256'],'core input');
  validateVersion(value.version);digest(value.sourceSha256,HEX64,'core source digest');
  if(!versionSatisfies(value.version,requirement))fail('Core input version is outside the required range.');
  return {...value};
}
function validateCoreBuild(value,requirement) {
  const fields=['version','sourceSha256','jarSha256','buildRecipeSha256','javaRelease','javafxVersion'];
  keys(value,fields,fields,'core build');
  validateCoreInput({version:value.version,sourceSha256:value.sourceSha256},requirement);
  digest(value.jarSha256,HEX64,'core JAR digest');digest(value.buildRecipeSha256,HEX64,'core build recipe digest');
  if(value.javaRelease!==JAVA_RELEASE||value.javafxVersion!==JAVAFX_VERSION)fail('Unsupported core Java/JavaFX build requirements.');
  return {...value};
}
function validateFolder(value) {
  if(value==='.')return value;
  if(typeof value!=='string'||value.length>240||value.split('/').some(part=>! /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(part)||part==='.'||part==='..')) fail('Use a safe relative project folder.');
  return value;
}
function validateRepository(value) {
  keys(value,['id','ownerId','owner','name','url'],['id','ownerId','owner','name','url'],'repository');
  numericId(value.id,'repository ID');numericId(value.ownerId,'repository owner ID');
  if(typeof value.owner!=='string'||!OWNER.test(value.owner))fail('Invalid GitHub owner.');
  if(typeof value.name!=='string'||! /^[A-Za-z0-9_.-]{1,100}$/.test(value.name)||['.','..'].includes(value.name)||value.name.endsWith('.git'))fail('Invalid GitHub repository name.');
  if(value.url!==`https://github.com/${value.owner}/${value.name}`)fail('Use the exact GitHub repository page URL.');
  return {...value};
}
function identity(type,repositoryId,slug) {
  kind(type);numericId(repositoryId,'repository ID');validateSlug(slug);
  const result={kind:type,id:`${type==='library'?'lib':'game'}-r${repositoryId}-${slug}`,slug,repositoryId};
  if(type==='library')Object.assign(result,{namespace:`zero.contrib.r${repositoryId}.${slug.replaceAll('-','_')}`,
    coordinate:{groupId:`ca.codepet.zero.contrib.r${repositoryId}`,artifactId:slug}});
  return result;
}
// Hosted pages are external mutable destinations, never registry artifacts.
function validateWebUrl(value) {
  if(typeof value!=='string'||value.length>2048||/[\\\s?#]/.test(value))fail('Use a canonical HTTPS playable page URL.');
  let url;try{url=new URL(value);}catch{fail('Invalid playable page URL.');}
  const labels=url.hostname.split('.');
  if(url.protocol!=='https:'||url.href!==value||url.port||url.username||url.password||labels.length<2||
    labels.some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||
    (labels.at(-1).length<2||!/[a-z]/.test(labels.at(-1)))||['localhost','local','internal'].includes(labels.at(-1)))fail('Use a canonical public HTTPS playable page URL.');
  return value;
}
function validateWebPublication(value,{commit}={}) {
  keys(value,['provider','url','commit','runId'],['provider','url','commit','runId'],'web publication');
  if(value.provider!=='github-pages')fail('Unsupported web publication provider.');
  validateWebUrl(value.url);digest(value.commit,HEX40,'web source commit');
  if(!Number.isSafeInteger(value.runId)||value.runId<1)fail('Invalid web publishing run.');
  if(commit!==undefined&&value.commit!==commit)fail('Publish the exact shared source version before including Play.');
  return {...value};
}
function validateDescriptor(value) {
  const common=['schema','kind','slug','version','title','description','license','preview'];
  const core=value?.schema===2?['coreRequirement','coreInput']:[];
  keys(value,[...common,'libraryKind','controls',...core],[...common.filter(key=>key!=='preview'),...core],'sharing descriptor');
  if(value.schema!==SCHEMA&&!(value.schema===2&&value.kind==='library'))fail('Unsupported sharing descriptor schema.');
  kind(value.kind);validateSlug(value.slug);validateVersion(value.version);
  text(value.title,'title',120);text(value.description,'description',4000);text(value.license,'license',100);
  const result={...value};
  if(value.schema===2){result.coreRequirement=validateCoreRequirement(value.coreRequirement);result.coreInput=validateCoreInput(value.coreInput,result.coreRequirement);}
  if(Object.hasOwn(value,'preview')){validateFolder(value.preview);if(!value.preview.endsWith('.png'))fail('Use a PNG preview.');}
  if(value.kind==='library'){
    if(!['widget','helper'].includes(value.libraryKind)||Object.hasOwn(value,'controls'))fail('Choose widget or helper for the library.');
  }else{ text(value.controls,'game controls',4000);if(Object.hasOwn(value,'libraryKind'))fail('A game is not a library kind.'); }
  return bounded(result,LIMITS.metadataBytes,'Descriptor');
}
function person(value,label) {
  keys(value,['githubId','login'],['githubId','login'],label);numericId(value.githubId);
  if(typeof value.login!=='string'||!OWNER.test(value.login))fail(`Invalid ${label} login.`);
  return {...value};
}
function validateRequest(value) {
  const required=['schema','kind','slug','version','repository','requester','commit','folder','descriptor','policyRevision'];
  keys(value,[...required,'web'],required,'publication request');
  if(value.schema!==SCHEMA)fail('Unsupported publication request schema.');
  kind(value.kind);validateSlug(value.slug);validateVersion(value.version);
  const repository=validateRepository(value.repository),requester=person(value.requester,'requester'),descriptor=validateDescriptor(value.descriptor);
  digest(value.commit,HEX40,'source commit');digest(value.policyRevision,HEX40,'policy revision');validateFolder(value.folder);
  if(requester.githubId!==repository.ownerId)fail('Publish from a repository owned by your GitHub account.');
  if(descriptor.kind!==value.kind||descriptor.slug!==value.slug||descriptor.version!==value.version)fail('Request and descriptor disagree.');
  if(value.folder!==(value.kind==='game'?'.':`libraries/${value.slug}`))fail('Use the root game or its matching library folder.');
  let web;if(Object.hasOwn(value,'web')){if(value.kind!=='game')fail('Only games have a web publication.');web=validateWebPublication(value.web,{commit:value.commit});}
  return bounded({...value,repository,requester,descriptor,...(web?{web}:{})},LIMITS.metadataBytes,'Publication request');
}
function artifactPath(item,version,type) {
  const derived=identity(item.kind,item.repositoryId,item.slug);validateVersion(version);
  if(item.id&&item.id!==derived.id)fail('Artifact identity mismatch.');
  if(type==='preview')return `previews/${derived.id}/${version}/preview.png`;
  if(item.kind==='game'&&type==='zip')return `games/${derived.id}/${version}/project.zip`;
  if(item.kind!=='library'||!['jar','sources','pom'].includes(type))fail('Unsupported artifact kind.');
  const suffix=type==='sources'?'-sources.jar':type==='jar'?'.jar':'.pom';
  return `maven/${derived.coordinate.groupId.replaceAll('.','/')}/${item.slug}/${version}/${item.slug}-${version}${suffix}`;
}
function configuredOrigin(value) {
  let url;try{url=new URL(value);}catch{fail('Invalid artifact origin.');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.origin!==value||url.username||url.password||url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))fail('Use an HTTPS artifact origin or explicit loopback fixture.');
  return value;
}
function validateRelease(value,{artifactOrigin}={}) {
  const required=['schema','kind','id','slug','version','title','description','license','repository','contributor','source','policyRevision','status','artifacts'];
  const core=value?.schema===2?['coreRequirement','coreBuild']:[];
  keys(value,[...required,'namespace','coordinate','libraryKind','components','controls','web',...core],[...required,...core],'release');
  if(value.schema!==SCHEMA&&!(value.schema===2&&value.kind==='library'))fail('Unsupported release schema.');
  if(value.schema===2){validateCoreRequirement(value.coreRequirement);validateCoreBuild(value.coreBuild,value.coreRequirement);}
  const repository=validateRepository(value.repository),contributor=person(value.contributor,'contributor');
  const item=identity(value.kind,repository.id,value.slug);validateVersion(value.version);
  if(value.id!==item.id||contributor.githubId!==repository.ownerId)fail('Release ownership/identity mismatch.');
  text(value.title,'title',120);text(value.description,'description',4000);text(value.license,'license',100);
  keys(value.source,['commit','folder','sha256'],['commit','folder','sha256'],'release source');
  digest(value.source.commit,HEX40,'source commit');digest(value.source.sha256,HEX64,'source digest');validateFolder(value.source.folder);
  if(value.source.folder!==(value.kind==='game'?'.':`libraries/${value.slug}`))fail('Release source folder mismatch.');
  if(Object.hasOwn(value,'web')){if(value.kind!=='game')fail('Only games have a web publication.');validateWebPublication(value.web,{commit:value.source.commit});}
  digest(value.policyRevision,HEX40,'policy revision');if(!['available','withdrawn'].includes(value.status))fail('Unsupported release availability.');
  const requiredArtifacts=value.kind==='library'?['jar','sources','pom']:['zip'];
  keys(value.artifacts,[...requiredArtifacts,'preview'],requiredArtifacts,'release artifacts');
  let origin=artifactOrigin&&configuredOrigin(artifactOrigin);
  for(const [type,artifact]of Object.entries(value.artifacts)){
    keys(artifact,['path','url','size','sha256'],['path','url','size','sha256'],'artifact');
    if(artifact.path!==artifactPath(item,value.version,type))fail('Artifact path does not match the release.');
    const maximum=type==='zip'?LIMITS.gameArchiveBytes:LIMITS.artifactBytes;
    if(!Number.isSafeInteger(artifact.size)||artifact.size<1||artifact.size>maximum)fail('Artifact size is outside its bounds.');
    digest(artifact.sha256,HEX64,'artifact hash');
    let url;try{url=new URL(artifact.url);}catch{fail('Invalid artifact URL.');}
    if(!origin){if(url.protocol!=='https:')fail('Loopback artifacts need an explicit fixture origin.');origin=configuredOrigin(url.origin);}
    if(artifact.url!==`${origin}/${artifact.path}`||url.username||url.password)fail('Artifact URL is outside the configured store.');
  }
  if(value.kind==='library'){
    if(value.namespace!==item.namespace||!['widget','helper'].includes(value.libraryKind)||Object.hasOwn(value,'controls'))fail('Library namespace/kind mismatch.');
    keys(value.coordinate,['groupId','artifactId','version'],['groupId','artifactId','version'],'library coordinate');
    if(value.coordinate.groupId!==item.coordinate.groupId||value.coordinate.artifactId!==item.slug||value.coordinate.version!==value.version)fail('Library coordinates mismatch.');
    if(value.components!==undefined){
      if(!Array.isArray(value.components)||value.components.length>64)fail('Invalid component inventory.');
      const names=new Set();for(const component of value.components){
        keys(component,['className','description','usage','api'],['className','description','usage','api'],'component');
        if(typeof component.className!=='string'||!JAVA_NAME.test(component.className)||!component.className.startsWith(`${item.namespace}.`)||names.has(component.className))fail('Invalid library class inventory.');
        names.add(component.className);text(component.description,'component description',4000,{empty:true});text(component.usage,'usage example',8000,{empty:true});
        if(!Array.isArray(component.api)||component.api.length>100)fail('Invalid API inventory.');component.api.forEach(signature=>text(signature,'API signature',1000));
      }
    }
  }else{
    text(value.controls,'game controls',4000);
    if(['namespace','coordinate','libraryKind','components'].some(key=>Object.hasOwn(value,key)))fail('Games are separate projects, not dependencies.');
  }
  return bounded(JSON.parse(JSON.stringify({...value,repository,contributor})),LIMITS.metadataBytes,'Release metadata');
}
function validateCatalog(value,options={}) {
  keys(value,['schema','revision','releases'],['schema','revision','releases'],'catalog');
  if(value.schema!==SCHEMA)fail('Unsupported catalog schema.');digest(value.revision,HEX40,'registry revision');
  if(!Array.isArray(value.releases)||value.releases.length>LIMITS.catalogReleases)fail('Catalog has too many releases.');
  const seen=new Set(),releases=value.releases.map(release=>{
    const checked=validateRelease(release,options),key=`${checked.kind}/${checked.id}/${checked.version}`;
    if(seen.has(key))fail('Duplicate release in catalog.');seen.add(key);return checked;
  });
  return bounded({schema:SCHEMA,revision:value.revision,releases},LIMITS.catalogBytes,'Catalog');
}
function publicationUrl(request,{repository='codepetca/zero'}={}) {
  const checked=validateRequest(request);
  if(! /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository))fail('Invalid publication repository.');
  const query=new URLSearchParams({template:'sharing.md',title:`Share ${checked.kind}: ${checked.descriptor.title} ${checked.version}`,
    body:`Check publication status at https://zero.codepet.ca/hub/share after submitting your request.\n\nZero publication request\n\n\`\`\`json\n${JSON.stringify(checked,null,2)}\n\`\`\`\n`});
  const url=`https://github.com/${repository}/issues/new?${query}`;
  if(url.length>12000)fail('Publication details are too large for the GitHub form.');return url;
}
module.exports={validateCoreRequirement,versionSatisfies,validateCoreInput,validateCoreBuild,SCHEMA,JAVA_RELEASE,JAVAFX_VERSION,LIMITS,validateSlug,validateVersion,
  validateFolder,validateRepository,identity,validateDescriptor,validateRequest,
  validateRelease,validateCatalog,artifactPath,publicationUrl,validateWebUrl,validateWebPublication};
