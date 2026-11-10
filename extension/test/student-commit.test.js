'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const core=require('../src/core'),github=require('../src/github');
const {commitLocally}=require('../src/student-commit');

test('saves the first commit with or without a connected GitHub remote',async t=>{
 for(const connected of [false,true])await t.test(connected?'connected':'local only',async t=>{
  const project=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-student-commit-')));
  t.after(()=>fs.rm(project,{recursive:true,force:true}));
  await core.git(project,['init','-b','main']);
  await core.git(project,['config','user.name','Student']);
  await core.git(project,['config','user.email','student@example.invalid']);
  if(connected)await core.git(project,['remote','add','origin','https://github.com/student/project.git']);
  await fs.writeFile(path.join(project,'zero.json'),'{}');
  await fs.writeFile(path.join(project,'Main.java'),'class Main {}');
  const saved=await commitLocally({root:project,message:' Create project ',guard:async()=>{},prepare:github.prepareLocalCommit,
   commit:(plan,message)=>github.uploadPrepared(plan,message,{localOnly:true,networkRun:async()=>assert.fail('Commit must stay local')})});
  assert.equal(saved.uploaded,false);
  assert.equal(await core.git(project,['rev-parse','HEAD']),saved.head);
  assert.equal(await core.git(project,['log','-1','--format=%s']),'Create project');
  assert.equal(await core.git(project,['status','--porcelain']),'');
 });
});
