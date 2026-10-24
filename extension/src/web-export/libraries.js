'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {discoverLibraries,declaration,applicationDeclaration}=require('../sharing/authoring');
const {loadCatalog,verifyLibrary,inspectManagedLibraryPins}=require('../sharing/consumer');
const {readKitConfiguration}=require('../sharing/configuration');
const core=require('../core-contract');
const {isTutorialPractice,practiceCatalogUrl}=require('../sharing/tutorial-practice');

const {inspectJar}=require('../sharing/jar');
const resourceExtension=/\.(?:png|jpe?g|gif|webp|bmp|svg|avif|ico|wav|mp3|ogg|txt|json|csv|properties|xml|fxml|css|ttf|otf|md)$/i;
const fail=message=>{throw new Error('Browser library: '+message);};
function add(target,name,bytes,kind,originalPath=name) {
 const folded=name.toLowerCase();
 if(target.some(entry=>entry.path.toLowerCase()===folded))fail(`${kind} collision: ${name}`);
 target.push({path:name,bytes,originalPath});
}
async function discoverBrowserLibraries(projectRoot,pomText) {
 const state=await fs.access(path.join(projectRoot,'zero-libraries.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
 const authored=state?(await discoverLibraries(projectRoot)).map(library=>({...library,source:'authored'})):[];
 const managed=pomText.includes('zero-sharing')?inspectManagedLibraryPins(pomText):[];
 const ids=new Set(authored.map(library=>library.identity.id));
 for(const library of managed) {
  if(ids.has(library.identity.id))fail(`authored and independent library modes overlap: ${library.identity.id}`);
  ids.add(library.identity.id);
 }
 return [...authored,...managed];
}
// Share the same original-application namespace rule in full and saved checks.
function assertApplicationNamespaces(files,libraries) {
 if(!libraries.length)return;
 for(const file of files) {
  const pkg=applicationDeclaration(file.bytes.toString('utf8'),file.originalPath).packageName;
  for(const library of libraries)if(pkg===library.identity.namespace||pkg.startsWith(library.identity.namespace+'.'))
   fail('Application source shadows library namespace: '+file.originalPath);
 }
}
function capturedCore(captured,requirement,input) {
 const file=captured.files.find(file=>file.path==='zero-core.json');
 if(!file)fail('this library needs the project-owned zero-core.json; keep the project unchanged and choose a compatible library or deliberately upgrade a copy');
 let record;
 try {
  const sources=Object.fromEntries(core.coreSourcePaths.map(name=>[name,captured.files.find(file=>file.path===name)?.bytes]));
  record=core.validateCoreRecord(JSON.parse(core.normalizeSource(file.bytes)),sources);
 } catch(error) {fail('invalid captured project core: '+error.message);}
 if(!core.versionSatisfies(record.coordinate.version,requirement))fail(`library requires Zero core ${requirement.minVersion} up to ${requirement.maxExclusive} (exclusive); this project has ${record.coordinate.version}`);
 if(input&&(input.version!==record.coordinate.version||input.sourceSha256!==record.sourceSha256))fail('local library coreInput differs from the captured project core; deliberately update and check the library before using changed compilation inputs');
 return record;
}
async function resolveLibrarySources(projectRoot,captured,options={}) {
 const pom=captured.files.find(file=>file.path==='pom.xml')?.bytes.toString('utf8');
 if(!pom)fail('the project POM is missing');
 const libraries=captured.libraries||await discoverBrowserLibraries(projectRoot,pom),sources=[],resources=[],publishedLibraries=[];
 const published=libraries.filter(library=>library.mode==='published');
 const settings=options.sharingSettings||readKitConfiguration(path.resolve(__dirname,'../..'));
 const contexts=new Map();
 for(const library of published) {
  const practice=isTutorialPractice(library.identity);
  if(!contexts.has(practice))contexts.set(practice,await loadCatalog(practice?{...settings,catalogUrl:practiceCatalogUrl(settings.catalogUrl)}:settings,{fetcher:options.fetcher,signal:options.signal}));
 }
 for(const library of libraries) {
  const namespace=library.identity.namespace,prefix=namespace.replaceAll('.','/')+'/';
  if(library.mode==='local') {
   if(library.descriptor.schema===2)capturedCore(captured,library.descriptor.coreRequirement,library.descriptor.coreInput);
   const sourcePrefix=`${library.folder}/src/main/java/`,resourcePrefix=`${library.folder}/src/main/resources/`;
   const own=captured.files.filter(file=>file.path.startsWith(sourcePrefix));
   if(!own.length)fail(`${library.slug} has no local Java source`);
   for(const file of own) {
    if(!file.path.endsWith('.java'))fail(`non-Java file in ${sourcePrefix}`);
    const name=file.path.slice(sourcePrefix.length),decl=declaration(file.bytes.toString('utf8'),file.path);
    if((decl.packageName!==namespace&&!decl.packageName.startsWith(namespace+'.'))||name!==decl.packageName.replaceAll('.','/')+'/'+decl.simple+'.java')fail(`source outside ${namespace}: ${file.path}`);
    add(sources,name,file.bytes,'Java class',file.path);
   }
   for(const file of captured.files.filter(file=>file.path.startsWith(resourcePrefix))) {
    const name=file.path.slice(resourcePrefix.length);
    if(!name.startsWith(prefix)||!resourceExtension.test(name))fail(`unsupported or unscoped library resource: ${file.path}`);
    add(resources,name,file.bytes,'resource',file.path);
   }
   continue;
  }
  const practice=isTutorialPractice(library.identity),context=contexts.get(practice);
  if(library.source==='consumer'&&library.repositoryOrigin!==context.artifactOrigin)fail(`managed repository origin changed for ${library.slug}`);
  const release=context.catalog.releases.find(item=>item.kind==='library'&&item.id===library.identity.id&&item.version===library.version&&item.status==='available'&&isTutorialPractice(item)===practice);
  if(!release)fail(`published ${library.slug} ${library.version} is not an available accepted release`);
  if(release.schema===2)capturedCore(captured,release.coreRequirement);
  const verified=await verifyLibrary(context,release,{signal:options.signal});
  const sourceEntries=inspectJar(verified.sources),binaryEntries=inspectJar(verified.jar);
  let count=0;
  for(const file of sourceEntries) {
   if(file.path.startsWith('META-INF/'))continue;
   if(!file.path.startsWith(prefix))fail(`published source outside ${namespace}: ${file.path}`);
   if(!file.path.endsWith('.java')) {
    if(!resourceExtension.test(file.path))fail(`unsupported published source entry: ${file.path}`);
    continue;
   }
   const decl=declaration(file.bytes.toString('utf8'),file.path);
   if(file.path!==decl.packageName.replaceAll('.','/')+'/'+decl.simple+'.java')fail(`published source path differs from package: ${file.path}`);
   add(sources,file.path,file.bytes,'Java class',`published/${release.id}/${release.version}/${file.path}`);count++;
  }
  if(!count)fail(`published ${library.slug} has no Java source`);
  for(const file of binaryEntries) {
   if(file.path.startsWith('META-INF/'))continue;
   if(!file.path.startsWith(prefix))fail(`published binary entry outside ${namespace}: ${file.path}`);
   if(file.path.endsWith('.class'))continue;
   if(!resourceExtension.test(file.path))fail(`unsupported published resource: ${file.path}`);
   add(resources,file.path,file.bytes,'resource',`published/${release.id}/${release.version}/${file.path}`);
  }
  publishedLibraries.push({id:release.id,version:release.version,namespace,sourceCommit:release.source.commit,sourceDigest:release.source.sha256,catalogFingerprint:context.fingerprint,artifacts:Object.fromEntries(['jar','sources','pom'].map(kind=>[kind,{sha256:release.artifacts[kind].sha256,size:release.artifacts[kind].size}])),...(release.schema===2?{coreRequirement:release.coreRequirement,coreBuild:release.coreBuild}:{})});
 }
 return {sources,resources,publishedLibraries};
}
module.exports={discoverBrowserLibraries,resolveLibrarySources,inspectJar,assertApplicationNamespaces};
