'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const core=require('../src/core');
const workflow=require('../src/workflow');
const github=require('../src/github');
const provenance=require('../src/commit-provenance');

async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-external-switch-')));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
  const run=(cwd,args,options={})=>{
    assert.ok(!args.some(arg=>['reset','--reset','push','fetch','pull','clone','ls-remote'].includes(arg)),'local-only, reset-free Git commands');
    return core.git(cwd,['-c',`core.hooksPath=${os.devNull}`,...args],{...options,env:options.env||env});
  };
  const git=(...args)=>run(root,args);
  await git('init','-b','main');await git('config','user.name','Test');await git('config','user.email','test@example.invalid');
  await fs.writeFile(path.join(root,'zero.json'),'{}\n');await fs.writeFile(path.join(root,'Main.java'),'base\n');
  await git('add','.');await git('commit','-m','base');
  return {root,run,git};
}

test('Switch selects existing dot, plus, Unicode and long branch names as exact local refs',async t=>{
  const {root,run,git}=await fixture(t),head=await git('rev-parse','HEAD');
  for(const name of ['release/1.2','fix+score','café','external-'+ 'x'.repeat(81)]) {
    await git('branch',name);
    const plan=await workflow.prepareSwitch(root,name,{run});
    const result=await workflow.switchPrepared(plan,{run});
    assert.equal(result.branch,name);assert.equal(result.head,head);
    assert.equal(await git('symbolic-ref','--short','HEAD'),name);
    await git('checkout','main');
  }
});

test('Switch to an external branch preserves staged, unstaged and untracked work',async t=>{
  const {root,run,git}=await fixture(t);await git('branch','fix+score');
  await fs.writeFile(path.join(root,'Main.java'),'staged\n');await git('add','Main.java');
  await fs.writeFile(path.join(root,'Main.java'),'later\n');await fs.writeFile(path.join(root,'New.java'),'untracked\n');
  const before=await git('status','--porcelain=v1','-z','--untracked-files=all');
  await workflow.switchPrepared(await workflow.prepareSwitch(root,'fix+score',{run}),{run});
  assert.equal(await git('status','--porcelain=v1','-z','--untracked-files=all'),before);
  assert.equal(await git('show',':Main.java'),'staged');
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'later\n');
  assert.equal(await fs.readFile(path.join(root,'New.java'),'utf8'),'untracked\n');
});

test('Switch still rejects options, revision expressions, malformed and symbolic branch refs',async t=>{
  const {root,run,git}=await fixture(t),head=await git('rev-parse','HEAD');
  for(const name of ['-Bmain','@{-1}','main^','main..','release//score','feature\nmain','HEAD','missing.1']) {
    await assert.rejects(workflow.prepareSwitch(root,name,{run}));
    assert.equal(await git('symbolic-ref','--short','HEAD'),'main');
    assert.equal(await git('rev-parse','HEAD'),head);
  }
  await git('symbolic-ref','refs/heads/alias.1','refs/heads/main');
  await assert.rejects(workflow.prepareSwitch(root,'alias.1',{run}),/symbolic branch/);
});

test('Switch refuses external target movement or changed dirty contents after review',async t=>{
  const {root,run,git}=await fixture(t);await git('branch','release/1.2');
  await fs.writeFile(path.join(root,'Main.java'),'reviewed\n');
  let plan=await workflow.prepareSwitch(root,'release/1.2',{run});
  await fs.writeFile(path.join(root,'Main.java'),'newer\n');
  await assert.rejects(workflow.switchPrepared(plan,{run}),/changed after review/);
  plan=await workflow.prepareSwitch(root,'release/1.2',{run});
  const tree=await git('rev-parse','HEAD^{tree}'),head=await git('rev-parse','HEAD');
  const moved=await git('commit-tree',tree,'-p',head,'-m','external branch update');
  await git('update-ref','refs/heads/release/1.2',moved,head);
  await assert.rejects(workflow.switchPrepared(plan,{run}),/changed after review/);
  assert.equal(await git('symbolic-ref','--short','HEAD'),'main');
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'newer\n');
});

test('Switch leaves obstructing edits intact when an external branch changes the same file',async t=>{
  const {root,run,git}=await fixture(t);await git('checkout','-b','release/1.2');
  await fs.writeFile(path.join(root,'Main.java'),'incoming\n');await git('add','Main.java');await git('commit','-m','incoming');
  await git('checkout','main');await fs.writeFile(path.join(root,'Main.java'),'my edits\n');
  const before=await git('status','--porcelain=v1','-z','--untracked-files=all');
  const plan=await workflow.prepareSwitch(root,'release/1.2',{run});
  await assert.rejects(workflow.switchPrepared(plan,{run}),/cannot be moved safely/);
  assert.equal(await git('symbolic-ref','--short','HEAD'),'main');
  assert.equal(await git('status','--porcelain=v1','-z','--untracked-files=all'),before);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'my edits\n');
});

test('Switch selects exact colliding and ref-like local names despite Git abbreviation',async t=>{
  const {root,run,git}=await fixture(t),head=await git('rev-parse','HEAD');
  await git('branch','release/1.2');await git('tag','release/1.2');
  await git('branch','x');await git('branch','refs/heads/x');
  await git('config','core.warnAmbiguousRefs','false');
  await fs.writeFile(path.join(root,'Main.java'),'my edits\n');
  const before=await git('status','--porcelain=v1','-z','--untracked-files=all');
  for(const name of ['release/1.2','refs/heads/x']) {
    const result=await workflow.switchPrepared(await workflow.prepareSwitch(root,name,{run}),{run});
    assert.equal(result.branch,name);assert.equal(await core.currentBranch(root,run),name);
    assert.equal(await git('symbolic-ref','HEAD'),`refs/heads/${name}`);
    assert.equal(await git('rev-parse','HEAD'),head);
    assert.equal(await git('status','--porcelain=v1','-z','--untracked-files=all'),before);
    assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'my edits\n');
    await git('checkout','main');
  }
});

test('Switch keeps exact target identity when an external tag collides after review',async t=>{
  const {root,run,git}=await fixture(t);await git('branch','release/1.2');
  await fs.writeFile(path.join(root,'Main.java'),'my edits\n');
  const plan=await workflow.prepareSwitch(root,'release/1.2',{run});
  await git('tag','release/1.2');
  const result=await workflow.switchPrepared(plan,{run});
  assert.equal(result.branch,'release/1.2');
  assert.equal(await git('symbolic-ref','HEAD'),'refs/heads/release/1.2');
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'my edits\n');
});

test('Switch selects a hash-like local branch rather than its same-named commit',async t=>{
  const {root,run,git}=await fixture(t),name=await git('rev-parse','HEAD'),tree=await git('rev-parse','HEAD^{tree}');
  const target=await git('commit-tree',tree,'-p',name,'-m','external target');await git('branch',name,target);
  const result=await workflow.switchPrepared(await workflow.prepareSwitch(root,name,{run}),{run});
  assert.equal(result.branch,name);assert.equal(result.head,target);
  assert.equal(await git('symbolic-ref','HEAD'),`refs/heads/${name}`);
});

test('exact external branch identity survives local commit, provenance and guarded confirmation',async t=>{
  const {root,run,git}=await fixture(t),remote='https://github.com/student/exact-branch.git';
  await git('remote','add','origin',remote);
  await git('branch','release/1.2');await git('tag','release/1.2');
  await git('branch','x');await git('branch','refs/heads/x');
  for(const branch of ['release/1.2','refs/heads/x']) {
    await workflow.switchPrepared(await workflow.prepareSwitch(root,branch,{run}),{run});
    await fs.writeFile(path.join(root,'Main.java'),`saved on ${branch}\n`);
    const plan=await github.prepareLocalCommit(root,run);assert.equal(plan.branch,branch);
    const saved=await provenance.withCommit(root,async()=>({parent:plan.head,result:await github.uploadPrepared(plan,'Save exact branch',{run,localOnly:true})}));
    assert.equal(saved.branch,branch);
    if(process.platform!=='win32'){assert.equal(saved.undoUnavailable,undefined);assert.equal(JSON.parse(await fs.readFile(path.join(root,'.git','zero-commit-provenance.json'),'utf8')).branch,branch);}
    const reviewed=await github.prepareUpload(root,run);assert.equal(reviewed.branch,branch);
    const sends=[];
    const synced=await provenance.withPush(root,()=>github.syncExistingHead(reviewed,{run,networkRun:async(cwd,args)=>{
      assert.equal(cwd,root);sends.push(args);
      if(args[0]==='push'){assert.deepEqual(args,['push',remote,`${saved.head}:refs/heads/${branch}`]);return '';}
      assert.deepEqual(args,['ls-remote','--heads',remote,`refs/heads/${branch}`]);return `${saved.head}\trefs/heads/${branch}`;
    }}));
    assert.equal(synced.uploaded,true);assert.equal(synced.branch,branch);assert.deepEqual(sends.map(args=>args[0]),['push','ls-remote']);
    const checked=await github.checkUpload(root,{root,remote,page:'https://github.com/student/exact-branch',branch,head:saved.head,committed:true,pushStarted:true},{run,networkRun:async(cwd,args)=>{
      assert.equal(cwd,root);assert.deepEqual(args,['ls-remote','--heads',remote,`refs/heads/${branch}`]);
      return `${saved.head}\trefs/heads/${branch}`;
    }});
    assert.equal(checked.confirmed,true);assert.equal(checked.branch,branch);
  }
});

test('symbolic current branch aliases stop review before commit, push or checkout',async t=>{
  const {root,run,git}=await fixture(t),head=await git('rev-parse','HEAD');
  await git('branch','release/1.2');await git('symbolic-ref','refs/heads/alias.1','refs/heads/main');
  await git('symbolic-ref','HEAD','refs/heads/alias.1');
  await fs.writeFile(path.join(root,'Main.java'),'my uncommitted edits\n');
  const before=await git('status','--porcelain=v1','-z','--untracked-files=all');
  const guardedRun=(cwd,args,options)=>{
    assert.ok(!args.some(arg=>['commit','push','checkout','add','update-ref'].includes(arg)),'symbolic current branch must stop before mutation');
    return run(cwd,args,options);
  };
  await assert.rejects(core.currentBranch(root,guardedRun),/symbolic reference.*Source Control/);
  await assert.rejects(workflow.prepareSwitch(root,'release/1.2',{run:guardedRun}),/symbolic reference.*Source Control/);
  await assert.rejects(workflow.prepareStart(root,'new-feature',{run:guardedRun}),/symbolic reference.*Source Control/);
  await assert.rejects(github.prepareLocalCommit(root,guardedRun),/symbolic reference.*Source Control/);
  assert.equal(await git('symbolic-ref','--no-recurse','HEAD'),'refs/heads/alias.1');
  assert.equal(await git('rev-parse','HEAD'),head);assert.equal(await git('rev-parse','refs/heads/main'),head);
  assert.equal(await git('status','--porcelain=v1','-z','--untracked-files=all'),before);
  assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'my uncommitted edits\n');
});
