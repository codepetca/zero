'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const core=require('../src/core'),workflow=require('../src/workflow');
const marker=require('../src/finished-change-marker');
const {createChangeHistory,marker:historyMarker}=require('../src/change-history');
const undo=require('../src/change-undo'),restore=require('../src/project-restore-plan');
const {withLocalMutation}=require('../src/commit-provenance');
const {inertGitConfigKey}=require('../src/git-config-keys');

test('v1 marker format accepts bounded exact external names and preserves old messages',()=>{
  for(const branch of ['feature-one','release/1.2','fix+score','café','a'.repeat(40),'refs/heads/x','long/'+ 'x'.repeat(81)]) {
    const message=`Zero: finish ${branch}\n\nZero-Finished-Change: 1\nZero-Change-Branch: ${branch}`;
    assert.equal(marker.finishMessage(branch),message);
    assert.equal(marker.parseFinishedMessage(message),branch);assert.equal(marker.parseFinishedMessage(message+'\n'),branch);
    assert.equal(historyMarker(message,['base','feature'],'tree','tree'),branch);
  }
  assert.equal(marker.parseFinishedMessage(marker.finishMessage('é'.repeat(marker.MAX_BRANCH_BYTES/2))),'é'.repeat(marker.MAX_BRANCH_BYTES/2));
});
test('marker text rejects malformed, injected, over-bound and mismatched names',()=>{
  for(const branch of ['main','-option','a..b','a.lock','a//b','bad name','x\nZero-Change-Branch: y','x\rbranch','x\x80y','é'.repeat(marker.MAX_BRANCH_BYTES/2+1)]) {
    assert.throws(()=>marker.finishMessage(branch));
    assert.equal(marker.parseFinishedMessage(`Zero: finish ${branch}\n\nZero-Finished-Change: 1\nZero-Change-Branch: ${branch}`),null);
  }
  const message=marker.finishMessage('release/1.2');
  for(const bad of [message.replace('Branch: release/1.2','Branch: different'),message.replace('Change: 1','Change: 2'),message+'\nextra',message+'\n\n',message.replaceAll('\n','\r\n')])assert.equal(marker.parseFinishedMessage(bad),null);
  assert.equal(historyMarker(message,['base'],'tree','tree'),null);
  assert.equal(historyMarker(message,['base','feature'],'wrong','tree'),null);
});
test('raw Git object reads preserve whitespace and reject NUL, invalid encoding and malformed headers',async()=>{
  const commit='a'.repeat(40),message=marker.finishMessage('release/1.2');
  const header=`tree ${'b'.repeat(40)}\nauthor Test <test@example.invalid> 1 +0000\ncommitter Test <test@example.invalid> 1 +0000\n\n`;
  for(const body of [message,message+'\n'])assert.equal(await marker.readFinishedBranch('/project',commit,async(_,args,options)=>{assert.deepEqual(args,['cat-file','commit',commit]);assert.equal(options.encoding,'buffer');return Buffer.from(header+body);}),'release/1.2');
  for(const body of [message+' \n',message+'\n\n',message+'\nextra\n',message+'\0MALICIOUS\n'])assert.equal(await marker.readFinishedBranch('/project',commit,async()=>Buffer.from(header+body)),null);
  assert.equal(await marker.readFinishedBranch('/project',commit,async()=>Buffer.concat([Buffer.from(header+message),Buffer.from([0xff,0x0a])])),null);
  for(const raw of [message,header.replace('author Test','invalid Test')+message,header+message+'x'.repeat(marker.MAX_COMMIT_BYTES)])assert.equal(await marker.readFinishedBranch('/project',commit,async()=>Buffer.from(raw)),null);
});
test('recovery permits exact inert external branch subsections and rejects executable settings',()=>{
  for(const name of ['main','release/1.2','fix+score','café','refs/heads/x','a'.repeat(40)])for(const variable of ['remote','merge'])assert.equal(inertGitConfigKey(`branch.${name}.${variable}`),true);
  for(const key of ['core.hooksPath','core.fsmonitor','include.path','includeIf.gitdir.path','filter.demo.clean','diff.external','branch.release/1.2.mergeOptions','branch.release/1.2.rebase','branch.a..b.remote','branch.a\nb.remote','branch.-option.remote'])assert.equal(inertGitConfigKey(key),false);
});

async function fixture(t) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-external-finish-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
  const run=(cwd,args,options={})=>{
    assert.ok(!args.some(arg=>['reset','--reset','push','fetch','pull','clone','ls-remote'].includes(arg)),'all real Git work remains local and reset-free');
    return core.git(cwd,['-c',`core.hooksPath=${os.devNull}`,...args],{...options,env:options.env||env});
  };
  const git=(...args)=>run(root,args),remote='https://github.com/student/external-finish.git';
  await git('init','-b','main');await git('config','user.name','Test');await git('config','user.email','test@example.invalid');await git('remote','add','origin',remote);
  await fs.writeFile(path.join(root,'zero.json'),'{}\n');await fs.writeFile(path.join(root,'a.txt'),'original\n');await git('add','.');await git('commit','-m','base');
  const base=await git('rev-parse','HEAD');
  const vscode={workspace:{isTrusted:true,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],registerTextDocumentContentProvider:()=>({dispose(){}})}};
  const history=createChangeHistory(vscode,{project:async()=>root});t.after(()=>history.dispose());
  return {root,run,git,remote,base,history};
}

for(const kind of ['release/1.2','fix+score','café','hash-like','refs/heads/x'])test(`real-Git external finish, history and retained correction: ${kind}`,{skip:'Deferred for recovery safety: this scenario applies a retained project restore.'},async t=>{
  const {root,run,git,remote,base,history}=await fixture(t),branch=kind==='hash-like'?base:kind;
  if(branch==='refs/heads/x')await git('branch','x');
  await git('checkout','-b',branch);await git('config',`branch.${branch}.remote`,'origin');await git('config',`branch.${branch}.merge`,`refs/heads/${branch}`);
  await fs.writeFile(path.join(root,'a.txt'),'feature\n');await git('add','a.txt');await git('commit','-m','feature');const feature=await git('rev-parse','HEAD');
  let sent;const calls=[];
  const networkRun=async(cwd,args)=>{
    assert.equal(cwd,root);calls.push(args);
    if(args[0]==='push'){assert.equal(args[1],remote);assert.match(args[2],/^[a-f0-9]{40}:refs\/heads\/main$/);sent=args[2].slice(0,40);return '';}
    assert.deepEqual(args,['ls-remote','--heads',remote,'refs/heads/main']);return `${sent}\trefs/heads/main`;
  };
  const result=await workflow.finishPrepared(await workflow.prepareFinish(root,{run}),{run,networkRun});
  assert.equal(result.finishedBranch,branch);assert.equal(result.featureHead,feature);assert.equal(await core.currentBranch(root,run),'main');
  assert.equal(await git('show','-s','--format=%B',result.head),marker.finishMessage(branch));
  assert.equal((await history.recent()).entries[0].branch,branch);
  assert.deepEqual(calls.map(args=>args[0]),['push','ls-remote']);
  await workflow.deleteFinishedBranch(root,branch,feature,{run});await assert.rejects(git('show-ref','--verify',`refs/heads/${branch}`));
  await fs.writeFile(path.join(root,'later.txt'),'later work\n');await git('add','later.txt');await git('commit','-m','later');const head=await git('rev-parse','HEAD');
  const review=await undo.preview(root,result.head,{beforeMutation:async()=>{}});assert.equal(review.name,branch);assert.deepEqual(review.files,['a.txt']);
  await withLocalMutation(root,async binding=>{
    const inverse=await undo.prepareCorrection(review,{confirmed:true,binding});
    const target=await restore.reviewInverseCorrection(inverse,{binding});
    const prepared=await restore.prepareProjectRestore(target,{name:'Test',email:'test@example.invalid',binding});
    const applied=await restore.applyRetainedProjectRestore(await restore.retainPreparedProjectRestore(prepared));
    assert.equal(await git('rev-parse',`${applied.commit}^`),head);
  });
  assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'later.txt'),'utf8'),'later work\n');assert.equal(await git('status','--porcelain'),'');
});

for(const kind of ['mismatched name','trailing branch space','extra blank lines','embedded NUL','invalid UTF-8','wrong tree','unrelated first parent','single parent'])test(`real-Git history, pending merge and undo refuse spoofed external marker: ${kind}`,async t=>{
  const {root,run,git,base,history}=await fixture(t),name='release/1.2';
  await git('checkout','-b',name);await fs.writeFile(path.join(root,'a.txt'),'feature\n');await git('add','a.txt');await git('commit','-m','feature');
  const feature=await git('rev-parse','HEAD'),featureTree=await git('rev-parse','HEAD^{tree}'),baseTree=await git('rev-parse',`${base}^{tree}`);
  const unrelated=await git('commit-tree',baseTree,'-m','unrelated root');
  const parents=kind==='single parent'?['-p',feature]:['-p',kind==='unrelated first parent'?unrelated:base,'-p',feature];
  const message=kind==='mismatched name'?marker.finishMessage(name).replace('Branch: release/1.2','Branch: different'):marker.finishMessage(name)+(kind==='trailing branch space'?' \n':kind==='extra blank lines'?'\n\n':'');
  let id=await git('commit-tree',kind==='wrong tree'?baseTree:featureTree,...parents,'-m',message);
  if(['embedded NUL','invalid UTF-8'].includes(kind)) {
    const ordinary=await run(root,['cat-file','commit',id],{encoding:'buffer'}),boundary=ordinary.indexOf(Buffer.from('\n\n'))+2;
    const body=Buffer.concat([Buffer.from(marker.finishMessage(name)),kind==='embedded NUL'?Buffer.from('\0MALICIOUS\n'):Buffer.from([0xff,0x0a])]);
    id=execFileSync('git',['hash-object','--literally','-t','commit','-w','--stdin'],{cwd:root,input:Buffer.concat([ordinary.subarray(0,boundary),body]),encoding:'utf8'}).trim();
  }
  await git('update-ref','refs/heads/main',id,base);await git('checkout','main');
  const before=await fs.readFile(path.join(root,'a.txt')),index=await fs.readFile(path.join(root,'.git','index'));
  if(kind==='invalid UTF-8')await assert.rejects(history.recent());
  else {const recent=await history.recent();assert.equal(recent.entries[0].id,id);assert.equal(recent.entries[0].branch,null);}
  await assert.rejects(undo.preview(root,id,{beforeMutation:async()=>{}}));
  assert.equal(await git('rev-parse','HEAD'),id);assert.deepEqual(await fs.readFile(path.join(root,'a.txt')),before);assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);
  await git('update-ref','refs/zero/pending-finish',id);
  await assert.rejects(workflow.startPrepared(await workflow.prepareStart(root,'next-feature',{run}),{run}),/pending finished change needs attention/);
  assert.equal(await core.currentBranch(root,run),'main');
  await git('checkout',name);
  await assert.rejects(workflow.prepareFinish(root,{run,networkRun:async()=>{throw Error('unexpected network request');}}),/pending finished change no longer matches/);
  assert.equal(await core.currentBranch(root,run),name);assert.equal(await git('rev-parse','HEAD'),feature);
});

test('external branch recovery keeps executable and behavior-changing config blocked',async t=>{
  const {root,git,base}=await fixture(t),name='release/1.2';
  await fs.writeFile(path.join(root,'a.txt'),'feature\n');await git('add','a.txt');await git('commit','-m','feature');const feature=await git('rev-parse','HEAD'),tree=await git('rev-parse','HEAD^{tree}');
  const id=await git('commit-tree',tree,'-p',base,'-p',feature,'-m',marker.finishMessage(name));await git('update-ref','refs/heads/main',id,feature);
  await git('config',`branch.${name}.remote`,'origin');await git('config',`branch.${name}.merge`,`refs/heads/${name}`);
  const index=await fs.readFile(path.join(root,'.git','index'));
  for(const key of ['filter.evil.clean','core.hooksPath','branch.release/1.2.mergeOptions']) {
    await git('config',key,'unsupported');
    await assert.rejects(undo.preview(root,id,{beforeMutation:async()=>{}}));
    await assert.rejects(restore.reviewProjectRestore(root,base,{beforeMutation:async()=>{}}));
    await git('config','--unset',key);
    assert.equal(await git('rev-parse','HEAD'),id);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);
  }
});

test('external marker retries reuse the exact v1 boundary and clear a completed pending marker on main',async t=>{
  const {root,run,git,remote,base}=await fixture(t),name='release/1.2';
  await git('checkout','-b',name);await fs.writeFile(path.join(root,'a.txt'),'feature\n');await git('add','a.txt');await git('commit','-m','feature');
  const interruptedNetwork=async(cwd,args)=>{
    assert.equal(cwd,root);
    if(args[0]==='push')throw Error('simulated interrupted transport');
    assert.deepEqual(args,['ls-remote','--heads',remote,'refs/heads/main']);return `${base}\trefs/heads/main`;
  };
  await assert.rejects(workflow.finishPrepared(await workflow.prepareFinish(root,{run,networkRun:interruptedNetwork}),{run,networkRun:interruptedNetwork}),error=>Boolean(error.workflowRecovery));
  const boundary=await git('rev-parse','refs/zero/pending-finish');let sent=base;
  const networkRun=async(cwd,args)=>{
    assert.equal(cwd,root);
    if(args[0]==='push'){assert.deepEqual(args,['push',remote,`${boundary}:refs/heads/main`]);sent=boundary;return '';}
    assert.deepEqual(args,['ls-remote','--heads',remote,'refs/heads/main']);return `${sent}\trefs/heads/main`;
  };
  const completed=await workflow.finishPrepared(await workflow.prepareFinish(root,{run,networkRun}),{run,networkRun});assert.equal(completed.head,boundary);
  await git('update-ref','refs/zero/pending-finish',boundary);
  const child=await workflow.startPrepared(await workflow.prepareStart(root,'next-feature',{run}),{run});
  assert.equal(child.branch,'next-feature');assert.equal(child.head,boundary);await assert.rejects(git('rev-parse','--verify','refs/zero/pending-finish'));
});

test('finished external branch cleanup refuses symbolic aliases before a ref mutation',async t=>{
  const {root,run,git,base}=await fixture(t),name='release/1.2';
  await fs.writeFile(path.join(root,'a.txt'),'feature\n');await git('add','a.txt');await git('commit','-m','feature');
  const feature=await git('rev-parse','HEAD'),tree=await git('rev-parse','HEAD^{tree}');
  const boundary=await git('commit-tree',tree,'-p',base,'-p',feature,'-m',marker.finishMessage(name));await git('update-ref','refs/heads/main',boundary,feature);
  await git('branch','retained-target',feature);await git('symbolic-ref',`refs/heads/${name}`,'refs/heads/retained-target');
  await assert.rejects(workflow.deleteFinishedBranch(root,name,feature,{run:(cwd,args,options)=>{
    assert.ok(!args.includes('update-ref'),'symbolic cleanup must fail before deletion');return run(cwd,args,options);
  }}),/symbolic reference.*Source Control/);
  assert.equal(await git('rev-parse','HEAD'),boundary);assert.equal(await git('rev-parse','refs/heads/retained-target'),feature);
  assert.equal(await git('symbolic-ref','--no-recurse',`refs/heads/${name}`),'refs/heads/retained-target');
});
