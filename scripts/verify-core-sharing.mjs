#!/usr/bin/env node
// Finite trusted local proof. Nothing runs by default; --prepare writes only
// owned disposable projects. --run executes their explicitly maintained checks.
// No public catalogue, global Maven install, global trust or hosted execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import core from '../extension/src/core-contract.js';
import contracts from '../extension/src/sharing/contracts.js';
import authoring from '../extension/src/sharing/authoring.js';
import localCheck from '../extension/src/sharing/local-check.js';
import consumer from '../extension/src/sharing/consumer.js';
import jars from '../extension/src/sharing/jar.js';
import webExport from '../extension/src/web-export/index.js';
import snapshot from '../extension/src/web-export/snapshot.js';
import compatibility from '../extension/src/web-export/compatibility/index.js';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const repository={id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'};
const identity=contracts.identity('library',repository.id,'score-views'),version='0.1.0';
const shared=['ScoreView','ScoreDisplay','BarScoreDisplay'];
const imports=shared.map(n=>`import ${identity.namespace}.${n};`).join('\n')+'\n';
const commands=[];
let terminationUnconfirmed=false;
const fail=m=>{throw Error(m);};
const tool=(home,name)=>path.join(home,'bin',process.platform==='win32'?name+'.exe':name);
async function write(p,b){await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,b);}
async function json(p,v){await write(p,JSON.stringify(v,null,2)+'\n');}
async function walk(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())fail('Proof inputs must not be links: '+p);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);else fail('Nonordinary proof input: '+p);}return out.sort();}
async function run(command,args,{cwd=root,env=process.env,log,timeoutMs=180000}={}){
 const start=Date.now();let output='',exitCode=0;
 try{const result=await localCheck.processRun({command,args,cwd,env},{timeoutMs});output=result.output;return output;}
 catch(error){exitCode=1;terminationUnconfirmed ||= error.terminationUnconfirmed===true;output=String(error.stack||error);throw error;}
 finally{commands.push({command,args,cwd,exitCode,elapsedMs:Date.now()-start,log});if(log)await write(log,output);}
}
async function sourceInventory(){const files=[...await walk(path.join(root,'framework/src/main/java/zero')),...await walk(path.join(root,'framework/prototypes/shared')),...await walk(path.join(root,'framework/prototypes/counter')),...await walk(path.join(root,'framework/prototypes/coin-game')),...await walk(path.join(root,'extension/src/web-export')),...await walk(path.join(root,'extension/src/sharing'))];
 for(const n of ['student-template/pom.xml','student-template/mvnw','student-template/mvnw.cmd','student-template/zero.json','student-template/.mvn/wrapper/maven-wrapper.properties','extension/src/core-contract.js','sharing/harness/ZeroLibraryHarness.java','framework/prototypes/checks/counter/PrototypeCheck.java','framework/prototypes/checks/coin-game/PrototypeCheck.java','scripts/verify-core-sharing.mjs'])files.push(path.join(root,n));
 return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async p=>[path.relative(root,p),sha(await fs.readFile(p))])));
}
async function unchanged(out){const expected=JSON.parse(await fs.readFile(path.join(out,'inputs.json'),'utf8'));if(JSON.stringify(expected)!==JSON.stringify(await sourceInventory()))fail('Frozen source/engine/proof changed; prepare a new output directory.');}
async function scaffold(project,id,{withShared=false}={}){
 await fs.mkdir(path.join(project,'src/main/java'),{recursive:true});
 for(const n of ['pom.xml','mvnw','mvnw.cmd','zero.json'])await fs.copyFile(path.join(root,'student-template',n),path.join(project,n));
 await fs.cp(path.join(root,'student-template/.mvn'),path.join(project,'.mvn'),{recursive:true});await fs.chmod(path.join(project,'mvnw'),0o755);await fs.copyFile(path.join(root,'LICENSE'),path.join(project,'LICENSE'));
 const sources={};for(const n of core.coreSourcePaths){const bytes=await fs.readFile(path.join(root,'framework',n));sources[n]=bytes;await write(path.join(project,n),bytes);}
 await json(path.join(project,'zero-core.json'),core.makeCoreRecord(sources));
 for(const p of await walk(path.join(root,'framework/prototypes',id)))if(p.endsWith('.java')){const n=path.basename(p),text=await fs.readFile(p,'utf8');await write(path.join(project,'src/main/java',n),(withShared||!['Main.java','Hud.java'].includes(n)?'':imports)+text);}
 if(withShared)for(const n of shared)await fs.copyFile(path.join(root,'framework/prototypes/shared',n+'.java'),path.join(project,'src/main/java',n+'.java'));
}
function behavior(name,selected){return `${imports}import zero.ui.Element;\nimport javafx.scene.Node;\nimport javafx.scene.Parent;\nimport javafx.scene.control.Label;\npublic class ${name} {\n public static void main(String[] args) {\n  ScoreView chosen=new ${selected}(),other=new ScoreDisplay(); Element stable=chosen.view();\n  chosen.setScore(7);other.setScore(2);\n  if(!contains(stable.fxNode(),"Score: 7")||!contains(other.view().fxNode(),"Score: 2"))throw new AssertionError("Independent actual-JAR views");\n  chosen.setScore(11);if(chosen.view()!=stable||!contains(stable.fxNode(),"Score: 11"))throw new AssertionError("Stable live view");\n  chosen.setScore(-3);if(!contains(stable.fxNode(),"Score: -3")||!contains(other.view().fxNode(),"Score: 2"))throw new AssertionError("Exact unclamped score");\n  if(chosen instanceof BarScoreDisplay&&!contains(stable.fxNode(),"[----------]"))throw new AssertionError("Negative bar");\n  System.out.println("${name}_OK");\n }\n private static boolean contains(Node n,String value){if(n instanceof Label l&&l.getText().equals(value))return true;if(n instanceof Parent p)for(Node c:p.getChildrenUnmodifiable())if(contains(c,value))return true;return false;}\n}\n`;}
async function prepare(out){
 await fs.mkdir(out);const projects=[];
 for(const id of ['counter','coin-game']){
  const project=path.join(out,'local-'+id);await scaffold(project,id,{withShared:true});const record=await core.readProjectCore(project,{required:true});
  const descriptor={schema:2,kind:'library',slug:identity.slug,version,title:'Score views',description:'Finite local proof of an interchangeable Zero score presentation.',license:'MIT',libraryKind:'widget',coreRequirement:{minVersion:'0.3.0',maxExclusive:'0.4.0'},coreInput:{version:record.coordinate.version,sourceSha256:record.sourceSha256}};
  const edits=[];for(const n of id==='counter'?['Main.java']:['Main.java','Hud.java']){const p='src/main/java/'+n,before=await fs.readFile(path.join(project,p),'utf8');edits.push({path:p,before,after:imports+before});}
  const plan=await authoring.previewExtraction(project,{repository,descriptor,sources:shared.map(n=>'src/main/java/'+n+'.java'),edits});
  await json(path.join(out,`${id}-extraction-review.json`),{identity:plan.identity,descriptor:plan.descriptor,changes:plan.changes});await authoring.applyPlan(plan);
  for(const [rel,name,selection]of [['src/test/java','LibraryCheck','BarScoreDisplay'],['examples/first','FirstExample','ScoreDisplay'],['examples/second','SecondExample','BarScoreDisplay']])await write(path.join(project,'libraries/score-views',rel,name+'.java'),behavior(name,selection));
  const artifact=path.join(out,'artifact-'+id);await scaffold(artifact,id);projects.push({id,local:project,artifact});
 }
 await json(path.join(out,'projects.json'),projects);await json(path.join(out,'inputs.json'),await sourceInventory());
 console.log('CORE_SHARING_PREPARED '+out);
}
async function copyCache(from,to){
 await fs.mkdir(to);let bytes=0;
 const allowed=/^(?:org|com|net|ch|io|software|commons-[a-z-]+|javax|jakarta|junit|antlr|aopalliance|asm|backport-util-concurrent|classworlds|dom4j|doxia|jdom|log4j|oro|xml-apis|xmlpull|xpp3)$/;
 for(const e of await fs.readdir(from,{withFileTypes:true}))if(e.isDirectory()&&allowed.test(e.name))await fs.cp(path.join(from,e.name),path.join(to,e.name),{recursive:true,filter:async p=>{const s=await fs.lstat(p);if(s.isSymbolicLink())fail('Linked Maven cache input');if(s.isFile()&&(bytes+=s.size)>750000000)fail('Third-party cache exceeds 750 MB bound');return true;}});
 return bytes;
}
async function maven(project,args,config,log){const settings=path.join(config.out,'maven-settings.xml');return run(path.join(project,'mvnw'),['-B','-ntp','-s',settings,'-gs',settings,`-Dmaven.repo.local=${config.cache}`,...args],{cwd:project,env:config.env,log:path.join(config.out,log),timeoutMs:180000});}
async function nativeConsumer(project,id,mode,config,expectedJar){
 const driver=path.join(project,'src/main/java/PrototypeCheck.java'),original=await fs.readFile(path.join(root,'framework/prototypes/checks',id,'PrototypeCheck.java'),'utf8');
 const libraryOrigin=mode==='artifact'?`java.nio.file.Path.of(${JSON.stringify(expectedJar)}).toRealPath()`:'expected';
 const assertions=`\n            java.nio.file.Path expected=java.nio.file.Path.of("target/classes").toRealPath();\n            if(!java.nio.file.Path.of(zero.App.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath().equals(expected))throw new AssertionError("Consumer must own core runtime");\n            for(Class<?> c:new Class<?>[]{ScoreView.class,ScoreDisplay.class,BarScoreDisplay.class})if(!java.nio.file.Path.of(c.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath().equals(${libraryOrigin}))throw new AssertionError("Wrong contribution origin: "+c);\n            System.out.println("CORE_SHARING_ORIGINS_OK ${mode} ${id}");\n`;
 if(!original.includes('            Main app = new Main();'))fail('Maintained native harness changed');
 await write(driver,imports+original.replace('            Main app = new Main();',assertions+'            Main app = new Main();'));
 try{const output=await maven(project,['-Dapp.mainClass=PrototypeCheck','clean','compile','javafx:run'],config,`${mode}-${id}-native.log`);if(!output.includes('CORE_SHARING_ORIGINS_OK')||!output.includes(id==='counter'?'ZERO_COUNTER_PROTOTYPE_OK':'ZERO_COIN_PROTOTYPE_OK'))fail('Native behavior/origin marker absent');
 const classes=path.join(project,'target/classes',identity.namespace.replaceAll('.','/'));if(mode==='artifact'&&await fs.stat(classes).catch(()=>null))fail('Artifact contribution classes leaked into app output');
 }finally{await fs.rm(driver,{force:true});}
}
async function unusedLibraryNegative(config,project){
 const sources={};for(const p of await walk(path.join(project,'src/main/java')))if(p.endsWith('.java'))sources[path.relative(path.join(project,'src/main/java'),p).split(path.sep).join('/')]=await fs.readFile(p,'utf8');
 for(const p of await walk(path.join(project,'libraries/score-views/src/main/java')))if(p.endsWith('.java'))sources[path.relative(path.join(project,'libraries/score-views/src/main/java'),p).split(path.sep).join('/')]=await fs.readFile(p,'utf8');
 const name=identity.namespace.replaceAll('.','/')+'/BarScoreDisplay.java';
 sources[name]=sources[name].replace(/}\s*$/, ' public long unusedUnsupportedCall(){return System.nanoTime();}\n}\n');
 let diagnostic;
 try{await compatibility.checkCompatibility({sources,pom:await fs.readFile(path.join(root,'student-template/pom.xml'),'utf8'),workRoot:path.join(config.out,'negative-unused-library'),cacheRoot:config.webCache,env:{JAVA_HOME:config.home},getArtifact:async()=>fail('Negative proof requires verified cached attribution JARs')});}
 catch(error){diagnostic=error.message;}
 if(!diagnostic||!diagnostic.includes('nanoTime'))fail('Unused unsupported library call did not receive its precise semantic diagnostic: '+diagnostic);
 await json(path.join(config.out,'semantic-negative.json'),{status:'passed',unusedMethod:true,source:name,unsupported:'java.lang.System#nanoTime()',diagnostic,sourceSha256:sha(sources[name])});
}
async function child(configPath){
 const config=JSON.parse(await fs.readFile(configPath,'utf8'));config.env={...process.env,JAVA_HOME:config.home,MAVEN_OPTS:`-Djavax.net.ssl.trustStore=${config.truststore} -Djavax.net.ssl.trustStorePassword=changeit`};
 await unchanged(config.out);const projects=JSON.parse(await fs.readFile(path.join(config.out,'projects.json'),'utf8'));
 const context=await consumer.loadCatalog({catalogUrl:config.origin+'/catalog.json',artifactOrigin:config.origin}),release=context.catalog.releases[0];await consumer.verifyLibrary(context,release);
 const steps=[];
 for(const p of projects){await nativeConsumer(p.local,p.id,'local',config);
  const plan=await consumer.planChange(p.artifact,context,release,{operation:'add'});await consumer.validatePlan(plan,context);await write(path.join(p.artifact,'pom.xml'),plan.afterText);
  const group=path.join(config.cache,...identity.coordinate.groupId.split('.'));await fs.rm(group,{recursive:true,force:true});
  await maven(p.artifact,['clean','compile','org.apache.maven.plugins:maven-dependency-plugin:3.8.1:sources'],config,`artifact-${p.id}-resolve.log`);
  const artifactDir=path.join(group,identity.coordinate.artifactId,version),jar=path.join(artifactDir,`score-views-${version}.jar`),sources=path.join(artifactDir,`score-views-${version}-sources.jar`);
  if(sha(await fs.readFile(jar))!==release.artifacts.jar.sha256||sha(await fs.readFile(sources))!==release.artifacts.sources.sha256)fail('Maven-resolved contribution differs from catalogue');
  await nativeConsumer(p.artifact,p.id,'artifact',config,jar);steps.push({id:p.id,freshMavenContribution:true,jar,sources,contributionNotInAppClasses:true,coreOrigin:'consumer target/classes'});
 }
 if(config.web){
  const builds=[],attempts=[],sharingSettings={catalogUrl:config.origin+'/catalog.json',artifactOrigin:config.origin};
  await json(path.join(config.out,'web-builds.json'),builds);
  for(const p of projects)for(const mode of ['local','artifact']){
   await unchanged(config.out);const projectRoot=p[mode],name=`${mode}-${p.id}`;
   const attempt={name,startedAt:new Date().toISOString(),status:'started'};attempts.push(attempt);await json(path.join(config.out,'web-attempts.json'),attempts);
   try{
    const result=await webExport.exportForWeb({projectRoot,cacheRoot:config.webCache,sharingSettings,onProgress:m=>console.log(`${name}: ${m}`)});
    const record={name,projectRoot,validated:false,...result};builds.push(record);await json(path.join(config.out,'web-builds.json'),builds);
    await snapshot.validateExport({projectRoot,result,sharingSettings});record.validated=true;attempt.status='validated';attempt.completedAt=new Date().toISOString();await json(path.join(config.out,'web-builds.json'),builds);
   }catch(error){attempt.status='failed';attempt.error=error.message;throw error;}
   finally{await json(path.join(config.out,'web-attempts.json'),attempts);}
  }
 }

 await unchanged(config.out);await json(path.join(config.out,'child-proof.json'),{steps,commands});
}
async function execute(config){
 await unchanged(config.out);if(await fs.stat(path.join(config.out,'receipt.json')).catch(()=>null))fail('Keep prior receipt immutable; prepare a fresh output directory');const receipt={schema:1,status:'failed',scope:'Trusted finite local core-dependent sharing proof; no public acceptance',startedAt:new Date().toISOString(),actualWebExports:0,requests:[]};let server,checkPlan;
 try{
  config.home=config.home||(process.platform==='darwin'?(await run('/usr/libexec/java_home',['-v','17'])).trim():process.env.JAVA_HOME);if(!config.home)fail('Set --java-home; no tool installation is performed');
  config.cache=path.join(config.out,'maven-cache');receipt.cacheBytes=await copyCache(config.cacheFrom,config.cache);await write(path.join(config.out,'maven-settings.xml'),'<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"><interactiveMode>false</interactiveMode></settings>');
  const author=path.join(config.out,'local-counter');checkPlan=await localCheck.prepareLocalCheck(author,identity.slug,{temporaryRoot:config.out,javaHome:config.home});
  await unusedLibraryNegative(config,author);
  const result=await localCheck.runLocalCheck(checkPlan,{keepFiles:true,timeoutMs:180000,runner:async(spec,options)=>{const args=spec.command.endsWith('mvnw')?['-s',path.join(config.out,'maven-settings.xml'),'-gs',path.join(config.out,'maven-settings.xml'),`-Dmaven.repo.local=${config.cache}`,...spec.args]:spec.args;const output=await run(spec.command,args,{...spec,log:path.join(config.out,`check-${commands.length}.log`),timeoutMs:options.timeoutMs});return {code:0,output};}});
  if(!result.passed||!result.coreBuild||!result.coreJar?.path||!result.artifactPom?.path)fail('Independent core/JAR Check result is incomplete');
  if(!result.sourcesJar?.path)fail('Independent Check must return its validated sources JAR');
  const sourcesPath=result.sourcesJar.path;
  const artifacts={jar:await fs.readFile(result.jar.path),sources:await fs.readFile(sourcesPath),pom:await fs.readFile(result.artifactPom.path)};
  for(const kind of ['jar','sources'])jars.inspectLibraryJar(artifacts[kind],{namespace:identity.namespace,coordinate:{...identity.coordinate,version},kind:kind==='jar'?'binary':'sources'});
  if(/<build>|<parent>|systemPath|zero-library-check-/.test(artifacts.pom.toString()))fail('Artifact POM contains build authority');
  await json(path.join(config.out,'check-result.json'),result);receipt.coreBuild=result.coreBuild;
  const retainedCore=path.join(config.out,'artifacts/zero-core-0.3.0.jar');await write(retainedCore,await fs.readFile(result.coreJar.path));receipt.retainedCoreJar={path:retainedCore,sha256:sha(await fs.readFile(retainedCore)),size:(await fs.stat(retainedCore)).size,served:false};
  const files=new Map();const manifest={};for(const [kind,bytes]of Object.entries(artifacts)){const p=contracts.artifactPath(identity,version,kind);files.set('/'+p,bytes);files.set('/'+p+'.sha1',Buffer.from(createHash('sha1').update(bytes).digest('hex')));files.set('/'+p+'.sha256',Buffer.from(sha(bytes)));manifest[kind]={path:p,size:bytes.length,sha256:sha(bytes)};await write(path.join(config.out,'artifacts',path.basename(p)),bytes);}
  const key=path.join(config.out,'localhost.key'),cert=path.join(config.out,'localhost.crt');config.truststore=path.join(config.out,'temporary-truststore');
  await run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{log:path.join(config.out,'certificate.log')});await fs.copyFile(path.join(config.home,'lib/security/cacerts'),config.truststore);await fs.chmod(config.truststore,0o600);
  await run(tool(config.home,'keytool'),['-importcert','-noprompt','-alias','zero-local-proof','-file',cert,'-keystore',config.truststore,'-storepass','changeit'],{log:path.join(config.out,'temporary-trust.log')});
  let catalog;server=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},(req,res)=>{receipt.requests.push({path:req.url,method:req.method,agent:req.headers['user-agent']||''});const bytes=req.url==='/catalog.json'?Buffer.from(JSON.stringify(catalog)):files.get(req.url);if(!['GET','HEAD'].includes(req.method)||!bytes){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-length':bytes.length,'content-type':'application/octet-stream','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});config.origin=`https://127.0.0.1:${server.address().port}`;
  for(const a of Object.values(manifest))a.url=config.origin+'/'+a.path;
  const release={schema:2,kind:'library',id:identity.id,slug:identity.slug,version,title:'Score views',description:'Finite local fixture, not a public release.',license:'MIT',libraryKind:'widget',repository,contributor:{githubId:repository.ownerId,login:repository.owner},source:{commit:'a'.repeat(40),folder:'libraries/score-views',sha256:sha(JSON.stringify(checkPlan.snapshot))},policyRevision:'b'.repeat(40),status:'available',namespace:identity.namespace,coordinate:{...identity.coordinate,version},coreRequirement:checkPlan.library.descriptor.coreRequirement,coreBuild:result.coreBuild,artifacts:manifest};
  catalog=contracts.validateCatalog({schema:1,revision:'c'.repeat(40),releases:[release]},{artifactOrigin:config.origin});await json(path.join(config.out,'catalog.json'),catalog);await json(path.join(config.out,'child-config.json'),config);
  await run(process.execPath,[script,'--child',path.join(config.out,'child-config.json')],{env:{...process.env,NODE_EXTRA_CA_CERTS:cert},log:path.join(config.out,'consumer-proof.log'),timeoutMs:600000});
  const child=JSON.parse(await fs.readFile(path.join(config.out,'child-proof.json'),'utf8'));if(receipt.requests.some(r=>r.path.includes('/school/zero/')||r.path.includes('zero-core')))fail('Consumer requested core artifact');
  const mavenJars=receipt.requests.filter(r=>/maven/i.test(r.agent)&&r.path.endsWith('.jar')&&!r.path.endsWith('-sources.jar'));if(mavenJars.length!==2)fail('Expected two fresh contribution Maven JAR resolutions, got '+mavenJars.length);
  if(await fs.stat(path.join(config.cache,'school/zero/zero-core')).catch(()=>null))fail('Core was installed or resolved in disposable consumer Maven cache');
  receipt.status='local-verified';receipt.steps=child.steps;receipt.commands=[...commands,...child.commands];receipt.actualMavenJarResolutions=mavenJars.length;receipt.artifacts=manifest;receipt.actualWebExports=config.web?4:0;receipt.inputs=await sourceInventory();receipt.limits=['Trusted local finite proof only; no public catalogue or hosted checking','macOS/native JavaFX and headless browser are separate acceptance lanes','No global Maven install or trust changes; no core artifact hosted or resolved'];
 }catch(e){receipt.error=e.message;throw e;}finally{if(server)await new Promise(resolve=>server.close(resolve));if(checkPlan&&!terminationUnconfirmed)await localCheck.disposeLocalCheck(checkPlan);for(const n of ['localhost.key','temporary-truststore'])await fs.rm(path.join(config.out,n),{force:true});receipt.actualWebExports=JSON.parse(await fs.readFile(path.join(config.out,'web-builds.json'),'utf8').catch(()=> '[]')).length;receipt.webAttempts=JSON.parse(await fs.readFile(path.join(config.out,'web-attempts.json'),'utf8').catch(()=> '[]'));receipt.terminationUnconfirmed=terminationUnconfirmed;receipt.cleanup=terminationUnconfirmed?'Owned HTTPS server stopped; uncertain command termination recorded; Check state retained for inspection':'Owned HTTPS server stopped; ephemeral private key/truststore and Check build removed; exact checked artifacts retained separately';receipt.supervisionLimit='Each Maven/native command uses maintained process-tree supervision. The outer child has a separate deadline; detached descendant groups cannot be claimed stopped solely from the outer child exit.';receipt.completedAt=new Date().toISOString();await json(path.join(config.out,'receipt.json'),receipt);}
}
async function main(){
 if(process.argv[2]==='--child'){await child(process.argv[3]);return;}
 const args=process.argv.slice(2),config={out:path.join(root,'.verification/vision-core-sharing'),cacheFrom:path.join(os.homedir(),'.m2/repository'),webCache:process.env.ZERO_WEB_CACHE_ROOT||path.join(root,'.verification/web-export-checks/cache')};let prepareOnly=false,executeNow=false;
 for(let i=0;i<args.length;i++){const a=args[i];if(a==='--prepare')prepareOnly=true;else if(a==='--run')executeNow=true;else if(a==='--web')config.web=true;else if(['--output','--cache-from','--java-home','--web-cache'].includes(a)){const v=args[++i];if(!v||v.startsWith('--'))fail('Missing '+a+' value');config[{'--output':'out','--cache-from':'cacheFrom','--java-home':'home','--web-cache':'webCache'}[a]]=path.resolve(v);}else fail('Unknown option: '+a);}
 if(!prepareOnly&&!executeNow){console.log('Usage: node scripts/verify-core-sharing.mjs --prepare [--output NEW_OWNED_DIR]\nAfter source freeze: --run [--web] [--cache-from THIRD_PARTY_M2] [--web-cache CACHE]');return;}
 if(process.platform==='win32')fail('This finite fixture needs a POSIX wrapper; Windows acceptance is separate.');
 if(prepareOnly)await prepare(config.out);if(executeNow)await execute(config);
}
await main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
