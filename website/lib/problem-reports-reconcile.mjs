import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {createHash, timingSafeEqual} from 'node:crypto';
import {problemReportsConfig} from './problem-reports-config.mjs';
import {configuredProblemReportsStore} from './problem-reports-store.mjs';
import {createProblemReportsGithub} from './problem-reports-github.mjs';

/** Operator/scheduler entry point. Read-only health unless apply is explicit.
 * Returns aggregate state only; never report text, issue identifiers or secrets.
 * No ambiguity is cleared automatically. A missing issue marker after an
 * unknown create outcome requires maintainer investigation.
 */
export async function reconcileProblemReports({env = process.env, apply = false, limit = 10,
  signal, responseBudgetMs = 30000, providerBudgetMs = 8000,
  storeFactory = configuredProblemReportsStore, githubFactory = createProblemReportsGithub} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Limit must be between 1 and 20.');
  const config = problemReportsConfig(env);
  if (!config) return {status:'disabled'};
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal});
  let session, health, attempted = 0;
  const store = storeFactory(config);
  try {
    session = await store.open(deadline, {initializeDestination:apply});
    health = await session.health();
    const pending = apply ? await session.pending(limit) : [];
    session.close(); session = null;
    for (const fingerprint of pending) {
      deadline.check();
      session = await store.open(deadline);
      const provider = createHubRequestDeadline({budgetMs:providerBudgetMs, signal:deadline.signal});
      try {
        attempted++;
        await provider.run(() => githubFactory(config).deliver(session, fingerprint, provider));
      } catch { /* Retain durable pending state; no provider details leave this boundary. */ }
      finally { provider.dispose(); session.close(); session = null; }
    }
    session = await store.open(deadline, {initializeDestination:apply});
    health = await session.health();
    return {status:'ok', ...health, attempted};
  } catch {
    return {status:'unavailable', ...(health || {}), attempted};
  } finally { session?.close(); deadline.dispose(); }
}

const response = (value, status) => Response.json(value, {status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});

/** The scheduler holds only this purpose-specific bearer secret, never the DB
 * or GitHub App credentials. No caller-controlled limits, destination or body.
 */
export async function reconcileProblemReportsResponse(request, {env = process.env, reconcile = reconcileProblemReports} = {}) {
  const secret = env.ZERO_REPORTS_RECONCILE_SECRET;
  if (!problemReportsConfig(env) || !/^[A-Za-z0-9_-]{32,256}$/.test(secret || '')) return response({status:'disabled'}, 503);
  const supplied = request.headers.get('authorization') || '';
  const token = supplied.startsWith('Bearer ') && supplied.length <= 263 ? supplied.slice(7) : '';
  const digest = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(secret), digest(token))) return response({status:'unauthorized'}, 401);
  if (request.method !== 'POST' || request.body !== null) return response({status:'invalid'}, 400);
  try {
    const result = await reconcile({env, apply:true, limit:5, signal:request.signal, responseBudgetMs:20000, providerBudgetMs:6000});
    // Project the response even if a future implementation returns more fields.
    const counts = Object.fromEntries(['delivered','pending','needsAttention','attempted']
      .filter(key => Number.isSafeInteger(result[key]) && result[key] >= 0).map(key => [key,result[key]]));
    return response({status:result.status === 'ok' ? 'ok' : 'unavailable', ...counts}, result.status === 'ok' ? 200 : 503);
  } catch { return response({status:'unavailable'}, 503); }
}
