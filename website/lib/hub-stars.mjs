import {bindHubProjectDestination, hubTargetVisible, hubVisibilityDecision, resolveHubProject} from './hub-project-status.mjs';
import {assertJamVisibilityTime, readJamHubVisibility} from './jam-hub-visibility.mjs';
import {readJamDestinationBinding} from './jam-destination-binding.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {cookieHeader, SESSION_COOKIE, equalSecret, githubApiHeaders, hubConfig, json, readSession, sameOrigin} from './hub-github-auth.mjs';

export function publicGithubRepository(repositoryUrl) {
  if (typeof repositoryUrl !== 'string') return null;
  try {
    const url = new URL(repositoryUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
      url.username || url.password || url.search || url.hash) return null;
    const match = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(url.pathname);
    if (!match || match[2] === '.' || match[2] === '..' || match[2].endsWith('.git')) return null;
    return {owner: match[1], repo: match[2]};
  } catch { return null; }
}

function validTarget(input) {
  return input && (input.kind === 'game' || input.kind === 'library') &&
    typeof input.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.id);
}

async function targetFromInput(input, resolver, options, deadline) {
  if (!validTarget(input)) return null;
  const visibility = await deadline.run(() => hubVisibilityDecision(options));
  let project = await deadline.run(() => resolver({kind: input.kind, id: input.id}, {...options, visibility}));
  if (!project || project.kind !== input.kind || project.id !== input.id) return null;
  // The imported resolver already binds source identity and checks fresh
  // authority, including inactive-to-active transitions. Avoid duplicating its
  // active provider observation only for that exact function. Every custom resolver
  // (including wrappers) must receive the route's independent binding. This is
  // GitHub source binding only, never a proof of a Pages destination's source.
  if (resolver !== resolveHubProject || visibility === null)
    project = await deadline.run(() => bindHubProjectDestination(project, visibility, options));
  if (!project) return null;
  const repository = publicGithubRepository(project.repositoryUrl);
  return repository ? {project, repository, visibility} : null;
}

// Cleanup must not extend the request budget: a provider or stream may ignore
// cancellation. Observe its eventual rejection without waiting for it.
function discardBody(body) {
  try { Promise.resolve(body?.cancel()).catch(() => {}); } catch { /* Already locked/closed. */ }
}

async function boundedBody(source, limit, deadline) {
  deadline.check();
  const reader = source.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
  deadline.signal.addEventListener('abort', cancel, {once:true});
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await deadline.run(() => reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Oversized body');
      chunks.push(value);
    }
    deadline.check();
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    deadline.signal.removeEventListener('abort', cancel);
    cancel();
    try { reader.releaseLock(); } catch { /* A noncooperative read may still be pending. */ }
  }
}

async function githubStar(method, repository, token, fetchImpl, deadline, onDispatch = () => {}) {
  let response;
  try {
    response = await deadline.run(async signal => {
      deadline.check();
      onDispatch();
      const result = await fetchImpl(`https://api.github.com/user/starred/${repository.owner}/${repository.repo}`, {
        method, headers: {...githubApiHeaders(token), ...(method === 'PUT' ? {'Content-Length': '0'} : {})},
        redirect: 'error', cache: 'no-store', signal
      });
      // A transport that ignores abort may resolve after the request has ended.
      if (signal.aborted) { discardBody(result.body); deadline.check(); }
      return result;
    });
  } catch (error) {
    if (!deadline.signal.aborted) {
      const knownCodes = new Set(['UND_ERR_REQ_CONTENT_LENGTH_MISMATCH', 'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']);
      const code = knownCodes.has(error?.cause?.code) ? error.cause.code : 'unknown';
      console.warn('ZeroHub GitHub star failure', {stage: 'transport', method, code});
    }
    throw error;
  }
  try {
    if (response.status !== 204 && !(method === 'GET' && response.status === 404)) {
      let reason = 'upstream_error';
      try {
        const {message} = await boundedBody(response, 16_384, deadline);
        reason = new Map([
          ['Resource not accessible by integration', 'integration_access_denied'],
          ['Resource not accessible by personal access token', 'token_access_denied'],
          ['Bad credentials', 'bad_credentials'], ['Not Found', 'not_found']
        ]).get(message) || reason;
      } catch { deadline.check(); /* Error bodies are bounded and never logged. */ }
      deadline.check();
      const remaining = response.headers.get('x-ratelimit-remaining');
      const acceptedPermissions = (response.headers.get('x-accepted-github-permissions') || '')
        .split(/[;,]/).map(value => value.trim()).filter(value => /^(metadata|starring)=(read|write)$/.test(value));
      console.warn('ZeroHub GitHub star failure', {stage: 'upstream', method, status: response.status,
        reason, acceptedPermissions, rateLimitRemaining: /^\d{1,9}$/.test(remaining || '') ? Number(remaining) : null});
    }
    deadline.check();
    return response.status;
  } finally { discardBody(response.body); }
}

function deadlineFailure(deadline, error, dispatched = null, confirmed = false) {
  const reason = deadline.signal.aborted ? deadline.signal.reason : error;
  const code = reason?.code === 'HUB_REQUEST_DEADLINE' ? 'hub_request_timeout'
    : reason?.code === 'HUB_REQUEST_CANCELLED' ? 'hub_request_cancelled' : null;
  if (!code) return null;
  return json({error:confirmed ? 'Hub project unavailable' : dispatched
    ? 'GitHub star change could not be confirmed. Check GitHub before trying again.' : 'GitHub star request unavailable',
    code, ...(dispatched === null ? {} : {outcome:confirmed ? 'confirmed' : dispatched ? 'uncertain' : 'not_dispatched'})}, 503);
}

async function visibleAgain(target, options, deadline) {
  const visibility = await deadline.run(() => hubVisibilityDecision(options));
  deadline.check();
  // A request that began inactive must start again through active binding;
  // disappearing authority must never release an already active request.
  if ((target.visibility === null) !== (visibility === null)) return false;
  if (!hubTargetVisible(target.project, visibility)) return false;
  let finalVisibility = visibility;
  const bound = await deadline.run(() => bindHubProjectDestination(target.project, visibility, {...options,
    onVisibilityDecision:latest => { finalVisibility = latest; }}));
  // Retain the binding's last independent decision across the caller's await.
  return bound ? {visibility:finalVisibility} : null;
}

export async function getStarResponse(request, {env = process.env, fetchImpl = fetch,
  resolver = resolveHubProject, now = Date.now(), visibilityReader = readJamHubVisibility,
  destinationReader = readJamDestinationBinding, pagesBindingReader, destinationTimeoutMs = 6000,
  responseBudgetMs = 18_000, deadlineNow, decisionNow = Date.now} = {}) {
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal, now:deadlineNow});
  let stage = 'target';
  try {
    deadline.check();
    const config = hubConfig(env);
    if (!config) return json({error: 'GitHub stars unavailable', configured: false}, 503);
    const session = readSession(request, config, now);
    if (!session) return json({error: 'GitHub sign-in required'}, 401);
    const url = new URL(request.url);
    if (url.searchParams.getAll('kind').length !== 1 || url.searchParams.getAll('id').length !== 1)
      return json({error: 'Invalid project'}, 400);
    const options = {env, signal:deadline.signal, visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs, decisionNow, check:deadline.check};
    const target = await deadline.run(() => targetFromInput(
      {kind:url.searchParams.get('kind'), id:url.searchParams.get('id')}, resolver, options, deadline));
    if (!target) return json({error: 'Unknown Hub project'}, 404);
    stage = 'github';
    const status = await githubStar('GET', target.repository, session.token, fetchImpl, deadline);
    if (status === 204 || status === 404) {
      stage = 'target';
      const final = await visibleAgain(target, options, deadline);
      if (!final) return json({error:'Unknown Hub project'}, 404);
      deadline.check();
      assertJamVisibilityTime(final.visibility, decisionNow, env);
      return json({starred:status === 204});
    }
    return json({error: 'GitHub star state unavailable'}, status === 401 ? 401 : 502,
      status === 401 ? {'Set-Cookie':cookieHeader(SESSION_COOKIE,'',config,0)} : {});
  } catch (error) {
    return deadlineFailure(deadline, error) ?? json({error:stage === 'target' ? 'Hub project unavailable' : 'GitHub star state unavailable'},
      stage === 'target' ? 503 : 502);
  } finally { deadline.dispose(); }
}

export async function postStarResponse(request, {env = process.env, fetchImpl = fetch,
  resolver = resolveHubProject, now = Date.now(), visibilityReader = readJamHubVisibility,
  destinationReader = readJamDestinationBinding, pagesBindingReader, destinationTimeoutMs = 6000,
  responseBudgetMs = 18_000, deadlineNow, decisionNow = Date.now} = {}) {
  const deadline = createHubRequestDeadline({budgetMs:responseBudgetMs, signal:request.signal, now:deadlineNow});
  let stage = 'body', dispatched = false, confirmed = false;
  const rejection = (data, status) => json({...data,
    outcome:confirmed ? 'confirmed' : dispatched ? 'uncertain' : 'not_dispatched'}, status);
  try {
    deadline.check();
    const config = hubConfig(env);
    if (!config) return rejection({error: 'GitHub stars unavailable', configured: false}, 503);
    if (!sameOrigin(request, config)) return rejection({error: 'Invalid origin'}, 403);
    const session = readSession(request, config, now);
    if (!session) return rejection({error: 'GitHub sign-in required'}, 401);
    if (!equalSecret(request.headers.get('x-hub-csrf'), session.csrf))
      return rejection({error: 'Invalid session token'}, 403);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
      return rejection({error: 'Expected JSON'}, 415);
    const input = await boundedBody(request, 2048, deadline);
    if (!validTarget(input) || typeof input.starred !== 'boolean') return rejection({error: 'Invalid star request'}, 400);
    stage = 'target';
    const options = {env, signal:deadline.signal, visibilityReader, destinationReader, pagesBindingReader, destinationTimeoutMs, decisionNow, check:deadline.check};
    const target = await deadline.run(() => targetFromInput(input, resolver, options, deadline));
    const admission = target && await visibleAgain(target, options, deadline);
    if (!admission) return rejection({error:'Unknown Hub project'}, 404);
    // GitHub star mutations address owner/name, with no immutable-ID condition.
    // A rename/transfer or namespace replacement after even the last identity
    // check could mutate a different, held repository. Active Jam enforcement
    // therefore permits bound reads only, and never dispatches a repository mutation.
    if (target.visibility !== null)
      return rejection({error:'GitHub star changes are unavailable for this project.', code:'hub_star_write_unavailable'}, 503);
    stage = 'github';
    const status = await githubStar(input.starred ? 'PUT' : 'DELETE', target.repository, session.token,
      fetchImpl, deadline, () => { assertJamVisibilityTime(admission.visibility, decisionNow, env); dispatched = true; });
    if (status === 204) {
      confirmed = true;
      stage = 'target';
      const final = await visibleAgain(target, options, deadline);
      if (!final) return json({error:'Unknown Hub project', outcome:'confirmed'}, 404);
      deadline.check();
      assertJamVisibilityTime(final.visibility, decisionNow, env);
      return json({starred:input.starred});
    }
    return json({error:'GitHub star change could not be confirmed. Check GitHub before trying again.', outcome:'uncertain'},
      status === 401 ? 401 : 502,
      status === 401 ? {'Set-Cookie':cookieHeader(SESSION_COOKIE,'',config,0)} : {});
  } catch (error) {
    return deadlineFailure(deadline, error, dispatched, confirmed) ?? (confirmed
      ? json({error:'Hub project unavailable', outcome:'confirmed'}, 503) : dispatched
      ? json({error:'GitHub star change could not be confirmed. Check GitHub before trying again.', outcome:'uncertain'}, 502)
      : rejection({error:stage === 'body' ? 'Invalid request body' : 'Hub project unavailable'}, stage === 'body' ? 400 : 503));
  } finally { deadline.dispose(); }
}
