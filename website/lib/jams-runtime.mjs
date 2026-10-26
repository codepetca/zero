import {createHash, createPrivateKey, sign} from 'node:crypto';
import {boundedJson} from './hub-github-auth.mjs';
import {createAtomicGitHubJamStore} from '../../jams/git-store.mjs';
import {createGitHubSourceVerifier} from '../../jams/github-source.mjs';
import {createJamService} from '../../jams/service.mjs';
import {jamDeploymentPolicy} from './jams-pilot-policy.mjs';
import {createJamProviderContext} from '../../jams/provider-monitor.mjs';
import {PILOT_PROVIDER_PACING} from '../../jams/pacing.mjs';
import {githubRequest} from '../../jams/github-transport.mjs';
import {JamError} from '../../jams/schema.mjs';

// A separate installation credential writes only the official registry. Never
// substitute the visiting participant's token for this service credential.
const tokenCache = new Map();
const tokenFlights = new WeakMap();
const quotaRefreshes = new Map();
const quotaProbeTimes = new Map();
const positiveId = /^[1-9][0-9]{0,19}$/;
const api = 'https://api.github.com';

export function jamServiceConfig(env = process.env,pilot) {
  const policy=jamDeploymentPolicy(env,pilot);
  if (!policy || env.ZERO_JAMS_ENABLED !== '1') return null;
  const maintainers = (env.ZERO_JAMS_MAINTAINER_IDS || '').split(',').map(value => value.trim());
  if (!maintainers.length || maintainers.some(value => !positiveId.test(value)) ||
      new Set(maintainers).size !== maintainers.length || maintainers.length > 20) return null;
  if(policy.mode==='pilot'&&(maintainers.length!==policy.maintainerIds.length||maintainers.some(id=>!policy.maintainerIds.includes(id))))return null;
  const {ZERO_JAMS_APP_ID: appId, ZERO_JAMS_INSTALLATION_ID: installationId,
    ZERO_JAMS_PRIVATE_KEY: privateKey} = env;
  if (!positiveId.test(appId || '') || !positiveId.test(installationId || '') ||
      typeof privateKey !== 'string' || privateKey.length > 16_384) return null;
  if(policy.mode==='pilot'&&appId==='5367740')return null;
  try {
    if (createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') return null;
  } catch { return null; }
  return {appId, installationId, privateKey, maintainerIds: maintainers,mode:policy.mode,origin:policy.origin,registryBranch:policy.registryBranch,...(policy.mode==='pilot'?{limits:policy.limits}:{})};
}

function jwt(config, now) {
  const header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({iat:Math.floor(now / 1000) - 60,
    exp:Math.floor(now / 1000) + 300, iss:config.appId})).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), config.privateKey).toString('base64url')}`;
}

export async function jamInstallationToken(config, {fetchImpl = fetch, now = Date.now(), cache = tokenCache} = {}) {
  const key = createHash('sha256').update(`${config.appId}:${config.installationId}:${config.privateKey}:${config.mode}:${config.origin}:${config.registryBranch}`).digest('hex');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;
  let flights=tokenFlights.get(cache);
  if(!flights){flights=new Map();tokenFlights.set(cache,flights);}
  if(flights.has(key))return flights.get(key);
  if(flights.size>=4)throw new Error('ZeroJams installation busy');
  const mint=async()=>{
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
    if(config.mode==='pilot'&&(installation.repository_selection!=='selected'||installation.permissions?.metadata!=='read'||Object.keys(installation.permissions).some(key=>!['contents','metadata'].includes(key))))throw new Error('ZeroJams installation unavailable');
    const result = await request(`/app/installations/${config.installationId}/access_tokens`, 'POST',
      {repositories:['zero'], permissions:{contents:'write',metadata:'read'}});
    const expiresAt = Date.parse(result.expires_at);
    // GitHub installation tokens are opaque: current stateless tokens contain
    // JWT punctuation and have variable length. Keep the type prefix, transport
    // bound and header-safety checks without interpreting the credential.
    if (typeof result.token !== 'string' || !/^ghs_[\x21-\x7e]{10,1020}$/.test(result.token) ||
        !Number.isFinite(expiresAt) || expiresAt <= now + 60_000 || expiresAt > now + 3_660_000 ||
        result.permissions?.contents !== 'write' ||
        Object.keys(result.permissions).some(permission => !['contents','metadata'].includes(permission)) ||
        result.permissions.metadata !== 'read' ||
        !Array.isArray(result.repositories) || result.repositories.length !== 1 ||
        result.repositories[0].full_name !== 'codepetca/zero') throw new Error('ZeroJams installation unavailable');
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(key, {token:result.token,expiresAt:Math.min(expiresAt,now+600_000)});
    return result.token;
  };
  const pending=mint();flights.set(key,pending);
  try{return await pending;}finally{if(flights.get(key)===pending)flights.delete(key);}
}

export async function createJamRuntime({env = process.env, fetchImpl = fetch,
  now = Date.now, sourceToken,pilot,providerContext} = {}) {
  const config = jamServiceConfig(env,pilot);
  if (!config) return null;
  const provider=providerContext??createJamProviderContext(config,{fetchImpl,now});
  const token = await jamInstallationToken(config, {fetchImpl:provider.fetch('setup'),now:now()});
  return createJamService({store:createAtomicGitHubJamStore({token,fetchImpl:provider.fetch('installation'),registryBranch:config.registryBranch,maxEvents:config.limits?.events}),
    verifySource:createGitHubSourceVerifier({token:sourceToken,fetchImpl:provider.fetch('participant')}),
    maintainerIds:config.maintainerIds,limits:config.mode==='pilot'?{...config.limits,retries:2}:config.limits,
    pacing:config.mode==='pilot'?PILOT_PROVIDER_PACING:null,now});
}

// Only the maintainer HTTP handler calls this. It uses the dedicated writer's
// quota headers, never the operator CLI or participant quota as a substitute.
export async function readJamProviderStatus({env=process.env,fetchImpl=fetch,now=Date.now,pilot,providerContext}={}) {
  const config=jamServiceConfig(env,pilot);
  if(!config)throw new JamError(503,'ZeroJams provider diagnostics are unavailable.');
  const provider=providerContext??createJamProviderContext(config,{fetchImpl,now,priority:'recovery'});
  const current=provider.snapshot().installation.quota;
  const key=`${config.appId}:${config.installationId}`;
  const recentObservation=Number.isSafeInteger(current?.observedAt)&&!current.stale&&current.observedAt>=now()-30_000;
  const recentProbe=quotaProbeTimes.has(key)&&quotaProbeTimes.get(key)>=now()-30_000;
  if(!recentObservation&&!recentProbe) {
    let pending=quotaRefreshes.get(key);
    if(!pending) {
      if(quotaRefreshes.size>=16)throw new JamError(503,'ZeroJams provider diagnostics are busy.');
      pending=(async()=>{
        const token=await jamInstallationToken(config,{fetchImpl:provider.fetch('setup'),now:now()});
        const result=await githubRequest('/rate_limit',{token,fetchImpl:provider.fetch('installation'),maxBytes:32768});
        if(result.status!==200)throw new JamError(503,'GitHub quota could not be refreshed.');
        quotaProbeTimes.delete(key);quotaProbeTimes.set(key,now());
        while(quotaProbeTimes.size>16)quotaProbeTimes.delete(quotaProbeTimes.keys().next().value);
      })();
      quotaRefreshes.set(key,pending);
    }
    try{await pending;}finally{if(quotaRefreshes.get(key)===pending)quotaRefreshes.delete(key);}
  }
  return {provider:provider.snapshot(),acceptedIntentPacing:config.mode==='pilot'?PILOT_PROVIDER_PACING:null,
    pacingScope:'Cooperating writers of this registry branch; not a hard outbound request budget.'};
}
