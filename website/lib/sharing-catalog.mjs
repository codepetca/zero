import {createHash} from 'node:crypto';
import contracts from '../../extension/src/sharing/contracts.js';
import practice from '../../extension/src/sharing/tutorial-practice.js';

export const CATALOG_TIMEOUT_MS = 8000;
export const REGISTRY_BYTES = 8 * 1024 * 1024;
export const REGISTRY_URL = 'https://raw.githubusercontent.com/codepetca/zero/zero-sharing-registry/registry/state.json';
export function catalogConfiguration(env = process.env) {
  const catalogUrl = env.ZERO_SHARING_CATALOG_URL;
  const registryUrl = env.ZERO_SHARING_REGISTRY_URL;
  const artifactOrigin = env.ZERO_SHARING_ARTIFACT_ORIGIN;
  if ((!catalogUrl && !registryUrl) || (catalogUrl && registryUrl) || !artifactOrigin)
    throw new Error('Configure exactly one sharing catalog source and its artifact origin.');
  const origin = new URL(artifactOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== artifactOrigin || origin.username || origin.password)
    throw new Error('The sharing artifact origin must be a fixed HTTPS origin.');
  if (registryUrl && registryUrl !== REGISTRY_URL) throw new Error('Use the canonical Zero sharing registry URL.');
  if (catalogUrl) {
    const url = new URL(catalogUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      throw new Error('The sharing catalog configuration must use a fixed HTTPS URL.');
    return {catalogUrl: url.href, registryUrl: undefined, artifactOrigin};
  }
  return {catalogUrl: undefined, registryUrl, artifactOrigin};
}

function catalogPointer(state, artifactOrigin) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schema !== 1 ||
      !Number.isSafeInteger(state.sequence) || state.sequence < 0)
    throw new Error('The sharing registry state is invalid.');
  const pointer = state.catalog;
  if (!pointer) throw new Error('The sharing catalog has not been initialized.');
  const allowed = ['path', 'url', 'revision', 'sequence', 'size', 'sha256'];
  if (typeof pointer !== 'object' || Array.isArray(pointer) || Object.keys(pointer).some(key => !allowed.includes(key)) ||
      typeof pointer.path !== 'string' || !/^catalog\/snapshots\/[a-f0-9]{64}\.json$/.test(pointer.path) ||
      pointer.url !== `${artifactOrigin}/${pointer.path}` || !/^[a-f0-9]{40}$/.test(pointer.revision) ||
      !Number.isSafeInteger(pointer.sequence) || pointer.sequence < 0 || pointer.sequence > state.sequence)
    throw new Error('The sharing catalog pointer is invalid.');
  const sha256 = pointer.path.slice('catalog/snapshots/'.length, -'.json'.length);
  if (pointer.sha256 !== undefined && pointer.sha256 !== sha256 || pointer.size !== undefined &&
      (!Number.isSafeInteger(pointer.size) || pointer.size < 1 || pointer.size > contracts.LIMITS.catalogBytes))
    throw new Error('The sharing catalog pointer integrity is invalid.');
  return {...pointer, sha256};
}

async function fetchBytes(url, maximum, fetchImpl, signal) {
  signal.throwIfAborted();
  const response = await fetchImpl(url, {redirect: 'error', cache: 'no-store', signal, headers: {Accept: 'application/json'}});
  if (!response.ok || response.redirected || response.url && response.url !== url) throw new Error('The sharing catalog source could not be retrieved.');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new Error('The sharing catalog source exceeds its size limit.');
  if (!response.body) throw new Error('The sharing catalog source has no content.');
  const reader = response.body.getReader();
  try {
    const chunks = []; let size = 0;
    while (true) {
      signal.throwIfAborted();
      const {value, done} = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('The sharing catalog source exceeds its size limit.');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    return bytes;
  } finally {
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}
function parse(bytes) {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}

/** @param {{env?: Record<string, string | undefined>, fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number}} [options] */
export async function readCatalog({env = process.env, fetchImpl = fetch, signal, timeoutMs = CATALOG_TIMEOUT_MS} = {}) {
  const {catalogUrl, registryUrl, artifactOrigin} = catalogConfiguration(env);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    let pointer;
    if (registryUrl) pointer = catalogPointer(parse(await fetchBytes(registryUrl, REGISTRY_BYTES, fetchImpl, controller.signal)), artifactOrigin);
    const bytes = await fetchBytes(pointer ? pointer.url : catalogUrl, contracts.LIMITS.catalogBytes, fetchImpl, controller.signal);
    if (pointer && (createHash('sha256').update(bytes).digest('hex') !== pointer.sha256 ||
        pointer.size !== undefined && bytes.byteLength !== pointer.size)) throw new Error('The sharing catalog snapshot integrity check failed.');
    const catalog = contracts.validateCatalog(parse(bytes), {artifactOrigin});
    if (pointer && catalog.revision !== pointer.revision) throw new Error('The sharing catalog snapshot revision does not match its registry pointer.');
    return catalog;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

/** Fixed public origin only; caller supplies the shared deadline signal. */
export async function readPublicRegistry({fetchImpl = fetch, signal = AbortSignal.timeout(CATALOG_TIMEOUT_MS)} = {}) {
  const state = parse(await fetchBytes(REGISTRY_URL, REGISTRY_BYTES, fetchImpl, signal));
  if (!state || state.schema !== 1 || !Number.isSafeInteger(state.sequence) || state.sequence < 0 ||
      !state.requests || Array.isArray(state.requests) || typeof state.requests !== 'object' ||
      !state.releases || Array.isArray(state.releases) || typeof state.releases !== 'object' ||
      !Array.isArray(state.availability)) throw new Error('Invalid public registry.');
  return state;
}
export async function readRegistryCatalog(state, {artifactOrigin, fetchImpl = fetch, signal = AbortSignal.timeout(CATALOG_TIMEOUT_MS)}) {
  const pointer = catalogPointer(state, artifactOrigin);
  const bytes = await fetchBytes(pointer.url, contracts.LIMITS.catalogBytes, fetchImpl, signal);
  if (createHash('sha256').update(bytes).digest('hex') !== pointer.sha256 ||
      pointer.size !== undefined && bytes.byteLength !== pointer.size) throw new Error('Invalid catalog integrity.');
  const catalog = contracts.validateCatalog(parse(bytes), {artifactOrigin});
  if (catalog.revision !== pointer.revision) throw new Error('Invalid catalog revision.');
  return catalog;
}

/** Legacy readers reject unknown release keys. Strip only the optional web receipt
 * after validating the full trusted snapshot; never expose registry state. */
export function legacyCatalog(catalog) {
  const checked=contracts.validateCatalog(catalog);
  return {...checked,releases:checked.releases.filter(release=>!practice.isTutorialPractice(release)).map(release=>{const {web,...legacy}=release;return legacy;})};
}
/** Both catalog APIs use the same bounded reader and canonical schema.
 * @param {Request} request
 * @param {{includeWeb?: boolean, practiceOnly?: boolean, reader?: typeof readCatalog}} [options]
 */
export async function catalogResponse(request,{includeWeb=false,practiceOnly=false,reader=readCatalog}={}) {
  try {
    const catalog=contracts.validateCatalog(await reader({signal:request.signal}));
    const selected={...catalog,releases:catalog.releases.filter(release=>practice.isTutorialPractice(release)===practiceOnly)};
    return Response.json(practiceOnly||includeWeb?selected:legacyCatalog(selected),{headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({error:'ZeroHub is unavailable. Try again shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
