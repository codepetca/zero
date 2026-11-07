'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createRepositoryReminderStorage}=require('../src/repository-reminder-storage');
const provenance=require('../src/commit-provenance');
const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
const git=(root,...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function fixture(t){const parent=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-reminder-format-'))),root=path.join(parent,'main');await fs.mkdir(root);t.after(()=>fs.rm(parent,{recursive:true,force:true}));git(root,'init','-q','-b','main');await fs.writeFile(path.join(root,'zero.json'),'{}\n');git(root,'add','zero.json');git(root,'-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','base');return {parent,root};}
function memento(){const data=new Map(),writes=[];return {data,writes,keys:()=>[...data.keys()],get:key=>data.get(key),async update(key,value){writes.push(key);data.set(key,structuredClone(value));}};}
const row=(root,branch='main')=>({root,branch,head:git(root,'rev-parse','HEAD'),remote:'https://github.com/student/app.git',page:'https://github.com/student/app',accountId:'1',kind:'network',pushStarted:true});
test('linked worktree uses explicit workspace compatibility and common provenance invalidation',async t=>{
 const {parent,root}=await fixture(t),linked=path.join(parent,'feature');git(root,'worktree','add','-q','-b','feature',linked);
 const state=memento(),notices=[],store=createRepositoryReminderStorage({state,onCompatibility:message=>notices.push(message)}),record=await store.add(linked,row(linked,'feature'));
 assert.equal(await store.supportsFileLedger(linked),false);assert.deepEqual(await store.list(linked),[record]);assert.equal(notices.length,1);assert.match(notices[0],/compatibility/);
 const common=path.join(root,'.git'),gitDir=git(linked,'rev-parse','--absolute-git-dir'),receipt=path.join(common,'zero-commit-provenance.json');await fs.writeFile(receipt,'old receipt');
 await assert.rejects(store.withProvenance(linked,{root:linked},()=>{}),/compatibility/);assert.equal(await fs.readFile(receipt,'utf8'),'old receipt');
 await provenance.withPush(linked,binding=>store.withTransaction(linked,async tx=>{assert.equal(binding.commonDir,common);assert.equal(binding.gitDir,gitDir);binding.assertCurrentNow();tx.assertCurrentNow();await assert.rejects(fs.lstat(receipt),{code:'ENOENT'});assert.deepEqual(await tx.list(),[record]);}));
 await assert.rejects(fs.lstat(path.join(gitDir,'zero-pending-sync')),{code:'ENOENT'});await store.resolve(linked,record.id,'reviewed');assert.deepEqual(await store.list(linked),[]);assert.deepEqual(state.get('zero.pendingSync.v1:'+record.id),record);
});
for(const kind of ['include','includeIf','core.worktree'])test(`upfront ${kind} compatibility preserves ordinary reminders and denies rewrite authority`,async t=>{
 const {parent,root}=await fixture(t),included=path.join(parent,'included.cfg');await fs.writeFile(included,'[user]\n name = Student\n');
 git(root,'config','--local',kind==='include'?'include.path':kind==='includeIf'?'includeIf.gitdir:**.path':'core.worktree',kind==='core.worktree'?root:included);
 const state=memento(),notices=[],store=createRepositoryReminderStorage({state,onCompatibility:value=>notices.push(value)}),record=await store.add(root,row(root));assert.equal(await store.supportsFileLedger(root),false);assert.deepEqual(await store.list(root),[record]);await assert.rejects(store.withProvenance(root,{},()=>{}),/compatibility/);assert.equal(notices.length,1);await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync')),{code:'ENOENT'});
});
test('existing file reminders prevent switching to unsupported-format compatibility',async t=>{
 const {parent,root}=await fixture(t),state=memento(),store=createRepositoryReminderStorage({state}),record=await store.add(root,row(root)),writes=state.writes.length,folder=path.join(root,'.git','zero-pending-sync'),before=await fs.readdir(folder),included=path.join(parent,'included.cfg');await fs.writeFile(included,'# custom config\n');git(root,'config','--local','include.path',included);
 await assert.rejects(store.list(root),error=>{assert.match(error.message,/shared reminder storage/);assert.equal(error.recoveryPath,folder);return true;});assert.equal(state.writes.length,writes);assert.deepEqual(await fs.readdir(folder),before);assert.deepEqual(state.get('zero.pendingSync.v1:'+record.id),record);
 git(root,'config','--local','--unset','include.path');assert.deepEqual(await store.list(root),[record]);
});
test('actual file-backend failure never selects compatibility or writes Memento',async t=>{
 const {root}=await fixture(t),state=memento(),notices=[],failure=Error('disk failure'),store=createRepositoryReminderStorage({state,onCompatibility:value=>notices.push(value),fileAdapter:{async withTransaction(){throw failure;}}});
 await assert.rejects(store.add(root,row(root)),error=>error===failure);assert.deepEqual(notices,[]);assert.deepEqual(state.writes,[]);
});
test('compatibility transaction expires and detects configuration drift before authorization',async t=>{
 const {root}=await fixture(t);git(root,'config','--local','core.worktree',root);const store=createRepositoryReminderStorage({state:memento()});let expired;
 await store.withTransaction(root,async tx=>{expired=tx;await tx.list();await fs.appendFile(path.join(root,'.git','config'),'\n# changed\n');assert.throws(()=>tx.assertCurrentNow(),/configuration changed/);});assert.throws(()=>expired.assertCurrentNow(),/expired/);
});
test('a visible external writer during compatibility persistence fails rather than becoming authorized state',async t=>{
 const {root}=await fixture(t);git(root,'config','--local','core.worktree',root);const state=memento(),update=state.update,late={...row(root),id:require('node:crypto').randomUUID(),head:'b'.repeat(40)};let inject=true;
 state.update=async(key,value)=>{await update(key,value);if(inject){inject=false;state.data.set('zero.pendingSync.v1:'+late.id,late);}};
 const store=createRepositoryReminderStorage({state});await store.withTransaction(root,async tx=>{await assert.rejects(tx.add(row(root)),/changed during/);assert.throws(()=>tx.assertCurrentNow(),/failed/);});
 const retained=await store.list(root);assert.equal(retained.length,2);assert.ok(retained.some(record=>record.id===late.id));assert.ok(retained.every(record=>state.get('zero.pendingSync.v1:'+record.id)));
});
test('compatibility cannot bypass a file ledger in the shared common Git directory',async t=>{
 const {parent,root}=await fixture(t),linked=path.join(parent,'feature');git(root,'worktree','add','-q','-b','feature',linked);const state=memento(),store=createRepositoryReminderStorage({state}),record=await store.add(root,row(root)),writes=state.writes.length,shared=path.join(root,'.git','zero-pending-sync');
 await assert.rejects(store.list(linked),error=>{assert.match(error.message,/shared reminder storage/);assert.equal(error.recoveryPath,shared);return true;});assert.equal(state.writes.length,writes);assert.deepEqual(await store.list(root),[record]);
});
test('compatibility cannot bypass a shared common-directory lock',async t=>{
 const {parent,root}=await fixture(t),linked=path.join(parent,'feature');git(root,'worktree','add','-q','-b','feature',linked);const lock=path.join(root,'.git','zero-pending-sync.lock');await fs.mkdir(lock);await fs.writeFile(path.join(lock,'owner.json'),'keep');const state=memento();
 await assert.rejects(createRepositoryReminderStorage({state}).list(linked),error=>{assert.equal(error.lockRecoveryPath,lock);assert.equal(error.recoveryPath,lock);return true;});assert.equal(await fs.readFile(path.join(lock,'owner.json'),'utf8'),'keep');assert.deepEqual(state.writes,[]);
});
for(const kind of ['pending','resolution','legacy-push','legacy-local'])test(`compatibility rejects ${kind} corruption even without any discoverable branch`,async t=>{
 const {root}=await fixture(t);git(root,'config','--local','core.worktree',root);const state=memento(),id=require('node:crypto').randomUUID();
 const [key,value]=kind==='pending'?['zero.pendingSync.v1:'+id,{id,head:'a'.repeat(40)}]:kind==='resolution'?['zero.resolvedSync.v1:'+id,{id,reason:'confirmed',record:{id}}]:[`${kind==='legacy-push'?'zero.gitUploadRecovery':'zero.localCommitPending'}:${root}:main`,{}];state.data.set(key,value);
 const store=createRepositoryReminderStorage({state});await assert.rejects(store.list(root),/unreadable/);await assert.rejects(store.add(root,row(root)),/unreadable/);assert.deepEqual(state.get(key),value);assert.deepEqual(state.writes,[]);
});
for(const legacy of [false,true])test(`compatibility rejects a conflicting resolution instead of hiding its ${legacy?'legacy':'modern'} reminder`,async t=>{
 const {root}=await fixture(t);git(root,'config','--local','core.worktree',root);const state=memento(),source=row(root),id=legacy?'legacy-'+require('node:crypto').createHash('sha256').update(JSON.stringify(source)).digest('hex'):require('node:crypto').randomUUID(),record={...source,id};
 state.data.set(legacy?`zero.gitUploadRecovery:${root}:main`:'zero.pendingSync.v1:'+id,legacy?source:record);
 const event='zero.resolvedSync.v1:'+require('node:crypto').randomUUID(),resolution={id,reason:'confirmed',record:{...record,head:'b'.repeat(40)},at:Date.now()};state.data.set(event,resolution);
 const store=createRepositoryReminderStorage({state});await assert.rejects(store.list(root),/conflicts with its exact record/);await assert.rejects(store.add(root,row(root)),/conflicts with its exact record/);assert.deepEqual(state.get(event),resolution);assert.deepEqual(state.writes,[]);
});
test('compatibility detects conflicting modern and legacy reuse of an identifier',async t=>{
 const {root}=await fixture(t);git(root,'config','--local','core.worktree',root);const state=memento(),source=row(root),id='legacy-'+require('node:crypto').createHash('sha256').update(JSON.stringify(source)).digest('hex');state.data.set(`zero.gitUploadRecovery:${root}:main`,source);state.data.set('zero.pendingSync.v1:'+id,{...source,id,head:'b'.repeat(40)});
 await assert.rejects(createRepositoryReminderStorage({state}).list(root),/Conflicting sync reminder identifiers/);assert.deepEqual(state.writes,[]);
});
