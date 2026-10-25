import {createHash, createPrivateKey, sign} from 'node:crypto';
import {boundedJson} from './hub-github-auth.mjs';
import {createGitHubJamStore} from '../../jams/github-store.mjs';
import {createGitHubSourceVerifier} from '../../jams/github-source.mjs';
import {createJamService} from '../../jams/service.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';

// A separate installation credential writes only the official registry. Never
// substitute the visiting participant's token for this service credential.
const tokenCache = new Map();
const positiveId = /^[1-9][0-9]{0,19}$/;
const api = 'https://api.github.com';

export function jamServiceConfig(env = process.env) {
  if (!jamsPreviewAvailable(env) || env.ZERO_JAMS_ENABLED !== '1') return null;
  const maintainers = (env.ZERO_JAMS_MAINTAINER_IDS || '').split(',').map(value => value.trim());
  if (!maintainers.length || maintainers.some(value => !positiveId.test(value)) ||
      new Set(maintainers).size !== maintainers.length || maintainers.length > 20) return null;
  const {ZERO_JAMS_APP_ID: appId, ZERO_JAMS_INSTALLATION_ID: installationId,
    ZERO_JAMS_PRIVATE_KEY: privateKey} = env;
  if (!positiveId.test(appId || '') || !positiveId.test(installationId || '') ||
      typeof privateKey !== 'string' || privateKey.length > 16_384) return null;
  try {
    if (createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') return null;
  } catch { return null; }
  return {appId, installationId, privateKey, maintainerIds: maintainers};
}

function jwt(config, now) {
  const header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({iat:Math.floor(now / 1000) - 60,
    exp:Math.floor(now / 1000) + 300, iss:config.appId})).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString('base64url')}`;
}

export async function jamInstallationToken(config, {fetchImpl = fetch, now = Date.now(), cache = tokenCache} = {}) {
  const key = createHash('sha256').update(`${config.appId}:${config.installationId}:${config.privateKey}`).digest('hex');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;
  const authorization = `Bearer ${jwt(config, now)}`;
  async function request(path, method = 'GET', body) {
    const response = await fetchImpl(`${api}${path}`, {method,
      headers:{Authorization:authorization, Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2026-03-10', 'User-Agent':'ZeroJams',
        ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {}),
      redirect:'error', cache:'no-store', signal:AbortSignal.timeout(8000)});
    if (!response.ok || !/^application\/(?:json|vnd\.github\+json)\b/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel().catch(() => {});
      throw new Error('ZeroJams installation unavailable');
    }
    return boundedJson(response, 65_536);
  }
  const installation = await request(`/app/installations/${config.installationId}`);
  if (String(installation.id) !== config.installationId || String(installation.app_id) !== config.appId ||
      installation.account?.login !== 'codepetca' || installation.suspended_at ||
      installation.permissions?.contents !== 'write') throw new Error('ZeroJams installation unavailable');
  const result = await request(`/app/installations/${config.installationId}/access_tokens`, 'POST',
    {repositories:['zero'], permissions:{contents:'write',metadata:'read'}});
  const expiresAt = Date.parse(result.expires_at);
  if (!/^ghs_[A-Za-z0-9_]{10,512}$/.test(result.token || '') ||
      !Number.isFinite(expiresAt) || expiresAt <= now + 60_000 || expiresAt > now + 3_660_000 ||
      result.permissions?.contents !== 'write' ||
      Object.keys(result.permissions).some(permission => !['contents','metadata'].includes(permission)) ||
      result.permissions.metadata !== 'read' ||
      !Array.isArray(result.repositories) || result.repositories.length !== 1 ||
      result.repositories[0].full_name !== 'codepetca/zero') throw new Error('ZeroJams installation unavailable');
  if (cache.size >= 4) cache.delete(cache.keys().next().value);
  cache.set(key, {token:result.token,expiresAt:Math.min(expiresAt,now+600_000)});
  return result.token;
}

export async function createJamRuntime({env = process.env, fetchImpl = fetch,
  now = Date.now, sourceToken} = {}) {
  const config = jamServiceConfig(env);
  if (!config) return null;
  const token = await jamInstallationToken(config, {fetchImpl,now:now()});
  return createJamService({store:createGitHubJamStore({token,fetchImpl}),
    verifySource:createGitHubSourceVerifier({token:sourceToken,fetchImpl}),
    maintainerIds:config.maintainerIds, now});
}
