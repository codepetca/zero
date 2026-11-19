import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm, realpath, lstat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const oid = value => /^[a-f0-9]{40}$/.test(value ?? '');
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = code => Object.assign(new Error(code), {code});
const gitEnvironment = () => ({...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))),
  GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_OPTIONAL_LOCKS:'0', GIT_NO_REPLACE_OBJECTS:'1', GIT_TERMINAL_PROMPT:'0'});
const gitArgs=args=>['--no-pager','-c','core.fsmonitor=false',...args];
const git = (root, args, timeout=30000) => execFileSync('git', gitArgs(args),
  {cwd:root, encoding:'utf8', timeout, maxBuffer:2*1024*1024, env:gitEnvironment(), stdio:['ignore','pipe','pipe']});
function actionBudget(policy,assertActive) {
  const deadline=Date.now()+Math.min(1200000,(policy.limits.runSeconds??1200)*1000);
  return () => {
    let left=deadline-Date.now();
    if(assertActive) {
      try {
        const lease=assertActive();
        if(!Number.isSafeInteger(lease?.remainingMilliseconds))throw failure('REPRODUCTION_STOPPED');
        left=Math.min(left,lease.remainingMilliseconds);
      } catch {throw failure('REPRODUCTION_STOPPED');}
    }
    if(!Number.isSafeInteger(left)||left<1)throw failure('REPRODUCTION_STOPPED');
    return left;
  };
}

export function proposalBranch(context) {
  assert.ok(Number.isSafeInteger(context.issueNumber) && context.issueNumber > 0);
  assert.match(context.evidenceDigest, /^[a-f0-9]{64}$/);
  return `codex/zero-report-${context.issueNumber}-${context.evidenceDigest.slice(0,12)}`;
}

/** Scope is an additional gate, never a semantic safety verdict or merge approval. */
export function inspectProposal({root, baselineSha, headSha, issueNumber, policy,assertActive}) {
  const budget=actionBudget(policy,assertActive),readGit=args=>git(root,args,Math.min(30000,budget()));
  if (!oid(baselineSha) || !oid(headSha) || !Number.isSafeInteger(issueNumber) || issueNumber < 1) throw failure('PROPOSAL_IDENTITY_INVALID');
  if (policy.mergeAllowed !== false || policy.releaseAllowed !== false) throw failure('PROPOSAL_AUTHORITY_INVALID');
  if (readGit(['merge-base', baselineSha, headSha]).trim() !== baselineSha) throw failure('PROPOSAL_BASE_MISMATCH');
  const commits = Number(readGit(['rev-list', '--count', `${baselineSha}..${headSha}`]).trim());
  if (commits !== 1 || policy.limits.proposalCommits !== 1 || readGit(['rev-list','--parents','-n','1',headSha]).trim()!==`${headSha} ${baselineSha}`) throw failure('PROPOSAL_COMMITS_EXCEEDED');
  const testPath = `extension/test/zero-report-${issueNumber}-regression.test.js`;
  const raw = readGit(['diff', '--name-status', '--no-renames', '-z', baselineSha, headSha]).split('\0');
  assert.equal(raw.pop(), '');
  const files = [];
  for (let i=0; i<raw.length; i+=2) {
    const [status, name] = raw.slice(i,i+2);
    if (!name || !['M','A'].includes(status)) throw failure('PROPOSAL_UNSUPPORTED_CHANGE');
    if (name === testPath ? status !== 'A' : status !== 'M' || !policy.draftSourcePaths.includes(name)) throw failure('PROPOSAL_OWNER_REQUIRED');
    const entry = readGit(['ls-tree', headSha, '--', name]).trim();
    if (!entry.startsWith('100644 blob ') || !entry.endsWith('\t'+name)) throw failure('PROPOSAL_FILE_MODE_INVALID');
    if (status === 'M' && !readGit(['ls-tree', baselineSha, '--', name]).startsWith('100644 blob ')) throw failure('PROPOSAL_FILE_MODE_INVALID');
    files.push(name);
  }
  if (!files.includes(testPath) || files.length < 2 || files.length > policy.limits.changedFiles) throw failure('PROPOSAL_REGRESSION_REQUIRED');
  const numbers = readGit(['diff', '--numstat', '--no-renames', '-z', baselineSha, headSha]).split('\0').filter(Boolean);
  let lines = 0;
  for (const value of numbers) {
    const match = /^(\d+)\t(\d+)\t(.+)$/.exec(value);
    if (!match || !files.includes(match[3])) throw failure('PROPOSAL_BINARY_REJECTED');
    lines += Number(match[1])+Number(match[2]);
  }
  if (lines > policy.limits.changedLines) throw failure('PROPOSAL_SIZE_EXCEEDED');
  // New execution, network, credential and filesystem capabilities are outside
  // the first rollout. Review still checks semantics and existing capabilities.
  const risky = /\b(?:require\s*\(|import\s|import\s*\(|fetch\s*\(|eval\s*\(|new\s+Function|process\s*\.|child_process|execFile|spawn|writeFile|unlink|rmSync|chmod|credential|secret)/i;
  for (const file of files.filter(name => name !== testPath)) {
    const added = readGit(['diff', '--unified=0', baselineSha, headSha, '--', file]).split('\n').filter(line=>line.startsWith('+')&&!line.startsWith('+++')).join('\n');
    if (risky.test(added)) throw failure('PROPOSAL_CAPABILITY_REVIEW_REQUIRED');
  }
  return {baselineSha, headSha, testPath, files, lines, issueNumber};
}

function testEnvironment(home) {
  const env = {};
  for (const key of ['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','TMPDIR','TMP','TEMP','LANG','LC_ALL']) if (process.env[key]) env[key]=process.env[key];
  return {...env, HOME:home, USERPROFILE:home, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull,
    GIT_TERMINAL_PROMPT:'0', NO_COLOR:'1'};
}
async function runChild(command,args,{cwd,env,timeout,budget}) {
  const duration=Math.max(1,Math.min(timeout,budget()));
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    const chunks=[];let size=0,stopped,force;
    const kill=signal=>{try{if(child.pid){if(process.platform==='win32')child.kill(signal);else process.kill(-child.pid,signal);}}catch(error){if(error.code!=='ESRCH')stopped??=failure('REPRODUCTION_UNAVAILABLE');}};
    const stop=code=>{if(stopped)return;stopped=failure(code);kill('SIGTERM');force=setTimeout(()=>kill('SIGKILL'),250);};
    const timer=setTimeout(()=>stop('REPRODUCTION_STOPPED'),duration);
    const poll=setInterval(()=>{try{budget();}catch{stop('REPRODUCTION_STOPPED');}},50);
    const collect=bytes=>{size+=bytes.length;if(size>2*1024*1024)stop('REPRODUCTION_OUTPUT_EXCEEDED');else chunks.push(bytes);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('error',()=>{stop('REPRODUCTION_UNAVAILABLE');});
    child.once('close',(code,signal)=>{
      clearTimeout(timer);clearInterval(poll);clearTimeout(force);
      if(stopped){kill('SIGKILL');reject(stopped);return;}
      try{budget();}catch{reject(failure('REPRODUCTION_STOPPED'));return;}
      if(signal||!Number.isInteger(code)){reject(failure('REPRODUCTION_UNAVAILABLE'));return;}
      resolve({exitCode:code,output:Buffer.concat(chunks).toString('utf8')});
    });
  });
}
async function runTest(directory,testPath,home,timeout,budget) {
  return runChild(process.execPath,['--test','--test-concurrency=1',`--test-timeout=${Math.max(1,Math.min(60000,timeout,budget()))}`,testPath],
    {cwd:directory,env:testEnvironment(home),timeout,budget});
}
function tapCount(output, name) {
  const matches=[...output.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`,'gm'))];
  return matches.length ? Number(matches.at(-1)[1]) : -1;
}

/** Executes only the maintained baseline and proposed regression in fresh trees.
 * The empty HOME/minimal environment is hygiene, not an OS security sandbox.
 * The coordinator must inspect the authored test and use synthetic fixtures.
 */
export async function proveProposal({root, baselineSha, headSha, issueNumber, policy, logDirectory,assertActive}) {
  const budget=actionBudget(policy,assertActive);
  const proposal=inspectProposal({root,baselineSha,headSha,issueNumber,policy,assertActive:()=>({remainingMilliseconds:budget()})});
  budget();
  const scratch=await realpath(await mkdtemp(path.join(os.tmpdir(),'zero-triage-proof-')));
  const baseline=path.join(scratch,'baseline'), patched=path.join(scratch,'patched'), home=path.join(scratch,'home');
  const trees=[];
  try {
    budget();
    await mkdir(home,{mode:0o700});
    for (const [directory,sha] of [[baseline,baselineSha],[patched,headSha]]) {
      budget();trees.push(directory);
      const added=await runChild('git',gitArgs(['worktree','add','--detach',directory,sha]),{cwd:root,env:gitEnvironment(),timeout:30000,budget});
      if(added.exitCode!==0)throw failure('REPRODUCTION_UNAVAILABLE');
    }
    budget();
    const test=await readFile(path.join(patched,proposal.testPath));
    if (test.length > 65536) throw failure('PROPOSAL_TEST_TOO_LARGE');
    budget();
    await writeFile(path.join(baseline,proposal.testPath),test,{flag:'wx',mode:0o600});
    const red=await runTest(baseline,proposal.testPath,home,policy.limits.reproductionMilliseconds,budget);
    const green=await runTest(patched,proposal.testPath,home,policy.limits.reproductionMilliseconds,budget);
    if (red.exitCode !== 1 || tapCount(red.output,'fail') < 1 || !/ERR_ASSERTION/.test(red.output) ||
        /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|SyntaxError/.test(red.output) || green.exitCode !== 0 ||
        tapCount(green.output,'fail') !== 0 || tapCount(green.output,'pass') < 1 || tapCount(green.output,'skipped') !== 0) {
      throw failure('REPRODUCTION_NOT_CONFIRMED');
    }
    // Preserve immutable evidence for every reviewed/corrected head in a run.
    budget();logDirectory=path.join(logDirectory,headSha);
    await mkdir(logDirectory,{recursive:true,mode:0o700});
    const logStat=await lstat(logDirectory);
    if(!logStat.isDirectory()||logStat.isSymbolicLink()||(logStat.mode&0o077)||
        (process.getuid&&logStat.uid!==process.getuid())||await realpath(logDirectory)!==path.resolve(logDirectory))throw failure('PROPOSAL_LOG_DIRECTORY_INVALID');
    budget();
    await writeFile(path.join(logDirectory,'baseline.log'),red.output,{flag:'wx',mode:0o600});
    budget();
    await writeFile(path.join(logDirectory,'patched.log'),green.output,{flag:'wx',mode:0o600});
    return {baselineSha,headSha,testPath:proposal.testPath,baselineLogSha256:hash(red.output),patchedLogSha256:hash(green.output)};
  } finally {
    let cleanupFailed=false;
    for (const directory of trees.reverse()) {
      try { git(root,['worktree','remove','--force',directory]); } catch { cleanupFailed=true; }
    }
    if (!cleanupFailed) await rm(scratch,{recursive:true,force:true});
    else throw failure('REPRODUCTION_CLEANUP_INCOMPLETE');
  }
}
