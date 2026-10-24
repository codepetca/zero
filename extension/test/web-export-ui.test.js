'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createWebExportCommands}=require('../src/web-export-ui');
const {createWebPreview}=require('../src/web-preview');
const {preparePagesFiles,pagesFiles,pagesWorkflow,publishingGuide}=require('../src/web-publishing');

async function harness(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-web-ui-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const site=path.join(root,'.zero/web-export/site');await fs.mkdir(site,{recursive:true});await fs.writeFile(path.join(site,'index.html'),'<h1>game</h1>');
  const zip=path.join(root,'.zero/web-export/game.zip');await fs.writeFile(zip,'ZIP');
  let active=root,busy=false,saves=0,builds=0,save=true,fail=false,noticeAction,previewClosed=0,previewOpened=0,exportResult,validator,validations=0;
  const logs=[],available=[],states=[],notices=[],opened=[],picks=[],documents=[],args=[];
  const choices=[];
  const vscode={workspace:{isTrusted:true,saveAll:async()=>{saves++;return save;},openTextDocument:async value=>{documents.push(value);return {uri:{document:true}};}},
    window:{showInformationMessage:async(...value)=>{notices.push(value);return noticeAction;},showQuickPick:async(items)=>{picks.push(items);return items.find(i=>i.action===choices.shift());},showSaveDialog:async()=>undefined},
    commands:{executeCommand:async()=>{}},env:{openExternal:async uri=>{opened.push(uri);return true;}},Uri:{file:fsPath=>({fsPath}),parse:url=>({url})}};
  const api=createWebExportCommands(vscode,{project:async()=>active,output:{appendLine:text=>logs.push(text),show(){}},isBusy:()=>busy,setBusy:value=>{busy=value;},setState:value=>states.push(value),setAvailable:root=>available.push(root),validateExport:async options=>{validations++;if(options.projectRoot!==root)throw Error('Choose Export for web for this project first.');return validator ? validator(options,validations) : {...options.result,zipBytes:await fs.readFile(zip)};},ensureValidatedExport:async options=>{builds++;args.push(options);if(fail)throw Error('Bad student source');return exportResult ? exportResult(options) : {sitePath:site,zipPath:zip,totalBytes:4500000,buildId:'build-1'};},previewFactory:async()=>{previewOpened++;return {url:'http://127.0.0.1:1234/token/',dispose:()=>{previewClosed++;}};}});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));
  return {root,site,zip,api,vscode,logs,available,states,notices,opened,picks,documents,args,choices,get busy(){return busy;},set busy(v){busy=v;},get saves(){return saves;},get builds(){return builds;},set save(v){save=v;},set fail(v){fail=v;},set active(v){active=v;},set noticeAction(v){noticeAction=v;},set exportResult(v){exportResult=v;},set validator(v){validator=v;},get validations(){return validations;},get previewClosed(){return previewClosed;},get previewOpened(){return previewOpened;}};
}

test('web export saves a trusted project, builds without auth, releases busy state and previews only its site',async t=>{
  const h=await harness(t);
  await h.api.commands['zero.exportWeb']();
  assert.equal(h.saves,1);assert.equal(h.builds,1);assert.equal(h.busy,false);assert.equal(h.previewOpened,0);assert.deepEqual(h.available,[h.root]);assert.deepEqual(h.notices,[]);
  await h.api.commands['zero.previewWebExport']();assert.equal(h.previewOpened,1);
  assert.equal(h.args[0].projectRoot,h.root);assert.ok(h.args[0].signal instanceof AbortSignal);
  assert.deepEqual(h.states,['Export ready','Preview opened']);assert.match(h.logs.join('\n'),/4.5 MB/);assert.equal(h.opened.length,0,'Managed previews never leave executing tabs in an external browser');
  h.fail=true;
  await assert.rejects(h.api.commands['zero.exportWeb'](),/Bad student source/);assert.equal(h.busy,false);
  await h.api.commands['zero.previewWebExport']();assert.equal(h.previewOpened,2,'Previous successful build remains available after failure');
});

test('busy, untrusted, cancelled save and switched-project cases cannot start or expose a build',async t=>{
  const h=await harness(t);h.busy=true;await h.api.commands['zero.exportWeb']();assert.equal(h.builds,0);assert.equal(h.saves,0);
  h.busy=false;h.vscode.workspace.isTrusted=false;await assert.rejects(h.api.commands['zero.exportWeb'](),/Trust your own project/);assert.equal(h.saves,0);
  h.vscode.workspace.isTrusted=true;h.save=false;await assert.rejects(h.api.commands['zero.exportWeb'](),/Save your files/);assert.equal(h.builds,0);assert.equal(h.busy,false);
  h.save=true;h.exportResult=()=>{h.active='/different/project';return {sitePath:h.site,zipPath:h.zip};};
  await h.api.commands['zero.exportWeb']();assert.equal(h.notices.length,0);
  await assert.rejects(h.api.commands['zero.previewWebExport'](),/Choose Export for web/);
});

test('disposing an active export aborts only that operation',async t=>{
  const h=await harness(t);let signal;
  h.exportResult=options=>new Promise((resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(Error('cancelled')));});
  const pending=h.api.commands['zero.exportWeb']();
  while(!signal)await new Promise(resolve=>setImmediate(resolve));
  h.api.disposables[0].dispose();await assert.rejects(pending,/cancelled/);assert.equal(signal.aborted,true);assert.equal(h.busy,false);
});

test('preview HTTP server confines requests to the static export and supports nested assets',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-web-preview-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const site=path.join(root,'site');await fs.mkdir(path.join(site,'assets'),{recursive:true});await fs.writeFile(path.join(site,'index.html'),'<p>ready</p>');await fs.writeFile(path.join(site,'assets','bird.png'),Buffer.from([1,2,3]));await fs.writeFile(path.join(root,'private.txt'),'PRIVATE');await fs.symlink(path.join(root,'private.txt'),path.join(site,'leak.txt'));
  const preview=await createWebPreview(site);t.after(()=>preview.dispose());
  assert.equal(await(await fetch(preview.url)).text(),'<p>ready</p>');
  const png=await fetch(preview.url+'assets/bird.png');assert.equal(png.headers.get('content-type'),'image/png');assert.equal((await png.arrayBuffer()).byteLength,3);
  for(const suffix of ['leak.txt','%2e%2e/private.txt','assets%2f..%2f..%2fprivate.txt','%00','.git/config'])assert.notEqual((await fetch(preview.url+suffix)).status,200,suffix);
  assert.equal((await fetch(new URL('/',preview.url))).status,404);
  assert.equal((await fetch(preview.url,{method:'POST'})).status,405);
});

test('Pages preparation is explicit, idempotent, preserves edits, and never includes build binaries',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-pages-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const engine=path.join(root,'bundled');await fs.mkdir(engine);await fs.writeFile(path.join(engine,'index.js'),'module.exports={};');await fs.writeFile(path.join(engine,'lock.json'),'{}');
  const project=path.join(root,'student');await fs.mkdir(project);
  const result=await preparePagesFiles(project,engine);assert.ok(result.created.includes('.zero-web/web-publish-bundle.js'));assert.deepEqual((await preparePagesFiles(project,engine)).created,[]);
  await assert.rejects(fs.access(path.join(project,'.github/workflows/zero-web.yml')));
  await fs.writeFile(path.join(project,'.zero-web/run.cjs'),'student edit');await assert.rejects(preparePagesFiles(project,engine),/already has different content/);assert.equal(await fs.readFile(path.join(project,'.zero-web/run.cjs'),'utf8'),'student edit');
  assert.match(pagesWorkflow,/workflow_dispatch:/);assert.doesNotMatch(pagesWorkflow,/\n\s+push:/);assert.match(pagesWorkflow,/retention-days: 1/);assert.match(pagesWorkflow,/needs: stage/);assert.match(pagesWorkflow,/persist-credentials: false/);
  assert.match(publishingGuide(),/actual published game-page URL/);assert.doesNotMatch(publishingGuide(),/https:\/\/student.github.io/);
  await fs.writeFile(path.join(engine,'bad.jar'),'binary');const deployFiles=await pagesFiles(engine);assert.ok([...deployFiles.keys()].every(name=>!name.includes('/tool/')&&!name.endsWith('.jar')),'Publishing ships only the fixed deployment runner, never compiler or generated app bytes');
});

test('Pages preparation refuses a project path symlink before writing anything',async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-pages-link-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const engine=path.join(root,'engine');const student=path.join(root,'student');const elsewhere=path.join(root,'elsewhere');
  await Promise.all([fs.mkdir(engine),fs.mkdir(student),fs.mkdir(elsewhere)]);await fs.writeFile(path.join(engine,'index.js'),'');await fs.symlink(elsewhere,path.join(student,'.zero-web'));
  await assert.rejects(preparePagesFiles(student,engine),/symbolic link/);assert.deepEqual(await fs.readdir(elsewhere),[]);
});

test('preview serves immutable bytes when source output is replaced or removed',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-preview-snapshot-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'index.html'),'original');
 const preview=await createWebPreview(root);t.after(()=>preview.dispose());await fs.writeFile(path.join(root,'index.html'),'replacement');await fs.writeFile(path.join(root,'new.txt'),'unvalidated');
 assert.equal(await(await fetch(preview.url)).text(),'original');assert.equal((await fetch(preview.url+'new.txt')).status,404);
 await fs.rm(path.join(root,'index.html'));assert.equal(await(await fetch(preview.url)).text(),'original');
 const bytes=Buffer.from('validated');const supplied=await createWebPreview(root,{siteFiles:[{path:'index.html',bytes}]});t.after(()=>supplied.dispose());bytes.fill(0);assert.equal(await(await fetch(supplied.url)).text(),'validated');
 await assert.rejects(createWebPreview(root,{siteFiles:[{path:'../private',bytes:Buffer.from('bad')}]}),/Invalid validated preview/);
});

test('Save ZIP revalidates after the dialog and rejects changed archives or a replaced build',async t=>{
 for(const change of ['zip','build']) {
  const h=await harness(t);await h.api.commands['zero.exportWeb']();const destination=path.join(h.root,'saved.zip');
  h.validator=async({result},count)=>{if(count===2)throw Error(change==='zip'?'The browser ZIP differs from the validated app.':'The browser build was replaced.');return {...result,zipBytes:Buffer.from('ZIP')};};
  h.vscode.window.showSaveDialog=async()=>{await fs.writeFile(h.zip,change==='zip'?'UNVALIDATED':'REBUILT');return {fsPath:destination};};
  await assert.rejects(h.api.commands['zero.saveWebExport'](),/browser (?:ZIP differs|build was replaced)/);assert.equal(h.validations,2);await assert.rejects(fs.access(destination));assert.doesNotMatch(h.states.at(-1),/ZIP saved/);
 }
});

test('Save ZIP writes verified immutable bytes even if the mutable export ZIP changes after validation',async t=>{
 const h=await harness(t);await h.api.commands['zero.exportWeb']();const destination=path.join(h.root,'saved.zip');
 h.validator=async({result},count)=>{const zipBytes=await fs.readFile(h.zip);if(count===2)await fs.writeFile(h.zip,'RACED');return {...result,zipBytes};};h.vscode.window.showSaveDialog=async()=>({fsPath:destination});
 await h.api.commands['zero.saveWebExport']();assert.equal(await fs.readFile(destination,'utf8'),'ZIP');assert.equal(await fs.readFile(h.zip,'utf8'),'RACED');assert.equal(h.validations,2);assert.match(h.states.at(-1),/ZIP saved/);assert.deepEqual((await fs.readdir(h.root)).filter(name=>name.startsWith('.zero-save-')),[]);
});

test('Save ZIP refuses a changed build identity and never overwrites the live export archive',async t=>{
 const h=await harness(t);await h.api.commands['zero.exportWeb']();h.validator=async({result},count)=>({...result,buildId:count===2?'new-build':result.buildId,zipBytes:Buffer.from('new build')});h.vscode.window.showSaveDialog=async()=>{await fs.writeFile(h.zip,'NEW BUILD');return {fsPath:h.zip};};
 await assert.rejects(h.api.commands['zero.saveWebExport'](),/build changed while choosing/);assert.equal(await fs.readFile(h.zip,'utf8'),'NEW BUILD');
});

test('Save ZIP preserves destination guards, cancellation, project changes and approved regular-file replacement',async t=>{
 const h=await harness(t);await h.api.commands['zero.exportWeb']();
 h.vscode.window.showSaveDialog=async()=>undefined;await h.api.commands['zero.saveWebExport']();assert.equal(h.validations,1,'Cancelling does not revalidate or write');
 const source=path.join(h.root,'Main.java');await fs.writeFile(source,'student source');h.vscode.window.showSaveDialog=async()=>({fsPath:source});await assert.rejects(h.api.commands['zero.saveWebExport'](),/\.zip filename/);assert.equal(await fs.readFile(source,'utf8'),'student source');
 const symlink=path.join(h.root,'link.zip');await fs.symlink(source,symlink);h.vscode.window.showSaveDialog=async()=>({fsPath:symlink});await assert.rejects(h.api.commands['zero.saveWebExport'](),/symbolic link/);assert.equal(await fs.readFile(source,'utf8'),'student source');
 const destination=path.join(h.root,'existing.zip');await fs.writeFile(destination,'old selected ZIP');h.vscode.window.showSaveDialog=async()=>({fsPath:destination});await h.api.commands['zero.saveWebExport']();assert.equal(await fs.readFile(destination,'utf8'),'ZIP');
 h.vscode.window.showSaveDialog=async()=>{h.active='/different';return {fsPath:destination};};await h.api.commands['zero.saveWebExport']();assert.equal(await fs.readFile(destination,'utf8'),'ZIP');
});

test('Save ZIP refuses the live export destination whether unchanged or mutated after validation',async t=>{
 for(const race of [false,true]) {
  const h=await harness(t);await h.api.commands['zero.exportWeb']();
  h.validator=async({result},count)=>{const zipBytes=await fs.readFile(h.zip);if(race && count===2)await fs.writeFile(h.zip,'RACED');return {...result,zipBytes};};
  h.vscode.window.showSaveDialog=async()=>({fsPath:h.zip});
  await assert.rejects(h.api.commands['zero.saveWebExport'](),/destination outside the generated browser export/);
  assert.equal(h.validations,2);assert.equal(await fs.readFile(h.zip,'utf8'),race?'RACED':'ZIP');assert.doesNotMatch(h.states.at(-1),/ZIP saved/);
 }
});


test('Save ZIP rejects directory and case aliases of the live export without overwriting a rebuilt archive',async t=>{
 for(const alias of ['directory','case','hardlink']) {
  const h=await harness(t);await h.api.commands['zero.exportWeb']();let destination;
  if(alias==='directory') {
   const directory=path.join(h.root,'export-alias');await fs.symlink(path.dirname(h.zip),directory,'junction');destination=path.join(directory,path.basename(h.zip));
  } else if(alias==='case') {
   destination=path.join(path.dirname(h.zip),path.basename(h.zip).toUpperCase());
   const selected=await fs.stat(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!selected || selected.ino!==(await fs.stat(h.zip)).ino)continue; // Exercised only on case-insensitive filesystems.
  } else {destination=path.join(h.root,'hardlink.zip');await fs.link(h.zip,destination);}
  h.validator=async({result},count)=>{const zipBytes=await fs.readFile(h.zip);if(count===2)await fs.writeFile(h.zip,'NEW BUILD');return {...result,zipBytes};};
  h.vscode.window.showSaveDialog=async()=>({fsPath:destination});
  await assert.rejects(h.api.commands['zero.saveWebExport'](),/destination outside the generated browser export/,alias);
  assert.equal(await fs.readFile(h.zip,'utf8'),'NEW BUILD',alias);assert.doesNotMatch(h.states.at(-1),/ZIP saved/,alias);
 }
});
