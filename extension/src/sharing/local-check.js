'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {discoverLibraries,libraryPom,javaFiles,declaration,safePath,read,hash,coreState,fixedBuild} = require('./authoring');
const fail = message => { throw new Error(message); };
const HARNESS_BUNDLED = path.resolve(__dirname,'../../media/sharing-harness/ZeroLibraryHarness.java');
const HARNESS_SOURCE = path.resolve(__dirname,'../../../sharing/harness/ZeroLibraryHarness.java');
const MAX_OUTPUT = 1024 * 1024;
function processRun(spec, {signal,timeoutMs = 120000,terminationMs = 5000,graceMs = 500,platform = process.platform,spawnProcess = spawn,killProcess = process.kill.bind(process),systemRoot = process.env.SystemRoot || 'C:\\Windows'} = {}) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) return reject(new Error('Local Check cancelled.'));
    if (![timeoutMs,terminationMs,graceMs].every(n => Number.isSafeInteger(n) && n > 0)) return reject(new Error('Invalid local Check deadline.'));
    // A separate POSIX session owns the wrapper's download helpers and JVM as
    // one process group. Signals never target VS Code's inherited group.
    const child = spawnProcess(spec.command,spec.args,{cwd:spec.cwd,env:spec.env || process.env,shell:spec.shell || false,windowsHide:true,detached:platform !== 'win32'});
    const pid = child.pid;
    let output = '', done = false, stopping = false, exited = false, closed = false, exitCode;
    let forcedError, lastProbeError, stopTimer, graceTimer, treePoll, treeKiller, killerExited = false, treeConfirmed = false;
    function finish(error,code) {
      if (done) return; done=true;
      clearTimeout(timer);clearTimeout(stopTimer);clearTimeout(graceTimer);clearInterval(treePoll);
      signal?.removeEventListener('abort',cancel);
      if (error || forcedError || code !== 0) reject(error || forcedError || new Error(`Local Check command failed (${code}):\n${output}`));
      else resolve({code,output});
    }
    function unconfirmed(detail) {
      if (done) return;
      forcedError.terminationUnconfirmed = true;
      forcedError.message += ` Process-tree termination was not confirmed${pid ? ` (Check PID ${pid})` : ''}: ${detail}. Check may still be running.`;
      // Do not let inherited pipes hold this promise open after its stop budget.
      child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();child.unref?.();
      if (treeKiller && !killerExited) {treeKiller.kill('SIGKILL');treeKiller.stdout?.destroy();treeKiller.stderr?.destroy();treeKiller.unref?.();}
      finish(forcedError);
    }
    function completeStop() {
      if (closed && treeConfirmed) finish(forcedError,exitCode);
    }
    function groupGone() {
      try {killProcess(-pid,0);return false;}
      catch(error) {if(error.code==='ESRCH')return true;if(error.code==='EPERM'){lastProbeError=error.message;return false;}throw error;}
    }
    function probeGroup() {
      if(done||treeConfirmed)return;
      try {treeConfirmed=groupGone();if(treeConfirmed){clearInterval(treePoll);clearTimeout(graceTimer);}completeStop();}
      catch(error) {unconfirmed(error.message);}
    }
    function stop(message) {
      if(done||stopping)return;stopping=true;forcedError=new Error(message);
      stopTimer=setTimeout(()=>unconfirmed(lastProbeError || 'the stop deadline expired'),terminationMs);
      if(!Number.isSafeInteger(pid)||pid<2) {unconfirmed('no owned process PID was available');return;}
      if(platform==='win32') {
        // Never dispatch PID termination after the tracked parent has exited;
        // a delayed taskkill could otherwise hit a recycled parent PID.
        if(exited) {unconfirmed('the parent exited before its descendants could be terminated');return;}
        try {
          treeKiller=spawnProcess(path.win32.join(systemRoot,'System32','taskkill.exe'),['/PID',String(pid),'/T','/F'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
          treeKiller.stdout?.resume();treeKiller.stderr?.resume();
          treeKiller.once('error',error=>{killerExited=true;unconfirmed(`taskkill failed: ${error.message}`);});
          treeKiller.once('exit',code=>{killerExited=true;if(done)return;if(code!==0){unconfirmed(`taskkill exited with ${code}`);return;}treeConfirmed=true;completeStop();});
        } catch(error) {unconfirmed(`taskkill could not start: ${error.message}`);}
      } else {
        try {killProcess(-pid,'SIGTERM');}
        catch(error) {if(error.code!=='ESRCH'){unconfirmed(error.message);return;}}
        probeGroup();
        if(done||treeConfirmed)return;
        treePoll=setInterval(probeGroup,25);
        graceTimer=setTimeout(()=>{
          if(done||treeConfirmed)return;
          try {killProcess(-pid,'SIGKILL');}
          catch(error) {if(error.code==='EPERM')lastProbeError=error.message;else if(error.code!=='ESRCH'){unconfirmed(error.message);return;}}
          probeGroup();
        },Math.min(graceMs,Math.max(1,Math.floor(terminationMs/2))));
      }
    }
    const cancel=()=>stop('Local Check cancelled.');
    const timer=setTimeout(()=>stop('Local Check timed out. Stop the check or simplify the example.'),timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    const collect=data=>{
      output+=data.toString();
      if(Buffer.byteLength(output)>MAX_OUTPUT) {output=output.slice(-MAX_OUTPUT);stop('Local Check produced too much output.');}
    };
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('exit',code=>{exited=true;exitCode=code;});
    child.once('error',error=>{if(stopping)unconfirmed(error.message);else finish(error);});
    child.once('close',code=>{closed=true;exitCode=code;if(stopping)completeStop();else finish(null,code);});
    // Capture an abort that raced with process creation/listener attachment.
    if(signal?.aborted)cancel();
  });
}
async function resourceFiles(root, directory) {
  const names=[];
  async function walk(dir) {
    const stat=await fs.lstat(path.join(root,dir)).catch(e => { if (e.code==='ENOENT') return null; throw e; });
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`Use ordinary library resource directories: ${dir}`);
    for (const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})) {
      const filename=`${dir}/${entry.name}`;
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) fail(`Do not include symbolic links or private files in library resources: ${filename}`);
      if (entry.isDirectory()) await walk(filename); else if (entry.isFile()) names.push(filename);
      else fail(`Use ordinary library resources: ${filename}`);
    }
  }
  await walk(directory); return names.sort();
}
async function inputs(root, library) {
  const limits=require('./contracts').LIMITS;
  const resources=await resourceFiles(root,`${library.folder}/src/main/resources`);
  const resourceNamespace=`${library.folder}/src/main/resources/${library.identity.namespace.replaceAll('.','/')}/`;
  if (resources.some(filename => !filename.startsWith(resourceNamespace))) fail(`Keep library resources inside ${library.identity.namespace.replaceAll('.','/')}/ to avoid source-root collisions.`);
  const files = [...library.sources,...resources,`libraries/${library.slug}/zero-library.json`];
  if (library.descriptor.schema === 2 && await read(root,`${library.folder}/LICENSE`,true) !== null) files.push(`${library.folder}/LICENSE`);
  const classes = [], namespace = library.identity.namespace;
  for (const filename of library.sources) {
    const source = await read(root,filename), decl = declaration(source,filename);
    if (decl.packageName !== namespace && !decl.packageName.startsWith(namespace+'.')) fail(`Keep library sources in ${namespace}: ${filename}`);
    classes.push(decl.className);
  }
  if (!classes.length) fail('This library has no Java source classes.');
  const checks = await javaFiles(root,`${library.folder}/src/test/java`);
  const first = await javaFiles(root,`${library.folder}/examples/first`);
  const second = await javaFiles(root,`${library.folder}/examples/second`);
  const mains = [];
  for (const [label,group] of [['behavior checks',checks],['first example',first],['second example',second]]) {
    const groupMains = [];
    for (const filename of group) {
      const source = await read(root,filename), decl = declaration(source,filename);
      if (library.descriptor.schema === 2 && (decl.packageName === 'zero' || (decl.packageName.startsWith('zero.') && !decl.packageName.startsWith('zero.contrib.')))) fail(`A check/example shadows the Zero core namespace: ${filename}`);
      if (decl.packageName === namespace || decl.packageName.startsWith(namespace+'.') || classes.includes(decl.className)) fail(`A check/example shadows the library namespace: ${filename}`);
      if (/\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(?:\[\s*\]\s*[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\s*\[\s*\])\s*\)/.test(decl.masked)) groupMains.push(decl.className);
    }
    if (!groupMains.length) fail(`Add an ordinary public static void main(String[] args) for the ${label}. Use assertions that fail when behavior is wrong.`);
    mains.push(...groupMains); files.push(...group);
  }
  if (new Set(mains).size !== mains.length) fail('Use different class names for each behavior check and example.');
  if (files.length > limits.libraryFiles) fail('Library sources, checks and examples exceed the supported file count.');
  let bytes=0; for (const filename of files) bytes += (await fs.stat(await safePath(root,filename))).size;
  if (bytes > limits.librarySourceBytes) fail('Library sources, checks and examples exceed the supported source size.');
  return {files,classes,mains,checks:[...checks,...first,...second]};
}
async function fingerprint(root,names) { const out=[]; for (const name of names) out.push({path:name,sha256:hash(await fs.readFile(await safePath(root,name)))}); return out; }
async function captureInputs(root,names) {
  const bytes=new Map(), snapshot=[];
  for (const name of names) {
    const contents=await fs.readFile(await safePath(root,name));
    bytes.set(name,contents); snapshot.push({path:name,sha256:hash(contents)});
  }
  return {bytes,snapshot};
}
function javaTool(name, javaHome) { return javaHome ? path.join(javaHome,'bin',process.platform === 'win32' ? `${name}.exe` : name) : name; }
function mavenCommand(wrapper,args,root,javaHome) {
  const spec={command:wrapper,args:['-B','-ntp','-V',...args],cwd:root,...(javaHome?{env:{...process.env,JAVA_HOME:javaHome}}:{})};
  if (process.platform === 'win32') {
    if ([spec.command,...spec.args].some(s=>/["%&|<>^!\r\n]/.test(s))) fail('Local Check on Windows needs a project/temp path without command-shell special characters.');
    const line='"'+[spec.command,...spec.args].map(s=>'"'+s+'"').join(' ')+'"';
    spec.command=process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'; spec.args=['/d','/s','/c',line];
  }
  return spec;
}
async function prepareCoreCheck(root,library,input,{temporaryRoot,javaHome,harnessPath}) {
  const core=require('../core-contract'), state=await coreState(root,library.descriptor);
  const captured=await captureInputs(root,input.files), original=captured.snapshot, wrapperName=process.platform==='win32'?'mvnw.cmd':'mvnw';
  const toolNames=[wrapperName,'.mvn/wrapper/maven-wrapper.properties'], tools=await captureInputs(root,toolNames), toolSnapshot=tools.snapshot;
  // Only this known text file permits checkout line-ending normalization. Keep
  // raw fingerprints for drift; execute the same normalized bytes we pin here.
  const propertiesName='.mvn/wrapper/maven-wrapper.properties';
  tools.bytes.set(propertiesName,Buffer.from(core.normalizeSource(tools.bytes.get(propertiesName))));
  const stagedToolSnapshot=toolNames.map(name=>({path:name,sha256:hash(tools.bytes.get(name))}));
  const trusted=require('./archive').TRUSTED_WRAPPER_HASHES;
  if (stagedToolSnapshot.some(item=>item.sha256!==trusted[item.path])) fail('Core-dependent Check requires the pinned Zero Maven wrapper and properties. Restore project build files before checking.');
  const temp=await fs.realpath(await fs.mkdtemp(path.join(temporaryRoot || os.tmpdir(),'zero-library-check-')));
  try {
    const pom=path.join(temp,'pom.xml'), corePom=path.join(temp,'core/pom.xml'), libPom=path.join(temp,'library/pom.xml');
    const target=path.join(temp,'library/target'), classesDir=path.join(temp,'checks'), classpathFile=path.join(temp,'classpath.txt');
    const stagedChecks={}, stagedNames=[];
    for (const name of toolNames) {
      const destination=path.join(temp,name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,tools.bytes.get(name),{flag:'wx'});stagedNames.push(name);
    }
    const wrapper=path.join(temp,wrapperName);await fs.chmod(wrapper,0o755);
    for (const filename of input.files) {
      const relative=filename.slice(library.folder.length+1), name=`library/${relative}`, destination=path.join(temp,name);
      await fs.mkdir(path.dirname(destination),{recursive:true}); await fs.writeFile(destination,captured.bytes.get(filename),{flag:'wx'}); stagedNames.push(name);
      if (input.checks.includes(filename)) stagedChecks[filename]=destination;
    }
    for (const name of core.coreSourcePaths) {
      const destination=path.join(temp,'core',name);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.writeFile(destination,core.normalizeSource(await fs.readFile(await safePath(root,name))),{flag:'wx'}); stagedNames.push(`core/${name}`);
    }
    const coreSources={}; for(const name of core.coreSourcePaths) coreSources[name]=await fs.readFile(path.join(temp,'core',name));
    core.validateCoreRecord(state.record,coreSources);
    const coreVersion=state.record.coordinate.version;
    const corePomText=`<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>zero-core</artifactId><version>${coreVersion}</version><properties><maven.compiler.release>17</maven.compiler.release><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties><dependencies>${['javafx-controls','javafx-media'].map(artifact=>`<dependency><groupId>org.openjfx</groupId><artifactId>${artifact}</artifactId><version>${core.currentCore.javafxVersion}</version></dependency>`).join('')}</dependencies>${fixedBuild({sourceDirectory:'src/main/java'})}</project>\n`;
    const libPomText=libraryPom(library.identity,library.descriptor,{sourceDirectory:'src/main/java',resourceDirectory:'src/main/resources',licenseDirectory:'.'});
    const reactorPomText='<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>school.zero.check</groupId><artifactId>local-check</artifactId><version>1.0.0</version><packaging>pom</packaging><modules><module>core</module><module>library</module></modules><build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-clean-plugin</artifactId><version>3.2.0</version></plugin></plugins></build></project>\n';
    for(const [filename,text]of [[pom,reactorPomText],[corePom,corePomText],[libPom,libPomText]]) {await fs.writeFile(filename,text,{flag:'wx'});stagedNames.push(path.relative(temp,filename).split(path.sep).join('/'));}
    await fs.mkdir(classesDir);
    const harnessSource=path.join(temp,'ZeroLibraryHarness.java');
    await fs.copyFile(harnessPath || await fs.access(HARNESS_SOURCE).then(()=>HARNESS_SOURCE,()=>HARNESS_BUNDLED),harnessSource,fs.constants.COPYFILE_EXCL);stagedNames.push('ZeroLibraryHarness.java');
    const jar=path.join(target,`${library.identity.coordinate.artifactId}-${library.descriptor.version}.jar`), sourcesJar=path.join(target,`${library.identity.coordinate.artifactId}-${library.descriptor.version}-sources.jar`), coreJar=path.join(temp,'core/target',`zero-core-${coreVersion}.jar`);
    const commands=[mavenCommand(wrapper,['-f',pom,'clean','package','-Dmaven.test.skip=true'],temp,javaHome),mavenCommand(wrapper,['-f',corePom,'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath',`-Dmdep.outputFile=${classpathFile}`],temp,javaHome)];
    const plan={schema:1,root,slug:library.slug,library,temp,pom,target,jar,sourcesJar,coreJar,corePom,artifactPom:path.join(temp,'artifact.pom'),classesDir,classpathFile,harnessSource,input,snapshot:original,maven:commands[0],commands,javaHome,stagedChecks,stagedNames,
      stagedSnapshot:await fingerprint(temp,stagedNames),toolSnapshot,coreSnapshot:state.snapshot,coreRecord:state.record,coreClasses:core.coreSourcePaths.map(n=>n.slice('src/main/java/'.length,-5).replaceAll('/','.')),
      buildRecipeSha256:hash(JSON.stringify({schema:1,reactorPom:reactorPomText,corePom:corePomText,libraryPom:libPomText,wrapper:stagedToolSnapshot,commands:[['clean','package','-Dmaven.test.skip=true'],['org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath']],javac:['--release','17','-proc:none'],harness:hash(await fs.readFile(harnessSource))})),
      summary:{library:library.identity.id,version:library.descriptor.version,kind:library.descriptor.libraryKind,classes:input.classes,checks:input.mains,mode:library.mode,core:state.record.coordinate}};
    if (JSON.stringify(await fingerprint(root,input.files))!==JSON.stringify(original) || JSON.stringify(await fingerprint(root,toolNames))!==JSON.stringify(toolSnapshot) || JSON.stringify((await coreState(root,library.descriptor)).snapshot)!==JSON.stringify(state.snapshot)) fail('Library, Maven wrapper or core changed while preparing Check. Prepare again.');
    return plan;
  } catch(error) {await fs.rm(temp,{recursive:true,force:true});throw error;}
}
async function verifiedCoreBytes(plan,libraryBytes) {
  const {inspectLibraryJar,inspectJar}=require('./jar');
  inspectLibraryJar(libraryBytes,{namespace:plan.library.identity.namespace,coordinate:{...plan.library.identity.coordinate,version:plan.library.descriptor.version},kind:'binary'});
  const sourceStat=await fs.lstat(plan.sourcesJar);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !sourceStat.size || sourceStat.size>require('./contracts').LIMITS.artifactBytes) fail('Maven did not produce an ordinary sources JAR.');
  inspectLibraryJar(await fs.readFile(plan.sourcesJar),{namespace:plan.library.identity.namespace,coordinate:{...plan.library.identity.coordinate,version:plan.library.descriptor.version},kind:'sources'});
  const coreStat=await fs.lstat(plan.coreJar);
  if (!coreStat.isFile() || coreStat.isSymbolicLink()) fail('Maven did not produce an ordinary core JAR.');
  const coreBytes=await fs.readFile(plan.coreJar);
  if (!coreBytes.length || coreBytes.length>require('./contracts').LIMITS.artifactBytes) fail('Invalid core JAR size.');
  const coreEntries=inspectJar(coreBytes), prefixes=plan.coreClasses.map(n=>n.replaceAll('.','/'));
  for (const item of coreEntries) {
    if (item.path.endsWith('/')) continue;
    if (item.path==='META-INF/MANIFEST.MF') continue;
    if (!item.path.endsWith('.class') || !prefixes.some(p=>item.path===p+'.class'||item.path.startsWith(p+'$'))) fail('Core JAR contains an unexpected entry: '+item.path);
  }
  for (const p of prefixes) if (!coreEntries.some(e=>e.path===p+'.class')) fail('Core JAR is missing reviewed class: '+p);
  return coreBytes;
}
async function coreResultFor(plan,libraryBytes,outputs,toolVersions,keepFiles) {
  const coreBytes=await verifiedCoreBytes(plan,libraryBytes);
  const coreBuild=require('../core-contract').validateCoreBuild({version:plan.coreRecord.coordinate.version,sourceSha256:plan.coreRecord.sourceSha256,jarSha256:hash(coreBytes),buildRecipeSha256:plan.buildRecipeSha256,javaRelease:'17',javafxVersion:plan.coreRecord.javafxVersion},plan.library.descriptor.coreRequirement);
  const pomBytes=Buffer.from(libraryPom(plan.library.identity,plan.library.descriptor,{coreBuild}));
  await fs.writeFile(plan.artifactPom,pomBytes,{flag:'wx'});
  const sourcesBytes=await fs.readFile(plan.sourcesJar);
  return {coreBuild,sourcesJar:{path:keepFiles?plan.sourcesJar:null,sha256:hash(sourcesBytes),size:sourcesBytes.length},coreJar:{path:keepFiles?plan.coreJar:null,sha256:hash(coreBytes),size:coreBytes.length},artifactPom:{path:keepFiles?plan.artifactPom:null,sha256:hash(pomBytes),size:pomBytes.length},provenance:{kind:'local-check',buildRecipeSha256:plan.buildRecipeSha256,coreSourceSha256:plan.coreRecord.sourceSha256,toolVersions,mavenVersionOutput:outputs[0].output}};
}
async function prepareLocalCheck(root, slug, {temporaryRoot,javaHome = process.env.JAVA_HOME,harnessPath} = {}) {
  root=path.resolve(root);
  const library=(await discoverLibraries(root)).find(l => l.slug === slug); if (!library) fail('Choose an authored library.');
  const input=await inputs(root,library);
  if (library.descriptor.schema === 2) return prepareCoreCheck(root,library,input,{temporaryRoot,javaHome,harnessPath});
  // These fixed tools run only following an explicit local Check action. This is
  // not a hosted candidate executor and does not establish public acceptance.
  const wrapper = await safePath(root,process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
  const temp=await fs.realpath(await fs.mkdtemp(path.join(temporaryRoot || os.tmpdir(),'zero-library-check-')));
  try {
    const pom=path.join(temp,'pom.xml'), target=path.join(temp,'target'), classesDir=path.join(temp,'checks'), classpathFile=path.join(temp,'classpath.txt');
    await fs.mkdir(classesDir);
    await fs.writeFile(pom,libraryPom(library.identity,library.descriptor,{sourceDirectory:path.join(root,library.folder,'src/main/java'),outputDirectory:target,resourceDirectory:path.join(root,library.folder,'src/main/resources'),licenseDirectory:path.join(root,library.folder)}),{flag:'wx'});
    const harnessSource=path.join(temp,'ZeroLibraryHarness.java');
    const maintainedHarness = harnessPath || await fs.access(HARNESS_SOURCE).then(() => HARNESS_SOURCE, () => HARNESS_BUNDLED);
    await fs.copyFile(maintainedHarness,harnessSource,fs.constants.COPYFILE_EXCL);
    const jar=path.join(target,`${library.identity.coordinate.artifactId}-${library.descriptor.version}.jar`);
    const maven={command:wrapper,...(javaHome?{env:{...process.env,JAVA_HOME:javaHome}}:{}),args:['-B','-ntp','-f',pom,'clean','package','-Dmaven.test.skip=true','org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath',`-Dmdep.outputFile=${classpathFile}`],cwd:root};
    if (process.platform === 'win32') {
      if ([maven.command,...maven.args].some(s => /["%&|<>^!\r\n]/.test(s))) fail('Local Check on Windows needs a project/temp path without command-shell special characters.');
      const line='"' + [maven.command,...maven.args].map(s => '"'+s+'"').join(' ') + '"';
      maven.command=process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'; maven.args=['/d','/s','/c',line];
    }
    return {schema:1,root,slug,library,temp,pom,target,jar,classesDir,classpathFile,harnessSource,input,snapshot:await fingerprint(root,input.files),maven,javaHome,
      summary:{library:library.identity.id,version:library.descriptor.version,kind:library.descriptor.libraryKind,classes:input.classes,checks:input.mains,mode:library.mode}};
  } catch (error) { await fs.rm(temp,{recursive:true,force:true}); throw error; }
}
async function disposeLocalCheck(plan) {
  if (!plan?.temp || path.basename(plan.temp).startsWith('zero-library-check-') === false) fail('Invalid local Check directory.');
  await fs.rm(plan.temp,{recursive:true,force:true});
}
async function runLocalCheck(plan, {runner = processRun,signal,timeoutMs = 120000,keepFiles = false} = {}) {
  if (plan?.schema !== 1 || !plan?.input?.files || !plan.maven) fail('Prepare a local Check first.');
  const outputs=[],toolVersions={};let terminationUnconfirmed=false,artifactSnapshot;
  async function unchanged() {
    if (signal?.aborted) fail('Local Check cancelled.');
    if (JSON.stringify(await fingerprint(plan.root,plan.input.files)) !== JSON.stringify(plan.snapshot)) fail('Library sources, metadata, checks or examples changed. Prepare Check again.');
    const current=(await discoverLibraries(plan.root)).find(l => l.slug === plan.slug);
    if (!current || JSON.stringify(current.descriptor)!==JSON.stringify(plan.library.descriptor)) fail('Library metadata changed. Prepare Check again.');
    if (plan.coreSnapshot && JSON.stringify((await coreState(plan.root,current.descriptor)).snapshot)!==JSON.stringify(plan.coreSnapshot)) fail('Project core source or record changed. Prepare Check again.');
    if (plan.stagedSnapshot && JSON.stringify(await fingerprint(plan.temp,plan.stagedNames))!==JSON.stringify(plan.stagedSnapshot)) fail('Staged Check input changed. Prepare Check again.');
    if (plan.toolSnapshot && JSON.stringify(await fingerprint(plan.root,plan.toolSnapshot.map(v=>v.path)))!==JSON.stringify(plan.toolSnapshot)) fail('Project Maven wrapper changed. Prepare Check again.');
    if (artifactSnapshot && JSON.stringify(await fingerprint(plan.temp,artifactSnapshot.map(v=>v.path)))!==JSON.stringify(artifactSnapshot)) fail('Built Check JAR or classpath changed during verification. Prepare Check again.');
    const now=await inputs(plan.root,current);
    if (JSON.stringify(now)!==JSON.stringify(plan.input)) fail('Library source/check/example inventory changed. Prepare Check again.');
  }
  try {
    for (const command of plan.commands || [plan.maven]) {
      await unchanged(); outputs.push(await runner(command,{signal,timeoutMs})); await unchanged();
    }
    const jarStat=await fs.lstat(plan.jar); if (!jarStat.isFile() || jarStat.isSymbolicLink() || !jarStat.size || jarStat.size > require('./contracts').LIMITS.artifactBytes) fail('Maven did not produce an ordinary library JAR.');
    if (plan.coreJar) {
      await verifiedCoreBytes(plan,await fs.readFile(plan.jar));
      artifactSnapshot=await fingerprint(plan.temp,[plan.jar,plan.sourcesJar,plan.coreJar,plan.classpathFile].map(p=>path.relative(plan.temp,p).split(path.sep).join('/')));
      for (const name of ['java','javac']) {
        await unchanged(); const result=await runner({command:javaTool(name,plan.javaHome),args:['-version'],cwd:plan.root},{signal,timeoutMs}); await unchanged(); toolVersions[name]=result.output; outputs.push(result);
      }
    }
    const dependencies=(await fs.readFile(plan.classpathFile,'utf8')).trim();
    if (!dependencies || dependencies.includes('\n') || dependencies.includes('\r')) fail('Maven returned an invalid JavaFX dependency classpath.');
    const cp=[plan.jar,...(plan.coreJar?[plan.coreJar]:[]),dependencies].join(path.delimiter);
    const compile={command:javaTool('javac',plan.javaHome),args:['--release','17',...(plan.coreJar?['-proc:none']:[]),'-cp',cp,'-d',plan.classesDir,plan.harnessSource,...plan.input.checks.map(p => plan.stagedChecks?.[p] || path.join(plan.root,p))],cwd:plan.root};
    await unchanged(); outputs.push(await runner(compile,{signal,timeoutMs})); await unchanged();
    const widgetDeadline=plan.library.descriptor.libraryKind==='widget'?[`-Dzero.check.fxTimeoutMillis=${Math.min(timeoutMs,15000)}`]:[];
    const run={command:javaTool('java',plan.javaHome),args:['-ea',...widgetDeadline,'-cp',[plan.classesDir,cp].join(path.delimiter),'ZeroLibraryHarness',plan.jar,plan.library.descriptor.libraryKind,plan.input.classes.join(','),...(plan.coreJar?['--core',plan.coreJar,plan.coreClasses.join(',')]:[]),...plan.input.mains],cwd:plan.root};
    await unchanged(); outputs.push(await runner(run,{signal,timeoutMs})); await unchanged();
    const bytes=await fs.readFile(plan.jar);
    const coreResult=plan.coreJar?await coreResultFor(plan,bytes,outputs,toolVersions,keepFiles):{};
    return {schema:1,passed:true,libraryId:plan.library.identity.id,version:plan.library.descriptor.version,jar:{path:keepFiles ? plan.jar : null,sha256:hash(bytes),size:bytes.length},classes:plan.input.classes,checks:plan.input.mains,outputs,temporaryFilesRetained:keepFiles,...coreResult};
  } catch(error) {
    if(error.terminationUnconfirmed) {terminationUnconfirmed=true;error.temporaryDirectory=plan.temp;error.temporaryFilesRetained=true;error.message+=` Temporary Check files were retained at ${plan.temp}; stop the remaining Check processes before removing them.`;}
    throw error;
  } finally { if (!keepFiles && !terminationUnconfirmed) await disposeLocalCheck(plan); }
}
module.exports={prepareLocalCheck,runLocalCheck,disposeLocalCheck,processRun};
