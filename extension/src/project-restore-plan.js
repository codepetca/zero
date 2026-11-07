'use strict';
const {inertGitConfigKey}=require('./git-config-keys');
const {conversionSettings}=require('./git-conversion-settings');
// This review token is read-only. It cannot apply a restore or authorize a
// later write; a future implementation must establish its own mutation safety.
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {previewProjectVersion}=require('./project-version-preview');
const {inspectProjectRestore,assertNoUnresolvedFileRestore}=require('./git-retained-recovery');
const exec=promisify(execFile), plans=new WeakMap(), prepared=new WeakMap(), retained=new WeakMap();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=()=>new Error('Project state changed or is unsupported. Review the restore again.');
const baseEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
const env={...baseEnv,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_ATTR_NOSYSTEM:'1',GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'};
async function git(root,args,settings=env,conversion) {
  const conversions=conversion?['-c',`core.autocrlf=${conversion.autocrlf}`,'-c',`core.eol=${conversion.eol}`,'-c','core.safecrlf=false']:[];
  const {stdout}=await exec('git',['--no-pager','-c','core.fsmonitor=false',...conversions,...args],{cwd:root,env:settings,encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024});
  return new TextDecoder('utf-8',{fatal:true}).decode(stdout);
}
function records(value) {if(value&&!value.endsWith('\0'))throw fail();return value.split('\0').filter(Boolean);}
const {safePath:safe,portableWindowsPath:portableRestorePath,potentialWindowsShortName,overlaps}=require('./windows-path-policy');
async function absent(file) {try{await fs.lstat(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
async function directBranch(root,branch) {
  try {await git(root,['symbolic-ref','--quiet','--no-recurse',branch]);}
  catch(error) {if(error.code===1)return;throw error;}
  throw fail();
}
async function regular(file,max) {
  const info=await fs.lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>max)throw fail();
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const before=await handle.stat();
    if(!before.isFile()||before.nlink!==1||before.dev!==info.dev||before.ino!==info.ino||before.size!==info.size)throw fail();
    const data=await handle.readFile(),after=await fs.lstat(file);
    if(data.length!==before.size||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw fail();
    return {hash:hash(data),dev:before.dev,ino:before.ino,size:before.size,mode:before.mode,mtime:before.mtimeMs};
  } finally {await handle.close();}
}
async function changedPath(root,file,budget) {
  let current=root;const parts=file.name.split('/');
  for(let i=0;i<parts.length;i++) {
    const names=await fs.readdir(current),fold=value=>value.normalize('NFC').toLowerCase();
    if(names.some(name=>name!==parts[i]&&fold(name)===fold(parts[i])))throw new Error('A differently named file or folder collides with this restore. Your files are preserved.');
    current=path.join(current,parts[i]);let info;
    try{info=await fs.lstat(current);}catch(error){if(error.code==='ENOENT'&&!file.current)return null;throw fail();}
    if(info.isSymbolicLink())throw fail();
    if(i<parts.length-1){if(!info.isDirectory())throw fail();continue;}
    // A target-only path must be absent, including empty directories and aliases.
    if(!file.current)throw fail();
    budget.bytes+=info.size;if(budget.bytes>64*1024*1024)throw fail();
    return regular(current,64*1024*1024);
  }
}
// Capture existing parent identities and all directories that would be created.
// Reject case and Unicode aliases even on a case-sensitive host, so the same
// reviewed name cannot refer to another directory on a different filesystem.
async function inspectParents(root,files) {
  const existing=new Map(),missing=new Set();
  const key=name=>name.normalize('NFC').toLowerCase();
  for(const file of files) {
    let current=root,relative='',absentParent=false;
    for(const part of file.name.split('/').slice(0,-1)) {
      relative=relative?`${relative}/${part}`:part;
      if(absentParent){missing.add(relative);continue;}
      const entries=await fs.readdir(current);
      if(entries.some(name=>name!==part&&key(name)===key(part)))throw new Error('A differently named folder collides with this restore. Your files are preserved.');
      current=path.join(current,part);
      let info;try{info=await fs.lstat(current);}catch(error){if(error.code!=='ENOENT')throw error;absentParent=true;missing.add(relative);continue;}
      if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(current)!==current)throw fail();
      existing.set(relative,{dev:info.dev,ino:info.ino});
    }
  }
  const directories=[...missing].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
  if(directories.length>2000)throw new Error('This restore needs too many folders to create safely.');
  const aliases=new Map();for(const name of [...existing.keys(),...directories]){const folded=key(name);if(aliases.has(folded)&&aliases.get(folded)!==name)throw fail();aliases.set(folded,name);}
  return {existing:[...existing].sort(([a],[b])=>a.localeCompare(b)),directories};
}
async function pendingRestore(root,dot,{only,requireJournal=false}={}) {
  for(const entry of await fs.readdir(dot,{withFileTypes:true})) {
    if(!entry.name.startsWith('zero-project-restore-recovery-'))continue;
    if(only && entry.name!==only)continue;
    if(!entry.isDirectory()||entry.isSymbolicLink())throw fail();
    const log=path.join(dot,entry.name,'apply-journal.jsonl');
    if(await absent(log)){if(requireJournal)return entry.name;continue;}
    try {
      const identity=await regular(log,4*1024*1024),raw=(await readReviewed(log,identity)).toString('utf8');
      if(!raw.endsWith('\n'))return entry.name;
      const lines=raw.trimEnd().split('\n').map(line=>JSON.parse(line)),start=lines[0];
      const receiptFile=path.join(dot,entry.name,'pinned.json'),receiptIdentity=await regular(receiptFile,16384);
      const pin=JSON.parse((await readReviewed(receiptFile,receiptIdentity)).toString('utf8'));
      const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
      if(!start||![1,2].includes(start.schema)||start.event!=='start'||!oid(start.head)||!oid(start.commit)||
         !/^refs\/heads\/[^\s]+$/.test(start.branch)||!/^refs\/zero\/project-restore\/[a-f0-9]{32}$/.test(start.ref)||
         !Array.isArray(start.files)||start.files.length>2000||pin.status!=='pinned'||pin.commit!==start.commit||
         pin.head!==start.head||pin.branch!==start.branch||pin.ref!==start.ref||!oid(pin.selected))return entry.name;
      let cursor=1;
      const expect=(event,index,name)=>{
        const row=lines[cursor++];return row&&row.event===event&&(index===undefined||row.index===index)&&
          (name===undefined||row.name===name)&&(event!=='installed'||/^[a-f0-9]{64}$/.test(row.sha256));
      };
      if(start.schema===2) {
        if(!Array.isArray(start.directories)||!start.directories.length||start.directories.length>2000||new Set(start.directories.map(name=>typeof name==='string'?name.normalize('NFC').toLowerCase():name)).size!==start.directories.length||start.directories.some((name,i)=>typeof name!=='string'||!safe(name)||!start.files.some(file=>file?.target&&file.name.startsWith(name+'/'))||(i>0&&name.split('/').length<start.directories[i-1].split('/').length)))return entry.name;
        for(let i=0;i<start.directories.length;i++)if(!expect('mkdir-intent',i,start.directories[i])||!expect('mkdir-complete',i,start.directories[i]))return entry.name;
      }
      for(let i=0;i<start.files.length;i++) {
        const file=start.files[i];if(!file||!safe(file.name)||(!file.current&&!file.target))return entry.name;
        if(file.current&&(!expect('move-intent',i,file.name)||!expect('moved',i)))return entry.name;
        if(file.target&&(!expect('install-intent',i,file.name)||!expect('installed',i)))return entry.name;
      }
      if(!expect('index-intent')||!expect('index-installed')||!expect('ref-intent')||!expect('complete')||cursor!==lines.length)return entry.name;
      const line=async args=>(await git(root,args)).trim();
      await directBranch(root,start.ref);await directBranch(root,start.branch);
      if(await line(['rev-parse','--verify',start.ref])!==start.commit ||
         await line(['show','-s','--format=%P',start.commit])!==start.head ||
         await line(['rev-parse','--verify',`${start.commit}^{tree}`])!==await line(['rev-parse','--verify',`${pin.selected}^{tree}`]))return entry.name;
      await git(root,['merge-base','--is-ancestor',start.commit,start.branch]);
    } catch {return entry.name;}
  }
  return false;
}
// Read-only completion check for other guarded operations. Missing journals,
// malformed receipts, moved refs and changed folder identities fail closed.
async function validatedCompletedProjectRestore(root,name) {
  if(typeof name!=='string'||!/^zero-project-restore-recovery-[A-Za-z0-9]+$/.test(name))return false;
  const dot=path.join(root,'.git'),folder=path.join(dot,name);
  try {
    const before=await fs.lstat(folder);if(!before.isDirectory()||before.isSymbolicLink())return false;
    if(await pendingRestore(root,dot,{only:name,requireJournal:true}))return false;
    const inspection=await inspectProjectRestore(root,name);
    if(inspection.events.at(-1)!=='complete'||!inspection.indexHash)return false;
    const json=async name=>{const file=path.join(folder,name);return JSON.parse((await readReviewed(file,await regular(file,16384))).toString('utf8'));};
    const pin=await json('pinned.json'),prepared=await json('prepared.json'),intent=await json('pin-intent.json');
    if(pin.head!==inspection.head||pin.selected!==inspection.selected||pin.branch!==inspection.branch)return false;
    if(pin.schema!==1||pin.status!=='pinned'||prepared.schema!==1||prepared.status!=='prepared'||intent.schema!==1||intent.status!=='pin-intended'||
       ['head','selected','branch','tree','commit'].some(key=>prepared[key]!==pin[key]||intent[key]!==pin[key])||intent.ref!==pin.ref)return false;
    if((await git(root,['rev-parse','--verify',`${pin.commit}^{tree}`])).trim()!==pin.tree)return false;
    if((await regular(path.join(folder,'index'),4*1024*1024)).hash!==inspection.indexHash)return false;
    const journalFile=path.join(folder,'apply-journal.jsonl'),journal=JSON.parse('['+(await readReviewed(journalFile,await regular(journalFile,4*1024*1024))).toString('utf8').trimEnd().split('\n').join(',')+']');
    if(journal[0].indexHash!==inspection.indexHash)return false;
    let total=0,targetTotal=0;
    for(const file of inspection.files) {
      if(file.hasBackup) {
        const copy=await regular(path.join(folder,`file-${file.index}`),64*1024*1024);total+=copy.size;
        if(total>64*1024*1024||copy.hash!==file.backupHash)return false;
        const moved=await regular(path.join(folder,`moved-${file.index}`),64*1024*1024);
        if(moved.hash!==file.backupHash)return false;
      }
      if(file.kind!=='deleted') {
        const installed=journal.find(row=>row.event==='installed'&&row.index===file.index);
        const targetFile=path.join(folder,`target-${file.index}`),targetInfo=await fs.lstat(targetFile);
        targetTotal+=targetInfo.size;
        if(targetTotal>64*1024*1024||!installed||!/^[a-f0-9]{64}$/.test(installed.sha256||'')||(await regular(targetFile,64*1024*1024)).hash!==installed.sha256)return false;
      }
    }
    const after=await fs.lstat(folder);
    if(!after.isDirectory()||after.isSymbolicLink()||before.dev!==after.dev||before.ino!==after.ino)return false;
    return {commit:pin.commit,branch:pin.branch};
  } catch {return false;}
}
async function capture(root,commit,guard,binding) {
  await guard();
  if(binding) {if(binding.root!==root||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')throw fail();binding.assertCurrentNow();}
  const rootInfo=await fs.lstat(root),dot=path.join(root,'.git');
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||await fs.realpath(root)!==root)throw fail();
  const meta=await fs.lstat(dot);if(!meta.isDirectory()||meta.isSymbolicLink())throw fail();
  await assertNoUnresolvedFileRestore(root);
  const pending=await pendingRestore(root,dot);
  if(pending)throw new Error(`A previous project restore needs recovery inspection before another restore. Use Inspect recovery copies → Project restore to inspect ${path.join(dot,pending)}, then inspect project files and Source Control. After resolving any incomplete changes, move that entire recovery folder to a safe location outside this project to allow another restore. Keep the folder and its contents; moving it does not repair the project or prove the restore completed.`);
  for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG','index.lock','shallow','info/grafts','info/attributes','objects/info/alternates'])if(!await absent(path.join(dot,name)))throw fail();
  for(const name of await fs.readdir(dot))if(/^zero-.*(?:\.lock|recovery\.json)$/i.test(name)) {
    const file=path.join(dot,name),info=await fs.lstat(file);
    if(!binding||!binding.ownsLock(file,info))throw fail();
  }
  if(!await absent(path.join(dot,'refs','zero','pending-finish')))throw fail();
  const config=await regular(path.join(dot,'config'),1024*1024),index=await regular(path.join(dot,'index'),4*1024*1024);
  const keys=records(await git(root,['config','--local','--no-includes','--name-only','--null','--list']));
  if(keys.some(key=>!inertGitConfigKey(key)))throw fail();
  const conversion=await conversionSettings(root);
  const line=async args=>(await git(root,args)).trim();
  if(await line(['rev-parse','--shared-index-path']))throw new Error('Project restore does not support split Git indexes.');
  if(await line(['rev-parse','--is-shallow-repository'])!=='false'||(await line(['for-each-ref','--format=%(refname)','refs/replace/']))|| (await line(['for-each-ref','--format=%(refname)','refs/zero/pending-finish'])))throw fail();
  const branch=await line(['symbolic-ref','--quiet','--no-recurse','HEAD']);if(!branch.startsWith('refs/heads/'))throw fail();
  await directBranch(root,branch);
  const flags=records(await git(root,['ls-files','-v','-z']));if(flags.some(value=>!value.startsWith('H ')))throw fail();
  const status=records(await git(root,['status','--porcelain=v1','-z','--no-renames','--untracked-files=all'],env,conversion));
  if(status.some(value=>!value.startsWith('?? ')))throw new Error('Save or review tracked changes in Source Control before restoring a project version.');
  const preview=await previewProjectVersion(root,commit,{assertTrusted:guard});
  if(preview.files.some(file=>!portableRestorePath(file.name)))throw new Error('This version contains a path that cannot be restored safely across platforms. Your files are preserved.');
  if(preview.files.some(file=>potentialWindowsShortName(file.name)))throw new Error('This version contains a potential Windows short-name alias (such as NAME~1). Restore cannot proceed safely. Your files are preserved.');
  const indexRows=records(await git(root,['ls-files','--stage','-z']));
  if(indexRows.some(row=>!/^(?:100644|100755) (?:[a-f0-9]{40}|[a-f0-9]{64}) 0\t[^\0]+$/.test(row)))throw fail();
  const others=records(await git(root,['ls-files','--others','--exclude-standard','-z']));
  const ignored=records(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z']));
  // Include normal user ignore configuration as well as the isolated Git config.
  const normal={...baseEnv,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'};
  const userIgnored=records(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'],normal));
  if([...others,...ignored,...userIgnored].some(name=>!safe(name)))throw fail();
  if(preview.files.some(file=>[...others,...ignored,...userIgnored].some(name=>overlaps(file.name,name))))throw new Error('An untracked or ignored file collides with this version. Your files are preserved.');
  const parents=await inspectParents(root,preview.files);
  const budget={bytes:0},files=[];
  for(const file of preview.files)files.push({name:file.name,identity:await changedPath(root,file,budget)});
  await guard();
  return {root,rootIdentity:`${rootInfo.dev}:${rootInfo.ino}`,branch,preview,config,index,indexRows,others:others.sort(),ignored:ignored.sort(),userIgnored:userIgnored.sort(),parents,files,conversion};
}
async function reviewProjectRestore(root,commit,{beforeMutation}={}) {
  if(typeof beforeMutation!=='function')throw new Error('A trust and saved-editor guard is required.');
  const state=await capture(root,commit,beforeMutation);
  if(JSON.stringify(state)!==JSON.stringify(await capture(root,commit,beforeMutation)))throw fail();
  const plan=Object.freeze({head:state.preview.head,commit,files:state.preview.files});
  plans.set(plan,{state,beforeMutation});return plan;
}
// A correction target must originate in the private inverse-plan registry.
// The caller cannot substitute a commit or a different mutation binding.
async function reviewInverseCorrection(receipt,{binding}={}) {
  const inverse=await require('./change-undo').consumeCorrection(receipt,binding);
  const guard=async()=>{
    binding.assertCurrentNow();await inverse.beforeMutation();
    await directBranch(inverse.root,inverse.ref);
    if((await git(inverse.root,['rev-parse','--verify',inverse.ref])).trim()!==inverse.commit)throw fail();
  };
  const state=await capture(inverse.root,inverse.commit,guard,binding);
  if(state.preview.head!==inverse.head||state.branch!==inverse.branch||JSON.stringify(state.preview.files.map(file=>file.name))!==JSON.stringify([...inverse.files].sort())||JSON.stringify(state.conversion)!==JSON.stringify(inverse.conversion))throw fail();
  if(JSON.stringify(state)!==JSON.stringify(await capture(inverse.root,inverse.commit,guard,binding)))throw fail();
  const plan=Object.freeze({head:state.preview.head,commit:inverse.commit,files:state.preview.files});
  plans.set(plan,{state,beforeMutation:guard,message:'Undo finished change'});return plan;
}
async function revalidateProjectRestore(plan) {
  const saved=plans.get(plan);if(!saved)throw new Error('Review the project version again.');
  plans.delete(plan);
  if(JSON.stringify(saved.state)!==JSON.stringify(await capture(saved.state.root,saved.state.preview.commit,saved.beforeMutation)))throw fail();
  return true;
}
async function readReviewed(file,expected) {
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const stat=await handle.stat();
    if(!stat.isFile()||stat.nlink!==1||stat.dev!==expected.dev||stat.ino!==expected.ino||stat.size!==expected.size||stat.mode!==expected.mode||stat.mtimeMs!==expected.mtime)throw fail();
    const data=await handle.readFile(),after=await fs.lstat(file);
    if(data.length!==expected.size||hash(data)!==expected.hash||after.isSymbolicLink()||after.dev!==expected.dev||after.ino!==expected.ino||after.size!==expected.size||after.mtimeMs!==expected.mtime)throw fail();
    return data;
  } finally {await handle.close();}
}
async function writeCopy(filename,data) {
  const handle=await fs.open(filename,'wx',0o600);
  try {await handle.writeFile(data);await handle.sync();} finally {await handle.close();}
  if(hash(await fs.readFile(filename))!==hash(data))throw fail();
}
async function syncDirectory(directory) {
  const handle=await fs.open(directory,'r');
  try {await handle.sync();} finally {await handle.close();}
}
async function restoreRefParents(dot) {
  const refs=path.join(dot,'refs'),zero=path.join(refs,'zero'),restore=path.join(zero,'project-restore'),identities=[];
  for(const [index,dir] of [refs,zero,restore].entries()) {
    if(index)try{await fs.mkdir(dir,{mode:0o700});await syncDirectory(path.dirname(dir));}catch(error){if(error.code!=='EEXIST')throw error;}
    const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();
    identities.push({dir,dev:info.dev,ino:info.ino});
  }
  return async()=>{for(const saved of identities){const info=await fs.lstat(saved.dir);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==saved.dev||info.ino!==saved.ino||await fs.realpath(saved.dir)!==saved.dir)throw fail();}};
}
async function syncLooseGitFile(dot,file,expected) {
  const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw fail();
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {const actual=await handle.stat();if(actual.dev!==info.dev||actual.ino!==info.ino||actual.size!==info.size)throw fail();if(expected!==undefined&&(await handle.readFile('utf8'))!==expected)throw fail();await handle.sync();const named=await fs.lstat(file);if(named.dev!==actual.dev||named.ino!==actual.ino||named.isSymbolicLink())throw fail();}finally{await handle.close();}
  let dir=path.dirname(file);
  while(true){const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();await syncDirectory(dir);if(dir===dot)break;const parent=path.dirname(dir);if(parent===dir)throw fail();dir=parent;}
}
async function inspectLooseObjectParents(dot) {
  const objects=path.join(dot,'objects'),root=await fs.lstat(objects);
  if(!root.isDirectory()||root.isSymbolicLink()||await fs.realpath(objects)!==objects)throw fail();
  for(const name of await fs.readdir(objects))if(/^[a-f0-9]{2}$/.test(name)) {
    const dir=path.join(objects,name),info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();
  }
}
// Consumes the review token and preserves a private copy. It does not create
// an apply token or change project files, the live index, branches or refs.
async function backupProjectRestore(plan,{binding}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  const saved=plans.get(plan);if(!saved)throw new Error('Review the project version again.');
  plans.delete(plan);
  // Fail before making a recovery directory: directory durability and the
  // subsequent application protocol have not been established on Windows.
  if(process.platform==='win32')throw new Error('Project restore application is not supported on Windows yet.');
  const {state,beforeMutation}=saved;saved.binding=binding;
  if(JSON.stringify(state)!==JSON.stringify(await capture(state.root,state.preview.commit,beforeMutation,binding)))throw fail();
  const dot=path.join(state.root,'.git');let recoveryPath;
  try {
    recoveryPath=await fs.mkdtemp(path.join(dot,'zero-project-restore-recovery-'));
    await fs.chmod(recoveryPath,0o700);
    await syncDirectory(dot);
    const indexBytes=await readReviewed(path.join(dot,'index'),state.index);
    await writeCopy(path.join(recoveryPath,'index'),indexBytes);
    const manifest={schema:1,head:state.preview.head,selected:state.preview.commit,branch:state.branch,index:{copy:'index',sha256:state.index.hash},files:[]};
    for(let i=0;i<state.files.length;i++) {
      const file=state.files[i],change=state.preview.files[i];
      if(file.name!==change.name)throw fail();
      if(!file.identity){manifest.files.push({name:file.name,kind:change.kind,missing:true});continue;}
      const bytes=await readReviewed(path.join(state.root,...file.name.split('/')),file.identity);
      const copy=`file-${i}`;
      await writeCopy(path.join(recoveryPath,copy),bytes);
      manifest.files.push({name:file.name,kind:change.kind,copy,sha256:file.identity.hash,mode:file.identity.mode});
    }
    if(JSON.stringify(state)!==JSON.stringify(await capture(state.root,state.preview.commit,beforeMutation,binding)))throw fail();
    await writeCopy(path.join(recoveryPath,'manifest.json'),Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
    await syncDirectory(recoveryPath);
    return Object.freeze({recoveryPath,head:state.preview.head,commit:state.preview.commit});
  } catch(error) {
    if(recoveryPath)error.recoveryPath=recoveryPath;
    throw error;
  }
}
// Prepare immutable Git objects and a durable receipt only. This is not an
// apply operation: the returned commit is deliberately not attached to a ref.
// A future applier must independently guard every write and recover partial
// application; the receipt alone is not permission to overwrite files.
async function prepareProjectRestore(plan,{name,email,binding,_testBeforeObjectSync}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  const saved=plans.get(plan);if(!saved)throw new Error('Review the project version again.');
  if(typeof name!=='string'||typeof email!=='string'||!name.trim()||!email.trim()||
     /[\x00-\x1f\x7f<>]/.test(name)||/[\x00-\x20\x7f<>]/.test(email)||name.length>200||email.length>254)
    throw new Error('A valid commit name and email are required.');
  let recovery;
  try {
    recovery=await backupProjectRestore(plan,{binding});
    const {state,beforeMutation}=saved;
    const tree=(await git(state.root,['rev-parse','--verify',`${state.preview.commit}^{tree}`])).trim();
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(tree))throw fail();
    await inspectLooseObjectParents(path.join(state.root,'.git'));
    const commit=(await git(state.root,['-c',`user.name=${name}`,'-c',`user.email=${email}`,
      'commit-tree',tree,'-p',state.preview.head,'-m',saved.message||'Restore project version'])).trim();
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit))throw fail();
    const metadata=(await git(state.root,['show','-s','--format=%T%n%P',commit])).trim().split('\n');
    if(metadata.length!==2||metadata[0]!==tree||metadata[1]!==state.preview.head)throw fail();
    if(_testBeforeObjectSync)await _testBeforeObjectSync();
    // Fail closed if Git reused a packed object: we cannot prove durability of
    // an arbitrary existing pack through this new-object path.
    await syncLooseGitFile(path.join(state.root,'.git'),path.join(state.root,'.git','objects',commit.slice(0,2),commit.slice(2)));
    if(JSON.stringify(state)!==JSON.stringify(await capture(state.root,state.preview.commit,beforeMutation,binding)))throw fail();
    const receipt={schema:1,status:'prepared',head:state.preview.head,selected:state.preview.commit,
      branch:state.branch,tree,commit};
    await writeCopy(path.join(recovery.recoveryPath,'prepared.json'),Buffer.from(JSON.stringify(receipt,null,2)+'\n'));
    await syncDirectory(recovery.recoveryPath);
    const result=Object.freeze({...receipt,recoveryPath:recovery.recoveryPath});
    prepared.set(result,saved);
    return result;
  } catch(error) {
    if(recovery)error.recoveryPath=recovery.recoveryPath;
    throw error;
  }
}
// Pin the prepared commit before any future application. The intent is synced
// before the ref is created, so a stopped operation has a discoverable record.
// This still does not apply the restore or authorize recovery writes.
async function retainPreparedProjectRestore(result,{_testBeforeRef,_testBeforeRefSync}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  const saved=prepared.get(result);if(!saved)throw new Error('Review the project version again.');
  prepared.delete(result);
  const {state,beforeMutation}=saved;
  try {
    if(JSON.stringify(state)!==JSON.stringify(await capture(state.root,state.preview.commit,beforeMutation,saved.binding)))throw fail();
    const nonce=crypto.randomBytes(16).toString('hex'),ref=`refs/zero/project-restore/${nonce}`;
    const intent={schema:1,status:'pin-intended',head:result.head,selected:result.selected,
      branch:result.branch,tree:result.tree,commit:result.commit,ref};
    await writeCopy(path.join(result.recoveryPath,'pin-intent.json'),Buffer.from(JSON.stringify(intent,null,2)+'\n'));
    await syncDirectory(result.recoveryPath);
    const checkRefParents=await restoreRefParents(path.join(state.root,'.git'));
    if(_testBeforeRef)await _testBeforeRef();
    saved.binding?.assertCurrentNow();
    await checkRefParents();
    await git(state.root,['-c',`core.hooksPath=${os.devNull}`,'update-ref','--no-deref',ref,result.commit,'0'.repeat(result.commit.length)]);
    await checkRefParents();
    if((await git(state.root,['rev-parse','--verify',ref])).trim()!==result.commit)throw fail();
    if(_testBeforeRefSync)await _testBeforeRefSync();
    await checkRefParents();await syncLooseGitFile(path.join(state.root,'.git'),path.join(state.root,'.git',...ref.split('/')),`${result.commit}\n`);
    await checkRefParents();if((await git(state.root,['rev-parse','--verify',ref])).trim()!==result.commit)throw fail();
    await writeCopy(path.join(result.recoveryPath,'pinned.json'),Buffer.from(JSON.stringify({...intent,status:'pinned'},null,2)+'\n'));
    await syncDirectory(result.recoveryPath);
    const receipt=Object.freeze({...intent,status:'pinned',recoveryPath:result.recoveryPath});
    retained.set(receipt,saved);
    return receipt;
  } catch(error) {error.recoveryPath=result.recoveryPath;throw error;}
}
async function blob(root,object) {
  const {stdout}=await exec('git',['--no-pager','-c','core.fsmonitor=false','cat-file','blob',object],
    {cwd:root,env,encoding:'buffer',timeout:10000,maxBuffer:64*1024*1024});
  return stdout;
}
async function journal(file,entry) {
  const handle=await fs.open(file,'a',0o600);
  try {await handle.writeFile(JSON.stringify(entry)+'\n');await handle.sync();} finally {await handle.close();}
}
async function parentDirectory(root,name,identities) {
  let current=root,relative='';
  for(const part of name.split('/').slice(0,-1)) {
    const aliases=await fs.readdir(current),fold=value=>value.normalize('NFC').toLowerCase();
    if(aliases.some(value=>value!==part&&fold(value)===fold(part)))throw fail();
    relative=relative?`${relative}/${part}`:part;current=path.join(current,part);const info=await fs.lstat(current),expected=identities.get(relative);
    if(!expected||!info.isDirectory()||info.isSymbolicLink()||info.dev!==expected.dev||info.ino!==expected.ino||await fs.realpath(current)!==current)throw fail();
  }
  return current;
}
async function rejectWorkingAttributes(root) {
  const normal={...baseEnv,GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'};
  for(const [args,settings] of [
    [['ls-files','--others','--exclude-standard','-z'],env],
    [['ls-files','--others','--ignored','--exclude-standard','-z'],env],
    [['ls-files','--others','--ignored','--exclude-standard','-z'],normal]
  ]) {
    if(records(await git(root,args,settings)).some(name=>name.split('/').at(-1).toLowerCase()==='.gitattributes'))
      throw new Error('Project restore does not support Git attributes.');
  }
}
const stockAttributes=new Map([
  ['.gitattributes',Buffer.from('* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n')],
  ['.zero-build/.gitattributes',Buffer.from('* -text\n')]
]);
async function verifyAttributes(root,attributes) {
  for(const {name,identity,parentIdentity} of attributes||[]) {
    const filename=path.join(root,...name.split('/')),parent=path.dirname(filename),info=await fs.lstat(parent);
    if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==parentIdentity.dev||info.ino!==parentIdentity.ino||await fs.realpath(parent)!==parent)throw fail();
    await readReviewed(filename,identity);
  }
}
async function supportedAttributes(root,state) {
  const names=state.indexRows.map(row=>row.split('\t')[1]).filter(name=>name.split('/').at(-1).toLowerCase()==='.gitattributes');
  if(state.preview.files.some(file=>file.name.split('/').at(-1).toLowerCase()==='.gitattributes') ||
     names.some(name=>!stockAttributes.has(name)) || new Set(names).size!==names.length)throw new Error('Project restore does not support custom Git attributes.');
  await rejectWorkingAttributes(root);
  if(!names.length)return null;
  const attributes=[];
  for(const name of names) {
    const row=state.indexRows.find(row=>row.split('\t')[1]===name),object=/^(?:100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t/.exec(row)?.[1];
    if(!object||!Buffer.from(await git(root,['cat-file','blob',object])).equals(stockAttributes.get(name)))throw new Error('Project restore does not support custom Git attributes.');
    const filename=path.join(root,...name.split('/')),parent=path.dirname(filename),info=await fs.lstat(parent);
    if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(parent)!==parent)throw fail();
    const identity=await regular(filename,4096);
    const bytes=await readReviewed(filename,identity);
    const rules=name==='.gitattributes'?Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')):bytes;
    if(!rules.equals(stockAttributes.get(name)))throw new Error('Project restore does not support custom Git attributes.');
    attributes.push({name,identity,parentIdentity:{dev:info.dev,ino:info.ino}});
  }
  return attributes;
}
// Applies only the reviewed ordinary-file case. A failure retains the journal,
// copies and pinned commit; it does not attempt an uncertain automatic rollback.
// This sequence is not atomic with respect to external editors or Git processes.
async function applyRetainedProjectRestore(receipt,{_testBeforeStep}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
  const saved=retained.get(receipt);if(!saved)throw new Error('Review the project version again.');
  retained.delete(receipt);
  const {state,beforeMutation}=saved,root=state.root,dot=path.join(root,'.git');
  const log=path.join(receipt.recoveryPath,'apply-journal.jsonl'),lock=path.join(dot,'index.lock');
  const dotIdentity=await fs.lstat(dot);
  let lockHandle,lockIdentity;
  const checkConversion=async()=>{if(JSON.stringify(await conversionSettings(root))!==JSON.stringify(state.conversion))throw new Error('Git line-ending settings changed. Inspect the retained restore copies before continuing.');};
  const step=async name=>{await beforeMutation();saved.binding?.assertCurrentNow();if(_testBeforeStep)await _testBeforeStep(name);await checkConversion();};
  const checkHead=async()=>{
    if((await git(root,['symbolic-ref','--quiet','--no-recurse','HEAD'])).trim()!==state.branch ||
       (await git(root,['rev-parse','--verify','HEAD^{commit}'])).trim()!==state.preview.head ||
       (await git(root,['rev-parse','--verify',receipt.ref])).trim()!==receipt.commit)throw fail();
    await directBranch(root,state.branch);
  };
  try {
    if(process.platform==='win32')throw new Error('Project restore application is not supported on Windows yet.');
    await checkConversion();
    const mask=process.umask();if(mask&0o400)throw new Error('Project restore requires owner read access under the current umask.');
    if((mask&0o100)&&(state.parents.directories.length||state.preview.files.some(file=>file.target?.mode==='100755')))throw new Error('Project restore requires owner execute access under the current umask.');
    const attributes=await supportedAttributes(root,state);
    // Stock attributes already require bounded Git checkout materialization
    // below. That same path handles reviewed effective settings; the raw-blob
    // path without reviewed attributes still requires conversion disabled.
    if(state.conversion.autocrlf!=='false'&&!attributes)throw new Error('Project restore requires automatic line-ending conversion to be disabled unless exact stock attributes are present.');
    const parentIdentities=new Map(state.parents.existing);
    // Missing parents are verified before application and created only after
    // the durable journal and index lock exist.
    const stagedIndex=path.join(receipt.recoveryPath,'target-index');
    await git(root,['read-tree',receipt.commit],{...env,GIT_INDEX_FILE:stagedIndex});
    const indexBytes=await fs.readFile(stagedIndex);if(indexBytes.length>4*1024*1024)throw fail();
    const targetIndexHash=hash(indexBytes);
    const targetNames=state.preview.files.filter(change=>change.target).map(change=>change.name);
    const materialized=path.join(receipt.recoveryPath,'materialized');
    if(attributes&&targetNames.length) {
      // Text checkout can add at most one CR per input byte. Bound the
      // materialized copies before asking Git to write them to disk.
      let sourceBytes=0;
      for(const change of state.preview.files)if(change.target) {
        const sizeText=(await git(root,['cat-file','-s',change.target.object])).trim();
        if(!/^\d+$/.test(sizeText))throw fail();
        const size=Number(sizeText);if(!Number.isSafeInteger(size))throw fail();
        sourceBytes+=size;if(sourceBytes>32*1024*1024)throw fail();
      }
      await fs.mkdir(materialized,{mode:0o700});
      await git(root,['checkout-index',`--prefix=${materialized}${path.sep}`,'--',...targetNames],{...env,GIT_INDEX_FILE:stagedIndex},state.conversion);
      await verifyAttributes(root,attributes);await checkConversion();
    }
    let bytes=0;const targetHashes=[];
    for(let i=0;i<state.preview.files.length;i++) {
      const change=state.preview.files[i];
      if(change.target) {
        let data;
        if(attributes) {const filename=path.join(materialized,...change.name.split('/')),identity=await regular(filename,64*1024*1024);data=await readReviewed(filename,identity);}
        else data=await blob(root,change.target.object);
        bytes+=data.length;if(bytes>64*1024*1024)throw fail();
        targetHashes[i]=hash(data);await writeCopy(path.join(receipt.recoveryPath,`target-${i}`),data);
      }
    }
    // A detached private Git directory shares only this repository's common
    // refs. It permits update-ref while the real worktree HEAD is locked.
    const alternate=path.join(receipt.recoveryPath,'ref-gitdir');await fs.mkdir(alternate,{mode:0o700});const alternateIdentity=await fs.lstat(alternate);
    await writeCopy(path.join(alternate,'HEAD'),Buffer.from(state.preview.head+'\n'));
    await writeCopy(path.join(alternate,'commondir'),Buffer.from(dot+'\n'));await syncDirectory(alternate);
    if(JSON.stringify(state)!==JSON.stringify(await capture(root,state.preview.commit,beforeMutation,saved.binding)))throw fail();
    await checkHead();
    const directories=state.parents.directories;
    await writeCopy(log,Buffer.from(JSON.stringify({schema:directories.length?2:1,event:'start',head:state.preview.head,
      commit:receipt.commit,branch:state.branch,ref:receipt.ref,indexHash:state.index.hash,targetIndexHash,
      files:state.preview.files,...(directories.length?{directories}:{})})+'\n'));
    await syncDirectory(receipt.recoveryPath);
    lockHandle=await fs.open(lock,'wx',0o600);lockIdentity=await lockHandle.stat();
    await lockHandle.writeFile(indexBytes);await lockHandle.sync();
    await readReviewed(path.join(dot,'index'),state.index);
    await step('before-files');await assertNoUnresolvedFileRestore(root);await checkHead();await verifyAttributes(root,attributes);
    for(let i=0;i<directories.length;i++) {
      const name=directories[i],parent=await parentDirectory(root,name,parentIdentities),dir=path.join(root,...name.split('/'));
      await step(`mkdir-${i}`);await checkHead();await verifyAttributes(root,attributes);
      await parentDirectory(root,name,parentIdentities);
      const leaf=path.basename(dir),fold=value=>value.normalize('NFC').toLowerCase();
      if((await fs.readdir(parent)).some(value=>fold(value)===fold(leaf)))throw fail();
      await journal(log,{event:'mkdir-intent',index:i,name});
      await fs.mkdir(dir,{mode:0o700});
      if(_testBeforeStep)await _testBeforeStep(`mkdir-created-${i}`);
      const info=await fs.lstat(dir);
      if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();
      parentIdentities.set(name,{dev:info.dev,ino:info.ino});
      await syncDirectory(parent);await syncDirectory(dir);
      await journal(log,{event:'mkdir-complete',index:i,name});
    }
    for(let i=0;i<state.preview.files.length;i++) {
      const change=state.preview.files[i],file=state.files[i],filename=path.join(root,...change.name.split('/'));
      let parent=await parentDirectory(root,change.name,parentIdentities);
      await step(`file-${i}`);await checkHead();await verifyAttributes(root,attributes);
      parent=await parentDirectory(root,change.name,parentIdentities);
      const leaf=path.basename(filename),fold=value=>value.normalize('NFC').toLowerCase();
      if((await fs.readdir(parent)).some(value=>value!==leaf&&fold(value)===fold(leaf)))throw fail();
      if(file.identity) {
        await readReviewed(filename,file.identity);
        await journal(log,{event:'move-intent',index:i,name:change.name});
        const moved=path.join(receipt.recoveryPath,`moved-${i}`);
        await fs.rename(filename,moved);await syncDirectory(parent);await syncDirectory(receipt.recoveryPath);
        await readReviewed(moved,file.identity);
        await journal(log,{event:'moved',index:i});
      }
      if(change.target) {
        await journal(log,{event:'install-intent',index:i,name:change.name});
        const data=await fs.readFile(path.join(receipt.recoveryPath,`target-${i}`));if(hash(data)!==targetHashes[i])throw fail();
        const originalMode=file.identity?.mode;
        const permissions=((originalMode===undefined?0o600:originalMode&0o666) |
          (change.target.mode==='100755'?(originalMode===undefined?0o100:(originalMode&0o111)|0o100):0)) & ~mask;
        const target=await fs.open(filename,'wx',permissions);
        try {await target.writeFile(data);await target.chmod(permissions);await target.sync();} finally {await target.close();}
        await syncDirectory(parent);await journal(log,{event:'installed',index:i,sha256:hash(data)});
      }
    }
    const headLock=path.join(dot,'HEAD.lock');let headHandle,headIdentity;
    try {
      await step('before-index');await checkHead();await verifyAttributes(root,attributes);await readReviewed(path.join(dot,'index'),state.index);
      headHandle=await fs.open(headLock,'wx',0o600);headIdentity=await headHandle.stat();
      await headHandle.writeFile('Zero project restore\n');await headHandle.sync();
      await checkHead();
      const lockNow=await fs.lstat(lock);if(lockNow.dev!==lockIdentity.dev||lockNow.ino!==lockIdentity.ino||hash(await fs.readFile(lock))!==targetIndexHash)throw fail();
      if(hash(await fs.readFile(stagedIndex))!==targetIndexHash)throw fail();
      await fs.chmod(stagedIndex,state.index.mode&0o777&~mask);
      const stagedIdentity=await regular(stagedIndex,4*1024*1024);
      if(stagedIdentity.hash!==targetIndexHash)throw fail();
      const stagedHandle=await fs.open(stagedIndex,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
      try {
        const info=await stagedHandle.stat();
        if(info.dev!==stagedIdentity.dev||info.ino!==stagedIdentity.ino||!info.isFile())throw fail();
        if(_testBeforeStep)await _testBeforeStep('sync-target-index');
        await stagedHandle.sync();
      } finally {await stagedHandle.close();}
      await readReviewed(stagedIndex,stagedIdentity);
      await journal(log,{event:'index-intent'});
      await fs.rename(stagedIndex,path.join(dot,'index'));await syncDirectory(dot);
      await journal(log,{event:'index-installed'});
      await step('before-ref');await checkHead();
      await readReviewed(path.join(dot,'config'),state.config);
      if(!await absent(path.join(dot,'info','attributes')))throw fail();
      await verifyAttributes(root,attributes);
      const heldIndexLock=await fs.lstat(lock);if(heldIndexLock.dev!==lockIdentity.dev||heldIndexLock.ino!==lockIdentity.ino)throw fail();
      await rejectWorkingAttributes(root);
      // Refuse to advance the branch if an editor changed any tracked file
      // while materialization was in progress.
      try {await git(root,['diff','--quiet','--no-ext-diff'],env,state.conversion);} catch(error) {if(error.code===1)throw fail();throw error;}
      await journal(log,{event:'ref-intent'});
      const altInfo=await fs.lstat(alternate),dotNow=await fs.lstat(dot);
      if(dotNow.dev!==dotIdentity.dev||dotNow.ino!==dotIdentity.ino||!dotNow.isDirectory()||dotNow.isSymbolicLink() ||
         !altInfo.isDirectory()||altInfo.isSymbolicLink()||altInfo.dev!==alternateIdentity.dev||altInfo.ino!==alternateIdentity.ino||await fs.realpath(alternate)!==alternate ||
         (await fs.readFile(path.join(alternate,'commondir'),'utf8'))!==dot+'\n' ||
         (await fs.readFile(path.join(alternate,'HEAD'),'utf8'))!==state.preview.head+'\n')throw fail();
      if(_testBeforeStep)await _testBeforeStep('head-locked');
      await checkConversion();
      const now=await fs.lstat(headLock);if(now.dev!==headIdentity.dev||now.ino!==headIdentity.ino)throw fail();
      saved.binding?.assertCurrentNow();
      await git(root,[`--git-dir=${alternate}`,'-c',`core.hooksPath=${os.devNull}`,'update-ref','--no-deref',state.branch,receipt.commit,state.preview.head]);
      if(_testBeforeStep)await _testBeforeStep('ref-updated');
    } finally {
      if(headHandle)await headHandle.close();
      if(headIdentity) {try {const now=await fs.lstat(headLock);if(now.dev===headIdentity.dev&&now.ino===headIdentity.ino)await fs.unlink(headLock);} catch(error){if(error.code!=='ENOENT')throw error;}}
    }
    await journal(log,{event:'complete'});
    return Object.freeze({commit:receipt.commit,recoveryPath:receipt.recoveryPath});
  } catch(error) {
    error.recoveryPath=receipt.recoveryPath;throw error;
  } finally {
    if(lockHandle)await lockHandle.close().catch(()=>{});
    if(lockIdentity) {
      try {const now=await fs.lstat(lock);if(now.dev===lockIdentity.dev&&now.ino===lockIdentity.ino)await fs.unlink(lock);} catch(error){if(error.code!=='ENOENT')throw error;}
    }
  }
}
function cancelProjectRestore(plan) {plans.delete(plan);}
module.exports={reviewProjectRestore,reviewInverseCorrection,revalidateProjectRestore,cancelProjectRestore,backupProjectRestore,prepareProjectRestore,retainPreparedProjectRestore,applyRetainedProjectRestore,validatedCompletedProjectRestore};
