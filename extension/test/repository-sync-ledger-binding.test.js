'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createFileLedger}=require('../src/pending-sync-file-ledger');
const {createRepositorySyncLedger}=require('../src/repository-sync-ledger');
const {withLocalMutation}=require('../src/commit-provenance');
const restore=require('../src/project-restore-plan'),changeUndo=require('../src/change-undo');
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
const git=(root,...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const studentGit=(root,...args)=>git(root,'-c','user.name=Student','-c','user.email=student@example.invalid',...args);
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-ledger-binding-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));git(root,'init','-q');return root;}
function memento(){const rows=new Map();return {keys:()=>[...rows.keys()],get:key=>rows.get(key),async update(key,value){rows.set(key,structuredClone(value));}};}
const record=root=>({root,branch:'main',head:'a'.repeat(40),remote:'',type:'local'});
const adapter=options=>createRepositorySyncLedger({state:memento(),...options});
async function commits(root){await fs.writeFile(path.join(root,'a.txt'),'old\n');git(root,'add','.');studentGit(root,'commit','-qm','old');const old=git(root,'rev-parse','HEAD');await fs.writeFile(path.join(root,'a.txt'),'current\n');git(root,'add','.');studentGit(root,'commit','-qm','current');return {old,head:git(root,'rev-parse','HEAD')};}
test('composite proves provenance was held before ledger acquisition and recognizes only its two owners',async t=>{
 const root=await fixture(t),base=createFileLedger(),provenanceLock=path.join(root,'.git','zero-commit-provenance.lock'),ledgerLock=path.join(root,'.git','zero-pending-sync.lock');let observed=false;
 const fileLedger={withTransaction(project,callback,options){assert.equal(require('node:fs').lstatSync(provenanceLock).isFile(),true);observed=true;return base.withTransaction(project,callback,options);}},a=adapter({fileLedger});
 await withLocalMutation(root,binding=>a.withProvenance(root,binding,async(tx,composite)=>{
  assert.equal(observed,true);assert.equal(tx.root,root);assert.equal(composite.root,root);assert.equal(composite.gitDir,path.join(root,'.git'));assert.equal(Object.isFrozen(composite),true);
  const provenanceInfo=await fs.lstat(provenanceLock),ledgerInfo=await fs.lstat(ledgerLock);
  assert.equal(composite.ownsLock(provenanceLock,provenanceInfo),true);assert.equal(composite.ownsLock(ledgerLock,ledgerInfo),true);assert.equal(tx.ownsLock(provenanceLock,provenanceInfo),false);assert.equal(tx.ownsLock(ledgerLock,ledgerInfo),true);
  const unrelated=path.join(root,'.git','zero-unrelated.lock');await fs.writeFile(unrelated,'');assert.equal(composite.ownsLock(unrelated,await fs.lstat(unrelated)),false);assert.equal(composite.ownsLock(ledgerLock,provenanceInfo),false);await fs.unlink(unrelated);
  const saved=await tx.add(record(root));assert.deepEqual(await tx.list(),[saved]);composite.assertCurrentNow();
 }));
 await assert.rejects(fs.lstat(ledgerLock),{code:'ENOENT'});await assert.rejects(fs.lstat(provenanceLock),{code:'ENOENT'});
});
test('composite and transaction expire while their outer provenance owner remains live',async t=>{
 const root=await fixture(t),a=adapter();let expired,oldTx;
 await withLocalMutation(root,async binding=>{
  await a.withProvenance(root,binding,async(tx,composite)=>{oldTx=tx;expired=composite;await tx.list();});
  binding.assertCurrentNow();assert.throws(()=>expired.assertCurrentNow(),/expired/);assert.throws(()=>expired.ownsLock('',{}),/expired/);assert.throws(()=>oldTx.ownsLock('',{}),/expired/);
  await a.withProvenance(root,binding,async(tx,current)=>{current.assertCurrentNow();assert.throws(()=>expired.assertCurrentNow(),/expired/);await tx.list();});
 });
});
test('missing, expired, asynchronous, or unowned provenance capabilities fail before ledger acquisition',async t=>{
 const root=await fixture(t),a=adapter();let expired;
 await assert.rejects(a.withProvenance(root,undefined,()=>{}),/live standalone/);
 await withLocalMutation(root,async binding=>{
  expired=binding;await assert.rejects(a.withProvenance(root,{...binding,root:'/other'},()=>{}),/live standalone/);
  await assert.rejects(a.withProvenance(root,{...binding,assertCurrentNow:async()=>{}},()=>{}),/synchronous/);
  await assert.rejects(a.withProvenance(root,{...binding,ownsLock:()=>false},()=>{}),/not owned/);
 });
 await assert.rejects(a.withProvenance(root,expired,()=>{}),/changed|ENOENT/);await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync.lock')),{code:'ENOENT'});await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync')),{code:'ENOENT'});
});
test('replaced ledger owner fails closed and never grants a stale directory exemption',{skip:'Deferred safety scenario: replacement of a lock directory is not run.'},async t=>{
 const root=await fixture(t),a=adapter(),lock=path.join(root,'.git','zero-pending-sync.lock');let composite;
 await assert.rejects(withLocalMutation(root,binding=>a.withProvenance(root,binding,async(tx,combined)=>{
  composite=combined;const old=await fs.lstat(lock);await fs.rename(lock,lock+'.original');await fs.mkdir(lock);await fs.writeFile(path.join(lock,'owner.json'),'{}\n');
  assert.throws(()=>combined.assertCurrentNow(),/folder changed/);assert.throws(()=>combined.ownsLock(lock,old),/folder changed/);await tx.add(record(root));
 })),/folder changed|lock changed/);
 assert.throws(()=>composite.assertCurrentNow(),/expired/);assert.equal(await fs.readFile(path.join(lock,'owner.json'),'utf8'),'{}\n');assert.equal((await fs.readdir(path.join(root,'.git','zero-pending-sync'))).length,0);
});
test('replacement provenance owner is rejected at the final ledger publication boundary',{skip:'Deferred safety scenario: replacement of retained lock evidence is not run.'},async t=>{
 const root=await fixture(t),lock=path.join(root,'.git','zero-commit-provenance.lock');
 const fileLedger=createFileLedger({beforePublish:async()=>{await fs.rename(lock,lock+'.original');await fs.writeFile(lock,'replacement');}}),a=adapter({fileLedger});
 await assert.rejects(withLocalMutation(root,binding=>a.withProvenance(root,binding,tx=>tx.add(record(root)))),/lock changed/);
 assert.equal(await fs.readFile(lock,'utf8'),'replacement');assert.deepEqual(await createFileLedger().list(root),[]);
});
test('current native restore accepts the composite owned locks throughout its local phase',{skip:'Deferred for recovery safety: this scenario applies project restore.'},async t=>{
 if(process.platform==='win32')return t.skip('Native restore is unsupported on Windows');
 const root=await fixture(t),{old}=await commits(root),plan=await restore.reviewProjectRestore(root,old,{beforeMutation:async()=>{}}),a=adapter();
 const result=await withLocalMutation(root,binding=>a.withProvenance(root,binding,async(tx,composite)=>{
  const prepared=await restore.prepareProjectRestore(plan,{name:'Student',email:'student@example.invalid',binding:composite}),retained=await restore.retainPreparedProjectRestore(prepared);
  await tx.add({...record(root),head:retained.commit,operation:'restore',recoveryPath:retained.recoveryPath});composite.assertCurrentNow();return restore.applyRetainedProjectRestore(retained);
 }));
 assert.equal(git(root,'rev-parse','HEAD'),result.commit);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'old\n');assert.equal((await a.list(root))[0].head,result.commit);
});
test('current finished-change undo accepts composite lock ownership without a blanket exemption',{skip:'Deferred for recovery safety: this scenario applies a finished-change undo.'},async t=>{
 if(process.platform==='win32')return t.skip('Native finished undo is not qualified on Windows');
 const root=await fixture(t),{old,head}=await commits(root),tree=git(root,'rev-parse',`${head}^{tree}`),marker=studentGit(root,'commit-tree',tree,'-p',old,'-p',head,'-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');
 git(root,'update-ref',git(root,'symbolic-ref','HEAD'),marker,head);const plan=await changeUndo.preview(root,marker,{beforeMutation:async()=>{}}),a=adapter();
 const result=await withLocalMutation(root,binding=>a.withProvenance(root,binding,async(tx,composite)=>{await tx.list();return changeUndo.apply(plan,{confirmed:true,binding:composite});}));
 assert.equal(result.staged,true);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'old\n');assert.equal(git(root,'rev-parse','HEAD'),marker);
});
test('asynchronous ownsLock and in-place provenance lock changes fail closed',async t=>{
 const root=await fixture(t),lock=path.join(root,'.git','zero-commit-provenance.lock'),a=adapter();
 await withLocalMutation(root,async binding=>{await assert.rejects(a.withProvenance(root,{...binding,ownsLock:async()=>true},()=>{}),/synchronous/);});
 const fileLedger=createFileLedger({beforePublish:async()=>{await fs.writeFile(lock,'changed in place');}});
 await assert.rejects(withLocalMutation(root,binding=>adapter({fileLedger}).withProvenance(root,binding,tx=>tx.add(record(root)))),/lock changed during/);
 assert.deepEqual(await createFileLedger().list(root),[]);
});
