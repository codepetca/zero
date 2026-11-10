import zeroApp from '../../extension/src/github-app/config.json' with {type: 'json'};
import {githubApiHeaders, githubJson, githubUser, hubConfig, managedHubAvailable, newManagedSession} from './hub-github-auth.mjs';
import {githubAuthentication, workosSessionIdentity} from './workos-config.mjs';

const invalid = () => new Error('Zero could not verify the GitHub account.');
const workosUserIdPattern = /^user_[A-Za-z0-9]{1,128}$/;
const githubAppTokenPattern = /^ghu_[A-Za-z0-9_]{10,512}$/;
const githubLoginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function personalAccountId(user) {
  return user?.type === 'User' && Number.isSafeInteger(user.id) && user.id > 0 ? user.id : null;
}

// Accept only the result of a server-side WorkOS code exchange. This binds
// the accounts for that exchange and does not persist a mapping or any tokens.
export async function verifyWorkOSGitHubBinding(callback, {env = process.env, fetchImpl = fetch} = {}) {
  try {
    const workosUserId = callback?.user?.id;
    const token = callback?.oauthTokens?.accessToken;
    if (callback?.authenticationMethod !== 'GitHubOAuth' || callback.impersonator != null ||
      typeof workosUserId !== 'string' || !workosUserIdPattern.test(workosUserId) ||
      typeof token !== 'string' || !githubAppTokenPattern.test(token)) throw invalid();

    const {clientId} = zeroApp;
    const clientSecret = env.ZERO_HUB_GITHUB_CLIENT_SECRET;
    if (zeroApp.status !== 'configured' || env.ZERO_HUB_GITHUB_CLIENT_ID !== clientId ||
      typeof clientSecret !== 'string' || !/^[\x21-\x7e]{20,256}$/.test(clientSecret)) throw invalid();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const {status, data} = await githubJson(`https://api.github.com/applications/${clientId}/token`, {
      method: 'POST',
      headers: {...githubApiHeaders(token), Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({access_token: token})
    }, fetchImpl);
    const tokenOwner = personalAccountId(data?.user);
    if (status !== 200 || data?.app?.client_id !== clientId || tokenOwner === null) throw invalid();

    const user = await githubUser(token, fetchImpl);
    if (personalAccountId(user) !== tokenOwner ||
      typeof user.login !== 'string' || !githubLoginPattern.test(user.login)) throw invalid();
    return Object.freeze({workosUserId, githubId: String(tokenOwner), login: user.login});
  } catch {
    // A provider response or network error can contain credentials or user data.
    throw invalid();
  }
}

// This callback runs after AuthKit's code exchange. A WorkOS identity may
// sign in to Zero even when the provider did not return an approved App grant.
export async function createWorkOSHubSession(callback, verifyAccessToken, {env = process.env, fetchImpl = fetch, now = Date.now} = {}) {
  const config = hubConfig(env);
  const token = callback?.oauthTokens?.accessToken;
  const expiresAt = callback?.oauthTokens?.expiresAt;
  if (!managedHubAvailable(config, env) || !githubAuthentication(callback) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= now() / 1000 + 60 ||
      typeof token !== 'string' || !githubAppTokenPattern.test(token)) return null;

  try {
    const claims = await verifyAccessToken(callback.accessToken);
    const userId = callback.user.id;
    if (!workosSessionIdentity(claims, userId, env.WORKOS_ISSUER, now())) return null;
    const binding = await verifyWorkOSGitHubBinding(callback, {env, fetchImpl});
    const checkedAt = now();
    const identity = workosSessionIdentity(claims, binding.workosUserId, env.WORKOS_ISSUER, checkedAt);
    if (!identity) return null;
    return newManagedSession(token, {id:Number(binding.githubId), login:binding.login},
      Math.floor(expiresAt - checkedAt / 1000), config, identity, checkedAt);
  } catch { return null; }
}
