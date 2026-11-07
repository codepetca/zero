'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const core=require('../src/core');
const workflow=require('../src/workflow');

async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-feature-branch-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const run=async(cwd,args,options)=>{
    assert.ok(!args.some(arg=>['reset','--reset','push','fetch','pull','clone','ls-remote'].includes(arg)),'local-only Git commands');
    return core.git(cwd,args,options);
  };
  const git=(...args)=>run(root,args);
  await git('init','-b','main');await git('config','user.name','Test');await git('config','user.email','test@example.invalid');
  await fs.writeFile(path.join(root,'zero.json'),'{}\n');await fs.writeFile(path.join(root,'Main.java'),'base\n');
  await git('add','.');await git('commit','-m','base');const main=await git('rev-parse','HEAD');
  await git('checkout','-b','feature');await fs.writeFile(path.join(root,'Main.java'),'feature\n');await git('add','Main.java');await git('commit','-m','feature');
  return {root,run,git,main};
}
test('New branch from feature preserves its commits and staged, unstaged and untracked work',async t=>{
  const {root,run,git,main}=await fixture(t),head=await git('rev-parse','HEAD');
  await fs.writeFile(path.join(root,'Main.java'),'staged\n');await git('add','Main.java');await fs.writeFile(path.join(root,'Main.java'),'later\n');await fs.writeFile(path.join(root,'New.java'),'untracked\n');
  const before=await git('status','--porcelain=v1','-z','--untracked-files=all');
  const plan=await workflow.prepareStart(root,'child',{run});assert.equal(plan.branch,'feature');assert.match(plan.summary,/feature/);
  const result=await workflow.startPrepared(plan,{run});assert.equal(result.branch,'child');assert.equal(result.activeUncertain,false);
  assert.equal(await git('rev-parse','HEAD'),head);assert.equal(await git('rev-parse','feature'),head);assert.equal(await git('rev-parse','main'),main);
  assert.equal(await git('status','--porcelain=v1','-z','--untracked-files=all'),before);assert.equal(await git('show',':Main.java'),'staged');assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'later\n');assert.equal(await fs.readFile(path.join(root,'New.java'),'utf8'),'untracked\n');
});
test('New branch from feature refuses edited files after review',async t=>{
  const {root,run,git}=await fixture(t);await fs.writeFile(path.join(root,'Main.java'),'first\n');const plan=await workflow.prepareStart(root,'child',{run});
  await fs.writeFile(path.join(root,'Main.java'),'second\n');await assert.rejects(workflow.startPrepared(plan,{run}),/changed after review/);assert.equal(await git('branch','--show-current'),'feature');assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'second\n');
});
test('New branch from feature leaves a pending finish marker for review',async t=>{
  const {root,run,git,main}=await fixture(t),head=await git('rev-parse','HEAD');
  const tree=await git('rev-parse',`${head}^{tree}`),marker=await git('commit-tree',tree,'-p',main,'-p',head,'-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');
  await git('update-ref','refs/heads/feature',marker,head);await git('update-ref','refs/zero/pending-finish',marker);
  const plan=await workflow.prepareStart(root,'child',{run});await assert.rejects(workflow.startPrepared(plan,{run}),/pending finished change/);
  assert.equal(await git('rev-parse','refs/zero/pending-finish'),marker);assert.equal(await git('branch','--show-current'),'feature');
});
