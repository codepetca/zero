import {boundedJson, githubApiHeaders} from './hub-github-auth.mjs';
import {canonicalPagesUrl, repositoryParts} from './hub-project-status.mjs';
import pagesChecks from '../../extension/src/web-pages-verification.js';

const {safePagesUrl, publicReadiness, boundedText} = pagesChecks;
const apiOrigin = 'https://api.github.com';
const workflow = '.github/workflows/zero-web.yml';
export const listingId = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const safeNumber = value => Number.isSafeInteger(value) && value > 0;
const tokenPattern = /^ghu_[A-Za-z0-9_]{10,512}$/;

export async function checkListingToken(token, config, signal, fetchImpl = fetch) {
  if (typeof token !== 'string' || !tokenPattern.test(token)) return null;
  const response = await fetchImpl(`${apiOrigin}/applications/${config.clientId}/token`, {
    method:'POST', redirect:'error', cache:'no-store', signal,
    headers:{...githubApiHeaders(token), 'Content-Type':'application/json',
      Authorization:'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')},
    body:JSON.stringify({access_token:token})
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    if ([401, 404, 422].includes(response.status)) return null;
    throw new Error('GitHub connection unavailable');
  }
  const {user, app} = await boundedJson(response);
  return safeNumber(user?.id) && app?.client_id === config.clientId ? String(user.id) : null;
}

export function listingReceipt(input) {
  if (!input || !listingId(input.repositoryId) || !repositoryParts(input.repositoryUrl) ||
      !safeNumber(Number(input.runId)) || typeof input.runId !== 'string' || !listingId(input.runId) ||
      typeof input.commit !== 'string' || !/^[a-f0-9]{40}$/.test(input.commit)) return null;
  return {repositoryId:input.repositoryId, repositoryUrl:input.repositoryUrl, runId:input.runId, commit:input.commit};
}

export async function verifyListingPublication(receipt, {account, token, signal, fetchImpl = fetch, readPublic = publicReadiness}) {
  const root = apiOrigin + '/repos/' + receipt.repositoryUrl.slice('https://github.com/'.length);
  async function read(suffix = '') {
    const response = await fetchImpl(root + suffix, {headers:githubApiHeaders(token), redirect:'error', cache:'no-store', signal});
    if (response.status !== 200) {
      await response.body?.cancel();
      if ([401, 403, 404, 410].includes(response.status)) return null;
      throw new Error('GitHub repository unavailable');
    }
    return boundedJson(response, 65_536);
  }

  const repo = await read();
  const parts = repo && repositoryParts('https://github.com/' + repo.full_name);
  if (!parts || repo.full_name.toLowerCase() !== receipt.repositoryUrl.slice('https://github.com/'.length).toLowerCase() ||
      !safeNumber(repo.id) || String(repo.id) !== receipt.repositoryId || repo.private !== false ||
      !safeNumber(repo.owner?.id) || String(repo.owner.id) !== account || repo.owner.type !== 'User' ||
      typeof repo.owner.login !== 'string' || repo.owner.login.toLowerCase() !== parts.owner.toLowerCase() ||
      typeof repo.name !== 'string' || repo.name !== parts.repo) return null;
  const repositoryUrl = 'https://github.com/' + repo.full_name;
  const [pages, run] = await Promise.all([read('/pages'), read('/actions/runs/' + receipt.runId)]);
  if (!run || !safeNumber(run.id) || String(run.id) !== receipt.runId || run.repository?.id !== repo.id ||
      run.head_sha !== receipt.commit || run.head_branch !== 'main' || run.path !== workflow || run.event !== 'workflow_dispatch' ||
      run.status !== 'completed' || run.conclusion !== 'success' ||
      typeof run.created_at !== 'string' || !Number.isFinite(Date.parse(run.created_at))) return null;

  const pagesUrl = safePagesUrl(pages?.html_url, pages?.cname);
  if (!pagesUrl || pages.public !== true || pages.build_type !== 'workflow' ||
      (!pages.cname && pagesUrl !== canonicalPagesUrl(repositoryUrl))) return null;
  const proofUrl = new URL('zero-source-sha.txt', pagesUrl.endsWith('/') ? pagesUrl : pagesUrl + '/');
  // Existing DNS-pinned, no-redirect Pages probe. GitHub credentials never
  // travel to the Pages host, including when it uses a custom domain.
  const proof = await readPublic(proofUrl.href, {signal});
  if (!proof.ok || await boundedText(proof) !== receipt.commit + '\n' + receipt.runId) return null;
  signal.throwIfAborted();

  return {...receipt, repositoryUrl, title:repo.name, author:repo.owner.login, pagesUrl,
    runCreatedAt:new Date(run.created_at)};
}
