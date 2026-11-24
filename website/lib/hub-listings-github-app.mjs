import {createPrivateKey, sign} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {boundedJson, githubApiHeaders} from './hub-github-auth.mjs';
import {repositoryParts} from './hub-project-status.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';

const origin = 'https://api.github.com';
const unavailable = code => Object.assign(new Error('GitHub listing metadata is unavailable.'),{code});
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const publicRepositoryAt = (repo, repositoryUrl) => repo?.private === false &&
  typeof repo.html_url === 'string' && repo.html_url.toLowerCase() === repositoryUrl.toLowerCase();

let cachedKey;
let cachedReader;
export function listingRepositoryReader(env = process.env) {
  const appId = String(zeroApp.appId);
  const pem = env.ZERO_JAMS_PRIVATE_KEY;
  if (zeroApp.status !== 'configured' || env.ZERO_JAMS_APP_ID !== appId ||
      typeof pem !== 'string' || pem.length > 16384) return null;
  if (cachedKey === pem) return cachedReader;
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') return null;
    cachedKey = pem;
    cachedReader = createListingRepositoryReader({appId, key});
    return cachedReader;
  } catch { return null; }
}

export function createListingRepositoryReader({appId, key, fetchImpl = fetch, now = Date.now}) {
  const observations = new Map();
  function remember(id, observation) {
    observations.set(id,observation);
    if (observations.size > 64) observations.delete(observations.keys().next().value);
  }
  function appToken() {
    const time = Math.floor(now()/1000);
    const header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({iat:time-60,exp:time+300,iss:appId})).toString('base64url');
    const unsigned = header+'.'+payload;
    return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
  }

  async function github(path, token, signal, body) {
    const url = origin+path;
    const headers = githubApiHeaders(token);
    if (token === null) delete headers.Authorization;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(url,{redirect:'manual',cache:'no-store',signal,
      method:body ? 'POST' : 'GET',
      headers,
      ...(body ? {body:JSON.stringify(body)} : {})});
    const direct = !response.redirected && (!response.url || response.url === url);
    if (direct && response.status === (body ? 201 : 200)) return boundedJson(response,65_536);
    await response.body?.cancel();
    if (direct && !body && [301,302,307,308,404,410].includes(response.status)) return null;
    const stage = body ? 'listing-token-http' : path.endsWith('/installation') ? 'listing-installation-http' : 'listing-repository-http';
    throw Object.assign(unavailable(stage),{status:response.status});
  }

  async function isReplacement(path, entry, repositoryId, signal) {
    const deadline = createHubRequestDeadline({budgetMs:1500,signal});
    try {
      const repo = await deadline.run(probeSignal=>github(path,null,probeSignal));
      // Public metadata can disprove the stored binding. Only the App grant can verify it.
      return publicRepositoryAt(repo,entry.repositoryUrl) && positiveId(repo.id) && repo.id !== repositoryId;
    } catch {
      signal?.throwIfAborted();
      return false;
    } finally { deadline.dispose(); }
  }

  return async function read(entry,{signal,includeFeedback=false}) {
    const parts = repositoryParts(entry.repositoryUrl);
    const repositoryId = Number(entry.repositoryId);
    const ownerId = Number(entry.accountId);
    if (!parts || !positiveId(repositoryId) || !positiveId(ownerId)) return false;
    const root = '/repos/'+parts.owner+'/'+parts.repo;
    const cacheId = entry.accountId+'/'+entry.repositoryId;
    let grant = observations.get(cacheId);
    if (grant?.replacedPath) {
      if (grant.replacedPath === root && grant.expiresAt > now()) return false;
      grant = undefined;
    }
    if (!grant || grant.expiresAt <= now()) {
      const jwt = appToken();
      const installation = await github(root+'/installation',jwt,signal);
      if (!installation || installation.suspended_at != null) return false;
      if (!positiveId(installation.id) || String(installation.app_id) !== appId ||
          installation.account?.id !== ownerId || installation.account?.type !== 'User' ||
          installation.permissions?.metadata !== 'read') return false;
      let result;
      try {
        result = await github('/app/installations/'+installation.id+'/access_tokens',jwt,signal,
          {repository_ids:[repositoryId],permissions:{metadata:'read'}});
      } catch (error) {
        if (error.status === 422 && await isReplacement(root,entry,repositoryId,signal)) {
          remember(cacheId,{replacedPath:root,expiresAt:now()+300_000});
          return false;
        }
        throw error;
      }
      const expiresAt = Date.parse(result.expires_at);
      if (!/^ghs_[A-Za-z0-9._-]{10,8000}$/.test(result.token || '') ||
          !Number.isFinite(expiresAt) || expiresAt <= now()+60_000 || expiresAt > now()+3_660_000 ||
          result.repository_selection !== 'selected' || result.permissions?.metadata !== 'read' ||
          Object.keys(result.permissions).length !== 1)
        throw unavailable('listing-token-envelope');
      if (!Array.isArray(result.repositories) || result.repositories.length !== 1 ||
          result.repositories[0]?.id !== repositoryId || typeof result.repositories[0].private !== 'boolean')
        throw unavailable('listing-token-repositories');
      if (result.repositories[0].private) return false;
      grant = {token:result.token,expiresAt:Math.min(expiresAt-60_000,now()+300_000)};
      remember(cacheId,grant);
    }
    try {
      const repo = await github(root,grant.token,signal);
      if (!repo && observations.get(cacheId) === grant) observations.delete(cacheId);
      const verified = publicRepositoryAt(repo,entry.repositoryUrl) && repo.has_pages === true && repo.id === repositoryId &&
        repo.owner?.type === 'User' && repo.owner.id === ownerId;
      if (!verified || !includeFeedback) return verified;
      return {
        stars:Number.isSafeInteger(repo.stargazers_count) && repo.stargazers_count >= 0 ? repo.stargazers_count : null,
        issuesEnabled:typeof repo.has_issues === 'boolean' ? repo.has_issues : null
      };
    } catch (error) {
      if (error.status === 401 && observations.get(cacheId) === grant) observations.delete(cacheId);
      throw error;
    }
  };
}
