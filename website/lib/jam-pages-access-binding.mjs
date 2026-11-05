import {performance} from 'node:perf_hooks';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const unverified = reason => Object.freeze({status:'unverified',reason});
const validId = x => {
  if (typeof x === 'string' && /^[1-9][0-9]{0,15}$/.test(x)) x = Number(x);
  return Number.isSafeInteger(x) && x > 0 ? x : null;
};
function parseRepository(value) {
  if (typeof value !== 'string' || value.length > 256) return null;
  const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})$/.exec(value);
  if (!match || ['.','..'].includes(match[2]) || match[2].toLowerCase().endsWith('.git')) return null;
  return {owner:match[1],repo:match[2]};
}
function validUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\%?#]/.test(value)) return false;
  try {const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.port && url.href === value;} catch {return false;}
}
function bounded(promise, signal) {
  return new Promise((resolve,reject) => {
    const cleanup = () => signal.removeEventListener('abort',abort);
    const abort = () => {cleanup(); reject(new Error());};
    Promise.resolve(promise).then(value => {cleanup(); if (signal.aborted) reject(new Error()); else resolve(value);},() => {cleanup(); reject(new Error());});
    if (signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
  });
}

/**
 * Isolated adapter for the Jam Pages binding contract. `observe` is the trusted
 * createJamPagesAccess reader; `createAppJwt` is trusted server-only code. No
 * default transport or credentials are supplied. Legacy records without both
 * stable IDs return unsupported; observation/credential failures are unavailable.
 * The observer establishes repository identity; an injected replacement must
 * provide the same guarantees. Callers must independently recheck Jam/reveal
 * authority after this slow operation. A Pages-specific historical success is
 * not proof of the currently served artifact, URL availability, commit/artifact
 * provenance, or custom-domain ownership. No provider acceptance is implied.
 * Admission and deadlines bound logical calls, not work that ignores abort.
 */
export function createJamPagesAccessBinding({observe,createAppJwt,appId,timeoutMs=8000,maxConcurrent=4} = {}) {
  const numericAppId = validId(appId);
  if (typeof observe !== 'function' || typeof createAppJwt !== 'function' || !numericAppId ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000 ||
      !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new TypeError('Invalid Pages binding configuration');
  let active = 0;
  return async function read(savedRepository, expectedPagesUrl, options = {}) {
    let controller, timer, onAbort, admitted = false, signal, timedOut = false;
    try {
      if (!object(savedRepository) || !object(options) || Object.keys(options).some(key => key !== 'signal')) return unverified('invalid');
      signal = options.signal;
      if (signal !== undefined && !(signal instanceof AbortSignal)) return unverified('invalid');
      if (signal?.aborted) return unverified('canceled');
      const parts = parseRepository(savedRepository.url);
      const repositoryId = validId(savedRepository.id), ownerId = validId(savedRepository.ownerId);
      if (!parts || !validUrl(expectedPagesUrl)) return unverified('invalid');
      if (!repositoryId || !ownerId) return unverified('unsupported');
      if (active >= maxConcurrent) return unverified('busy');
      active++; admitted = true;
      controller = new AbortController();
      onAbort = () => controller.abort();
      signal?.addEventListener('abort',onAbort,{once:true});
      const start = performance.now();
      timer = setTimeout(() => {timedOut = true; controller.abort();},timeoutMs);
      const check = () => {
        if (performance.now() - start >= timeoutMs) {timedOut = true; controller.abort();}
        if (signal?.aborted || controller.signal.aborted) throw new Error();
      };
      const jwt = await bounded(Promise.resolve().then(() => {check(); return createAppJwt({signal:controller.signal});}),controller.signal);
      check();
      if (typeof jwt !== 'string' || !jwt || jwt.length > 8192 || /[\s\x00-\x1f\x7f]/.test(jwt)) throw new Error();
      const observed = await bounded(Promise.resolve().then(() => {check(); return observe({
        ...parts,repositoryId,ownerId,appId:numericAppId,appJwt:jwt,expectedPagesUrl
      },{signal:controller.signal});}),controller.signal);
      check();
      if (!object(observed) || observed.status !== 'observed' || observed.htmlUrl !== expectedPagesUrl || observed.public !== true ||
          !(observed.pagesStatus === 'built' && observed.evidence === 'pages-built' ||
            observed.pagesStatus === null && observed.evidence === 'pages-deployment-succeed')) return unverified('unavailable');
      return Object.freeze({status:'verified',pagesUrl:expectedPagesUrl,repositoryId:String(repositoryId),ownerId:String(ownerId)});
    } catch {
      return unverified(signal?.aborted ? 'canceled' : timedOut ? 'timeout' : 'unavailable');
    } finally {
      clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort',onAbort); controller?.abort(); if (admitted) active--;
    }
  };
}
