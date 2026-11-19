import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {automaticFingerprint, reportEvidenceDigest} from './report-intake.mjs';
import {lstatSync, mkdirSync, openSync, closeSync, realpathSync} from 'node:fs';
import {resolve, join} from 'node:path';
import contract from '../extension/src/problem-report-contract.js';

const hex40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const fail = () => { throw new Error('Invalid triage state operation.'); };
const contextKeys = ['issueId','issueNumber','url','fingerprint','code','operation','stage','source','occurredAt','environment','breadcrumbs','counts','evidenceDigest'];

function validContext(context) {
  if (!keys(context, contextKeys) || !positive(context.issueId) || !positive(context.issueNumber) ||
      context.url !== `https://github.com/codepetca/zero-reports/issues/${context.issueNumber}` ||
      !hex64(context.fingerprint) || !hex64(context.evidenceDigest) || context.source !== 'automatic' ||
      !keys(context.counts, ['reports','failures','recoveries'])) return false;
  const {reports, failures, recoveries} = context.counts;
  if (![reports, failures, recoveries].every(Number.isSafeInteger) || reports < 1 || failures < 0 ||
      recoveries < 0 || recoveries > failures || failures > reports) return false;
  const report = contract.validateProblemReport({schemaVersion:2, reportId:'00000000-0000-4000-8000-000000000000',
    occurredAt:context.occurredAt, source:context.source, operation:context.operation, stage:context.stage,
    code:context.code, outcome:'failed', environment:context.environment, breadcrumbs:context.breadcrumbs});
  if (!report || automaticFingerprint(report) !== context.fingerprint) return false;
  const digest = reportEvidenceDigest(report,context.fingerprint);
  return digest === context.evidenceDigest;
}

function privateDirectory(directory) {
  if (typeof directory !== 'string' || !directory) fail();
  const path = resolve(directory);
  try { mkdirSync(path, {mode:0o700}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
      (process.getuid && stat.uid !== process.getuid()) || realpathSync(path) !== path) fail();
  const file = join(path, 'triage.sqlite');
  try { const fd = openSync(file, 'wx', 0o600); closeSync(fd); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const dbStat = lstatSync(file);
  if (!dbStat.isFile() || dbStat.isSymbolicLink() || dbStat.nlink !== 1 || (dbStat.mode & 0o077) ||
      (process.getuid && dbStat.uid !== process.getuid())) fail();
  return file;
}

export function openTriageState(directory, {policyDigest, now = Date.now, leaseMs = 1500000,
  runBudgetMs = Math.min(1200000,leaseMs), dailyInvestigations = 3, dailyDrafts = 1} = {}) {
  if (!hex64(policyDigest) || typeof now !== 'function' || !positive(leaseMs) || leaseMs > 1500000 ||
      !positive(runBudgetMs) || runBudgetMs>leaseMs || runBudgetMs>1200000 ||
      !positive(dailyInvestigations) || dailyInvestigations > 3 || !positive(dailyDrafts) || dailyDrafts > 1) fail();
  const db = new DatabaseSync(privateDirectory(directory));
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS control (id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL DEFAULT 0,
      run_id TEXT, expires INTEGER, policy TEXT, deadline INTEGER);
    INSERT OR IGNORE INTO control(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, issue_id INTEGER NOT NULL, digest TEXT NOT NULL,
      source_tree TEXT NOT NULL, baseline TEXT NOT NULL, context TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      run_id TEXT, attempted_at INTEGER, outcome TEXT, proof TEXT,
      UNIQUE(issue_id,digest,source_tree));
    CREATE TABLE IF NOT EXISTS drafts (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL UNIQUE, run_id TEXT NOT NULL,
      head TEXT NOT NULL, branch TEXT NOT NULL, status TEXT NOT NULL, attempted_at INTEGER NOT NULL, number INTEGER, url TEXT);
  `);
  // A pre-rollout ledger may exist from an operator dry run. Old live leases
  // have no action deadline and remain unusable until a new fenced run starts.
  if (!db.prepare('PRAGMA table_info(control)').all().some(row=>row.name==='deadline')) db.exec('ALTER TABLE control ADD COLUMN deadline INTEGER');
  const stmt = sql => db.prepare(sql);
  const tx = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const answer = fn(); db.exec('COMMIT'); return answer; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const timestamp = () => { const value = now(); if (!Number.isSafeInteger(value) || value < 0) fail(); return value; };
  const fence = (runId, time) => {
    const row = stmt('SELECT * FROM control WHERE id=1').get();
    if (row.paused || typeof runId !== 'string' || row.run_id !== runId || row.policy !== policyDigest ||
        row.expires <= time || !Number.isSafeInteger(row.deadline) || row.deadline <= time) fail();
  };
  const jobForRun = (runId, id) => {
    if (!positive(id)) fail();
    const job = stmt('SELECT * FROM jobs WHERE id=? AND run_id=?').get(id, runId);
    if (!job) fail();
    return job;
  };
  const dayStart = time => { const date = new Date(time); if (!Number.isFinite(date.getTime())) fail(); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()); };
  const publicJob = job => ({id:job.id, context:JSON.parse(job.context), baselineSha:job.baseline, sourceTree:job.source_tree, status:job.status});
  return {
    begin() { return tx(() => {
      const time = timestamp();
      const control = stmt('SELECT * FROM control WHERE id=1').get();
      if (control.paused) return {status:'paused'};
      if (control.run_id && control.expires > time) return {status:'busy'};
      stmt("UPDATE jobs SET status='held', outcome='interrupted' WHERE status IN ('investigating','confirmed-defect')").run();
      const runId = randomUUID(), expiresAt = time + leaseMs;
      if (!Number.isSafeInteger(expiresAt)) fail();
      stmt('UPDATE control SET run_id=?, expires=?, policy=?, deadline=? WHERE id=1').run(runId, expiresAt, policyDigest,time+runBudgetMs);
      return {status:'acquired', runId, expiresAt, actionDeadline:time+runBudgetMs};
    }); },
    enqueue(runId, contexts, {baselineSha, sourceTree} = {}) { return tx(() => {
      fence(runId, timestamp());
      if (!hex40(baselineSha) || !hex40(sourceTree) || !Array.isArray(contexts) || contexts.length > 5000 || !contexts.every(validContext)) fail();
      // Only a complete, freshly verified inbox may keep an unattempted job
      // eligible. Closed, recovered, stale and excluded reports disappear here.
      stmt("UPDATE jobs SET status='held',outcome='not-current-evidence' WHERE status='queued'").run();
      for (const context of contexts) {
        // A source-tree change cannot commission another proposal for an issue
        // that already has a reservation, attached draft or owner retirement.
        if (stmt('SELECT count(*) AS n FROM drafts d JOIN jobs j ON d.job_id=j.id WHERE j.issue_id=?').get(context.issueId).n) continue;
        const existing = stmt('SELECT * FROM jobs WHERE issue_id=? AND digest=? AND source_tree=?').get(context.issueId, context.evidenceDigest, sourceTree);
        if (existing) {
          stmt('UPDATE jobs SET context=? WHERE id=?').run(JSON.stringify(context), existing.id);
          if (existing.attempted_at === null) stmt("UPDATE jobs SET status='queued',outcome=NULL,baseline=? WHERE id=?").run(baselineSha,existing.id);
        } else {
          if (stmt('SELECT count(*) AS n FROM jobs').get().n >= 5000) fail();
          stmt('INSERT INTO jobs(issue_id,digest,source_tree,baseline,context) VALUES(?,?,?,?,?)').run(context.issueId, context.evidenceDigest, sourceTree, baselineSha, JSON.stringify(context));
        }
      }
      return {status:'ok'};
    }); },
    claim(runId) { return tx(() => {
      const time = timestamp(); fence(runId, time);
      if (stmt("SELECT count(*) AS n FROM drafts WHERE status='publishing'").get().n) return null;
      const active = stmt("SELECT * FROM jobs WHERE run_id=? AND status IN ('investigating','confirmed-defect') ORDER BY id LIMIT 1").get(runId);
      if (active) return publicJob(active);
      const start = dayStart(time);
      if (stmt('SELECT count(*) AS n FROM jobs WHERE attempted_at>=? AND attempted_at<?').get(start, start+86400000).n >= dailyInvestigations) return null;
      const job = stmt("SELECT * FROM jobs WHERE status='queued' AND attempted_at IS NULL ORDER BY id LIMIT 1").get();
      if (!job) return null;
      stmt("UPDATE jobs SET status='investigating', run_id=?, attempted_at=? WHERE id=?").run(runId,time,job.id);
      return publicJob({...job, status:'investigating'});
    }); },
    getJob(runId, id) { const time = timestamp(); fence(runId,time); return publicJob(jobForRun(runId,id)); },
    check(runId) { return tx(() => {const time=timestamp();fence(runId,time);const row=stmt('SELECT deadline FROM control WHERE id=1').get();return {status:'active',actionDeadline:row.deadline,remainingMilliseconds:row.deadline-time};}); },
    decide(runId, id, outcome) { return tx(() => {
      fence(runId,timestamp()); const job = jobForRun(runId,id);
      if (job.status !== 'investigating' || !['expected-behavior','insufficient-evidence','external-environment','confirmed-defect','product-suggestion','needs-owner'].includes(outcome)) fail();
      stmt('UPDATE jobs SET status=?,outcome=? WHERE id=?').run(outcome,outcome,id);
      return {status:outcome};
    }); },
    saveProof(runId, id, proof) { return tx(() => {
      fence(runId,timestamp()); const job = jobForRun(runId,id);
      if (!['investigating','confirmed-defect'].includes(job.status) ||
          !keys(proof,['baselineSha','headSha','testPath','baselineLogSha256','patchedLogSha256']) ||
          proof.baselineSha !== job.baseline || !hex40(proof.headSha) || !hex64(proof.baselineLogSha256) || !hex64(proof.patchedLogSha256) ||
          typeof proof.testPath !== 'string' || proof.testPath.length > 240 || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(proof.testPath) ||
          proof.testPath.split('/').some(part => part === '.' || part === '..')) fail();
      stmt("UPDATE jobs SET status='confirmed-defect', outcome='confirmed-defect', proof=? WHERE id=?").run(JSON.stringify(proof),id);
      return {status:'confirmed-defect'};
    }); },
    reserveDraft(runId, id, {headSha, branch} = {}) { return tx(() => {
      const time = timestamp(); fence(runId,time); const job = jobForRun(runId,id);
      const existing = stmt('SELECT * FROM drafts WHERE job_id=?').get(id);
      if (existing) return {status:'reconciliation-required'};
      const proof = job.proof && JSON.parse(job.proof), context = JSON.parse(job.context);
      if (stmt('SELECT count(*) AS n FROM drafts d JOIN jobs j ON d.job_id=j.id WHERE j.issue_id=? OR d.branch=?').get(context.issueId,branch).n) return {status:'proposal-exists'};
      if (job.status !== 'confirmed-defect' || !proof || proof.baselineSha !== job.baseline || proof.headSha !== headSha ||
          branch !== `codex/zero-report-${context.issueNumber}-${context.evidenceDigest.slice(0,12)}`) fail();
      if (stmt("SELECT count(*) AS n FROM drafts WHERE status='publishing'").get().n) return {status:'reconciliation-required'};
      const start = dayStart(time);
      if (stmt('SELECT count(*) AS n FROM drafts WHERE attempted_at>=? AND attempted_at<?').get(start,start+86400000).n >= dailyDrafts) return {status:'daily-limit'};
      stmt("INSERT INTO drafts(job_id,run_id,head,branch,status,attempted_at) VALUES(?,?,?,?,'publishing',?)").run(id,runId,headSha,branch,time);
      stmt("UPDATE jobs SET status='publishing' WHERE id=?").run(id);
      return {status:'publishing'};
    }); },
    attachDraft(runId,id,{number,url,headSha,isDraft} = {}) { return tx(() => {
      fence(runId,timestamp());
      if (!positive(id)) fail();
      // A later fenced run may reconcile a prior ambiguous write by reading
      // GitHub. This binds the same reservation; it never grants another POST.
      const draft = stmt('SELECT * FROM drafts WHERE job_id=?').get(id);
      if (!draft || draft.status !== 'publishing' || !positive(number) || isDraft !== true || draft.head !== headSha ||
          url !== `https://github.com/codepetca/zero/pull/${number}`) fail();
      stmt("UPDATE drafts SET status='attached', number=?, url=? WHERE id=?").run(number,url,draft.id);
      stmt("UPDATE jobs SET status='draft-proposed',outcome='draft-proposed' WHERE id=?").run(id);
      return {status:'attached'};
    }); },
    abandonDraft(runId,id) { return tx(() => {
      fence(runId,timestamp());
      if (!positive(id)) fail();
      const draft=stmt("SELECT * FROM drafts WHERE job_id=? AND status='publishing'").get(id);
      if (!draft) fail();
      stmt("UPDATE drafts SET status='owner-abandoned' WHERE id=?").run(draft.id);
      stmt("UPDATE jobs SET status='needs-owner',outcome='owner-abandoned' WHERE id=?").run(id);
      return {status:'owner-abandoned'};
    }); },
    end(runId) { return tx(() => {
      fence(runId,timestamp());
      stmt("UPDATE jobs SET status='held', outcome='interrupted' WHERE run_id=? AND status IN ('investigating','confirmed-defect')").run(runId);
      stmt('UPDATE control SET run_id=NULL, expires=NULL, policy=NULL, deadline=NULL WHERE id=1').run();
      return {status:'ended'};
    }); },
    setPaused(value) { return tx(() => {
      if (typeof value !== 'boolean') fail();
      if (value) {
        stmt("UPDATE jobs SET status='held', outcome='interrupted' WHERE status IN ('investigating','confirmed-defect')").run();
        stmt('UPDATE control SET paused=1, run_id=NULL, expires=NULL, policy=NULL, deadline=NULL WHERE id=1').run();
      } else stmt('UPDATE control SET paused=0 WHERE id=1').run();
      return {status:value ? 'paused' : 'unpaused'};
    }); },
    list() {
      return {jobs:stmt('SELECT id,issue_id,status FROM jobs ORDER BY id').all().map(row => ({id:row.id, issueId:row.issue_id, status:row.status})),
        pendingOutbox:stmt("SELECT job_id,head,branch FROM drafts WHERE status='publishing' ORDER BY id").all().map(row => ({jobId:row.job_id, headSha:row.head, branch:row.branch})),
        proposals:stmt("SELECT job_id,number,url,head,branch FROM drafts WHERE status='attached' ORDER BY id").all().map(row => ({jobId:row.job_id,number:row.number,url:row.url,headSha:row.head,branch:row.branch}))};
    },
    health() {
      const control = stmt('SELECT paused,run_id,expires FROM control WHERE id=1').get();
      return {paused:Boolean(control.paused), active:Boolean(control.run_id && control.expires > timestamp()),
        jobs:stmt('SELECT status,count(*) AS count FROM jobs GROUP BY status ORDER BY status').all().map(row => ({status:row.status,count:row.count})),
        pendingOutbox:stmt("SELECT count(*) AS n FROM drafts WHERE status='publishing'").get().n};
    },
    close() { db.close(); }
  };
}
