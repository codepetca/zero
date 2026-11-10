'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createStudentExplorer}=require('../src/student-explorer');
const {createFileCommands}=require('../src/file-actions');
const {createRenameCommands}=require('../src/file-rename');
const authoring=require('../src/sharing/authoring');
async function put(root,name,text=''){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);}
const disposable=()=>({dispose(){}});
async function waitFor(condition) {
  const deadline=Date.now()+3000;
  while(!condition()){
    assert.ok(Date.now()<deadline,'Expected a Files update');
    await new Promise(resolve=>setTimeout(resolve,15));
  }
}
async function fixture(t,{remembered=new Map()}={}){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-tree-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await put(root,'zero.json','{"name":"Student app"}');await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
  await put(root,'src/main/java/Main.java','public class Main {}');
  let current=root,busy=false,name='game.characters';const calls=[],copied=[],logs=[],watchers=[],contentProviders=new Map();let folderChange,selectionChange,trustChange;const documentEvents={};
  class Emitter{constructor(){this.listeners=[];this.event=listener=>{this.listeners.push(listener);return disposable();};}fire(value){for(const listener of this.listeners)listener(value);}dispose(){this.listeners=[];}}
  const vscode={EventEmitter:Emitter,TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2},TreeItem:class{constructor(label,collapsibleState){Object.assign(this,{label,collapsibleState});}},ThemeIcon:class{constructor(id){this.id=id;}},ThemeColor:class{constructor(id){this.id=id;}},RelativePattern:class{constructor(base,pattern){Object.assign(this,{base,pattern});}},
    Uri:{file:fsPath=>({fsPath,scheme:'file'}),parse:value=>({scheme:value.split(':')[0],toString:()=>value})},env:{clipboard:{writeText:async text=>copied.push(text)}},commands:{executeCommand:async(...args)=>calls.push(args)},
    workspace:{isTrusted:true,registerTextDocumentContentProvider:(scheme,provider)=>{contentProviders.set(scheme,provider);return disposable();},...Object.fromEntries(['onDidChangeTextDocument','onDidSaveTextDocument','onDidCloseTextDocument'].map(name=>[name,fn=>{documentEvents[name]=fn;return disposable();}])),onDidChangeWorkspaceFolders:fn=>{folderChange=fn;return disposable();},onDidGrantWorkspaceTrust:fn=>{trustChange=fn;return disposable();},createFileSystemWatcher:pattern=>{const callbacks={};const w={pattern,callbacks,dispose(){w.disposed=true;}};for(const method of ['onDidCreate','onDidChange','onDidDelete'])w[method]=fn=>{callbacks[method]=fn;return disposable();};watchers.push(w);return w;}},
    window:{createTreeView:(_,options)=>({options,onDidChangeSelection:fn=>{selectionChange=fn;return disposable();},dispose(){}}),showInputBox:async()=>name,showQuickPick:async items=>items[0]}};
  const workspaceState={get:(key,fallback)=>remembered.has(key)?remembered.get(key):fallback,update:async(key,value)=>{remembered.set(key,value);calls.push(['state',key,value]);}};
  const host={project:async()=>current,isBusy:()=>busy,output:{appendLine:text=>logs.push(text)},workspaceState};
  const files=createFileCommands(vscode,{...host,setBusy:value=>{busy=value;},setState:()=>{},
    refreshFiles:(root,relative)=>tree.refreshCreated(root,relative)});
  host.execute=async(command,arg)=>{calls.push([command,arg]);return files.commands[command]?.(arg);};
  const tree=createStudentExplorer(vscode,host);t.after(()=>{tree.dispose();files.dispose();});
  return {root,tree,vscode,host,calls,copied,logs,watchers,contentProviders,documentEvents,children:node=>tree.provider.getChildren(node),item:node=>tree.provider.getTreeItem(node),folderChange:()=>folderChange(),grantTrust:()=>trustChange(),select:node=>{tree.tree.selection=node?[node]:[];selectionChange();},set current(v){current=v;},set busy(v){busy=v;},set name(v){name=v;}};
}
test('file restore actions reflect workspace trust and Windows support',async t=>{
 const f=await fixture(t),{parseStudentFileStatus}=require('../src/student-file-status');
 f.host.readFileStatus=async()=>parseStudentFileStatus(' M src/main/java/Main.java\0 D src/main/java/Gone.java\0');
 f.vscode.workspace.isTrusted=false;f.tree.invalidate();let roots=await f.children(),files=await f.children(roots[0]);
 assert.equal(f.item(files.find(node=>node.label==='Main.java')).contextValue,'zeroCodeFile');assert.ok(!files.some(node=>node.label==='Gone.java'));
 f.vscode.workspace.isTrusted=true;f.grantTrust();roots=await f.children();files=await f.children(roots[0]);
 assert.equal(f.item(files.find(node=>node.label==='Main.java')).contextValue,'zeroCodeFile');assert.equal(f.item(files.find(node=>node.label==='Gone.java')).contextValue,'zeroReadonly');
 f.host.readFileStatus=async()=>parseStudentFileStatus('MD src/main/java/Gone.java\0');f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);const mixedDeleted=files.find(node=>node.label==='Gone.java');assert.equal(f.item(mixedDeleted).contextValue,'zeroReadonly');await assert.rejects(f.tree.commands['zero.explorerRestoreDeletedFile'](mixedDeleted),/Select a deleted/);
 f.host.readFileStatus=async()=>parseStudentFileStatus('AD src/main/java/Gone.java\0');f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);const addedDeleted=files.find(node=>node.label==='Gone.java');assert.equal(f.item(addedDeleted).contextValue,'zeroReadonly');await assert.rejects(f.tree.commands['zero.explorerRestoreDeletedFile'](addedDeleted),/Select a deleted/);assert.ok(!f.calls.some(call=>call[0]==='zero.restoreDeletedFile'));
 f.host.readFileStatus=async()=>parseStudentFileStatus('D  src/main/java/Gone.java\0');f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);assert.equal(f.item(files.find(node=>node.label==='Gone.java')).contextValue,'zeroReadonly');
 f.host.readFileStatus=async()=>parseStudentFileStatus(' M src/main/java/Main.java\0 D src/main/java/Gone.java\0');f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);
 const platform=Object.getOwnPropertyDescriptor(process,'platform');
 try {Object.defineProperty(process,'platform',{...platform,value:'win32'});f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);assert.equal(f.item(files.find(node=>node.label==='Main.java')).contextValue,'zeroCodeFile');assert.equal(f.item(files.find(node=>node.label==='Gone.java')).contextValue,'zeroReadonly');}
 finally {Object.defineProperty(process,'platform',platform);}
});
test('added-file actions distinguish untracked, staged and mixed states and recheck selection',async t=>{
 const f=await fixture(t),{parseStudentFileStatus}=require('../src/student-file-status');
 for(const name of ['New.java','Staged.java','Mixed.java','Recreated.java'])await put(f.root,`src/main/java/${name}`,'file');
 let raw='?? src/main/java/New.java\0A  src/main/java/Staged.java\0AM src/main/java/Mixed.java\0D  src/main/java/Recreated.java\0?? src/main/java/Recreated.java\0';
 f.host.readFileStatus=async()=>parseStudentFileStatus(raw);f.tree.invalidate();let roots=await f.children(),files=await f.children(roots[0]);
 const byName=name=>files.find(node=>node.label===name);
 assert.equal(f.item(byName('New.java')).contextValue,'zeroCodeFile');assert.equal(f.item(byName('Staged.java')).contextValue,'zeroCodeFile');assert.equal(f.item(byName('Mixed.java')).contextValue,'zeroCodeFile');assert.equal(f.item(byName('Recreated.java')).contextValue,'zeroCodeFile');
 const stale=byName('New.java');raw=' M src/main/java/New.java\0';await assert.rejects(f.tree.commands['zero.explorerRemoveAddedFile'](stale),/Select an added/);
 raw='?? src/main/java/New.java\0';f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);await assert.rejects(f.tree.commands['zero.explorerRemoveAddedFile'](byName('New.java')),/Select an added/);
 f.vscode.workspace.isTrusted=false;f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);assert.equal(f.item(byName('New.java')).contextValue,'zeroCodeFile');
 f.vscode.workspace.isTrusted=true;f.grantTrust();const platform=Object.getOwnPropertyDescriptor(process,'platform');try{Object.defineProperty(process,'platform',{...platform,value:'win32'});f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);assert.equal(f.item(byName('New.java')).contextValue,'zeroCodeFile');}finally{Object.defineProperty(process,'platform',platform);}
});
test('unborn and committed projects keep added-file removal hidden',async t=>{
 const f=await fixture(t),{parseStudentFileStatus}=require('../src/student-file-status');let committed=false,unborn=false;
 f.host.readFileStatus=async()=>{const result=parseStudentFileStatus('?? src/main/java/Main.java\0');Object.defineProperty(result,'hasCommittedHead',{value:committed});Object.defineProperty(result,'verifiedUnbornHead',{value:unborn});return result;};
 const discard=()=>f.calls.findLast(call=>call[0]==='setContext'&&call[1]==='zero.projectHasDiscardableChanges')?.[2];
 f.tree.invalidate();let roots=await f.children(),files=await f.children(roots[0]);assert.equal(f.item(files.find(node=>node.label==='Main.java')).contextValue,'zeroCodeFile');assert.ok(!roots.some(node=>/discard/i.test(node.label)));assert.equal(discard(),false);
 unborn=true;f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);assert.equal(f.item(files.find(node=>node.label==='Main.java')).contextValue,'zeroCodeFile');assert.equal(discard(),false);
 committed=true;f.tree.invalidate();roots=await f.children();files=await f.children(roots[0]);assert.equal(f.item(files.find(node=>node.label==='Main.java')).contextValue,'zeroCodeFile');assert.ok(!roots.some(node=>/Commit the initial project or use Source Control/.test(node.label)));assert.equal(discard(),false);
});
test('native roots lead with java/resources, conditionally show libraries and preserve other authored files',async t=>{
  const f=await fixture(t);await put(f.root,'notes.txt','notes');await put(f.root,'.zero-build/tool.cjs');await put(f.root,'src/main/java/zero/contrib/r88/helper/Mine.java');
  const roots=await f.children();assert.deepEqual(roots.map(n=>n.label),['java','resources','Other project files','Show all project files']);
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
  await assert.rejects(f.tree.commands['zero.explorerNewClass'](characters),/name already exists/);
  await assert.rejects(f.tree.commands['zero.explorerNewClass']({...characters}),/view changed/);
});
test('Project dropdown follows selected files and folders using simplified destinations',async t=>{
 const f=await fixture(t);await put(f.root,'src/main/java/game/characters/Existing.java','package game.characters; class Existing {}');
 let roots=await f.children();const game=(await f.children(roots[0])).find(n=>n.label==='game'),characters=(await f.children(game))[0],existing=(await f.children(characters))[0];
 f.select(existing);assert.equal(f.tree.tree.description,'java › game › characters');
 assert.equal(f.item(existing).tooltip,'java › game › characters › Existing.java');
 assert.equal(f.item(existing).contextValue,'zeroCodeFile');
 f.name='MenuHelper';await f.tree.commands['zero.projectNewClass']();
 assert.match(await fs.readFile(path.join(f.root,characters.relative,'MenuHelper.java'),'utf8'),/^package game.characters;/);
 roots=await f.children();f.select(roots[1]);f.name='images';await f.tree.commands['zero.projectNewFolder']();
 assert.equal((await fs.stat(path.join(f.root,'src/main/resources/images'))).isDirectory(),true);
 assert.ok(f.calls.some(c=>c[0]==='setContext'&&c[1]==='zero.explorerCodeTarget'&&c[2]===false));
});
test('Project dropdown defaults to java and refuses stale or foreign selections',async t=>{
 const f=await fixture(t);f.name='DefaultHelper';await f.tree.commands['zero.projectNewClass']();
 assert.match(await fs.readFile(path.join(f.root,'src/main/java/DefaultHelper.java'),'utf8'),/public class DefaultHelper/);
 const roots=await f.children();f.select(roots[0]);f.tree.invalidate();
 await assert.rejects(f.tree.commands['zero.projectNewClass'](),/view changed/);
 f.select((await f.children())[0]);f.current=f.root+'-elsewhere';
 await assert.rejects(f.tree.commands['zero.projectNewClass'](),/project changed/);f.current=f.root;
 f.select();f.busy=true;f.name='Busy';await f.tree.commands['zero.projectNewClass']();
 await assert.rejects(fs.stat(path.join(f.root,'src/main/java/Busy.java')),{code:'ENOENT'});
});
test('file context actions create siblings in Other project files and dispatch guarded rename',async t=>{
 const f=await fixture(t);await put(f.root,'notes/drafts/idea.txt','idea');await put(f.root,'root-note.txt','root');
 let roots=await f.children(),other=roots.find(n=>n.kind==='other'),notes=(await f.children(other)).find(n=>n.label==='notes'),drafts=(await f.children(notes))[0],idea=(await f.children(drafts))[0];
 f.select(idea);assert.equal(f.tree.tree.description,'Other project files › notes › drafts');assert.equal(f.item(idea).contextValue,'zeroProjectFile');
 f.name='sibling.txt';await f.tree.commands['zero.explorerNewFile'](idea);
 assert.equal(await fs.readFile(path.join(f.root,'notes/drafts/sibling.txt'),'utf8'),'');
 roots=await f.children();other=roots.find(n=>n.kind==='other');const rootNote=(await f.children(other)).find(n=>n.label==='root-note.txt');
 f.name='next.txt';await f.tree.commands['zero.explorerNewFile'](rootNote);assert.equal(await fs.readFile(path.join(f.root,'next.txt'),'utf8'),'');
 other=(await f.children()).find(n=>n.kind==='other');const next=(await f.children(other)).find(n=>n.label==='next.txt');
 await f.tree.commands['zero.explorerRenameFile'](next);
 assert.deepEqual(f.calls.findLast(c=>c[0]==='zero.renameStudentFile'),['zero.renameStudentFile',{root:f.root,relative:'next.txt',area:'project',libraryFolder:undefined}]);
 await assert.rejects(f.tree.commands['zero.explorerRenameFile'](next),/view changed/);
 await assert.rejects(f.tree.commands['zero.explorerRenameFile']({...next}),/view changed/);
});
test('selected asset files copy exact classpath literals; previews use supported file opens',async t=>{
  const f=await fixture(t);await put(f.root,'src/main/resources/images/player.png','image');const roots=await f.children(),images=(await f.children(roots[1]))[0],asset=(await f.children(images))[0];
  await f.tree.commands['zero.explorerCopyAssetPath'](asset);assert.deepEqual(f.copied,['"/images/player.png"']);
  await f.tree.commands['zero.explorerOpenFile'](asset);assert.equal(f.calls.at(-1)[0],'vscode.open');
  await fs.unlink(path.join(f.root,asset.relative));await assert.rejects(f.tree.commands['zero.explorerCopyAssetPath'](asset),/asset changed/);
});
test('Files drag moves a project text file to resources without replacing files',async t=>{
  const f=await fixture(t),feedback=[];
  await put(f.root,'src/main/java/hello.txt','hello');
  f.vscode.DataTransferItem=class{constructor(value){this.value=value;}};
  f.vscode.WorkspaceEdit=class{
    renameFile(from,to,options){Object.assign(this,{from,to,options});}
  };
  f.vscode.workspace.applyEdit=async edit=>{
    assert.deepEqual(edit.options,{overwrite:false,ignoreIfExists:false});
    await fs.rename(edit.from.fsPath,edit.to.fsPath);
    return true;
  };
  const mover=createRenameCommands(f.vscode,{...f.host,setBusy:value=>{f.busy=value;},
    setState:message=>feedback.push(message),refreshFiles:()=>f.tree.invalidate()});
  t.after(()=>mover.dispose());
  f.host.moveFile=mover.move;
  f.host.report=message=>feedback.push(message);
  const controller=f.tree.tree.options.dragAndDropController,token={isCancellationRequested:false};
  async function dragHello(){
    const roots=await f.children(),java=roots.find(item=>item.label==='java');
    const source=(await f.children(java)).find(item=>item.label==='hello.txt'),data=new Map();
    controller.handleDrag([source],data,token);
    return {data,resources:roots.find(item=>item.label==='resources')};
  }
  const first=await dragHello();
  await controller.handleDrop(first.resources,first.data,token);
  const source=path.join(f.root,'src/main/java/hello.txt'),destination=path.join(f.root,'src/main/resources/hello.txt');
  assert.equal(await fs.readFile(destination,'utf8'),'hello');
  await assert.rejects(fs.stat(source),{code:'ENOENT'});
  assert.equal(feedback.at(-1),'Moved hello.txt');

  await fs.writeFile(source,'keep this too');
  const second=await dragHello();
  await controller.handleDrop(second.resources,second.data,token);
  assert.match(feedback.at(-1),/already exists/);
  assert.equal(await fs.readFile(source,'utf8'),'keep this too');
  assert.equal(await fs.readFile(destination,'utf8'),'hello');

  await fs.unlink(destination);
  const stale=await dragHello();
  f.tree.invalidate();
  await controller.handleDrop(stale.resources,stale.data,token);
  assert.equal(await fs.readFile(source,'utf8'),'keep this too');
  await assert.rejects(fs.stat(destination),{code:'ENOENT'});
});

test('authored library virtual roots use identity namespaces and published copies cannot receive files',async t=>{
  const f=await fixture(t);await put(f.root,'src/main/java/Health.java','public class Health {}');await put(f.root,'LICENSE','MIT');
  await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository:{id:'12345',ownerId:'123',owner:'student',name:'app',url:'https://github.com/student/app'},descriptor:{schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'Health helper',license:'MIT',libraryKind:'helper'},sources:['src/main/java/Health.java']}));
  const roots=await f.children(),library=(await f.children(roots[2]))[0],details=await f.children(library),code=details.find(n=>n.label==='java'),assets=details.find(n=>n.label==='resources');
  assert.match(f.item(library).description,/1.0.0 · Local source/);assert.equal(f.item(code).tooltip,'Libraries › Health bar › java');
  f.select(assets);assert.equal(f.tree.tree.description,'Libraries › Health bar › resources');
  assert.match(code.relative,/src\/main\/java\/zero\/contrib\/r12345\/health_bar$/);
  f.name='Extra';await f.tree.commands['zero.explorerNewClass'](code);assert.match(await fs.readFile(path.join(f.root,code.relative,'Extra.java'),'utf8'),/^package zero.contrib.r12345.health_bar;/);
  await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));f.tree.invalidate();
  const library2=(await f.children((await f.children()).find(n=>n.kind==='libraries')))[0],published=await f.children(library2);
  assert.match(f.item(library2).description,/1.2.3 · Published active/);assert.ok(published.some(n=>n.label==='java (retained, inactive)'));
  assert.equal(f.item(published.find(n=>n.label==='java (retained, inactive)')).contextValue,'zeroReadonly');
  await assert.rejects(f.tree.commands['zero.explorerNewClass'](published.find(n=>n.label==='java (retained, inactive)')),/Develop local/);
  const retainedCode=published.find(n=>n.label==='java (retained, inactive)');
  await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'local'}));f.tree.invalidate();
  const activeChildren=await f.children(retainedCode),activeClass=activeChildren.find(n=>n.label==='Extra.java');
  assert.equal(f.item(activeClass).contextValue,'zeroCodeFile','Expanded old retained nodes derive writable state from current mode');
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
test('file additions refresh their folder, generated output does not, and project switches dispose watchers',async t=>{
  const f=await fixture(t),roots=await f.children(),watcher=f.watchers[0],updates=[];
  f.tree.provider.onDidChangeTreeData(value=>updates.push(value));
  watcher.callbacks.onDidChange({fsPath:path.join(f.root,'target/classes/Main.class')});
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.deepEqual(updates,[]);
  await put(f.root,'src/main/java/External.java','class External {}');
  watcher.callbacks.onDidCreate({fsPath:path.join(f.root,'src/main/java/External.java')});
  await waitFor(()=>updates.length>0);
  assert.deepEqual(updates,[roots[0]]);
  assert.ok((await f.children(roots[0])).some(node=>node.label==='External.java'));
  f.name='Created.txt';
  await f.tree.commands['zero.projectNewFile']();
  await waitFor(()=>updates.length>1);
  assert.deepEqual(updates,[roots[0],roots[0]]);
  assert.ok((await f.children(roots[0])).some(node=>node.label==='Created.txt'));
  assert.equal(watcher.disposed,undefined);
  f.folderChange();
  assert.equal(watcher.disposed,true);
  assert.deepEqual(updates,[roots[0],roots[0],undefined]);
  await assert.rejects(f.tree.commands['zero.explorerNewClass'](roots[0]),/view changed/);
});
test('editing updates one file row and saving it does not rebuild Files',async t=>{
  const f=await fixture(t),updates=[],changes=[];
  let gitStatus=new Map(),reads=0;
  f.host.readFileStatus=async()=>{reads++;return gitStatus;};
  f.host.onFileChanges=(_root,dirty)=>changes.push(dirty);
  const [java]=await f.children(),[main]=await f.children(java);
  const uri=f.vscode.Uri.file(path.join(f.root,main.relative)),document={isDirty:true,uri};
  f.vscode.workspace.textDocuments=[document];
  f.tree.provider.onDidChangeTreeData(value=>updates.push(value));
  f.documentEvents.onDidChangeTextDocument({document});
  await waitFor(()=>updates.length>0);
  assert.equal(f.item(main).accessibilityInformation.label,'Main.java, Modified');
  assert.deepEqual(updates,[main]);
  for(let i=0;i<5;i++)f.documentEvents.onDidChangeTextDocument({document});
  assert.equal(reads,1,'Typing does not reread Git');
  document.isDirty=false;
  gitStatus=new Map([[main.relative,'modified']]);
  f.documentEvents.onDidSaveTextDocument(document);
  // Atomic writes can be delivered as a delete/create pair for the same path.
  f.watchers[0].callbacks.onDidDelete(uri);
  f.watchers[0].callbacks.onDidCreate(uri);
  await waitFor(()=>changes.at(-1)===true);
  assert.deepEqual(updates,[main]);
  gitStatus=new Map();
  f.watchers[1].callbacks.onDidChange(f.vscode.Uri.file(path.join(f.root,'.git/refs/heads/main')));
  f.tree.refreshStatus();
  await waitFor(()=>updates.length===2);
  assert.equal(reads,3);
  assert.equal(f.item(main).accessibilityInformation.label,'Main.java');
  assert.deepEqual(updates,[main,main],'Only the two status transitions refresh a row');
});
test('discard removes a new file from its group before the watcher reports it',async t=>{
 const f=await fixture(t),updates=[];
 await put(f.root,'notes.txt','kept');
 await put(f.root,'scratch.txt','discarded');
 let changes=new Map([['scratch.txt','added']]);
 f.host.readFileStatus=async()=>changes;
 const roots=await f.children(),other=roots.find(node=>node.kind==='other');
 assert.deepEqual((await f.children(other)).map(node=>node.label),['notes.txt','scratch.txt']);
 f.tree.provider.onDidChangeTreeData(value=>updates.push(value));
 await fs.unlink(path.join(f.root,'scratch.txt'));
 changes=new Map();
 f.tree.refreshStatus();
 await waitFor(()=>updates.length>0);
 assert.deepEqual(updates,[other]);
 assert.deepEqual((await f.children(other)).map(node=>node.label),['notes.txt']);
});
test('a path that switches between a file and directory refreshes its parent each time',async t=>{
 const f=await fixture(t),updates=[];
 const relative='src/main/java/Example',filename=path.join(f.root,relative);
 await put(f.root,relative,'file');
 const [java]=await f.children();
 assert.equal((await f.children(java)).find(node=>node.relative===relative).kind,'file');
 f.tree.provider.onDidChangeTreeData(value=>updates.push(value));
 const watcher=f.watchers[0],uri=f.vscode.Uri.file(filename);
 await fs.unlink(filename);
 await fs.mkdir(filename);
 watcher.callbacks.onDidDelete(uri);
 watcher.callbacks.onDidCreate(uri);
 await waitFor(()=>updates.length>0);
 assert.equal((await f.children(java)).find(node=>node.relative===relative).kind,'folder');
 await fs.rmdir(filename);
 await put(f.root,relative,'new file');
 watcher.callbacks.onDidDelete(uri);
 watcher.callbacks.onDidCreate(uri);
 await waitFor(()=>updates.length>1);
 assert.deepEqual(updates,[java,java]);
 assert.equal((await f.children(java)).find(node=>node.relative===relative).kind,'file');
});
test('student explorer defaults on and an explicit Standard Explorer choice persists across reload',async t=>{
  const remembered=new Map(),f=await fixture(t,{remembered});assert.equal(f.tree.tree.options.showCollapseAll,false);
  await f.tree.commands['zero.collapseStudentExplorer']();assert.deepEqual(f.calls.slice(-2),[['zero.studentProject.focus'],['list.collapseAll']]);
  assert.equal(f.tree.isPreview(),true);await f.tree.commands['zero.previewStudentExplorer']();assert.equal(f.tree.isPreview(),true);
  assert.ok(f.calls.some(c=>c[0]==='workbench.view.extension.zero-student-explorer'));await f.tree.commands['zero.showAllProjectFiles']();assert.equal(f.tree.isPreview(),true);
  await f.tree.commands['zero.standardExplorer']();assert.equal(f.tree.isPreview(),false);assert.deepEqual(f.calls.at(-1),['zero.controls.focus']);
  const reloaded=await fixture(t,{remembered});assert.equal(reloaded.tree.isPreview(),false);
  await reloaded.tree.commands['zero.previewStudentExplorer']();assert.equal(remembered.get('zero.studentExplorerPreview'),true);
  await reloaded.tree.commands['zero.previewStudentExplorer']();
  assert.deepEqual(reloaded.calls.slice(-2),[['workbench.view.extension.zero-student-explorer'],['zero.studentProject.focus']], 'Showing the project again focuses the view even when already selected');
});
test('bounded view errors retain a full-Explorer escape',async t=>{
  const f=await fixture(t);await put(f.root,'zero.json','{');const roots=await f.children();assert.deepEqual(roots.map(n=>n.label),['Project view unavailable','Show all project files']);assert.equal(f.logs.length,1);
  await f.tree.commands['zero.explorerAction'](roots[1]);assert.deepEqual(f.calls.at(-1),['workbench.view.explorer']);
});
test('initial model errors retain watching and recover after external repair without manual refresh',async t=>{
  const f=await fixture(t);await put(f.root,'pom.xml','broken XML');
  // Use malformed JSON, which is always parsed even without library pins.
  await put(f.root,'zero.json','{');assert.equal((await f.children())[0].kind,'message');
  assert.equal(f.watchers.length,2);
  await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(f.root,'pom.xml'));
  await put(f.root,'zero.json','{}');
  f.watchers[0].callbacks.onDidChange({fsPath:path.join(f.root,'zero.json')});
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.deepEqual((await f.children()).slice(0,2).map(n=>n.label),['java','resources']);
  await put(f.root,'zero.json','{');f.tree.invalidate();assert.equal((await f.children())[0].kind,'message');
  await put(f.root,'zero.json','{}');assert.equal((await f.children())[0].label,'java','Failed loads are not permanently cached');
});

test('a local library file-only rename keeps source navigable until its Java declaration is repaired',async t=>{
 const f=await fixture(t);await put(f.root,'src/main/java/Health.java','public class Health {}');await put(f.root,'LICENSE','MIT');
 await authoring.applyPlan(await authoring.previewExtraction(f.root,{repository:{id:'12345',ownerId:'123',owner:'student',name:'app',url:'https://github.com/student/app'},descriptor:{schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'Health helper',license:'MIT',libraryKind:'helper'},sources:['src/main/java/Health.java']}));
 let roots=await f.children(),library=(await f.children(roots.find(n=>n.kind==='libraries')))[0],code=(await f.children(library)).find(n=>n.label==='java'),health=(await f.children(code)).find(n=>n.label==='Health.java');
 f.vscode.WorkspaceEdit=class{renameFile(from,to){this.from=from;this.to=to;}};
 f.vscode.workspace.applyEdit=async edit=>{await fs.rename(edit.from.fsPath,edit.to.fsPath);return true;};
 const renamer=createRenameCommands(f.vscode,{project:async()=>f.root,isBusy:()=>false,setBusy:()=>{},setState:()=>{},refreshFiles:()=>f.tree.invalidate()});t.after(()=>renamer.dispose());
 f.name='Better.java';await renamer.commands['zero.renameStudentFile']({root:f.root,relative:health.relative,area:health.area,libraryFolder:health.libraryFolder});
 roots=await f.children();assert.equal(roots[0].label,'java');library=(await f.children(roots.find(n=>n.kind==='libraries')))[0];
 assert.match(f.item(library).description,/Fix Java names/);const details=await f.children(library);assert.ok(details.some(n=>n.label==='Match Java class and file names'));
 code=details.find(n=>n.label==='java');const better=(await f.children(code)).find(n=>n.label==='Better.java');
 await f.tree.commands['zero.explorerOpenFile'](better);assert.match(f.calls.at(-1)[1].fsPath,/Better.java$/);
 // The same guarded rename can restore the filename without requiring full Explorer.
 f.name='Health.java';await renamer.commands['zero.renameStudentFile']({root:f.root,relative:better.relative,area:better.area,libraryFolder:better.libraryFolder});
 library=(await f.children((await f.children()).find(n=>n.kind==='libraries')))[0];assert.doesNotMatch(f.item(library).description,/Fix Java names/);
});
test('file-context creation refuses an already missing file, then targets its parent while prompting',async t=>{
 const f=await fixture(t);await put(f.root,'src/main/java/Note.txt','note');let code=(await f.children())[0],note=(await f.children(code)).find(n=>n.label==='Note.txt');
 await fs.unlink(path.join(f.root,note.relative));await assert.rejects(f.tree.commands['zero.explorerNewFile'](note),/selected file changed/);
 await put(f.root,note.relative,'note');f.vscode.window.showInputBox=async()=>{await fs.unlink(path.join(f.root,note.relative));return 'Sibling.txt';};
 await f.tree.commands['zero.explorerNewFile'](note);assert.equal(await fs.readFile(path.join(f.root,'src/main/java/Sibling.txt'),'utf8'),'');
});

test('Files shows added, modified and deleted paths without opening deleted files',async t=>{
 const f=await fixture(t),{execFileSync}=require('node:child_process');
 const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
 await put(f.root,'src/main/java/Old.java','class Old {}');
 git('init','-q');git('add','.');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Initial');
 await put(f.root,'src/main/java/Main.java','class Main { int score; }');
 await put(f.root,'src/main/java/New.java','class New {}');
 await fs.unlink(path.join(f.root,'src/main/java/Old.java'));
 let roots=await f.children(), entries=await f.children(roots[0]);
 const discardContext=()=>f.calls.filter(c=>c[0]==='setContext'&&c[1]==='zero.projectHasDiscardableChanges').at(-1)?.[2];
 const discardSupported=process.platform!=='win32';
 assert.equal(discardContext(),discardSupported);
 f.vscode.workspace.isTrusted=false;f.tree.invalidate();await f.children();assert.equal(discardContext(),false,'Untrusted projects cannot discard changes');
 f.vscode.workspace.isTrusted=true;f.tree.invalidate();roots=await f.children();entries=await f.children(roots[0]);assert.equal(discardContext(),discardSupported);
 const byName=Object.fromEntries(entries.map(n=>[n.label,n]));
 for(const [name,status] of [['Main.java','Modified'],['New.java','Added'],['Old.java','Deleted']]){
   const item=f.item(byName[name]);
   assert.equal(item.label,name);
   assert.equal(item.accessibilityInformation.label,`${name}, ${status}`);
   assert.equal(item.description,undefined);
   assert.equal(item.iconPath,undefined);
   assert.equal(item.resourceUri.fsPath,path.join(f.root,'src/main/java',name));
 }
 if(discardSupported){
   assert.equal(f.item(byName['Main.java']).contextValue,'zeroCodeFileModified');
   await f.tree.commands['zero.explorerRestoreModifiedFile'](byName['Main.java']);
   assert.ok(f.calls.some(([command,selection])=>command==='zero.restoreModifiedFile'&&selection.root===f.root&&selection.relative==='src/main/java/Main.java'));
   roots=await f.children();entries=await f.children(roots[0]);Object.assign(byName,Object.fromEntries(entries.map(n=>[n.label,n])));
 }

 assert.equal(f.item(byName['Old.java']).command.command,'zero.explorerOpenFile');
 assert.equal(f.item(byName['Old.java']).contextValue,'zeroReadonly');
 await assert.rejects(f.tree.commands['zero.explorerRestoreDeletedFile'](byName['Old.java']),/Select a deleted/);
 assert.ok(!f.calls.some(c=>c[0]==='zero.restoreDeletedFile'));
 await f.tree.commands['zero.explorerOpenFile'](byName['Old.java']);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');
 git('add','.');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Save');
 const updates=[];f.tree.provider.onDidChangeTreeData(value=>updates.push(value));
 f.watchers[1].callbacks.onDidChange({fsPath:path.join(f.root,'.git/index')});
 await waitFor(()=>updates.length>0);
 assert.deepEqual(updates,[roots[0]],'Clearing a deleted row refreshes its folder');
 assert.equal(discardContext(),false,'Discard is disabled after status is reread');
 roots=await f.children();entries=await f.children(roots[0]);
 assert.equal(discardContext(),false,'A clean project cannot discard changes');
 assert.equal(entries.some(n=>n.label==='Old.java'),false);
 assert.equal(f.item(entries.find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java');
});

test('Files shows a recreated staged deletion and a missing staged addition',async t=>{
 const f=await fixture(t),{execFileSync}=require('node:child_process');
 const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
 git('init','-q');git('add','.');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Initial');
 git('rm','-q','src/main/java/Main.java');await put(f.root,'src/main/java/Main.java','recreated');
 await put(f.root,'src/main/java/Never.java','staged');git('add','src/main/java/Never.java');await fs.unlink(path.join(f.root,'src/main/java/Never.java'));
 const roots=await f.children(),files=await f.children(roots[0]),byName=Object.fromEntries(files.map(n=>[n.label,n]));
 assert.ok(!roots.some(n=>n.label==='File change status unavailable'));
 assert.equal(f.item(byName['Main.java']).accessibilityInformation.label,'Main.java, Modified');
 assert.equal(f.item(byName['Main.java']).command.command,'zero.explorerOpenFile');
 assert.equal(f.item(byName['Never.java']).accessibilityInformation.label,'Never.java, Deleted');
 assert.equal(f.item(byName['Never.java']).command.command,'zero.explorerOpenFile');
});

test('Files shows linked-worktree changes without offering unsupported discard',async t=>{
 const f=await fixture(t),{execFileSync}=require('node:child_process');
 const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
 git('init','-q');git('add','.');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Initial');
 const linked=path.join(f.root,'linked');git('worktree','add','-qb','feature',linked);f.current=linked;
 await put(linked,'src/main/java/Main.java','modified');await put(linked,'src/main/java/Extra.java','added');
 const roots=await f.children(),files=await f.children(roots[0]);
 assert.equal(f.item(files.find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java, Modified');assert.equal(f.item(files.find(n=>n.label==='Extra.java')).accessibilityInformation.label,'Extra.java, Added');
 assert.equal(f.calls.filter(c=>c[1]==='zero.projectHasDiscardableChanges').at(-1)[2],false);
 const privateWatch=f.watchers[2],commonWatch=f.watchers[3];assert.ok(privateWatch&&commonWatch);
 git('-C',linked,'add','.');git('-C',linked,'-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Save');
 privateWatch.callbacks.onDidChange({fsPath:path.join(privateWatch.pattern.base,'index')});
 await waitFor(()=>files.every(node=>!node.status));
 const updated=await f.children(),updatedFiles=await f.children(updated[0]);
 assert.equal(f.item(updatedFiles.find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java');
 assert.equal(f.item(updatedFiles.find(n=>n.label==='Extra.java')).accessibilityInformation.label,'Extra.java');
 assert.equal(privateWatch.disposed,undefined);assert.equal(commonWatch.disposed,undefined);
});

test('linked Files rereads changes made before metadata watchers are installed',async t=>{
 const f=await fixture(t),{execFileSync}=require('node:child_process'),{readStudentFileStatus}=require('../src/student-file-status');
 const git=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
 git('init','-q');git('add','.');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','Initial');
 const linked=path.join(f.root,'linked');git('worktree','add','-qb','feature',linked);f.current=linked;
 await put(linked,'src/main/java/Main.java','changed');let reads=0;
 f.host.readFileStatus=async root=>{
   const snapshot=await readStudentFileStatus(root);
   if(++reads===1) {
     assert.equal(snapshot.get('src/main/java/Main.java'),'modified');
     assert.equal(f.watchers.length,2,'linked metadata watches are not installed yet');
     git('-C',linked,'add','.');git('-C',linked,'-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','External commit');
   }
   return snapshot;
 };
 const roots=await f.children(),files=await f.children(roots[0]);
 assert.equal(reads,2);assert.equal(f.watchers.length,4);
 assert.equal(f.item(files.find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java');
});

test('unsaved editor changes have an accessible status and Git status failures are visible',async t=>{
 const f=await fixture(t);
 f.vscode.workspace.textDocuments=[{isDirty:true,uri:{scheme:'file',fsPath:path.join(f.root,'src/main/java/Main.java')}}];
 let roots=await f.children(),files=await f.children(roots[0]);
 assert.equal(f.item(files.find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java, Modified');
 await fs.writeFile(path.join(f.root,'.git'),'gitdir: elsewhere');f.tree.invalidate();
 roots=await f.children();assert.ok(roots.some(n=>n.label==='File change status unavailable'));
 assert.equal(f.calls.filter(c=>c[1]==='zero.projectHasDiscardableChanges').at(-1)[2],false);
});


test('discard availability follows saved Git changes without flickering while editing',async t=>{
 const f=await fixture(t);let changes=new Map();
 f.host.readFileStatus=async()=>Object.assign(new Map(changes),{supportsDiscard:true,hasCommittedHead:true});
 const document={isDirty:true,uri:{scheme:'file',fsPath:path.join(f.root,'src/main/java/Main.java')}};
 f.vscode.workspace.textDocuments=[document];
 const discard=()=>f.calls.filter(c=>c[1]==='zero.projectHasDiscardableChanges').at(-1)[2];
 let roots=await f.children();assert.equal(discard(),false);
 assert.ok(!roots.some(n=>/discard/i.test(n.label)));
 assert.equal(f.item((await f.children(roots[0])).find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java, Modified');
 changes.set('src/main/java/Main.java','modified');f.tree.invalidate();roots=await f.children();assert.equal(discard(),process.platform!=='win32','Saved changes keep the action visible while the editor is dirty');
 document.isDirty=false;f.tree.invalidate();roots=await f.children();assert.equal(discard(),process.platform!=='win32','Saving keeps the action visible');
 assert.ok(!roots.some(n=>n.label==='Save open files before discarding changes'));
 changes=new Map();f.tree.invalidate();await f.children();assert.equal(discard(),false,'Reverting the saved change disables discard');
 f.host.readFileStatus=async()=>{throw Error('status failed');};document.isDirty=true;f.tree.invalidate();roots=await f.children();
 assert.equal(discard(),false);assert.ok(roots.some(n=>n.label==='File change status unavailable'));
});


test('discard blocks outside dirty files and marks a project file opened through a symlink alias',async t=>{
 const f=await fixture(t);let changes=new Map();f.host.readFileStatus=async()=>new Map(changes);
 const alias=f.root+'-alias';await fs.symlink(f.root,alias);t.after(()=>fs.unlink(alias));
 const outside={isDirty:true,uri:{scheme:'file',fsPath:path.join(os.tmpdir(),'outside-project.txt')}};
 const aliasDoc={isDirty:true,uri:{scheme:'file',fsPath:path.join(alias,'src/main/java/Main.java')}};
 f.vscode.workspace.textDocuments=[outside,aliasDoc];let roots=await f.children();
 const discard=()=>f.calls.filter(c=>c[1]==='zero.projectHasDiscardableChanges').at(-1)[2];
 assert.equal(discard(),false);assert.ok(!roots.some(n=>/discard/i.test(n.label)));
 assert.equal(f.item((await f.children(roots[0])).find(n=>n.label==='Main.java')).accessibilityInformation.label,'Main.java, Modified');
 changes.set('src/main/java/Main.java','modified');aliasDoc.isDirty=false;f.documentEvents.onDidSaveTextDocument(aliasDoc);await f.children();assert.equal(discard(),false,'Outside edit remains a blocker');
 outside.isDirty=false;f.documentEvents.onDidChangeTextDocument({document:outside});roots=await f.children();assert.equal(discard(),false);
 assert.ok(!roots.some(n=>n.label==='Save open files before discarding changes'));
});
test('Files removal stays hidden even when helpers report available',async t=>{
 const f=await fixture(t),{parseStudentFileStatus}=require('../src/student-file-status');let checks=0;
 f.host.readFileStatus=async()=>{const changes=parseStudentFileStatus('?? src/main/java/Main.java\0A  src/main/java/Staged.java\0AM src/main/java/Mixed.java\0');Object.defineProperty(changes,'hasCommittedHead',{value:true});return changes;};
 f.host.experimentalUntracked=async()=>{checks++;return true;};f.host.experimentalStaged=async()=>{checks++;return true;};await put(f.root,'src/main/java/Staged.java','staged');await put(f.root,'src/main/java/Mixed.java','mixed');f.tree.invalidate();const roots=await f.children(),files=await f.children(roots[0]);
 for(const file of files.filter(node=>['Main.java','Staged.java','Mixed.java'].includes(node.label))){assert.equal(f.item(file).contextValue,'zeroCodeFile');await assert.rejects(f.tree.commands['zero.explorerRemoveAddedFile'](file),/Select an added/);}
 assert.equal(checks,0);assert.ok(!f.calls.some(call=>call[0]==='zero.removeAddedFile'));
});

test('Files opens untracked text for editing and keeps native diff and Source Control handoffs',{skip:process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
 const net=require('node:net'),{execFileSync}=require('node:child_process');const denied=await new Promise(resolve=>{const server=net.createServer();server.once('error',resolve);server.listen(0,'127.0.0.1',()=>server.close(()=>resolve(null)));});assert.ok(denied&&['EPERM','EACCES'].includes(denied.code));
 const f=await fixture(t),env={...process.env,HOME:f.root,XDG_CONFIG_HOME:f.root,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};const git=(...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','user.name=Zero Test','-c','user.email=zero@example.invalid',...args],{cwd:f.root,env});git('init','-q','--template=');await put(f.root,'.gitattributes','* text=auto\n');git('add','--','.gitattributes','src/main/java/Main.java');git('commit','-qm','initial');await put(f.root,'src/main/java/Main.java','class Changed {}');await put(f.root,'src/main/java/New.txt','new file');
 const {parseStudentFileStatus}=require('../src/student-file-status');let raw=' M src/main/java/Main.java\0?? src/main/java/New.txt\0';f.host.readFileStatus=async()=>parseStudentFileStatus(raw);f.tree.invalidate();const roots=await f.children(),files=await f.children(roots[0]),main=files.find(x=>x.label==='Main.java'),added=files.find(x=>x.label==='New.txt');await f.tree.commands['zero.explorerOpenFile'](main);const diff=f.calls.findLast(c=>c[0]==='vscode.diff');assert.ok(diff,JSON.stringify(f.logs));assert.equal(f.contentProviders.get('zero-files-snapshot').provideTextDocumentContent(diff[1]),'public class Main {}');assert.equal(diff[2].fsPath,path.join(f.root,'src/main/java/Main.java'));let rereads=0;f.host.readFileStatus=async()=>parseStudentFileStatus(++rereads===1?' M src/main/java/Main.java\0':'MM src/main/java/Main.java\0');const initialDiffs=f.calls.filter(c=>c[0]==='vscode.diff').length;await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(rereads,2);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');assert.equal(f.calls.filter(c=>c[0]==='vscode.diff').length,initialDiffs);f.host.readFileStatus=async()=>parseStudentFileStatus(raw);git('add','--','src/main/java/Main.java');await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'public class Main {}');raw='MM src/main/java/Main.java\0?? src/main/java/New.txt\0';const previousDiffs=f.calls.filter(c=>c[0]==='vscode.diff').length;await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');assert.equal(f.calls.filter(c=>c[0]==='vscode.diff').length,previousDiffs);assert.equal(git('show',':src/main/java/Main.java').toString(),'class Changed {}');await f.tree.commands['zero.explorerOpenFile'](added);assert.equal(f.calls.at(-1)[0],'vscode.open');assert.equal(f.calls.at(-1)[1].fsPath,path.join(f.root,'src/main/java/New.txt'));
 git('add','--','src/main/java/New.txt');raw='A  src/main/java/New.txt\0';
 await f.tree.commands['zero.explorerOpenFile'](added);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');
 raw=' M src/main/java/Main.java\0';const aliasDir=await fs.mkdtemp(path.join(os.tmpdir(),'zero-editor-alias-'));t.after(()=>fs.rm(aliasDir,{recursive:true,force:true}));const alias=path.join(aliasDir,'editor-alias.java');await fs.symlink(path.join(f.root,'src/main/java/Main.java'),alias);const doc={isDirty:true,isClosed:false,version:1,uri:{scheme:'file',fsPath:alias},getText:()=> 'class Unsaved {}'};f.vscode.workspace.textDocuments=[doc];await f.tree.commands['zero.explorerOpenFile'](main);const unsaved=f.calls.findLast(c=>c[0]==='vscode.diff');assert.ok(unsaved);assert.equal(unsaved[2].fsPath,doc.uri.fsPath);assert.equal(f.contentProviders.get('zero-files-snapshot').provideTextDocumentContent(unsaved[1]),'public class Main {}');f.vscode.workspace.textDocuments=[];const originalOpen=fs.open;let sawBoundedRead=false;fs.open=async function(name,...args){const handle=await originalOpen.call(this,name,...args);if(name===path.join(f.root,'src/main/java/Main.java')){const originalRead=handle.read.bind(handle);handle.read=async(buffer,offset,length,position)=>{sawBoundedRead=true;if(position===buffer.length-1){buffer[offset]=65;return {bytesRead:1,buffer};}return originalRead(buffer,offset,length,position);};}return handle;};try{await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');assert.equal(sawBoundedRead,true);}finally{fs.open=originalOpen;}raw='M  src/main/java/Main.java\0';await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');raw=' M src/main/java/Main.java\0';const execute=f.vscode.commands.executeCommand;let failedUri;f.vscode.commands.executeCommand=async(...args)=>{if(args[0]==='vscode.diff'){failedUri=args[1];throw Error('injected diff failure');}return execute(...args);};try{await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');assert.equal(f.contentProviders.get('zero-files-snapshot').provideTextDocumentContent(failedUri),'');}finally{f.vscode.commands.executeCommand=execute;}raw='UU src/main/java/Main.java\0';await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');raw=' M src/main/java/Main.java\0';await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),Buffer.from([0,1,2]));await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'class Changed {}');git('config','filter.zero-test.clean','zero-nonexistent-filter');await fs.writeFile(path.join(f.root,'.gitattributes'),'src/main/java/Main.java filter=zero-test\n');await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');assert.ok(f.logs.some(line=>/filter/i.test(line)));
});

test('Files diff supports older Git and refuses partial clones before object reads',{skip:process.platform==='win32'||process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
 const net=require('node:net'),{execFileSync}=require('node:child_process');const denied=await new Promise(resolve=>{const server=net.createServer();server.once('error',resolve);server.listen(0,'127.0.0.1',()=>server.close(()=>resolve(null)));});assert.ok(denied&&['EPERM','EACCES'].includes(denied.code));
 const f=await fixture(t),git=(...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','user.name=Zero Test','-c','user.email=zero@example.invalid',...args],{cwd:f.root,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});git('init','-q','--template=');git('add','--','src/main/java/Main.java');git('commit','-qm','initial');await put(f.root,'src/main/java/Main.java','class Changed {}');
 const bin=await fs.mkdtemp(path.join(os.tmpdir(),'zero-older-git-')),log=path.join(bin,'calls');await fs.writeFile(path.join(bin,'git'),'#!/bin/sh\nprintf "%s|%s\\n" "$GIT_ALLOW_PROTOCOL" "$*" >> "$ZERO_FILES_COMPAT_LOG"\ncase " $* " in *" --no-lazy-fetch "*) exit 90;; esac\nexec /usr/bin/git "$@"\n',{mode:0o755});const oldPath=process.env.PATH,oldLog=process.env.ZERO_FILES_COMPAT_LOG;process.env.PATH=bin+path.delimiter+oldPath;process.env.ZERO_FILES_COMPAT_LOG=log;t.after(()=>{process.env.PATH=oldPath;if(oldLog===undefined)delete process.env.ZERO_FILES_COMPAT_LOG;else process.env.ZERO_FILES_COMPAT_LOG=oldLog;});
 const {parseStudentFileStatus}=require('../src/student-file-status');f.host.readFileStatus=async()=>parseStudentFileStatus(' M src/main/java/Main.java\0');f.tree.invalidate();const roots=await f.children(),main=(await f.children(roots[0])).find(n=>n.label==='Main.java');await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'vscode.diff');let trace=await fs.readFile(log,'utf8');assert.doesNotMatch(trace,/--no-lazy-fetch/);assert.ok(trace.split('\n').filter(Boolean).every(line=>line.startsWith('|')),'Git child has no allowed transports');
 git('config','remote.origin.promisor','true');await fs.writeFile(log,'');await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');trace=await fs.readFile(log,'utf8');assert.doesNotMatch(trace,/\b(?:cat-file|ls-tree)\b/,'Promisor configuration is rejected before object reads');
});

test('closed comparison snapshots free capacity for later diffs',{skip:process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
 const net=require('node:net'),{execFileSync}=require('node:child_process');const denied=await new Promise(resolve=>{const server=net.createServer();server.once('error',resolve);server.listen(0,'127.0.0.1',()=>server.close(()=>resolve(null)));});assert.ok(denied&&['EPERM','EACCES'].includes(denied.code));const f=await fixture(t),env={...process.env,HOME:f.root,XDG_CONFIG_HOME:f.root,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};const git=(...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','user.name=Zero Test','-c','user.email=zero@example.invalid',...args],{cwd:f.root,env});git('init','-q','--template=');git('add','--','src/main/java/Main.java');git('commit','-qm','initial');await put(f.root,'src/main/java/Main.java','class Changed {}');const {parseStudentFileStatus}=require('../src/student-file-status');f.host.readFileStatus=async()=>parseStudentFileStatus(' M src/main/java/Main.java\0');f.tree.invalidate();let roots=await f.children(),main=(await f.children(roots[0])).find(x=>x.label==='Main.java');for(let i=0;i<40;i++){await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'vscode.diff');}await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');const first=f.calls.find(c=>c[0]==='vscode.diff')[1];f.documentEvents.onDidCloseTextDocument({uri:first});roots=await f.children();main=(await f.children(roots[0])).find(x=>x.label==='Main.java');await f.tree.commands['zero.explorerOpenFile'](main);assert.equal(f.calls.at(-1)[0],'vscode.diff');
});

test('deleted file click opens Source Control and rejects stale status',async t=>{
 const f=await fixture(t),{parseStudentFileStatus}=require('../src/student-file-status');let raw=' D src/main/java/Gone.java\0';f.host.readFileStatus=async()=>parseStudentFileStatus(raw);f.tree.invalidate();const roots=await f.children(),gone=(await f.children(roots[0])).find(node=>node.label==='Gone.java');assert.equal(f.item(gone).command.command,'zero.explorerOpenFile');assert.match(f.item(gone).tooltip,/Source Control/);await f.tree.commands['zero.explorerOpenFile'](gone);assert.equal(f.calls.at(-1)[0],'workbench.view.scm');await assert.rejects(fs.lstat(path.join(f.root,'src/main/java/Gone.java')),{code:'ENOENT'});raw=' M src/main/java/Gone.java\0';const count=f.calls.length;await assert.rejects(f.tree.commands['zero.explorerOpenFile'](gone),/view changed/i);assert.equal(f.calls.length,count);await assert.rejects(fs.lstat(path.join(f.root,'src/main/java/Gone.java')),{code:'ENOENT'});
});
test('delayed staged and deleted status cannot open Source Control for a stale tree',async t=>{
 for(const [code,name] of [['M ','Main.java'],[' D','Gone.java']])await t.test(code,async t=>{
  const f=await fixture(t),{parseStudentFileStatus}=require('../src/student-file-status');let pause=false,entered,release;const started=new Promise(resolve=>{entered=resolve;}),waiting=new Promise(resolve=>{release=resolve;});
  f.host.readFileStatus=async()=>{if(pause){entered();await waiting;}return parseStudentFileStatus(`${code} src/main/java/${name}\0`);};f.tree.invalidate();const roots=await f.children(),file=(await f.children(roots[0])).find(node=>node.label===name);pause=true;const opening=f.tree.commands['zero.explorerOpenFile'](file);await started;f.tree.invalidate();release();await assert.rejects(opening,/view changed/i);assert.ok(!f.calls.some(call=>call[0]==='workbench.view.scm'));
 });
});
