#!/usr/bin/env node
// Trusted finite local acceptance fixture. No submitted Java, Git writes, public
// execution or global trust changes. Child processes alone trust the local CA.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import contracts from '../extension/src/sharing/contracts.js';
import consumer from '../extension/src/sharing/consumer.js';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const repository={id:'9000000001',ownerId:'9000000002',owner:'zero-proof',name:'local-consumers',url:'https://github.com/zero-proof/local-consumers'};
const identity=contracts.identity('library',repository.id,'proof-counter');
const versions=['1.0.0','1.0.1'];
const groupPath=identity.coordinate.groupId.replaceAll('.','/');
const classPath=identity.namespace.replaceAll('.','/')+'/Counter';
const commands=[];
function fail(message){throw new Error(message);}
async function run(command,args,{cwd,env=process.env,log,timeoutMs=180000}={}) {
 const started=Date.now();return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,shell:false,windowsHide:true});let output='',forced;
  const timer=setTimeout(()=>{forced=new Error(`Proof command timed out: ${command}`);child.kill();},timeoutMs);
  function collect(chunk){output+=chunk.toString();if(Buffer.byteLength(output)>4*1024*1024){forced=new Error('Proof command output exceeded 4 MiB.');child.kill();}}
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',async code=>{
   clearTimeout(timer);commands.push({command,args,cwd,exitCode:code,elapsedMs:Date.now()-started,log});
   try{if(log)await fs.writeFile(log,output,{flag:'wx'});if(forced)throw forced;if(code!==0)throw new Error(`Proof command failed (${code}); ${log||command}\n${output.slice(-3000)}`);resolve(output);}catch(error){reject(error);}
  });
 });
}
function tool(home,name){return path.join(home,'bin',process.platform==='win32'?name+'.exe':name);}
async function javaHome(explicit) {
 if(explicit)return fs.realpath(explicit);
 if(process.platform==='darwin')return (await run('/usr/libexec/java_home',['-v','17'])).trim();
 if(process.env.JAVA_HOME)return fs.realpath(process.env.JAVA_HOME);
 fail('Pass --java-home with a supported JDK 17+; the proof installs no tools.');
}
async function copyCache(from,to) {
 await fs.mkdir(to);
 // Omit all local/student first-party groups, notably ca/codepet, instead of
 // trusting any previously installed contribution from the developer cache.
 const allowed=/^(?:org|com|net|ch|io|software|commons-[a-z-]+|javax|jakarta|junit|antlr|aopalliance|asm|backport-util-concurrent|classworlds|dom4j|doxia|jdom|log4j|oro|xml-apis|xmlpull|xpp3)$/;
 let bytes=0;
 for(const entry of await fs.readdir(from,{withFileTypes:true}))if(allowed.test(entry.name)&&entry.isDirectory()) {
  await fs.cp(path.join(from,entry.name),path.join(to,entry.name),{recursive:true,filter:async filename=>{
   const stat=await fs.lstat(filename);if(stat.isSymbolicLink())fail('Proof Maven caches must contain ordinary files.');
   if(stat.isFile()){bytes+=stat.size;if(bytes>750_000_000)fail('Third-party cache exceeds the bounded 750 MB fixture allowance.');}
   return true;
  }});
 }
 return bytes;
}
function plainPom(version) {
 return `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>${identity.coordinate.groupId}</groupId><artifactId>${identity.coordinate.artifactId}</artifactId><version>${version}</version><name>Trusted proof counter</name><licenses><license><name>MIT</name></license></licenses><dependencies></dependencies></project>\n`;
}
async function buildVersions(temp,home,out) {
 const license=await fs.readFile(path.join(root,'LICENSE')),artifacts=new Map(),releases=[];
 for(const version of versions) {
  const build=path.join(temp,'library-'+version),source=path.join(build,'src',classPath+'.java'),classes=path.join(build,'classes');
  await fs.mkdir(path.dirname(source),{recursive:true});await fs.mkdir(classes);await fs.mkdir(path.join(classes,'META-INF'));
  const text=`package ${identity.namespace};\npublic final class Counter {\n    private int value;\n    public void add(int amount) { value += amount; }\n    public int value() { return value; }\n    public String version() { return "${version}"; }\n}\n`;
  await fs.writeFile(source,text);await fs.writeFile(path.join(classes,'META-INF/LICENSE'),license);await fs.mkdir(path.join(build,'src/META-INF'));await fs.writeFile(path.join(build,'src/META-INF/LICENSE'),license);
  const jar=path.join(build,'counter.jar'),sources=path.join(build,'sources.jar');
  await run(tool(home,'javac'),['--release','17','-d',classes,source],{log:path.join(out,`library-${version}-javac.log`)});
  await run(tool(home,'jar'),['--create','--file',jar,'-C',classes,'.'],{log:path.join(out,`library-${version}-jar.log`)});
  await run(tool(home,'jar'),['--create','--file',sources,'-C',path.join(build,'src'),'.'],{log:path.join(out,`library-${version}-sources.log`)});
  const manifest={};for(const [kind,bytes] of [['jar',await fs.readFile(jar)],['sources',await fs.readFile(sources)],['pom',Buffer.from(plainPom(version))]]) {
   const artifactPath=contracts.artifactPath(identity,version,kind);artifacts.set('/'+artifactPath,bytes);
   artifacts.set('/'+artifactPath+'.sha1',Buffer.from(createHash('sha1').update(bytes).digest('hex')));
   artifacts.set('/'+artifactPath+'.sha256',Buffer.from(digest(bytes)));
   manifest[kind]={path:artifactPath,size:bytes.length,sha256:digest(bytes)};
  }
  releases.push({schema:1,kind:'library',id:identity.id,slug:identity.slug,version,title:'Trusted proof counter',description:'Finite local fixture; not a public release or compatibility acceptance.',license:'MIT',libraryKind:'helper',repository,contributor:{githubId:repository.ownerId,login:repository.owner},source:{commit:'a'.repeat(40),folder:'libraries/'+identity.slug,sha256:digest(text)},policyRevision:'b'.repeat(40),status:'available',namespace:identity.namespace,coordinate:{...identity.coordinate,version},components:[{className:identity.namespace+'.Counter',description:'Trusted finite counter',usage:'new Counter();',api:['public void add(int amount)','public int value()','public String version()']}],artifacts:manifest});
 }
 return {artifacts,releases};
}
const mainSource=`import ${identity.namespace}.Counter;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.security.MessageDigest;\nimport java.util.HexFormat;\npublic class Main {\n public static void main(String[] args) throws Exception {\n  Counter counter=new Counter(); counter.add(7); counter.add(-2);\n  if(counter.value()!=5 || !counter.version().equals(args[0])) throw new AssertionError("Wrong exact version or arithmetic");\n  Path actual=Path.of(Counter.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath();\n  if(!actual.equals(Path.of(args[2]).toRealPath()) || !actual.toString().endsWith(".jar")) throw new AssertionError("Counter did not come from resolved Maven JAR: "+actual);\n  String sha256=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(actual)));\n  if(!sha256.equals(args[1])) throw new AssertionError("Maven resolved bytes differ from catalog hash");\n  System.out.println("CONSUMER_OK version="+counter.version()+" sha256="+sha256+" origin="+actual);\n }\n}\n`;
async function makeProject(temp,name) {
 const project=path.join(temp,name);await fs.mkdir(path.join(project,'src/main/java'),{recursive:true});await fs.writeFile(path.join(project,'src/main/java/Main.java'),mainSource);await fs.writeFile(path.join(project,'zero.json'),'{}');
 await fs.copyFile(path.join(root,'student-template/pom.xml'),path.join(project,'pom.xml'));
 for(const filename of ['mvnw','mvnw.cmd'])await fs.copyFile(path.join(root,'student-template',filename),path.join(project,filename));await fs.chmod(path.join(project,'mvnw'),0o755);await fs.cp(path.join(root,'student-template/.mvn'),path.join(project,'.mvn'),{recursive:true});return project;
}
async function childProof(configFile) {
 const config=JSON.parse(await fs.readFile(configFile,'utf8')),steps=[];
 const context=await consumer.loadCatalog({catalogUrl:config.origin+'/catalog.json',artifactOrigin:config.origin});
 const settingsFile=path.join(config.temp,'maven-settings.xml');await fs.writeFile(settingsFile,'<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"><interactiveMode>false</interactiveMode></settings>');
 const childEnv={...process.env,JAVA_HOME:config.home,MAVEN_OPTS:`-Djavax.net.ssl.trustStore=${config.truststore} -Djavax.net.ssl.trustStorePassword=changeit`};
 for(const projectName of ['game-consumer','second-consumer']) {
  const project=await makeProject(config.temp,projectName);
  for(const [operation,version] of [['add','1.0.0'],['update','1.0.1'],['revert','1.0.0']]) {
   const release=context.catalog.releases.find(r=>r.version===version),plan=await consumer.planChange(project,context,release,{operation});await consumer.validatePlan(plan,context);await fs.writeFile(path.join(project,'pom.xml'),plan.afterText);
   await fs.rm(path.join(config.cache,groupPath),{recursive:true,force:true});
   try{await fs.access(path.join(config.cache,groupPath));fail('Assigned contribution namespace was not empty.');}catch(error){if(error.code!=='ENOENT')throw error;}
   const wrapper=path.join(project,process.platform==='win32'?'mvnw.cmd':'mvnw');if(process.platform==='win32')fail('This acceptance script requires a supported shell wrapper; physical Windows proof remains separate.');
   const args=['-B','-ntp','-s',settingsFile,'-gs',settingsFile,`-Dmaven.repo.local=${config.cache}`,'clean','compile'];
   const output=await run(wrapper,args,{cwd:project,env:childEnv,log:path.join(config.out,`${projectName}-${operation}-maven.log`)});if(!output.includes('BUILD SUCCESS'))fail('Maven compile did not report success.');
   const compiled=path.join(project,'target/classes');
   try{await fs.access(path.join(compiled,classPath+'.class'));fail('A library class was compiled into the consumer output.');}catch(error){if(error.code!=='ENOENT')throw error;}
   const expectedJar=path.join(config.cache,groupPath,identity.coordinate.artifactId,version,`${identity.coordinate.artifactId}-${version}.jar`);
   if(digest(await fs.readFile(expectedJar))!==release.artifacts.jar.sha256)fail('Resolved Maven JAR differs from verified bytes.');
   const runArgs=['-cp',[compiled,expectedJar].join(path.delimiter),'Main',version,release.artifacts.jar.sha256,expectedJar];
   const result=await run(tool(config.home,'java'),runArgs,{cwd:project,log:path.join(config.out,`${projectName}-${operation}-run.log`)});if(!result.includes('CONSUMER_OK'))fail('Consumer behavior/origin harness failed.');
   // Explicit source attachment through the project's own pinned wrapper.
   await run(wrapper,['-B','-ntp','-s',settingsFile,'-gs',settingsFile,`-Dmaven.repo.local=${config.cache}`,'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:sources'],{cwd:project,env:childEnv,log:path.join(config.out,`${projectName}-${operation}-sources.log`)});
   const sourceJar=expectedJar.replace(/\.jar$/,'-sources.jar');if(digest(await fs.readFile(sourceJar))!==release.artifacts.sources.sha256)fail('Maven source attachment differs from catalog bytes.');
   const entry={project:projectName,operation,version,jarSha256:release.artifacts.jar.sha256,sourcesSha256:release.artifacts.sources.sha256,jarOrigin:expectedJar,namespaceEmptyBeforeBuild:true,noLibraryClassesInConsumerOutput:true};steps.push(entry);process.stdout.write(`Passed ${projectName} ${operation} ${version}\n`);
  }
 }
 await fs.writeFile(path.join(config.out,'child-proof.json'),JSON.stringify({steps,commands},null,2)+'\n',{flag:'wx'});
}
async function main() {
 if(process.argv[2]==='--child'){await childProof(process.argv[3]);return;}
 let output=path.join(root,'.verification/sharing-consumers'),cacheFrom=path.join(os.homedir(),'.m2/repository'),explicitHome;
 for(let i=2;i<process.argv.length;i++){const arg=process.argv[i],next=process.argv[++i];if(!next)fail('Each proof option needs a value.');if(arg==='--output')output=path.resolve(next);else if(arg==='--cache-from')cacheFrom=path.resolve(next);else if(arg==='--java-home')explicitHome=next;else fail(`Unknown proof option: ${arg}`);}
 const started=Date.now();await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);const out=await fs.realpath(output),temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-sharing-consumers-')));let server;
 const receipt={schema:1,status:'failed',transport:'local HTTPS fixture with scoped child-process trust',publicHttps:false,submittedCodeExecuted:false,globalTrustChanged:false,platform:{os:process.platform,arch:process.arch,node:process.version},limits:['Trusted finite generated helpers only','No managed checker acceptance or public publication','Other platforms and VS Code interactive source navigation untested']};
 try {
  const home=await javaHome(explicitHome);receipt.platform.java=(await run(tool(home,'java'),['-version'])).trim();receipt.platform.javaHome=home;
  const cache=path.join(temp,'repository');receipt.thirdPartyCacheBytes=await copyCache(cacheFrom,cache);
  const key=path.join(temp,'localhost.key'),cert=path.join(temp,'localhost.crt'),truststore=path.join(temp,'truststore');
  await run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{log:path.join(out,'certificate.log')});
  await fs.copyFile(path.join(home,'lib/security/cacerts'),truststore);
  // CI JDKs can ship read-only cacerts. Only this disposable copy is writable.
  await fs.chmod(truststore,0o600);
  await run(tool(home,'keytool'),['-importcert','-noprompt','-alias','zero-local-proof','-file',cert,'-keystore',truststore,'-storepass','changeit'],{log:path.join(out,'temporary-trust.log')});
  const built=await buildVersions(temp,home,out),requests=[];let catalog;
  server=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},(req,res)=>{
   const url=req.url;requests.push({path:url,method:req.method,agent:req.headers['user-agent']||'',elapsedMs:Date.now()-started});
   if(!['GET','HEAD'].includes(req.method)||!url||url.includes('?')){res.writeHead(405);res.end();return;}
   const bytes=url==='/catalog.json'?Buffer.from(JSON.stringify(catalog)):built.artifacts.get(url);if(!bytes){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'content-type':url==='/catalog.json'?'application/json':'application/octet-stream','content-length':bytes.length,'cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`https://127.0.0.1:${server.address().port}`;
  for(const release of built.releases)for(const artifact of Object.values(release.artifacts))artifact.url=origin+'/'+artifact.path;
  catalog=contracts.validateCatalog({schema:1,revision:'c'.repeat(40),releases:built.releases},{artifactOrigin:origin});
  const config=path.join(temp,'child-config.json');await fs.writeFile(config,JSON.stringify({temp,out,home,cache,origin,truststore}));
  await run(process.execPath,[script,'--child',config],{env:{...process.env,NODE_EXTRA_CA_CERTS:cert},log:path.join(out,'native-and-maven-proof.log'),timeoutMs:600000});
  const child=JSON.parse(await fs.readFile(path.join(out,'child-proof.json'),'utf8'));
  const mavenJarRequests=requests.filter(r=>/maven/i.test(r.agent)&&r.method==='GET'&&r.path.endsWith('.jar')&&!r.path.endsWith('-sources.jar'));
  if(mavenJarRequests.length!==6)fail(`Expected six fresh Maven library JAR resolutions; got ${mavenJarRequests.length}.`);
  receipt.status='local-verified';receipt.steps=child.steps;receipt.versions=built.releases.map(r=>({version:r.version,artifacts:r.artifacts}));receipt.commands=[...commands,...child.commands];receipt.requests=requests;receipt.catalogRevision=catalog.revision;receipt.actualMavenJarResolutions=mavenJarRequests.length;receipt.sourceAttachmentsVerified=true;
 } catch(error){receipt.error=error.message;receipt.commands=commands;throw error;}
 finally {
  if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(temp,{recursive:true,force:true});receipt.temporaryStateRemoved=true;receipt.elapsedMs=Date.now()-started;await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 }
 process.stdout.write(`SHARING_CONSUMERS_VERIFIED ${path.join(out,'receipt.json')}\n`);
}
await main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
