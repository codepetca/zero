'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createStudentExplorer}=require('../src/student-explorer');
const {createFileCommands}=require('../src/file-actions');
const authoring=require('../src/sharing/authoring');
async function put(root,name,text=''){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
const disposable=()=>({dispose(){}});
async function fixture(t){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-tree-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'zero.json','{"name":"Student app"}');await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
  await put(root,'src/main/java/Main.java','public class Main {}');
  let current=root,busy=false,name='game.characters';const calls=[],copied=[],logs=[],watchers=[];let folderChange;
  class Emitter{constructor(){this.listeners=[];this.event=listener=>{this.listeners.push(listener);return disposable();};}fire(value){for(const listener of this.listeners)listener(value);}dispose(){this.listeners=[];}}
  const vscode={EventEmitter:Emitter,TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2},TreeItem:class{constructor(label,collapsibleState){Object.assign(this,{label,collapsibleState});}},ThemeIcon:class{constructor(id){this.id=id;}},RelativePattern:class{constructor(base,pattern){Object.assign(this,{base,pattern});}},
    Uri:{file:fsPath=>({fsPath})},env:{clipboard:{writeText:async text=>copied.push(text)}},commands:{executeCommand:async(...args)=>calls.push(args)},
    workspace:{isTrusted:true,onDidChangeWorkspaceFolders:fn=>{folderChange=fn;return disposable();},createFileSystemWatcher:pattern=>{const callbacks={};const w={pattern,callbacks,dispose(){w.disposed=true;}};for(const method of ['onDidCreate','onDidChange','onDidDelete'])w[method]=fn=>{callbacks[method]=fn;return disposable();};watchers.push(w);return w;}},
    window:{createTreeView:(_,options)=>({options,dispose(){}}),showInputBox:async()=>name,showQuickPick:async items=>items[0]}};
  const workspaceState={get:(_,fallback)=>fallback,update:async(...args)=>calls.push(['state',...args])};
  const host={project:async()=>current,isBusy:()=>busy,output:{appendLine:text=>logs.push(text)},workspaceState};
  const files=createFileCommands(vscode,{...host,setBusy:value=>{busy=value;},setState:()=>{}});
  host.execute=async(command,arg)=>{calls.push([command,arg]);return files.commands[command]?.(arg);};
  const tree=createStudentExplorer(vscode,host);t.after(()=>{tree.dispose();files.dispose();});
  return {root,tree,vscode,calls,copied,logs,watchers,children:node=>tree.provider.getChildren(node),item:node=>tree.provider.getTreeItem(node),folderChange:()=>folderChange(),set current(v){current=v;},set busy(v){busy=v;},set name(v){name=v;}};
}
test('native roots lead with Code/Assets, conditionally show libraries and preserve other authored files',async t=>{
  const f=await fixture(t);await put(f.root,'notes.txt','notes');await put(f.root,'.zero-build/tool.cjs');await put(f.root,'src/main/java/zero/contrib/r88/helper/Mine.java');
  const roots=await f.children();assert.deepEqual(roots.map(n=>n.label),['Code','Assets','Other project files','Show all project files']);
  const code=await f.children(roots[0]);assert.deepEqual(code.map(n=>n.label),['zero','Main.java']);
  assert.equal(f.item(code[1]).command.command,'zero.explorerOpenFile');
  assert.deepEqual((await f.children(roots[2])).map(n=>n.label),['notes.txt']);
  await f.tree.commands['zero.explorerAction'](roots.at(-1));assert.deepEqual(f.calls.at(-1),['workbench.view.explorer']);
});
test('selected packages create matching declarations through the guarded file command',async t=>{
  const f=await fixture(t);let roots=await f.children();await f.tree.commands['zero.explorerNewPackage'](roots[0]);
  roots=await f.children();const game=(await f.children(roots[0])).find(n=>n.label==='game');const characters=(await f.children(game))[0];
  f.name='Player';await f.tree.commands['zero.explorerNewClass'](characters);
  assert.match(await fs.readFile(path.join(f.root,'src/main/java/game/characters/Player.java'),'utf8'),/^package game.characters;\n\npublic class Player/);
  await assert.rejects(f.tree.commands['zero.explorerNewClass'](characters),/view changed/);
  await assert.rejects(f.tree.commands['zero.explorerNewClass']({...characters}),/view changed/);
});
test('selected asset files copy exact classpath literals; previews use supported file opens',async t=>{
  const f=await fixture(t);await put(f.root,'src/main/resources/images/player.png','image');const roots=await f.children(),images=(await f.children(roots[1]))[0],asset=(await f.children(images))[0];
  await f.tree.commands['zero.explorerCopyAssetPath'](asset);assert.deepEqual(f.copied,['"/images/player.png"']);
  await f.tree.commands['zero.explorerOpenFile'](asset);assert.equal(f.calls.at(-1)[0],'vscode.open');
  await fs.unlink(path.join(f.root,asset.relative));await assert.rejects(f.tree.commands['zero.explorerCopyAssetPath'](asset),/asset changed/);
});
test('authored library virtual roots use identity namespaces and published copies cannot receive files',async t=>{
  const f=await fixture(t);await put(f.root,'src/main/java/Health.java','public class Health {}');await put(f.root,'LICENSE','MIT');
  await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository:{id:'12345',ownerId:'123',owner:'student',name:'app',url:'https://github.com/student/app'},descriptor:{schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'Health helper',license:'MIT',libraryKind:'helper'},sources:['src/main/java/Health.java']}));
  const roots=await f.children(),library=(await f.children(roots[2]))[0],details=await f.children(library),code=details.find(n=>n.label==='Code'),assets=details.find(n=>n.label==='Assets');
  assert.match(f.item(library).description,/1.0.0 · Local source/);assert.match(code.relative,/src\/main\/java\/zero\/contrib\/r12345\/health_bar$/);
  f.name='Extra';await f.tree.commands['zero.explorerNewClass'](code);assert.match(await fs.readFile(path.join(f.root,code.relative,'Extra.java'),'utf8'),/^package zero.contrib.r12345.health_bar;/);
  await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));f.tree.invalidate();
  const library2=(await f.children((await f.children()).find(n=>n.kind==='libraries')))[0],published=await f.children(library2);
  assert.match(f.item(library2).description,/1.2.3 · Published active/);assert.ok(published.some(n=>n.label==='Retained code (inactive)'));
  assert.equal(f.item(published.find(n=>n.label==='Retained code (inactive)')).contextValue,'zeroReadonly');
  await assert.rejects(f.tree.commands['zero.explorerNewClass'](published.find(n=>n.label==='Retained code (inactive)')),/Develop local/);
  const retainedCode=published.find(n=>n.label==='Retained code (inactive)');
  await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'local'}));f.tree.invalidate();
  const activeChildren=await f.children(retainedCode),activeClass=activeChildren.find(n=>n.label==='Extra.java');
  assert.equal(f.item(activeClass).contextValue,'zeroCode','Expanded old retained nodes derive writable state from current mode');
  f.name='Another';await f.tree.commands['zero.explorerNewClass'](activeClass);
  assert.match(await fs.readFile(path.join(f.root,code.relative,'Another.java'),'utf8'),/^package zero.contrib.r12345.health_bar;/);
  assert.equal(assets.area,'library-assets');
});
test('root switches, links, disposal and busy states cannot dispatch writes or open foreign files',async t=>{
  const f=await fixture(t);const roots=await f.children(),main=(await f.children(roots[0]))[0];f.busy=true;
  await f.tree.commands['zero.explorerNewClass'](roots[0]);assert.ok(!f.calls.some(c=>c[0]==='zero.newClass'));f.busy=false;
  const foreign=f.root+'-elsewhere';f.current=foreign;await assert.rejects(f.tree.commands['zero.explorerOpenFile'](main),/project changed/);f.current=f.root;
  await fs.unlink(path.join(f.root,main.relative));await fs.symlink('/etc/hosts',path.join(f.root,main.relative));await assert.rejects(f.tree.commands['zero.explorerOpenFile'](main),/Symbolic links/);
  f.tree.dispose();await assert.rejects(f.tree.commands['zero.explorerNewClass'](roots[0]),/view changed/);
});
test('external edits refresh, generated output does not, and project switches dispose watchers',async t=>{
  const f=await fixture(t);const roots=await f.children();const watcher=f.watchers[0];let refreshed=0;f.tree.provider.onDidChangeTreeData(()=>refreshed++);
  watcher.callbacks.onDidChange({fsPath:path.join(f.root,'target/classes/Main.class')});await new Promise(resolve=>setTimeout(resolve,150));assert.equal(refreshed,0);
  await put(f.root,'src/main/java/External.java','class External {}');watcher.callbacks.onDidCreate({fsPath:path.join(f.root,'src/main/java/External.java')});await new Promise(resolve=>setTimeout(resolve,150));assert.equal(refreshed,1);
  await assert.rejects(f.tree.commands['zero.explorerNewClass'](roots[0]),/view changed/);await f.children();assert.equal(watcher.disposed,true);
  assert.ok((await f.children(roots[0])).some(node=>node.label==='External.java'),'Expanded identities still read fresh children during host refresh');
  f.folderChange();assert.equal(f.watchers.at(-1).disposed,true);assert.equal(refreshed,2);
});
test('preview is explicitly switchable and all-files escape keeps Zero return in the preview',async t=>{
  const f=await fixture(t);assert.equal(f.tree.isPreview(),false);await f.tree.commands['zero.previewStudentExplorer']();assert.equal(f.tree.isPreview(),true);
  assert.ok(f.calls.some(c=>c[0]==='workbench.view.extension.zero-student-explorer'));await f.tree.commands['zero.showAllProjectFiles']();assert.equal(f.tree.isPreview(),true);
  await f.tree.commands['zero.standardExplorer']();assert.equal(f.tree.isPreview(),false);assert.deepEqual(f.calls.at(-1),['zero.controls.focus']);
});
test('bounded view errors retain a full-Explorer escape',async t=>{
  const f=await fixture(t);await put(f.root,'zero.json','{');const roots=await f.children();assert.deepEqual(roots.map(n=>n.label),['Project view unavailable','Show all project files']);assert.equal(f.logs.length,1);
  await f.tree.commands['zero.explorerAction'](roots[1]);assert.deepEqual(f.calls.at(-1),['workbench.view.explorer']);
});
test('initial model errors retain watching and recover after external repair without manual refresh',async t=>{
  const f=await fixture(t);await put(f.root,'pom.xml','broken XML');
  // Use malformed JSON, which is always parsed even without library pins.
  await put(f.root,'zero.json','{');assert.equal((await f.children())[0].kind,'message');
  assert.equal(f.watchers.length,1);
  await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(f.root,'pom.xml'));
  await put(f.root,'zero.json','{}');
  f.watchers[0].callbacks.onDidChange({fsPath:path.join(f.root,'zero.json')});
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.deepEqual((await f.children()).slice(0,2).map(n=>n.label),['Code','Assets']);
  await put(f.root,'zero.json','{');f.tree.invalidate();assert.equal((await f.children())[0].kind,'message');
  await put(f.root,'zero.json','{}');assert.equal((await f.children())[0].label,'Code','Failed loads are not permanently cached');
});
