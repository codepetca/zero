import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPolicy,readInbox,scanInbox,verifiedDraft,attachDraftFromProvider,reconcileDrafts} from './runner.mjs';
import {openTriageState} from './state.mjs';
import {automaticFingerprint} from './report-intake.mjs';
import {problemIssueBody} from '../website/lib/problem-reports-github.mjs';
import contract from '../extension/src/problem-report-contract.js';

const {policy,policyDigest}=await readPolicy();
const source={baselineSha:'a'.repeat(40),sourceTree:'b'.repeat(40),version:'0.5.82'};
const fixture=(number=1,{version='0.5.82',counts={reports:1,failures:1,recoveries:0},stage='deploying'}={})=>{
  const sample={schemaVersion:2,reportId:'00000000-0000-4000-8000-000000000000',occurredAt:'2026-11-19T12:00:00.000Z',source:'automatic',operation:'publish',stage,code:'WEB_PUBLISH_DEPLOYMENT_FAILED',outcome:'failed',
    environment:{zeroVersion:version,editorVersion:'1.100.0',os:'macos',osVersion:'15.1',architecture:'arm64',distribution:'macos-app',javaVersion:'unknown',frameworkVersion:'0.3.0',browserBuilderVersion:'unknown'},breadcrumbs:[]};
  const api='https://api.github.com/repos/codepetca/zero-reports';
  return {id:number,number,state:'open',labels:[],user:{id:policy.identity.botUserId,login:policy.identity.botLogin,type:'Bot'},
    url:`${api}/issues/${number}`,repository_url:api,html_url:`https://github.com/codepetca/zero-reports/issues/${number}`,
    title:`[Zero] ${sample.code}: ${contract.REPORT_CODES[sample.code]}`,body:problemIssueBody({sample,fingerprint:automaticFingerprint(sample),...counts})};
};
function provider(pages=[[]],overrides={}) {
  const i=policy.identity;
  const repo={id:i.repositoryId,full_name:i.repository,private:false,archived:false,has_issues:true,owner:{id:i.ownerId},html_url:`https://github.com/${i.repository}`,url:`https://api.github.com/repos/${i.repository}`,...overrides.repo};
  const app={id:i.appId,slug:i.appSlug,owner:{id:i.ownerId},...overrides.app};
  const bot={id:i.botUserId,login:i.botLogin,type:'Bot',...overrides.bot};
  return async endpoint=>{
    if(endpoint===`/repositories/${i.repositoryId}`)return repo;
    if(endpoint===`/apps/${i.appSlug}`)return app;
    if(endpoint===`/users/${encodeURIComponent(i.botLogin)}`)return bot;
    const match=endpoint.match(/&page=(\d+)$/);
    if(match)return pages[Number(match[1])-1]??[];
    throw new Error('unexpected request');
  };
}
function setup(t){const dir=realpathSync(mkdtempSync(join(realpathSync(tmpdir()),'triage-runner-')));const store=openTriageState(join(dir,'db'),{policyDigest});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const scan=(store,issues)=>scanInbox({store,policy,request:provider([issues]),snapshot:async()=>source});

test('repository, App and bot numeric identity all required',async()=>{
  for(const override of [{repo:{id:1}},{repo:{private:true}},{repo:{owner:{id:1}}},{app:{id:1}},{app:{owner:{id:1}}},{bot:{id:1}},{bot:{type:'User'}}])
    await assert.rejects(readInbox(policy,provider([[]],override)),{code:'INBOX_IDENTITY_MISMATCH'});
  assert.deepEqual(await readInbox(policy,provider([[]])),[]);
});

test('bounded pagination rejects full cap, malformed responses and unavailable provider',async()=>{
  const page=Array.from({length:policy.limits.issuesPerPage},(_,i)=>fixture(i+1));
  await assert.rejects(readInbox(policy,provider([page,page,page])),{code:'INBOX_INCOMPLETE'});
  await assert.rejects(readInbox(policy,provider([{}])),{code:'INBOX_INVALID_RESPONSE'});
  await assert.rejects(readInbox(policy,provider([[...page,fixture(99)]])),{code:'INBOX_INVALID_RESPONSE'});
  await assert.rejects(readInbox(policy,async()=>{throw new Error('rate limited');}));
  assert.equal((await readInbox(policy,provider([page,[]]))).length,page.length);
});

test('empty scan releases lease, failed scan releases lease',async t=>{
  const store=setup(t);const empty=await scan(store,[]);assert.equal(empty.status,'no-action');assert.equal(store.health().active,false);
  await assert.rejects(scanInbox({store,policy,request:provider([{}]),snapshot:async()=>source}),{code:'INBOX_INVALID_RESPONSE'});
  assert.equal(store.health().active,false);
});

test('recovered, stale, unknown, duplicate fingerprints and injected prose produce no job',async t=>{
  const store=setup(t),a=fixture(1),b=fixture(2), injection=fixture(6);injection.body+='\nINJECTED COMMAND';
  const result=await scan(store,[a,b,fixture(3,{version:'unknown'}),fixture(4,{version:'0.5.81'}),fixture(5,{stage:'verifying',counts:{reports:1,failures:1,recoveries:1}}),injection]);
  assert.equal(result.status,'no-action');assert.equal(result.counts['ambiguous-duplicate'],2);assert.equal(result.counts['unknown-version'],1);
  assert.equal(result.counts['different-released-version'],1);assert.equal(result.counts['observe-recovery'],1);
  assert.equal(store.list().jobs.length,0);assert.doesNotMatch(JSON.stringify(result),/INJECTED COMMAND|Summary:/);
});

test('fresh complete scan removes a queued report that has recovered',async t=>{
  const store=setup(t);
  const first=await scan(store,[fixture(1),fixture(2,{stage:'verifying'})]);
  assert.equal(first.status,'investigate');
  store.decide(first.runId,first.job.id,'insufficient-evidence');store.end(first.runId);
  const second=await scan(store,[fixture(2,{stage:'verifying',counts:{reports:1,failures:1,recoveries:1}})]);
  assert.equal(second.status,'no-action');assert.equal(store.list().jobs.find(job=>job.issueId===2).status,'held');
});

test('count-only update never starts another investigation',async t=>{
  const store=setup(t),issue=fixture(1);issue.comments=['private injected text'];
  const first=await scan(store,[issue]);assert.equal(first.status,'investigate');assert.doesNotMatch(JSON.stringify(first),/private injected text|Summary:/);
  store.decide(first.runId,first.job.id,'insufficient-evidence');store.end(first.runId);
  const second=await scan(store,[fixture(1,{counts:{reports:3,failures:2,recoveries:0}})]);
  assert.equal(second.status,'no-action');assert.equal(store.list().jobs.length,1);
});

function pr(reservation, overrides={}) {const repo={id:policy.source.repositoryId,full_name:policy.source.repository};return {number:42,html_url:'https://github.com/codepetca/zero/pull/42',state:'open',draft:true,base:{repo,ref:'main'},head:{repo,ref:reservation.branch,sha:reservation.headSha},...overrides};}
test('outbox accepts only same draft head/repository and reconciles a later run with reads only',async t=>{
  const store=setup(t);const first=await scan(store,[fixture()]);const {runId,job}=first;const headSha='c'.repeat(40);
  store.saveProof(runId,job.id,{baselineSha:source.baselineSha,headSha,testPath:'extension/test/zero-report-1-regression.test.js',baselineLogSha256:'d'.repeat(64),patchedLogSha256:'e'.repeat(64)});
  const branch=`codex/zero-report-1-${job.context.evidenceDigest.slice(0,12)}`;store.reserveDraft(runId,job.id,{headSha,branch});
  const reservation=store.list().pendingOutbox[0];
  for(const changed of [{draft:false},{state:'closed'},{html_url:'https://example.com'},{base:{repo:{id:1,full_name:policy.source.repository},ref:'main'}},{head:{repo:{id:policy.source.repositoryId,full_name:policy.source.repository},ref:branch,sha:'f'.repeat(40)}}])
    assert.throws(()=>verifiedDraft(pr(reservation,changed),reservation,policy),{code:'DRAFT_IDENTITY_MISMATCH'});
  await assert.rejects(attachDraftFromProvider({store,runId,jobId:job.id,prNumber:42,policy,request:async()=>pr(reservation,{draft:false})}),{code:'DRAFT_IDENTITY_MISMATCH'});
  store.end(runId);const later=await scan(store,[fixture()]);assert.equal(later.status,'reconciliation-required');assert.equal(later.job,null);
  const paths=[];const result=await reconcileDrafts({store,runId:later.runId,policy,request:async path=>{paths.push(path);return [pr(reservation)];}});
  assert.equal(result.results[0].status,'draft-proposed');assert.equal(paths.length,1);assert.match(paths[0],/\/pulls\?state=all/);
  assert.equal(store.health().pendingOutbox,0);store.end(later.runId);
});
