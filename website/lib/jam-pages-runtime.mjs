import {createPrivateKey,sign} from 'node:crypto';
import {createJamPagesAccess} from './jam-pages-access.mjs';
import {createJamPagesAccessBinding} from './jam-pages-access-binding.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';

const unavailable = async () => Object.freeze({status:'unverified',reason:'unavailable'});
const validId = value => typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
function key(value) {
  if (typeof value !== 'string' || !value || value.length > 16384) throw new Error();
  const parsed = createPrivateKey(value);
  if (parsed.asymmetricKeyType !== 'rsa') throw new Error();
  return parsed;
}
/** Local preview only. Uses the existing Zero App; the observation token is
 * restricted to one repository and Pages/metadata read. No configuration,
 * provider call or token is created until a caller invokes the returned reader.
 * The app key retains all authority of that app regardless of token narrowing.
 */
export function createJamPagesRuntimeReader({env=process.env,fetchImpl=fetch,now=Date.now}={}) {
  try {
    if (!jamsPreviewAvailable(env) || env.ZERO_JAMS_ENABLED !== '1' || typeof fetchImpl !== 'function' || typeof now !== 'function') return unavailable;
    const appId = env.ZERO_JAMS_APP_ID;
    // Match the reviewed Codepet Zero App in extension/src/github-app/config.json.
    if (!validId(appId) || appId !== '5367740') return unavailable;
    const appKey = key(env.ZERO_JAMS_PRIVATE_KEY);
    const observe = createJamPagesAccess({transport:fetchImpl});
    const reader = createJamPagesAccessBinding({observe,appId:Number(appId),createAppJwt:async ({signal}) => {
      if (signal.aborted) throw new Error();
      const time = now();
      if (!Number.isSafeInteger(time) || time < 0) throw new Error();
      const header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
      const payload = Buffer.from(JSON.stringify({iat:Math.floor(time/1000)-60,exp:Math.floor(time/1000)+300,iss:appId})).toString('base64url');
      const data = `${header}.${payload}`;
      const signature = sign('RSA-SHA256',Buffer.from(data),appKey).toString('base64url');
      if (signal.aborted) throw new Error();
      return `${data}.${signature}`;
    }});
    // Recheck preview authority before and after the full slow observation.
    return async (...args) => {
      if (!jamsPreviewAvailable(env) || env.ZERO_JAMS_ENABLED !== '1') return unavailable();
      const result = await reader(...args);
      return jamsPreviewAvailable(env) && env.ZERO_JAMS_ENABLED === '1' ? result : unavailable();
    };
  } catch {return unavailable;}
}
