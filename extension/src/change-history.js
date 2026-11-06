'use strict';
// Read-only history. All Git inputs used by a webview are selected from server-side
// arrays, never accepted as paths, object names or commands from the webview.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
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
  const {stdout} = await exec('git',['--no-pager',...args],{cwd:root,encoding:'buffer',timeout:10000,maxBuffer:MAX_OUTPUT,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'}});
  return stdout;
}
const decode = bytes => new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const line = bytes => decode(bytes).trim();
function marker(message, parents, tree, secondTree) {
  const match = /^Zero: finish ([^\r\n]+)\n\nZero-Finished-Change: 1\nZero-Change-Branch: ([^\r\n]+)\n?$/.exec(message);
  if (!match || match[1] !== match[2] || parents.length !== 2 || tree !== secondTree) return null;
  const branch=match[1];
  if (branch === 'main' || branch.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(branch) || /(?:\.\.|\/\/|@\{|\.lock(?:\/|$)|(?:^|\/)\.|[./]$)/.test(branch)) return null;
  return branch;
}
function createChangeHistory(vscode,{project,output,onUndo}, options={}) {
  const run=options.git||git, snapshots=new Map(); let panel, disposed=false, generation=0;
  const provider=vscode.workspace.registerTextDocumentContentProvider('zero-change-history',{provideTextDocumentContent:uri=>snapshots.get(uri.toString())??''});
  async function context() {
    if(disposed || vscode.workspace.isTrusted===false) throw new Error('Trust the project before opening history.');
    const root=await project(), real=await fs.realpath(root), folders=vscode.workspace.workspaceFolders||[];
    if(root!==real || folders.length!==1 || folders[0].uri.scheme!=='file' || await fs.realpath(folders[0].uri.fsPath)!==root) throw new Error('Open one standalone project to review changes.');
    const dir=await fs.lstat(path.join(root,'.git'));
    if(!dir.isDirectory()||dir.isSymbolicLink())throw new Error('History needs a standalone Git repository.');
    if(await fs.realpath(line(await run(root,['rev-parse','--show-toplevel'])))!==root || await fs.realpath(path.resolve(root,line(await run(root,['rev-parse','--git-dir']))))!==path.join(root,'.git')) throw new Error('History needs this project’s own Git repository.');
    const partial=await run(root,['config','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']).catch(e=>{if(e.code===1)return Buffer.alloc(0);throw e;});
    if(partial.length)throw new Error('History requires complete local Git objects.');
    const head=line(await run(root,['rev-parse','--verify','HEAD^{commit}'])); if(!oid(head))throw new Error('No saved commits found.');
    const branch=line(await run(root,['symbolic-ref','-q','HEAD']).catch(e=>{if(e.code===1)return Buffer.from('detached');throw e;}));
    const main=line(await run(root,['rev-parse','--verify','refs/heads/main^{commit}']).catch(e=>{if(e.code===128)return Buffer.alloc(0);throw e;}));
    if(main && !oid(main))throw new Error('Could not read local main history.');
    return {root,head,branch,main};
  }
  async function check(base) {const now=await context();if(now.root!==base.root||now.head!==base.head||now.branch!==base.branch||now.main!==base.main)throw new Error('Project or branch changed. Open the review again.');}
  async function loadHistory(base) {
    const ids=line(await run(base.root,['rev-list','--topo-order',`--max-count=${MAX_ENTRIES+1}`,base.head,...(base.main && base.main!==base.head?[base.main]:[])])).split('\n').filter(Boolean);
    if(ids.some(id=>!oid(id)))throw new Error('Could not read history.');
    const entries=[];
    for(const id of ids.slice(0,MAX_ENTRIES)) {
      const raw=decode(await run(base.root,['cat-file','commit',id])); const split=raw.indexOf('\n\n'); if(split<0)throw new Error('Invalid Git commit.');
      const header=raw.slice(0,split), message=raw.slice(split+2), tree=/^tree ([a-f0-9]{40,64})$/m.exec(header)?.[1], parents=[...header.matchAll(/^parent ([a-f0-9]{40,64})$/gm)].map(m=>m[1]);
      if(!tree || parents.some(p=>!oid(p)))throw new Error('Invalid Git commit.');
      let secondTree=''; if(parents.length===2)secondTree=line(await run(base.root,['rev-parse',`${parents[1]}^{tree}`]));
      const branch=marker(message,parents,tree,secondTree);
      entries.push({id,parent:parents[0],label:branch?`Finished change: ${branch}`:`Commit: ${clean(message.split('\n')[0]||'(no message)')}`,branch});
    }
    return {entries,more:ids.length>MAX_ENTRIES};
  }
  async function filesFor(base,entry) {
    const args=entry.parent?['diff-tree','--no-commit-id','--name-status','-z','--no-renames','-r',entry.parent,entry.id]:['diff-tree','--root','--no-commit-id','--name-status','-z','--no-renames','-r',entry.id];
    const parts=decode(await run(base.root,args)).split('\0'); if(parts.at(-1)==='')parts.pop();
    if(parts.length%2)throw new Error('Could not read changed files.');
    const files=[];for(let i=0;i<parts.length;i+=2){if(!/^[AMD T]$/.test(parts[i]))throw new Error('Unsupported file change.');files.push({status:parts[i],name:parts[i+1]});}
    return {files:files.slice(0,MAX_FILES),more:files.length>MAX_FILES};
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
  async function historyDiff(base,entry,file) {
    if(!safeName(file.name))throw new Error('This filename cannot be safely compared here.');
    await check(base);const before=await blob(base.root,entry.parent,file.name),after=await blob(base.root,entry.id,file.name);await check(base);
    if(snapshots.size>=80)throw new Error('Close and reopen history to compare more files.');
    await vscode.commands.executeCommand('vscode.diff',uri(before),uri(after),`${clean(file.name)} · ${entry.id.slice(0,8)}`,{preview:true});
  }
  async function reviewFiles(base) {
    const raw=decode(await run(base.root,['status','--porcelain=v1','-z','--untracked-files=all','--no-renames']));
    const records=raw.split('\0').filter(Boolean), files=[];
    for(const record of records) {if(record.length<4||record[2]!==' ')throw new Error('Could not read project changes.');files.push({status:record.slice(0,2),name:record.slice(3)});}
    for(const doc of vscode.workspace.textDocuments||[]) {
      if(!doc.isDirty||doc.uri?.scheme!=='file')continue;
      const name=path.relative(base.root,doc.uri.fsPath).split(path.sep).join('/');
      if(!safeName(name))continue;
      const existing=files.find(file=>file.name===name);if(existing){existing.status+=' · unsaved';existing.document=doc;existing.version=doc.version;}else files.push({status:'unsaved',name,document:doc,version:doc.version});
    }
    return {files:files.slice(0,MAX_FILES),more:files.length>MAX_FILES};
  }
  async function reviewDiff(base,file) {
    if(!safeName(file.name)||(!file.status.startsWith('unsaved') && file.status[0]!==' ')||file.status.startsWith('??')||file.status.includes('D')||file.status.includes('U')||file.status.startsWith('AA'))throw new Error('Use Source Control to inspect this change.');
    await check(base);const current=await reviewFiles(base);if(!current.files.some(f=>f.name===file.name&&f.status===file.status&&f.document===file.document&&f.version===file.version))throw new Error('Changes have moved. Open the review again.');
    const tracked=decode(await run(base.root,['ls-files','-z','--',file.name]));if(tracked!==`${file.name}\0`)throw new Error('Use Source Control to inspect this untracked file.');
    const filename=path.join(base.root,...file.name.split('/'));let cursor=base.root;
    for(const part of file.name.split('/')){cursor=path.join(cursor,part);const stat=await fs.lstat(cursor);if(stat.isSymbolicLink())throw new Error('Symbolic links cannot be compared here.');}
    const stat=await fs.lstat(filename);if(!stat.isFile()||stat.size>MAX_BLOB)throw new Error('This file cannot be compared here.');
    const old=await blob(base.root,base.head,file.name);await check(base);
    if(snapshots.size>=80)throw new Error('Close and reopen history to compare more files.');
    if(file.document && (file.document.isClosed || !file.document.isDirty || file.document.version!==file.version || !(vscode.workspace.textDocuments||[]).includes(file.document)))throw new Error('The unsaved document changed. Open the review again.');
    await vscode.commands.executeCommand('vscode.diff',uri(old),vscode.Uri.file(filename),`${clean(file.name)} · saved ↔ working`,{preview:true});
  }
  async function open(mode) {
    const serial=++generation,base=await context();let entries=[],files=[],selected,more=false;
    if(mode==='history')({entries,more}=await loadHistory(base));else ({files,more}=await reviewFiles(base));
    await check(base);if(disposed||serial!==generation)return;
    panel?.dispose();snapshots.clear();
    const nonce=crypto.randomBytes(16).toString('hex');
    panel=vscode.window.createWebviewPanel('zero.changeHistory',mode==='history'?'Change history':'Review changes',vscode.ViewColumn.One,{enableScripts:true,localResourceRoots:[]});const currentPanel=panel;
    const render=(note='')=>{const items=mode==='history'&&!selected?entries:files;const buttons=items.map((item,i)=>`<li><button data-index="${i}">${esc(clean(item.label||fileLabel(item)))}</button></li>`).join('');currentPanel.webview.html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px}button{color:var(--vscode-textLink-foreground);background:none;border:0;text-align:left;padding:8px;cursor:pointer;font:inherit}button:focus-visible{outline:1px solid var(--vscode-focusBorder)}li{border-bottom:1px solid var(--vscode-panel-border)}ul{list-style:none;padding:0}p{color:var(--vscode-descriptionForeground)}</style></head><body><h1>${mode==='history'?'Change history':'Review changes'}</h1>${selected?'<button id="back">← All commits</button>':''}${selected?.branch && onUndo ? '<button id="undo">Undo change…</button>' : ''}<p>${esc(note || (mode==='review'?'Select a tracked text file to compare it with the last commit. Staged, untracked, deleted and conflicted files are listed but require Source Control.':'Local main and the current branch are shown. Select a commit to see its files.'))}</p><ul>${buttons||'<li>No items to show.</li>'}</ul><script nonce="${nonce}">const api=acquireVsCodeApi();document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;api.postMessage(b.id==='back'?{type:'back'}:b.id==='undo'?{type:'undo'}:{type:'select',index:Number(b.dataset.index)});});</script></body></html>`;};
    currentPanel.webview.onDidReceiveMessage(async msg=>{try{if(disposed||panel!==currentPanel||serial!==generation||!msg||typeof msg!=='object')return;if(msg.type==='back'&&mode==='history'){selected=undefined;files=[];render();return;}if(msg.type==='undo'&&mode==='history'&&selected?.branch&&onUndo){await check(base);await onUndo(selected.id);return;}if(msg.type!=='select'||!Number.isInteger(msg.index)||msg.index<0)return;if(mode==='history'&&!selected){const entry=entries[msg.index];if(!entry)return;await check(base);const result=await filesFor(base,entry);await check(base);if(panel!==currentPanel||serial!==generation)return;selected=entry;files=result.files;render(result.more?'First 200 files shown.':'');}else {const file=files[msg.index];if(!file)return;if(mode==='history')await historyDiff(base,selected,file);else await reviewDiff(base,file);}}catch(error){output?.appendLine(error.message);void vscode.window.showErrorMessage(`Zero: ${error.message}`);}});
    currentPanel.onDidDispose(()=>{if(panel===currentPanel){panel=undefined;snapshots.clear();}});render(more ? (mode==='history'?'First 60 commits shown.':'First 200 files shown.') : '');
  }
  return {openHistory:()=>open('history'),openReview:()=>open('review'),dispose(){disposed=true;generation++;panel?.dispose();snapshots.clear();provider.dispose();}};
}
module.exports={createChangeHistory,marker};
