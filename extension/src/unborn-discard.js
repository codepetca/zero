'use strict';
// Unborn whole-project discard. Review is read-only and never creates a ref.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {constants}=require('node:fs');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {inspectUnbornHead,readOrdinaryBounded}=require('./unborn-head');
const {readStudentFileStatus}=require('./student-file-status');
const {parseIndexFlags}=require('./index-entry-flags');
const {refuseFilters}=require('./git-filter-guard');
const {assertNoUnresolvedFileRestore}=require('./git-retained-recovery');
const exec=promisify(execFile),plans=new WeakMap(),backups=new WeakMap();
const MAX_FILES=1000,MAX_BYTES=64*1024*1024;
const changed=()=>new Error('The project or unborn branch changed. Review the project discard again.');
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
async function capture(root,{own}={}) {
 const unborn=await inspectUnbornHead(root),dot=path.join(root,'.git');await assertNoUnresolvedFileRestore(root,{own});
 for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG','shallow','info/grafts','objects/info/alternates'])if(!await absent(path.join(dot,marker)))throw new Error('Finish or inspect the current Git operation in Source Control first.');
 const config=await readOrdinaryBounded(path.join(dot,'config'),1024*1024);if(!config)throw changed();
 const configNames=decoded(await git(root,['config','--local','--no-includes','--name-only','--null','--list']),true).split('\0').filter(Boolean);
 if(configNames.some(key=>/^(?:filter\.|include\.|includeif\.|core\.worktree$)/i.test(key)))throw new Error('Custom Git filters, includes or worktrees require Source Control.');
 if(decoded(await git(root,['for-each-ref','--format=%(refname)','refs/replace/'])).trim())throw new Error('Git replacement objects require Source Control.');
 if(decoded(await git(root,['rev-parse','--show-toplevel']))!==root+'\n'||decoded(await git(root,['rev-parse','--absolute-git-dir']))!==dot+'\n'||decoded(await git(root,['rev-parse','--shared-index-path'])).trim())throw new Error('This Git project cannot be reviewed safely. Use Source Control.');
 const index=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true});
 const inspect=async (_root,args)=>decoded(await git(root,args),args.includes('-z'));await refuseFilters(root,inspect);
 const raw=decoded(await git(root,['status','--porcelain=v1','-z','--no-renames','--untracked-files=all']),true);
 const changes=await readStudentFileStatus(root,{safeConfig:true,standaloneOnly:true});
 if(!changes.size||changes.size>MAX_FILES||[...changes].some(([name])=>!['??','A ','AM','AD'].includes(changes.statusCodes.get(name))))throw new Error('These project changes cannot be reviewed safely. Use Source Control.');
 const ignored=decoded(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'],{safe:false}),true).split('\0').filter(Boolean).sort();
 const overlap=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
 if([...changes.keys()].some(item=>ignored.some(other=>overlap(item,other))))throw new Error('An ignored file is protected. Use Source Control.');
 // Removing a reviewed .gitignore may expose its protected files in status.
 // Reject names/status that could not be represented before moving anything.
 if([...changes.keys()].some(name=>name==='.gitignore'||name.endsWith('/.gitignore'))){
  if(ignored.some(name=>!name||name.startsWith('/')||name.split('/').some(part=>!part||part==='.'||part==='..')||/[\x00-\x1f\x7f\\]/.test(name))||Buffer.byteLength(raw)+ignored.reduce((sum,name)=>sum+Buffer.byteLength(name)+4,0)>1024*1024)throw new Error('Ignored paths cannot be reviewed safely after removing project ignore rules. Use Source Control.');
 }
 const entries=decoded(await git(root,['ls-files','--stage','-z']),true).split('\0').filter(Boolean),indexed=new Map();
 for(const row of entries){const match=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!match||indexed.has(match[3]))throw new Error('This Git index cannot be reviewed safely.');indexed.set(match[3],{mode:match[1],object:match[2]});}
 const flags=parseIndexFlags(await git(root,['ls-files','--debug','-z']));
 if(flags.size!==indexed.size||[...indexed.keys()].some(name=>!index||flags.get(name)!=='0'||!['A ','AM','AD'].includes(changes.statusCodes.get(name)))||[...changes.keys()].some(name=>(changes.statusCodes.get(name)==='??')===indexed.has(name)))throw changed();
 const budget={bytes:0},files=[];for(const [name,kind]of [...changes].sort(([a],[b])=>a.localeCompare(b,'en'))){const status=changes.statusCodes.get(name),current=await fileEvidence(root,name,budget),parents=await ordinaryParents(root,name);if(status==='AD'?current!==null:!current||!parents)throw changed();files.push({name,kind,status,current,parents});}
 const finalIndex=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true}),finalHead=await inspectUnbornHead(root);
 const indexState=value=>value?{present:true,identity:value.identity,hash:value.hash}:{present:false};
 if(!same(indexState(index),indexState(finalIndex))||!same(unborn,finalHead))throw changed();
 return {root,unborn,config:{identity:config.identity,hash:config.hash},index:indexState(index),entries:[...indexed],flags:[...flags],raw,ignored,files};
}
async function previewUnbornDiscard(root,{beforeMutation,_testPlatform}={}) {
 if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Discard project changes is not supported on Windows yet.');
 if(typeof beforeMutation!=='function')throw new Error('Workspace trust and saved-editor checks are required.');
 await beforeMutation();const state=await capture(root);await beforeMutation();if(!same(state,await capture(root)))throw changed();
 const plan=Object.freeze({files:Object.freeze(state.files.map(({name,kind,status})=>Object.freeze({name,kind,status}))),indexPresent:state.index.present});plans.set(plan,{state,beforeMutation});return plan;
}
async function revalidateUnbornDiscard(plan) {const saved=plans.get(plan);if(!saved)throw changed();await saved.beforeMutation();if(!same(saved.state,await capture(saved.state.root)))throw changed();return true;}
async function backupUnbornDiscard(plan,{binding,_testPlatform}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
 if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Discard project changes is not supported on Windows yet.');
 const saved=plans.get(plan);if(!saved)throw changed();const {state,beforeMutation}=saved;
 if(!binding||binding.root!==state.root||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')throw new Error('A current project mutation lock is required.');
 binding.assertCurrentNow();plans.delete(plan);await beforeMutation();if(!same(state,await capture(state.root)))throw changed();
 const dot=path.join(state.root,'.git'),recovery=await fs.mkdtemp(path.join(dot,'zero-file-restore-recovery-'));let own;
 try {
  await fs.chmod(recovery,0o700);const info=await fs.lstat(recovery);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(recovery)!==recovery)throw changed();own={name:path.basename(recovery),dev:info.dev,ino:info.ino};
  const head=await readOrdinaryBounded(path.join(dot,'HEAD'),16384),packed=await readOrdinaryBounded(path.join(dot,'packed-refs'),4*1024*1024,{optional:true}),index=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024,{optional:true});
  if(!head||head.hash!==state.unborn.head.hash||!same(head.identity,state.unborn.head.identity)||!same(packed&&{identity:packed.identity,hash:packed.hash},state.unborn.packed)||(state.index.present?(!index||index.hash!==state.index.hash||!same(index.identity,state.index.identity)):index!==null))throw changed();
  await writeDurable(path.join(recovery,'head'),head.data);if(packed)await writeDurable(path.join(recovery,'packed-refs'),packed.data);if(index)await writeDurable(path.join(recovery,'index'),index.data);
  const entries=new Map(state.entries),files=[],staged=[],moves=[];let total=0;
  for(const [i,item]of state.files.entries()) {
   if(item.current){const value=await readOrdinaryBounded(path.join(state.root,...item.name.split('/')),MAX_BYTES);if(!value||value.hash!==item.current.hash||!same(value.identity,item.current.identity))throw changed();total+=value.data.length;if(total>MAX_BYTES)throw changed();await writeDurable(path.join(recovery,`file-${i}`),value.data);files.push({name:item.name,status:item.status,copy:`file-${i}`,hash:value.hash,mode:value.identity.mode});moves.push({name:item.name,copy:`removed-${i}`});}
   else files.push({name:item.name,status:item.status,missing:true});
   const entry=entries.get(item.name);if(entry){const size=decoded(await git(state.root,['cat-file','-s',entry.object])).trim();if(!/^\d+$/.test(size)||!Number.isSafeInteger(Number(size))||total+Number(size)>MAX_BYTES)throw new Error('Staged project changes are too large to retain safely.');const bytes=await git(state.root,['cat-file','blob',entry.object],{maxBuffer:MAX_BYTES+1024});if(bytes.length!==Number(size))throw changed();total+=bytes.length;await writeDurable(path.join(recovery,`staged-${i}`),bytes);staged.push({name:item.name,mode:entry.mode,object:entry.object,hash:digest(bytes),copy:`staged-${i}`});}
  }
  await beforeMutation();binding.assertCurrentNow();if(!same(state,await capture(state.root,{own})))throw changed();
  const manifest={schema:7,kind:'unborn-project-discard',ref:state.unborn.ref,format:state.unborn.format,headHash:state.unborn.head.hash,packedHash:state.unborn.packed?.hash||null,index:state.index.present?{present:true,hash:state.index.hash}:{present:false},files,staged};
  const movesBytes=Buffer.from(JSON.stringify(moves)+'\n'),bytes=Buffer.from(JSON.stringify(manifest)+'\n');await writeDurable(path.join(recovery,'removed-files.json'),movesBytes);await writeDurable(path.join(recovery,'manifest.json'),bytes);await syncDirectory(recovery);await syncDirectory(dot);
  const result=Object.freeze({recovery,files:plan.files,indexPresent:state.index.present});backups.set(result,{...saved,binding,own,manifestHash:digest(bytes),movesHash:digest(movesBytes)});return result;
 }catch(error){error.recoveryPath=recovery;throw error;}
}

async function applyUnbornDiscard(backup,{confirmed=false,_testBeforeStep,_testPlatform}={}) {
  throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
 if(process.platform==='win32'||_testPlatform==='win32')throw new Error('Discard project changes is not supported on Windows yet.');
 const saved=backups.get(backup);if(!saved||confirmed!==true)throw new Error('Review and confirm the project discard first.');backups.delete(backup);
 const {state,binding,own,beforeMutation}=saved,root=state.root,dot=path.join(root,'.git'),recovery=backup.recovery,locks=[],journal=path.join(recovery,'unborn-discard-journal.jsonl');let started=false,primary,retainOperationLock=false;
 const base=async()=>{binding.assertCurrentNow();if(!same(await inspectUnbornHead(root),state.unborn))throw changed();for(const lock of locks){const info=await fs.lstat(lock.filename);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.dev!==lock.dev||info.ino!==lock.ino)throw changed();}const info=await fs.lstat(recovery);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==own.dev||info.ino!==own.ino||await fs.realpath(recovery)!==recovery)throw changed();for(const item of state.files)if(item.parents&&!same(await ordinaryParents(root,item.name),item.parents))throw changed();};
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
 const moved=new Set();let indexInstalled=false,journalText='',journalIdentity;
 const verifyState=async()=>{
  await beforeMutation();await base();
  const actual=await readStudentFileStatus(root,{safeConfig:true,standaloneOnly:true}),expected=new Map();
  for(const item of state.files)if(!indexInstalled||item.status==='??'){if(moved.has(item.name)){if(item.status!=='??')expected.set(item.name,'AD');}else expected.set(item.name,item.status);}
  const rows=map=>[...map].sort(([a],[b])=>a.localeCompare(b,'en')),originalIgnored=new Set(state.ignored),exposed=new Set();
  const covered=name=>[...moved].some(rule=>{if(rule!=='.gitignore'&&!rule.endsWith('/.gitignore'))return false;const parent=rule==='.gitignore'?'':rule.slice(0,-'.gitignore'.length);return name.startsWith(parent);});
  const actualReviewed=new Map();for(const name of actual.keys()){const code=actual.statusCodes.get(name);if(expected.has(name))actualReviewed.set(name,code);else if(code==='??'&&originalIgnored.has(name)&&covered(name))exposed.add(name);else throw changed();}
  if(!same(rows(actualReviewed),rows(expected)))throw changed();
  const budget={bytes:0};for(const [i,item]of state.files.entries()){
   const value=await fileEvidence(root,item.name,budget);if(moved.has(item.name)){if(value!==null)throw changed();const retained=await readOrdinaryBounded(path.join(recovery,`removed-${i}`),MAX_BYTES);if(!retained||retained.hash!==item.current.hash||['dev','ino','size','mtime','mode'].some(key=>retained.identity[key]!==item.current.identity[key]))throw changed();}
   else if(!same(value,item.current))throw changed();
  }
  const ignored=decoded(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'],{safe:false}),true).split('\0').filter(Boolean).sort(),stillIgnored=new Set(ignored);
  if(ignored.some(name=>!originalIgnored.has(name))||state.ignored.some(name=>!stillIgnored.has(name)&&(!covered(name)||!exposed.has(name))))throw changed();
  const config=await readOrdinaryBounded(path.join(dot,'config'),1024*1024);if(!config||!same({identity:config.identity,hash:config.hash},state.config))throw changed();
  for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG','shallow','info/grafts','objects/info/alternates'])if(!await absent(path.join(dot,marker)))throw changed();
  if(decoded(await git(root,['for-each-ref','--format=%(refname)','refs/replace/'])).trim())throw changed();
 };
 const append=async entry=>{await base();const previous=await readOrdinaryBounded(journal,1024*1024);if(!previous||previous.hash!==digest(Buffer.from(journalText))||previous.identity.dev!==journalIdentity.dev||previous.identity.ino!==journalIdentity.ino)throw changed();const handle=await fs.open(journal,constants.O_WRONLY|constants.O_APPEND|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.dev!==journalIdentity.dev||info.ino!==journalIdentity.ino)throw changed();const line=JSON.stringify(entry)+'\n';await handle.writeFile(line);await handle.sync();journalText+=line;}finally{await handle.close();}};
 const exclusiveRetain=async(source,destination,expected,hash)=>{await fs.link(source,destination);const a=await fs.lstat(source),b=await fs.lstat(destination);if(!a.isFile()||a.isSymbolicLink()||a.dev!==expected.dev||a.ino!==expected.ino||a.mode!==expected.mode||a.size!==expected.size||a.mtimeMs!==expected.mtime||a.nlink!==2||!b.isFile()||b.isSymbolicLink()||b.dev!==a.dev||b.ino!==a.ino||b.nlink!==2||(await readOrdinaryBounded(destination,expected.size,{links:2})).hash!==hash)throw changed();await base();const c=await fs.lstat(source),d=await fs.lstat(destination);if(!c.isFile()||c.dev!==a.dev||c.ino!==a.ino||c.mode!==a.mode||c.size!==a.size||c.mtimeMs!==a.mtimeMs||c.nlink!==2||!d.isFile()||d.dev!==a.dev||d.ino!==a.ino||d.nlink!==2)throw changed();await fs.unlink(source);};
 try {
  await beforeMutation();await base();if(!same(state,await capture(root,{own})))throw changed();
  const manifestValue=await readOrdinaryBounded(path.join(recovery,'manifest.json'),1024*1024);if(!manifestValue||manifestValue.hash!==saved.manifestHash)throw changed();const manifest=JSON.parse(manifestValue.data.toString('utf8'));
  const verifyCopies=async()=>{await base();const check=async(name,hash,max)=>{const value=await readOrdinaryBounded(path.join(recovery,name),max,{optional:true});if(hash===null?value!==null:!value||value.hash!==hash)throw changed();};await check('manifest.json',saved.manifestHash,1024*1024);await check('removed-files.json',saved.movesHash,1024*1024);await check('head',state.unborn.head.hash,16384);await check('packed-refs',state.unborn.packed?.hash||null,4*1024*1024);await check('index',state.index.present?state.index.hash:null,4*1024*1024);for(const item of manifest.files)if(item.copy)await check(item.copy,item.hash,MAX_BYTES);for(const item of manifest.staged)await check(item.copy,item.hash,MAX_BYTES);};
  const prepared=path.join(recovery,'prepared-index');let resultHash=state.index.present?state.index.hash:null;
  if(state.entries.length){await writeDurable(prepared,(await readOrdinaryBounded(path.join(recovery,'index'),4*1024*1024)).data);const copy=await readOrdinaryBounded(prepared,4*1024*1024);if(!copy||copy.hash!==state.index.hash)throw changed();await git(root,['read-tree','--empty'],{index:prepared});if(decoded(await git(root,['ls-files','--stage','-z'],{index:prepared}),true)!==''||parseIndexFlags(await git(root,['ls-files','--debug','-z'],{index:prepared})).size)throw changed();const value=await readOrdinaryBounded(prepared,4*1024*1024);resultHash=value.hash;await syncRegular(prepared);}
  await syncDirectory(recovery);for(const filename of [path.join(dot,'zero-discard.lock'),path.join(dot,'index.lock'),path.join(dot,'HEAD.lock'),path.join(dot,'packed-refs.lock'),path.join(dot,...state.unborn.ref.split('/'))+'.lock'])await acquire(filename);
  await beforeMutation();await base();if(!same(state,await capture(root,{own})))throw changed();await verifyCopies();
  journalText=JSON.stringify({schema:7,event:'start',manifestHash:saved.manifestHash,movesHash:saved.movesHash,ref:state.unborn.ref,index:manifest.index})+'\n';await writeDurable(journal,Buffer.from(journalText));journalIdentity=await fs.lstat(journal);await syncDirectory(recovery);
  for(const [i,item]of state.files.entries())if(item.current){
   await verifyState();await indexSame();await verifyCopies();const source=path.join(root,...item.name.split('/')),dest=path.join(recovery,`removed-${i}`);if(!await absent(dest))throw changed();await append({event:'move-intent',name:item.name});started=true;if(_testBeforeStep)await _testBeforeStep(`before-move-${i}`);await verifyState();await indexSame();await exclusiveRetain(source,dest,item.current.identity,item.current.hash);moved.add(item.name);await syncRegular(dest);await syncDirectory(path.dirname(source));await syncDirectory(recovery);await append({event:'moved',name:item.name});if(_testBeforeStep)await _testBeforeStep(`after-move-${i}`);
  }
  await verifyState();await indexSame();
  if(state.entries.length){const live=path.join(dot,'index'),dest=path.join(recovery,'moved-index');if(!await absent(dest))throw changed();await append({event:'index-intent'});if(_testBeforeStep)await _testBeforeStep('before-index');await verifyState();await indexSame();await exclusiveRetain(live,dest,state.index.identity,state.index.hash);await base();await fs.link(prepared,live);await fs.unlink(prepared);indexInstalled=true;await syncRegular(dest);await syncRegular(live);await syncDirectory(dot);await syncDirectory(recovery);await append({event:'index-installed'});if(_testBeforeStep)await _testBeforeStep('after-index');}
  await verifyState();const current=await currentIndex();if(state.index.present?(!current.present||current.hash!==resultHash):current.present)throw changed();if(current.present){const value=await readOrdinaryBounded(path.join(dot,'index'),4*1024*1024);await writeDurable(path.join(recovery,'completed-index'),value.data);}
  await append({event:'complete'});const journalCopy=await readOrdinaryBounded(journal,1024*1024);if(!journalCopy||journalCopy.hash!==digest(Buffer.from(journalText)))throw changed();
  const verifyFinal=async()=>{await verifyState();await verifyCopies();const log=await readOrdinaryBounded(journal,1024*1024);if(!log||log.hash!==journalCopy.hash||log.identity.dev!==journalIdentity.dev||log.identity.ino!==journalIdentity.ino)throw changed();const current=await currentIndex();if(state.index.present?(!current.present||current.hash!==resultHash):current.present)throw changed();const completed=await readOrdinaryBounded(path.join(recovery,'completed-index'),4*1024*1024,{optional:true});if(state.index.present?(!completed||completed.hash!==resultHash):completed!==null)throw changed();const retained=await readOrdinaryBounded(path.join(recovery,'moved-index'),4*1024*1024,{optional:true});if(state.entries.length?(!retained||retained.hash!==state.index.hash):retained!==null)throw changed();};
  const complete={schema:7,kind:'unborn-project-discard-complete',manifestHash:saved.manifestHash,movesHash:saved.movesHash,journalHash:journalCopy.hash,ref:state.unborn.ref,headHash:state.unborn.head.hash,originalIndex:manifest.index,resultIndex:state.index.present?{present:true,hash:resultHash}:{present:false}},bytes=Buffer.from(JSON.stringify(complete)+'\n'),marker=path.join(recovery,'complete.json'),seal=path.join(recovery,'complete.sha256');
  if(_testBeforeStep)await _testBeforeStep('before-complete');await verifyFinal();try{await writeDurable(marker,bytes);if(_testBeforeStep)await _testBeforeStep('after-complete-write');await verifyFinal();await writeDurable(seal,Buffer.from(digest(bytes)+'\n'));await syncDirectory(recovery);}catch(error){try{await fs.unlink(seal).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.unlink(marker).catch(e=>{if(e.code!=='ENOENT')throw e;});await syncDirectory(recovery);}catch(cleanup){retainOperationLock=true;error.lockRecoveryPath=path.join(dot,'zero-discard.lock');error.lockCleanupError=cleanup;}throw error;}
  return {recovery,files:backup.files,indexPresent:state.index.present};
 }catch(error){primary=error;if(started){const failure=new Error('Project discard was interrupted or could not be verified. Inspect the project and recovery copy before continuing.',{cause:error});failure.recoveryPath=recovery;if(error.lockRecoveryPath)failure.lockRecoveryPath=error.lockRecoveryPath;if(error.lockCleanupError)failure.lockCleanupError=error.lockCleanupError;primary=failure;throw failure;}error.recoveryPath=recovery;throw error;}
 finally{
  const record=(target,filename,error)=>{const priorPath=target.lockRecoveryPath,priorError=target.lockCleanupError||target.cause;if(!target.lockRecoveryPath)target.lockRecoveryPath=filename;if(!target.lockCleanupError)target.lockCleanupError=error;if(!target.lockCleanupFailures){target.lockCleanupFailures=[];if(priorPath&&priorPath!==filename)target.lockCleanupFailures.push({path:priorPath,error:priorError});}if(!target.lockCleanupFailures.some(item=>item.path===filename))target.lockCleanupFailures.push({path:filename,error});};
  for(const lock of locks.reverse())try{await lock.handle.close();if(retainOperationLock&&lock.filename===path.join(dot,'zero-discard.lock'))continue;await lockParent(lock.filename);const info=await fs.lstat(lock.filename);if(!info.isFile()||info.isSymbolicLink()||info.dev!==lock.dev||info.ino!==lock.ino)throw changed();await fs.unlink(lock.filename);await syncDirectory(path.dirname(lock.filename));}catch(error){if(!primary){primary=error;primary.recoveryPath=recovery;}record(primary,lock.filename,error);}if(primary)throw primary;
 }
}
module.exports={previewUnbornDiscard,revalidateUnbornDiscard,backupUnbornDiscard,applyUnbornDiscard};
