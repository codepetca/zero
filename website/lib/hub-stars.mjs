import {resolveHubProject} from './hub-project-status.mjs';
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

async function targetFromInput(input, resolver) {
  if (!validTarget(input)) return null;
  const project = await resolver({kind: input.kind, id: input.id});
  if (!project || project.kind !== input.kind || project.id !== input.id) return null;
  return publicGithubRepository(project.repositoryUrl);
}

async function boundedBody(request, limit = 2048) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Oversized body');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function githubStar(method, repository, token, fetchImpl) {
  const response = await fetchImpl(`https://api.github.com/user/starred/${repository.owner}/${repository.repo}`, {
    method, headers: {...githubApiHeaders(token), ...(method === 'PUT' ? {'Content-Length': '0'} : {})},
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  await response.body?.cancel().catch(() => {});
  return response.status;
}

export async function getStarResponse(request, {env = process.env, fetchImpl = fetch,
  resolver = resolveHubProject, now = Date.now()} = {}) {
  const config = hubConfig(env);
  if (!config) return json({error: 'GitHub stars unavailable', configured: false}, 503);
  const session = readSession(request, config, now);
  if (!session) return json({error: 'GitHub sign-in required'}, 401);
  const url = new URL(request.url);
  if (url.searchParams.getAll('kind').length !== 1 || url.searchParams.getAll('id').length !== 1)
    return json({error: 'Invalid project'}, 400);
  let repository;
  try { repository = await targetFromInput({kind: url.searchParams.get('kind'), id: url.searchParams.get('id')}, resolver); }
  catch { return json({error: 'Hub project unavailable'}, 503); }
  if (!repository) return json({error: 'Unknown Hub project'}, 404);
  try {
    const status = await githubStar('GET', repository, session.token, fetchImpl);
    if (status === 204) return json({starred: true});
    if (status === 404) return json({starred: false});
    return json({error: 'GitHub star state unavailable'}, status === 401 ? 401 : 502, status === 401 ? {'Set-Cookie':cookieHeader(SESSION_COOKIE,'',config,0)} : {});
  } catch { return json({error: 'GitHub star state unavailable'}, 502); }
}

export async function postStarResponse(request, {env = process.env, fetchImpl = fetch,
  resolver = resolveHubProject, now = Date.now()} = {}) {
  const config = hubConfig(env);
  if (!config) return json({error: 'GitHub stars unavailable', configured: false}, 503);
  if (!sameOrigin(request, config)) return json({error: 'Invalid origin'}, 403);
  const session = readSession(request, config, now);
  if (!session) return json({error: 'GitHub sign-in required'}, 401);
  if (!equalSecret(request.headers.get('x-hub-csrf'), session.csrf))
    return json({error: 'Invalid session token'}, 403);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
    return json({error: 'Expected JSON'}, 415);
  let input;
  try { input = await boundedBody(request); }
  catch { return json({error: 'Invalid request body'}, 400); }
  if (!validTarget(input) || typeof input.starred !== 'boolean') return json({error: 'Invalid star request'}, 400);
  let repository;
  try { repository = await targetFromInput(input, resolver); }
  catch { return json({error: 'Hub project unavailable'}, 503); }
  if (!repository) return json({error: 'Unknown Hub project'}, 404);
  try {
    const status = await githubStar(input.starred ? 'PUT' : 'DELETE', repository, session.token, fetchImpl);
    if (status === 204) return json({starred: input.starred});
    return json({error: 'GitHub did not confirm the star change'}, status === 401 ? 401 : 502, status === 401 ? {'Set-Cookie':cookieHeader(SESSION_COOKIE,'',config,0)} : {});
  } catch { return json({error: 'GitHub did not confirm the star change'}, 502); }
}
