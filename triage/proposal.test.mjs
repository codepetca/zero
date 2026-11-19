import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,renameSync,symlinkSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {readPolicy} from './runner.mjs';
import {inspectProposal,proveProposal} from './proposal.mjs';

const {policy}=await readPolicy();
const src='extension/src/explorer-labels.js',regression='extension/test/zero-report-7-regression.test.js';
const red="module.exports = () => 0;\n", green="module.exports = () => 1;\n";
const regressionText="const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst result = require('../src/explorer-labels.js');\ntest('regression', () => assert.equal(result(), 1));\n";
function repo(t){
  const root=realpathSync(mkdtempSync(join(realpathSync(tmpdir()),'triage-proposal-')));
  const git=(...args)=>execFileSync('git',['--no-pager',...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'}}).trim();
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  git('init','-q');git('config','user.name','Test Git');git('config','user.email','test@example.invalid');
  function write(path,text){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text);}
  write(src,red);write('extension/test/existing.test.js','// existing\n');write('protected.js','// protected\n');
  git('add','.');git('commit','-qm','baseline');const baselineSha=git('rev-parse','HEAD');
  const commit=()=>{git('add','-A');git('commit','-qm','proposal');return git('rev-parse','HEAD');};
  return {root,git,write,commit,baselineSha};
}
const args=(r,headSha)=>({root:r.root,baselineSha:r.baselineSha,headSha,issueNumber:7,policy});
const good=r=>{r.write(src,green);r.write(regression,regressionText);return r.commit();};
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');

test('real regression fails on baseline, passes patched, hashes logs and cleans worktrees',async t=>{
  const r=repo(t),headSha=good(r),logDirectory=join(r.root,'proof-logs');
  const before=r.git('worktree','list','--porcelain');
  const proof=await proveProposal({...args(r,headSha),logDirectory});
  const redLog=readFileSync(join(logDirectory,headSha,'baseline.log')), greenLog=readFileSync(join(logDirectory,headSha,'patched.log'));
  assert.match(redLog.toString(),/ERR_ASSERTION/);assert.match(greenLog.toString(),/# fail 0/);
  assert.equal(proof.baselineLogSha256,hash(redLog));assert.equal(proof.patchedLogSha256,hash(greenLog));
  assert.equal(r.git('worktree','list','--porcelain'),before);
});

test('always passing baseline is not reproduction and temporary trees are removed',async t=>{
  const r=repo(t);r.write(src,green);r.write(regression,"const test=require('node:test'); test('passes',()=>{});\n");const headSha=r.commit();
  const before=r.git('worktree','list','--porcelain');
  await assert.rejects(proveProposal({...args(r,headSha),logDirectory:join(r.root,'proof-logs')}),{code:'REPRODUCTION_NOT_CONFIRMED'});
  assert.equal(r.git('worktree','list','--porcelain'),before);
});

test('unsafe paths, missing meaningful changes, modes and added capabilities fail inspection before execution',t=>{
  const cases=[
    r=>{r.write('protected.js','changed\n');},
    r=>{rmSync(join(r.root,src));},
    r=>{renameSync(join(r.root,src),join(r.root,'extension/src/renamed.js'));},
    r=>{rmSync(join(r.root,src));symlinkSync('elsewhere',join(r.root,src));},
    r=>{chmodSync(join(r.root,src),0o755);},
    r=>{r.write('extension/test/existing.test.js','changed\n');},
    r=>{r.write(src,Array.from({length:220},(_,i)=>`// line ${i}`).join('\n')+'\n');},
    r=>{r.write('extension/src/new-file.js','new\n');},
    r=>{r.write(src,"fetch('https://example.invalid');\n");},
    r=>{r.write(src,"require('node:child_process').execFile('echo');\n");}
  ];
  for(const mutate of cases){
    const r=repo(t);r.write(src,green);r.write(regression,regressionText);mutate(r);const headSha=r.commit();
    assert.throws(()=>inspectProposal(args(r,headSha)));
  }
  const onlyTest=repo(t);onlyTest.write(regression,regressionText);assert.throws(()=>inspectProposal(args(onlyTest,onlyTest.commit())));
});

test('wrong base and excess commits fail inspection',t=>{
  const r=repo(t),headSha=good(r);
  assert.throws(()=>inspectProposal({...args(r,headSha),baselineSha:headSha}));
  for(let i=0;i<policy.limits.proposalCommits;i++){r.write(src,green+`// ${i}\n`);r.commit();}
  assert.throws(()=>inspectProposal(args(r,r.git('rev-parse','HEAD'))),{code:'PROPOSAL_COMMITS_EXCEEDED'});
});


test('removed private canary in intermediate commit still prevents publishing history',t=>{
  const r=repo(t);
  r.write('private-canary.txt','CANARY: unpublished synthetic data\n');r.commit();
  rmSync(join(r.root,'private-canary.txt'));r.write(src,green);r.write(regression,regressionText);const headSha=r.commit();
  assert.throws(()=>inspectProposal(args(r,headSha)));
});

test('corrected amended proposal retains separate proofs for both heads',async t=>{
  const r=repo(t), firstHead=good(r), logDirectory=join(r.root,'proof-logs');
  const first=await proveProposal({...args(r,firstHead),logDirectory});
  r.write(src,green+'// corrected\n');r.git('add',src);r.git('commit','--amend','--no-edit','-q');
  const secondHead=r.git('rev-parse','HEAD');assert.notEqual(firstHead,secondHead);
  const second=await proveProposal({...args(r,secondHead),logDirectory});
  for(const [headSha,proof] of [[firstHead,first],[secondHead,second]]) {
    assert.equal(hash(readFileSync(join(logDirectory,headSha,'baseline.log'))),proof.baselineLogSha256);
    assert.equal(hash(readFileSync(join(logDirectory,headSha,'patched.log'))),proof.patchedLogSha256);
  }
});

test('pause while baseline test runs stops proof before patched test begins',async t=>{
  const r=repo(t), started=join(r.root,'baseline-started'), patched=join(r.root,'patched-started');
  r.write(src,green);
  r.write(regression,`const test=require('node:test');
const fs=require('node:fs');
const value=require('../src/explorer-labels.js');
test('slow',async()=>{ if(value()===0) {fs.writeFileSync(${JSON.stringify(started)},'started'); await new Promise(r=>setTimeout(r,2500));} else {fs.writeFileSync(${JSON.stringify(patched)},'started');} });
`);
  const headSha=r.commit();let pausedAt;
  const assertActive=()=>{if(existsSync(started)){pausedAt=Date.now();throw new Error('PAUSED');}return {remainingMilliseconds:5000};};
  const before=r.git('worktree','list','--porcelain');
  await assert.rejects(proveProposal({...args(r,headSha),logDirectory:join(r.root,'proof-logs'),assertActive}));
  assert.ok(pausedAt);assert.equal(existsSync(patched),false);assert.ok(Date.now()-pausedAt<1500,'baseline child should stop promptly');
  assert.equal(r.git('worktree','list','--porcelain'),before);
});

test('remaining action deadline bounds a running baseline child',async t=>{
  const r=repo(t),started=join(r.root,'deadline-baseline'),patched=join(r.root,'deadline-patched');
  r.write(src,green);
  r.write(regression,`const test=require('node:test');\nconst fs=require('node:fs');\nconst value=require('../src/explorer-labels.js');\ntest('slow',async()=>{ if(value()===0) {fs.writeFileSync(${JSON.stringify(started)},'started'); await new Promise(r=>setTimeout(r,2500));} else {fs.writeFileSync(${JSON.stringify(patched)},'started');} });\n`);
  const headSha=r.commit();let deadline;
  const assertActive=()=>{
    if(existsSync(started) && !deadline) deadline=Date.now()+150;
    const remainingMilliseconds=deadline ? Math.max(0,deadline-Date.now()) : 5000;
    if(!remainingMilliseconds) throw new Error('EXPIRED');
    return {remainingMilliseconds};
  };
  await assert.rejects(proveProposal({...args(r,headSha),logDirectory:join(r.root,'proof-logs'),assertActive}));
  assert.ok(deadline);assert.equal(existsSync(patched),false);assert.ok(Date.now()-deadline<1500,'deadline should stop baseline child promptly');
});
