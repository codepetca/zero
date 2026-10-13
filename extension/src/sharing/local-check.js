'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {discoverLibraries,libraryPom,javaFiles,declaration,safePath,read,hash} = require('./authoring');
const fail = message => { throw new Error(message); };
const HARNESS_BUNDLED = path.resolve(__dirname,'../../media/sharing-harness/ZeroLibraryHarness.java');
const HARNESS_SOURCE = path.resolve(__dirname,'../../../sharing/harness/ZeroLibraryHarness.java');
const MAX_OUTPUT = 1024 * 1024;
function processRun(spec, {signal,timeoutMs = 120000} = {}) {
  return new Promise((resolve,reject) => {
    if (signal?.aborted) return reject(new Error('Local Check cancelled.'));
    const child = spawn(spec.command,spec.args,{cwd:spec.cwd,env:spec.env || process.env,shell:spec.shell || false,windowsHide:true});
    let output = '', done = false, forcedError;
    const cancel = () => { forcedError = new Error('Local Check cancelled.'); child.kill(); };
    const timer = setTimeout(() => { forcedError = new Error('Local Check timed out. Stop the check or simplify the example.'); child.kill(); },timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    function finish(error,code) {
      if (done) return; done=true; clearTimeout(timer); signal?.removeEventListener('abort',cancel);
      if (error || forcedError || code !== 0) reject(error || forcedError || new Error(`Local Check command failed (${code}):\n${output}`));
      else resolve({code,output});
    }
    const collect = data => {
      output += data.toString();
      if (Buffer.byteLength(output) > MAX_OUTPUT) { output = output.slice(-MAX_OUTPUT); forcedError = new Error('Local Check produced too much output.'); child.kill(); }
    };
    child.stdout.on('data',collect); child.stderr.on('data',collect); child.once('error',e => finish(e)); child.once('close',code => finish(null,code));
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
function javaTool(name, javaHome) { return javaHome ? path.join(javaHome,'bin',process.platform === 'win32' ? `${name}.exe` : name) : name; }
async function prepareLocalCheck(root, slug, {temporaryRoot,javaHome = process.env.JAVA_HOME,harnessPath} = {}) {
  root=path.resolve(root);
  const library=(await discoverLibraries(root)).find(l => l.slug === slug); if (!library) fail('Choose an authored library.');
  const input=await inputs(root,library);
  // These fixed tools run only following an explicit local Check action. This is
  // not a hosted candidate executor and does not establish public acceptance.
  const wrapper = await safePath(root,process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
  const temp=await fs.mkdtemp(path.join(temporaryRoot || os.tmpdir(),'zero-library-check-'));
  try {
    const pom=path.join(temp,'pom.xml'), target=path.join(temp,'target'), classesDir=path.join(temp,'checks'), classpathFile=path.join(temp,'classpath.txt');
    await fs.mkdir(classesDir);
    await fs.writeFile(pom,libraryPom(library.identity,library.descriptor,{sourceDirectory:path.join(root,library.folder,'src/main/java'),outputDirectory:target,resourceDirectory:path.join(root,library.folder,'src/main/resources'),licenseDirectory:path.join(root,library.folder)}),{flag:'wx'});
    const harnessSource=path.join(temp,'ZeroLibraryHarness.java');
    const maintainedHarness = harnessPath || await fs.access(HARNESS_BUNDLED).then(() => HARNESS_BUNDLED, () => HARNESS_SOURCE);
    await fs.copyFile(maintainedHarness,harnessSource,fs.constants.COPYFILE_EXCL);
    const jar=path.join(target,`${library.identity.coordinate.artifactId}-${library.descriptor.version}.jar`);
    const maven={command:wrapper,args:['-B','-ntp','-f',pom,'clean','package','-Dmaven.test.skip=true','org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath',`-Dmdep.outputFile=${classpathFile}`],cwd:root};
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
  const outputs=[];
  async function unchanged() {
    if (signal?.aborted) fail('Local Check cancelled.');
    if (JSON.stringify(await fingerprint(plan.root,plan.input.files)) !== JSON.stringify(plan.snapshot)) fail('Library sources, metadata, checks or examples changed. Prepare Check again.');
    const current=(await discoverLibraries(plan.root)).find(l => l.slug === plan.slug);
    if (!current || JSON.stringify(current.descriptor)!==JSON.stringify(plan.library.descriptor)) fail('Library metadata changed. Prepare Check again.');
    const now=await inputs(plan.root,current);
    if (JSON.stringify(now)!==JSON.stringify(plan.input)) fail('Library source/check/example inventory changed. Prepare Check again.');
  }
  try {
    await unchanged(); outputs.push(await runner(plan.maven,{signal,timeoutMs}));
    await unchanged();
    const jarStat=await fs.lstat(plan.jar); if (!jarStat.isFile() || jarStat.isSymbolicLink() || !jarStat.size || jarStat.size > require('./contracts').LIMITS.artifactBytes) fail('Maven did not produce an ordinary library JAR.');
    const dependencies=(await fs.readFile(plan.classpathFile,'utf8')).trim();
    if (!dependencies || dependencies.includes('\n') || dependencies.includes('\r')) fail('Maven returned an invalid JavaFX dependency classpath.');
    const cp=[plan.jar,dependencies].join(path.delimiter);
    const compile={command:javaTool('javac',plan.javaHome),args:['--release','17','-cp',cp,'-d',plan.classesDir,plan.harnessSource,...plan.input.checks.map(p => path.join(plan.root,p))],cwd:plan.root};
    outputs.push(await runner(compile,{signal,timeoutMs})); await unchanged();
    const run={command:javaTool('java',plan.javaHome),args:['-ea','-cp',[plan.classesDir,cp].join(path.delimiter),'ZeroLibraryHarness',plan.jar,plan.library.descriptor.libraryKind,plan.input.classes.join(','),...plan.input.mains],cwd:plan.root};
    outputs.push(await runner(run,{signal,timeoutMs})); await unchanged();
    const bytes=await fs.readFile(plan.jar);
    return {schema:1,passed:true,libraryId:plan.library.identity.id,version:plan.library.descriptor.version,jar:{path:keepFiles ? plan.jar : null,sha256:hash(bytes),size:bytes.length},classes:plan.input.classes,checks:plan.input.mains,outputs,temporaryFilesRetained:keepFiles};
  } finally { if (!keepFiles) await disposeLocalCheck(plan); }
}
module.exports={prepareLocalCheck,runLocalCheck,disposeLocalCheck,processRun};
