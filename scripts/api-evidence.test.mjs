import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {inventoryDeclarations,validateSignatureManifest,assertInventoryParity,validateEvidenceReceipts,createEvidenceRecorder,hash,nativeCases,browserCases} from './api-evidence.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'framework/evidence/api-signatures.json'),'utf8'));
const jdk=path.join(os.homedir(),'Library/Application Support/Zero/runtime/jdk-3623232f33a9c3baadf304480b2535f9a3cba8a58d42ecbb438ba267315d9998/jdk-21.0.12.1+1/Contents/Home');
test('semantic inventory is exact across 18 owners and 183 source declarations',t=>{
 if(!fs.existsSync(path.join(jdk,'bin/java'))){t.skip('Verified cached JDK21 is unavailable; no download attempted.');return;}
 const actual=inventoryDeclarations({javaHome:jdk});assert.equal(actual.signatures.length,183);assert.equal(new Set(actual.signatures.map(entry=>entry.owner)).size,18);assertInventoryParity(actual,manifest);
 assert.equal(actual.signatures.filter(entry=>entry.kind==='enum-constant').length,4);
 assert.equal(actual.signatures.filter(entry=>entry.owner==='zero.Color'&&entry.kind==='field').length,4);
 assert.ok(!actual.signatures.some(entry=>entry.owner.includes('$')||entry.owner.includes('SpriteAnimation.Playback')||entry.signature==='values()'||entry.signature==='valueOf(java.lang.String)'));
 assert.ok(actual.signatures.some(entry=>entry.signature==='<init>(double,zero.ImageRegion...)'));
 assert.ok(actual.signatures.some(entry=>entry.id==='zero.Actor#onUpdate(double)'&&entry.modifiers.includes('protected')));
});
test('recorded manifest reports 366 explicit target gaps rather than count-based success',()=>{validateSignatureManifest(manifest);const report=validateEvidenceReceipts({manifest});assert.equal(report.status,'pending');assert.equal(report.requiredTargets,366);assert.equal(report.coveredTargets,0);assert.equal(report.gaps.length,366);for(const item of [...nativeCases,...browserCases]){assert.ok(fs.existsSync(path.join(root,item.fixture)));assert.ok(fs.existsSync(path.join(root,item.harness)));}});
test('inventory parity rejects changed bodies, signature hashes and omitted declarations',()=>{for(const alter of [copy=>copy.sources[0].sha256='0'.repeat(64),copy=>copy.signatures[0].declarationSha256='0'.repeat(64),copy=>copy.signatures.pop()]){const copy=structuredClone(manifest);alter(copy);assert.throws(()=>assertInventoryParity(manifest,copy),/stale/);}});
async function receiptFixture(){
 const input=structuredClone(manifest),entry=input.signatures[0],caseId=nativeCases[0].id,assertionId='unit-only-postcondition',postcondition='Synthetic unit observation equals 42 (not framework execution evidence)';
 entry.evidence.native=[{caseId,assertionId,postcondition}];
 const output=Buffer.from('synthetic compiled-output bytes for validator unit test only');
 const identity={manifestSha256:hash(JSON.stringify(input)),coreSha256:'1'.repeat(64),profileSha256:'2'.repeat(64),contractSha256:'3'.repeat(64),librariesSha256:'4'.repeat(64),fixtureSha256:'5'.repeat(64),harnessSha256:'6'.repeat(64),outputSha256:hash(output),toolSha256:'7'.repeat(64),platform:'unit-test/synthetic'};
 const recorder=createEvidenceRecorder({runId:'unit-run',target:'native',caseId});
 await recorder.observe({signatureId:entry.id,declarationSha256:entry.declarationSha256,assertionId,postcondition,invoke:()=>21*2,assert:value=>{assert.equal(value,42);return {actual:value,expected:42};}});
 const {receipt,log}=recorder.finish(identity);
 return {manifest:input,receipts:[receipt],expectedIdentities:{['native:'+caseId]:structuredClone(identity)},artifacts:{[receipt.logSha256]:log,[identity.outputSha256]:output}};
}
test('recorder emits outcomes only after invocation and a meaningful postcondition callback',async()=>{
 const records=[],recorder=createEvidenceRecorder({runId:'unit-order',target:'native',caseId:nativeCases[0].id,emit:event=>records.push(event)}),events=[];
 await recorder.observe({signatureId:manifest.signatures[0].id,declarationSha256:manifest.signatures[0].declarationSha256,assertionId:'unit',postcondition:'returned value is positive',invoke:()=>{events.push('invoke');assert.equal(records.length,0);return 2;},assert:value=>{events.push('assert');assert.equal(records.length,1);assert.ok(value>0);return {value};}});
 assert.deepEqual(events,['invoke','assert']);assert.deepEqual(records.map(record=>record.phase),['invoked','asserted']);
 await assert.rejects(recorder.observe({signatureId:'zero.X#f()',declarationSha256:'0'.repeat(64),assertionId:'fail',postcondition:'fails',invoke:()=>3,assert:()=>false}),/did not pass/);
});
test('valid ordered receipt covers only its mapped declaration and target',async()=>{const report=validateEvidenceReceipts(await receiptFixture());assert.equal(report.coveredTargets,1);assert.equal(report.gaps.length,365);assert.equal(report.status,'pending');});
test('forged, stale, duplicate, conflicting and incomplete receipts are rejected',async()=>{
 for(const mutate of [
  fixture=>fixture.receipts.push(structuredClone(fixture.receipts[0])),
  fixture=>fixture.receipts[0].identity.coreSha256='0'.repeat(64),
  fixture=>fixture.receipts[0].outcomes[0].declarationSha256='0'.repeat(64),
  fixture=>fixture.receipts[0].outcomes[0].invocation=9,
  fixture=>fixture.receipts[0].outcomes[0].assertionId='unmapped-forgery',
  fixture=>fixture.receipts[0].outcomes=[],
  fixture=>delete fixture.artifacts[fixture.receipts[0].logSha256],
  fixture=>fixture.artifacts[fixture.receipts[0].identity.outputSha256]=Buffer.from('changed output'),
  fixture=>fixture.receipts[0].outcomes.push(structuredClone(fixture.receipts[0].outcomes[0])),
  fixture=>fixture.expectedIdentities={}
 ]){const fixture=await receiptFixture();mutate(fixture);assert.throws(()=>validateEvidenceReceipts(fixture));}
});
test('report is useful while require-complete fails the explicit gaps',()=>{const normal=spawnSync(process.execPath,['scripts/api-evidence.mjs','--report'],{cwd:root,encoding:'utf8'});assert.equal(normal.status,0);assert.equal(JSON.parse(normal.stdout).status,'pending');const required=spawnSync(process.execPath,['scripts/api-evidence.mjs','--require-complete'],{cwd:root,encoding:'utf8'});assert.equal(required.status,1);});

test('Java probes map exact declarations idempotently without claiming execution',async()=>{
 const {mapJavaProbeAssertions}=await import('./api-evidence.mjs');const input=structuredClone(manifest);mapJavaProbeAssertions(input);assert.deepEqual(mapJavaProbeAssertions(input),input);
 const mapped=input.signatures.filter(entry=>entry.evidence.native.length);assert.equal(mapped.length,183);assert.equal(input.signatures.filter(entry=>entry.evidence.browser.length).length,183);
 assert.equal(validateEvidenceReceipts({manifest:input}).coveredTargets,0);
});
test('actual Java collector emits only ordered completed postconditions and refuses duplicates',t=>{
 if(!fs.existsSync(path.join(jdk,'bin/javac'))){t.skip('Cached JDK unavailable.');return;}
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'zero-java-proof-unit-'));
 try {
  const source=path.join(temporary,'Probe.java');fs.writeFileSync(source,`import evidence.ApiProof;
class Probe { public static void main(String[] args) {
 int[] calls={0};
 ApiProof.equal("unit#value()","unit-actual-call","Real harmless Java callback returns forty two",()->{calls[0]++;return ""+(21*2);},"42");
 try {ApiProof.equal("unit#value()","unit-actual-call","duplicate",()->{calls[0]++;return "42";},"42");throw new Error("duplicate accepted");}catch(IllegalStateException expected){}
 if(calls[0]!=1)throw new Error("duplicate invoked callback");
 try {ApiProof.equal("unit#bad()","unit-failed","must not assert",()->"wrong","expected");throw new Error("failure accepted");}catch(IllegalStateException expected){}
 System.out.println(ApiProof.events());
} }`);
  const compiled=spawnSync(path.join(jdk,'bin/javac'),['-d',temporary,path.join(root,'framework/evidence/java/evidence/ApiProof.java'),source],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  const executed=spawnSync(path.join(jdk,'bin/java'),['-cp',temporary,'Probe'],{encoding:'utf8'});assert.equal(executed.status,0,executed.stderr);
  assert.match(executed.stdout,/I\|unit#value\(\)\|unit-actual-call\nA\|unit#value\(\)/);assert.match(executed.stdout,/I\|unit#bad/);assert.doesNotMatch(executed.stdout,/A\|unit#bad/);
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
test('Java transport conversion and retained artifacts reject reordered or changed observations',async()=>{
 const {receiptFromJavaEvents,persistJavaEvidence,loadJavaEvidence}=await import('./api-evidence.mjs');const fixture=await receiptFixture();const entry=fixture.manifest.signatures[0],link=entry.evidence.native[0],identity=fixture.receipts[0].identity,output=fixture.artifacts[identity.outputSha256];
 const raw='ZERO_API_EVIDENCE_V1\nI|'+entry.id+'|'+link.assertionId+'\nA|'+entry.id+'|'+link.assertionId+'|'+link.postcondition+'|42\nEND_ZERO_API_EVIDENCE';
 const options={manifest:fixture.manifest,raw,identity,runId:'unit-java-transport',target:'native',caseId:nativeCases[0].id};assert.equal(receiptFromJavaEvents(options).receipt.outcomes.length,1);
 for(const broken of [raw.replace('I|','A|'),raw.replace('|42','|42|extra'),raw+'\n'+raw,raw.replace(link.assertionId,'unknown')])assert.throws(()=>receiptFromJavaEvents({...options,raw:broken}));
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'zero-java-receipt-unit-'));
 try {const directory=path.join(temporary,'case');persistJavaEvidence({...options,directory,output});assert.equal(validateEvidenceReceipts(loadJavaEvidence(temporary,{manifest:fixture.manifest,checkCurrentInputs:false})).coveredTargets,1);const rawFile=path.join(directory,'artifacts',hash(raw));fs.writeFileSync(rawFile,raw+'changed');assert.throws(()=>loadJavaEvidence(temporary,{manifest:fixture.manifest,checkCurrentInputs:false}),/changed Java transport/);}finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('native selectors preserve seven defaults and reject unrelated selections before assembly',async()=>{
 const {frameworkCases,selectFrameworkCases}=await import('./verify-framework.mjs');assert.equal(frameworkCases.length,7);assert.equal(selectFrameworkCases([]).length,7);assert.deepEqual(selectFrameworkCases(['--only=ActorCheck,UiCheck']).map(([name])=>name),['ActorCheck','UiCheck']);for(const args of [['--only='],['--only=ActorCheck,ActorCheck'],['--only=Stress'],['--only']])assert.throws(()=>selectFrameworkCases(args));
});
test('browser result parsing requires exactly the selected actually observed Java families',async()=>{
 const {browserExecutionRecords}=await import('./api-evidence.mjs');const result={status:'passed',selectedFixtures:['helpers','audio'],browser:'unit-browser',apiEvidence:[{caseId:'browser/helpers',raw:'unit-only transport'},{caseId:'browser/audio',raw:'unit-only transport'}]};
 const wrap=value=>'### Result\n'+JSON.stringify(value)+'\n### Ran Playwright code\nunit-only';assert.deepEqual(browserExecutionRecords(wrap(result),['helpers','audio']),result);
 for(const modify of [copy=>copy.apiEvidence.pop(),copy=>copy.apiEvidence.push(copy.apiEvidence[0]),copy=>copy.apiEvidence[0].caseId='browser/unknown',copy=>copy.selectedFixtures.reverse(),copy=>copy.status='pending']){const copy=structuredClone(result);modify(copy);assert.throws(()=>browserExecutionRecords(wrap(copy),['helpers','audio']));}
});
test('current receipt loading remeasures tools and producer closure; actual POM and wrapper are retained',async()=>{
 const {executionIdentity,persistJavaEvidence,loadJavaEvidence,nativeToolFiles}=await import('./api-evidence.mjs');const fixture=await receiptFixture(),temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'zero-current-proof-unit-')));
 try {
  const project=path.join(temporary,'project'),outputDirectory=path.join(temporary,'output');fs.mkdirSync(path.join(project,'src/main/java'),{recursive:true});fs.mkdirSync(outputDirectory);
  for(const source of fixture.manifest.sources){const dest=path.join(project,source.path.slice('framework/'.length));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,source.path),dest);}
  for(const name of ['pom.xml','mvnw','mvnw.cmd','zero.json','.mvn'])fs.cpSync(path.join(root,'student-template',name),path.join(project,name),{recursive:true});
  fs.writeFileSync(path.join(outputDirectory,'unit-output'),'synthetic unit artifact only');
  const {copyProjectBuilderFixture}=await import('./project-builder-fixture.mjs');
  const canonical=path.join(temporary,'canonical');copyProjectBuilderFixture(canonical,root);
  fs.cpSync(path.join(root,'framework/src'),path.join(canonical,'framework/src'),{recursive:true});
  for(const name of ['mvnw','mvnw.cmd','zero.json','.mvn'])fs.cpSync(path.join(root,'student-template',name),path.join(canonical,'student-template',name),{recursive:true});
  const tool=path.join(temporary,'unit-tool'),harness=path.join(canonical,'prepare-starter.mjs');fs.writeFileSync(tool,'synthetic tool');const producerBytes=fs.readFileSync(path.join(root,'scripts/prepare-starter.mjs'));fs.writeFileSync(harness,producerBytes);
  const javaHome=path.join(temporary,'jdk'),mavenHome=path.join(temporary,'maven');
  for(const [base,names] of [[javaHome,['bin/java','bin/javac','release','lib/modules','lib/server/libjvm.dylib','conf/security/java.security']],[mavenHome,['bin/mvn','boot/classworlds.jar','lib/maven-core.jar','conf/settings.xml']]])for(const name of names){const file=path.join(base,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic '+name);}
  const tools=nativeToolFiles({javaHome,mavenHome,node:tool});
  for(const file of [path.join(javaHome,'bin/javac'),path.join(javaHome,'lib/modules'),path.join(mavenHome,'lib/maven-core.jar')])assert.ok(tools.includes(file));
  const measure=()=>executionIdentity({manifest:fixture.manifest,projectRoot:project,outputDirectory,toolFiles:tools,platform:'unit-only',harnessFiles:[harness],sourceRoot:canonical});
  for(const name of ['pom.xml','mvnw','.mvn/wrapper/maven-wrapper.properties']) {const file=path.join(project,name),before=fs.readFileSync(file);fs.appendFileSync(file,'unit mutation');assert.throws(measure,/assembled POM, wrapper/);fs.writeFileSync(file,before);}
  const measured=measure();
  const entry=fixture.manifest.signatures[0],link=entry.evidence.native[0];const raw='ZERO_API_EVIDENCE_V1\nI|'+entry.id+'|'+link.assertionId+'\nA|'+entry.id+'|'+link.assertionId+'|'+link.postcondition+'|42\nEND_ZERO_API_EVIDENCE';
  const receipts=path.join(temporary,'receipts');persistJavaEvidence({directory:path.join(receipts,'unit'),manifest:fixture.manifest,raw,...measured,runId:'unit-measured',target:'native',caseId:nativeCases[0].id});
  assert.equal(validateEvidenceReceipts(loadJavaEvidence(receipts,{manifest:fixture.manifest,sourceRoot:canonical})).coveredTargets,1);
  const retained=path.join(receipts,'unit','artifacts',measured.inputs.fixture.configurationSha256);const configuration=fs.readFileSync(retained);fs.appendFileSync(retained,'changed');assert.throws(()=>loadJavaEvidence(receipts,{manifest:fixture.manifest,sourceRoot:canonical}),/stale current POM/);fs.writeFileSync(retained,configuration);
  const canonicalPom=path.join(canonical,'student-template/pom.xml'),pomBytes=fs.readFileSync(canonicalPom);fs.appendFileSync(canonicalPom,'changed');assert.throws(()=>loadJavaEvidence(receipts,{manifest:fixture.manifest,sourceRoot:canonical}),/stale current POM/);fs.writeFileSync(canonicalPom,pomBytes);
  const mavenCore=path.join(mavenHome,'lib/maven-core.jar'),mavenBytes=fs.readFileSync(mavenCore);fs.appendFileSync(mavenCore,'changed');assert.throws(()=>loadJavaEvidence(receipts,{manifest:fixture.manifest,sourceRoot:canonical}),/stale current/);fs.writeFileSync(mavenCore,mavenBytes);
  fs.writeFileSync(tool,'changed');assert.throws(()=>loadJavaEvidence(receipts,{manifest:fixture.manifest,sourceRoot:canonical}),/stale current/);fs.writeFileSync(tool,'synthetic tool');fs.writeFileSync(harness,'changed');assert.throws(()=>loadJavaEvidence(receipts,{manifest:fixture.manifest,sourceRoot:canonical}),/stale current/);
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
});
test('pixel postconditions require measured channels or visible text ink',async()=>{
 const {validatePixelObservation,validateUiObservation}=await import('./api-evidence.mjs');const observation={assertionId:'unit-pixel',specification:'pixel,10,20,0,0,255,255',data:[0,0,255,255]};assert.match(validatePixelObservation(observation.specification,observation),/255/);
 for(const data of [[255,0,0,255],[0,0,255],[-1,0,255,255]])assert.throws(()=>validatePixelObservation(observation.specification,{...observation,data}));
 for(const data of [[255,255,255,255],[0,0,0,0]])assert.throws(()=>validatePixelObservation('ink,0,0,1,1',{assertionId:'unit-ink',specification:'ink,0,0,1,1',data}),/no ink/);
 assert.match(validatePixelObservation('ink,0,0,1,1',{assertionId:'unit-ink',specification:'ink,0,0,1,1',data:[0,0,255,255]}),/ink/);
 assert.match(validateUiObservation('text,Visible',{assertionId:'unit-ui',specification:'text,Visible',data:{text:'Visible',visible:true}}),/Visible/);
 assert.throws(()=>validateUiObservation('text,Visible',{assertionId:'unit-ui',specification:'text,Visible',data:{text:'Visible',visible:false}}),/postcondition/);
});
test('pending Java drawing records need exact external evidence and retain measured bytes',async()=>{
 const {receiptFromJavaEvents,persistJavaEvidence,loadJavaEvidence}=await import('./api-evidence.mjs');const fixture=await receiptFixture(),entry=fixture.manifest.signatures[0],caseId='browser/lifecycle',link={caseId,assertionId:'unit-drawing',postcondition:'Synthetic unit-only blue witness'};entry.evidence.browser=[link];
 const output=Buffer.from('unit-only compiled output'),identity={...fixture.receipts[0].identity,manifestSha256:hash(JSON.stringify(fixture.manifest)),outputSha256:hash(output)};
 const specification='pixel,1,2,0,0,255,255',raw='ZERO_API_EVIDENCE_V1\nI|'+entry.id+'|'+link.assertionId+'\nP|'+entry.id+'|'+link.assertionId+'|'+link.postcondition+'|'+specification+'\nEND_ZERO_API_EVIDENCE';const pixels=[{assertionId:link.assertionId,specification,data:[0,0,255,255]}],options={manifest:fixture.manifest,raw,pixels,identity,runId:'unit-external',target:'browser',caseId};
 assert.equal(receiptFromJavaEvents(options).receipt.outcomes.length,1);for(const alter of [copy=>copy.pixels=[],copy=>copy.pixels[0].data[0]=255,copy=>copy.pixels.push(copy.pixels[0]),copy=>copy.target='native']){const copy=structuredClone(options);alter(copy);assert.throws(()=>receiptFromJavaEvents(copy));}
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'zero-pixel-receipt-unit-'));try{const directory=path.join(temporary,'case');persistJavaEvidence({...options,directory,output});assert.equal(validateEvidenceReceipts(loadJavaEvidence(temporary,{manifest:fixture.manifest,checkCurrentInputs:false})).coveredTargets,1);const metadata=JSON.parse(fs.readFileSync(path.join(directory,'java-events.json'),'utf8'));fs.writeFileSync(path.join(directory,'artifacts',metadata.pixelsSha256),'[]');assert.throws(()=>loadJavaEvidence(temporary,{manifest:fixture.manifest,checkCurrentInputs:false}),/changed pixel transport/);}finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('frame, disabled input and actual media completion postconditions reject absent effects',async()=>{
 const {validateUiObservation}=await import('./api-evidence.mjs');const check=(specification,data)=>validateUiObservation(specification,{assertionId:'unit-completion',specification,data});
 const cases=[
 ['canvas,960.0,480.0',{attached:true,width:960,height:480},data=>data.attached=false],
 ['frames',{updates:1,draws:1},data=>data.draws=0],
 ['stopped-frames',{before:8,after:8},data=>data.after=10],
 ['disabled-controls',{disabled:true,valueBefore:'Ada',valueAfter:'Ada',actionsBefore:2,actionsAfter:2},data=>data.actionsAfter=3],
 ['media,play',{publicPlaying:true,playing:true,time:.2},data=>data.publicPlaying=false],
 ['media,loop',{publicPlaying:true,playing:true,loop:true,duration:1,elapsed:1150,wraps:1},data=>data.elapsed=900],
 ['media,pause',{publicPlaying:false,playing:false,before:.2,after:.2,elapsed:120},data=>data.after=.4],
 ['media,stop',{publicPlaying:false,playing:false,time:0},data=>data.time=.2],
 ['media,sound-play',{publicPlaying:true,voices:2},data=>data.voices=0],
 ['media,sound-stop',{publicPlaying:false,voices:0},data=>data.voices=1]
 ];
 for(const [specification,data,mutate]of cases){assert.doesNotThrow(()=>check(specification,data));const changed=structuredClone(data);mutate(changed);assert.throws(()=>check(specification,changed));}
});
test('actual Java deferred completion stays pending until a later checked observation',t=>{
 if(!fs.existsSync(path.join(jdk,'bin/javac'))){t.skip('Cached JDK unavailable.');return;}
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'zero-completion-unit-'));try{
  const source=path.join(temporary,'Deferred.java');fs.writeFileSync(source,`import evidence.ApiProof;
class Deferred { public static void main(String[] args) {
 int[] effects={0};ApiProof.pending("unit#call()","later","Synthetic unit callback changes observed state",()->effects[0]++,"java,later");
 if(!ApiProof.events().contains("O|unit#call()"))throw new Error("premature completion");
 try{ApiProof.complete("later","wrong","1");throw new Error("bad postcondition accepted");}catch(IllegalStateException expected){}
 if(!ApiProof.events().contains("O|unit#call()"))throw new Error("failed assertion completed");
 ApiProof.complete("later",""+effects[0],"1");
 try{ApiProof.complete("later","1","1");throw new Error("duplicate completed");}catch(IllegalStateException expected){}
 try{ApiProof.complete("absent","1","1");throw new Error("absent completed");}catch(IllegalStateException expected){}
 System.out.println(ApiProof.events());
} }`);
  const compiled=spawnSync(path.join(jdk,'bin/javac'),['-d',temporary,path.join(root,'framework/evidence/java/evidence/ApiProof.java'),source],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);const ran=spawnSync(path.join(jdk,'bin/java'),['-cp',temporary,'Deferred'],{encoding:'utf8'});assert.equal(ran.status,0,ran.stderr);assert.match(ran.stdout,/I\|unit#call\(\)\|later\nA\|unit#call\(\)/);assert.doesNotMatch(ran.stdout,/O\|unit#call/);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});

test('native producer closure binds assembly, process, release, transitive builder and pinned archive implementation',async()=>{
 const {nativeProducerFiles}=await import('./api-evidence.mjs');const files=nativeProducerFiles();
 for(const relative of ['scripts/kit.mjs','scripts/prepare-starter.mjs','scripts/verification-project.mjs','scripts/process-specification.mjs','scripts/release.mjs','scripts/prepare-project-builder.mjs','extension/src/core-contract.js','package-lock.json','release/kit.json'])assert.ok(files.includes(path.join(root,relative)),relative);
 assert.ok(files.some(file=>file.includes('node_modules/fflate/')&&file.endsWith('.cjs')));
 for(const file of files)assert.ok(fs.statSync(file).isFile(),file);
});
test('every browser evidence family selects only Main with all shared non-entry probes present',()=>{
 const {adaptSources}=createRequire(import.meta.url)('../extension/src/web-export/adapters');
 for(const relative of ['framework/web-checks/Main.java','framework/web-checks/navigation/Main.java','framework/web-checks/audio/Main.java','framework/web-checks/lifecycle/Main.java']) {
  const sources={'Main.java':fs.readFileSync(path.join(root,relative),'utf8')};
  for(const source of manifest.sources)sources[source.path.slice('framework/src/main/java/'.length)]=fs.readFileSync(path.join(root,source.path),'utf8');
  for(const name of fs.readdirSync(path.join(root,'framework/evidence/java/evidence')).filter(name=>name.endsWith('.java')&&name!=='ApiNative.java'))sources['evidence/'+name]=fs.readFileSync(path.join(root,'framework/evidence/java/evidence',name),'utf8');
  if(relative==='framework/web-checks/Main.java')sources['GameApiChecks.java']=fs.readFileSync(path.join(root,'framework/web-checks/GameApiChecks.java'),'utf8');
  const adapted=adaptSources({sources});assert.equal(adapted.mainClass,'zero.web.BrowserLauncher');assert.ok(!adapted.sources['zero/web/BrowserLauncher.java'].includes('__APPLICATION_CLASS__'));
 }
});
test('target gate requires all of that target, rejects missing/stale, and permits other target gaps',async()=>{
 const {requireTargetEvidence}=await import('./api-evidence.mjs');const evidence=await receiptFixture();
 evidence.manifest.signatures=evidence.manifest.signatures.slice(0,1);
 evidence.receipts[0].identity.manifestSha256=hash(JSON.stringify(evidence.manifest));
 evidence.expectedIdentities['native:'+nativeCases[0].id].manifestSha256=evidence.receipts[0].identity.manifestSha256;
 assert.equal(requireTargetEvidence(evidence,'native').status,'complete');
 assert.throws(()=>requireTargetEvidence(evidence,'browser'),/browser execution gate/);
 assert.throws(()=>requireTargetEvidence({...evidence,receipts:[]},'native'),/native execution gate/);
 evidence.receipts[0].identity.toolSha256='f'.repeat(64);assert.throws(()=>requireTargetEvidence(evidence,'native'),/stale/);
});
test('explicit finite numeric transport preserves values while numeric-looking text remains strict',t=>{
 if(!fs.existsSync(path.join(jdk,'bin/javac'))){t.skip('Cached JDK unavailable.');return;}
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'zero-numeric-transport-unit-'));try{
 const source=path.join(temporary,'Numbers.java');fs.writeFileSync(source,`import evidence.ApiProof;
class Numbers { public static void main(String[] args) {
 double[] values={10.0,-20.0,0.0,-0.0,.25,10.5,10.75};String[] expected={"10","-20","0","0","0.25","10.5","10.75"};
 for(int i=0;i<values.length;i++)if(!ApiProof.number(values[i]).equals(expected[i]))throw new Error("bad numeric transport");
 for(double invalid:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY})try{ApiProof.number(invalid);throw new Error("nonfinite accepted");}catch(IllegalArgumentException expectedError){}
 int[] calls={0};ApiProof.equal("unit#geometry()","numeric","Numeric fields compare actual finite values",()->{calls[0]++;return ApiProof.number(10)+","+ApiProof.number(20.0);},"10,20");
 if(calls[0]!=1)throw new Error("numeric invocation count");
 for(String text:new String[]{"42.0","42 ","042"})try{ApiProof.equal("unit#text()",text,"Text remains exact",()->text,"42");throw new Error("text equivalence accepted");}catch(IllegalStateException expectedError){}
 ApiProof.pending("unit#textLater()","strict-completion","Text completion remains exact",()->{},"text,42");
 try{ApiProof.complete("strict-completion","42.0","42");throw new Error("completion coerced text");}catch(IllegalStateException expectedError){}
 ApiProof.complete("strict-completion","42","42");System.out.println("NUMERIC_TRANSPORT_OK");
} }`);
 const compiled=spawnSync(path.join(jdk,'bin/javac'),['-d',temporary,path.join(root,'framework/evidence/java/evidence/ApiProof.java'),source],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
 const ran=spawnSync(path.join(jdk,'bin/java'),['-cp',temporary,'Numbers'],{encoding:'utf8'});assert.equal(ran.status,0,ran.stderr);assert.match(ran.stdout,/NUMERIC_TRANSPORT_OK/);
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
