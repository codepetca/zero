import {createPrivateKey, sign} from 'node:crypto';
import zeroApp from '../../extension/src/github-app/config.json' with {type:'json'};
import {boundedJson, githubApiHeaders} from './hub-github-auth.mjs';
import {repositoryParts} from './hub-project-status.mjs';

const origin = 'https://api.github.com';
const unavailable = () => new Error('GitHub listing metadata is unavailable.');
const positiveId = value => Number.isSafeInteger(value) && value > 0;

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
  const tokens = new Map();
  function appToken() {
    const time = Math.floor(now()/1000);
    const header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({iat:time-60,exp:time+300,iss:appId})).toString('base64url');
    const unsigned = header+'.'+payload;
    return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
  }

  async function github(path, token, signal, body) {
    const url = origin+path;
    const response = await fetchImpl(url,{redirect:'manual',cache:'no-store',signal,
      method:body ? 'POST' : 'GET',
      headers:{...githubApiHeaders(token), ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})});
    const direct = !response.redirected && (!response.url || response.url === url);
    if (direct && response.status === (body ? 201 : 200)) return boundedJson(response,65_536);
    await response.body?.cancel();
    if (direct && !body && [301,302,307,308,404,410].includes(response.status)) return null;
    throw unavailable();
  }

  return async function read(entry,{signal}) {
    const parts = repositoryParts(entry.repositoryUrl);
    const repositoryId = Number(entry.repositoryId);
    const ownerId = Number(entry.accountId);
    if (!parts || !positiveId(repositoryId) || !positiveId(ownerId)) return false;
    const root = '/repos/'+parts.owner+'/'+parts.repo;
    const cacheId = entry.accountId+'/'+entry.repositoryId;
    let grant = tokens.get(cacheId);
    if (!grant || grant.expiresAt <= now()) {
      const jwt = appToken();
      const installation = await github(root+'/installation',jwt,signal);
      if (!installation || installation.suspended_at != null) return false;
      if (!positiveId(installation.id) || String(installation.app_id) !== appId ||
          installation.account?.id !== ownerId || installation.account?.type !== 'User' ||
          installation.permissions?.metadata !== 'read') return false;
      const result = await github('/app/installations/'+installation.id+'/access_tokens',jwt,signal,
        {repository_ids:[repositoryId],permissions:{metadata:'read'}});
      const expiresAt = Date.parse(result.expires_at);
      if (!/^ghs_[A-Za-z0-9._-]{10,8000}$/.test(result.token || '') ||
          !Number.isFinite(expiresAt) || expiresAt <= now()+60_000 || expiresAt > now()+3_660_000 ||
          result.permissions?.metadata !== 'read' || Object.keys(result.permissions).length !== 1 ||
          !Array.isArray(result.repositories) || result.repositories.length !== 1 ||
          result.repositories[0]?.id !== repositoryId || result.repositories[0]?.private !== false)
        throw unavailable();
      grant = {token:result.token,expiresAt:Math.min(expiresAt-60_000,now()+300_000)};
      if (tokens.size >= 64) tokens.delete(tokens.keys().next().value);
      tokens.set(cacheId,grant);
    }
    try {
      const repo = await github(root,grant.token,signal);
      if (!repo) tokens.delete(cacheId);
      return repo?.private === false && repo.has_pages === true && repo.id === repositoryId &&
        repo.owner?.type === 'User' && repo.owner.id === ownerId && typeof repo.html_url === 'string' &&
        repo.html_url.toLowerCase() === entry.repositoryUrl.toLowerCase();
    } catch (error) {
      tokens.delete(cacheId);
      throw error;
    }
  };
}
