// Trusted checking/publication stages. No HTTP handlers, sessions or OAuth.
import {randomUUID} from 'node:crypto';
import {POLICY,sha256,validateArtifacts} from './artifacts.mjs';
import {validReport} from './report.mjs';
import {transaction} from './database.mjs';
const BASE='/api/hub';
const GROUP='ca.codepet.zero.library';
export function createPipeline({pool,storage,checker}) {
  const runTransaction=action=>transaction(pool,action);
  async function workOnce() {
    const job = await runTransaction(async client => {
      await client.query("UPDATE hub_submissions SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease_token=NULL,lease_until=NULL,error='Checker interrupted; retry is bounded' WHERE status='checking' AND lease_until<now()");
      const {rows:[row]} = await client.query("SELECT * FROM hub_submissions WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
      if (!row) return null;
      row.lease_token = randomUUID();
      await client.query("UPDATE hub_submissions SET status='checking',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '10 minutes',error=NULL WHERE id=$1",[row.id,row.lease_token]);
      return row;
    });
    if (!job) return false;
    try {
      checker.validateBundle(job.bundle);
      if (checker.sourceDigest(job.bundle) !== job.source_digest) throw new Error('Immutable source digest mismatch');
      const result = await checker.checkSubmission(job.bundle);
      if (!validReport(result,job.source_digest,checker.expectedPolicyDigest())) throw new Error('Checker verdict does not match trusted policy/source');
      const artifacts = result.passed ? result.artifacts : null;
      const hashes = result.passed ? validateArtifacts(job.bundle,artifacts,checker.expectedPom) : null;
      const report = {passed:result.passed,policy:POLICY,policyDigest:result.policyDigest,sourceDigest:job.source_digest,checks:result.checks,platforms:result.platforms};
      await runTransaction(async client => {
        const {rows:[current]} = await client.query('SELECT status,lease_token,source_digest FROM hub_submissions WHERE id=$1 FOR UPDATE',[job.id]);
        if (current?.status !== 'checking' || current.lease_token !== job.lease_token || current.source_digest !== job.source_digest) return;
        await client.query('INSERT INTO hub_results(submission_id,source_digest,policy,passed,report,jar,sources,pom,artifact_hashes,policy_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[job.id,job.source_digest,POLICY,result.passed,report,artifacts?.jar,artifacts?.sources,artifacts?.pom,hashes,result.policyDigest]);
        await client.query("UPDATE hub_submissions SET status=$2,lease_token=NULL,lease_until=NULL WHERE id=$1",[job.id,result.passed?'checked':'failed']);
      });
    } catch {
      await pool.query("UPDATE hub_submissions SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease_token=NULL,lease_until=NULL,error='The trusted checker could not complete; bounded infrastructure retry' WHERE id=$1 AND status='checking' AND lease_token=$2",[job.id,job.lease_token]);
    }
    return true;
  }
  async function publishOnce() {
    return runTransaction(async client => {
      const {rows:[row]} = await client.query("SELECT s.*,l.owner_id AS reserved_owner,r.source_digest AS result_digest,r.policy,r.policy_digest,r.passed,r.report,r.jar,r.sources,r.pom,r.artifact_hashes FROM hub_submissions s JOIN hub_libraries l ON l.id=s.library_id JOIN hub_results r ON r.submission_id=s.id WHERE s.status='checked' ORDER BY s.created_at FOR UPDATE OF s SKIP LOCKED LIMIT 1");
      if (!row) return false;
      let manifest;
      let artifacts;
      try {
        checker.validateBundle(row.bundle);
        if (row.owner_id !== row.reserved_owner || row.library_id !== row.bundle.descriptor.libraryId || row.version !== row.bundle.descriptor.version || checker.sourceDigest(row.bundle) !== row.source_digest || row.result_digest !== row.source_digest || row.policy !== POLICY || !row.passed || row.policy_digest !== row.report.policyDigest || !validReport(row.report,row.source_digest,checker.expectedPolicyDigest()) || !row.report.passed) throw new Error('Internal verdict authority mismatch');
        artifacts = {jar:row.jar,sources:row.sources,pom:row.pom};
        const hashes = validateArtifacts(row.bundle,artifacts,checker.expectedPom);
        for (const [kind,hash] of Object.entries(hashes)) {
          if (hash.sha256 !== row.artifact_hashes?.[kind]?.sha256 || hash.size !== row.artifact_hashes?.[kind]?.size)
            throw new Error('Artifact digest drift');
        }
        const {libraryId,version,title,description,category,components} = row.bundle.descriptor;
        const directory = `${BASE}/maven/ca/codepet/zero/library/${libraryId}/${version}`;
        manifest = {libraryId,version,title,description,category,components,namespace:`zero.${libraryId}`,coordinate:{groupId:GROUP,artifactId:libraryId,version},sourceDigest:row.source_digest,checks:row.report.checks,platforms:row.report.platforms,artifacts:Object.fromEntries(Object.entries(hashes).map(([kind,hash])=>[kind,{...hash,path:`${directory}/${libraryId}-${version}${kind==='sources'?'-sources.jar':kind==='jar'?'.jar':'.pom'}`} ])),preview:{sha256:sha256(Buffer.from(row.bundle.files['preview.png'],'base64')),size:Buffer.from(row.bundle.files['preview.png'],'base64').length,path:`${BASE}/previews/${libraryId}/${version}.png`},api:row.bundle.files['API.md'],changelog:row.bundle.files['CHANGELOG.md'],status:'automatically-checked'};
      } catch {
        await client.query("UPDATE hub_submissions SET status='failed',error='Publication integrity validation failed' WHERE id=$1",[row.id]);
        return true;
      }
      // Only immutable bytes cross into storage; this stage never runs Java/config.
      const bytes = await storage();
      for (const artifact of Object.values(artifacts)) await bytes.put(artifact);
      await bytes.put(Buffer.from(row.bundle.files['preview.png'],'base64'));
      await client.query('INSERT INTO hub_releases(library_id,version,submission_id,manifest) VALUES($1,$2,$3,$4)',[row.library_id,row.version,row.id,manifest]);
      await client.query("UPDATE hub_submissions SET status='published',error=NULL WHERE id=$1",[row.id]);
      return true;
    });
  }
  return {workOnce,publishOnce};
}
