'use strict';
// Git holds its own ref lock from prepare through the directness check and commit.
// External writers that ignore Git's locks are not confined by this protocol.
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{spawn}=require('node:child_process');
const core=require('./core');
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
function ambient() {
 const allowed=new Set(['GIT_TERMINAL_PROMPT','GIT_OPTIONAL_LOCKS','GIT_TEMPLATE_DIR','GIT_ASKPASS','GIT_SSH','GIT_SSH_COMMAND','GIT_PAGER','GIT_EDITOR','GIT_SEQUENCE_EDITOR']);
 for(const [key,value]of Object.entries(process.env))if(/^GIT_/i.test(key)&&!allowed.has(key.toUpperCase())&&!(key.toUpperCase()==='GIT_CONFIG_NOSYSTEM'&&value==='1')&&!(key.toUpperCase()==='GIT_CONFIG_GLOBAL'&&value===os.devNull))throw new Error('Git environment overrides prevent a safe local main transaction. Inspect the project environment.');
 return JSON.stringify([process.env.PATH,...Object.entries(process.env).filter(([key])=>/^GIT_/i.test(key)).sort(([a],[b])=>a.localeCompare(b))]);
}
function anchor(root){const entries=[root,path.join(root,'.git')].map(name=>{const info=fs.lstatSync(name);if(!info.isDirectory()||info.isSymbolicLink()||fs.realpathSync(name)!==name)throw new Error('The project Git directory changed. Review the operation again.');return [info.dev,info.ino,info.mode];});return JSON.stringify(entries);}
const unsafeCleanupRefs=()=>new Error('Git reference storage has an unsafe path or changed during cleanup. Inspect it in native Source Control.');
const storageIdentity=info=>JSON.stringify([info.dev,info.ino,info.mode]);
function cleanupRefStorage(root,branch,format) {
 if(!core.validBranchName(branch)||branch==='main'||!['files','reftable'].includes(format))throw unsafeCleanupRefs();
 const gitDir=path.join(root,'.git'),entries=new Map();
 const inspect=(relative,{directory=false,required=false}={})=>{
  const parts=relative.split('/');
  let current=gitDir,info;
  for(const [index,part] of parts.entries()){
   current=path.join(current,part);
   try{info=fs.lstatSync(current);}catch(error){if(!required&&error.code==='ENOENT')return null;throw unsafeCleanupRefs();}
   const mustBeDirectory=directory||index<parts.length-1;
   if(info.isSymbolicLink()||(mustBeDirectory?!info.isDirectory():!info.isFile()||info.nlink!==1)||fs.realpathSync(current)!==current)throw unsafeCleanupRefs();
   entries.set(current,mustBeDirectory?storageIdentity(info):JSON.stringify([storageIdentity(info),info.size,info.mtimeMs,info.ctimeMs]));
  }
  return info;
 };
 // A standalone repository must not delegate reference storage to a common dir.
 if(inspect('commondir')||inspect('gitdir'))throw unsafeCleanupRefs();
 inspect('config');
 inspect('config.worktree');
 inspect('HEAD',{required:true});
 inspect('HEAD.lock');
 if(format==='files'){
  if(inspect('reftable',{directory:true}))throw unsafeCleanupRefs();
  const main='refs/heads/main',feature=`refs/heads/${branch}`;
  for(const file of [main,feature,'packed-refs','logs/HEAD',`logs/${main}`,`logs/${feature}`]){
   inspect(file);
   inspect(`${file}.lock`);
  }
 }else{
  const folder='reftable',list=`${folder}/tables.list`,listPath=path.join(gitDir,list);
  inspect(folder,{directory:true,required:true});
  const info=inspect(list,{required:true});
  if(info.size<1||info.size>128*1024)throw unsafeCleanupRefs();
  const handle=fs.openSync(listPath,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let raw;
  try{
   const opened=fs.fstatSync(handle),bytes=Buffer.alloc(info.size+1);
   if(storageIdentity(opened)!==storageIdentity(info)||opened.nlink!==1||opened.size!==info.size)throw unsafeCleanupRefs();
   const size=fs.readSync(handle,bytes,0,bytes.length,0),after=fs.fstatSync(handle);
   if(size!==opened.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs||after.nlink!==1)throw unsafeCleanupRefs();
   raw=bytes.subarray(0,size).toString('utf8');
  }finally{fs.closeSync(handle);}
  const tables=raw.split('\n');
  if(tables.pop()!==''||new Set(tables).size!==tables.length||tables.some(name=>!/^0x[0-9a-f]{12,16}-0x[0-9a-f]{12,16}-[0-9a-f]{8}\.ref$/.test(name)))throw unsafeCleanupRefs();
  for(const name of tables)inspect(`${folder}/${name}`,{required:true});
  const children=fs.readdirSync(path.join(gitDir,folder));
  if(children.length>4096)throw unsafeCleanupRefs();
  for(const name of children)inspect(`${folder}/${name}`,{required:true});
  entries.set(listPath,JSON.stringify([storageIdentity(info),raw]));
 }
 return entries;
}
const isolatedEnv=()=>Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_ATTR_NOSYSTEM:'1',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
async function probeTransaction(root,env){
 await new Promise((resolve,reject)=>{
  const child=spawn('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false','update-ref','--stdin'],{cwd:root,env,stdio:['pipe','pipe','pipe']});
  let output='',size=0,failed=false,timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},10000);timer.unref?.();
  const fail=()=>{failed=true;child.kill('SIGKILL');};
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8192)return fail();output+=chunk.toString('utf8');});
  child.stderr.on('data',chunk=>{size+=chunk.length;if(size>16384)fail();});
  child.on('error',fail);child.stdin.on('error',fail);
  child.on('close',(code,signal)=>{clearTimeout(timer);if(failed||timedOut||code!==0||signal||output!=='start: ok\nprepare: ok\nabort: ok\n')return reject(Object.assign(new Error('Git does not support the required local main transaction. Update Git or use Source Control.'),{kind:'changed'}));resolve();});
  child.stdin.end('start\noption no-deref\nprepare\nabort\n');
 });
}
async function preflightDirectMain(root,gitDir,{run=core.git,allowReftable=false,skipProbe=false,cleanupBranch}={}){
 const unsupported=()=>Object.assign(new Error('This project uses unsupported Git metadata or reference storage. Use a standalone project with ordinary refs to update or merge.'),{kind:'changed'});
 if(typeof root!=='string'||!path.isAbsolute(root)||typeof gitDir!=='string'||gitDir!==path.join(root,'.git')||typeof run!=='function')throw unsupported();
 const environment=ambient(),identity=anchor(root),env=isolatedEnv();
 const git=args=>run(root,['-c','core.fsmonitor=false',...args],{env});
 let format;try{format=await git(['rev-parse','--show-ref-format']);}catch(error){if(error.code!==129)throw error;format='--show-ref-format';}
 if(format==='--show-ref-format'){
  // Older Git can echo an unknown rev-parse option. Accept only its ordinary
  // files backend after excluding an explicit extension and reftable storage.
  try{await git(['config','--get','extensions.refStorage']);throw unsupported();}catch(error){if(error.code!==1)throw error;}
  try{fs.lstatSync(path.join(gitDir,'reftable'));throw unsupported();}catch(error){if(error.code!=='ENOENT')throw error;}
  const refs=path.join(gitDir,'refs'),info=fs.lstatSync(refs);if(!info.isDirectory()||info.isSymbolicLink()||fs.realpathSync(refs)!==refs)throw unsupported();
  format='files';
 }else if(format!=='files'&&!(allowReftable&&format==='reftable'))throw unsupported();
 if(cleanupBranch!==undefined)cleanupRefStorage(root,cleanupBranch,format);
 if(!skipProbe)await probeTransaction(root,env);
 if(ambient()!==environment||anchor(root)!==identity)throw new Error('The project Git environment changed. Review the operation again.');
 return format;
}
async function transaction(root,next,previous,{verify,checkNow=()=>{},perform,attachBranch,deleteBranch,refStorage,probeOnly=false,timeoutMs=30000}={}) {
 if(!path.isAbsolute(root)||!oid(previous)||(next!==null&&(!oid(next)||next.length!==previous.length))||typeof verify!=='function'||typeof checkNow!=='function'||(next===null&&!attachBranch&&!deleteBranch&&typeof perform!=='function')||(attachBranch&&(!core.validBranchName(attachBranch)||attachBranch==='main'||next!==null))||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw new Error('The local main update could not be reviewed safely.');
 if(deleteBranch&&(!core.validBranchName(deleteBranch.branch)||deleteBranch.branch==='main'||!oid(deleteBranch.head)||deleteBranch.head.length!==previous.length||next!==null||attachBranch||perform))throw new Error('The local feature deletion could not be reviewed safely.');
 const initialAmbient=ambient(),initialAnchor=anchor(root),verifyNow=()=>{if(ambient()!==initialAmbient||anchor(root)!==initialAnchor)throw new Error('The project Git environment changed. Review the operation again.');const result=checkNow();if(result&&typeof result.then==='function')throw new Error('The local authority check must be synchronous.');};
 const initialRefs=deleteBranch?cleanupRefStorage(root,deleteBranch.branch,refStorage):null;
 const verifyCleanupRefs=()=>{
  if(!initialRefs)return;
  if(anchor(root)!==initialAnchor)throw unsafeCleanupRefs();
  const current=cleanupRefStorage(root,deleteBranch.branch,refStorage);
  // A packed ref's missing parent directory can be created by prepare. Any
  // path that already existed must still be the same ordinary entry.
  for(const [file,identity] of initialRefs)if(current.get(file)!==identity)throw unsafeCleanupRefs();
 };
 const env=isolatedEnv();
 const child=spawn('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false','update-ref','--stdin'],{cwd:root,env,stdio:['pipe','pipe','pipe']});
 let pending='',terminal,prepared=false,commitSent=false,performStarted=false,performCompleted=false,stderrSize=0,stdoutSize=0;const lines=[],waiters=[];let rejectStopped;const stopped=new Promise((_,reject)=>{rejectStopped=reject;});stopped.catch(()=>{});
 const failure=message=>new Error(message);
 const settle=(error)=>{if(terminal)return;terminal=error;rejectStopped(error);while(waiters.length)waiters.shift().reject(error);};
 const deliver=line=>{if(waiters.length)waiters.shift().resolve(line);else lines.push(line);};
 child.stdout.on('data',chunk=>{stdoutSize+=chunk.length;pending+=chunk.toString('utf8');if(stdoutSize>8192){settle(failure('The Git ref transaction returned too much output.'));child.kill();return;}let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);deliver(line);}});
 child.stderr.on('data',chunk=>{stderrSize+=chunk.length;if(stderrSize>16384){settle(failure('The Git ref transaction returned too much error output.'));child.kill();}});
 child.on('error',()=>settle(failure('Git could not start the local main transaction.')));child.stdin.on('error',()=>settle(failure('The Git ref transaction ended unexpectedly.')));
 const exited=new Promise(resolve=>child.once('close',(code,signal)=>{settle(failure('The Git ref transaction ended before confirmation.'));resolve({code,signal});}));
 const stop=async()=>{child.kill();const escalation=setTimeout(()=>child.kill('SIGKILL'),1000);escalation.unref?.();try{return await exited;}finally{clearTimeout(escalation);}};
 const arm=()=>{const timer=setTimeout(()=>{settle(failure('The Git ref transaction timed out.'));child.kill();},timeoutMs);timer.unref?.();return timer;};let timer=arm(),releaseSent=false;
 const write=line=>new Promise((resolve,reject)=>{if(terminal)return reject(terminal);child.stdin.write(line+'\n',error=>error?reject(error):resolve());});
 const line=()=>lines.length?Promise.resolve(lines.shift()):terminal?Promise.reject(terminal):new Promise((resolve,reject)=>waiters.push({resolve,reject}));
 const expect=async expected=>{if(await line()!==expected)throw failure('Git does not support the required local main transaction.');};
 try {
  await write('start');await expect('start: ok');
  if(deleteBranch){
    // Dereference HEAD so Git locks both it and its current referent. The
    // caller verifies the symbolic target is the direct main branch under lock.
    await write(`verify HEAD ${previous}`);
    await write('option no-deref');await write(`delete refs/heads/${deleteBranch.branch} ${deleteBranch.head}`);
  } else {
    await write('option no-deref');await write(next===null?`verify refs/heads/main ${previous}`:`update refs/heads/main ${next} ${previous}`);
    if(attachBranch){await write('option no-deref');await write(`symref-update HEAD refs/heads/${probeOnly?attachBranch:'main'} ref refs/heads/${attachBranch}`);}
  }
  verifyCleanupRefs();await write('prepare');await expect('prepare: ok');prepared=true;
  verifyCleanupRefs();
  await Promise.race([Promise.resolve().then(()=>verify(env)),stopped]);
  verifyNow();
  verifyCleanupRefs();
  if((attachBranch||deleteBranch)&&probeOnly){releaseSent=true;await write('abort');await expect('abort: ok');child.stdin.end();const result=await exited;if(result.code!==0||result.signal)throw failure('Git did not confirm the capability check.');return;}
  if(next===null&&!attachBranch&&!deleteBranch){
    // Do not release the ref lock while a dispatched checkout is still active.
    // The caller's Git runner supplies its own bounded process timeout.
    clearTimeout(timer);performStarted=true;const work=Promise.resolve().then(()=>perform(env));let result;try{result=await Promise.race([work,stopped]);performCompleted=true;}catch(error){await work.catch(()=>{});timer=arm();throw error;}
    timer=arm();releaseSent=true;await write('abort');await expect('abort: ok');child.stdin.end();const closed=await exited;if(closed.code!==0||closed.signal)throw failure('Git did not confirm release of the main-ref transaction.');return result;
  }
  commitSent=true;await write('commit');await expect('commit: ok');child.stdin.end();const result=await exited;if(result.code!==0||result.signal)throw failure('Git did not confirm the local main transaction.');
 } catch(error) {
  if(prepared&&!commitSent&&!releaseSent&&!terminal){try{await write('abort');await expect('abort: ok');child.stdin.end();await exited;}catch{await stop();error.message+=' Git transaction cleanup could not be confirmed; inspect Git locks.';}}
  else await stop();
  if(performStarted){const uncertain=new Error(performCompleted?'The checkout completed, but the main-ref lock release could not be confirmed. Inspect the project and Git locks before continuing.':'The checkout may have started. Inspect the current branch, project files and Git locks before continuing.',{cause:error});uncertain.checkoutCompleted=performCompleted;uncertain.checkoutMayHaveCompleted=true;throw uncertain;}
  if(commitSent){const message=deleteBranch?'The local feature deletion may have completed. Inspect the feature branch in Source Control before continuing.':attachBranch?'The switch to main may have completed. Inspect the current branch and Source Control before continuing.':'The local main update may have completed. Inspect main and Source Control before continuing.';const uncertain=new Error(message,{cause:error});uncertain.refOutcomeUncertain=true;if(attachBranch)uncertain.headOutcomeUncertain=true;throw uncertain;}
  throw error;
 } finally {clearTimeout(timer);if(!child.killed&&child.exitCode===null)child.kill();}
}
const updateDirectMain=(root,next,previous,options)=>transaction(root,next,previous,options);
const checkoutDirectMain=(root,previous,options)=>transaction(root,null,previous,options);
const attachSameTreeMain=(root,main,branch,options)=>transaction(root,null,main,{...options,attachBranch:branch});
const deleteDirectFeature=(root,main,branch,head,options)=>transaction(root,null,main,{...options,deleteBranch:{branch,head}});
module.exports={updateDirectMain,checkoutDirectMain,preflightDirectMain,attachSameTreeMain,deleteDirectFeature};
