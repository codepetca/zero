import {Pool} from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import contract from '../../extension/src/problem-report-contract.js';

export function problemFingerprint(report) {
  const environment = Object.fromEntries(Object.keys(report.environment).sort().map(key => [key, report.environment[key]]));
  return createHash('sha256').update(JSON.stringify({schemaVersion:report.schemaVersion, source:report.source,
    operation:report.operation, stage:report.stage, code:report.code, environment,
    ...(report.source === 'manual' ? {manualReport:report.reportId} : {})})).digest('hex');
}

const busy = () => Object.assign(new Error('Report budget unavailable.'), {code:'REPORT_RATE_LIMIT'});

/** One dedicated connection per request. Abort destroys it, rolling back any open transaction. */
export function createProblemReportsStore(pool, destination) {
  if (!Number.isSafeInteger(destination?.repositoryId) || destination.repositoryId < 1 || typeof destination.repository !== 'string') {
    throw new Error('A fixed report destination is required.');
  }
  return {
    async open(deadline, {initializeDestination = true} = {}) {
      let client;
      let released = false;
      const release = (destroy = false) => { if (client && !released) { released = true; client.release(destroy); } };
      const pending = pool.connect().then(value => {
        client = value;
        if (deadline.signal.aborted) release(true);
        return value;
      });
      // A late checkout, including an abort between resolution and run's final
      // check, must release exactly once rather than leak or double-release.
      try { await deadline.run(() => pending); }
      catch (error) { pending.then(() => release(true), () => {}); throw error; }
      const cancel = () => release(true);
      deadline.signal.addEventListener('abort', cancel, {once:true});
      const query = (text, values = []) => deadline.run(() => {
        deadline.check();
        return client.query({text, values, query_timeout:4000});
      });
      try {
        if (initializeDestination) {
          await query(`INSERT INTO zero_problem_destination(singleton,repository_id,repository) VALUES(true,$1,$2)
            ON CONFLICT DO NOTHING`, [destination.repositoryId,destination.repository]);
        }
        const pinned = (await query('SELECT repository_id,repository FROM zero_problem_destination WHERE singleton=true')).rows[0];
        if ((pinned || initializeDestination) &&
            (String(pinned?.repository_id) !== String(destination.repositoryId) || pinned?.repository !== destination.repository)) {
          throw new Error('Report destination differs from its private database.');
        }
      } catch (error) {
        deadline.signal.removeEventListener('abort', cancel);
        release(true);
        throw error;
      }
      return {
        async accept(report) {
          if (!initializeDestination) throw new Error('Report acceptance requires a verified destination.');
          report = contract.validateProblemReport(report);
          if (!report) throw Object.assign(new Error('Invalid structured report.'), {code:'REPORT_CONFLICT'});
          const fingerprint = problemFingerprint(report);
          await query('BEGIN');
          try {
            // Serialize the tiny admission transaction, across every service instance.
            await query("SELECT pg_advisory_xact_lock(hashtextextended('zero-problem-admission', 0))");
            await query('DELETE FROM zero_problem_budgets WHERE expires_at < now()');
            const budgets = await query(`INSERT INTO zero_problem_budgets(bucket,count,expires_at)
              VALUES ('minute:' || floor(extract(epoch FROM now())/60)::text,1,now()+interval '2 minutes'),
                ('day:' || floor(extract(epoch FROM now())/86400)::text,1,now()+interval '2 days')
              ON CONFLICT(bucket) DO UPDATE SET count=zero_problem_budgets.count+1 RETURNING bucket,count`);
            if (budgets.rows.some(row => row.count > (row.bucket.startsWith('minute:') ? 300 : 10000))) throw busy();
            const newGroup = await query('INSERT INTO zero_problem_groups(fingerprint) VALUES($1) ON CONFLICT DO NOTHING RETURNING fingerprint', [fingerprint]);
            if (newGroup.rows.length) {
              // Separate issue-creation budget limits malicious random fingerprints.
              const groups = await query(`INSERT INTO zero_problem_budgets(bucket,count,expires_at)
                VALUES ('groups:' || floor(extract(epoch FROM now())/86400)::text,1,now()+interval '2 days')
                ON CONFLICT(bucket) DO UPDATE SET count=zero_problem_budgets.count+1 RETURNING count`);
              if (groups.rows[0].count > 100) throw busy();
            }
            const previous = (await query('SELECT fingerprint,failed,recovered FROM zero_problem_reports WHERE report_id=$1', [report.reportId])).rows[0];
            // Recovery is a transition of an accepted failed occurrence, never
            // a new occurrence or a claim about a different technical group.
            if (report.outcome === 'recovered' && (!previous?.failed || previous.fingerprint !== fingerprint)) {
              throw Object.assign(new Error('Recovery requires an accepted failure.'), {code:'REPORT_CONFLICT'});
            }
            const saved = await query(`INSERT INTO zero_problem_reports(report_id,receipt,fingerprint,payload,failed,recovered)
              VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(report_id) DO UPDATE SET
              failed=zero_problem_reports.failed OR EXCLUDED.failed,
              recovered=zero_problem_reports.recovered OR EXCLUDED.recovered, updated_at=now()
              WHERE zero_problem_reports.fingerprint=EXCLUDED.fingerprint RETURNING receipt`,
            [report.reportId, randomUUID(), fingerprint, report, report.outcome === 'failed', report.outcome === 'recovered']);
            if (!saved.rows.length) throw Object.assign(new Error('Conflicting report.'), {code:'REPORT_CONFLICT'});
            if (!previous || (report.outcome === 'failed' && !previous.failed) || (report.outcome === 'recovered' && !previous.recovered)) {
              await query('UPDATE zero_problem_groups SET revision=revision+1 WHERE fingerprint=$1', [fingerprint]);
            }
            await query('COMMIT');
            return {receipt:saved.rows[0].receipt, fingerprint};
          } catch (error) {
            if (!deadline.signal.aborted) await query('ROLLBACK');
            throw error;
          }
        },
        async lock(fingerprint) {
          if (!initializeDestination) throw new Error('Report delivery requires a verified destination.');
          // Do not queue requests behind GitHub: the accepted report is already durable.
          const result = await query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', ['zero-report:'+fingerprint]);
          const locked = result.rows[0].locked === true;
          if (locked) await query('UPDATE zero_problem_groups SET last_attempt_at=now() WHERE fingerprint=$1', [fingerprint]);
          return locked;
        },
        async group(fingerprint) {
          const result = await query(`SELECT g.*, count(r.report_id)::integer AS reports,
            count(r.report_id) FILTER (WHERE r.failed)::integer AS failures,
            count(r.report_id) FILTER (WHERE r.recovered)::integer AS recoveries
            FROM zero_problem_groups g JOIN zero_problem_reports r USING(fingerprint)
            WHERE fingerprint=$1 GROUP BY g.fingerprint`, [fingerprint]);
          const sample = await query('SELECT payload FROM zero_problem_reports WHERE fingerprint=$1 ORDER BY created_at,report_id LIMIT 1', [fingerprint]);
          return {...result.rows[0], sample:sample.rows[0].payload};
        },
        async reserve(fingerprint) {
          // Autocommit MUST complete before issuing the non-idempotent GitHub POST.
          const result = await query(`UPDATE zero_problem_groups SET create_reserved_at=now()
            WHERE fingerprint=$1 AND create_reserved_at IS NULL AND issue_number IS NULL RETURNING fingerprint`, [fingerprint]);
          return result.rows.length === 1;
        },
        async bind(fingerprint, number) {
          await query(`UPDATE zero_problem_groups SET issue_number=$2
            WHERE fingerprint=$1 AND (issue_number IS NULL OR issue_number=$2)`, [fingerprint,number]);
        },
        async rejected(fingerprint) {
          await query('UPDATE zero_problem_groups SET create_reserved_at=NULL WHERE fingerprint=$1 AND issue_number IS NULL', [fingerprint]);
        },
        async delivered(fingerprint, revision) {
          await query('UPDATE zero_problem_groups SET delivered_revision=greatest(delivered_revision,$2) WHERE fingerprint=$1', [fingerprint, revision]);
        },
        async pending(limit = 20) {
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid report limit.');
          // Audit confirmed groups too: a provider that ignores cancellation
          // can apply an old PATCH after a newer response. Periodic reads repair
          // that state without trusting a local acknowledgement as permanent.
          const result = await query(`SELECT fingerprint FROM zero_problem_groups
            ORDER BY last_attempt_at NULLS FIRST,created_at LIMIT $1`, [limit]);
          return result.rows.map(row => row.fingerprint);
        },
        async health() {
          const result = await query(`SELECT
            count(*) FILTER (WHERE revision=delivered_revision)::integer AS delivered,
            count(*) FILTER (WHERE revision>delivered_revision)::integer AS pending,
            count(*) FILTER (WHERE issue_number IS NULL AND create_reserved_at IS NOT NULL)::integer AS "needsAttention"
            FROM zero_problem_groups`);
          return result.rows[0];
        },
        close() {
          deadline.signal.removeEventListener('abort', cancel);
          // Destroy instead of returning a session advisory lock to the pool.
          release(true);
        }
      };
    }
  };
}

const stores = new Map();
export function configuredProblemReportsStore(config) {
  const key = JSON.stringify([config.databaseUrl,config.repositoryId,config.repository]);
  if (!stores.has(key)) {
    const pool = new Pool({connectionString:config.databaseUrl, ssl:config.local ? false : {rejectUnauthorized:true},
      max:4, connectionTimeoutMillis:2000, idleTimeoutMillis:10000, allowExitOnIdle:true,
      statement_timeout:4000, query_timeout:4000});
    pool.on('error', () => {}); // No connection strings/provider diagnostics in logs.
    stores.set(key, createProblemReportsStore(pool, config));
  }
  return stores.get(key);
}
