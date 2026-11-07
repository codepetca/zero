'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {commitAndSync}=require('../src/student-commit');
const root='/student',remote='https://github.com/student/project.git';
function setup() {
 const states=[],calls=[];let saved=false,drift=false;
 const deps={root,message:' Add sound ',guard:async()=>calls.push('guard'),onState:s=>states.push(s),
  prepare:async()=>({root,branch:drift?'other':'feature',head:saved?'new':'old',remote,changes:saved?[]:[{path:'a'}]}),
  commit:async(_plan,message)=>{calls.push(['commit',message]);saved=true;return {committed:true,uploaded:false,branch:'feature',head:'new'};},
  sync:async plan=>{calls.push(['sync',plan.head]);return {uploaded:true,head:'new',branch:'feature'};}};
 return {deps,calls,states,set drift(v){drift=v;}};
}
test('commits first and automatically syncs the exact saved commit',async()=>{
 const f=setup(),result=await commitAndSync(f.deps);
 assert.equal(result.synced,true);assert.deepEqual(f.states,['committing','committed','syncing','synced']);
 assert.deepEqual(f.calls.filter(Array.isArray),[['commit','Add sound'],['sync','new']]);
});
test('a failed sync preserves the successful local commit',async()=>{
 const f=setup();f.deps.sync=async()=>{throw Error('offline');};const result=await commitAndSync(f.deps);
 assert.equal(result.saved.head,'new');assert.equal(result.synced,false);assert.match(result.error.message,/offline/);assert.equal(f.states.at(-1),'sync-failed');
});
test('project drift after commit blocks network transmission',async()=>{
 const f=setup(),commit=f.deps.commit;f.deps.commit=async(...args)=>{const result=await commit(...args);f.drift=true;return result;};
 const result=await commitAndSync(f.deps);assert.equal(result.synced,false);assert.match(result.error.message,/changed/);assert.ok(!f.calls.some(x=>Array.isArray(x)&&x[0]==='sync'));
});
test('new work made after committing does not prevent syncing the saved head',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),core=require('../src/core'),github=require('../src/github');
 const project=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-student-dirty-sync-')));t.after(()=>fs.rm(project,{recursive:true,force:true}));
 await core.git(project,['init','-b','main']);await core.git(project,['config','user.name','Student']);await core.git(project,['config','user.email','student@example.invalid']);
 await core.git(project,['remote','add','origin',remote]);await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'first');
 let pushed;const networkRun=async(_root,args)=>{if(args[0]==='push'){pushed=args[2].split(':')[0];return '';}if(args[0]==='ls-remote')return `${pushed}\trefs/heads/main`;throw Error('unexpected transport');};
 const result=await commitAndSync({root:project,message:'First',guard:async()=>{},prepare:github.prepareUpload,
  commit:async(plan,message)=>{const saved=await github.uploadPrepared(plan,message,{localOnly:true});await fs.writeFile(path.join(project,'Main.java'),'newer work');return saved;},
  sync:plan=>github.syncExistingHead(plan,{networkRun})});
 assert.equal(result.synced,true);assert.equal(result.newerChanges,true);assert.equal(pushed,result.saved.head);assert.equal(await fs.readFile(path.join(project,'Main.java'),'utf8'),'newer work');
 assert.match(await core.git(project,['status','--porcelain']),/Main\.java/);
});
test('uses real local Git and leaves a commit after simulated network failure',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const core=require('../src/core'),github=require('../src/github');
 const project=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-student-commit-')));t.after(()=>fs.rm(project,{recursive:true,force:true}));
 await core.git(project,['init','-b','main']);await core.git(project,['config','user.name','Student']);await core.git(project,['config','user.email','student@example.invalid']);
 await core.git(project,['remote','add','origin',remote]);await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'class Main {}');
 let attempted=false;const result=await commitAndSync({root:project,message:'Create project',guard:async()=>{},prepare:github.prepareUpload,
  commit:(plan,message)=>github.uploadPrepared(plan,message,{localOnly:true}),sync:async plan=>{attempted=true;assert.equal(plan.changes.length,0);throw Error('offline');}});
 assert.equal(attempted,true);assert.equal(result.synced,false);assert.equal(await core.git(project,['rev-parse','HEAD']),result.saved.head);
 assert.equal(await core.git(project,['status','--porcelain']),'');
});
test('commits then pushes and confirms the exact branch using intercepted transport',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const core=require('../src/core'),github=require('../src/github');
 const project=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-student-sync-')));t.after(()=>fs.rm(project,{recursive:true,force:true}));
 await core.git(project,['init','-b','main']);await core.git(project,['config','user.name','Student']);await core.git(project,['config','user.email','student@example.invalid']);
 await core.git(project,['remote','add','origin',remote]);await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'class Main {}');
 let pushed,networkCalls=[];const networkRun=async(_root,args)=>{networkCalls.push(args);if(args[0]==='push'){pushed=args[2].split(':')[0];return '';}if(args[0]==='ls-remote')return `${pushed}\trefs/heads/main`;throw Error('unexpected transport');};
 const result=await commitAndSync({root:project,message:'Create project',guard:async()=>{},prepare:github.prepareUpload,
  commit:(plan,message)=>github.uploadPrepared(plan,message,{localOnly:true}),sync:plan=>github.uploadPrepared(plan,'Sync',{networkRun})});
 assert.equal(result.synced,true);assert.equal(pushed,result.saved.head);assert.deepEqual(networkCalls.map(args=>args[0]),['push','ls-remote']);
});
test('a missing remote leaves a locally saved commit and requests reconnection',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),core=require('../src/core'),github=require('../src/github');
 const project=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-local-commit-')));t.after(()=>fs.rm(project,{recursive:true,force:true}));
 await core.git(project,['init','-b','main']);await core.git(project,['config','user.name','Student']);await core.git(project,['config','user.email','student@example.invalid']);
 await fs.writeFile(path.join(project,'zero.json'),'{}');await fs.writeFile(path.join(project,'Main.java'),'class Main {}');
 const result=await commitAndSync({root:project,message:'Save work',guard:async()=>{},prepare:github.prepareLocalCommit,
  commit:(plan,message)=>github.uploadPrepared(plan,message,{localOnly:true}),sync:async plan=>{assert.equal(plan.remote,null);throw Error('Reconnect GitHub');}});
 assert.equal(result.synced,false);assert.match(result.error.message,/Reconnect/);assert.equal(await core.git(project,['rev-parse','HEAD']),result.saved.head);
});
