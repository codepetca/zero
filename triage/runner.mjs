import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {normalizeReportIssue} from './report-intake.mjs';
import {openTriageState} from './state.mjs';
import {inspectProposal, proveProposal, proposalBranch} from './proposal.mjs';

const execute=promisify(execFile);
export const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const problem=code=>Object.assign(new Error(code),{code});
const positive=value=>Number.isSafeInteger(value)&&value>0;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
export async function readPolicy() {
  const bytes=await readFile(new URL('policy.json',import.meta.url));
  const policy=JSON.parse(bytes);
  assert.equal(policy.schema,1);assert.equal(policy.mergeAllowed,false);assert.equal(policy.releaseAllowed,false);
  assert.equal(policy.source.repository,'codepetca/zero');assert.equal(policy.source.repositoryId,1409613370);assert.equal(policy.source.branch,'main');
  assert.equal(policy.identity.repository,'codepetca/zero-reports');assert.equal(policy.identity.repositoryId,1463652567);
  assert.ok(policy.limits.pages<=3&&policy.limits.issuesPerPage<=30&&policy.limits.runSeconds<=1200&&policy.limits.leaseSeconds<=1500);
  assert.ok(policy.limits.runSeconds+60<=policy.limits.leaseSeconds);
  assert.ok(policy.limits.changedFiles<=4&&policy.limits.changedLines<=200&&policy.limits.proposalCommits===1);
  return {policy,policyDigest:createHash('sha256').update(bytes).digest('hex')};
}
export async function githubRead(endpoint) {
  try {
    const {stdout}=await execute('gh',['api','--hostname','github.com','--method','GET','-H','Accept: application/vnd.github+json',endpoint],
      {timeout:20000,maxBuffer:2*1024*1024,encoding:'utf8'});
    return JSON.parse(stdout);
  } catch {throw problem('GITHUB_READ_UNAVAILABLE');}
}
async function git(root,args) {
  const {stdout}=await execute('git',['--no-pager','-c','core.fsmonitor=false',...args],
    {cwd:root,timeout:30000,maxBuffer:2*1024*1024,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_NO_REPLACE_OBJECTS:'1'}});
  return stdout.trim();
}
function repositoryMatches(repo,name,id) {
  return repo?.id===id&&repo.full_name===name&&repo.private===false&&repo.html_url===`https://github.com/${name}`&&
    repo.url===`https://api.github.com/repos/${name}`&&repo.archived===false;
}
export async function readInbox(policy,request=githubRead) {
  const i=policy.identity;
  const [repo,app,bot]=await Promise.all([request(`/repositories/${i.repositoryId}`),request(`/apps/${i.appSlug}`),request(`/users/${encodeURIComponent(i.botLogin)}`)]);
  if (!repositoryMatches(repo,i.repository,i.repositoryId)||repo.has_issues!==true||repo.owner?.id!==i.ownerId||
      app?.id!==i.appId||app.slug!==i.appSlug||app.owner?.id!==i.ownerId||
      bot?.id!==i.botUserId||bot.login!==i.botLogin||bot.type!=='Bot') throw problem('INBOX_IDENTITY_MISMATCH');
  const issues=[];
  for(let page=1;page<=policy.limits.pages;page++) {
    const rows=await request(`/repos/${i.repository}/issues?state=open&sort=updated&direction=desc&per_page=${policy.limits.issuesPerPage}&page=${page}`);
    if(!Array.isArray(rows)||rows.length>policy.limits.issuesPerPage)throw problem('INBOX_INVALID_RESPONSE');
    issues.push(...rows);
    if(rows.length<policy.limits.issuesPerPage)return issues;
  }
  // Full bounded pages do not establish that the rest of the inbox is empty.
  throw problem('INBOX_INCOMPLETE');
}
export async function readSource(policy,request=githubRead,root=sourceRoot) {
  const repo=await request(`/repositories/${policy.source.repositoryId}`);
  if(!repositoryMatches(repo,policy.source.repository,policy.source.repositoryId))throw problem('SOURCE_IDENTITY_MISMATCH');
  const remote=await git(root,['remote','get-url','origin']);
  if(![`https://github.com/${policy.source.repository}.git`,`https://github.com/${policy.source.repository}`].includes(remote))throw problem('SOURCE_REMOTE_MISMATCH');
  await git(root,['fetch','--no-tags','origin','refs/heads/main:refs/remotes/origin/main']);
  const baselineSha=await git(root,['rev-parse','refs/remotes/origin/main']);
  const sourceTree=await git(root,['rev-parse',`${baselineSha}:extension`]);
  if(!hex(baselineSha)||!hex(sourceTree))throw problem('SOURCE_SNAPSHOT_INVALID');
  let kit=JSON.parse(await git(root,['show',`${baselineSha}:release/kit.json`]));
  if(kit.publication.status!=='published')kit=JSON.parse(await git(root,['show',`${baselineSha}:release/published-kit.json`]));
  if(kit.publication.status!=='published'||!/^\d+\.\d+\.\d+$/.test(kit.kitVersion))throw problem('PUBLISHED_VERSION_UNAVAILABLE');
  return {baselineSha,sourceTree,version:kit.kitVersion};
}
export function classifyContext(context,currentVersion) {
  if(context.source!=='automatic')return 'manual-needs-evidence';
  if(context.environment.zeroVersion==='unknown')return 'unknown-version';
  if(context.environment.zeroVersion!==currentVersion)return 'different-released-version';
  if(context.counts.failures<1||context.counts.recoveries===context.counts.failures)return 'observe-recovery';
  if(context.operation==='manual'||context.stage==='unknown'||context.environment.os==='unknown')return 'insufficient-context';
  return 'investigate';
}
export async function scanInbox({store,policy,request=githubRead,snapshot=()=>readSource(policy,request)}) {
  const run=store.begin();
  if(run.status!=='acquired')return run;
  try {
    const [issues,source]=await Promise.all([readInbox(policy,request),snapshot()]);
    const results=issues.map(issue=>normalizeReportIssue(issue,policy.identity));
    const fingerprints=new Map();
    for(const r of results)if(r.status==='candidate')fingerprints.set(r.context.fingerprint,(fingerprints.get(r.context.fingerprint)||0)+1);
    const candidates=[],counts={};
    for(const r of results) {
      const reason=r.status==='candidate'?(fingerprints.get(r.context.fingerprint)>1?'ambiguous-duplicate':classifyContext(r.context,source.version)):r.reason;
      counts[reason]=(counts[reason]||0)+1;
      if(reason==='investigate')candidates.push(r.context);
    }
    store.enqueue(run.runId,candidates,source);
    const pendingOutbox=store.list().pendingOutbox;
    const job=pendingOutbox.length?null:store.claim(run.runId);
    if(!job&&!pendingOutbox.length) {store.end(run.runId);const health=store.health();return {status:health.jobs.some(row=>row.status==='queued'&&row.count>0)?'budget-limited':'no-action',counts,health};}
    return {status:pendingOutbox.length?'reconciliation-required':'investigate',runId:run.runId,expiresAt:run.expiresAt,actionDeadline:run.actionDeadline,
      counts,job,pendingOutbox,authority:{draftOnly:true,merge:false,release:false}};
  } catch(error) {try{store.end(run.runId);}catch{}throw error;}
}

export function verifiedDraft(pr,reservation,policy) {
  const repo=policy.source;
  if(!positive(pr?.number)||pr.html_url!==`https://github.com/${repo.repository}/pull/${pr.number}`||pr.state!=='open'||pr.draft!==true||
      pr.base?.repo?.id!==repo.repositoryId||pr.base.repo.full_name!==repo.repository||pr.base.ref!==repo.branch||
      pr.head?.repo?.id!==repo.repositoryId||pr.head.repo.full_name!==repo.repository||
      pr.head.ref!==reservation.branch||pr.head.sha!==reservation.headSha)throw problem('DRAFT_IDENTITY_MISMATCH');
  return {number:pr.number,url:pr.html_url,headSha:pr.head.sha,isDraft:true};
}
export async function attachDraftFromProvider({store,runId,jobId,prNumber,policy,request=githubRead}) {
  const reservation=store.list().pendingOutbox.find(row=>row.jobId===jobId);
  if(!reservation||!positive(prNumber))throw problem('OUTBOX_NOT_PENDING');
  const pr=await request(`/repos/${policy.source.repository}/pulls/${prNumber}`);
  const verified=verifiedDraft(pr,reservation,policy);
  store.attachDraft(runId,jobId,verified);
  return {status:'draft-proposed',url:verified.url};
}
export async function reconcileDrafts({store,runId,policy,request=githubRead}) {
  const pending=store.list().pendingOutbox;
  const results=[];
  for(const reservation of pending) {
    const head=encodeURIComponent(`${policy.source.repository.split('/')[0]}:${reservation.branch}`);
    const prs=await request(`/repos/${policy.source.repository}/pulls?state=all&head=${head}&per_page=30`);
    if(!Array.isArray(prs)||prs.length>=30)throw problem('DRAFT_LOOKUP_INCOMPLETE');
    const matches=prs.filter(pr=>pr.head?.sha===reservation.headSha&&pr.head?.ref===reservation.branch);
    if(matches.length!==1) {results.push({jobId:reservation.jobId,status:'owner-attention-required'});continue;}
    const verified=verifiedDraft(matches[0],reservation,policy);
    store.attachDraft(runId,reservation.jobId,verified);
    results.push({jobId:reservation.jobId,status:'draft-proposed',url:verified.url});
  }
  return {status:'reconciled',results};
}

export function parseArguments(args) {
  const [command,...rest]=args;
  if(!['scan','health','check','next','decide','prove','reserve-draft','attach-pr','abandon-draft','reconcile','end','pause','resume'].includes(command))throw problem('USAGE');
  const values={};
  for(let i=0;i<rest.length;i+=2) {
    const key=rest[i],value=rest[i+1];
    if(!['--state-dir','--run','--job','--head','--outcome','--pr'].includes(key)||!value||Object.hasOwn(values,key))throw problem('USAGE');
    values[key]=value;
  }
  return {command,values};
}
export async function main(args) {
  const {command,values}=parseArguments(args);
  const {policy,policyDigest}=await readPolicy();
  const directory=path.resolve(values['--state-dir']||path.join(os.homedir(),'.codex','zero-triage'));
  const store=openTriageState(directory,{policyDigest,leaseMs:policy.limits.leaseSeconds*1000,
    runBudgetMs:policy.limits.runSeconds*1000,
    dailyInvestigations:policy.limits.investigationsPerDay,dailyDrafts:policy.limits.draftAttemptsPerDay});
  const runId=values['--run'],jobId=Number(values['--job']);
  try {
    if(command==='health')return {health:store.health(),...store.list()};
    if(command==='pause'||command==='resume')return store.setPaused(command==='pause');
    if(command==='scan')return await scanInbox({store,policy});
    if(command==='check')return store.check(runId);
    if(command==='end')return store.end(runId);
    if(command==='next')return {job:store.claim(runId)};
    if(command==='reconcile')return await reconcileDrafts({store,runId,policy});
    if(command==='attach-pr')return await attachDraftFromProvider({store,runId,jobId,prNumber:Number(values['--pr']),policy});
    if(command==='abandon-draft')return store.abandonDraft(runId,jobId);
    const job=store.getJob(runId,jobId);
    if(command==='decide')return store.decide(runId,jobId,values['--outcome']);
    const headSha=values['--head'];
    if(command==='prove') {
      const proof=await proveProposal({root:sourceRoot,baselineSha:job.baselineSha,headSha,issueNumber:job.context.issueNumber,policy,
        assertActive:()=>store.check(runId),
        logDirectory:path.join(directory,'proofs',runId,String(jobId))});
      store.saveProof(runId,jobId,proof);return {status:'reproduced',proof};
    }
    if(command==='reserve-draft') {
      const [issue,source]=await Promise.all([githubRead(`/repos/${policy.identity.repository}/issues/${job.context.issueNumber}`),readSource(policy)]);
      const fresh=normalizeReportIssue(issue,policy.identity);
      if(fresh.status!=='candidate'||fresh.context.issueId!==job.context.issueId||fresh.context.evidenceDigest!==job.context.evidenceDigest||
          classifyContext(fresh.context,source.version)!=='investigate'||source.sourceTree!==job.sourceTree)throw problem('EVIDENCE_CHANGED');
      inspectProposal({root:sourceRoot,baselineSha:job.baselineSha,headSha,issueNumber:job.context.issueNumber,policy,assertActive:()=>store.check(runId)});
      const branch=proposalBranch(job.context),answer=store.reserveDraft(runId,jobId,{headSha,branch});
      return {...answer,branch,headSha,draftOnly:true,mergeAllowed:false,releaseAllowed:false};
    }
    throw problem('USAGE');
  } finally {store.close();}
}
