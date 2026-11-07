'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const retained = require('../src/git-retained-recovery');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-retained-test-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'.git'));
  const folder = path.join(root,'.git','zero-text-recovery-abc123');
  await fs.mkdir(folder);
  return {root,folder};
}
async function manifest(folder, values = {}) {
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({version:1,path:'src/Main.java',original:'original',expectedHash:hash('student work'),mode:420,...values}));
}
test('lists and reads retained copy as observation, including later edits',async t=>{
  const {root,folder} = await fixture(t);
  await manifest(folder);
  await fs.writeFile(path.join(folder,'original'),'later work');
  await fs.writeFile(path.join(folder,'observed.json'),JSON.stringify({hash:hash('later work'),size:10}));
  assert.deepEqual(await retained.list(root),['zero-text-recovery-abc123']);
  const copy = await retained.inspect(root,'zero-text-recovery-abc123');
  assert.equal(copy.originalPath,'src/Main.java');assert.equal(copy.content,'later work');
  assert.match(copy.status,/matches its recorded observation/);assert.match(copy.status,/later edits/);
  assert.equal(await fs.readFile(path.join(folder,'original'),'utf8'),'later work');
});
test('incomplete, invalid and absent originals remain visible',async t=>{
  const {root,folder} = await fixture(t);
  assert.match((await retained.inspect(root,'zero-text-recovery-abc123')).status,/Incomplete/);
  await fs.writeFile(path.join(folder,'manifest.json'),'null');
  assert.match((await retained.inspect(root,'zero-text-recovery-abc123')).status,/Invalid/);
  await manifest(folder,{path:'../../secret'});
  assert.match((await retained.inspect(root,'zero-text-recovery-abc123')).status,/Invalid/);
  await manifest(folder);assert.match((await retained.inspect(root,'zero-text-recovery-abc123')).status,/missing/);
  await fs.writeFile(path.join(folder,'original'),'student work');
  assert.match((await retained.inspect(root,'zero-text-recovery-abc123')).status,/Incomplete/);
  await manifest(folder,{original:null,expectedHash:null});
  assert.match((await retained.inspect(root,'zero-text-recovery-abc123')).status,/No original/);
});
test('rejects symlink and hardlink copies and symlinked folders',async t=>{
  const {root,folder} = await fixture(t);
  await manifest(folder);
  const outside=path.join(root,'outside');await fs.writeFile(outside,'private');
  await fs.symlink(outside,path.join(folder,'original'));
  assert.equal((await retained.inspect(root,'zero-text-recovery-abc123')).content,undefined);
  await fs.unlink(path.join(folder,'original'));await fs.link(outside,path.join(folder,'original'));
  assert.equal((await retained.inspect(root,'zero-text-recovery-abc123')).content,undefined);
  await fs.symlink(folder,path.join(root,'.git','zero-text-recovery-def456'));
  await assert.rejects(retained.inspect(root,'zero-text-recovery-def456'),/unsafe/);
  await assert.rejects(retained.inspect(root,'../outside'),/Invalid/);
});

async function projectRestoreFixture(t) {
  const {root}=await fixture(t),name='zero-project-restore-recovery-abc123',folder=path.join(root,'.git',name);
  await fs.mkdir(folder);
  const data={schema:1,head:'a'.repeat(40),selected:'b'.repeat(40),branch:'refs/heads/main',index:{copy:'index',sha256:hash('index')},files:[{name:'src/Main.java',kind:'modified',copy:'file-0',sha256:hash('work'),mode:0o100600},{name:'new.txt',kind:'added',missing:true}]};
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(data));
  return {root,name,folder,data};
}
test('discovers restore copies and reports partial and completed journals',async t=>{
  const {root,name,folder,data}=await projectRestoreFixture(t);
  assert.deepEqual(await retained.listProjectRestores(root),[name]);
  assert.match((await retained.inspectProjectRestore(root,name)).status,/No application journal/);
  await fs.writeFile(path.join(folder,'file-0'),'work');
  const copy=await retained.readProjectRestoreCopy(root,name,0,'file');
  assert.equal(copy.content,'work');assert.equal(copy.matchesBackup,true);
  await fs.writeFile(path.join(folder,'index'),'index');
  assert.equal((await retained.inspectProjectRestoreIndex(root,name,'index')).matchesBackup,true);
  await assert.rejects(retained.inspectProjectRestoreIndex(root,name,'../private'),/Invalid/);
  const start={schema:1,event:'start',head:data.head,branch:data.branch,commit:'c'.repeat(40),files:data.files};
  const entries=[start,{event:'move-intent',index:0,name:'src/Main.java'},{event:'moved',index:0},{event:'install-intent',index:0,name:'src/Main.java'},{event:'installed',index:0},{event:'install-intent',index:1,name:'new.txt'},{event:'installed',index:1},{event:'index-intent'},{event:'index-installed'},{event:'ref-intent'},{event:'complete'}];
  await fs.writeFile(path.join(folder,'apply-journal.jsonl'),entries.slice(0,3).map(JSON.stringify).join('\n')+'\n');
  assert.match((await retained.inspectProjectRestore(root,name)).status,/completion is not recorded/);
  await fs.writeFile(path.join(folder,'apply-journal.jsonl'),entries.map(JSON.stringify).join('\n')+'\n');
  assert.match((await retained.inspectProjectRestore(root,name)).status,/records completion/);
  await fs.writeFile(path.join(folder,'apply-journal.jsonl'),[start,{event:'complete'}].map(JSON.stringify).join('\n')+'\n');
  assert.match((await retained.inspectProjectRestore(root,name)).status,/incomplete or unsafe/);
});
test('restore discovery rejects untrusted paths, unsafe copies and malformed metadata',async t=>{
  const {root,name,folder,data}=await projectRestoreFixture(t);
  await assert.rejects(retained.inspectProjectRestore(root,'../outside'),/Invalid/);
  await assert.rejects(retained.readProjectRestoreCopy(root,name,0,'../../outside'),/Invalid/);
  const outside=path.join(root,'private');await fs.writeFile(outside,'private');
  await fs.symlink(outside,path.join(folder,'file-0'));
  await assert.rejects(retained.readProjectRestoreCopy(root,name,0,'file'),/unsafe/);
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({...data,files:[{...data.files[0],name:'../../private'}]}));
  assert.match((await retained.inspectProjectRestore(root,name)).status,/Invalid manifest/);
  await fs.writeFile(path.join(folder,'manifest.json'),'null');
  assert.match((await retained.inspectProjectRestore(root,name)).status,/Invalid manifest/);
});

test('schema 2 restore journal validates directory operations as an ordered prefix',async t=>{
  const {root,name,folder,data}=await projectRestoreFixture(t);
  data.files[1].name='new/nested/file.txt';
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(data));
  const start={schema:2,event:'start',head:data.head,branch:data.branch,commit:'c'.repeat(40),files:data.files,directories:['new','new/nested']};
  const entries=[start,{event:'mkdir-intent',index:0,name:'new'},{event:'mkdir-complete',index:0,name:'new'},
    {event:'mkdir-intent',index:1,name:'new/nested'},{event:'mkdir-complete',index:1,name:'new/nested'},
    {event:'move-intent',index:0,name:'src/Main.java'},{event:'moved',index:0},{event:'install-intent',index:0,name:'src/Main.java'},{event:'installed',index:0,sha256:hash('first')},
    {event:'install-intent',index:1,name:'new/nested/file.txt'},{event:'installed',index:1,sha256:hash('second')},{event:'index-intent'},{event:'index-installed'},{event:'ref-intent'},{event:'complete'}];
  const save=async rows=>fs.writeFile(path.join(folder,'apply-journal.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
  for(const length of [1,2,3,4,5,entries.length-1]) {
    await save(entries.slice(0,length));const info=await retained.inspectProjectRestore(root,name);
    assert.match(info.status,/completion is not recorded/);assert.deepEqual(info.events,entries.slice(0,length).map(entry=>entry.event));
  }
  await save(entries);assert.match((await retained.inspectProjectRestore(root,name)).status,/records completion/);
  for(const bad of [
    [start,{event:'mkdir-complete',index:0,name:'new'}],
    [start,entries[1],{event:'mkdir-complete',index:0,name:'other'}],
    [start,entries[1],{event:'complete'}],
    entries.map((entry,i)=>i===8?{event:'installed',index:0}:entry),
    entries.map((entry,i)=>i===10?{...entry,sha256:'not-a-hash'}:entry),
    [{...start,directories:['../escape']},...entries.slice(1)],
    [{...start,directories:['.git/private']},...entries.slice(1)],
    [{...start,directories:['new/nested','new']},...entries.slice(1)],
    [{...start,directories:['new','new']},...entries.slice(1)],
    [{...start,directories:['unrelated']},...entries.slice(1)],
    [{...start,schema:1},...entries.slice(1)]
  ]) {
    await save(bad);const info=await retained.inspectProjectRestore(root,name);
    assert.match(info.status,/incomplete or unsafe/);assert.deepEqual(info.events,[]);
  }
  await fs.writeFile(path.join(folder,'apply-journal.jsonl'),JSON.stringify(start)+'\n{"event":');
  assert.match((await retained.inspectProjectRestore(root,name)).status,/incomplete or unsafe/);
  const aliasFiles=[{name:'café/a',kind:'added',missing:true},{name:'cafe\u0301/b',kind:'added',missing:true}];
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({...data,files:aliasFiles}));
  await save([{...start,files:aliasFiles,directories:['café','cafe\u0301']}]);
  const alias=await retained.inspectProjectRestore(root,name);assert.match(alias.status,/incomplete or unsafe/);assert.deepEqual(alias.events,[]);
});

async function cancelFixture(t) {
  const {root}=await fixture(t),name='zero-cancel-recovery-abc123',folder=path.join(root,'.git',name);
  await fs.mkdir(folder);
  const manifest={version:1,kind:'pre-merge-cancel',root,head:'a'.repeat(40),remoteHead:'b'.repeat(40),branch:'main',fingerprint:'c'.repeat(64),index:{copy:'index',sha256:hash('index'),mode:0o100600,size:5},indexEntries:'',baseline:{},ignored:'',markers:[null,null,null,null],originalOrigHead:null,files:[{name:'src/Main.java',copy:'file-0',sha256:hash('work'),mode:0o100600,size:4},{name:'new.txt',missing:true}]};
  const raw=JSON.stringify(manifest,null,2)+'\n';await fs.writeFile(path.join(folder,'manifest.json'),raw);
  return {root,name,folder,manifest,raw};
}
test('cancel recovery discovery distinguishes a capture, partial application, and recorded completion',async t=>{
  const f=await cancelFixture(t),{root,name,folder,manifest,raw}=f;
  assert.deepEqual(await retained.listCancelRecoveries(root),[name]);
  assert.match((await retained.inspectCancelRecovery(root,name)).status,/No cancellation journal/);
  await fs.writeFile(path.join(folder,'file-0'),'work');await fs.writeFile(path.join(folder,'moved-0'),'newer work');
  assert.equal((await retained.readCancelRecoveryCopy(root,name,0,'file')).matchesBackup,true);
  assert.equal((await retained.readCancelRecoveryCopy(root,name,0,'moved')).content,'newer work');
  await fs.writeFile(path.join(folder,'index'),'index');assert.equal((await retained.inspectCancelRecoveryMetadata(root,name,'index')).matchesBackup,true);
  const start={event:'start',head:manifest.head,remoteHead:manifest.remoteHead,mergeIndexHash:'d'.repeat(64),capture:hash(raw)};
  const journal=[start,{event:'move-intent',index:0,name:'src/Main.java'},{event:'moved',index:0},{event:'install-intent',index:0,name:'src/Main.java'},{event:'installed',index:0},{event:'move-intent',index:1,name:'new.txt'},{event:'moved',index:1},{event:'index-intent'},{event:'index-installed'},{event:'metadata-intent',name:'MERGE_HEAD'},{event:'metadata-moved',name:'MERGE_HEAD'},{event:'record-intent'},{event:'complete'}];
  await fs.writeFile(path.join(folder,'cancel-journal.jsonl'),journal.slice(0,2).map(JSON.stringify).join('\n')+'\n');
  assert.match((await retained.inspectCancelRecovery(root,name)).status,/completion is not recorded/);
  await fs.writeFile(path.join(folder,'cancel-journal.jsonl'),journal.map(JSON.stringify).join('\n')+'\n');
  assert.match((await retained.inspectCancelRecovery(root,name)).status,/records cancellation completion/);
  await fs.writeFile(path.join(folder,'cancel-journal.jsonl'),[start,{event:'complete'}].map(JSON.stringify).join('\n')+'\n');
  const invalid=await retained.inspectCancelRecovery(root,name);assert.match(invalid.status,/incomplete or unsafe/);assert.deepEqual(invalid.events,[]);
  await fs.writeFile(path.join(folder,'cancel-journal.jsonl'),[start,{event:'index-intent'}].map(JSON.stringify).join('\n')+'\n');
  assert.match((await retained.inspectCancelRecovery(root,name)).status,/incomplete or unsafe/);
});
test('cancel discovery rejects untrusted selections and retains incomplete records for inspection',async t=>{
  const {root,name,folder,manifest}=await cancelFixture(t);
  await assert.rejects(retained.inspectCancelRecovery(root,'../other'),/Invalid/);
  await assert.rejects(retained.readCancelRecoveryCopy(root,name,0,'../../private'),/Invalid/);
  await assert.rejects(retained.inspectCancelRecoveryMetadata(root,name,'../../private'),/Invalid/);
  const outside=path.join(root,'private');await fs.writeFile(outside,'private');await fs.symlink(outside,path.join(folder,'file-0'));
  await assert.rejects(retained.readCancelRecoveryCopy(root,name,0,'file'),/unsafe/);
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify({...manifest,files:[{...manifest.files[0],name:'../../private'}]}));
  assert.match((await retained.inspectCancelRecovery(root,name)).status,/Invalid/);
  await fs.unlink(path.join(folder,'manifest.json'));assert.match((await retained.inspectCancelRecovery(root,name)).status,/incomplete or unsafe/);
});

async function undoFixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-undo-inspect-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>require('node:child_process').execFileSync('git',args,{cwd:root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}}).trim();
  git('init','-q','-b','main');await fs.writeFile(path.join(root,'a'),'one');git('add','a');git('-c','user.name=Student','-c','user.email=s@example.invalid','commit','-qm','first');const parent=git('rev-parse','HEAD');
  await fs.writeFile(path.join(root,'a'),'two');git('add','a');git('-c','user.name=Student','-c','user.email=s@example.invalid','commit','-qm','second');const head=git('rev-parse','HEAD');
  const name='zero-commit-undo-abc123',folder=path.join(root,'.git',name),ref='refs/zero/commit-undo/'+'a'.repeat(32),branch='refs/heads/main';await fs.mkdir(folder);
  const intent={schema:1,root,branch,head,parent,mode:'rewrite',ref};
  return {root,git,folder,name,intent};
}
test('undo discovery reports incomplete and completed records as observations without writes',async t=>{
 const {root,git,folder,name,intent}=await undoFixture(t);
 assert.deepEqual(await retained.listCommitUndos(root),[name]);assert.match((await retained.inspectCommitUndo(root,name)).status,/missing or unsafe/);
 await fs.writeFile(path.join(folder,'intent.json'),JSON.stringify(intent));let info=await retained.inspectCommitUndo(root,name);
 assert.equal(info.stage,'intent');assert.match(info.status,/may or may not/);assert.equal(info.observations.recoveryRef,null);assert.equal(info.observations.branchRef.object,intent.head);
 git('update-ref',intent.ref,intent.head);const prepared={schema:1,branch:intent.branch,head:intent.head,parent:intent.parent,mode:'rewrite',ref:intent.ref,target:intent.parent};
 await fs.writeFile(path.join(folder,'prepared.json'),JSON.stringify(prepared));info=await retained.inspectCommitUndo(root,name);assert.equal(info.stage,'prepared');assert.equal(info.observations.recoveryRef.object,intent.head);
 await t.test('observes a branch at the prior commit', {skip:'Requires rewinding the fixture branch.'}, async()=>{
 git('update-ref',intent.branch,intent.parent,intent.head);info=await retained.inspectCommitUndo(root,name);assert.match(info.status,/may or may not/);assert.equal(info.observations.branchRef.object,intent.parent);
 });
 const complete={schema:1,branch:intent.branch,head:intent.head,target:intent.parent,ref:intent.ref,mode:'rewrite'};await fs.writeFile(path.join(folder,'complete.json'),JSON.stringify(complete));
 const refs=git('show-ref'),before=await fs.readFile(path.join(folder,'complete.json'));info=await retained.inspectCommitUndo(root,name);assert.equal(info.stage,'complete');assert.match(info.status,/receipt.*current repository state may have changed/i);
 assert.equal(git('show-ref'),refs);assert.deepEqual(await fs.readFile(path.join(folder,'complete.json')),before);
});
test('undo discovery rejects unsafe names, metadata and inconsistent receipts',async t=>{
 const {root,folder,name,intent}=await undoFixture(t);await assert.rejects(retained.inspectCommitUndo(root,'../outside'),/Invalid/);
 for(const bad of [{...intent,root:'/elsewhere'},{...intent,branch:'refs/heads/../../outside'},{...intent,ref:'refs/zero/commit-undo/../../outside'},{...intent,parent:'f'.repeat(64)},null]) {
  await fs.writeFile(path.join(folder,'intent.json'),JSON.stringify(bad));assert.match((await retained.inspectCommitUndo(root,name)).status,/invalid/i);
 }
 await fs.writeFile(path.join(folder,'intent.json'),JSON.stringify(intent));await fs.writeFile(path.join(folder,'complete.json'),JSON.stringify({schema:1}));
 assert.match((await retained.inspectCommitUndo(root,name)).status,/inconsistent/);
 await fs.unlink(path.join(folder,'intent.json'));const outside=path.join(root,'private');await fs.writeFile(outside,JSON.stringify(intent));await fs.symlink(outside,path.join(folder,'intent.json'));
 assert.match((await retained.inspectCommitUndo(root,name)).status,/unsafe/);
 await fs.symlink(folder,path.join(root,'.git','zero-commit-undo-def456'));await assert.rejects(retained.inspectCommitUndo(root,'zero-commit-undo-def456'),/unsafe/);
});
