'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkBranchRemote,countBranchCommits,countGitHubBranchCommits,remoteHead,errorState,statusMessage}=require('../src/branch-remote-status');
const a='a'.repeat(40),b='b'.repeat(40);
function fixture(branch='main') {
  const state={root:'/student',branch,head:a,remote:'https://github.com/student/project.git',account:'1'};
  return {state,readState:async()=>({...state}),readRemote:async(_,ref)=>`${a}\t${ref}\n`,isAncestor:async()=>true,now:()=>123};
}
test('checks exact current refs on main and feature with explicit non-sync results',async()=>{
  for(const branch of ['main','feature']) {
    const f=fixture(branch);let requested;
    f.readRemote=async(_,ref)=>{requested=ref;return `${a}\t${ref}`;};
    assert.equal((await checkBranchRemote(f)).state,'synced');assert.equal(requested,`refs/heads/${branch}`);
    f.readRemote=async(_,ref)=>`${b}\t${ref}`;
    assert.equal((await checkBranchRemote(f)).state,'local-ahead');
    for(const ancestry of [false,null]){f.isAncestor=async()=>ancestry;assert.equal((await checkBranchRemote(f)).state,'remote-changed');}
    f.readRemote=async()=>'';assert.equal((await checkBranchRemote(f)).state,'remote-missing');
  }
  assert.match(statusMessage('synced'),/last check/);assert.doesNotMatch(statusMessage('synced'),/currently|green/i);
});
test('classifies only supported failure evidence and never mistakes failure for deletion',async()=>{
  for(const [error,state] of [[{status:401},'auth'],[{kind:'auth'},'auth'],[{code:'authentication-required'},'auth'],[{status:403},'access'],[{code:'repository-not-selected'},'access'],[{code:'permission-required'},'access'],[{code:'network-error'},'offline'],[{kind:'network'},'offline'],[{code:'ENOTFOUND'},'offline'],[new Error('unknown'),'unknown']]) {
    assert.equal(errorState(error),state);const f=fixture();f.readRemote=async()=>{throw error;};assert.equal((await checkBranchRemote(f)).state,state);
  }
  const f=fixture();for(const response of [`${b}\trefs/heads/other`,`${a}\trefs/heads/main\n${b}\trefs/heads/main`,'invalid']){f.readRemote=async()=>response;assert.equal((await checkBranchRemote(f)).state,'unknown');}
  assert.throws(()=>remoteHead(`${a}\trefs/heads/other`,'refs/heads/main'));
});
test('discards observations and errors after repository, account, branch or head drift',async()=>{
  for(const key of ['root','branch','head','remote','account','session','authEpoch'])for(const failure of [false,true]) {
    const f=fixture();f.readRemote=async(_,ref)=>{f.state[key]+='changed';if(failure)throw {kind:'network'};return `${a}\t${ref}`;};
    await assert.rejects(checkBranchRemote(f),/changed/);
  }
});
test('an unpublished tip counts from a tracked ancestor and excludes commits shared after it',async()=>{
  const shared='c'.repeat(40),anchor='d'.repeat(40);
  const compare=async(base,head,includeCommits)=>{
    assert.equal(head,b);
    if(base===a)return null;
    assert.equal(base,anchor);assert.equal(includeCommits,true);
    return {outgoing:1,incoming:2,incomingCommits:[shared,b]};
  };
  const read=async args=>{
    if(args[0]==='rev-parse'){assert.equal(args.at(-1),'refs/remotes/origin/feature^{commit}');return anchor;}
    if(args[0]==='merge-base'){assert.deepEqual(args,['merge-base','--is-ancestor',anchor,a]);return '';}
    assert.deepEqual(args,['rev-list',`${anchor}..${a}`]);
    return `${a}\n${shared}`;
  };
  assert.deepEqual(await countGitHubBranchCommits({branch:'feature',head:a,remoteHead:b},read,compare),{outgoing:2,incoming:1});
});
test('real local bare-remote observations leave HEAD, index, working files and local refs unchanged',async t=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-branch-check-'))),root=path.join(base,'project'),remote=path.join(base,'remote.git');
  t.after(()=>fs.rm(base,{recursive:true,force:true}));await fs.mkdir(root);
  const git=(...args)=>{assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'));return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}}).trim();};
  git('init','-qb','main');git('init','--bare','-q',remote);git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'a'),'a');git('add','.');git('commit','-qm','base');git('push','-q',remote,'HEAD:refs/heads/main');
  const state={root,branch:'main',head:git('rev-parse','HEAD'),remote,account:'1'};
  const f={readState:async()=>({...state}),readRemote:async(_,ref)=>git('ls-remote','--heads',remote,ref),countCommits:(local,remote)=>countBranchCommits(args=>git(...args),local,remote),isAncestor:async(x,y)=>{try{git('merge-base','--is-ancestor',x,y);return true;}catch(error){if(error.status===1)return false;if(error.status===128)return null;throw error;}}};
  const observedCounts=async()=>{const {state,outgoing,incoming}=await checkBranchRemote(f);return [state,outgoing,incoming];};
  const snapshot=async()=>({head:git('rev-parse','HEAD'),refs:git('show-ref'),index:await fs.readFile(path.join(root,'.git/index')),file:await fs.readFile(path.join(root,'a'))});
  let before=await snapshot();assert.deepEqual(await observedCounts(),['synced',0,0]);assert.deepEqual(await snapshot(),before);
  git('checkout','-qb','other');await fs.writeFile(path.join(root,'b'),'b');git('add','.');git('commit','-qm','remote change');git('push','-q',remote,'HEAD:refs/heads/main');git('checkout','-q','main');
  before=await snapshot();assert.deepEqual(await observedCounts(),['remote-changed',0,1]);assert.deepEqual(await snapshot(),before);
  git('commit','--allow-empty','-qm','first local change');git('commit','--allow-empty','-qm','second local change');
  state.head=git('rev-parse','HEAD');
  before=await snapshot();assert.deepEqual(await observedCounts(),['remote-changed',2,1]);assert.deepEqual(await snapshot(),before);
  git('--git-dir='+remote,'update-ref','-d','refs/heads/main');before=await snapshot();assert.deepEqual(await observedCounts(),['remote-missing',undefined,0]);assert.deepEqual(await snapshot(),before);
  git('--git-dir='+remote,'update-ref','refs/heads/main',git('rev-parse','HEAD~2'));
  before=await snapshot();assert.deepEqual(await observedCounts(),['local-ahead',2,0]);assert.deepEqual(await snapshot(),before);
});
