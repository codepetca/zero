'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {loadBundle}=require('../src/lesson-projects'),format=require('../src/project-builder-format'),{readSavedBuilder}=require('../src/project-builder'),upgrade=require('../src/project-builder-upgrade');
const extensionPath=path.resolve(__dirname,'..');
async function fixture(t,{current=false}={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-builder-upgrade-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const project=path.join(root,'project');await fs.mkdir(project);
 const files=current?(await upgrade.loadBundledBuilder(extensionPath)).files.map(file=>({path:'.zero-build/'+file.path,content:file.bytes})):
  (await loadBundle(extensionPath))[0].files.filter(file=>file.path.startsWith('.zero-build/'));
 for(const file of files){const dest=path.join(project,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.content);}
 return {project,root};
}
test('explicit upgrade preserves exact old closure in a unique recoverable backup',async t=>{
 const {project}=await fixture(t),before=await readSavedBuilder(project),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});
 assert.equal(plan.changed,true);assert.equal(plan.oldProfileHash,before.profileHash);
 const result=await upgrade.applyUpgrade(plan),after=await readSavedBuilder(project);
 assert.equal(after.profileHash,(await upgrade.loadBundledBuilder(extensionPath)).profileHash);
 assert.notEqual(after.profileHash,before.profileHash);
 assert.equal(after.profileHash,plan.newProfileHash);assert.equal((await readSavedBuilder(path.dirname(result.backupPath))).profileHash,before.profileHash);
 assert.equal(await fs.readFile(path.join(path.dirname(result.backupPath),'.gitignore'),'utf8'),'*\n');
 assert.equal((await upgrade.planUpgrade({projectRoot:project,extensionPath})).changed,false);
 assert.equal((await fs.readdir(project)).some(name=>name.startsWith('.zero-build-stage-')),false);
 assert.equal(result.cleanupWarning,undefined);
 await assert.rejects(upgrade.applyUpgrade({...plan,changed:false}),/Review/);
});
test('a fresh standalone builder matches the extension without an upgrade to published tutorial bytes',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-builder-current-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {prepareProjectBuilder}=await import('../../scripts/prepare-project-builder.mjs');
 await prepareProjectBuilder({destination:path.join(root,'.zero-build')});
 const plan=await upgrade.planUpgrade({projectRoot:root,extensionPath});
 assert.equal(plan.changed,false);
 assert.equal(plan.oldProfileHash,plan.newProfileHash);
 const {project}=await fixture(t);
 assert.notEqual((await readSavedBuilder(project)).profileHash,plan.newProfileHash);
});
test('missing or changed installed browser bytes never fall back to the published tutorial builder',async t=>{
 const {project,root}=await fixture(t),candidate=path.join(root,'extension');
 await fs.mkdir(path.join(candidate,'media'),{recursive:true});
 await fs.copyFile(path.join(extensionPath,'media/lesson-projects.json'),path.join(candidate,'media/lesson-projects.json'));
 const args={projectRoot:project,extensionPath:candidate};
 await assert.rejects(upgrade.planUpgrade(args),/installed Zero browser tools are missing or damaged/);
 const asset=JSON.parse(await fs.readFile(path.join(extensionPath,upgrade.BUNDLED_BUILDER_PATH)));
 asset.find(file=>file.path==='README.md').content=Buffer.from('different bytes').toString('base64');
 await fs.writeFile(path.join(candidate,upgrade.BUNDLED_BUILDER_PATH),JSON.stringify(asset));
 await assert.rejects(upgrade.planUpgrade(args),/installed Zero browser tools are missing or damaged/);
});
test('rejects project changes after review and keeps modified source',async t=>{
 const {project}=await fixture(t),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath}),file=path.join(project,'.zero-build/README.md');await fs.appendFile(file,'student change');
 await assert.rejects(upgrade.applyUpgrade(plan),/changed|unavailable/);assert.match(await fs.readFile(file,'utf8'),/student change/);
});
test('cancellation during staging or immediately after backup preserves the original builder',async t=>{
 for(const stopAt of [2,4]) {
  const {project}=await fixture(t),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});let checks=0;
  await assert.rejects(upgrade.applyUpgrade(plan,{assertCurrent:async()=>{if(++checks===stopAt)throw Error('cancelled');}}),/cancelled/);
  assert.equal((await readSavedBuilder(project)).profileHash,plan.oldProfileHash);
 }
});
test('failed installation restores the original builder',async t=>{
 const {project}=await fixture(t),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath}),mkdir=fs.mkdir;let failed=false;
 try {fs.mkdir=async (where,...args)=>{if(where===path.join(project,'.zero-build')&&!failed){failed=true;throw Error('simulated install failure');}return mkdir(where,...args);};await assert.rejects(upgrade.applyUpgrade(plan),/simulated install failure/);}
 finally {fs.mkdir=mkdir;}
 assert.equal((await readSavedBuilder(project)).profileHash,plan.oldProfileHash);
});
test('rejects symlinked project path',async t=>{
 const {root,project}=await fixture(t),link=path.join(root,'link');await fs.symlink(project,link);await assert.rejects(upgrade.planUpgrade({projectRoot:link,extensionPath}),/symbolic links/);
});
test('missing browser tooling can be installed explicitly without inventing a backup',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-builder-missing-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const host=require('../src/project-builder').createProjectBuilder({isTrusted:()=>true,spawn:()=>assert.fail('must not execute a missing builder')});
 await assert.rejects(host.ensureValidatedExport({projectRoot:root,explicitAction:true}),error=>error.code==='ZERO_BUILDER_UPDATE_REQUIRED');
 const plan=await upgrade.planUpgrade({projectRoot:root,extensionPath});assert.equal(plan.oldProfileHash,null);assert.equal(plan.changed,true);
 const result=await upgrade.applyUpgrade(plan);assert.equal(result.backupPath,null);assert.equal((await readSavedBuilder(root)).profileHash,plan.newProfileHash);
});
test('an unexpected builder created after review is never replaced',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-builder-race-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const plan=await upgrade.planUpgrade({projectRoot:root,extensionPath});await fs.mkdir(path.join(root,'.zero-build'));await fs.writeFile(path.join(root,'.zero-build','student.txt'),'keep');
 await assert.rejects(upgrade.applyUpgrade(plan));assert.equal(await fs.readFile(path.join(root,'.zero-build','student.txt'),'utf8'),'keep');
});
test('partial copy preserves the old builder and identifies its backup',async t=>{
 const {project}=await fixture(t),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath}),copy=fs.copyFile;let copies=0;
 try {fs.copyFile=async (...args)=>{if(++copies===2)throw Error('simulated copy interruption');return copy(...args);};await assert.rejects(upgrade.applyUpgrade(plan),/simulated copy interruption.*original builder remains at/i);}
 finally {fs.copyFile=copy;}
 const backup=(await fs.readdir(project)).find(name=>name.startsWith('.zero-build-backup-'));
 assert.ok(backup);assert.equal((await readSavedBuilder(path.join(project,backup))).profileHash,plan.oldProfileHash);
 await assert.rejects(readSavedBuilder(project));
});
test('an older builder requires an update before starting a build or cached check',async t=>{
 const {project}=await fixture(t),builder=path.join(project,'.zero-build');
 await fs.unlink(path.join(builder,'src/sharing/owned-library.js'));
 const manifest=JSON.parse(await fs.readFile(path.join(builder,'builder.json'),'utf8'));
 const files=await Promise.all(manifest.files.filter(file=>file.path!=='src/sharing/owned-library.js').map(async file=>({path:file.path,bytes:await fs.readFile(path.join(builder,...file.path.split('/')))})));
 await fs.writeFile(path.join(builder,'builder.json'),JSON.stringify(format.createBuilderManifest(files),null,2)+'\n');
 const id='lib-r123-widget',block=(label,body)=>`<!-- zero-sharing ${label} start -->\n${body}\n<!-- zero-sharing ${label} end -->`;
 const pom=`<project><properties>${block(id+' history',`<zero.sharing.${id}.previous>none</zero.sharing.${id}.previous>`)}${block(id+' owned',`<zero.sharing.${id}.owned>true</zero.sharing.${id}.owned>`)}</properties><dependencies>${block(id+' dependency','<dependency><groupId>ca.codepet.zero.contrib.r123</groupId><artifactId>widget</artifactId><version>1.0.0</version></dependency>')}</dependencies><repositories>${block('repository','<repository><id>zero-sharing</id><url>https://files.example/maven</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>')}</repositories></project>`;
 await fs.writeFile(path.join(project,'pom.xml'),pom);
 const host=require('../src/project-builder').createProjectBuilder({isTrusted:()=>true,spawn:()=>assert.fail('must not execute old builder')});
 const old=await readSavedBuilder(project);
 for(const action of [()=>host.ensureValidatedExport({projectRoot:project,explicitAction:true}),()=>host.prepareBrowserChecks({projectRoot:project,explicitAction:true}),()=>host.checkSavedSources({projectRoot:project,approvedBuilderHash:old.profileHash}),()=>host.validateExport({projectRoot:project,explicitAction:true})])
  await assert.rejects(action(),error=>error.code==='ZERO_BUILDER_UPDATE_REQUIRED');
});

test('successful update preserves an unexpected staging file and reports cleanup warning',async t=>{
 const {project}=await fixture(t),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});let created=false;
 const result=await upgrade.applyUpgrade(plan,{assertCurrent:async()=>{
  if(created)return;
  const stage=(await fs.readdir(project)).find(name=>name.startsWith('.zero-build-stage-'));
  if(stage){await fs.writeFile(path.join(project,stage,'student.txt'),'keep');created=true;}
 }});
 const stage=(await fs.readdir(project)).find(name=>name.startsWith('.zero-build-stage-'));
 assert.match(result.cleanupWarning,/staging folder.*could not be fully removed/i);
 assert.equal(await fs.readFile(path.join(project,stage,'student.txt'),'utf8'),'keep');
 assert.equal(await fs.readFile(path.join(project,stage,'.gitignore'),'utf8'),'*\n');
 assert.equal((await readSavedBuilder(project)).profileHash,plan.newProfileHash);
});
test('cleanup failure reports success and retains the staging ignore file',async t=>{
 const {project}=await fixture(t),plan=await upgrade.planUpgrade({projectRoot:project,extensionPath}),unlink=fs.unlink;
 let result;
 try {
  fs.unlink=async (where,...args)=>{if(String(where).includes('.zero-build-stage-'))throw Error('simulated cleanup failure');return unlink(where,...args);};
  result=await upgrade.applyUpgrade(plan);
 } finally {fs.unlink=unlink;}
 assert.match(result.cleanupWarning,/simulated cleanup failure/);
 const stage=(await fs.readdir(project)).find(name=>name.startsWith('.zero-build-stage-'));
 assert.equal(await fs.readFile(path.join(project,stage,'.gitignore'),'utf8'),'*\n');
 assert.equal((await readSavedBuilder(project)).profileHash,plan.newProfileHash);
});

async function missingRuntime(t) {
 const {project}=await fixture(t,{current:true});
 const builder=path.join(project,'.zero-build');
 await fs.unlink(path.join(builder,'runtime-lock.json'));
 return {project,builder};
}

test('explicit repair restores missing runtime-lock and preserves the reviewed partial backup',async t=>{
 const {project,builder}=await missingRuntime(t);
 const manifest=await fs.readFile(path.join(builder,'builder.json'));
 const plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});
 assert.equal(plan.repairing,true);
 assert.deepEqual(await fs.readdir(project),['.zero-build']);
 const result=await upgrade.applyUpgrade(plan);
 assert.equal((await readSavedBuilder(project)).profileHash,plan.newProfileHash);
 assert.deepEqual(await fs.readFile(path.join(result.backupPath,'builder.json')),manifest);
 await assert.rejects(fs.access(path.join(result.backupPath,'runtime-lock.json')),{code:'ENOENT'});
});

test('partial tooling with changed, linked, undeclared, or missing manifest entries is ineligible',async t=>{
 for(const condition of ['changed','symlink','hardlink','undeclared','unknown-directory','manifest','no-manifest']){
  const {project,builder}=await missingRuntime(t);
  const name=path.join(builder,'README.md');
  if(condition==='changed')await fs.appendFile(name,'edited');
  if(condition==='manifest')await fs.appendFile(path.join(builder,'builder.json'),' ');
  if(condition==='no-manifest')await fs.unlink(path.join(builder,'builder.json'));
  if(condition==='undeclared')await fs.writeFile(path.join(builder,'other'),'stay');
  if(condition==='unknown-directory')await fs.mkdir(path.join(builder,'other'));
  if(condition==='symlink'||condition==='hardlink'){
   const external=path.join(project,'original');
   await fs.rename(name,external);
   if(condition==='symlink')await fs.symlink(external,name);else await fs.link(external,name);
  }
  await assert.rejects(upgrade.planUpgrade({projectRoot:project,extensionPath}),{code:'ZERO_BUILDER_UNAVAILABLE'},condition);
 }
});

test('repair rejects an additional missing file after review before creating staging or backup',async t=>{
 const {project,builder}=await missingRuntime(t);
 const plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});
 await fs.unlink(path.join(builder,'README.md'));
 await assert.rejects(upgrade.applyUpgrade(plan),/changed/);
 assert.deepEqual(await fs.readdir(project),['.zero-build']);
 await assert.rejects(fs.access(path.join(builder,'README.md')),{code:'ENOENT'});
});

test('repair rechecks edited partial contents immediately before moving the original',async t=>{
 const {project,builder}=await missingRuntime(t);
 const plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});
 let edited=false;
 await assert.rejects(upgrade.applyUpgrade(plan,{assertCurrent:async()=>{
  if(!edited && (await fs.readdir(project)).some(name=>name.startsWith('.zero-build-backup-'))){
   edited=true;
   await fs.appendFile(path.join(builder,'README.md'),'my edit');
  }
 }}));
 assert.equal(edited,true);
 assert.match(await fs.readFile(path.join(builder,'README.md'),'utf8'),/my edit$/);
 await assert.rejects(fs.access(path.join(builder,'runtime-lock.json')),{code:'ENOENT'});
});

test('an interrupted repair restores the original partial inventory including empty known directories',async t=>{
 const {project,builder}=await missingRuntime(t);
 const media=path.join(builder,'media');
 for(const name of await fs.readdir(media))await fs.unlink(path.join(media,name));
 const plan=await upgrade.planUpgrade({projectRoot:project,extensionPath});
 assert.equal(plan.repairing,true);
 await assert.rejects(upgrade.applyUpgrade(plan,{assertCurrent:async()=>{
  const backup=(await fs.readdir(project)).find(name=>name.startsWith('.zero-build-backup-'));
  if(backup && (await fs.readdir(path.join(project,backup))).includes('.zero-build'))throw Error('interrupted');
 }}),/interrupted/);
 assert.deepEqual(await fs.readdir(media),[]);
 const restored=await upgrade.planUpgrade({projectRoot:project,extensionPath});
 assert.equal(restored.oldProfileHash,plan.oldProfileHash);
 await assert.rejects(fs.access(path.join(builder,'runtime-lock.json')),{code:'ENOENT'});
});
