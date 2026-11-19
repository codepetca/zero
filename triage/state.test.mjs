import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, chmodSync, symlinkSync, writeFileSync, realpathSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openTriageState} from './state.mjs';
import {normalizeReportIssue, automaticFingerprint} from './report-intake.mjs';
import {problemIssueBody} from '../website/lib/problem-reports-github.mjs';
import contract from '../extension/src/problem-report-contract.js';

const identity = {repository:'codepetca/zero-reports',repositoryId:1463652567,appId:5827621,appSlug:'codepet-zero-reports',botLogin:'codepet-zero-reports[bot]',botUserId:358573807};
const base = 'a'.repeat(40), tree = 'b'.repeat(40), head = 'c'.repeat(40), policyDigest = 'd'.repeat(64);
function context(number = 1, counts = {reports:1,failures:1,recoveries:0}) {
  const sample = {schemaVersion:2,reportId:'00000000-0000-4000-8000-000000000000',occurredAt:'2026-11-19T12:00:00.000Z',source:'automatic',operation:'publish',stage:'deploying',code:'WEB_PUBLISH_DEPLOYMENT_FAILED',outcome:'failed',
    environment:{zeroVersion:'0.5.82',editorVersion:'1.100.0',os:'macos',osVersion:'15.1',architecture:'arm64',distribution:'macos-app',javaVersion:'unknown',frameworkVersion:'0.3.0',browserBuilderVersion:'unknown'},breadcrumbs:[]};
  const api = 'https://api.github.com/repos/codepetca/zero-reports';
  return normalizeReportIssue({id:number,number,state:'open',labels:[],user:{id:identity.botUserId,login:identity.botLogin,type:'Bot'},
    url:`${api}/issues/${number}`,repository_url:api,html_url:`https://github.com/codepetca/zero-reports/issues/${number}`,
    title:`[Zero] ${sample.code}: ${contract.REPORT_CODES[sample.code]}`,
    body:problemIssueBody({sample,fingerprint:automaticFingerprint(sample),...counts})},identity).context;
}
function setup(t, options = {}) {
  const parent = realpathSync(mkdtempSync(join(realpathSync(tmpdir()),'zero-state-')));
  t.after(() => rmSync(parent,{recursive:true,force:true}));
  let clock = Date.parse('2026-11-19T12:00:00.000Z');
  const directory = join(parent,'ledger');
  const open = () => openTriageState(directory,{policyDigest,now:()=>clock,...options});
  return {parent,directory,open,advance:ms=>{clock+=ms;}};
}
const enqueue = (state,runId,items) => state.enqueue(runId,items,{baselineSha:base,sourceTree:tree});
const proof = () => ({baselineSha:base,headSha:head,testPath:'extension/test/example.test.js',baselineLogSha256:'e'.repeat(64),patchedLogSha256:'f'.repeat(64)});
const branch = c => `codex/zero-report-${c.issueNumber}-${c.evidenceDigest.slice(0,12)}`;

test('private permissions and cross-connection lease with stale-run fencing', t => {
  const f=setup(t,{leaseMs:1000}), a=f.open(), b=f.open(); t.after(()=>{a.close();b.close();});
  assert.equal(statSync(f.directory).mode & 0o777,0o700);
  assert.equal(statSync(join(f.directory,'triage.sqlite')).mode & 0o777,0o600);
  const first=a.begin(); assert.equal(first.status,'acquired');
  assert.deepEqual(b.begin(),{status:'busy'});
  enqueue(a,first.runId,[context()]); const job=a.claim(first.runId);
  f.advance(1000); const second=b.begin(); assert.equal(second.status,'acquired');
  assert.throws(()=>a.decide(first.runId,job.id,'expected-behavior'));
  assert.deepEqual(b.list().jobs.map(j=>j.status),['held']);
  assert.equal(b.claim(second.runId),null);
});

test('duplicate snapshot updates counts but never restores a consumed attempt', t => {
  const f=setup(t), s=f.open(); t.after(()=>s.close()); const run=s.begin().runId;
  enqueue(s,run,[context()]); const job=s.claim(run);
  s.decide(run,job.id,'insufficient-evidence');
  enqueue(s,run,[context(1,{reports:4,failures:3,recoveries:2})]);
  assert.equal(s.getJob(run,job.id).context.counts.reports,4);
  assert.equal(s.claim(run),null); assert.equal(s.list().jobs.length,1);
});

test('three investigations per UTC day and one attempt per snapshot', t => {
  const f=setup(t), s=f.open(); t.after(()=>s.close()); let run=s.begin().runId;
  enqueue(s,run,[context(1),context(2),context(3),context(4)]);
  for (let n=0;n<3;n++) { const job=s.claim(run); assert.ok(job); s.decide(run,job.id,'expected-behavior'); }
  assert.equal(s.claim(run),null); s.end(run); f.advance(86400000); run=s.begin().runId;
  const final=s.claim(run); assert.ok(final); assert.equal(s.claim(run).id,final.id);
  s.decide(run,final.id,'expected-behavior'); assert.equal(s.claim(run),null);
});

test('draft outbox is durable, head and canonical branch are bound, and daily cap counts attempts', t => {
  const f=setup(t), s=f.open(); t.after(()=>s.close()); const run=s.begin().runId;
  const c=context(), other=context(2); enqueue(s,run,[c,other]); const job=s.claim(run);
  assert.throws(()=>s.saveProof(run,job.id,{...proof(),baselineSha:'9'.repeat(40)}));
  assert.throws(()=>s.saveProof(run,job.id,{...proof(),testPath:'../private'}));
  s.saveProof(run,job.id,proof());
  assert.throws(()=>s.reserveDraft(run,job.id,{headSha:'9'.repeat(40),branch:branch(c)}));
  assert.throws(()=>s.reserveDraft(run,job.id,{headSha:head,branch:'codex/arbitrary'}));
  assert.deepEqual(s.reserveDraft(run,job.id,{headSha:head,branch:branch(c)}),{status:'publishing'});
  assert.equal(s.reserveDraft(run,job.id,{headSha:head,branch:branch(c)}).status,'reconciliation-required');
  assert.throws(()=>s.attachDraft(run,job.id,{number:10,url:'https://evil.example/10',headSha:head,isDraft:true}));
  assert.throws(()=>s.attachDraft(run,job.id,{number:10,url:'https://github.com/codepetca/zero/pull/10',headSha:head,isDraft:false}));
  assert.throws(()=>s.attachDraft(run,job.id,{number:10,url:'https://github.com/codepetca/zero/pull/10',headSha:'9'.repeat(40),isDraft:true}));
  assert.equal(s.attachDraft(run,job.id,{number:10,url:'https://github.com/codepetca/zero/pull/10',headSha:head,isDraft:true}).status,'attached');
  const next=s.claim(run); s.saveProof(run,next.id,proof());
  assert.equal(s.reserveDraft(run,next.id,{headSha:head,branch:branch(other)}).status,'daily-limit');
});

test('uncertain publication survives run exit and blocks another reservation', t => {
  const f=setup(t), a=f.open(); const run=a.begin().runId, c=context();
  enqueue(a,run,[c,context(2)]); const job=a.claim(run); a.saveProof(run,job.id,proof());
  a.reserveDraft(run,job.id,{headSha:head,branch:branch(c)}); a.end(run); a.close();
  const b=f.open(); t.after(()=>b.close()); const nextRun=b.begin().runId;
  assert.equal(b.health().pendingOutbox,1); assert.equal(b.list().pendingOutbox[0].branch,branch(c));
  assert.equal(b.claim(nextRun),null);
  assert.equal(b.attachDraft(nextRun,job.id,{number:10,url:'https://github.com/codepetca/zero/pull/10',headSha:head,isDraft:true}).status,'attached');
  assert.equal(b.health().pendingOutbox,0);
  const next=b.claim(nextRun); b.saveProof(nextRun,next.id,proof());
  assert.equal(b.reserveDraft(nextRun,next.id,{headSha:head,branch:branch(context(2))}).status,'daily-limit');
});

test('pause invalidates current lease and prevents future mutation until new run', t => {
  const f=setup(t), s=f.open(); t.after(()=>s.close()); const run=s.begin().runId;
  enqueue(s,run,[context()]); s.claim(run); s.setPaused(true);
  assert.deepEqual(s.begin(),{status:'paused'}); assert.throws(()=>s.claim(run));
  s.setPaused(false); assert.throws(()=>s.claim(run));
  assert.equal(s.begin().status,'acquired'); assert.equal(s.list().jobs[0].status,'held');
});

test('unsafe and symlinked paths are rejected', t => {
  const f=setup(t), loose=join(f.parent,'loose'); mkdirSync(loose,{mode:0o700}); chmodSync(loose,0o755);
  assert.throws(()=>openTriageState(loose,{policyDigest}));
  const real=join(f.parent,'real'); mkdirSync(real,{mode:0o700});
  const link=join(f.parent,'link'); symlinkSync(real,link); assert.throws(()=>openTriageState(link,{policyDigest}));
  const file=join(real,'triage.sqlite'); writeFileSync(file,'x',{mode:0o644}); chmodSync(file,0o644);
  assert.throws(()=>openTriageState(real,{policyDigest}));
  rmSync(file); symlinkSync(join(f.parent,'target'),file); assert.throws(()=>openTriageState(real,{policyDigest}));
});

test('rejects forged context, invalid fields and policy mismatch without writing', t => {
  const f=setup(t), s=f.open(); t.after(()=>s.close()); const run=s.begin().runId;
  assert.throws(()=>enqueue(s,run,[{...context(),code:'ZERO_INTERNAL_TYPE_ERROR'}]));
  assert.throws(()=>s.enqueue(run,[context()],{baselineSha:'nope',sourceTree:tree}));
  assert.equal(s.list().jobs.length,0);
  const other=openTriageState(f.directory,{policyDigest:'9'.repeat(64)}); t.after(()=>other.close());
  assert.throws(()=>other.claim(run));
});

test('action budget expires before the recovery lease and stale writers remain fenced', t => {
  const f=setup(t,{leaseMs:1500,runBudgetMs:1000}), s=f.open(); t.after(()=>s.close());
  const run=s.begin();enqueue(s,run.runId,[context()]);s.claim(run.runId);
  f.advance(1000);assert.throws(()=>s.check(run.runId));assert.throws(()=>s.decide(run.runId,1,'expected-behavior'));
  assert.equal(s.begin().status,'busy');f.advance(500);assert.equal(s.begin().status,'acquired');
  assert.equal(s.list().jobs[0].status,'held');
});

test('explicit owner retirement preserves draft budget and cannot retry the same job', t => {
  const f=setup(t),s=f.open();t.after(()=>s.close());const run=s.begin().runId,c=context();
  enqueue(s,run,[c,context(2)]);const job=s.claim(run);s.saveProof(run,job.id,proof());
  s.reserveDraft(run,job.id,{headSha:head,branch:branch(c)});
  assert.equal(s.abandonDraft(run,job.id).status,'owner-abandoned');assert.equal(s.health().pendingOutbox,0);
  assert.equal(s.reserveDraft(run,job.id,{headSha:head,branch:branch(c)}).status,'reconciliation-required');
  const next=s.claim(run);s.saveProof(run,next.id,proof());
  assert.equal(s.reserveDraft(run,next.id,{headSha:head,branch:branch(context(2))}).status,'daily-limit');
});
