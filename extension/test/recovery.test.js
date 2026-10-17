'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {createRecoveryCommands} = require('../src/recovery');
const execute = promisify(execFile);
async function git(root,args) {return (await execute('git',args,{cwd:root,encoding:'buffer',maxBuffer:1024*1024})).stdout;}
async function harness(t,{defaultGit=false,overrideGit}={}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-recovery-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});
  await fs.writeFile(path.join(root,'zero.json'),'{}');
  const filename=path.join(root,'src/main/java/Main.java');
  const earlier='class Main {\n  // old version  \n}\n\n';
  const current='class Main {\n  // current version\n}\n';
  await git(root,['init','-b','main']);
  await fs.writeFile(filename,earlier);
  await git(root,['add','.']);
  await git(root,['-c','user.name=Recovery Test','-c','user.email=recovery@example.invalid','commit','-m','Earlier version']);
  const earlierCommit=(await git(root,['rev-parse','HEAD'])).toString().trim();
  await fs.writeFile(filename,current);
  await git(root,['add','.']);
  await git(root,['-c','user.name=Recovery Test','-c','user.email=recovery@example.invalid','commit','-m','Current version']);
  const head=(await git(root,['rev-parse','HEAD'])).toString().trim();
  const key=fsPath=>({scheme:'file',fsPath,toString(){return 'file:'+this.fsPath;}});
  const document={uri:key(filename),isDirty:false,isClosed:false,version:1,getText(){return this.content;},content:current,positionAt:n=>({offset:n})};
  let active=root,busy=false,provider,disposed=false,applied=0,confirm='Restore file',applyResult=true;
  const choices=['restore',earlierCommit],calls=[],states=[],logs=[],notices=[],edits=[],gitCalls=[],previews=[];
  const vscode={Uri:{file:key,parse:value=>({scheme:value.split(':')[0],toString:()=>value})},
    Range:class {constructor(start,end){this.start=start;this.end=end;}},
    EndOfLine:{LF:1,CRLF:2}, TextEdit:{replace:(range,content)=>({range,content}),setEndOfLine:newEol=>({newEol})},
    WorkspaceEdit:class {set(uri,edits){this.edits=edits.map(edit=>({uri,...edit}));}},
    workspace:{isTrusted:true,workspaceFolders:[{uri:key(root)}],registerTextDocumentContentProvider(scheme,value){assert.equal(scheme,'zero-recovery');provider=value;return {dispose(){disposed=true;}};},
      async applyEdit(edit){applied++;edits.push(edit);if(applyResult){document.content=edit.edits[0].content;document.isDirty=true;document.version++;}return applyResult;}},
    window:{activeTextEditor:{document},async showQuickPick(items){const choice=choices.shift();if(typeof choice==='function')return choice(items);return items.find(item=>item.action===choice||item.commit===choice);},async showWarningMessage(...args){notices.push(args);return typeof confirm==='function'?confirm():confirm;},async showInformationMessage(...args){notices.push(args);}},
    commands:{async executeCommand(...args){calls.push(args);if(args[0]==='vscode.diff'){previews.push(provider.provideTextDocumentContent(args[1]));}}}};
  const api=createRecoveryCommands(vscode,{project:async()=>active,isBusy:()=>busy,setBusy:value=>{busy=value;},setState:value=>states.push(value),output:{appendLine:value=>logs.push(value)},...(defaultGit ? {} : {git:async(root,args)=>{gitCalls.push(args);return overrideGit ? overrideGit(root,args,git) : git(root,args);}})});
  t.after(()=>api.dispose());
  return {root,filename,earlier,current,head,earlierCommit,vscode,api,document,choices,calls,states,logs,notices,edits,gitCalls,previews,
    run:()=>api.commands['zero.recovery'](),get busy(){return busy;},set busy(v){busy=v;},set active(v){active=v;},get applied(){return applied;},set confirm(v){confirm=v;},set applyResult(v){applyResult=v;},get disposed(){return disposed;}};
}

test('selected local file history restores exact text through one undoable editor edit without saving or changing Git',async t=>{
  const h=await harness(t);
  await h.run();
  assert.equal(h.applied,1);assert.equal(h.edits[0].edits[0].content,h.earlier);assert.equal(h.edits[0].edits[0].uri,h.document.uri);
  assert.equal(h.document.isDirty,true);assert.deepEqual(h.previews,[h.earlier]);assert.equal(h.busy,false);
  assert.equal(await fs.readFile(h.filename,'utf8'),h.current,'Restore stays in the editor until the student saves');
  assert.equal((await git(h.root,['rev-parse','HEAD'])).toString().trim(),h.head);
  assert.equal((await git(h.root,['status','--porcelain'])).toString(),'');
  assert.deepEqual(h.gitCalls.find(args=>args[0]==='cat-file'&&args[1]==='blob').slice(0,2),['cat-file','blob']);
  assert.ok(h.gitCalls.every(args=>['rev-parse','symbolic-ref','ls-files','log','ls-tree','cat-file','config'].includes(args[0])));
  assert.match(h.states.at(-1),/restored.*review and save/);
});

test('cancelling the recovery menu, version picker or restore confirmation preserves disk and editor',async t=>{
  for(const step of ['menu','history','confirmation']) {
    const h=await harness(t);
    if(step==='menu')h.choices.splice(0,2);
    if(step==='history')h.choices.splice(1,1);
    if(step==='confirmation')h.confirm=undefined;
    await h.run();assert.equal(h.applied,0);assert.equal(h.document.content,h.current);assert.equal(h.document.isDirty,false);assert.equal(await fs.readFile(h.filename,'utf8'),h.current);assert.equal(h.busy,false);
  }
});

test('native review and discard handoff never call destructive Git commands or imply a discard succeeded',async t=>{
  for(const action of ['review','discard']) {
    const h=await harness(t);h.choices.splice(0,2,action);await h.run();
    assert.deepEqual(h.calls,[['workbench.view.scm']]);assert.equal(h.applied,0);assert.equal(h.busy,false);
    if(action==='discard'){assert.match(h.notices[0][0],/src\/main\/java\/Main.java.*Discard Changes.*confirm/);assert.match(h.logs[0],/has not changed any files/);assert.doesNotMatch(h.states.at(-1),/discarded/i);}
  }
});

test('discard guidance never holds the busy guard while a nonmodal notification remains open',{timeout:10000},async t=>{
  const h=await harness(t);h.choices.splice(0,2,'discard');let notified=false;
  h.vscode.window.showInformationMessage=()=>{notified=true;return new Promise(()=>{});};
  await h.run();
  assert.equal(notified,true);assert.equal(h.busy,false);assert.equal(h.applied,0);
  assert.deepEqual(h.calls,[['workbench.view.scm']]);
  assert.ok(h.gitCalls.every(args=>['rev-parse','symbolic-ref','ls-files','config'].includes(args[0])),'Guidance never invokes destructive Git');
  assert.match(h.states.at(-1),/Choose this file in Source Control/);assert.match(h.logs[0],/Discard Changes.*has not changed any files/);
});

test('discard notification failures are handled in Output after releasing the busy guard',async t=>{
  const h=await harness(t);h.choices.splice(0,2,'discard');
  h.vscode.window.showInformationMessage=async()=>{throw new Error('Notification unavailable');};
  await h.run();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.busy,false);assert.equal(h.applied,0);assert.deepEqual(h.calls,[['workbench.view.scm']]);
  assert.match(h.logs.at(-1),/Recovery guidance could not open: Notification unavailable/);
  assert.match(h.states.at(-1),/Choose this file in Source Control/);
});

test('unsaved edits block both guided restore and discard with no silent save or overwrite',async t=>{
  for(const action of ['restore','discard']) {
    const h=await harness(t);h.choices.splice(0,2,action);h.document.isDirty=true;h.document.content+='unsaved';
    await assert.rejects(h.run(),/unsaved edits/);assert.equal(h.document.content,h.current+'unsaved');assert.equal(h.applied,0);assert.equal(h.calls.length,0);assert.equal(h.busy,false);
  }
});

test('file, document, current editor, HEAD, branch, index, project and workspace drift stop restoration after preview',async t=>{
  for(const drift of ['disk','replaced','document','editor','head','branch','index','project','workspace','closed']) {
    const h=await harness(t);
    h.confirm=async()=>{
      if(drift==='disk')await fs.writeFile(h.filename,'external change');
      if(drift==='replaced'){await fs.writeFile(h.filename+'.replacement',h.current);await fs.rename(h.filename+'.replacement',h.filename);}
      if(drift==='document'){h.document.content+='new edit';h.document.version++;h.document.isDirty=true;}
      if(drift==='editor')h.vscode.window.activeTextEditor={document:{...h.document}};
      if(drift==='head')await git(h.root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','Concurrent commit']);
      if(drift==='branch')await git(h.root,['checkout','-b','another-branch']);
      if(drift==='index'){await fs.writeFile(h.filename,'staged change');await git(h.root,['add','.']);await fs.writeFile(h.filename,h.current);}
      if(drift==='project')h.active=path.dirname(h.root);
      if(drift==='workspace')h.vscode.workspace.workspaceFolders=[];
      if(drift==='closed')h.document.isClosed=true;
      return 'Restore file';
    };
    await assert.rejects(h.run());assert.equal(h.applied,0,drift);assert.equal(h.busy,false,drift);
  }
});

test('file changes while choosing Recovery or a historical version cannot retarget the operation',async t=>{
  const h=await harness(t);h.choices.splice(0,2,items=>{h.vscode.window.activeTextEditor={document:{...h.document}};return items[2];});
  await assert.rejects(h.run(),/changed/);assert.equal(h.applied,0);
  const other=await harness(t);other.choices.splice(1,1,async items=>{await fs.writeFile(other.filename,'external');return items.at(-1);});
  await assert.rejects(other.run(),/changed/);assert.equal(other.previews.length,0);assert.equal(other.applied,0);
});

test('path, tracked-file, toolkit, binary, oversize and link guards preserve the file',async t=>{
  for(const kind of ['outside','untracked','toolkit','private','binary','oversize','symlink','parent-link','hardlink']) {
    const h=await harness(t);let filename=h.filename;
    if(kind==='outside')filename=path.join(path.dirname(h.root),'outside.java');
    if(kind==='untracked')filename=path.join(h.root,'src/main/java/New.java');
    if(kind==='toolkit')filename=path.join(h.root,'src/main/java/zero/App.java');
    if(kind==='private')filename=path.join(h.root,'src/main/resources/secrets/token.json');
    if(kind==='outside'){h.document.uri=h.vscode.Uri.file(filename);}
    else if(kind==='symlink'){await fs.rename(filename,filename+'.real');await fs.symlink(filename+'.real',filename);}
    else if(kind==='parent-link'){const real=path.join(h.root,'java-real');await fs.rename(path.dirname(filename),real);await fs.symlink(real,path.dirname(filename));}
    else if(kind==='hardlink')await fs.link(filename,filename+'.link');
    else if(kind==='binary')await fs.writeFile(filename,Buffer.from([65,0,66]));
    else if(kind==='oversize')await fs.writeFile(filename,'a'.repeat(512*1024+1));
    else {await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,h.current);h.document.uri=h.vscode.Uri.file(filename);}
    await assert.rejects(h.run(),undefined,kind);assert.equal(h.applied,0,kind);assert.equal(h.busy,false,kind);
  }
});

test('exact standalone repository and workspace are required; review can work without an editor',async t=>{
  for(const kind of ['multiple','parent-repository','untrusted','git-link','workspace-outside']) {
    const h=await harness(t);
    if(kind==='multiple')h.vscode.workspace.workspaceFolders.push(h.vscode.workspace.workspaceFolders[0]);
    if(kind==='untrusted')h.vscode.workspace.isTrusted=false;
    if(kind==='workspace-outside')h.vscode.workspace.workspaceFolders[0].uri=h.vscode.Uri.file(path.dirname(h.root));
    if(kind==='git-link'){await fs.rename(path.join(h.root,'.git'),path.join(h.root,'git-real'));await fs.symlink(path.join(h.root,'git-real'),path.join(h.root,'.git'));}
    if(kind==='parent-repository'){await fs.rm(path.join(h.root,'.git'),{recursive:true});await git(h.root,['init','--separate-git-dir',path.join(h.root,'git-real')]);}
    await assert.rejects(h.run());assert.equal(h.applied,0);assert.equal(h.busy,false);
  }
  const h=await harness(t);h.vscode.window.activeTextEditor=undefined;h.choices.splice(0,2,'review');await h.run();assert.deepEqual(h.calls,[['workbench.view.scm']]);
});

test('failed WorkspaceEdit and missing historical regular files give errors without a success state',async t=>{
  const h=await harness(t);h.applyResult=false;await assert.rejects(h.run(),/could not restore/);assert.equal(h.document.content,h.current);assert.equal(h.states.length,0);assert.equal(h.busy,false);
  const bad=await harness(t);await fs.writeFile(bad.filename,Buffer.from([0]));await git(bad.root,['add','.']);await git(bad.root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','binary']);const binaryCommit=(await git(bad.root,['rev-parse','HEAD'])).toString().trim();await fs.writeFile(bad.filename,bad.current);bad.choices.splice(1,1,binaryCommit);await assert.rejects(bad.run(),/plain UTF-8/);assert.equal(bad.applied,0);
});

test('busy/disposed commands are inert and disposal while choosing history cannot apply',async t=>{
  const h=await harness(t);h.busy=true;await h.run();assert.equal(h.gitCalls.length,0);h.busy=false;h.api.dispose();await h.run();assert.equal(h.gitCalls.length,0);assert.equal(h.disposed,true);
  const active=await harness(t);active.choices.splice(1,1,items=>{active.api.dispose();return items.at(-1);});await assert.rejects(active.run(),/closed/);assert.equal(active.applied,0);assert.equal(active.busy,false);
});


test('historical CRLF line endings are explicitly restored in the same WorkspaceEdit',async t=>{
  const h=await harness(t);const content='class Main {\r\n  // CRLF saved version  \r\n}\r\n';
  await fs.writeFile(h.filename,content);await git(h.root,['add','.']);await git(h.root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','CRLF']);const commit=(await git(h.root,['rev-parse','HEAD'])).toString().trim();await fs.writeFile(h.filename,h.current);h.choices.splice(1,1,commit);
  await h.run();assert.equal(h.edits[0].edits[0].content,content);assert.equal(h.edits[0].edits[1].newEol,h.vscode.EndOfLine.CRLF);assert.equal(h.applied,1);
});

test('partial clones cannot trigger lazy fetching while inspecting recovery history',async t=>{
  const h=await harness(t);await git(h.root,['config','remote.origin.promisor','true']);await assert.rejects(h.run(),/complete local Git history/);assert.equal(h.applied,0);assert.ok(!h.gitCalls.some(args=>['log','cat-file'].includes(args[0])));
});


test('default bounded Git runner preserves exact local blob bytes',async t=>{
  const h=await harness(t,{defaultGit:true});await h.run();assert.equal(h.applied,1);assert.equal(h.edits[0].edits[0].content,h.earlier);assert.equal(await fs.readFile(h.filename,'utf8'),h.current);
});

test('historical symbolic links and oversized Git output cannot become editor text',async t=>{
  const h=await harness(t);await fs.rm(h.filename);await fs.symlink('elsewhere.java',h.filename);await git(h.root,['add','.']);await git(h.root,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','symbolic link']);const commit=(await git(h.root,['rev-parse','HEAD'])).toString().trim();await fs.rm(h.filename);await fs.writeFile(h.filename,h.current);await git(h.root,['add','.']);h.choices.splice(1,1,commit);await assert.rejects(h.run(),/regular file/);assert.equal(h.applied,0);
  const large=await harness(t,{overrideGit:async(root,args,run)=>args[0]==='log'?Buffer.alloc(1024*1024+1,65):run(root,args)});await assert.rejects(large.run(),/history is too large/);assert.equal(large.applied,0);assert.equal(large.busy,false);
});
