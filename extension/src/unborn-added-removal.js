'use strict';
// Separate unborn-project protocol. Reviews are read-only and one-use; this
// module never creates a commit or updates a ref.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {constants}=require('node:fs');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {inspectUnbornHead,readOrdinaryBounded}=require('./unborn-head');
const {addedFileSource}=require('./added-file-status');
const {readStudentFileStatus}=require('./student-file-status');
const {parseStudentFileStatus}=require('./student-file-status');
const {parseIndexFlags}=require('./index-entry-flags');
const {refuseFilters}=require('./git-filter-guard');
const {assertNoUnresolvedFileRestore}=require('./git-retained-recovery');
const exec=promisify(execFile),plans=new WeakMap(),backups=new WeakMap();
const MAX_FILES=1000,MAX_BYTES=64*1024*1024;
const changed=()=>new Error('The project or unborn branch changed. Review the added file again.');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function writeDurable(file,bytes){const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
async function syncDirectory(dir){const handle=await fs.open(dir,constants.O_RDONLY|(constants.O_NONBLOCK||0)|(constants.O_NOFOLLOW||0)|(constants.O_DIRECTORY||0));try{const info=await handle.stat();if(!info.isDirectory())throw changed();await handle.sync();}finally{await handle.close();}}
const envFor=safe=>Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{...(safe?{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}:{}),GIT_ATTR_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_LITERAL_PATHSPECS:'1'});
async function git(root,args,{safe=true,index,maxBuffer=4*1024*1024}={}) {
 const env=envFor(safe);if(index)env.GIT_INDEX_FILE=index;
 return (await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env,encoding:'buffer',timeout:20000,maxBuffer})).stdout;
}
function decoded(bytes,nul=false){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(nul&&text&&!text.endsWith('\0'))throw changed();return text;}
async function absent(filename){try{await fs.lstat(filename);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
async function ordinaryParents(root,name) {
 let current=root;const parts=name.split('/');if(parts.length>128||name.length>4096)throw changed();const rootInfo=await fs.lstat(root);
 if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||await fs.realpath(root)!==root)throw changed();const result=[{name:'',dev:rootInfo.dev,ino:rootInfo.ino,mode:rootInfo.mode}];let relative='';
 for(const part of parts.slice(0,-1)){current=path.join(current,part);let info;try{info=await fs.lstat(current);}catch(error){if(error.code==='ENOENT')return false;throw error;}
  if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(current)!==current)throw changed();relative=relative?relative+'/'+part:part;result.push({name:relative,dev:info.dev,ino:info.ino,mode:info.mode});}
 return result;
}
async function fileEvidence(root,name,budget) {
 if(!await ordinaryParents(root,name))return null;const file=path.join(root,...name.split('/'));
 const value=await readOrdinaryBounded(file,MAX_BYTES,{optional:true});if(!value)return null;
 budget.bytes+=value.data.length;if(budget.bytes>MAX_BYTES)throw new Error('Project changes are too large to review safely. Use Source Control.');
 return {identity:value.identity,hash:value.hash};
}
async function capture(root,name,{own}={}) {
 const unborn=await inspectUnbornHead(root),dot=path.join(root,'.git');await assertNoUnresolvedFileRestore(root,{own});
 for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG','shallow','info/grafts','objects/info/alternates'])if(!await absent(path.join(dot,marker)))throw new Error('Finish or inspect the current Git operation in Source Control first.');
 const config=await readOrdinaryBounded(path.join(dot,'config'),1024*1024);if(!config)throw changed();
 const configNames=decoded(await git(root,['config','--local','--no-includes','--name-only','--null','--list']),true).split('\0').filter(Boolean);
 if(configNames.some(key=>/^(?:filter\.|include\.|includeif\.|core\.worktree$)/i.test(key)))throw new Error('Custom Git filters, includes or worktrees require Source Control.');
 if(decoded(await git(root,['for-each-ref','--format=%(refname)','refs/replace/'])).trim())throw new Error('Git replacement objects require Source Control.');
 if(decoded(await git(root,['rev-parse','--show-toplevel']))!==root+'\n'||decoded(await git(root,['rev-parse','--absolute-git-dir']))!==dot+'\n'||decoded(await git(root,['rev-parse','--shared-index-path'])).trim())throw new Error('This Git project cannot be reviewed safely. Use Source Control.');
 const index=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true});
 const inspect=async (_root,args)=>decoded(await git(root,args),args.includes('-z'));await refuseFilters(root,inspect);
 const raw=decoded(await git(root,['status','--porcelain=v1','-z','--no-renames','--untracked-files=all']),true),selection=addedFileSource(raw,name);
 const changes=await readStudentFileStatus(root,{safeConfig:true,standaloneOnly:true});
 if(changes.size>MAX_FILES||[...changes.values()].includes('conflict')||changes.get(name)!=='added')throw new Error('This addition cannot be reviewed safely. Use Source Control.');
 const ignored=decoded(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'],{safe:false}),true).split('\0').filter(Boolean).sort();
 const overlap=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
 if([...changes.keys()].some(item=>ignored.some(other=>overlap(item,other))))throw new Error('An ignored file is protected. Use Source Control.');
 const entries=decoded(await git(root,['ls-files','--stage','-z']),true).split('\0').filter(Boolean),indexed=new Map();
 for(const row of entries){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||indexed.has(match[3]))throw new Error('This Git index cannot be reviewed safely.');indexed.set(match[3],{mode:match[1],object:match[2]});}
 const flags=parseIndexFlags(await git(root,['ls-files','--debug','-z']));
 if(flags.size!==indexed.size||(selection.source==='index'?(!index||!indexed.has(name)||flags.get(name)!=='0'):indexed.has(name)))throw changed();
 const budget={bytes:0},files=[];for(const [item,kind]of [...changes].sort(([a],[b])=>a.localeCompare(b,'en')))files.push({name:item,kind,current:await fileEvidence(root,item,budget)});
 const selected=files.find(item=>item.name===name);if(!selected||selected.kind!=='added'||!selected.current)throw changed();
 const fileParents=await ordinaryParents(root,name);if(!fileParents)throw changed();
 const finalIndex=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true}),finalHead=await inspectUnbornHead(root);
 const indexState=value=>value?{present:true,identity:value.identity,hash:value.hash}:{present:false};
 if(!same(indexState(index),indexState(finalIndex))||!same(unborn,finalHead))throw changed();
 return {root,name,selection,unborn,config:{identity:config.identity,hash:config.hash},index:indexState(index),entries:[...indexed],flags:[...flags],raw,ignored,files,fileParents};
}
async function previewUnbornAddedFile(root,name,{beforeMutation,_testPlatform}={}) {
 if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Removing an added file is not supported on Windows yet.');
 if(typeof beforeMutation!=='function')throw new Error('Workspace trust and saved-editor checks are required.');
 await beforeMutation();const state=await capture(root,name);await beforeMutation();if(!same(state,await capture(root,name)))throw changed();
 const plan=Object.freeze({name,source:state.selection.source,status:state.selection.status,indexPresent:state.index.present});plans.set(plan,{state,beforeMutation});return plan;
}
async function revalidateUnbornAddedFile(plan) {
 const saved=plans.get(plan);if(!saved)throw new Error('Review the added file again.');await saved.beforeMutation();if(!same(saved.state,await capture(saved.state.root,saved.state.name)))throw changed();return true;
}
async function backupUnbornAddedFile(plan,{binding,_testPlatform}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
 if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Removing an added file is not supported on Windows yet.');
 const saved=plans.get(plan);if(!saved)throw new Error('Review the added file again.');
 if(!binding||binding.root!==saved.state.root||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')throw new Error('A current project mutation lock is required.');
 binding.assertCurrentNow();plans.delete(plan);await saved.beforeMutation();if(!same(saved.state,await capture(saved.state.root,saved.state.name)))throw changed();
 const {state}=saved,dot=path.join(state.root,'.git'),recovery=await fs.mkdtemp(path.join(dot,'zero-file-restore-recovery-'));let own;
 try {
  await fs.chmod(recovery,0o700);const info=await fs.lstat(recovery);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(recovery)!==recovery)throw changed();own={name:path.basename(recovery),dev:info.dev,ino:info.ino};
  const head=await readOrdinaryBounded(path.join(dot,'HEAD'),16384),packed=await readOrdinaryBounded(path.join(dot,'packed-refs'),4*1024*1024,{optional:true});
  if(!head||head.hash!==state.unborn.head.hash||!same(head.identity,state.unborn.head.identity)||!same(packed&&{identity:packed.identity,hash:packed.hash},state.unborn.packed))throw changed();
  await writeDurable(path.join(recovery,'head'),head.data);if(packed)await writeDurable(path.join(recovery,'packed-refs'),packed.data);
  const index=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true});
  if(state.index.present?(!index||index.hash!==state.index.hash||!same(index.identity,state.index.identity)):index!==null)throw changed();
  if(index)await writeDurable(path.join(recovery,'index'),index.data);
  const selected=state.files.find(file=>file.name===state.name),file=await readOrdinaryBounded(path.join(state.root,...state.name.split('/')),MAX_BYTES);
  if(!selected?.current||!file||file.hash!==selected.current.hash||!same(file.identity,selected.current.identity))throw changed();
  await writeDurable(path.join(recovery,'file-0'),file.data);
  let staged=null;
  if(state.selection.source==='index') {
   const entry=new Map(state.entries).get(state.name);if(!entry)throw changed();const size=decoded(await git(state.root,['cat-file','-s',entry.object])).trim();
   if(!/^\d+$/.test(size)||!Number.isSafeInteger(Number(size))||Number(size)>MAX_BYTES)throw new Error('The staged file is too large to retain safely.');
   const bytes=await git(state.root,['cat-file','blob',entry.object],{maxBuffer:MAX_BYTES+1024});if(bytes.length!==Number(size))throw changed();
   if(bytes.length>MAX_BYTES)throw new Error('The staged file is too large to retain safely.');
   await writeDurable(path.join(recovery,'staged-0'),bytes);staged={mode:entry.mode,object:entry.object,hash:digest(bytes),copy:'staged-0'};
  }
  await saved.beforeMutation();binding.assertCurrentNow();if(!same(state,await capture(state.root,state.name,{own})))throw changed();
  const manifest={schema:6,kind:'unborn-added-file-removal',ref:state.unborn.ref,format:state.unborn.format,headHash:state.unborn.head.hash,packedHash:state.unborn.packed?.hash||null,
   index:state.index.present?{present:true,hash:state.index.hash}:{present:false},selection:state.selection,name:state.name,file:{copy:'file-0',hash:selected.current.hash,mode:selected.current.identity.mode},staged};
  const moves=Buffer.from(JSON.stringify([{name:state.name,copy:'removed-0'}])+'\n');await writeDurable(path.join(recovery,'removed-files.json'),moves);
  const bytes=Buffer.from(JSON.stringify(manifest)+'\n');await writeDurable(path.join(recovery,'manifest.json'),bytes);await syncDirectory(recovery);await syncDirectory(dot);
  const result=Object.freeze({recovery,name:state.name,source:state.selection.source,status:state.selection.status,indexPresent:state.index.present});
  backups.set(result,{...saved,binding,own,manifestHash:digest(bytes),movesHash:digest(moves)});return result;
 }catch(error){error.recoveryPath=recovery;throw error;}
}
async function applyUnbornAddedFile(backup,{confirmed=false,_testBeforeStep,_testPlatform}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
 if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Removing an added file is not supported on Windows yet.');
 const saved=backups.get(backup);if(!saved||confirmed!==true)throw new Error('Review and confirm the added-file removal first.');backups.delete(backup);
 const {state,binding,own,beforeMutation}=saved,root=state.root,dot=path.join(root,'.git'),recovery=backup.recovery,locks=[];let started=false,primary,retainOperationLock=false;
 const file=path.join(root,...state.name.split('/')),journal=path.join(recovery,'unborn-removal-journal.jsonl');
 const base=async()=>{
  binding.assertCurrentNow();const actual=await inspectUnbornHead(root);if(!same(actual,state.unborn))throw changed();
  for(const lock of locks){const info=await fs.lstat(lock.filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.dev!==lock.dev||info.ino!==lock.ino)throw changed();}
  const info=await fs.lstat(recovery);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==own.dev||info.ino!==own.ino||await fs.realpath(recovery)!==recovery)throw changed();
  if(!same(await ordinaryParents(root,state.name),state.fileParents))throw changed();
 };
 const lockParent=async filename=>{
  for(const [dir,expected]of [[root,state.unborn.rootIdentity],[dot,state.unborn.dotIdentity],...state.unborn.parents.map(entry=>[path.join(dot,...entry.path.split('/')),entry.identity])]){
   const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==expected.dev||info.ino!==expected.ino||info.mode!==expected.mode||await fs.realpath(dir)!==dir)throw changed();
  }
  const parent=path.dirname(filename);if(parent!==dot&&!state.unborn.parents.some(entry=>path.join(dot,...entry.path.split('/'))===parent))throw changed();
 };
 const acquire=async filename=>{
  await lockParent(filename);let handle;try{handle=await fs.open(filename,'wx',0o600);}catch(error){if(error.code==='EEXIST'){const failure=new Error('Git or another Zero operation is busy. Inspect its lock before retrying.');failure.lockRecoveryPath=filename;throw failure;}throw error;}
  let info;try{info=await handle.stat();}catch(error){await handle.close().catch(()=>{});error.lockRecoveryPath=filename;throw error;}
  locks.push({filename,handle,dev:info.dev,ino:info.ino});await handle.sync();await syncDirectory(path.dirname(filename));
 };
 const syncRegular=async filename=>{const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1)throw changed();await handle.sync();}finally{await handle.close();}};
 const currentIndex=async()=>{const value=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true});return value?{present:true,identity:value.identity,hash:value.hash}:{present:false};};
 const indexSame=async()=>{if(!same(await currentIndex(),state.index))throw changed();};
 const movedSame=async()=>{const value=await readOrdinaryBounded(path.join(recovery,'removed-0'),MAX_BYTES),original=state.files.find(item=>item.name===state.name)?.current;
  if(!value||!original||value.hash!==original.hash||['dev','ino','size','mtime','mode'].some(key=>value.identity[key]!==original.identity[key]))throw changed();};
 const verifyOthers=async()=>{
  const now=await readStudentFileStatus(root,{safeConfig:true,standaloneOnly:true}),before=parseStudentFileStatus(state.raw);
  const rows=map=>[...map].filter(([name])=>name!==state.name).map(([name,kind])=>[name,kind,map.statusCodes.get(name)]).sort(([a],[b])=>a.localeCompare(b,'en'));
  if(!same(rows(now),rows(before)))throw changed();
  const budget={bytes:0};for(const entry of state.files)if(entry.name!==state.name&&!same(entry.current,await fileEvidence(root,entry.name,budget)))throw changed();
  const ignored=decoded(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'],{safe:false}),true).split('\0').filter(Boolean).sort();if(!same(ignored,state.ignored))throw changed();
  const config=await readOrdinaryBounded(path.join(dot,'config'),1024*1024);if(!config||!same({identity:config.identity,hash:config.hash},state.config))throw changed();
 };
 let journalText='',journalIdentity;
 const append=async entry=>{
  await base();const previous=await readOrdinaryBounded(journal,1024*1024);if(!previous||previous.hash!==digest(Buffer.from(journalText))||previous.identity.dev!==journalIdentity.dev||previous.identity.ino!==journalIdentity.ino)throw changed();
  const handle=await fs.open(journal,constants.O_WRONLY|constants.O_APPEND|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.dev!==journalIdentity.dev||info.ino!==journalIdentity.ino)throw changed();const line=JSON.stringify(entry)+'\n';await handle.writeFile(line);await handle.sync();journalText+=line;}finally{await handle.close();}
 };
 try {
  await beforeMutation();await base();if(!same(state,await capture(root,state.name,{own})))throw changed();
  const manifest=await readOrdinaryBounded(path.join(recovery,'manifest.json'),1024*1024);if(!manifest||manifest.hash!==saved.manifestHash)throw changed();
  const metadata=JSON.parse(manifest.data.toString('utf8'));
  const verifyCopies=async()=>{
   const check=async(name,expected,max)=>{const value=await readOrdinaryBounded(path.join(recovery,name),max,{optional:true});if(expected===null?value!==null:!value||value.hash!==expected)throw changed();};
   await base();await check('manifest.json',saved.manifestHash,1024*1024);await check('removed-files.json',saved.movesHash,1024*1024);await check('head',state.unborn.head.hash,16384);
   await check('packed-refs',state.unborn.packed?.hash||null,4*1024*1024);await check('index',state.index.present?state.index.hash:null,4*1024*1024);
   await check('file-0',state.files.find(item=>item.name===state.name).current.hash,MAX_BYTES);await check('staged-0',metadata.staged?.hash||null,MAX_BYTES);
  };
  await verifyCopies();
  let expectedIndex=state.index.present?state.index.hash:null;
  const prepared=path.join(recovery,'prepared-index');
  if(state.selection.source==='index') {
   await writeDurable(prepared,(await readOrdinaryBounded(path.join(recovery,'index'),4*1024*1024)).data);const prior=await readOrdinaryBounded(prepared,4*1024*1024);if(!prior||prior.hash!==state.index.hash)throw changed();
   await git(root,['update-index','--force-remove','--',state.name],{index:prepared});
   const rows=decoded(await git(root,['ls-files','--stage','-z'],{index:prepared}),true).split('\0').filter(Boolean),entries=new Map();
   for(const row of rows){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||entries.has(match[3]))throw changed();entries.set(match[3],{mode:match[1],object:match[2]});}
   const flags=parseIndexFlags(await git(root,['ls-files','--debug','-z'],{index:prepared})),oldEntries=new Map(state.entries),oldFlags=new Map(state.flags);
   if(entries.has(state.name)||flags.has(state.name)||entries.size!==oldEntries.size-1||flags.size!==oldFlags.size-1)throw changed();
   for(const [name,value]of oldEntries)if(name!==state.name&&(!same(entries.get(name),value)||flags.get(name)!==oldFlags.get(name)))throw changed();
   const preparedValue=await readOrdinaryBounded(prepared,4*1024*1024);if(!preparedValue)throw changed();expectedIndex=preparedValue.hash;await syncRegular(prepared);
  }
  await syncDirectory(recovery);
  for(const filename of [path.join(dot,'zero-discard.lock'),path.join(dot,'index.lock'),path.join(dot,'HEAD.lock'),path.join(dot,'packed-refs.lock'),path.join(dot,...state.unborn.ref.split('/'))+'.lock'])await acquire(filename);
  await beforeMutation();await base();if(!same(state,await capture(root,state.name,{own})))throw changed();
  journalText=JSON.stringify({schema:6,event:'start',manifestHash:saved.manifestHash,movesHash:saved.movesHash,name:state.name,selection:state.selection,ref:state.unborn.ref,index:metadata.index})+'\n';
  await writeDurable(journal,Buffer.from(journalText));journalIdentity=(await fs.lstat(journal));await syncDirectory(recovery);
  await beforeMutation();await base();await indexSame();if(_testBeforeStep)await _testBeforeStep('before-move');await beforeMutation();await verifyCopies();if(!same(state,await capture(root,state.name,{own})))throw changed();
  const original=state.files.find(item=>item.name===state.name)?.current,source=await readOrdinaryBounded(file,MAX_BYTES),moved=path.join(recovery,'removed-0');
  if(!original||!source||source.hash!==original.hash||!same(source.identity,original.identity)||!await absent(moved))throw changed();
  await append({event:'move-intent',name:state.name});started=true;await base();if(_testBeforeStep)await _testBeforeStep('before-link');await fs.link(file,moved);
  const linked=await fs.lstat(file),retained=await fs.lstat(moved),expected=original.identity;
  if(!linked.isFile()||linked.isSymbolicLink()||linked.dev!==expected.dev||linked.ino!==expected.ino||linked.mode!==expected.mode||linked.size!==expected.size||linked.mtimeMs!==expected.mtime||linked.nlink!==2||!retained.isFile()||retained.isSymbolicLink()||retained.dev!==linked.dev||retained.ino!==linked.ino||retained.nlink!==2||(await readOrdinaryBounded(moved,expected.size,{links:2})).hash!==original.hash)throw changed();
  await base();const again=await fs.lstat(file),retainedAgain=await fs.lstat(moved);if(!again.isFile()||again.dev!==linked.dev||again.ino!==linked.ino||again.mode!==linked.mode||again.size!==linked.size||again.mtimeMs!==linked.mtimeMs||again.nlink!==2||!retainedAgain.isFile()||retainedAgain.dev!==linked.dev||retainedAgain.ino!==linked.ino||retainedAgain.nlink!==2)throw changed();
  await fs.unlink(file);await movedSame();await syncRegular(moved);await syncDirectory(path.dirname(file));await syncDirectory(recovery);await append({event:'moved',name:state.name});
  if(_testBeforeStep)await _testBeforeStep('after-move');await beforeMutation();await base();await movedSame();await indexSame();await verifyOthers();if(!await absent(file))throw changed();
  if(state.selection.source==='index') {
   const movedIndex=path.join(recovery,'moved-index');if(!await absent(movedIndex))throw new Error('The retained index destination already exists. Inspect the recovery copy.');
   if(_testBeforeStep)await _testBeforeStep('before-index');await beforeMutation();await base();await movedSame();await indexSame();await verifyOthers();if(!await absent(file)||!await absent(movedIndex))throw changed();
   await append({event:'index-intent'});await base();if(_testBeforeStep)await _testBeforeStep('before-index-link');const liveIndex=path.join(dot,'index');await fs.link(liveIndex,movedIndex);
   const linkedIndex=await fs.lstat(liveIndex),retainedIndex=await fs.lstat(movedIndex),expectedIndexIdentity=state.index.identity;
   if(!linkedIndex.isFile()||linkedIndex.isSymbolicLink()||linkedIndex.dev!==expectedIndexIdentity.dev||linkedIndex.ino!==expectedIndexIdentity.ino||linkedIndex.mode!==expectedIndexIdentity.mode||linkedIndex.size!==expectedIndexIdentity.size||linkedIndex.mtimeMs!==expectedIndexIdentity.mtime||linkedIndex.nlink!==2||!retainedIndex.isFile()||retainedIndex.isSymbolicLink()||retainedIndex.dev!==linkedIndex.dev||retainedIndex.ino!==linkedIndex.ino||retainedIndex.nlink!==2||(await readOrdinaryBounded(movedIndex,expectedIndexIdentity.size,{links:2})).hash!==state.index.hash)throw changed();
   await base();const againIndex=await fs.lstat(liveIndex),againRetainedIndex=await fs.lstat(movedIndex);if(!againIndex.isFile()||againIndex.dev!==linkedIndex.dev||againIndex.ino!==linkedIndex.ino||againIndex.mode!==linkedIndex.mode||againIndex.size!==linkedIndex.size||againIndex.mtimeMs!==linkedIndex.mtimeMs||againIndex.nlink!==2||!againRetainedIndex.isFile()||againRetainedIndex.dev!==linkedIndex.dev||againRetainedIndex.ino!==linkedIndex.ino||againRetainedIndex.nlink!==2)throw changed();
   await fs.unlink(liveIndex);const savedIndex=await readOrdinaryBounded(movedIndex,4*1024*1024);if(!savedIndex||savedIndex.hash!==state.index.hash)throw changed();
   await base();await fs.link(prepared,path.join(dot,'index'));await fs.unlink(prepared);await syncRegular(movedIndex);await syncRegular(path.join(dot,'index'));await syncDirectory(dot);await syncDirectory(recovery);await append({event:'index-installed'});
   if(_testBeforeStep)await _testBeforeStep('after-index');
  }
  await beforeMutation();await base();await movedSame();if(!await absent(file))throw changed();
  const result=await currentIndex();if(state.index.present?(!result.present||result.hash!==expectedIndex):result.present)throw changed();
  if(result.present){const data=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024);if(!data||data.hash!==expectedIndex)throw changed();await writeDurable(path.join(recovery,'completed-index'),data.data);}
  await append({event:'complete'});const journalCopy=await readOrdinaryBounded(journal,1024*1024);if(!journalCopy||journalCopy.hash!==digest(Buffer.from(journalText)))throw changed();
  const verifyFinalEvidence=async()=>{
   await verifyCopies();await movedSame();const log=await readOrdinaryBounded(journal,1024*1024);if(!log||log.hash!==journalCopy.hash||log.identity.dev!==journalIdentity.dev||log.identity.ino!==journalIdentity.ino)throw changed();
   const completed=await readOrdinaryBounded(path.join(recovery,'completed-index'),4*1024*1024,{optional:true});if(result.present?(!completed||completed.hash!==expectedIndex):completed!==null)throw changed();
   const movedIndex=await readOrdinaryBounded(path.join(recovery,'moved-index'),4*1024*1024,{optional:true});if(state.selection.source==='index'?(!movedIndex||movedIndex.hash!==state.index.hash):movedIndex!==null)throw changed();
  };
  const complete={schema:6,kind:'unborn-added-file-removal-complete',manifestHash:saved.manifestHash,movesHash:saved.movesHash,journalHash:journalCopy.hash,ref:state.unborn.ref,headHash:state.unborn.head.hash,originalIndex:state.index.present?{present:true,hash:state.index.hash}:{present:false},resultIndex:result.present?{present:true,hash:expectedIndex}:{present:false}};
  const marker=path.join(recovery,'complete.json'),seal=path.join(recovery,'complete.sha256'),bytes=Buffer.from(JSON.stringify(complete)+'\n');
  if(_testBeforeStep)await _testBeforeStep('before-complete');await beforeMutation();await verifyFinalEvidence();if(!await absent(file))throw changed();
  const lastIndex=await currentIndex();if(result.present?(!lastIndex.present||lastIndex.hash!==expectedIndex):lastIndex.present)throw changed();
  try {await writeDurable(marker,bytes);if(_testBeforeStep)await _testBeforeStep('after-complete-write');await beforeMutation();await verifyFinalEvidence();if(!await absent(file))throw changed();const finalIndex=await currentIndex();if(result.present?(!finalIndex.present||finalIndex.hash!==expectedIndex):finalIndex.present)throw changed();await writeDurable(seal,Buffer.from(digest(bytes)+'\n'));await syncDirectory(recovery);}
  catch(error){try{await fs.unlink(seal).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.unlink(marker).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDirectory(recovery);}catch(cleanup){retainOperationLock=true;error.lockRecoveryPath=path.join(dot,'zero-discard.lock');error.lockCleanupError=cleanup;}throw error;}
  return {recovery,name:state.name,source:state.selection.source,indexPresent:state.index.present};
 }catch(error){primary=error;if(started){const failure=new Error('Added-file removal was interrupted or could not be verified. Inspect the project and recovery copy before continuing.',{cause:error});failure.recoveryPath=recovery;if(error.lockRecoveryPath)failure.lockRecoveryPath=error.lockRecoveryPath;if(error.lockCleanupError)failure.lockCleanupError=error.lockCleanupError;primary=failure;throw failure;}error.recoveryPath=recovery;throw error;}
 finally {
  const recordLockFailure=(target,filename,error)=>{const priorPath=target.lockRecoveryPath,priorError=target.lockCleanupError||target.cause;if(!target.lockRecoveryPath)target.lockRecoveryPath=filename;if(!target.lockCleanupError)target.lockCleanupError=error;if(!target.lockCleanupFailures){target.lockCleanupFailures=[];if(priorPath&&priorPath!==filename)target.lockCleanupFailures.push({path:priorPath,error:priorError});}if(!target.lockCleanupFailures.some(item=>item.path===filename))target.lockCleanupFailures.push({path:filename,error});};
  for(const lock of locks.reverse())try{await lock.handle.close();if(retainOperationLock&&lock.filename===path.join(dot,'zero-discard.lock'))continue;await lockParent(lock.filename);const info=await fs.lstat(lock.filename);if(!info.isFile()||info.isSymbolicLink()||info.dev!==lock.dev||info.ino!==lock.ino)throw changed();await fs.unlink(lock.filename);await syncDirectory(path.dirname(lock.filename));}
  catch(error){if(!primary){primary=error;primary.recoveryPath=recovery;}recordLockFailure(primary,lock.filename,error);}
  if(primary)throw primary;
 }
}
module.exports={previewUnbornAddedFile,revalidateUnbornAddedFile,backupUnbornAddedFile,applyUnbornAddedFile};
