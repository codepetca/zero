import {performance} from 'node:perf_hooks';
import {createJamDestinationBindingReader} from './jam-destination-binding.mjs';

const MAX_BYTES = 65_536, MAX_CHUNKS = 1024;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?![\s\S])/;
const REPO = /^[A-Za-z0-9._-]{1,100}(?![\s\S])/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unverified = reason => Object.freeze({status:'unverified', reason});
const internalReasons = new WeakMap();
const failure = reason => {
  const error = new Error('Pages destination is unverified.');
  internalReasons.set(error,reason);
  return error;
};
function id(value) {
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value))) return value;
  throw failure('invalid');
}
function repository(value) {
  if (typeof value !== 'string' || value.length > 256) throw failure('invalid');
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(value);
  if (!match || match[0] !== value || !OWNER.test(match[1]) || !REPO.test(match[2]) ||
      ['.','..'].includes(match[2]) || match[2].endsWith('.git')) throw failure('invalid');
  return {owner:match[1], repo:match[2]};
}
function pagesUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\%?#]/.test(value)) throw failure('invalid');
  let url;
  try {url = new URL(value);} catch {throw failure('invalid');}
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port ||
      url.search || url.hash || url.href !== value) throw failure('invalid');
  return value;
}
function providerPagesUrl(value) {
  // GitHub can omit the slash for a custom-domain root. Admit only that
  // representational difference; the same strict parser still rejects unsafe
  // credentials, query/fragment, explicit ports and noncanonical spellings.
  return pagesUrl(typeof value==='string'&&/^https:\/\/[^/]+$/.test(value)?value+'/':value);
}
function discard(body) {
  try {void Promise.resolve(body?.cancel()).catch(() => {});} catch { /* Advisory only. */ }
}
function bounded(promise, signal, late = () => {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {cleanup(); reject(failure('unavailable'));};
    Promise.resolve(promise).then(value => {
      cleanup();
      if (signal.aborted) {late(value); reject(failure('unavailable'));}
      else resolve(value);
    }, () => {cleanup(); reject(failure('unavailable'));});
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once:true});
  });
}
async function metadata(response, url, signal, check) {
  let reader;
  const cancel = () => {
    try {void Promise.resolve(reader?.cancel()).catch(() => {});} catch { /* Advisory only. */ }
  };
  try {
    check();
    if (!response || response.redirected || response.url && response.url !== url) throw failure('unavailable');
    if (response.status === 404) throw failure('not-found');
    if (response.status === 429 || response.status === 403 &&
        (response.headers?.get('x-ratelimit-remaining') === '0' || response.headers?.get('retry-after') !== null &&
          response.headers?.get('retry-after') !== undefined)) throw failure('rate-limited');
    if (response.status !== 200) throw failure('unavailable');
    if (!/^application\/(?:json|vnd\.github\+json)(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw failure('invalid');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^[0-9]{1,6}$/.test(length) || Number(length) > MAX_BYTES)) throw failure('invalid');
    reader = response.body?.getReader();
    if (!reader) throw failure('invalid');
    signal.addEventListener('abort', cancel, {once:true});
    check();
    const chunks = []; let bytes = 0;
    while (true) {
      const {done,value} = await bounded(Promise.resolve().then(() => reader.read()), signal);
      check();
      if (done) break;
      if (!(value instanceof Uint8Array) || !value.byteLength || chunks.length >= MAX_CHUNKS) throw failure('invalid');
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw failure('invalid');
      chunks.push(value);
    }
    let result;
    try {result = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes)));}
    catch {throw failure('invalid');}
    check();
    if (!object(result)) throw failure('invalid');
    return result;
  } finally {
    signal.removeEventListener('abort',cancel);
    if (reader) {
      cancel();
      try {reader.releaseLock();} catch { /* An injected canceled reader can remain pending. */ }
    } else discard(response?.body);
  }
}

/** Server-only, fresh observation of a public repository's Pages metadata.
 *
 * read({url,id,ownerId?}, expectedPagesUrl, {signal}?) returns a frozen verified
 * receipt or an unverified reason. Reasons are server-private operational data;
 * never expose provider bodies or treat any unverified reason as permission.
 * `not-found` means metadata could not be observed, NOT that no public site exists.
 * Busy/rate-limited/unavailable/timeout should retain caller retry/error handling.
 *
 * The trusted injected transport makes only a fixed /repos/{owner}/{repo}/pages
 * GET here. The default source reader makes two fresh public-repository GETs,
 * one on either side of successful Pages metadata. The expected URL is never
 * fetched. No environment, credentials, cookies, retries, queue, or result cache
 * are used. A reviewed independent read transport can add its own credential;
 * participant/writer credentials and anonymous fallback must not be supplied.
 *
 * This observes matching saved numeric repository ID, stable numeric owner ID,
 * matching html_url (allowing an omitted root slash), public:true and
 * status:'built'. It does not prove artifact or
 * commit provenance, atomic destination ownership or secrecy. An A→B→A source
 * change between observations is undetectable, and changes after the last read
 * remain possible. Callers MUST recheck Jam/global hold authority after slow
 * work before disclosing or redirecting to the receipt. Real provider response
 * shape, authenticated Pages capability, quota and fleet capacity require their
 * own acceptance; synthetic success here does not establish provider acceptance.
 * Admission and total deadline bound logical callers in this instance only,
 * not fleet quota or underlying work from a transport that ignores abort.
 */
export function createJamPagesBindingReader(options = {}) {
  if (!object(options) || Object.keys(options).some(key =>
    !['fetchImpl','readDestinationBinding','timeoutMs','maxConcurrent'].includes(key))) throw failure('invalid');
  const {fetchImpl=fetch,timeoutMs=6000,maxConcurrent=4} = options;
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000 ||
      !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4 ||
      options.readDestinationBinding !== undefined && typeof options.readDestinationBinding !== 'function') throw failure('invalid');
  const readDestination = options.readDestinationBinding ?? createJamDestinationBindingReader({fetchImpl,timeoutMs,maxConcurrent});
  let active = 0;
  return async function read(savedRepository, expectedPagesUrl, callOptions = {}) {
    let controller, timer, abort, signal, admitted = false, timedOut = false;
    try {
      if (!object(callOptions) || Object.keys(callOptions).some(key => key !== 'signal')) throw failure('invalid');
      signal = callOptions.signal;
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw failure('invalid');
      if (signal?.aborted) return unverified('canceled');
      if (!object(savedRepository)) throw failure('invalid');
      // Capture primitives before the first await; caller mutation grants no authority.
      const url = savedRepository.url, repositoryId = id(savedRepository.id);
      const expectedOwnerId = savedRepository.ownerId === undefined ? undefined : id(savedRepository.ownerId);
      const parts = repository(url), expectedUrl = pagesUrl(expectedPagesUrl);
      if (active >= maxConcurrent) return unverified('busy');
      active++; admitted = true;
      controller = new AbortController();
      const start = performance.now();
      abort = () => controller.abort();
      timer = setTimeout(() => {timedOut = true; controller.abort();},timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      const check = () => {
        if (performance.now() - start >= timeoutMs) {timedOut = true; controller.abort();}
        if (signal?.aborted || controller.signal.aborted) throw failure('unavailable');
      };
      const observe = async () => {
        check();
        const current = await bounded(Promise.resolve().then(() => {check(); return readDestination(url,{signal:controller.signal});}),controller.signal);
        check();
        if (!object(current) || id(current.repositoryId) !== repositoryId ||
            expectedOwnerId !== undefined && id(current.ownerId) !== expectedOwnerId) throw failure('identity-mismatch');
        const currentParts = repository(current.repositoryUrl);
        if (currentParts.owner.toLowerCase() !== parts.owner.toLowerCase() ||
            currentParts.repo.toLowerCase() !== parts.repo.toLowerCase()) throw failure('identity-mismatch');
        return {repositoryId,ownerId:id(current.ownerId)};
      };
      const before = await observe();
      check();
      const apiUrl = `https://api.github.com/repos/${parts.owner}/${parts.repo}/pages`;
      const response = await bounded(Promise.resolve().then(() => {
        check();
        return fetchImpl(apiUrl,{method:'GET',credentials:'omit',redirect:'manual',cache:'no-store',referrerPolicy:'no-referrer',
          signal:controller.signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
            'User-Agent':'ZeroJams-PagesBinding'}});
      }),controller.signal,value => discard(value?.body));
      const site = await metadata(response,apiUrl,controller.signal,check);
      if (providerPagesUrl(site.html_url) !== expectedUrl || site.public !== true || site.status !== 'built') throw failure('invalid');
      const after = await observe();
      if (after.ownerId !== before.ownerId) throw failure('identity-mismatch');
      check();
      return Object.freeze({status:'verified',pagesUrl:expectedUrl,repositoryId,ownerId:after.ownerId});
    } catch (error) {
      if (signal?.aborted) return unverified('canceled');
      if (timedOut) return unverified('timeout');
      // Do not reflect arbitrary injected/provider errors, properties, bodies or abort reasons.
      const reason = internalReasons.get(error);
      return unverified(['not-found','rate-limited','identity-mismatch','invalid'].includes(reason) ? reason : 'unavailable');
    } finally {
      clearTimeout(timer);
      if (abort) signal?.removeEventListener('abort',abort);
      controller?.abort();
      if (admitted) active--;
    }
  };
}

export const readJamPagesBinding = createJamPagesBindingReader();
