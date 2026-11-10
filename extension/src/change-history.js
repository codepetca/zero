'use strict';
// Read-only history. All Git inputs used by a webview are selected from server-side
// arrays, never accepted as paths, object names or commands from the webview.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseFinishedMessage}=require('./finished-change-marker');
const {inspectGitLayout}=require('./core');
const {refuseFilters}=require('./git-filter-guard');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const MAX_OUTPUT = 1024 * 1024, MAX_BLOB = 512 * 1024, MAX_ENTRIES = 60, MAX_FILES = 200;
const oid = value => /^[a-f0-9]{40,64}$/.test(value);
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = value => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g,'�');
function fileLabel(file) {
  const status=file.status;
  const code=status.slice(0,2);
  const conflicted=['DD','AU','UD','UA','DU','AA','UU'].includes(code);
  const kind=status.startsWith('??')?'New file':conflicted?'Conflict':status.includes('D')?'Deleted':status === 'unsaved'?'Unsaved':status.includes('A')?'Added':'Changed';
  return `${file.name} · ${kind}${status.includes(' · unsaved')?' · unsaved':''}`;
}
async function git(root,args) {
  const {stdout} = await exec('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd:root,encoding:'buffer',timeout:10000,maxBuffer:MAX_OUTPUT,env:{...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'}});
  return stdout;
}
const decode = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const line = bytes => decode(bytes).trim();
function marker(message, parents, tree, secondTree) {
  return parents.length===2&&tree===secondTree?parseFinishedMessage(message):null;
}
function createChangeHistory(vscode,{project,output,onUndo,onRestore}, options={}) {
  const run=options.git||git, snapshots=new Map(); let panel, disposed=false, generation=0;
  const provider=vscode.workspace.registerTextDocumentContentProvider('zero-change-history',{provideTextDocumentContent:uri=>snapshots.get(uri.toString())??''});
  async function context() {
    if(disposed || vscode.workspace.isTrusted===false) throw new Error('Trust the project before opening history.');
    const root=await project(), real=await fs.realpath(root), folders=vscode.workspace.workspaceFolders||[];
    if(root!==real || folders.length!==1 || folders[0].uri.scheme!=='file' || await fs.realpath(folders[0].uri.fsPath)!==root) throw new Error('Open one standalone project to review changes.');
    // Validate reciprocal worktree metadata and retain its stable identity across
    // every page and comparison. Git's shared graph lives in commonDir; HEAD
    // and index remain private to gitDir.
    const layout=await inspectGitLayout(root,async (directory,args)=>line(await run(directory,args)));
    for(const dir of new Set([layout.gitDir,layout.commonDir])) {
      for(const name of ['shallow','info/grafts']) {
        try { await fs.lstat(path.join(dir,name)); throw new Error('History requires complete, ungrafted Git history.'); }
        catch(error) { if(error.code!=='ENOENT')throw error; }
      }
    }
    if(line(await run(root,['rev-parse','--is-shallow-repository']))!=='false')throw new Error('History requires complete, ungrafted Git history.');
    const partial=await run(root,['config','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']).catch(e=>{if(e.code===1)return Buffer.alloc(0);throw e;});
    if(partial.length)throw new Error('History requires complete local Git objects.');
    const head=line(await run(root,['rev-parse','--verify','HEAD^{commit}'])); if(!oid(head))throw new Error('No saved commits found.');
    const branch=line(await run(root,['symbolic-ref','-q','HEAD']).catch(e=>{if(e.code===1)return Buffer.from('detached');throw e;}));
    return {root,head,branch,layout:layout.identity};
  }
  async function check(base) {const now=await context();if(now.root!==base.root||now.head!==base.head||now.branch!==base.branch||now.layout!==base.layout)throw new Error('Project or branch changed. Open the review again.');}
  async function loadHistory(base,{limit=MAX_ENTRIES,offset=0}={}) {
    const ids=line(await run(base.root,['rev-list','--first-parent','--topo-order',`--max-count=${limit+1}`,`--skip=${offset}`,base.head])).split('\n').filter(Boolean);
    if(ids.some(id=>!oid(id)))throw new Error('Could not read history.');
    const entries=[];
    for(const id of ids.slice(0,limit)) {
      const raw=decode(await run(base.root,['cat-file','commit',id])); const split=raw.indexOf('\n\n'); if(split<0)throw new Error('Invalid Git commit.');
      const header=raw.slice(0,split), message=raw.slice(split+2), tree=/^tree ([a-f0-9]{40,64})$/m.exec(header)?.[1], parents=[...header.matchAll(/^parent ([a-f0-9]{40,64})$/gm)].map(m=>m[1]);
      if(!tree || parents.some(p=>!oid(p)))throw new Error('Invalid Git commit.');
      let secondTree=''; if(parents.length===2)secondTree=line(await run(base.root,['rev-parse',`${parents[1]}^{tree}`]));
      let branch=marker(message,parents,tree,secondTree);
      if(branch)try {await run(base.root,['merge-base','--is-ancestor',parents[0],parents[1]]);}
      catch(error){if(error.code!==1)throw error;branch=null;}
      entries.push({id,parent:parents[0],label:branch?`Merge: ${branch}`:`Commit: ${clean(message.split('\n')[0]||'(no message)')}`,branch});
    }
    return {entries,more:ids.length>limit};
  }
  async function canUndo(base,entry) {
    if(!entry.branch)return false;
    try {await run(base.root,['merge-base','--is-ancestor',entry.id,base.head]);return true;}
    catch(error) {if(error.code===1)return false;throw error;}
  }
  async function filesFor(base,entry) {
    const args=entry.parent?['diff-tree','--no-commit-id','--name-status','-z','--no-renames','-r',entry.parent,entry.id]:['diff-tree','--root','--no-commit-id','--name-status','-z','--no-renames','-r',entry.id];
    const parts=decode(await run(base.root,args)).split('\0'); if(parts.at(-1)==='')parts.pop();
    if(parts.length%2)throw new Error('Could not read changed files.');
    const files=[];for(let i=0;i<parts.length;i+=2){if(!/^[AMD T]$/.test(parts[i]))throw new Error('Unsupported file change.');files.push({status:parts[i],name:parts[i+1]});}
    return {files,more:files.length>MAX_FILES};
  }
  async function blob(root,commit,name) {
    if(!commit)return '';
    const data=await run(root,['ls-tree','-z',commit,'--',name]); if(!data.length)return '';
    const s=decode(data), m=/^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)\0$/.exec(s);
    if(!m||m[3]!==name)throw new Error('This file is not a regular text file.');
    const size=line(await run(root,['cat-file','-s',m[2]]));if(!/^\d+$/.test(size)||Number(size)>MAX_BLOB)throw new Error('This file is too large to compare here.');
    const bytes=await run(root,['cat-file','blob',m[2]]);if(bytes.includes(0))throw new Error('Binary files cannot be compared here.');return decode(bytes);
  }
  function safeName(name) {return !!name&&!name.startsWith('-')&&!name.startsWith('/')&&!name.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\x00-\x1f\x7f\\]/.test(name);}
  function uri(content) {const u=vscode.Uri.parse(`zero-change-history:/${crypto.randomUUID()}/file`);snapshots.set(u.toString(),content);return u;}
  async function historyDiff(base,entry,file,live) {
    if(!safeName(file.name))throw new Error('This filename cannot be safely compared here.');
    await check(base);const before=await blob(base.root,entry.parent,file.name),after=await blob(base.root,entry.id,file.name);await check(base);
    if(snapshots.size>78)throw new Error('Close and reopen history to compare more files.');
    if(!live())return;
    await vscode.commands.executeCommand('vscode.diff',uri(before),uri(after),`${clean(file.name)} · ${entry.id.slice(0,8)}`,{preview:true});
  }
  // Match the Commit guard's canonical target and parent/name checks, so a
  // dirty buffer opened through an alias cannot be mistaken for saved bytes.
  async function dirtyReviewName(root,document) {
    const canonical=async value=>{
      let current=path.resolve(value),suffix=[];
      while(true)try{return path.join(await fs.realpath(current),...suffix);}
      catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(current);if(parent===current)throw error;suffix.unshift(path.basename(current));current=parent;}
    };
    const filename=document.uri?.fsPath;if(!filename)return undefined;
    let targets;
    try {targets=[await canonical(filename),path.join(await canonical(path.dirname(filename)),path.basename(filename))];}
    catch {throw new Error('An open editor path cannot be verified. Use Source Control to review changes.');}
    const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
    const names=new Map();
    for(const target of targets) {
      const relative=path.relative(normalize(root),normalize(target));
      if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))continue;
      const name=path.relative(root,target).split(path.sep).join('/');
      if(!safeName(name))throw new Error('An open editor path cannot be reviewed safely. Use Source Control.');
      names.set(normalize(name),name);
    }
    if(names.size>1)throw new Error('An open editor maps to multiple project paths. Use Source Control to review changes.');
    return [...names.values()][0];
  }
  async function reviewFiles(base) {
    // Status can run clean/process filters even though this view is read-only.
    // Match the Files tree's active-filter guard before asking Git for status;
    // inactive global drivers (for example Git LFS) need not block ordinary files.
    try {await refuseFilters(base.root,async (root,args)=>{const text=decode(await run(root,args));if(args.includes('-z')&&text&&!text.endsWith('\0'))throw new Error('Could not safely inspect Git filters. Use Source Control.');return text;});}
    catch(error) {if(/Git filters require native Source Control/.test(error.message))throw new Error('Review is unavailable with active Git filters. Use Source Control.');throw error;}
    const raw=decode(await run(base.root,['status','--porcelain=v1','-z','--untracked-files=all','--no-renames']));
    const records=raw.split('\0').filter(Boolean), files=[];
    for(const record of records) {if(record.length<4||record[2]!==' ')throw new Error('Could not read project changes.');files.push({status:record.slice(0,2),name:record.slice(3)});}
    const dirtyNames=new Set();
    for(const doc of vscode.workspace.textDocuments||[]) {
      if(!doc.isDirty||doc.uri?.scheme!=='file')continue;
      const name=await dirtyReviewName(base.root,doc);if(!name)continue;
      const identity=process.platform==='win32'?name.toLowerCase():name;
      if(dirtyNames.has(identity))throw new Error('Multiple unsaved editors refer to the same project file. Use Source Control to review changes.');
      dirtyNames.add(identity);
      const existing=files.find(file=>(process.platform==='win32'?file.name.toLowerCase():file.name)===identity);
      if(existing){existing.status+=' · unsaved';existing.document=doc;existing.version=doc.version;}else files.push({status:'unsaved',name,document:doc,version:doc.version});
    }
    return {files,more:files.length>MAX_FILES};
  }
  async function reviewDiff(base,file,live) {
    if(!safeName(file.name))throw new Error('Use Source Control to inspect this change.');
    const native=!file.status.startsWith('unsaved')&&file.status[0]!==' '||file.status.startsWith('??')||file.status.includes('D')||file.status.includes('U')||file.status.startsWith('AA');
    await check(base);const changes=await reviewFiles(base);if(!changes.files.some(f=>f.name===file.name&&f.status===file.status&&f.document===file.document&&f.version===file.version))throw new Error('Changes have moved. Open the review again.');
    if(native){await check(base);if(live())await vscode.commands.executeCommand('workbench.view.scm');return;}
    const tracked=decode(await run(base.root,['ls-files','-z','--',file.name]));if(tracked!==`${file.name}\0`)throw new Error('Use Source Control to inspect this untracked file.');
    const filename=path.join(base.root,...file.name.split('/'));let cursor=base.root;
    const parents=[];
    for(const part of file.name.split('/').slice(0,-1)) {
      cursor=path.join(cursor,part);const stat=await fs.lstat(cursor);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Symbolic links cannot be compared here.');
      parents.push({name:cursor,stat});
    }
    const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
    const stat=await fs.lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BLOB)throw new Error('This file cannot be compared here.');
    const old=await blob(base.root,base.head,file.name);
    let current;
    if(file.document) {
      const doc=file.document;
      if(doc.isClosed||!doc.isDirty||doc.version!==file.version||!(vscode.workspace.textDocuments||[]).includes(doc))throw new Error('The unsaved document changed. Open the review again.');
      current=doc.getText();
      if(typeof current!=='string'||Buffer.byteLength(current,'utf8')>MAX_BLOB||current.includes('\0'))throw new Error('This file cannot be compared here.');
    } else {
      const handle=await fs.open(filename,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));
      try {
        const opened=await handle.stat();
        if(!opened.isFile()||!same(stat,opened)||opened.size!==stat.size||opened.size>MAX_BLOB)throw new Error('The file changed. Open the review again.');
        const bytes=Buffer.alloc(opened.size+1);let length=0;
        while(length<bytes.length){const result=await handle.read(bytes,length,bytes.length-length,length);if(!result.bytesRead)break;length+=result.bytesRead;}
        const after=await handle.stat();
        if(length!==opened.size||!same(opened,after)||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)throw new Error('The file changed. Open the review again.');
        if(bytes.subarray(0,length).includes(0))throw new Error('Binary files cannot be compared here.');
        current=decode(bytes.subarray(0,length));
      } finally {await handle.close();}
      const after=await fs.lstat(filename);
      if(!same(stat,after)||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)throw new Error('The file changed. Open the review again.');
      for(const parent of parents){const after=await fs.lstat(parent.name);if(!after.isDirectory()||after.isSymbolicLink()||!same(parent.stat,after))throw new Error('The file changed. Open the review again.');}
    }
    await check(base);
    if(snapshots.size>78)throw new Error('Close and reopen history to compare more files.');
    if(file.document && (file.document.isClosed || !file.document.isDirty || file.document.version!==file.version || !(vscode.workspace.textDocuments||[]).includes(file.document)))throw new Error('The unsaved document changed. Open the review again.');
    const finalChanges=await reviewFiles(base);
    if(!finalChanges.files.some(f=>f.name===file.name&&f.status===file.status&&f.document===file.document&&f.version===file.version))throw new Error('Changes or editor paths have moved. Open the review again.');
    await check(base);
    if(file.document && (file.document.isClosed || !file.document.isDirty || file.document.version!==file.version || !(vscode.workspace.textDocuments||[]).includes(file.document)))throw new Error('The unsaved document changed. Open the review again.');
    if(file.document && await dirtyReviewName(base.root,file.document)!==file.name)throw new Error('The editor path changed. Open the review again.');
    if(file.document && (file.document.isClosed || !file.document.isDirty || file.document.version!==file.version || !(vscode.workspace.textDocuments||[]).includes(file.document)))throw new Error('The unsaved document changed. Open the review again.');
    if(!live())return;
    await vscode.commands.executeCommand('vscode.diff',uri(old),uri(current),`${clean(file.name)} · saved ↔ working`,{preview:true});
  }
  async function open(mode) {
    const serial=++generation,base=await context();let entries=[],files=[],selected,selectedUndoEligible=false,undoEligibilityUnknown=false,more=false,selectionVersion=0,comparisonVersion=0,page=0,filePage=0,selectedIndex=0;
    if(mode==='history')({entries,more}=await loadHistory(base));else ({files,more}=await reviewFiles(base));
    await check(base);if(disposed||serial!==generation)return;
    panel?.dispose();snapshots.clear();
    const nonce=crypto.randomBytes(16).toString('hex');
    const branchLabel=clean(base.branch==='detached'?'Detached HEAD':base.branch.replace(/^refs\/heads\//,''));
    const title=mode==='history'?`Change history · ${branchLabel}`:'Review changes';
    panel=vscode.window.createWebviewPanel('zero.changeHistory',title,vscode.ViewColumn.One,{enableScripts:true,localResourceRoots:[]});const currentPanel=panel;let renderToken;
    // Each page is fetched independently from the checked graph, so memory and
    // Git output stay bounded even for a long-lived project.
    const render=(note='',focus='')=>{
      renderToken=crypto.randomBytes(16).toString('hex');
      const listingHistory=mode==='history'&&!selected, offset=listingHistory?0:filePage*MAX_FILES;
      const heading=listingHistory&&entries.length?`${title} · commits ${page*MAX_ENTRIES+1}–${page*MAX_ENTRIES+entries.length}`:title;
      const items=listingHistory?entries:files.slice(offset,offset+MAX_FILES);
      const buttons=items.map((item,i)=>`<li><button data-index="${i+offset}" id="item-${i+offset}">${esc(clean(item.label||fileLabel(item)))}${mode==='history'&&!selected?` <span>(${esc(item.id.slice(0,12))})</span>`:''}</button></li>`).join('');
      const identity=selected?`<h2 id="selected-commit" tabindex="-1">${esc(clean(selected.label))} <span>(${esc(selected.id)})</span></h2>`:'';
      const pagination=listingHistory?`<nav aria-label="History pages">${page?'<button id="previous">Newer commits</button>':''}${more?'<button id="next">Older commits</button>':''}</nav>`:files.length>MAX_FILES?`<nav aria-label="Changed file pages"><span>Files ${offset+1}–${Math.min(offset+MAX_FILES,files.length)} of ${files.length}</span>${filePage?'<button id="previous-files">Previous files</button>':''}${offset+MAX_FILES<files.length?'<button id="next-files">Next files</button>':''}</nav>`:'';
      currentPanel.webview.html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px;overflow-wrap:anywhere}button{color:var(--vscode-textLink-foreground);background:none;border:0;text-align:left;padding:8px;cursor:pointer;font:inherit}button:focus-visible,h2:focus{outline:1px solid var(--vscode-focusBorder)}li{border-bottom:1px solid var(--vscode-panel-border)}ul{list-style:none;padding:0}p{color:var(--vscode-descriptionForeground)}</style></head><body><h1 id="heading" tabindex="-1">${esc(heading)}</h1>${selected?'<button id="back">← Back to history</button>':''}${identity}${selected?.branch && onUndo && selectedUndoEligible ? '<p>Undo change is temporarily unavailable. Open Source Control to review this change.</p>' : ''}${selected?.branch && onUndo && !selectedUndoEligible ? `<p>${undoEligibilityUnknown?'Undo availability could not be verified. Use Source Control to review this change.':'This change is not in the current branch and cannot be undone here.'}</p>` : ''}${selected && onRestore ? '<p>Restoring a version is temporarily unavailable.</p>' : ''}<p>${esc(note || (mode==='review'?'Select a tracked text file to compare it with the last commit. Selecting a staged, untracked, deleted or conflicted file opens Source Control.':'Select a commit to see its files.'))}</p><ul>${buttons||'<li>No items to show.</li>'}</ul>${pagination}<script nonce="${nonce}">const api=acquireVsCodeApi(),view=${JSON.stringify(renderToken)};document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;api.postMessage(['back','undo','restore','next','previous','next-files','previous-files'].includes(b.id)?{type:b.id,view}:{type:'select',index:Number(b.dataset.index),view});});${focus?`document.getElementById(${JSON.stringify(focus)})?.focus();`:''}</script></body></html>`;
    };
    currentPanel.webview.onDidReceiveMessage(async msg=>{try{
      if(disposed||panel!==currentPanel||serial!==generation||!msg||typeof msg!=='object'||msg.view!==renderToken)return;
      if(msg.type==='back'&&mode==='history'&&selected){selectionVersion++;comparisonVersion++;selected=undefined;selectedUndoEligible=false;undoEligibilityUnknown=false;files=[];filePage=0;render('',`item-${selectedIndex}`);return;}
      if((msg.type==='next'||msg.type==='previous')&&mode==='history'&&!selected){
        if((msg.type==='next'&&!more)||(msg.type==='previous'&&!page))return;
        const version=++selectionVersion, nextPage=page+(msg.type==='next'?1:-1),token=renderToken;
        const live=()=>!disposed&&panel===currentPanel&&serial===generation&&version===selectionVersion&&!selected&&token===renderToken;
        try {
          await check(base);const result=await loadHistory(base,{offset:nextPage*MAX_ENTRIES});await check(base);
          if(!live())return;
          page=nextPage;entries=result.entries;more=result.more;render('', 'heading');
        } catch(error) {if(live())throw error;}
        return;
      }
      if((msg.type==='next-files'||msg.type==='previous-files')&&(mode==='review'||selected)) {
        const nextPage=filePage+(msg.type==='next-files'?1:-1);
        if(nextPage<0||nextPage*MAX_FILES>=files.length)return;
        const version=++selectionVersion,entry=selected,token=renderToken;comparisonVersion++;
        const live=()=>!disposed&&panel===currentPanel&&serial===generation&&version===selectionVersion&&entry===selected&&token===renderToken;
        try {
          await check(base);
          if(mode==='review') {
            const current=await reviewFiles(base);
            if(current.files.length!==files.length||current.files.some((file,i)=>{const prior=files[i];return file.name!==prior.name||file.status!==prior.status||file.document!==prior.document||file.version!==prior.version;}))throw new Error('Changes have moved. Open the review again.');
          }
          await check(base);
          if(!live())return;
          filePage=nextPage;render('',`item-${filePage*MAX_FILES}`);
        } catch(error) {if(live())throw error;}
        return;
      }
      if(msg.type==='undo'&&mode==='history'&&selected?.branch&&selectedUndoEligible&&onUndo){
        const entry=selected,version=selectionVersion,token=renderToken;
        const live=()=>!disposed&&panel===currentPanel&&serial===generation&&version===selectionVersion&&selected===entry&&token===renderToken&&selectedUndoEligible;
        try {await check(base);if(!await canUndo(base,entry))throw new Error('This change is no longer in the current branch. Open history again.');await check(base);if(live())await onUndo(entry.id);}
        catch(error){if(live())throw error;}
        return;
      }
      if(msg.type==='restore'&&mode==='history'&&selected&&onRestore){const entry=selected,version=selectionVersion;await check(base);if(disposed||panel!==currentPanel||serial!==generation||version!==selectionVersion||selected!==entry)return;await onRestore(entry.id);return;}
      if(msg.type!=='select'||!Number.isInteger(msg.index)||msg.index<0)return;
      if(mode==='history'&&!selected){
        const entry=entries[msg.index];if(!entry)return;const version=++selectionVersion,token=renderToken;
        const live=()=>!disposed&&panel===currentPanel&&serial===generation&&version===selectionVersion&&!selected&&token===renderToken;
        try {
          await check(base);const result=await filesFor(base,entry);let eligible=false,unknown=false;
          if(entry.branch&&onUndo)try{eligible=await canUndo(base,entry);}catch{unknown=true;}
          await check(base);if(!live())return;
          selected=entry;selectedUndoEligible=eligible;undoEligibilityUnknown=unknown;selectedIndex=msg.index;files=result.files;filePage=0;render('','selected-commit');
        } catch(error){if(live())throw error;}
      }
      else {if(msg.index<filePage*MAX_FILES||msg.index>=Math.min((filePage+1)*MAX_FILES,files.length))return;const file=files[msg.index];if(!file)return;const entry=selected,token=renderToken,version=selectionVersion,comparison=++comparisonVersion;const live=()=>!disposed&&panel===currentPanel&&serial===generation&&renderToken===token&&selectionVersion===version&&comparisonVersion===comparison&&selected===entry;try{if(mode==='history')await historyDiff(base,entry,file,live);else await reviewDiff(base,file,live);}catch(error){if(live())throw error;}}
    }catch(error){output?.appendLine(error.message);void vscode.window.showErrorMessage(`Zero: ${error.message}`);}});
    currentPanel.onDidDispose(()=>{if(panel===currentPanel){panel=undefined;snapshots.clear();}});render();
  }
  async function recent() {const base=await context(),result=await loadHistory(base,{limit:3});await check(base);return {root:base.root,head:base.head,branch:base.branch,entries:result.entries};}
  return {openHistory:()=>open('history'),openReview:()=>open('review'),recent,dispose(){disposed=true;generation++;panel?.dispose();snapshots.clear();provider.dispose();}};
}
module.exports={createChangeHistory,marker};
