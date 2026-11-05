import {performance} from 'node:perf_hooks';

const API = 'https://api.github.com/repos/';
const MAX_BYTES = 65_536;
const MAX_CHUNKS = 1024;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?![\s\S])/;
const REPOSITORY = /^[A-Za-z0-9._-]{1,100}(?![\s\S])/;
const unavailable = () => new Error('Project destination is unavailable.');
// Only this observer can mint the missing marker after checking the response's
// fixed effective URL and redirect state. A provider error/status alone is not proof.
class MissingDestination extends Error {
  constructor() { super('Project destination is unavailable.'); }
}
export const isMissingJamDestination = error => error instanceof MissingDestination;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const numericId = value => Number.isSafeInteger(value) && value > 0;
const repoName = value => typeof value === 'string' && REPOSITORY.test(value) &&
  value !== '.' && value !== '..' && !value.endsWith('.git');

// Parse the original string rather than a URL-normalized path: encodings, dot
// segments, userinfo, query/hash, trailing slashes and alternate hosts all reject.
function destination(value) {
  if (typeof value !== 'string' || value.length > 256) throw unavailable();
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(value);
  if (!match || match[0] !== value || !OWNER.test(match[1]) || !repoName(match[2])) throw unavailable();
  return {owner:match[1], repo:match[2]};
}
function discard(body) {
  try {void Promise.resolve(body?.cancel()).catch(() => {});} catch { /* Advisory only. */ }
}
// Observe late failures and discard late fetch responses even if a supplied
// transport ignores cancellation. Never return provider errors or abort reasons.
function bounded(promise, signal, late = () => {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {cleanup(); reject(unavailable());};
    Promise.resolve(promise).then(value => {
      cleanup();
      if (signal.aborted) {late(value); reject(unavailable());}
      else resolve(value);
    }, () => {cleanup(); reject(unavailable());});
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once:true});
  });
}
async function json(response, url, signal, check) {
  let reader;
  const cancel = () => {
    try {void Promise.resolve(reader?.cancel()).catch(() => {});} catch { /* Advisory only. */ }
  };
  try {
    check();
    if (!response || response.status !== 200 || response.redirected ||
        response.url && response.url !== url ||
        !/^application\/(?:json|vnd\.github\+json)(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw unavailable();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^[0-9]{1,6}$/.test(length) || Number(length) > MAX_BYTES)) throw unavailable();
    reader = response.body?.getReader();
    if (!reader) throw unavailable();
    signal.addEventListener('abort', cancel, {once:true});
    check();
    const chunks = []; let bytes = 0;
    while (true) {
      const {done, value} = await bounded(Promise.resolve().then(() => reader.read()), signal);
      check();
      if (done) break;
      if (!(value instanceof Uint8Array) || !value.byteLength || chunks.length >= MAX_CHUNKS) throw unavailable();
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw unavailable();
      chunks.push(value);
    }
    const result = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks, bytes)));
    check();
    if (!object(result)) throw unavailable();
    return result;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (reader) {
      cancel();
      try {reader.releaseLock();} catch { /* A canceled injected reader can remain pending. */ }
    } else discard(response?.body);
  }
}

/** Server-only current public GitHub repository destination observation.
 *
 * read(repositoryUrl, {signal}) makes exactly one fresh GET to the fixed GitHub
 * /repos/{owner}/{repo} endpoint. It returns a frozen {repositoryId, ownerId,
 * owner, repo, repositoryUrl} or throws a generic unavailable error. IDs are
 * decimal strings. Provider casing may canonicalize the same owner/repo; a
 * renamed/transferred path, redirect, private repository or uncertain response
 * rejects. Exact-endpoint nonredirected 404/410 rejects with a server-private
 * missing marker (isMissingJamDestination), allowing catalogs to omit only that
 * destination. This means not publicly available, not proof of deletion. Other
 * consumers continue to reject it like any unavailable destination. Namespace reuse returns the NEW ID: callers MUST compare it
 * with the stored ID and apply holds to both identities before exposing anything.
 * The returned identity is server-private; it is not a public error payload.
 *
 * fetchImpl is trusted server transport, not request input. This module reads no
 * environment or credentials and sends no authorization/cookies. A separately
 * reviewed transport may provide its own independent read credential; never
 * borrow participant/writer credentials or add anonymous fallback here.
 *
 * Each call has its own total deadline, cancellation and one request. There is
 * no result cache, retry or shared in-flight authorization. Admission uses a
 * finite FIFO wait queue; waiting shares the call's total deadline and abort.
 * maxConcurrent (1..4) limits logically admitted calls; maxPending (0..16)
 * limits pending waiters in this instance. A timed-out call releases its logical
 * permit even if an upstream fetch/body ignores abort and continues underneath.
 * These bounds do not establish physical transport concurrency or fleet quota.
 * Fresh observations cost one provider GET per candidate per check, including
 * warm calls; provider admission/capability and capacity remain caller concerns.
 * Callers must refresh Jam authority after slow work. A provider change after
 * this observation still races a link or name-based write; this is no atomic
 * identity guarantee and proves nothing about a Pages/custom-domain binding.
 */
export function createJamDestinationBindingReader(options = {}) {
  if (!object(options) || Object.keys(options).some(key => !['fetchImpl','timeoutMs','maxConcurrent','maxPending'].includes(key))) throw unavailable();
  const {fetchImpl = fetch, timeoutMs = 6000, maxConcurrent = 4, maxPending = 16} = options;
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000 ||
      !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4 ||
      !Number.isSafeInteger(maxPending) || maxPending < 0 || maxPending > 16) throw unavailable();
  let active = 0;
  const pending = [];
  const acquire = signal => {
    if (signal.aborted) return Promise.reject(unavailable());
    if (active < maxConcurrent) {active++; return Promise.resolve();}
    if (pending.length >= maxPending) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const abort = () => {
        const index = pending.indexOf(waiter);
        if (index !== -1) pending.splice(index, 1);
        signal.removeEventListener('abort', abort);
        reject(unavailable());
      };
      const waiter = () => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) {reject(unavailable()); return;}
        active++; resolve();
      };
      pending.push(waiter);
      signal.addEventListener('abort', abort, {once:true});
    });
  };
  const release = () => {
    active--;
    while (active < maxConcurrent && pending.length) pending.shift()();
  };
  return async function read(repositoryUrl, callOptions = {}) {
    try {
      if (!object(callOptions) || Object.keys(callOptions).some(key => key !== 'signal')) throw unavailable();
      const {signal} = callOptions;
      if (signal !== undefined && !(signal instanceof AbortSignal) || signal?.aborted) throw unavailable();
      const parts = destination(repositoryUrl);
      let admitted = false;
      const controller = new AbortController(), start = performance.now();
      const abort = () => controller.abort();
      const timer = setTimeout(abort, timeoutMs);
      signal?.addEventListener('abort', abort, {once:true});
      const check = () => {
        if (signal?.aborted || controller.signal.aborted || performance.now() - start >= timeoutMs) {
          controller.abort(); throw unavailable();
        }
      };
      try {
        await acquire(controller.signal);
        admitted = true;
        check();
        const url = `${API}${parts.owner}/${parts.repo}`;
        const response = await bounded(Promise.resolve().then(() => {
          check();
          return fetchImpl(url, {method:'GET', credentials:'omit', redirect:'manual', cache:'no-store',
            referrerPolicy:'no-referrer', signal:controller.signal,
            headers:{Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28',
              'User-Agent':'ZeroJams-DestinationBinding'}});
        }), controller.signal, value => discard(value?.body));
        check();
        if ([404,410].includes(response?.status) && response.redirected === false && response.url === url) {
          discard(response.body);
          throw new MissingDestination();
        }
        const repo = await json(response, url, controller.signal, check);
        if (!numericId(repo.id) || !object(repo.owner) || !numericId(repo.owner.id) ||
            !['User','Organization'].includes(repo.owner.type) || typeof repo.owner.login !== 'string' || !OWNER.test(repo.owner.login) ||
            !repoName(repo.name) || repo.private !== false || repo.visibility !== undefined && repo.visibility !== 'public' ||
            repo.owner.login.toLowerCase() !== parts.owner.toLowerCase() || repo.name.toLowerCase() !== parts.repo.toLowerCase() ||
            repo.full_name !== `${repo.owner.login}/${repo.name}` ||
            repo.html_url !== `https://github.com/${repo.full_name}`) throw unavailable();
        check();
        return Object.freeze({repositoryId:String(repo.id), ownerId:String(repo.owner.id), owner:repo.owner.login,
          repo:repo.name, repositoryUrl:repo.html_url});
      } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
        if (admitted) release();
      }
    } catch (error) {
      if (isMissingJamDestination(error)) throw error;
      throw unavailable();
    }
  };
}

export const readJamDestinationBinding = createJamDestinationBindingReader();
