'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const core=require('../src/core'),{undoLatestCommit}=require('../src/commit-undo-primitive');
const changeUndo=require('../src/change-undo'),restore=require('../src/project-restore-plan');
const {withLocalMutation,withCommit}=require('../src/commit-provenance');
const {createCommitUndoAuthority}=require('../src/commit-undo-authority');
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-commit-undo-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await core.git(root,['init','-b','main']);await core.git(root,['config','user.name','Student']);await core.git(root,['config','user.email','student@example.invalid']);
 await fs.writeFile(path.join(root,'a'),'one\n');await core.git(root,['add','a']);await core.git(root,['commit','-m','First']);const parent=await core.git(root,['rev-parse','HEAD']);
 await fs.writeFile(path.join(root,'a'),'two\n');await core.git(root,['add','a']);await core.git(root,['commit','-m','Second']);const head=await core.git(root,['rev-parse','HEAD']);
 await fs.writeFile(path.join(root,'a'),'staged\n');await core.git(root,['add','a']);await fs.writeFile(path.join(root,'a'),'working\n');await fs.writeFile(path.join(root,'untracked'),'keep');
 return {root,head,parent};
}
const args=(root,head,mode)=>({root,expectedHead:head,withAuthority:async (_scope,perform)=>perform(mode)});
test('unshared undo preserves files and index and retains the original commit',async t=>{
 const mode='rewrite';
 const {root,head,parent}=await fixture(t),index=await fs.readFile(path.join(root,'.git','index')),file=await fs.readFile(path.join(root,'a'));
 const result=await undoLatestCommit(args(root,head,mode));
 assert.equal(await core.git(root,['rev-parse','HEAD']),result.head);assert.equal(await core.git(root,['rev-parse',result.recoveryRef]),head);
 assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);assert.deepEqual(await fs.readFile(path.join(root,'a')),file);assert.equal(await fs.readFile(path.join(root,'untracked'),'utf8'),'keep');
 assert.equal(result.head,parent);
});
test('uncertain authority and changed commit stop without updating a ref',async t=>{
 const {root,head}=await fixture(t);await assert.rejects(undoLatestCommit(args(root,head,'unknown')),/uncertain/);
 await assert.rejects(undoLatestCommit(args(root,'0'.repeat(head.length),'rewrite')),/changed/);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);assert.equal(await core.git(root,['for-each-ref','refs/zero/commit-undo']), '');
});
test('a failed pre-ref workspace or reminder guard preserves project and retained recovery',async t=>{
 const {root,head}=await fixture(t),index=await fs.readFile(path.join(root,'.git','index')),file=await fs.readFile(path.join(root,'a'));
 const request=args(root,head,'rewrite');request.beforeRef=async scope=>{assert.equal(scope.head,head);throw Error('Workspace or reminder changed');};
 let failure;try{await undoLatestCommit(request);}catch(error){failure=error;}
 assert.match(failure.message,/Workspace or reminder changed/);assert.ok(failure.recoveryPath);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);assert.deepEqual(await fs.readFile(path.join(root,'a')),file);assert.equal(await fs.readFile(path.join(root,'untracked'),'utf8'),'keep');
 assert.match(await core.git(root,['for-each-ref','--format=%(objectname)','refs/zero/commit-undo']),new RegExp(head));
 await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),/interrupted undo/);
});
test('a failed synchronous final guard stops immediately before the branch update',async t=>{
 const {root,head}=await fixture(t),index=await fs.readFile(path.join(root,'.git','index')),file=await fs.readFile(path.join(root,'a'));
 const request=args(root,head,'rewrite');let checked=false;request.beforeRefNow=scope=>{checked=true;assert.equal(scope.head,head);throw Error('Editor changed');};
 let failure;try{await undoLatestCommit(request);}catch(error){failure=error;}
 assert.equal(checked,true);assert.match(failure.message,/Editor changed/);assert.ok(failure.recoveryPath);assert.equal(await core.git(root,['rev-parse','HEAD']),head);
 assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);assert.deepEqual(await fs.readFile(path.join(root,'a')),file);assert.match(await core.git(root,['for-each-ref','--format=%(objectname)','refs/zero/commit-undo']),new RegExp(head));
});
test('a promise-returning final guard is rejected before the ref update',async t=>{
 const {root,head}=await fixture(t);const request=args(root,head,'rewrite');request.beforeRefNow=()=>Promise.resolve();
 let failure;try{await undoLatestCommit(request);}catch(error){failure=error;}
 assert.match(failure.message,/cannot be verified/);assert.ok(failure.recoveryPath);assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});
test('lock replacement during final authority check blocks ref movement and preserves the replacement',async t=>{
 for(const name of ['index.lock','HEAD.lock'])await t.test(name,async t=>{
  const {root,head}=await fixture(t),lock=path.join(root,'.git',name);const request=args(root,head,'rewrite');
  request.withAuthority=async(_scope,perform)=>perform('rewrite',async()=>{await fs.rename(lock,lock+'.old');await fs.writeFile(lock,'replacement');});
  await assert.rejects(undoLatestCommit(request),error=>Boolean(error.recoveryPath)&&error.lockRecoveryPath===lock);
  assert.equal(await core.git(root,['rev-parse','HEAD']),head);assert.equal(await fs.readFile(lock,'utf8'),'replacement');
 });
});
test('the synchronous authority guard can refuse the final ref dispatch',async t=>{
 const {root,head}=await fixture(t),request=args(root,head,'rewrite');let checked=false;
 request.withAuthority=async(_scope,perform)=>perform('rewrite',async()=>{},()=>{checked=true;throw Error('authority lock changed');});
 await assert.rejects(undoLatestCommit(request),error=>/authority lock changed/.test(error.message)&&Boolean(error.recoveryPath));
 assert.equal(checked,true);assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});
test('cleanup failure retains the operation error or reports completed undo',async t=>{
 for(const phase of ['failure','completed'])await t.test(phase,async t=>{
  const {root,head,parent}=await fixture(t),lock=path.join(root,'.git','index.lock'),request=args(root,head,'rewrite');
  const replace=async()=>{await fs.rename(lock,lock+'.old');await fs.writeFile(lock,'replacement');};
  if(phase==='failure')request._testBeforeRef=async()=>{await replace();throw Error('original interruption');};
  else request._testAfterRef=replace;
  await assert.rejects(undoLatestCommit(request),error=>{assert.ok(error.recoveryPath);assert.equal(error.lockRecoveryPath,lock);if(phase==='failure')assert.match(error.message,/original interruption/);else assert.equal(error.undoCompleted,true);return true;});
  assert.equal(await core.git(root,['rev-parse','HEAD']),phase==='failure'?head:parent);assert.equal(await fs.readFile(lock,'utf8'),'replacement');
 });
});
test('Git lock cleanup preserves an earlier authority cleanup failure',async t=>{
 const {root,head}=await fixture(t),request=args(root,head,'rewrite'),indexLock=path.join(root,'.git','index.lock'),authorityLock=path.join(root,'.git','zero-commit-provenance.lock');
 request.withAuthority=async(_scope,perform)=>{try{return await perform('rewrite');}catch(error){error.lockRecoveryPath=authorityLock;error.lockCleanupFailures=[{path:authorityLock,error:new Error('authority cleanup')}];throw error;}};
 request._testBeforeRef=async()=>{await fs.rename(indexLock,indexLock+'.old');await fs.writeFile(indexLock,'replacement');throw Error('original interruption');};
 await assert.rejects(undoLatestCommit(request),error=>{assert.match(error.message,/original interruption/);assert.ok(error.recoveryPath);assert.equal(error.lockRecoveryPath,authorityLock);assert.equal(error.additionalLockRecoveryPath,indexLock);assert.deepEqual(error.lockCleanupFailures.map(item=>item.path),[authorityLock,indexLock]);return true;});
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});
test('competing Git branch switch fails while locks are held',async t=>{
 const {root,head}=await fixture(t);await core.git(root,['branch','other']);let blocked=false;
 const request=args(root,head,'rewrite');request._testBeforeRef=async()=>{await assert.rejects(core.git(root,['switch','other']));blocked=true;};
 const result=await undoLatestCommit(request);assert.equal(blocked,true);assert.equal(await core.git(root,['symbolic-ref','--short','HEAD']),'main');assert.equal(await core.git(root,['rev-parse','HEAD']),result.head);
});
test('a competing branch ref update causes CAS failure and leaves recovery',async t=>{
 const {root,head}=await fixture(t);const tree=await core.git(root,['rev-parse',`${head}^{tree}`]);const newer=await core.git(root,['commit-tree',tree,'-p',head,'-m','Concurrent commit']);const request=args(root,head,'rewrite');
 request._testBeforeRef=async()=>{
  const alt=await fs.mkdtemp(path.join(root,'.git','racer-'));await fs.writeFile(path.join(alt,'HEAD'),head+'\n');await fs.writeFile(path.join(alt,'commondir'),path.join(root,'.git')+'\n');
  await core.git(root,[`--git-dir=${alt}`,'update-ref','refs/heads/main',newer,head]);
 };
 let failure;try{await undoLatestCommit(request);}catch(e){failure=e;}assert.ok(failure);assert.ok(failure.recoveryPath);assert.equal(await core.git(root,['rev-parse','HEAD']),newer);
 assert.match(await core.git(root,['for-each-ref','--format=%(objectname)','refs/zero/commit-undo']),new RegExp(head));
});

test('pending Git operations block undo before ref updates',async t=>{
 const {root,head}=await fixture(t);
 for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','sequencer','BISECT_LOG']) {
  const file=path.join(root,'.git',marker);await fs.writeFile(file,head+'\n');
  await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),/operation or recovery/);await fs.unlink(file);
 }
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});
test('an interrupted undo blocks subsequent attempts for recovery review',async t=>{
 const {root,head}=await fixture(t);const request=args(root,head,'rewrite');request._testBeforeRef=async()=>{throw new Error('interrupted');};
 let failure;try{await undoLatestCommit(request);}catch(e){failure=e;}assert.match(failure.message,/interrupted/);assert.ok(failure.recoveryPath);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
 await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),/interrupted undo/);
});
test('shared or uncertain classification never moves the branch',async t=>{
 const {root,head}=await fixture(t);
 for(const mode of ['shared','correction','unknown']) await assert.rejects(undoLatestCommit(args(root,head,mode)),/uncertain/);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});

test('failure after branch update leaves an ambiguous recovery that blocks retry',async t=>{
 const {root,head,parent}=await fixture(t);const request=args(root,head,'rewrite');request._testAfterRef=async()=>{throw new Error('interrupted');};
 let failure;try{await undoLatestCommit(request);}catch(e){failure=e;}assert.match(failure.message,/interrupted/);assert.ok(failure.recoveryPath);
 assert.equal(await core.git(root,['rev-parse','HEAD']),parent);
 await assert.rejects(undoLatestCommit(args(root,parent,'rewrite')),/interrupted undo/);
});

test('a packed pending-finish ref blocks undo',async t=>{
 const {root,head}=await fixture(t);await core.git(root,['update-ref','refs/zero/pending-finish',head]);await core.git(root,['pack-refs','--all']);
 await assert.rejects(fs.stat(path.join(root,'.git','refs','zero','pending-finish')),{code:'ENOENT'});
 await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),/operation or recovery/);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});
test('retained recovery directories are refused with their path for inspection',async t=>{
 const {root,head}=await fixture(t);const recoveryPath=path.join(root,'.git','zero-project-restore-recovery-retained');await fs.mkdir(recoveryPath);
 await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),e=>{assert.match(e.message,/retained Zero recovery/);assert.equal(e.recoveryPath,recoveryPath);return true;});
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});

test('a redirected common Git directory is refused',async t=>{
 const {root,head}=await fixture(t);const external=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-external-common-')));t.after(()=>fs.rm(external,{recursive:true,force:true}));
 await fs.cp(path.join(root,'.git'),external,{recursive:true});await fs.writeFile(path.join(root,'.git','commondir'),external+'\n');
 assert.equal(await core.git(root,['rev-parse','--show-toplevel']),root);
 await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),/cannot be verified/);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});

async function retainedCorrection(t,{interrupted=false,pinOnly=false}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-inverse-local-undo-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const git=(...args)=>{assert.ok(!args.some(arg=>['reset','--reset','push','fetch','pull','clone','ls-remote'].includes(arg)));return core.git(root,args);};
 await git('init','-b','main');await git('config','user.name','Student');await git('config','user.email','student@example.invalid');
 await fs.writeFile(path.join(root,'a'),'base\n');await git('add','a');await git('commit','-m','Base');const base=await git('rev-parse','HEAD');
 await fs.writeFile(path.join(root,'a'),'feature\n');await git('add','a');await git('commit','-m','Feature');const feature=await git('rev-parse','HEAD'),tree=await git('rev-parse','HEAD^{tree}');
 const marker=await git('commit-tree',tree,'-p',base,'-p',feature,'-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');await git('update-ref','refs/heads/main',marker,feature);
 const plan=await changeUndo.preview(root,marker,{beforeMutation:async()=>{}});let inverse,retained,correction;
 await withLocalMutation(root,async binding=>{
  inverse=await changeUndo.prepareCorrection(plan,{confirmed:true,binding});if(pinOnly)return;
  const target=await restore.reviewInverseCorrection(inverse,{binding}),prepared=await restore.prepareProjectRestore(target,{name:'Student',email:'student@example.invalid',binding});
  retained=await restore.retainPreparedProjectRestore(prepared);
  if(interrupted)await assert.rejects(restore.applyRetainedProjectRestore(retained,{_testBeforeStep:async name=>{if(name==='before-files')throw Error('interrupted correction');}}),/interrupted correction/);
  else correction=await restore.applyRetainedProjectRestore(retained);
 });
 const commit=async()=>withCommit(root,async()=>{
  const parent=await git('rev-parse','HEAD');await fs.writeFile(path.join(root,'later'),'later work\n');await git('add','later');await git('commit','-m','Later local edit');
  return {parent,result:{committed:true,uploaded:false,head:await git('rev-parse','HEAD'),branch:await core.currentBranch(root)}};
 });
 return {root,git,marker,inverse,retained,correction,commit};
}
test('completed finished-change correction permits a later real local commit undo while retaining both recoveries',{skip:'Project restore application is temporarily unavailable.'},async t=>{
 const f=await retainedCorrection(t),saved=await f.commit(),index=await fs.readFile(path.join(f.root,'.git','index'));
 const result=await undoLatestCommit({root:f.root,expectedHead:saved.head,withAuthority:createCommitUndoAuthority({mode:'local-only'})});
 assert.equal(result.head,f.correction.commit);assert.equal(await f.git('rev-parse','HEAD'),f.correction.commit);
 assert.equal(await f.git('rev-parse',result.recoveryRef),saved.head);assert.deepEqual(await fs.readFile(path.join(f.root,'.git','index')),index);
 assert.equal(await fs.readFile(path.join(f.root,'a'),'utf8'),'base\n');assert.equal(await fs.readFile(path.join(f.root,'later'),'utf8'),'later work\n');
 assert.equal((await fs.stat(f.inverse.recoveryPath)).isDirectory(),true);assert.equal((await fs.stat(f.retained.recoveryPath)).isDirectory(),true);
});
for(const scenario of ['inverse pack','inverse pin','import receipt','missing import','restore journal','orphan','pin only','interrupted','wrong branch','correction missing from ancestry'])test(`retained inverse still blocks local undo for ${scenario}`,{skip:scenario==='correction missing from ancestry'?'Requires rewinding the fixture branch.':scenario==='pin only'?false:'Project restore application is temporarily unavailable.'},async t=>{
 const f=await retainedCorrection(t,{pinOnly:scenario==='pin only',interrupted:scenario==='interrupted'});
 const edit=async(file,mutate)=>{const value=JSON.parse(await fs.readFile(file,'utf8'));mutate(value);await fs.writeFile(file,JSON.stringify(value)+'\n');};
 if(scenario==='inverse pack')await fs.appendFile(path.join(f.inverse.recoveryPath,'inverse.pack'),'changed');
 if(scenario==='inverse pin')await edit(path.join(f.inverse.recoveryPath,'pinned.json'),value=>{value.tree='0'.repeat(40);});
 if(scenario==='import receipt')await edit(path.join(f.inverse.recoveryPath,'imported.json'),value=>{value.packObject='0'.repeat(40);});
 if(scenario==='missing import')await fs.unlink(path.join(f.inverse.recoveryPath,'imported.json'));
 if(scenario==='restore journal')await fs.appendFile(path.join(f.retained.recoveryPath,'apply-journal.jsonl'),'{interrupted');
 if(scenario==='orphan')await fs.rename(f.retained.recoveryPath,path.join(f.root,'retained-restore'));
 if(scenario==='wrong branch')await f.git('checkout','-b','other');
 if(scenario==='correction missing from ancestry')await f.git('update-ref','refs/heads/main',f.marker,f.correction.commit);
 const saved=await f.commit(),head=await f.git('rev-parse','HEAD'),index=await fs.readFile(path.join(f.root,'.git','index'));let authorityCalled=false;
 await assert.rejects(undoLatestCommit({root:f.root,expectedHead:saved.head,withAuthority:async()=>{authorityCalled=true;throw Error('must not reach authority');}}),error=>Boolean(error.recoveryPath)&&/retained Zero recovery/.test(error.message));
 assert.equal(authorityCalled,false);assert.equal(await f.git('rev-parse','HEAD'),head);assert.deepEqual(await fs.readFile(path.join(f.root,'.git','index')),index);
 assert.equal(await f.git('for-each-ref','--format=%(refname)','refs/zero/commit-undo'),'');
});
test('inverse evidence changed after local undo preparation is rechecked before the branch moves',{skip:'Project restore application is temporarily unavailable.'},async t=>{
 const f=await retainedCorrection(t),saved=await f.commit();
 await assert.rejects(undoLatestCommit({root:f.root,expectedHead:saved.head,withAuthority:createCommitUndoAuthority({mode:'local-only'}),beforeRef:async()=>{
  await fs.appendFile(path.join(f.inverse.recoveryPath,'inverse.pack'),'late change');
 }}),error=>/retained Zero recovery/.test(error.message)&&Boolean(error.recoveryPath));
 assert.equal(await f.git('rev-parse','HEAD'),saved.head);assert.equal(await fs.readFile(path.join(f.root,'later'),'utf8'),'later work\n');
});
test('multiple inverse folders reuse each completed restore validation within every undo recheck',{skip:'Project restore application is temporarily unavailable.'},async t=>{
 const f=await retainedCorrection(t),dot=path.join(f.root,'.git');
 for(let i=0;i<2;i++)await fs.cp(f.inverse.recoveryPath,path.join(dot,`zero-inverse-recovery-copy${i}`),{recursive:true});
 await fs.cp(f.retained.recoveryPath,path.join(dot,'zero-project-restore-recovery-copy'),{recursive:true});
 const filename=path.resolve(__dirname,'../src/commit-undo-primitive.js'),actualRequire=require('node:module').createRequire(filename);let validations=0;
 const sandbox={module:{exports:{}},process,Buffer,require:id=>id==='./project-restore-plan'?{...restore,async validatedCompletedProjectRestore(...args){validations++;return restore.validatedCompletedProjectRestore(...args);}}:actualRequire(id)};
 require('node:vm').runInNewContext(await fs.readFile(filename,'utf8'),sandbox,{filename});
 const saved=await f.commit();await sandbox.module.exports.undoLatestCommit({root:f.root,expectedHead:saved.head,withAuthority:createCommitUndoAuthority({mode:'local-only'})});
 // Two restores are inspected once in each of the initial and two final checks,
 // regardless of the three inverse folders that select the same correction.
 assert.equal(validations,6);assert.equal(await f.git('rev-parse','HEAD'),f.correction.commit);
});
test('excess retained inverse folder count fails closed before authority',async t=>{
 const {root,head}=await fixture(t),dot=path.join(root,'.git');
 await Promise.all(Array.from({length:501},(_,i)=>fs.mkdir(path.join(dot,`zero-inverse-recovery-many${i}`))));
 await assert.rejects(undoLatestCommit(args(root,head,'rewrite')),/Too many retained recovery folders/);
 assert.equal(await core.git(root,['rev-parse','HEAD']),head);
});
test('aggregate retained recovery input capacity fails closed before hashing large contents',{skip:'Project restore application is temporarily unavailable.'},async t=>{
 const f=await retainedCorrection(t),saved=await f.commit();
 // All required evidence is valid; this additional sparse retained input makes
 // the aggregate preflight exceed its budget without allocating large data.
 const file=await fs.open(path.join(f.inverse.recoveryPath,'retained-input'),'wx');try{await file.truncate(256*1024*1024+1);}finally{await file.close();}
 await assert.rejects(undoLatestCommit(args(f.root,saved.head,'rewrite')),error=>/retained Zero recovery/.test(error.message)&&error.recoveryPath===f.inverse.recoveryPath);
 assert.equal(await f.git('rev-parse','HEAD'),saved.head);
});
