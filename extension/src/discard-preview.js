'use strict';
// The review token is opaque and one-use. Applying it requires a retained
// recovery copy, confirmation, and fresh workspace and Git/file checks.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {constants}=require('node:fs');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile),os=require('node:os');
const {readStudentFileStatus}=require('./student-file-status');
const {portableWindowsPath,potentialWindowsShortName,windowsPathsCollide}=require('./windows-path-policy');
const {validatedCompletedDiscard,assertNoUnresolvedFileRestore}=require('./git-retained-recovery');
const {deletedFileSource}=require('./deleted-file-status');
const {modifiedFileSource,committedFileSource}=require('./modified-file-status');
const {addedFileSource}=require('./added-file-status');
const {parseIndexFlags}=require('./index-entry-flags');
const {refuseFilters}=require('./git-filter-guard');
const {readOrdinaryBounded}=require('./unborn-head');
const plans=new WeakMap();
const backups=new WeakMap();
const deletedPlans=new WeakMap();
const deletedBackups=new WeakMap();
const MAX_FILES=1000, MAX_BYTES=64*1024*1024;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const changed=()=>new Error('Project changes moved since review. Review them again; no files were discarded.');
async function syncFile(file) {const h=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));try{const s=await h.stat();if(!s.isFile()||s.nlink!==1)throw changed();await h.sync();}finally{await h.close();}}
async function syncDirectory(dir) {const h=await fs.open(dir,constants.O_RDONLY|(constants.O_NONBLOCK||0)|(constants.O_NOFOLLOW||0)|(constants.O_DIRECTORY||0));try{const s=await h.stat();if(!s.isDirectory())throw changed();await h.sync();}finally{await h.close();}}
async function writeDurable(file,bytes) {const h=await fs.open(file,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}}
async function snapshotFile(root,name,budget,maxFile=MAX_BYTES) {
  let current=root;const parts=name.split('/');
  for(let i=0;i<parts.length;i++) {
    current=path.join(current,parts[i]);let info;
    try {info=await fs.lstat(current);} catch(error) {if(error.code==='ENOENT')return null;throw error;}
    if(info.isSymbolicLink() || (i<parts.length-1?!info.isDirectory():!info.isFile()) || (i===parts.length-1 && info.nlink!==1)) throw new Error('Discard preview cannot safely inspect a link or special file. Use Source Control.');
    if(i!==parts.length-1)continue;
    budget.bytes+=info.size;if(info.size>maxFile||budget.bytes>MAX_BYTES)throw new Error('Changes are too large to preview safely. Use Source Control.');
    const handle=await fs.open(current,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
    try {
      const before=await handle.stat();
      if(!before.isFile()||before.nlink!==1||before.dev!==info.dev||before.ino!==info.ino||before.size!==info.size)throw changed();
      const buffer=Buffer.alloc(before.size+1);let length=0;
      while(length<buffer.length){const next=await handle.read(buffer,length,buffer.length-length,length);if(!next.bytesRead)break;length+=next.bytesRead;}
      const bytes=buffer.subarray(0,length),after=await fs.lstat(current);
      if(bytes.length!==before.size||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw changed();
      return {hash:digest(bytes),size:before.size,mode:before.mode,dev:before.dev,ino:before.ino,mtime:before.mtimeMs};
    } finally {await handle.close();}
  }
}
async function readSnapshot(file,identity) {
  const h=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
  try {const info=await h.stat();if(!info.isFile()||info.nlink!==1||info.dev!==identity.dev||info.ino!==identity.ino||info.size!==identity.size)throw changed();
    const bytes=Buffer.alloc(identity.size+1);let count=0;while(count<bytes.length){const next=await h.read(bytes,count,bytes.length-count,count);if(!next.bytesRead)break;count+=next.bytesRead;}
    const data=bytes.subarray(0,count);if(data.length!==identity.size||digest(data)!==identity.hash)throw changed();return data;
  } finally {await h.close();}
}
async function snapshot(root,{windows=false,ownFileRestore}={}) {
  if(await fs.realpath(root)!==root)throw new Error('Open one ordinary project folder before discarding changes.');
  const dot=path.join(root,'.git'),meta=await fs.lstat(dot);
  if(!meta.isDirectory()||meta.isSymbolicLink())throw new Error('Discard preview needs a standalone student Git project.');
  await assertNoUnresolvedFileRestore(root,{own:ownFileRestore});
  for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG']) {
    try {await fs.lstat(path.join(dot,marker));throw new Error('Finish or cancel the current Git operation in Source Control before discarding changes.');}
    catch(error) {if(error.code!=='ENOENT')throw error;}
  }
  const configFile=await snapshotFile(root,'.git/config',{bytes:0});
  if(!configFile)throw new Error('Discard preview needs ordinary Git configuration.');
  const configEnv=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
  const config=(await exec('git',['config','--local','--no-includes','--name-only','--null','--list'],{cwd:root,env:configEnv,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})).stdout.split('\0').filter(Boolean);
  if(config.some(key=>/^(?:filter\.|include\.|includeif\.)/i.test(key)))throw new Error('Custom Git filters or includes require Source Control for discard.');
  // Git must inspect exactly the project that the filesystem operations will
  // mutate. Reject even an apparently equivalent core.worktree override.
  if(config.some(key=>/^core\.worktree$/i.test(key)))throw new Error('A custom Git worktree requires Source Control for discard.');
  try {await fs.lstat(path.join(dot,'info','grafts'));throw new Error('Git grafts require Source Control for this file operation.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const replacementRefs=(await exec('git',['-c','core.fsmonitor=false','for-each-ref','--format=%(refname)','refs/replace/'],{cwd:root,env:configEnv,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})).stdout;
  if(replacementRefs.trim())throw new Error('Git replacement objects require Source Control for this file operation.');
  const location=async arg=>(await exec('git',['rev-parse',arg],{cwd:root,env:configEnv,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})).stdout;
  const top=await location('--show-toplevel'),gitDir=await location('--absolute-git-dir');
  const sameWindowsLocation=async (reported,expected)=>{
    if(!reported.endsWith('\n')||reported.includes('\0'))return false;
    try {return path.normalize(await fs.realpath(path.resolve(root,reported.slice(0,-1))))===path.normalize(expected);}catch{return false;}
  };
  if(windows ? !(await sameWindowsLocation(top,root))||!(await sameWindowsLocation(gitDir,dot))||!(await sameWindowsLocation(dot+'\n',dot)) : top!==root+'\n'||gitDir!==dot+'\n'||await fs.realpath(dot)!==dot)throw new Error('Discard needs the project Git worktree and metadata in their usual locations. Use Source Control.');
  if((await location('--shared-index-path')).trim())throw new Error('A split Git index requires Source Control for discard.');
  const changes=await readStudentFileStatus(root,{safeConfig:true});
  // Some Git/platform combinations report the stock attributes file as
  // modified solely because its working copy uses CRLF. Preserve those bytes
  // instead of including the file in discard, but only when HEAD and index
  // contain the same exact stock blob.
  if(changes.get('.gitattributes')==='modified') {
    try {
      const info=await snapshotFile(root,'.gitattributes',{bytes:0},4096);if(!info)throw changed();const bytes=await readSnapshot(path.join(root,'.gitattributes'),info);
      const gitLine=async args=>(await exec('git',args,{cwd:root,env:configEnv,encoding:'utf8',timeout:10000,maxBuffer:4096})).stdout.trim();
      const headAttr=await gitLine(['rev-parse','--verify','HEAD:.gitattributes']),indexAttr=await gitLine(['rev-parse','--verify',':.gitattributes']);
      const blob=(await exec('git',['cat-file','blob',indexAttr],{cwd:root,env:configEnv,encoding:'utf8',timeout:10000,maxBuffer:4096})).stdout;
      const stock='* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n';
      if(info&&bytes.length===info.size&&digest(bytes)===info.hash&&bytes.toString('utf8').replace(/\r\n/g,'\n')===stock&&blob===stock&&headAttr===indexAttr)changes.delete('.gitattributes');
    } catch {}
  }
  // Global ignore settings are deliberately excluded from the safe Git
  // environment. Refuse rather than discard anything they would protect.
  const ignoreEnv=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
  const ignored=(await exec('git',['ls-files','--others','--ignored','--exclude-standard','-z'],{cwd:root,env:ignoreEnv,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})).stdout.split('\0').filter(Boolean);
  const overlaps=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
  if([...changes.keys()].some(name=>ignored.some(item=>overlaps(name,item))))throw new Error('A globally ignored file is protected. Use Source Control to review these changes.');
  if(!changes.size)throw new Error('There are no file changes to discard.');
  if(changes.size>MAX_FILES||[...changes.values()].includes('conflict'))throw new Error('Finish or cancel the current conflict in Source Control before discarding changes.');
  for(const name of ['index','HEAD']) {const info=await fs.lstat(path.join(dot,name));if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024)throw new Error('Unsupported Git metadata. Use Source Control.');}
  const index=(await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024)).data;const head=(await readOrdinaryBounded(path.join(dot,'HEAD'),4*1024*1024)).data;
  const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
  const revision=(await exec('git',['rev-parse','--verify','HEAD^{commit}'],{cwd:root,env,encoding:'utf8',timeout:10000,maxBuffer:1024})).stdout.trim();
  if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))throw changed();
  if(windows) {
    const affected=[...changes.keys()];
    if(affected.some(name=>!portableWindowsPath(name)||potentialWindowsShortName(name)))throw new Error('A changed path cannot be reviewed safely on Windows. Use Source Control.');
    const options={cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024};
    const names=async args=>{const text=new TextDecoder('utf-8',{fatal:true}).decode((await exec('git',['-c','core.fsmonitor=false',...args],options)).stdout);if(text&&!text.endsWith('\0'))throw changed();return text.split('\0').filter(Boolean);};
    const [headNames,indexNames]=await Promise.all([names(['ls-tree','-r','--name-only','-z',revision]),names(['ls-files','-z'])]);
    const known=[...headNames,...indexNames,...ignored,...affected];
    if(known.some(name=>!portableWindowsPath(name)||potentialWindowsShortName(name))||windowsPathsCollide(affected,known))throw new Error('A project path or name collision cannot be reviewed safely on Windows. Use Source Control.');
  }
  const budget={bytes:0},files=[];
  for(const [name,kind] of [...changes].sort(([a],[b])=>a.localeCompare(b,'en')))files.push({name,kind,current:await snapshotFile(root,name,budget)});
  return {root,config:configFile,index:digest(index),head:digest(head),revision,ignored:ignored.sort(),files};
}
async function previewDiscard(root,{beforeMutation,_testPlatform}={}) {
  if(typeof beforeMutation!=='function')throw new Error('Workspace trust and saved-editor checks are required.');
  const windows=process.platform==='win32'||_testPlatform==='win32';
  await beforeMutation();const state=await snapshot(root,{windows});await beforeMutation();
  if(JSON.stringify(state)!==JSON.stringify(await snapshot(root,{windows})))throw changed();
  const plan=Object.freeze({files:Object.freeze(state.files.map(({name,kind})=>Object.freeze({name,kind})))});
  plans.set(plan,{state,beforeMutation,windows});return plan;
}
async function revalidateDiscard(plan) {
  const saved=plans.get(plan);if(!saved)throw new Error('Review the changes before discarding.');
  plans.delete(plan);await saved.beforeMutation();
  if(JSON.stringify(saved.state)!==JSON.stringify(await snapshot(saved.state.root,{windows:saved.windows})))throw changed();
  return true;
}
// Bind the existing ancestor identities and the exact missing suffix to the
// review. Pathname checks narrow races with ordinary writers but cannot make
// a sequence of filesystem calls atomic against a concurrent directory swap.
async function deletedParents(root,name) {
  const parts=name.split('/'),existing=[],missing=[];if(parts.length>128)throw new Error('The file path has too many parent folders. Use Source Control.');
  const rootInfo=await fs.lstat(root);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||await fs.realpath(root)!==root)throw changed();
  existing.push({name:'',dev:rootInfo.dev,ino:rootInfo.ino});
  const fold=value=>value.normalize('NFC').toLowerCase();let current=root,relative='',absent=false;
  for(const part of parts.slice(0,-1)) {
    relative=relative?relative+'/'+part:part;
    if(absent){missing.push(relative);continue;}
    const names=await fs.readdir(current);
    if(names.some(value=>value!==part&&fold(value)===fold(part)))throw new Error('A differently named folder collides with this file restoration. Your files are preserved.');
    current=path.join(current,part);let info;
    try{info=await fs.lstat(current);}catch(error){if(error.code!=='ENOENT')throw error;absent=true;missing.push(relative);continue;}
    if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(current)!==current)throw changed();
    existing.push({name:relative,dev:info.dev,ino:info.ino});
  }
  if(!absent){const leaf=parts.at(-1),names=await fs.readdir(current);if(names.some(value=>value!==leaf&&fold(value)===fold(leaf)))throw new Error('A differently named file collides with this file restoration. Your files are preserved.');}
  return {existing,missing};
}

// A deleted-file review captures the entire project, even though the future
// operation may only touch the selected path. Status columns select the source;
// the display-oriented status map alone intentionally loses that information.
async function previewFileInternal(root,name,{beforeMutation,_testPlatform}={},mode='deleted') {
  if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Restoring a file is not supported on Windows yet.');
  if(typeof beforeMutation!=='function')throw new Error('Workspace trust and saved-editor checks are required.');
  const readStatus=async()=>{
    const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_ATTR_NOSYSTEM:'1',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
    const inspect=async (_root,args)=>{
      const bytes=(await exec('git',['-c','core.fsmonitor=false',...args],{cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:1024*1024})).stdout;
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if(args.includes('-z')&&text&&!text.endsWith('\0'))throw changed();
      return text;
    };
    await refuseFilters(root,inspect);
    const bytes=(await exec('git',['-c','core.fsmonitor=false','status','--porcelain=v1','-z','--no-renames','--untracked-files=all'],{cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:1024*1024})).stdout;
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  };
  await beforeMutation();
  const state=await snapshot(root),status=await readStatus(),addition=mode==='added'?addedFileSource(status,name):undefined,source=addition?addition.source:(mode==='committed'?committedFileSource:mode==='modified'?modifiedFileSource:deletedFileSource)(status,name);
  const selected=state.files.find(file=>file.name===name);
  if(!selected||(mode==='added'?(selected.kind!=='added'||!selected.current):mode==='committed'?(selected.kind!=='modified'||!selected.current):mode==='modified'?(!['modified','added'].includes(selected.kind)||!selected.current):(selected.kind!=='deleted'||selected.current!==null)))throw changed();
  if(mode==='committed'||(mode==='added'&&source==='index')) {
    const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_ATTR_NOSYSTEM:'1',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
    const bytes=(await exec('git',['-c','core.fsmonitor=false','ls-files','--debug','-z'],{cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout;
    if(parseIndexFlags(bytes).get(name)!=='0')throw new Error('This staged file has unsupported index flags. Use Source Control.');
  }
  const parentState=await deletedParents(root,name);
  await beforeMutation();
  if(JSON.stringify(state)!==JSON.stringify(await snapshot(root))||status!==await readStatus()||JSON.stringify(parentState)!==JSON.stringify(await deletedParents(root,name)))throw changed();
  const plan=Object.freeze({name,source,...(addition?{status:addition.status}:{}),parentFolders:Object.freeze([...parentState.missing])});deletedPlans.set(plan,{state,status,beforeMutation,readStatus,parentState,mode});return plan;
}
async function revalidateDeletedFileInternal(plan) {
  const saved=deletedPlans.get(plan);if(!saved)throw new Error('Review the deleted file again.');
  await saved.beforeMutation();
  if(JSON.stringify(saved.state)!==JSON.stringify(await snapshot(saved.state.root))||saved.status!==await saved.readStatus()||JSON.stringify(saved.parentState)!==JSON.stringify(await deletedParents(saved.state.root,plan.name)))throw changed();
  return true;
}
// Save exact working bytes and the index outside the worktree before any future
// mutation. The copy is intentionally retained: interruptions must not erase
// the student's only recovery data. This function does not discard files.
function assertDiscardPlatform(platform) {
  if(process.platform==='win32'||platform==='win32')throw new Error('Discard project changes is not supported on Windows yet. No discard was started.');
}
async function backupDiscard(plan,{binding,_testPlatform}={}) {
  assertDiscardPlatform(_testPlatform);
  const saved=plans.get(plan);if(!saved)throw new Error('Review the changes before creating a recovery copy.');
  if(!(saved.deleted&&!saved.deleted.type&&saved.deleted.source==='index'))throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  if(binding) {if(binding.root!==saved.state.root||typeof binding.assertCurrentNow!=='function')throw changed();binding.assertCurrentNow();}
  saved.binding=binding;
  plans.delete(plan);await saved.beforeMutation();
  if(JSON.stringify(saved.state)!==JSON.stringify(await snapshot(saved.state.root,{windows:saved.windows})))throw changed();
  const {state}=saved,base=path.join(state.root,'.git');
  const recovery=await fs.mkdtemp(path.join(base,saved.deleted?'zero-file-restore-recovery-':'zero-discard-recovery-'));
  await fs.chmod(recovery,0o700);
  if(saved.deleted){const identity=await fs.lstat(recovery);saved.ownFileRestore={name:path.basename(recovery),dev:identity.dev,ino:identity.ino};}
  const manifest={schema:1,revision:state.revision,head:state.head,index:state.index,files:[]};
  try {
    const index=(await readOrdinaryBounded(path.join(base,'index'),4*1024*1024)).data;if(digest(index)!==state.index)throw changed();
    await fs.writeFile(path.join(recovery,'index'),index,{flag:'wx',mode:0o600});
    // An index copy alone does not retain staged-only blobs: Git may later
    // prune objects that became unreachable when the index was restored.
    const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
    const git=async args=>(await exec('git',['-c','core.fsmonitor=false',...args],{cwd:state.root,env,encoding:'buffer',timeout:20000,maxBuffer:MAX_BYTES+1024})).stdout;
    const rows=new TextDecoder('utf-8',{fatal:true}).decode(await git(['ls-files','--stage','-z'])).split('\0').filter(Boolean);
    const names=new Set(state.files.map(file=>file.name));let stagedBytes=0;
    manifest.staged=[];
    for(const row of rows) {
      const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);
      if(!match)throw new Error('Discard cannot safely copy this index. Use Source Control.');
      if(!names.has(match[3]))continue;
      const bytes=await git(['cat-file','blob',match[2]]);stagedBytes+=bytes.length;
      if(stagedBytes>MAX_BYTES)throw new Error('Staged changes are too large to copy safely. Use Source Control.');
      const copy=`staged-${manifest.staged.length}`;
      await fs.writeFile(path.join(recovery,copy),bytes,{flag:'wx',mode:0o600});
      manifest.staged.push({name:match[3],mode:match[1],object:match[2],copy,hash:digest(bytes)});
    }
    let number=0;
    for(const entry of state.files) {
      if(!entry.current){manifest.files.push({name:entry.name,kind:entry.kind,missing:true});continue;}
      const actual=await snapshotFile(state.root,entry.name,{bytes:0});
      if(JSON.stringify(actual)!==JSON.stringify(entry.current))throw changed();
      const source=path.join(state.root,...entry.name.split('/'));
      const handle=await fs.open(source,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
      try {
        const stat=await handle.stat();
        if(!stat.isFile()||stat.dev!==actual.dev||stat.ino!==actual.ino||stat.size!==actual.size||stat.nlink!==1)throw changed();
        const bytes=Buffer.alloc(actual.size+1);let length=0;
        while(length<bytes.length){const next=await handle.read(bytes,length,bytes.length-length,length);if(!next.bytesRead)break;length+=next.bytesRead;}
        const data=bytes.subarray(0,length);if(length!==actual.size||digest(data)!==actual.hash)throw changed();
        const name=`file-${number++}`;await fs.writeFile(path.join(recovery,name),data,{flag:'wx',mode:0o600});
        manifest.files.push({name:entry.name,kind:entry.kind,copy:name,hash:actual.hash,mode:actual.mode});
      } finally {await handle.close();}
    }
    await saved.beforeMutation();binding?.assertCurrentNow();
    if(JSON.stringify(state)!==JSON.stringify(await snapshot(state.root,{ownFileRestore:saved.ownFileRestore}))||(saved.deleted&&JSON.stringify(saved.parentState)!==JSON.stringify(await deletedParents(state.root,saved.deleted.name))))throw changed();
    const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
    await fs.writeFile(path.join(recovery,'manifest.json'),manifestBytes,{flag:'wx',mode:0o600});
    const result=Object.freeze({recovery,files:plan.files});backups.set(result,{...saved,manifestHash:digest(manifestBytes)});return result;
  } catch(error) {
    // No project mutation occurred; leave a partial copy for manual inspection.
    error.recoveryPath=recovery;throw error;
  }
}
async function backupFileInternal(plan,{binding,_testPlatform}={},mode='deleted') {
  const saved=deletedPlans.get(plan);if(!saved)throw new Error('Review the deleted file again.');
  if(saved.mode!==mode)throw new Error('Review the selected file again.');
  if(mode!=='deleted'||plan.source!=='index')throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  if(!binding||binding.root!==saved.state.root||typeof binding.assertCurrentNow!=='function')throw new Error('A current project mutation lock is required.');
  binding.assertCurrentNow();
  deletedPlans.delete(plan);
  await saved.beforeMutation();
  if(JSON.stringify(saved.state)!==JSON.stringify(await snapshot(saved.state.root))||saved.status!==await saved.readStatus()||JSON.stringify(saved.parentState)!==JSON.stringify(await deletedParents(saved.state.root,plan.name)))throw changed();
  const discardPlan=Object.freeze({files:Object.freeze(saved.state.files.map(({name,kind})=>Object.freeze({name,kind})))});
  plans.set(discardPlan,{...saved,deleted:{name:plan.name,source:plan.source,...(mode==='modified'?{type:'modified'}:mode==='committed'?{type:'modified-committed'}:mode==='added'?{type:'added',status:plan.status}:{})}});
  const internal=await backupDiscard(discardPlan,{binding,_testPlatform});
  const result=Object.freeze({recovery:internal.recovery,name:plan.name,source:plan.source});
  deletedBackups.set(result,{internal,mode});return result;
}
async function applyFileInternal(backup,options={},mode='deleted') {
  const saved=deletedBackups.get(backup);if(!saved||saved.mode!==mode)throw new Error('Review and back up the selected file first.');
  deletedBackups.delete(backup);
  const result=await applyDiscard(saved.internal,options);
  return {recovery:result.recovery,name:backup.name,source:backup.source};
}
function restoreError(error) {
  if(!error||typeof error.message!=='string')return error;
  error.message=error.message
    .replace('Project changes moved since review. Review them again; no files were discarded.','Project changes moved since review. Review the deleted file again; restoration cannot continue.')
    .replace('Discard was interrupted or could not be verified. Inspect your project and the recovery copy before trying again.','File restoration was interrupted or could not be verified. Inspect your project and the recovery copy before trying again.')
    .replace('Discard completed, but its lock needs inspection.','File restoration completed, but its lock needs inspection.')
    .replace('Discard lock cleanup needs inspection.','File restoration lock cleanup needs inspection.')
    .replace('Discard project changes is not supported on Windows yet. No discard was started.','Restoring a deleted file is not supported on Windows yet.')
    .replace('There are no file changes to discard.','This file is no longer deleted. Review the project again.')
    .replace('Review and confirm the discard first.','Review and confirm the file restoration first.')
    .replaceAll('Discard preview','File restoration review')
    .replaceAll('Discard cannot','File restoration cannot')
    .replaceAll('Discard needs','File restoration needs')
    .replaceAll('discarding changes','restoring a deleted file')
    .replaceAll('for discard','for file restoration');
  if(error.discardCompleted){error.fileRestoreCompleted=true;delete error.discardCompleted;}
  return error;
}
async function previewDeletedFile(root,name,options){try{return await previewFileInternal(root,name,options,'deleted');}catch(error){throw restoreError(error);}}
function modifiedError(error){error=restoreError(error);if(error&&typeof error.message==='string')error.message=error.message.replaceAll('deleted file','modified file');return error;}
function addedError(error){error=modifiedError(error);if(error&&typeof error.message==='string')error.message=error.message.replaceAll('modified file','added file');return error;}
async function previewModifiedFile(root,name,options){try{return await previewFileInternal(root,name,options,'modified');}catch(error){throw modifiedError(error);}}
async function previewCommittedFile(root,name,options){try{return await previewFileInternal(root,name,options,'committed');}catch(error){throw modifiedError(error);}}
async function previewAddedFile(root,name,options){try{return await previewFileInternal(root,name,options,'added');}catch(error){throw addedError(error);}}
async function revalidateDeletedFile(...args){try{return await revalidateDeletedFileInternal(...args);}catch(error){throw restoreError(error);}}
async function backupDeletedFile(plan,options){try{return await backupFileInternal(plan,options,'deleted');}catch(error){throw restoreError(error);}}
async function backupModifiedFile(plan,options){try{return await backupFileInternal(plan,options,'modified');}catch(error){throw modifiedError(error);}}
async function backupCommittedFile(plan,options){try{return await backupFileInternal(plan,options,'committed');}catch(error){throw modifiedError(error);}}
async function backupAddedFile(plan,options){try{return await backupFileInternal(plan,options,'added');}catch(error){throw addedError(error);}}
async function applyDeletedFile(backup,options){try{return await applyFileInternal(backup,options,'deleted');}catch(error){throw restoreError(error);}}
async function applyModifiedFile(backup,options){try{return await applyFileInternal(backup,options,'modified');}catch(error){throw modifiedError(error);}}
async function applyCommittedFile(backup,options){try{return await applyFileInternal(backup,options,'committed');}catch(error){throw modifiedError(error);}}
async function applyAddedFile(backup,options){try{return await applyFileInternal(backup,options,'added');}catch(error){throw addedError(error);}}
async function applyDiscard(backup,{confirmed=false,_testBeforeStep,_testPlatform}={}) {
  assertDiscardPlatform(_testPlatform);
  const saved=backups.get(backup);if(!saved||confirmed!==true)throw new Error('Review and confirm the discard first.');
  if(!(saved.deleted&&!saved.deleted.type&&saved.deleted.source==='index'))throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  backups.delete(backup);const {state,beforeMutation}=saved,root=state.root,dot=path.join(root,'.git');
  const scope=saved.deleted?state.files.filter(file=>file.name===saved.deleted.name):state.files;
  const added=saved.deleted?.type==='added',committed=saved.deleted?.type==='modified-committed',modified=added||committed||saved.deleted?.type==='modified';
  if(saved.deleted&&(scope.length!==1||(modified?(!['modified','added'].includes(scope[0].kind)||!scope[0].current):(scope[0].kind!=='deleted'||scope[0].current!==null))))throw changed();
  const binding=saved.binding;
  const lock=path.join(dot,'zero-discard.lock');let lockHandle,retainLock=false,verifyParents;
  const rootIdentity=await fs.lstat(root),dotIdentity=await fs.lstat(dot);
  const verifyLockParent=async()=>{for(const [dir,expected] of [[root,rootIdentity],[dot,dotIdentity]]){const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==expected.dev||info.ino!==expected.ino||await fs.realpath(dir)!==dir)throw changed();}};
  try {lockHandle=await fs.open(lock,'wx',0o600);}catch{throw new Error('Another Zero recovery operation is in progress.');}
  const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_ATTR_NOSYSTEM:'1',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'});
  const git=async args=>(await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env,encoding:'buffer',timeout:20000,maxBuffer:4*1024*1024})).stdout;
  const parse=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\0').filter(Boolean);
  let started=false,completed=false,primaryError;
  try {
    await beforeMutation();binding?.assertCurrentNow();if(JSON.stringify(state)!==JSON.stringify(await snapshot(root,{ownFileRestore:saved.ownFileRestore}))||(saved.deleted&&JSON.stringify(saved.parentState)!==JSON.stringify(await deletedParents(root,saved.deleted.name))))throw changed();
    const manifestBytes=(await readOrdinaryBounded(path.join(backup.recovery,'manifest.json'),1024*1024)).data;if(digest(manifestBytes)!==saved.manifestHash)throw changed();
    const manifest=JSON.parse(manifestBytes.toString('utf8'));
    if(manifest.revision!==state.revision||manifest.index!==state.index||manifest.files.length!==state.files.length||(await readOrdinaryBounded(path.join(backup.recovery,'index'),4*1024*1024)).hash!==state.index)throw changed();
    if(!Array.isArray(manifest.staged))throw changed();
    for(const entry of manifest.staged)if(!/^staged-\d+$/.test(entry.copy)||(await readOrdinaryBounded(path.join(backup.recovery,entry.copy),MAX_BYTES)).hash!==entry.hash)throw changed();
    for(let i=0;i<state.files.length;i++) {
      const entry=state.files[i],copy=manifest.files[i];
      if(copy.name!==entry.name||copy.kind!==entry.kind||Boolean(copy.missing)!==!entry.current)throw changed();
      if(entry.current&&(!/^file-\d+$/.test(copy.copy)||copy.hash!==entry.current.hash||(await readOrdinaryBounded(path.join(backup.recovery,copy.copy),entry.current.size)).hash!==entry.current.hash))throw changed();
    }
    const trees=parse(await git(['ls-tree','-r','-z',state.revision]));const headNames=new Set(),headEntries=new Map();
    for(const row of trees){const match=/^(\d{6}) (?:blob|commit) ([a-f0-9]{40,64})\t([^\0]+)$/.exec(row);if(!match)throw changed();if(state.files.some(file=>file.name===match[3])&&!['100644','100755'].includes(match[1]))throw new Error('Discard cannot safely restore a link or submodule. Use Source Control.');headNames.add(match[3]);headEntries.set(match[3],`${match[1]} ${match[2]}`);}
    const indexRows=parse(await git(['ls-files','--stage','-z'])),indexNames=new Set(),indexEntries=new Map();
    for(const row of indexRows){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||indexEntries.has(match[3]))throw new Error('Discard cannot safely handle this index. Use Source Control.');indexNames.add(match[3]);indexEntries.set(match[3],`${match[1]} ${match[2]}`);}
    const originalFlags=committed||added?parseIndexFlags(await git(['ls-files','--debug','-z'])):undefined;
    if(committed&&(originalFlags.size!==indexEntries.size||originalFlags.get(saved.deleted.name)!=='0'||!headEntries.has(saved.deleted.name)||!indexEntries.has(saved.deleted.name)||headEntries.get(saved.deleted.name)===indexEntries.get(saved.deleted.name)))throw new Error('This staged file or its index flags cannot be safely restored. Use Source Control.');
    if(added&&(originalFlags.size!==indexEntries.size||headEntries.has(saved.deleted.name)||(saved.deleted.source==='index'?(!indexEntries.has(saved.deleted.name)||originalFlags.get(saved.deleted.name)!=='0'):saved.deleted.source!=='untracked'||indexEntries.has(saved.deleted.name))))throw new Error('This addition or its index flags cannot be safely removed. Use Source Control.');
    const attributes=name=>name.split('/').some(part=>part.toLowerCase()==='.gitattributes');
    const stock=new Map([['.gitattributes','* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n'],['.zero-build/.gitattributes','* -text\n']]);
    const headAttrs=new Map(),indexAttrs=new Map();
    for(const row of trees){const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)$/.exec(row);if(match&&attributes(match[3]))headAttrs.set(match[3],match[2]);}
    for(const row of indexRows){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(match&&attributes(match[3]))indexAttrs.set(match[3],match[2]);}
    const attrNames=[...indexAttrs.keys()].sort();
    if(state.files.some(file=>attributes(file.name))||JSON.stringify([...headAttrs.keys()].sort())!==JSON.stringify(attrNames)||attrNames.some(name=>!stock.has(name)))throw new Error('Custom or changed Git attributes require Source Control for discard.');
    for(const name of attrNames)if(headAttrs.get(name)!==indexAttrs.get(name)||(await git(['cat-file','blob',indexAttrs.get(name)])).toString('utf8')!==stock.get(name))throw new Error('Custom or changed Git attributes require Source Control for discard.');
    const others=parse(await git(['ls-files','--others','--exclude-standard','-z']));
    const ignored=parse(await git(['ls-files','--others','--ignored','--exclude-standard','-z']));
    if([...others,...ignored,...state.ignored].some(attributes))throw new Error('Custom or changed Git attributes require Source Control for discard.');
    try {const info=await fs.lstat(path.join(dot,'info','attributes'));if(info)throw new Error('Git info attributes require Source Control for discard.');}catch(error){if(error.code!=='ENOENT')throw error;}
    const attrIdentities=[];
    for(const name of attrNames){const file=path.join(root,...name.split('/')),parent=path.dirname(file),parentInfo=await fs.lstat(parent),identity=await snapshotFile(root,name,{bytes:0},4096);
      if(!parentInfo.isDirectory()||parentInfo.isSymbolicLink()||await fs.realpath(parent)!==parent||!identity)throw new Error('Custom or changed Git attributes require Source Control for discard.');
      const data=await readSnapshot(file,identity);
      if(data.length!==identity.size||digest(data)!==identity.hash||(name==='.gitattributes'?data.toString('utf8').replace(/\r\n/g,'\n'):data.toString('utf8'))!==stock.get(name))throw new Error('Custom or changed Git attributes require Source Control for discard.');
      attrIdentities.push({name,parent,parentInfo,identity});}
    const verifyAttributes=async()=>{
      try {await fs.lstat(path.join(dot,'info','attributes'));throw changed();}catch(error){if(error.code!=='ENOENT')throw error;}
      for(const entry of attrIdentities){const parent=await fs.lstat(entry.parent);if(!parent.isDirectory()||parent.isSymbolicLink()||parent.dev!==entry.parentInfo.dev||parent.ino!==entry.parentInfo.ino||await fs.realpath(entry.parent)!==entry.parent||JSON.stringify(await snapshotFile(root,entry.name,{bytes:0},4096))!==JSON.stringify(entry.identity))throw changed();}
    };
    const tracked=scope.filter(file=>headNames.has(file.name)||indexNames.has(file.name));
    if(saved.deleted && (added?(saved.deleted.source==='index'?tracked.length!==1:tracked.length!==0):(tracked.length!==1 || (saved.deleted.source==='head' ? !headNames.has(saved.deleted.name)||(committed?!indexNames.has(saved.deleted.name):indexNames.has(saved.deleted.name)) : saved.deleted.source!=='index'||!indexNames.has(saved.deleted.name)))))throw changed();
    const collision=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
    if(tracked.some(file=>[...ignored,...state.ignored].some(name=>collision(file.name,name))))throw new Error('An ignored file would be overwritten. Your files are preserved.');
    // Build the replacement index and checkout in the private recovery folder.
    // Git never writes the live worktree or index during this preparation.
    const preparedIndex=path.join(backup.recovery,'prepared-index');
    await writeDurable(preparedIndex,(await readOrdinaryBounded(path.join(backup.recovery,'index'),4*1024*1024)).data);
    const prepareEnv={...env,GIT_INDEX_FILE:preparedIndex};
    const prepare=async args=>(await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env:prepareEnv,encoding:'buffer',timeout:20000,maxBuffer:MAX_BYTES+1024})).stdout;
    await verifyAttributes();
    if(tracked.length&&(!saved.deleted||saved.deleted.source==='head'))await prepare(['restore',`--source=${state.revision}`,'--staged','--',...tracked.map(file=>file.name)]);
    if(added&&saved.deleted.source==='index')await prepare(['update-index','--force-remove','--',saved.deleted.name]);
    if(committed) {
      const rows=parse(await prepare(['ls-files','--stage','-z'])),entries=new Map();
      for(const row of rows){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||entries.has(match[3]))throw changed();entries.set(match[3],`${match[1]} ${match[2]}`);}
      const flags=parseIndexFlags(await prepare(['ls-files','--debug','-z']));
      if(entries.size!==indexEntries.size||flags.size!==originalFlags.size||entries.get(saved.deleted.name)!==headEntries.get(saved.deleted.name)||flags.get(saved.deleted.name)!=='0')throw changed();
      for(const [name,value]of indexEntries)if(name!==saved.deleted.name&&(entries.get(name)!==value||flags.get(name)!==originalFlags.get(name)))throw changed();
    }
    if(added&&saved.deleted.source==='index') {
      const rows=parse(await prepare(['ls-files','--stage','-z'])),entries=new Map();
      for(const row of rows){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||entries.has(match[3]))throw changed();entries.set(match[3],`${match[1]} ${match[2]}`);}
      const flags=parseIndexFlags(await prepare(['ls-files','--debug','-z']));
      if(entries.size!==indexEntries.size-1||flags.size!==originalFlags.size-1||entries.has(saved.deleted.name)||flags.has(saved.deleted.name))throw changed();
      for(const [name,value]of indexEntries)if(name!==saved.deleted.name&&(entries.get(name)!==value||flags.get(name)!==originalFlags.get(name)))throw changed();
    }
    const expectedIndexHash=(await readOrdinaryBounded(preparedIndex,4*1024*1024)).hash;
    const prepared=path.join(backup.recovery,'prepared');await fs.mkdir(prepared,{mode:0o700});
    const restored=added?[]:saved.deleted?tracked:tracked.filter(file=>headNames.has(file.name));
    if(_testBeforeStep)await _testBeforeStep('before-checkout');
    await verifyAttributes();
    if(restored.length)await prepare(['checkout-index','--prefix',prepared+path.sep,'--',...restored.map(file=>file.name)]);
    await verifyAttributes();
    // Keep identities for every parent traversed by a live or recovery-file
    // mutation. Recheck the whole chain after hooks and directly before each
    // pathname operation; an unchanged leaf alone cannot establish confinement.
    const parents=new Map();
    const rememberParents=async file=>{
      let dir=path.dirname(file),chain=[];
      while(true) {chain.push(dir);if(dir===root)break;const next=path.dirname(dir);if(next===dir||!dir.startsWith(root+path.sep))throw changed();dir=next;}
      for(const current of chain.reverse()) {
        const info=await fs.lstat(current);
        if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(current)!==current)throw changed();
        const previous=parents.get(current);
        if(previous&&(previous.dev!==info.dev||previous.ino!==info.ino))throw changed();
        parents.set(current,{dev:info.dev,ino:info.ino});
      }
    };
    verifyParents=async (...files)=>{
      for(const file of files) {
        let dir=path.dirname(file);
        while(true) {
          const expected=parents.get(dir),info=await fs.lstat(dir);
          if(!expected||!info.isDirectory()||info.isSymbolicLink()||info.dev!==expected.dev||info.ino!==expected.ino||await fs.realpath(dir)!==dir)throw changed();
          if(dir===root)break;dir=path.dirname(dir);
        }
      }
    };
    for(const file of scope) {
      const nearest=saved.deleted?saved.parentState.existing.at(-1).name:undefined;
      await rememberParents(saved.deleted?path.join(root,...nearest.split('/').filter(Boolean),'placeholder'):path.join(root,...file.name.split('/')));
    }
    if(saved.deleted)for(const entry of saved.parentState.existing){const info=parents.get(path.join(root,...entry.name.split('/').filter(Boolean)));if(!info||info.dev!==entry.dev||info.ino!==entry.ino)throw changed();}
    for(const file of restored)await rememberParents(path.join(prepared,...file.name.split('/')));
    await rememberParents(path.join(backup.recovery,'placeholder'));
    await rememberParents(path.join(dot,'index'));
    const moves=scope.filter(file=>file.current).map((file,i)=>({name:file.name,copy:`removed-${i}`}));
    const movesBytes=Buffer.from(JSON.stringify(moves,null,2)+'\n');
    await fs.writeFile(path.join(backup.recovery,'removed-files.json'),movesBytes,{flag:'wx',mode:0o600});
    const directories=saved.deleted?saved.parentState.missing:[];
    const journalPath=directories.length||modified?path.join(backup.recovery,'file-restore-journal.jsonl'):undefined;
    let journalIdentity,journalText='';
    const appendJournal=async entry=>{
      if(!journalPath)return;
      await verifyParents(journalPath);
      const previous=await snapshotFile(backup.recovery,'file-restore-journal.jsonl',{bytes:0},1024*1024);
      if(!previous||previous.dev!==journalIdentity.dev||previous.ino!==journalIdentity.ino||previous.hash!==digest(Buffer.from(journalText)))throw changed();
      const named=await fs.lstat(journalPath),handle=await fs.open(journalPath,constants.O_WRONLY|constants.O_APPEND|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
      try {const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.dev!==journalIdentity.dev||info.ino!==journalIdentity.ino||named.dev!==info.dev||named.ino!==info.ino||named.isSymbolicLink())throw changed();
        const row=JSON.stringify(entry)+'\n';await handle.writeFile(row);await handle.sync();journalText+=row;
      } finally {await handle.close();}
    };
    if(journalPath) {
      if(directories.length&&(process.umask()&0o700))throw new Error('File restoration requires owner read, write and execute access to create parent folders.');
      journalText=JSON.stringify({schema:added?5:committed?4:modified?3:2,event:'start',selection:saved.deleted,revision:state.revision,index:state.index,manifestHash:saved.manifestHash,directories})+'\n';
      await writeDurable(journalPath,Buffer.from(journalText));journalIdentity=await fs.lstat(journalPath);await syncDirectory(backup.recovery);
    }
    const durable=process.platform!=='win32',results=[];
    if(durable) {
      // All retained input and prepared output is durable before the first
      // live move. A failed sync leaves the operation unapplied and ambiguous.
      for(const name of ['index','manifest.json','removed-files.json','prepared-index',...manifest.staged.map(item=>item.copy),...manifest.files.filter(item=>!item.missing).map(item=>item.copy)])await syncFile(path.join(backup.recovery,name));
      for(const file of restored) {
        const source=path.join(prepared,...file.name.split('/')),value=await snapshotFile(prepared,file.name,{bytes:0});
        if(!value)throw changed();results.push({name:file.name,hash:value.hash,size:value.size,...(modified?{mode:value.mode}:{})});await syncFile(source);
        let dir=path.dirname(source);while(dir!==backup.recovery){await syncDirectory(dir);dir=path.dirname(dir);}
      }
      await syncDirectory(backup.recovery);await syncDirectory(dot);
    }
    // Cooperate with Git writers using its standard lock. Other programs can
    // still edit files; each moved original is verified and kept for recovery.
    const indexLock=path.join(dot,'index.lock');let indexLockHandle;
    try {indexLockHandle=await fs.open(indexLock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw new Error('Git is busy. Try again after it finishes.');throw error;}
    let indexPrimary;
    try {
      await beforeMutation();binding?.assertCurrentNow();await verifyAttributes();if(JSON.stringify(state)!==JSON.stringify(await snapshot(root,{ownFileRestore:saved.ownFileRestore}))||(saved.deleted&&JSON.stringify(saved.parentState)!==JSON.stringify(await deletedParents(root,saved.deleted.name))))throw changed();
      started=true;
      for(let i=0;i<directories.length;i++) {
        const name=directories[i],dir=path.join(root,...name.split('/'));
        await beforeMutation();binding?.assertCurrentNow();if(_testBeforeStep)await _testBeforeStep(`before-mkdir-${i}`);await verifyAttributes();await verifyParents(dir);
        const parent=path.dirname(dir),leaf=path.basename(dir),fold=value=>value.normalize('NFC').toLowerCase();
        if((await fs.readdir(parent)).some(value=>fold(value)===fold(leaf)))throw changed();
        await appendJournal({event:'mkdir-intent',index:i,name});await fs.mkdir(dir,{mode:0o700});
        if(_testBeforeStep)await _testBeforeStep(`after-mkdir-${i}`);
        const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw changed();
        parents.set(dir,{dev:info.dev,ino:info.ino});await syncDirectory(parent);await syncDirectory(dir);
        await appendJournal({event:'mkdir-complete',index:i,name});
      }
      for(const move of moves) {
        binding?.assertCurrentNow();
        if(_testBeforeStep)await _testBeforeStep('before-move');
        await verifyAttributes();
        if(modified){await beforeMutation();binding?.assertCurrentNow();if(JSON.stringify(state)!==JSON.stringify(await snapshot(root,{ownFileRestore:saved.ownFileRestore})))throw changed();}
        const entry=state.files.find(file=>file.name===move.name);
        const source=path.join(root,...move.name.split('/')),destination=path.join(backup.recovery,move.copy);
        await appendJournal({event:'move-intent',name:move.name});
        if(modified){try{await fs.lstat(destination);throw changed();}catch(error){if(error.code!=='ENOENT')throw error;}}
        await verifyParents(source,destination);
        if(added){
          // link() creates the retained name exclusively; unlike rename(), it
          // cannot overwrite a concurrently created recovery entry.
          await fs.link(source,destination);
          const original=await fs.lstat(source),retained=await fs.lstat(destination),expected=entry.current;
          if(!original.isFile()||original.isSymbolicLink()||original.dev!==expected.dev||original.ino!==expected.ino||original.mode!==expected.mode||original.size!==expected.size||original.mtimeMs!==expected.mtime||original.nlink!==2||retained.dev!==original.dev||retained.ino!==original.ino||(await readOrdinaryBounded(destination,expected.size,{links:2})).hash!==expected.hash)throw changed();
          await verifyParents(source,destination);const again=await fs.lstat(source);if(again.dev!==original.dev||again.ino!==original.ino||again.size!==original.size||again.mtimeMs!==original.mtimeMs||again.nlink!==2)throw changed();
          await fs.unlink(source);
        }else await fs.rename(source,destination);
        const actual=await snapshotFile(backup.recovery,move.copy,{bytes:0});
        if(JSON.stringify(actual)!==JSON.stringify(entry.current))throw changed();
        if(durable){await syncFile(destination);await syncDirectory(path.dirname(source));await syncDirectory(backup.recovery);}
        await appendJournal({event:'moved',name:move.name});
        if(_testBeforeStep)await _testBeforeStep('after-move');
      }
      // Every destination is installed exclusively: a newly created file
      // causes a stop and is never overwritten.
      for(const file of restored) {
        binding?.assertCurrentNow();
        await verifyAttributes();
        const source=path.join(prepared,...file.name.split('/')),destination=path.join(root,...file.name.split('/'));
        if(saved.deleted) {
          await beforeMutation();if(_testBeforeStep)await _testBeforeStep('before-install');binding?.assertCurrentNow();
          const current=await snapshot(root,{ownFileRestore:saved.ownFileRestore});
          const other=value=>({...value,files:value.files.filter(entry=>entry.name!==file.name)});
          if(JSON.stringify(modified?other(state):state)!==JSON.stringify(modified?other(current):current))throw changed();
          await verifyParents(destination);const leaf=path.basename(destination),fold=value=>value.normalize('NFC').toLowerCase();
          if((await fs.readdir(path.dirname(destination))).some(value=>fold(value)===fold(leaf)))throw changed();
        }
        await appendJournal({event:'install-intent',name:file.name});
        await verifyParents(source,destination);await fs.link(source,destination);
        await verifyParents(source);await fs.unlink(source);
        if(durable){await syncFile(destination);await syncDirectory(path.dirname(destination));}
        await appendJournal({event:'installed',name:file.name});
        if(saved.deleted&&_testBeforeStep)await _testBeforeStep('after-install');
      }
      if(!saved.deleted||saved.deleted.source==='head'||(added&&saved.deleted.source==='index')) {
        const movedIndex=path.join(backup.recovery,'moved-index');
        binding?.assertCurrentNow();
        await verifyAttributes();
        if(saved.deleted&&_testBeforeStep)await _testBeforeStep('before-index');
        if(committed||added){await beforeMutation();await verifyParents(path.join(dot,'index'));const identity=await snapshotFile(root,'.git/index',{bytes:0},4*1024*1024);if(!identity||identity.hash!==state.index)throw changed();if(added&&await snapshotFile(root,saved.deleted.name,{bytes:0})!==null)throw changed();}
        await verifyParents(path.join(dot,'index'),movedIndex);
        try {await fs.lstat(movedIndex);throw new Error('The retained index destination already exists. Inspect the project and recovery copy before continuing.');}
        catch(error){if(error.code!=='ENOENT')throw error;}
        await appendJournal({event:'index-intent'});
        await verifyParents(path.join(dot,'index'),movedIndex);await fs.rename(path.join(dot,'index'),movedIndex);
        if((await readOrdinaryBounded(movedIndex,4*1024*1024)).hash!==state.index)throw changed();
        await verifyParents(preparedIndex,path.join(dot,'index'));await fs.link(preparedIndex,path.join(dot,'index'));
        await verifyParents(preparedIndex);await fs.unlink(preparedIndex);
        if(durable){await syncFile(movedIndex);await syncFile(path.join(dot,'index'));await syncDirectory(dot);await syncDirectory(backup.recovery);}
        await appendJournal({event:'index-installed'});
        if(saved.deleted&&_testBeforeStep)await _testBeforeStep('after-index');
      }
    } catch(error){indexPrimary=error;throw error;}
    finally {
      try {await indexLockHandle.close();await verifyParents(indexLock);await fs.unlink(indexLock);}
      catch(error){if(indexPrimary){indexPrimary.lockRecoveryPath=indexLock;indexPrimary.lockCleanupError=error;throw indexPrimary;}error.lockRecoveryPath=indexLock;throw error;}
    }
    if(durable) {
      await beforeMutation();binding?.assertCurrentNow();
      const currentHead=new TextDecoder('utf-8',{fatal:true}).decode(await git(['rev-parse','--verify','HEAD^{commit}'])).trim();
      if(currentHead!==state.revision||(await readOrdinaryBounded(path.join(dot,'HEAD'),4*1024*1024)).hash!==state.head)throw changed();
      const resultIndex=(await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024)).data;if(digest(resultIndex)!==expectedIndexHash)throw changed();
      for(const file of scope) {
        const actual=await snapshotFile(root,file.name,{bytes:0}),expected=results.find(value=>value.name===file.name);
        if(expected?(!actual||actual.hash!==expected.hash||actual.size!==expected.size||(modified&&actual.mode!==expected.mode)):actual!==null)throw changed();
      }
      await verifyParents(path.join(backup.recovery,'completed-index'));await writeDurable(path.join(backup.recovery,'completed-index'),resultIndex);
      if(journalPath)await appendJournal({event:'complete'});
      const journalHash=journalPath?digest(Buffer.from(journalText)):undefined;
      if(journalPath){const identity=await snapshotFile(backup.recovery,'file-restore-journal.jsonl',{bytes:0},1024*1024);if(!identity||digest(await readSnapshot(journalPath,identity))!==journalHash)throw changed();}
      const complete={schema:added?5:committed?4:modified?3:journalPath?2:1,kind:added?'added-file-removal-complete':committed?'committed-file-restore-complete':modified?'modified-file-restore-complete':saved.deleted?'file-restore-complete':'discard-complete',revision:state.revision,head:state.head,manifestHash:saved.manifestHash,movesHash:digest(movesBytes),originalIndexHash:state.index,resultIndexHash:digest(resultIndex),files:results,...(saved.deleted?{selection:saved.deleted}: {}),...(journalPath?{journalHash}: {})};
      const marker=path.join(backup.recovery,'complete.json'),seal=path.join(backup.recovery,'complete.sha256'),markerBytes=Buffer.from(JSON.stringify(complete)+'\n');
      if(_testBeforeStep)await _testBeforeStep('before-complete');
      const verifyModifiedFinal=async()=>{
        if(!modified)return;
        await beforeMutation();binding?.assertCurrentNow();
        const moved=path.join(backup.recovery,moves[0].copy),destination=path.join(root,...saved.deleted.name.split('/'));
        await verifyParents(moved,destination);const actual=await snapshotFile(backup.recovery,moves[0].copy,{bytes:0});
        if(JSON.stringify(actual)!==JSON.stringify(scope[0].current))throw changed();
        const installed=await snapshotFile(root,saved.deleted.name,{bytes:0}),expected=results[0];
        if((added?installed!==null:!installed||installed.hash!==expected.hash||installed.size!==expected.size||installed.mode!==expected.mode)||(await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024)).hash!==expectedIndexHash)throw changed();
      };
      await verifyModifiedFinal();
      try {await verifyParents(marker);await writeDurable(marker,markerBytes);if(_testBeforeStep)await _testBeforeStep('after-complete-write');await verifyModifiedFinal();await verifyParents(seal);await writeDurable(seal,Buffer.from(digest(markerBytes)+'\n'));await verifyParents(seal);await syncDirectory(backup.recovery);}
      catch(error) {
        // If cleanup cannot be made durable, retain the lock rather than leave
        // a possibly visible completion receipt authorizing another action.
        try {for(const file of [seal,marker]){await verifyParents(file);await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});}await syncDirectory(backup.recovery);}catch {retainLock=true;}
        throw error;
      }
    }
    await verifyParents(path.join(backup.recovery,'complete.json'));
    completed=true;return {recovery:backup.recovery,files:backup.files};
  } catch(error) {
    if(started) {const failure=new Error('Discard was interrupted or could not be verified. Inspect your project and the recovery copy before trying again.',{cause:error});failure.recoveryPath=backup.recovery;if(error.lockRecoveryPath||retainLock)failure.lockRecoveryPath=error.lockRecoveryPath||lock;if(error.lockRecoveryPath)failure.lockCleanupError=error.lockCleanupError||error;primaryError=failure;throw failure;}
    primaryError=error;throw error;
  } finally {
    try {await lockHandle.close();if(!retainLock){await verifyLockParent();await fs.unlink(lock);}}
    catch(error) {
      if(primaryError){
        if(primaryError.lockRecoveryPath&&primaryError.lockRecoveryPath!==lock){primaryError.additionalLockRecoveryPath=lock;primaryError.additionalLockCleanupError=error;}
        else {primaryError.lockRecoveryPath=lock;primaryError.lockCleanupError=error;}
        throw primaryError;
      }
      const failure=new Error(completed?'Discard completed, but its lock needs inspection.':'Discard lock cleanup needs inspection.',{cause:error});failure.recoveryPath=backup.recovery;failure.lockRecoveryPath=lock;failure.discardCompleted=completed;throw failure;
    }
  }
}
module.exports={previewDiscard,revalidateDiscard,backupDiscard,applyDiscard,validatedCompletedDiscard,previewDeletedFile,revalidateDeletedFile,backupDeletedFile,applyDeletedFile,previewModifiedFile,backupModifiedFile,applyModifiedFile,previewCommittedFile,backupCommittedFile,applyCommittedFile,previewAddedFile,backupAddedFile,applyAddedFile};
