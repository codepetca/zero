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
  let active=root,busy=false,saves=0,builds=0,save=true,fail=false,noticeAction,previewClosed=0,previewOpened=0,exportResult;
  const states=[],notices=[],opened=[],picks=[],documents=[],args=[];
  const choices=[];
  const vscode={workspace:{isTrusted:true,saveAll:async()=>{saves++;return save;},openTextDocument:async value=>{documents.push(value);return {uri:{document:true}};}},
    window:{showInformationMessage:async(...value)=>{notices.push(value);return noticeAction;},showQuickPick:async(items)=>{picks.push(items);return items.find(i=>i.action===choices.shift());},showSaveDialog:async()=>undefined},
    commands:{executeCommand:async()=>{}},env:{openExternal:async uri=>{opened.push(uri);return true;}},Uri:{file:fsPath=>({fsPath}),parse:url=>({url})}};
  const api=createWebExportCommands(vscode,{project:async()=>active,output:{appendLine(){},show(){}},isBusy:()=>busy,setBusy:value=>{busy=value;},setState:value=>states.push(value),validateExport:async()=>{},ensureValidatedExport:async options=>{builds++;args.push(options);if(fail)throw Error('Bad student source');return exportResult ? exportResult(options) : {sitePath:site,zipPath:zip,totalBytes:4500000};},previewFactory:async()=>{previewOpened++;return {url:'http://127.0.0.1:1234/token/',dispose:()=>{previewClosed++;}};}});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));
  return {root,site,zip,api,vscode,states,notices,opened,picks,documents,args,choices,get busy(){return busy;},set busy(v){busy=v;},get saves(){return saves;},get builds(){return builds;},set save(v){save=v;},set fail(v){fail=v;},set active(v){active=v;},set noticeAction(v){noticeAction=v;},set exportResult(v){exportResult=v;},get previewClosed(){return previewClosed;},get previewOpened(){return previewOpened;}};
}

test('web export saves a trusted project, builds without auth, releases busy state and previews only its site',async t=>{
  const h=await harness(t);h.noticeAction='Preview game';
  await h.api.commands['zero.exportWeb']();
  assert.equal(h.saves,1);assert.equal(h.builds,1);assert.equal(h.busy,false);assert.equal(h.previewOpened,1);
  assert.equal(h.args[0].projectRoot,h.root);assert.ok(h.args[0].signal instanceof AbortSignal);
  assert.match(h.states.join('\n'),/4.5 MB/);assert.equal(h.opened.length,0,'Managed previews never leave executing tabs in an external browser');
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
