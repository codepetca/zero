import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,symlinkSync,chmodSync} from 'node:fs';
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
  const redLog=readFileSync(join(logDirectory,'baseline.log')), greenLog=readFileSync(join(logDirectory,'patched.log'));
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
