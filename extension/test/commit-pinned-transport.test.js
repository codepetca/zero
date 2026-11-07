'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),core=require('../src/core');
const {withPush}=require('../src/commit-provenance'),{createTransport}=require('../src/transport');
const remote='https://github.com/student/project.git',session={id:'1',accountId:'1',accessToken:'test-token'},sha='a'.repeat(40);
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-pinned-'))),container=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-pinned-linked-')));
 t.after(()=>Promise.all([fs.rm(root,{recursive:true,force:true}),fs.rm(container,{recursive:true,force:true})]));
 await core.git(root,['init','-b','main']);await core.git(root,['config','user.name','Student']);await core.git(root,['config','user.email','student@example.invalid']);
 await fs.writeFile(path.join(root,'zero.json'),'{}');await core.git(root,['add','zero.json']);await core.git(root,['commit','-m','Start']);
 const linked=path.join(container,'linked');await core.git(root,['worktree','add','-b','linked',linked]);return {root,linked};
}
test('pinned metadata survives a pointer change between guard and local child spawn',async t=>{
 const {root,linked}=await fixture(t),marker=path.join(linked,'.git'),original=await fs.readFile(marker,'utf8');let spawned=false;
 const transport=createTransport(remote,async()=>session,{assertCurrentNow:()=>session,environment:{...process.env,GIT_OBJECT_DIRECTORY:'/invalid'},spawn:async(_,__,options)=>{
  spawned=true;assert.equal(options.env.GIT_OBJECT_DIRECTORY,undefined);await fs.writeFile(marker,'gitdir: /does/not/exist\n');
  const actual=(await execute('git',['rev-parse','--absolute-git-dir'],options)).stdout.trim();
  const common=(await execute('git',['rev-parse','--git-common-dir'],options)).stdout.trim();
  assert.equal(actual,options.env.GIT_DIR);assert.equal(common,options.env.GIT_COMMON_DIR);assert.equal(common,path.join(root,'.git'));return {stdout:''};
 }});
 try {await withPush(linked,binding=>transport(linked,['push',remote,`${sha}:refs/heads/linked`],binding));} finally {await fs.writeFile(marker,original);}
 assert.equal(spawned,true);
});
test('metadata changes during authentication stop before spawn',async t=>{
 const {linked}=await fixture(t),marker=path.join(linked,'.git'),original=await fs.readFile(marker,'utf8');let spawned=false;
 const transport=createTransport(remote,async()=>{await fs.writeFile(marker,'gitdir: /does/not/exist\n');return session;},{assertCurrentNow:()=>session,spawn:async()=>{spawned=true;return {stdout:''};}});
 try {await assert.rejects(withPush(linked,binding=>transport(linked,['push',remote,`${sha}:refs/heads/linked`],binding)));} finally {await fs.writeFile(marker,original);}
 assert.equal(spawned,false);
});
