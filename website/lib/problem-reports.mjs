import contract from '../../extension/src/problem-report-contract.js';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {problemReportsConfig} from './problem-reports-config.mjs';
import {configuredProblemReportsStore} from './problem-reports-store.mjs';
import {createProblemReportsGithub} from './problem-reports-github.mjs';

const json = (value, status) => Response.json(value, {status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});

async function readReport(request, deadline) {
  const rejectBody = () => { request.body?.cancel().catch(() => {}); return null; };
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > contract.MAX_REPORT_BYTES)) return rejectBody();
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '') || !request.body) return rejectBody();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  deadline.signal.addEventListener('abort', cancel, {once:true});
  try {
    while (true) {
      const {value, done} = await deadline.run(() => reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > contract.MAX_REPORT_BYTES) return null;
      chunks.push(value);
    }
    return contract.validateProblemReport(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks))));
  } catch { deadline.check(); return null; }
  finally { deadline.signal.removeEventListener('abort', cancel); cancel(); }
}

/** Anonymous transport: never accepts or forwards student GitHub credentials. */
export async function receiveProblemReport(request, {env = process.env, configReader = problemReportsConfig,
  storeFactory = configuredProblemReportsStore, githubFactory = createProblemReportsGithub,
  responseBudgetMs = 12000, providerBudgetMs = 8000} = {}) {
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal});
  let session;
  let accepted;
  try {
    deadline.check();
    const config = configReader(env);
    if (!config) return json({status:'disabled'}, 503);
    const report = await readReport(request, deadline);
    if (!report) return json({status:'invalid'}, 400);
    session = await storeFactory(config).open(deadline);
    accepted = await session.accept(report);
    const provider = createHubRequestDeadline({budgetMs:providerBudgetMs, signal:deadline.signal});
    let status = 'pending';
    try { status = await provider.run(() => githubFactory(config).deliver(session, accepted.fingerprint, provider)); }
    catch { /* Durable acceptance survives provider errors and ambiguous writes. */ }
    finally { provider.dispose(); }
    deadline.check();
    return json({receipt:accepted.receipt, status}, 202);
  } catch (error) {
    if (accepted) return json({receipt:accepted.receipt, status:'pending'}, 202);
    if (error.code === 'REPORT_RATE_LIMIT') return json({status:'limited'}, 429);
    if (error.code === 'REPORT_CONFLICT') return json({status:'invalid'}, 400);
    return json({status:'unavailable'}, 503);
  } finally { session?.close(); deadline.dispose(); }
}
