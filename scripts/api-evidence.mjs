#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {projectBuilderFilesSync} from './prepare-project-builder.mjs';
const require=createRequire(import.meta.url);
const core=require('../extension/src/core-contract');
const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const nativeCases=Object.freeze(['ActorCheck','AudioCheck','GameHelpersCheck','NavigationCheck','UiCheck','SmokeLauncher','PaddingLauncher'].map(name=>({id:'native/'+name,target:'native',fixture:'framework/checks/zero/'+name+'.java',harness:'scripts/verify-framework.mjs'})));
export const browserCases=Object.freeze([
 {id:'browser/helpers',target:'browser',fixture:'framework/web-checks/Main.java',harness:'scripts/web-browser-checks.js'},
 {id:'browser/zero-ui',target:'browser',fixture:'framework/web-checks/navigation/Main.java',harness:'scripts/web-browser-checks.js'},
 {id:'browser/audio',target:'browser',fixture:'framework/web-checks/audio/Main.java',harness:'scripts/web-browser-checks.js'},
 {id:'browser/lifecycle',target:'browser',fixture:'framework/web-checks/lifecycle/Main.java',harness:'scripts/web-browser-checks.js'}
]);
const fail=message=>{throw new Error('API evidence: '+message);};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const bounded=value=>typeof value==='string'&&value.length>0&&value.length<=2048;
function exact(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('invalid '+label);}
export function inventoryDeclarations({sourceRoot=repositoryRoot,javaHome=process.env.JAVA_HOME,cacheRoot=path.join(os.homedir(),'.cache/zero/web-export/compatibility-artifacts'),execute=spawnSync}={}) {
 if(!javaHome||!path.isAbsolute(javaHome))fail('set --java-home to a cached standalone JDK 21; no tools will be downloaded');
 const tool=path.join(javaHome,'bin',process.platform==='win32'?'java.exe':'java');
 const environment=Object.fromEntries(['PATH','HOME','USERPROFILE','SystemRoot','TEMP','TMP','TMPDIR'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
 const probe=execute(tool,['-version'],{encoding:'utf8',env:environment,timeout:5000,maxBuffer:32768});
 if(probe.status!==0||!/version "21\./.test((probe.stderr||'')+(probe.stdout||'')))fail('a cached full JDK 21 is required for semantic attribution');
 const contract=JSON.parse(fs.readFileSync(path.join(sourceRoot,'extension/src/web-export/compatibility/contract.json'),'utf8'));
 const jars=contract.attributionArtifacts.map(pin=>{const filename=path.join(cacheRoot,pin.file),bytes=fs.readFileSync(filename);if(hash(bytes)!==pin.sha256)fail('missing or modified cached attribution artifact '+pin.file);return filename;});
 const directory=path.join(sourceRoot,'framework/src/main/java');
 const found=fs.readdirSync(directory,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile()&&entry.name.endsWith('.java')).map(entry=>path.relative(directory,path.join(entry.parentPath,entry.name)).split(path.sep).join('/')).sort();
 if(JSON.stringify(found)!==JSON.stringify(Object.keys(core.helperHashes).sort()))fail('review the complete core source inventory before generating API evidence');
 const sources=found.map(name=>({path:'framework/src/main/java/'+name,sha256:hash(fs.readFileSync(path.join(directory,name)))}));
 const output=execute(tool,[path.join(sourceRoot,'framework/evidence/ApiInventory.java'),jars.join(path.delimiter),directory,...sources.map(source=>path.join(sourceRoot,source.path))],{encoding:'utf8',env:environment,timeout:30000,maxBuffer:2*1024*1024});
 if(output.error||output.status!==0)fail('semantic inventory failed: '+String(output.stderr||output.error).slice(0,6000));
 const signatures=output.stdout.trim().split('\n').filter(Boolean).map(line=>{
  const fields=line.split('\t').map(value=>Buffer.from(value,'base64').toString('utf8'));
  if(fields.length!==11)fail('invalid semantic inventory record');
  const [owner,signature,kind,name,returnType,modifiers,source,lineNumber,start,end,declarationSha256]=fields;
  return {id:owner+'#'+signature,owner,signature,kind,name,returnType,modifiers:modifiers.split(',').filter(Boolean),source:'framework/src/main/java/'+source,line:Number(lineNumber),start:Number(start),end:Number(end),declarationSha256,evidence:{native:[],browser:[]}};
 }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const manifest={schema:1,scope:'Source-declared accessible public/protected members; inherited receiver use is a variant; compiler-generated and inaccessible nested members excluded.',sources,signatures};
 validateSignatureManifest(manifest);return manifest;
}
export function validateSignatureManifest(manifest){
 exact(manifest,['schema','scope','sources','signatures'],'signature manifest');
 if(manifest.schema!==1||!bounded(manifest.scope)||!Array.isArray(manifest.sources)||!manifest.sources.length||manifest.sources.length>64||!Array.isArray(manifest.signatures)||!manifest.signatures.length||manifest.signatures.length>2048)fail('unsupported or oversized signature manifest');
 const paths=new Set();for(const source of manifest.sources){exact(source,['path','sha256'],'source record');if(!bounded(source.path)||!source.path.startsWith('framework/src/main/java/')||source.path.includes('..')||!sha(source.sha256)||paths.has(source.path))fail('invalid/duplicate source');paths.add(source.path);}
 const ids=new Set();for(const entry of manifest.signatures){
  exact(entry,['id','owner','signature','kind','name','returnType','modifiers','source','line','start','end','declarationSha256','evidence'],'signature');
  if(!bounded(entry.id)||entry.id!==entry.owner+'#'+entry.signature||ids.has(entry.id)||!['method','constructor','field','enum-constant'].includes(entry.kind)||!sha(entry.declarationSha256)||!paths.has(entry.source)||!Number.isSafeInteger(entry.line)||entry.line<1||!Number.isSafeInteger(entry.start)||!Number.isSafeInteger(entry.end)||entry.start<0||entry.end<=entry.start||!Array.isArray(entry.modifiers)||!entry.modifiers.some(item=>['public','protected'].includes(item)))fail('invalid/duplicate source declaration');ids.add(entry.id);
  exact(entry.evidence,['native','browser'],'evidence mappings');
  for(const target of ['native','browser']){if(!Array.isArray(entry.evidence[target])||entry.evidence[target].length>32)fail('invalid evidence mapping');const links=new Set();for(const link of entry.evidence[target]){exact(link,['caseId','assertionId','postcondition'],'evidence link');if(![...nativeCases,...browserCases].some(item=>item.target===target&&item.id===link.caseId)||!bounded(link.assertionId)||!bounded(link.postcondition)||links.has(link.caseId+'\0'+link.assertionId))fail('invalid/duplicate evidence link');links.add(link.caseId+'\0'+link.assertionId);}}
 }
 return manifest;
}
export function assertInventoryParity(actual,recorded){validateSignatureManifest(actual);validateSignatureManifest(recorded);const withoutEvidence=manifest=>({...manifest,signatures:manifest.signatures.map(entry=>({...entry,evidence:{native:[],browser:[]}}))});if(JSON.stringify(withoutEvidence(actual))!==JSON.stringify(withoutEvidence(recorded)))fail('source declaration inventory is stale; regenerate deliberately and refresh affected evidence');return recorded;}
export function assertManifestSources(manifest,{sourceRoot=repositoryRoot}={}){validateSignatureManifest(manifest);for(const source of manifest.sources){const filename=path.resolve(sourceRoot,source.path);if(!filename.startsWith(path.resolve(sourceRoot)+path.sep)||hash(fs.readFileSync(filename))!==source.sha256)fail('stale source identity: '+source.path);}return manifest;}
export function mapJavaProbeAssertions(manifest,{sourceRoot=repositoryRoot}={}) {
 validateSignatureManifest(manifest);
 const source=['ApiSignatureChecks.java','ApiDrawingChecks.java','ApiLifecycleChecks.java','ApiCompletionChecks.java'].map(file=>fs.readFileSync(path.join(sourceRoot,'framework/evidence/java/evidence',file),'utf8')).join('\n');
 const cases={actionKeys:['native/GameHelpersCheck','browser/helpers'],primaryPointer:['native/GameHelpersCheck','browser/helpers'],gameStart:['native/NavigationCheck','browser/lifecycle'],gameControls:['native/NavigationCheck','browser/lifecycle'],showGame:['native/NavigationCheck','browser/lifecycle'],stopGame:['native/NavigationCheck','browser/lifecycle'],action:['native/UiCheck','browser/zero-ui'],disable:['native/UiCheck','browser/zero-ui'],musicPlay:['native/AudioCheck','browser/audio'],musicLoop:['native/AudioCheck','browser/audio'],musicPause:['native/AudioCheck','browser/audio'],musicStop:['native/AudioCheck','browser/audio'],soundPlay:['native/AudioCheck','browser/audio'],soundStop:['native/AudioCheck','browser/audio'],gameCallbacks:['native/NavigationCheck','browser/lifecycle'],lifecycle:['native/PaddingLauncher','browser/lifecycle'],arrows:['native/GameHelpersCheck','browser/zero-ui'],held:['native/GameHelpersCheck','browser/zero-ui'],pointerHeld:['native/GameHelpersCheck','browser/zero-ui'],pointerPressed:['native/GameHelpersCheck','browser/zero-ui'],resources:['native/GameHelpersCheck','browser/helpers'],paint:['native/ActorCheck','browser/lifecycle'],actors:['native/ActorCheck','browser/helpers'],ui:['native/UiCheck','browser/zero-ui'],host:['native/GameHelpersCheck','browser/lifecycle'],audio:['native/AudioCheck','browser/audio']};
 const entries=new Map(manifest.signatures.map(entry=>[entry.id,entry]));
 let group;for(const line of source.split('\n')) {
  if(line.includes('public final class ApiLifecycleChecks'))group='lifecycle';
  const method=line.match(/^    public static void (\w+)\(/);if(method)group=method[1];
  const call=line.match(/\b(?:eq|pixel|ApiProof.equal|ApiProof.pending)\("([^"]+)","([^"]+)","([^"]+)"/);if(!call)continue;
  const [,signatureId,assertionId,postcondition]=call,entry=entries.get(signatureId);
  if(!entry||!cases[group])fail('unmapped Java probe declaration '+signatureId);
  for(const caseId of cases[group]){const target=caseId.split('/')[0];if(!entry.evidence[target].some(link=>link.caseId===caseId&&link.assertionId===assertionId))entry.evidence[target].push({caseId,assertionId,postcondition});}
 }
 for(const file of ['framework/checks/zero/NavigationCheck.java','framework/web-checks/lifecycle/Main.java']) {
  for(const line of fs.readFileSync(path.join(sourceRoot,file),'utf8').split('\n')) {
   const call=line.match(/ApiProof\.equal\("([^"]+)","([^"]+)","([^"]+)"/);if(!call)continue;
   const [,signatureId,assertionId,postcondition]=call,entry=entries.get(signatureId);if(!entry)fail('unknown game callback declaration');
   const target=file.includes('/checks/')?'native':'browser',caseId=target==='native'?'native/NavigationCheck':'browser/lifecycle';
   if(!entry.evidence[target].some(link=>link.caseId===caseId&&link.assertionId===assertionId))entry.evidence[target].push({caseId,assertionId,postcondition});
  }
 }
 return validateSignatureManifest(manifest);
}

// This consumes events emitted by the *Java* invocation/assertion wrapper. It
// never substitutes a JavaScript callback for a Java method invocation.
export function receiptFromJavaEvents({manifest,raw,pixels=[],identity,runId,target,caseId}) {
 validateSignatureManifest(manifest);validateIdentity(identity);
 if(!bounded(runId)||!['native','browser'].includes(target)||![...nativeCases,...browserCases].some(item=>item.id===caseId&&item.target===target))fail('invalid Java evidence case');
 if(typeof raw!=='string'||Buffer.byteLength(raw)>2*1024*1024||!Array.isArray(pixels)||pixels.length>4096)fail('oversized Java event transport');
 const matches=[...raw.matchAll(/ZERO_API_EVIDENCE_V1\n([\s\S]*?)END_ZERO_API_EVIDENCE/g)];
 if(matches.length<1||matches.length>(target==='browser'?2:1))fail('expected one Java event block or two browser lifecycle executions');
 let externalCount=0;
 const rows=matches.flatMap(match=>match[1].trimEnd().split('\n').filter(Boolean)),events=[],outcomes=[],seen=new Set();
 if(!rows.length||rows.length%2)fail('empty/incomplete Java observations');
 for(let index=0;index<rows.length;index+=2){
  const invoked=rows[index].split('|'),asserted=rows[index+1].split('|');
  if(invoked.length!==3||asserted.length!==5||invoked[0]!=='I'||!['A','P','O'].includes(asserted[0])||invoked[1]!==asserted[1]||invoked[2]!==asserted[2])fail('unordered Java invocation/postcondition events');
  const [,signatureId,assertionId,postcondition,javaObservation]=asserted;
  let observation=javaObservation;
  if(asserted[0]==='P'||asserted[0]==='O'){externalCount++;if(target!=='browser')fail('pending native pixel assertion');const found=pixels.filter(item=>item.assertionId===assertionId);if(found.length!==1)fail('missing/duplicate actual browser pixels');observation=asserted[0]==='P'?validatePixelObservation(javaObservation,found[0]):validateUiObservation(javaObservation,found[0]);}
  const entry=manifest.signatures.find(entry=>entry.id===signatureId);
  if(!entry?.evidence[target].some(link=>link.caseId===caseId&&link.assertionId===assertionId&&link.postcondition===postcondition)||seen.has(signatureId+'\0'+assertionId))fail('unmapped/duplicate Java observation');
  seen.add(signatureId+'\0'+assertionId);const observationSha256=hash(JSON.stringify({javaObservation:observation})),invocation=events.length+1;
  events.push({schema:1,runId,target,caseId,sequence:invocation,phase:'invoked',signatureId,assertionId});
  events.push({schema:1,runId,target,caseId,sequence:invocation+1,phase:'asserted',signatureId,assertionId,postcondition,observationSha256});
  outcomes.push({signatureId,declarationSha256:entry.declarationSha256,assertionId,postcondition,invocation,observationSha256,status:'passed'});
 }
 if(externalCount!==pixels.length)fail('unexpected external observations without Java invocation');
 const log=events.map(event=>JSON.stringify(event)).join('\n')+'\n';
 return {receipt:{schema:1,runId,target,caseId,identity,logSha256:hash(log),outcomes},log,raw};
}

export function validateUiObservation(specification,observation) {
 exact(observation,['assertionId','specification','data'],'UI observation');
 if(observation.specification!==specification)fail('UI observation specification differs');
 if(specification.startsWith('text,')){exact(observation.data,['text','visible'],'visible text observation');if(observation.data.text!==specification.slice(5)||observation.data.visible!==true)fail('UI content postcondition failed');}
 else if(specification.startsWith('title,')){exact(observation.data,['title'],'title observation');if(observation.data.title!==specification.slice(6))fail('UI title postcondition failed');}
 else if(specification.startsWith('canvas,')) {const expected=specification.split(',').slice(1).map(Number);exact(observation.data,['attached','width','height'],'attached canvas observation');if(observation.data.attached!==true||observation.data.width!==expected[0]||observation.data.height!==expected[1])fail('game Scene postcondition failed');}
 else if(specification==='frames'){exact(observation.data,['updates','draws'],'live frame observation');if(!Number.isInteger(observation.data.updates)||!Number.isInteger(observation.data.draws)||observation.data.updates<1||observation.data.draws<1)fail('game frame postcondition failed');}
 else if(specification==='stopped-frames'){exact(observation.data,['before','after'],'stopped frame observation');if(!Number.isInteger(observation.data.before)||observation.data.before<1||observation.data.after!==observation.data.before)fail('game shutdown postcondition failed');}
 else if(specification==='disabled-controls'){exact(observation.data,['disabled','valueBefore','valueAfter','actionsBefore','actionsAfter'],'disabled input observation');if(observation.data.disabled!==true||observation.data.valueBefore!=='Ada'||observation.data.valueAfter!==observation.data.valueBefore||observation.data.actionsBefore!==2||observation.data.actionsAfter!==2)fail('disabled input postcondition failed');}
 else if(specification.startsWith('media,')) {
  const kind=specification.slice(6),data=observation.data;
  if(kind==='play'){exact(data,['publicPlaying','playing','time'],'music play observation');if(data.publicPlaying!==true||data.playing!==true||!Number.isFinite(data.time)||data.time<=0)fail('music play postcondition failed');}
  else if(kind==='loop'){exact(data,['publicPlaying','playing','loop','duration','elapsed','wraps'],'music loop observation');if(data.publicPlaying!==true||data.playing!==true||data.loop!==true||!Number.isFinite(data.duration)||data.duration<=0||!Number.isFinite(data.elapsed)||data.elapsed<data.duration*1000||!Number.isInteger(data.wraps)||data.wraps<1)fail('music loop postcondition failed');}
  else if(kind==='pause'){exact(data,['publicPlaying','playing','before','after','elapsed'],'music pause observation');if(data.publicPlaying!==false||data.playing!==false||!Number.isFinite(data.before)||!Number.isFinite(data.after)||data.before<=0||Math.abs(data.after-data.before)>=.03||data.elapsed<100)fail('music pause postcondition failed');}
  else if(kind==='stop'){exact(data,['publicPlaying','playing','time'],'music stop observation');if(data.publicPlaying!==false||data.playing!==false||!Number.isFinite(data.time)||data.time<0||data.time>=.03)fail('music stop postcondition failed');}
  else if(kind==='sound-play'||kind==='sound-stop'){exact(data,['publicPlaying','voices'],'effect voice observation');if(kind==='sound-play'?(data.publicPlaying!==true||!Number.isInteger(data.voices)||data.voices<1):(data.publicPlaying!==false||data.voices!==0))fail('effect voice postcondition failed');}
  else fail('unknown media observation');
 }
 else fail('unknown UI observation specification');
 return JSON.stringify(observation.data);
}

export function validatePixelObservation(specification,observation) {
 const parts=specification.split(','),kind=parts[0],numbers=parts.slice(1).map(Number);
 if(!['pixel','ink'].includes(kind)||numbers.some(value=>!Number.isInteger(value)||value<0)||parts.length!==(kind==='pixel'?7:5))fail('invalid pixel specification');
 exact(observation,['assertionId','specification','data'],'pixel observation');
 if(observation.specification!==specification||!Array.isArray(observation.data)||observation.data.some(value=>!Number.isInteger(value)||value<0||value>255))fail('invalid actual pixel observation');
 const expected=kind==='pixel'?4:numbers[2]*numbers[3]*4;
 if(expected<1||expected>16384||observation.data.length!==expected)fail('invalid pixel region size');
 if(kind==='pixel'){if(observation.data.some((value,index)=>value!==numbers[index+2]))fail('browser pixel postcondition failed');}
 else {let ink=0;for(let i=0;i<observation.data.length;i+=4)if(observation.data[i+3]>0&&(observation.data[i]<255||observation.data[i+1]<255||observation.data[i+2]<255))ink++;if(!ink)fail('browser text region has no ink');}
 return JSON.stringify({specification,data:observation.data});
}

export function browserExecutionRecords(raw,selection) {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>2*1024*1024)fail('oversized browser result');
 const blocks=[...raw.matchAll(/### Result\s*\n([\s\S]*?)(?=\n### |$)/g)];
 if(blocks.length!==1)fail('expected one structured browser result');
 const observed=JSON.parse(blocks[0][1]),selected=selection.filter(id=>id!=='mobile');
 if(observed.status!=='passed'||JSON.stringify(observed.selectedFixtures)!==JSON.stringify(selected)||!bounded(observed.browser)||!Array.isArray(observed.apiEvidence))fail('incomplete browser execution result');
 const expected=selected.filter(id=>['helpers','zero-ui','audio','lifecycle'].includes(id)).map(id=>'browser/'+id);
 if(observed.apiEvidence.length!==expected.length||observed.apiEvidence.some(item=>!item||!expected.includes(item.caseId)||typeof item.raw!=='string')||new Set(observed.apiEvidence.map(item=>item.caseId)).size!==expected.length)fail('missing, duplicate or unexpected browser Java evidence');
 return observed;
}

export function packEvidenceDirectory(directory) {
 const files=[];
 function walk(folder,relative='') {
  for(const entry of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const name=relative?relative+'/'+entry.name:entry.name,filename=path.join(folder,entry.name);
   if(entry.isSymbolicLink())fail('linked evidence artifact '+filename);
   if(entry.isDirectory())walk(filename,name);
   else if(entry.isFile())files.push({path:name,bytes:fs.readFileSync(filename)});
   else fail('special evidence artifact '+filename);
  }
 }
 walk(directory);
 return Buffer.concat(files.flatMap(file=>{const name=Buffer.from(file.path),header=Buffer.alloc(12);header.writeUInt32BE(name.length);header.writeBigUInt64BE(BigInt(file.bytes.length),4);return [header,name,file.bytes];}));
}
function measuredFiles(files){return Buffer.from(JSON.stringify(files.map(filename=>{const stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink())fail('tool/harness must be an ordinary file');const bytes=fs.readFileSync(filename);return {path:path.resolve(filename),bytes:bytes.length,sha256:hash(bytes)};})));}
// Bind ordinary maintainer producers transitively, including their pinned external implementation.
export function nativeProducerFiles({sourceRoot=repositoryRoot}={}) {
 const files=new Set();
 function visit(filename) {
  filename=fs.realpathSync(filename);if(files.has(filename))return;files.add(filename);
  const source=fs.readFileSync(filename,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g)) {
   const base=path.resolve(path.dirname(filename),match[1]);
   const resolved=[base,base+'.js',base+'.mjs',base+'.cjs',path.join(base,'index.js')].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
   if(!resolved)fail('missing producer dependency '+base);visit(resolved);
  }
 }
 for(const name of ['verify-framework.mjs','kit.mjs','prepare-starter.mjs','prepare-project-builder.mjs','verification-project.mjs','process-specification.mjs','release.mjs'])visit(path.join(sourceRoot,'scripts',name));
 for(const file of ['package.json','package-lock.json','release/kit.json','extension/package.json','framework/pom.xml'])files.add(path.join(sourceRoot,file));
 files.add(require.resolve('fflate'));files.add(require.resolve('fflate/package.json'));
 for(const file of ordinaryFiles(path.join(sourceRoot,'student-template/src')))files.add(file);
 return [...files].sort();
}
function ordinaryFiles(directory) {
 const files=[];
 for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
  const file=path.join(directory,entry.name);if(entry.isSymbolicLink())fail('linked tool/configuration input '+file);
  if(entry.isDirectory())files.push(...ordinaryFiles(file));else if(entry.isFile())files.push(file);else fail('special tool/configuration input');
 }
 return files;
}
export function javaToolFiles(javaHome) {
 const executable=name=>path.join(javaHome,'bin',name+(process.platform==='win32'?'.exe':''));
 // Full runtime/compiler closure, including launcher and native support libraries,
 // fonts, security configuration and the module image. No runtime is executed.
 const files=[executable('java'),executable('javac'),path.join(javaHome,'release')];
 for(const directory of ['bin','lib','conf'])files.push(...ordinaryFiles(path.join(javaHome,directory)));
 return [...new Set(files)].sort();
}
export function nativeToolFiles({javaHome,mavenHome,node=process.execPath,modulePath=[]}) {
 const files=[fs.realpathSync(node),...javaToolFiles(javaHome),...modulePath];
 // These contain Maven's actual classworlds launcher, core/extensions, settings and launcher scripts.
 for(const directory of ['bin','boot','lib','conf'])files.push(...ordinaryFiles(path.join(mavenHome,directory)));
 return [...new Set(files)].sort();
}
/** Read only the executed plugins and the resolved dependency list shipped in each descriptor. */
export function mavenPluginTools({repositoryRoot,output,plugins}) {
 if(!path.isAbsolute(repositoryRoot))fail('Maven evidence requires an explicit absolute local repository');
 const aliases={clean:['org.apache.maven.plugins','maven-clean-plugin'],resources:['org.apache.maven.plugins','maven-resources-plugin'],compiler:['org.apache.maven.plugins','maven-compiler-plugin'],javafx:['org.openjfx','javafx-maven-plugin']};
 if(output!==undefined) {
  plugins=[];
  for(const match of output.replace(/\x1b\[[0-9;]*m/g,'').matchAll(/^\[INFO\] --- ([\w.-]+):([\w.-]+):[\w-]+ \(/gm)) {
   const alias=Object.keys(aliases).find(name=>name===match[1]||aliases[name][1]===match[1]);
   if(!alias)fail('unreviewed executed Maven plugin '+match[1]);
   const [groupId,artifactId]=aliases[alias],version=match[2];
   if(!plugins.some(plugin=>plugin.groupId===groupId&&plugin.artifactId===artifactId&&plugin.version===version))plugins.push({groupId,artifactId,version});
  }
 }
 if(!Array.isArray(plugins)||!plugins.length)fail('Maven INFO output omitted executed plugin identities');
 const files=new Set(),{unzipSync}=require('fflate'),{parseXml,single,value}=require('../extension/src/project-pom');
 function jars(gav) {
  exact(gav,['groupId','artifactId','version'],'Maven plugin dependency');
  for(const part of [gav.artifactId,gav.version,...gav.groupId.split('.')])if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part)||part.includes('..'))fail('invalid resolved Maven coordinate');
  const directory=path.join(repositoryRoot,...gav.groupId.split('.'),gav.artifactId,gav.version);
  const found=ordinaryFiles(directory).filter(file=>path.dirname(file)===directory&&file.endsWith('.jar'));
  if(!found.length)fail('resolved Maven dependency has no cached ordinary JAR: '+JSON.stringify(gav));
  for(const file of found)files.add(file);return directory;
 }
 for(const plugin of plugins) {
  if(!Object.values(aliases).some(([group,artifact])=>plugin.groupId===group&&plugin.artifactId===artifact))fail('unreviewed executed Maven plugin coordinate');
  const directory=jars(plugin),jar=path.join(directory,plugin.artifactId+'-'+plugin.version+'.jar');
  const descriptor=unzipSync(fs.readFileSync(jar),{filter:entry=>entry.name==='META-INF/maven/plugin.xml'})['META-INF/maven/plugin.xml'];
  if(!descriptor)fail('executed plugin descriptor missing');
  const xml=Buffer.from(descriptor).toString('utf8');
  const blocks=[...xml.matchAll(/<dependencies>([\s\S]*?)<\/dependencies>/g)];
  if(blocks.length!==1)fail('executed plugin descriptor must identify its resolved dependency closure');
  const root=parseXml('<project>'+blocks[0][0]+'</project>'),dependencies=single(root,'dependencies');
  for(const dependency of dependencies.children) {
   if(dependency.name!=='dependency')fail('invalid Maven plugin dependency descriptor');
   const type=single(dependency,'type',true);if(type&&value(type)!=='jar')fail('unsupported Maven plugin dependency type');
   jars({groupId:value(single(dependency,'groupId')),artifactId:value(single(dependency,'artifactId')),version:value(single(dependency,'version'))});
  }
 }
 return {files:[...files].sort(),provenance:{repositoryRoot,plugins}};
}
function measuredTools(files,mavenPlugins) {
 return mavenPlugins?Buffer.from(JSON.stringify({files:JSON.parse(measuredFiles(files)),mavenPlugins})):measuredFiles(files);
}
function configurationBytes(directory) {
 const files=['pom.xml','mvnw','mvnw.cmd','zero.json'].map(name=>path.join(directory,name));
 for(const file of files){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())fail('configuration must be an ordinary file');}
 files.push(...ordinaryFiles(path.join(directory,'.mvn')));
 return Buffer.from(JSON.stringify(files.sort().map(file=>({path:path.relative(directory,file).split(path.sep).join('/'),bytes:fs.readFileSync(file).toString('base64')}))));
}
export function executionIdentity({manifest,projectRoot,outputDirectory,toolFiles,platform,harnessFiles,sourceRoot=repositoryRoot,mavenPlugins}) {
 assertManifestSources(manifest,{sourceRoot});
 if(!Array.isArray(toolFiles)||!toolFiles.length||!Array.isArray(harnessFiles)||!harnessFiles.length||!bounded(platform))fail('execution must identify actual tools and harnesses');
 if(fs.existsSync(path.join(projectRoot,'zero-libraries.json')))fail('bind actual managed libraries before recording this fixture');
 for(const source of manifest.sources){const copied=path.join(projectRoot,source.path.slice('framework/'.length));if(hash(fs.readFileSync(copied))!==source.sha256)fail('assembled core source differs: '+source.path);}
 const output=packEvidenceDirectory(outputDirectory),builder=projectBuilderFilesSync({sourceRoot});
 const configuration=configurationBytes(projectRoot),canonical=configurationBytes(path.join(sourceRoot,'student-template'));
 if(!configuration.equals(canonical))fail('assembled POM, wrapper or configuration differs from current canonical fixture');
 const fixture={sourceSha256:hash(packEvidenceDirectory(path.join(projectRoot,'src'))),configurationSha256:hash(configuration),configuration:configuration.toString('base64')};
 const profile=Buffer.from(JSON.stringify(builder.map(file=>({path:file.path,sha256:hash(file.bytes),bytes:file.bytes.length}))));
 const identity={manifestSha256:hash(JSON.stringify(manifest)),coreSha256:hash(JSON.stringify(manifest.sources)),profileSha256:hash(profile),contractSha256:hash(fs.readFileSync(path.join(sourceRoot,'extension/src/web-export/compatibility/contract.json'))),librariesSha256:hash('[]'),fixtureSha256:hash(JSON.stringify({sourceSha256:fixture.sourceSha256,configurationSha256:fixture.configurationSha256})),harnessSha256:hash(measuredFiles(harnessFiles)),outputSha256:hash(output),toolSha256:hash(measuredTools(toolFiles,mavenPlugins)),platform};
 return {identity:validateIdentity(identity),output,inputs:{toolFiles,harnessFiles,fixture,...(mavenPlugins?{mavenPlugins}:{})}};
}
export function persistJavaEvidence({directory,manifest,raw,pixels=[],identity,output,inputs,runId,target,caseId}) {
 const converted=receiptFromJavaEvents({manifest,raw,pixels,identity,runId,target,caseId});
 fs.mkdirSync(directory,{recursive:true});
 const artifacts=path.join(directory,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
 fs.writeFileSync(path.join(artifacts,converted.receipt.logSha256),converted.log);
 fs.writeFileSync(path.join(artifacts,identity.outputSha256),output);
 fs.writeFileSync(path.join(artifacts,hash(raw)),raw);
 fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(converted.receipt,null,2)+'\n');
 if(inputs){fs.writeFileSync(path.join(directory,'identity-inputs.json'),JSON.stringify(inputs,null,2)+'\n');fs.writeFileSync(path.join(artifacts,inputs.fixture.configurationSha256),Buffer.from(inputs.fixture.configuration,'base64'));}
 fs.writeFileSync(path.join(directory,'expected-identity.json'),JSON.stringify(identity,null,2)+'\n');
 const pixelsBytes=JSON.stringify(pixels);fs.writeFileSync(path.join(artifacts,hash(pixelsBytes)),pixelsBytes);
 fs.writeFileSync(path.join(directory,'java-events.json'),JSON.stringify({sha256:hash(raw),pixelsSha256:hash(pixelsBytes),transport:'Actual Java invocation and postcondition events'},null,2)+'\n');
 return converted.receipt;
}
export function loadJavaEvidence(directory,{manifest,checkCurrentInputs=true,sourceRoot=repositoryRoot}) {
 const receipts=[],expectedIdentities={},artifacts={};
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
  if(!entry.isDirectory()||entry.isSymbolicLink())fail('evidence root must contain ordinary case directories');
  const folder=path.join(directory,entry.name),receipt=JSON.parse(fs.readFileSync(path.join(folder,'receipt.json'),'utf8'));
  const identity=JSON.parse(fs.readFileSync(path.join(folder,'expected-identity.json'),'utf8'));
  if(checkCurrentInputs){
   assertManifestSources(manifest,{sourceRoot});
   const inputs=JSON.parse(fs.readFileSync(path.join(folder,'identity-inputs.json'),'utf8'));
   exact(inputs,['toolFiles','harnessFiles','fixture',...(Object.hasOwn(inputs,'mavenPlugins')?['mavenPlugins']:[])],'current identity inputs');
   if(inputs.mavenPlugins){exact(inputs.mavenPlugins,['repositoryRoot','plugins'],'Maven execution provenance');const current=mavenPluginTools(inputs.mavenPlugins);if(current.files.some(file=>!inputs.toolFiles.includes(file)))fail('stale current Maven plugin/dependency closure');}
   exact(inputs.fixture,['sourceSha256','configurationSha256','configuration'],'retained actual fixture inputs');
   const configuration=fs.readFileSync(path.join(folder,'artifacts',inputs.fixture.configurationSha256));
   if(!sha(inputs.fixture.sourceSha256)||hash(configuration)!==inputs.fixture.configurationSha256||!configuration.equals(Buffer.from(inputs.fixture.configuration,'base64'))||!configuration.equals(configurationBytes(path.join(sourceRoot,'student-template')))||identity.fixtureSha256!==hash(JSON.stringify({sourceSha256:inputs.fixture.sourceSha256,configurationSha256:inputs.fixture.configurationSha256})))fail('stale current POM, wrapper or configuration');
   if(!Array.isArray(inputs.toolFiles)||!inputs.toolFiles.length||!Array.isArray(inputs.harnessFiles)||!inputs.harnessFiles.length)fail('missing current tool/harness paths');
   const profile=projectBuilderFilesSync({sourceRoot}).map(file=>({path:file.path,sha256:hash(file.bytes),bytes:file.bytes.length}));
   if(identity.toolSha256!==hash(measuredTools(inputs.toolFiles,inputs.mavenPlugins))||identity.harnessSha256!==hash(measuredFiles(inputs.harnessFiles))||identity.profileSha256!==hash(JSON.stringify(profile))||identity.coreSha256!==hash(JSON.stringify(manifest.sources))||identity.contractSha256!==hash(fs.readFileSync(path.join(sourceRoot,'extension/src/web-export/compatibility/contract.json')))||identity.librariesSha256!==hash('[]'))fail('stale current tool, harness, fixture, profile or contract');
  }
  const transport=JSON.parse(fs.readFileSync(path.join(folder,'java-events.json'),'utf8'));
  if(!sha(transport.sha256))fail('invalid Java transport identity');
  const raw=fs.readFileSync(path.join(folder,'artifacts',transport.sha256),'utf8');
  if(hash(raw)!==transport.sha256)fail('changed Java transport');
  if(!sha(transport.pixelsSha256))fail('invalid pixel transport identity');
  const pixelBytes=fs.readFileSync(path.join(folder,'artifacts',transport.pixelsSha256),'utf8');if(hash(pixelBytes)!==transport.pixelsSha256)fail('changed pixel transport');
  const pixels=JSON.parse(pixelBytes);
  const rebuilt=receiptFromJavaEvents({manifest,raw,pixels,identity,runId:receipt.runId,target:receipt.target,caseId:receipt.caseId});
  if(JSON.stringify(rebuilt.receipt)!==JSON.stringify(receipt))fail('receipt differs from actual Java observations');
  const key=receipt.target+':'+receipt.caseId;if(expectedIdentities[key])fail('duplicate evidence case');expectedIdentities[key]=identity;
  for(const digest of [receipt.logSha256,identity.outputSha256])artifacts[digest]=fs.readFileSync(path.join(folder,'artifacts',digest),digest===receipt.logSha256?'utf8':undefined);
  receipts.push(receipt);
 }
 return {manifest,receipts,expectedIdentities,artifacts};
}
const identityKeys=['manifestSha256','coreSha256','profileSha256','contractSha256','librariesSha256','fixtureSha256','harnessSha256','outputSha256','toolSha256','platform'];
export function validateIdentity(identity){exact(identity,identityKeys,'execution identities');for(const key of identityKeys)if(key==='platform'?!bounded(identity[key]):!sha(identity[key]))fail('invalid '+key);return identity;}
// The trusted harness owns callbacks and emission. Merely finding a call in an
// AST or writing a receipt cannot establish execution. Store the returned log
// beside the actual compiled output; validation checks their retained hashes.
export function createEvidenceRecorder({runId,target,caseId,emit=()=>{}}){
 if(!bounded(runId)||!['native','browser'].includes(target)||![...nativeCases,...browserCases].some(item=>item.id===caseId&&item.target===target))fail('invalid evidence recorder case');
 const events=[],outcomes=[],seen=new Set();let sequence=0;
 const event=value=>{const record={schema:1,runId,target,caseId,sequence:++sequence,...value};events.push(record);emit(record);return record;};
 return {async observe({signatureId,declarationSha256,assertionId,postcondition,invoke,assert}){
  if(!bounded(signatureId)||!sha(declarationSha256)||!bounded(assertionId)||!bounded(postcondition)||typeof invoke!=='function'||typeof assert!=='function'||seen.has(signatureId+'\0'+assertionId))fail('invalid or duplicate observation');seen.add(signatureId+'\0'+assertionId);
  const value=await invoke();const invocation=event({phase:'invoked',signatureId,assertionId}).sequence;
  const observation=await assert(value);if(observation===false||observation===undefined)fail('postcondition did not pass: '+assertionId);
  const observationSha256=hash(JSON.stringify(observation));event({phase:'asserted',signatureId,assertionId,postcondition,observationSha256});
  const outcome={signatureId,declarationSha256,assertionId,postcondition,invocation,observationSha256,status:'passed'};outcomes.push(outcome);return value;
 },finish(identity){validateIdentity(identity);const log=events.map(value=>JSON.stringify(value)).join('\n')+'\n';return {receipt:{schema:1,runId,target,caseId,identity,logSha256:hash(log),outcomes:[...outcomes]},log};}};
}
export function requireTargetEvidence(evidence,target) {
 if(!['native','browser'].includes(target))fail('unknown execution target');
 const report=validateEvidenceReceipts(evidence),gaps=report.gaps.filter(gap=>gap.target===target);
 if(gaps.length)fail(target+' execution gate: '+gaps.length+' declarations lack current executed assertions');
 return {target,declarations:report.declarations,status:'complete'};
}
export function validateEvidenceReceipts({manifest,receipts=[],expectedIdentities={},artifacts={}}){
 validateSignatureManifest(manifest);if(!Array.isArray(receipts)||receipts.length>256)fail('invalid receipt collection');
 const entries=new Map(manifest.signatures.map(entry=>[entry.id,entry])),accepted=new Set(),runs=new Set();
 for(const receipt of receipts){
  exact(receipt,['schema','runId','target','caseId','identity','logSha256','outcomes'],'receipt');
  if(receipt.schema!==1||!bounded(receipt.runId)||runs.has(receipt.runId)||!['native','browser'].includes(receipt.target)||!Array.isArray(receipt.outcomes)||!receipt.outcomes.length||receipt.outcomes.length>4096||!sha(receipt.logSha256))fail('duplicate, incomplete or unsupported receipt');runs.add(receipt.runId);validateIdentity(receipt.identity);
  const expected=expectedIdentities[receipt.target+':'+receipt.caseId];if(!expected)fail('receipt has no current trusted execution identity');validateIdentity(expected);
  if(identityKeys.some(key=>expected[key]!==receipt.identity[key])||receipt.identity.manifestSha256!==hash(JSON.stringify(manifest)))fail('stale or conflicting execution identity');
  const log=artifacts[receipt.logSha256],output=artifacts[receipt.identity.outputSha256];if(typeof log!=='string'||Buffer.byteLength(log)>4*1024*1024||hash(log)!==receipt.logSha256||output===undefined||hash(output)!==receipt.identity.outputSha256)fail('missing/forged execution log or compiled output');
  const events=log.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  if(events.length!==receipt.outcomes.length*2||events.some((event,index)=>event.schema!==1||event.runId!==receipt.runId||event.target!==receipt.target||event.caseId!==receipt.caseId||event.sequence!==index+1))fail('incomplete/conflicting execution events');
  for(const [index,outcome] of receipt.outcomes.entries()){
   exact(outcome,['signatureId','declarationSha256','assertionId','postcondition','invocation','observationSha256','status'],'assertion outcome');
   const entry=entries.get(outcome.signatureId),link=entry?.evidence[receipt.target].find(link=>link.caseId===receipt.caseId&&link.assertionId===outcome.assertionId&&link.postcondition===outcome.postcondition);
   const key=receipt.target+'\0'+outcome.signatureId+'\0'+receipt.caseId+'\0'+outcome.assertionId;
   if(!link||entry.declarationSha256!==outcome.declarationSha256||outcome.status!=='passed'||accepted.has(key)||!sha(outcome.observationSha256))fail('stale, duplicate, forged or unmapped assertion');
   const invoked=events[index*2],asserted=events[index*2+1];
   exact(invoked,['schema','runId','target','caseId','sequence','phase','signatureId','assertionId'],'invocation event');
   exact(asserted,['schema','runId','target','caseId','sequence','phase','signatureId','assertionId','postcondition','observationSha256'],'postcondition event');
   if(invoked.phase!=='invoked'||asserted.phase!=='asserted'||outcome.invocation!==invoked.sequence||[invoked,asserted].some(event=>event.signatureId!==outcome.signatureId||event.assertionId!==outcome.assertionId)||asserted.postcondition!==outcome.postcondition||asserted.observationSha256!==outcome.observationSha256)fail('assertion lacks ordered invocation and postcondition evidence');
   accepted.add(key);
  }
 }
 const gaps=[];let covered=0;
 for(const entry of manifest.signatures)for(const target of ['native','browser']){const links=entry.evidence[target];if(!links.length){gaps.push({signatureId:entry.id,target,reason:'no executed assertion mapping'});continue;}const missing=links.filter(link=>!accepted.has(target+'\0'+entry.id+'\0'+link.caseId+'\0'+link.assertionId));if(missing.length)gaps.push({signatureId:entry.id,target,reason:'missing current executed receipt',assertions:missing.map(link=>link.assertionId)});else covered++;}
 return {schema:1,status:gaps.length?'pending':'complete',declarations:manifest.signatures.length,requiredTargets:manifest.signatures.length*2,coveredTargets:covered,gaps};
}
async function main(args){
 const flags=new Set(['--report','--require-complete','--write']);let javaHome=process.env.JAVA_HOME,cacheRoot,receiptsDirectory;
 for(let index=0;index<args.length;index++){if(args[index]==='--java-home'){javaHome=args[++index];if(!javaHome)fail('missing --java-home');}else if(args[index]==='--cache'){cacheRoot=args[++index];if(!cacheRoot)fail('missing --cache');}else if(args[index]==='--receipts'){receiptsDirectory=args[++index];if(!receiptsDirectory)fail('missing --receipts');}else if(!flags.has(args[index]))fail('unknown argument '+args[index]);}
 const filename=path.join(repositoryRoot,'framework/evidence/api-signatures.json');
 if(args.includes('--write')){const actual=mapJavaProbeAssertions(inventoryDeclarations({javaHome,cacheRoot}));fs.writeFileSync(filename,JSON.stringify(actual,null,2)+'\n');console.log('Recorded '+actual.signatures.length+' semantic declarations; Java assertion mappings are pending actual execution.');return;}
 const manifest=assertManifestSources(JSON.parse(fs.readFileSync(filename,'utf8')));
 const report=validateEvidenceReceipts(receiptsDirectory?loadJavaEvidence(receiptsDirectory,{manifest}):{manifest});console.log(JSON.stringify(report,null,2));if(args.includes('--require-complete')&&report.status!=='complete')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
