import {performance} from 'node:perf_hooks';

// Server-only prototype. The injected transport is trusted with both credentials:
// it must use TLS, respect redirect:'manual', never log requests, and honor abort.
// No ambient fetch, signing, retries, credential storage, or provider setup occurs.
// A narrowly scoped installation token does not constrain the app's private key
// or the app's other installation permissions.
const API = 'https://api.github.com';
const MAX_BYTES = 65536;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const numericId = x => Number.isSafeInteger(x) && x > 0;
const same = (a,b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const validOwner = x => typeof x === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(x);
const validRepo = x => typeof x === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(x) && !['.','..'].includes(x) && !x.toLowerCase().endsWith('.git');
const failed = () => Object.freeze({status:'unavailable'});
function validPagesUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\%?#]/.test(value)) return false;
  try {const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.port && url.href === value;} catch {return false;}
}

function matchesRepository(repo, expected) {
  return isObject(repo) && repo.id === expected.repositoryId && repo.private === false &&
    (repo.visibility === undefined || repo.visibility === 'public') && same(repo.name, expected.repo) &&
    same(repo.full_name, `${expected.owner}/${expected.repo}`) && isObject(repo.owner) &&
    repo.owner.id === expected.ownerId && same(repo.owner.login, expected.owner);
}
function exactPermissions(value) {
  return isObject(value) && Object.keys(value).length === 2 && value.pages === 'read' && value.metadata === 'read';
}
// The existing Zero App has broader installation permissions. Verify the
// necessary capability here, then demand an exact restricted token below.
function installationPermissions(value) {
  const allowed = {metadata:['read'],pages:['read','write'],contents:['read','write'],
    workflows:['read','write'],actions:['read','write'],repository_creation:['read','write'],
    starring:['read','write'],administration:['read','write']};
  return isObject(value) && ['read','write'].includes(value.pages) && value.metadata === 'read' &&
    Object.entries(value).every(([name,level]) => Object.hasOwn(allowed,name) && allowed[name].includes(level));
}
function raceAbort(promise, signal, late = () => {}) {
  return new Promise((resolve,reject) => {
    const abort = () => {cleanup(); reject(new Error());};
    const cleanup = () => signal.removeEventListener('abort',abort);
    Promise.resolve(promise).then(value => {cleanup(); if (signal.aborted) {late(value); reject(new Error());} else resolve(value);}, () => {cleanup(); reject(new Error());});
    if (signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
  });
}
function cancel(body) {try {void Promise.resolve(body?.cancel()).catch(() => {});} catch { /* best effort */ }}
async function json(response, url, status, signal, allowArray = false, allowNotFound = false) {
  let reader;
  try {
    if (response && allowNotFound && response.status === 404 && !response.redirected && (!response.url || response.url === url)) return null;
    if (!response || response.status !== status || response.redirected || response.url && response.url !== url ||
        !/^application\/(?:json|vnd\.github\+json)(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw new Error();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d{1,6}$/.test(length) || Number(length) > MAX_BYTES)) throw new Error();
    reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks = []; let size = 0;
    for (;;) {
      const part = await raceAbort(Promise.resolve().then(() => reader.read()),signal);
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || !part.value.length || chunks.length >= 1024 || (size += part.value.length) > MAX_BYTES) throw new Error();
      chunks.push(part.value);
    }
    const value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
    if (!(isObject(value) || allowArray && Array.isArray(value))) throw new Error();
    return value;
  } finally {
    if (reader) {try {void Promise.resolve(reader.cancel()).catch(() => {}); reader.releaseLock();} catch { /* best effort */ }}
    else cancel(response?.body);
  }
}

/**
 * Create an isolated Pages metadata reader. Inputs are previously saved, trusted
 * numeric repository and owner IDs plus their current names, app ID, and an app
 * JWT supplied by trusted server code. This is not an authorization decision.
 * Returns only selected Pages fields or a generic failure; no credential, raw
 * provider body, or transport error is returned. No anonymous Pages fallback.
 * For workflow sites with null metadata status, generic deployment SHAs
 * are only candidates; an authenticated Pages-specific status must say succeed.
 * Historical success does not establish the current served artifact, current URL
 * availability, commit/artifact provenance, or custom-domain ownership.
 * Identity reads cannot exclude A→B→A races or later repository transfer.
 * Operations are logically time/concurrency bounded; a transport ignoring abort
 * can continue in the background and must be controlled by the caller.
 */
export function createJamPagesAccess({transport, timeoutMs = 6000, maxConcurrent = 4} = {}) {
  if (typeof transport !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000 ||
      !Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new TypeError('Invalid Pages access configuration');
  let active = 0;
  return async function readPages(input, options = {}) {
    let controller, timer, externalAbort, admitted = false;
    try {
      if (!isObject(input) || !isObject(options) || Object.keys(options).some(k => k !== 'signal')) return failed();
      const {owner,repo,repositoryId,ownerId,appId,appJwt,expectedPagesUrl} = input;
      const expected = {owner,repo,repositoryId,ownerId};
      if (!validPagesUrl(expectedPagesUrl) || !validOwner(owner) || !validRepo(repo) || !numericId(repositoryId) || !numericId(ownerId) || !numericId(appId) ||
          typeof appJwt !== 'string' || appJwt.length < 1 || appJwt.length > 8192 || /[\s\x00-\x1f\x7f]/.test(appJwt) ||
          options.signal !== undefined && !(options.signal instanceof AbortSignal) || options.signal?.aborted || active >= maxConcurrent) return failed();
      active++; admitted = true;
      controller = new AbortController();
      externalAbort = () => controller.abort();
      options.signal?.addEventListener('abort',externalAbort,{once:true});
      const start = performance.now();
      timer = setTimeout(() => controller.abort(),timeoutMs);
      const check = () => {if (performance.now() - start >= timeoutMs) controller.abort(); if (controller.signal.aborted) throw new Error();};
      const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const request = async (url, method, token, body, status, allowArray = false, allowNotFound = false) => {
        check();
        const headers = {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ZeroJams-PagesAccess'};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body) headers['Content-Type'] = 'application/json';
        const response = await raceAbort(Promise.resolve().then(() => {check(); return transport(url,{method,headers,body:body && JSON.stringify(body),signal:controller.signal,redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});}),controller.signal, x => cancel(x?.body));
        const value = await json(response,url,status,controller.signal,allowArray,allowNotFound); check(); return value;
      };
      const installation = await request(`${base}/installation`,'GET',appJwt,null,200);
      if (!numericId(installation.id) || installation.app_id !== appId || installation.suspended_at !== null ||
          !isObject(installation.account) || installation.account.id !== ownerId || !same(installation.account.login,owner) ||
          !['User','Organization'].includes(installation.account.type) || installation.target_id !== ownerId ||
          installation.target_type !== installation.account.type || !isObject(installation.permissions) ||
          !installationPermissions(installation.permissions)) throw new Error();
      const grant = await request(`${API}/app/installations/${installation.id}/access_tokens`,'POST',appJwt,
        {repository_ids:[repositoryId],permissions:{pages:'read',metadata:'read'}},201);
      const expiry = typeof grant.expires_at === 'string' ? Date.parse(grant.expires_at) : NaN;
      const now = Date.now();
      if (typeof grant.token !== 'string' || !grant.token || grant.token.length > 8192 || /[\s\x00-\x1f\x7f]/.test(grant.token) ||
          !Number.isFinite(expiry) || expiry <= now || expiry > now + 61 * 60 * 1000 ||
          grant.repository_selection !== 'selected' || !Array.isArray(grant.repositories) || grant.repositories.length !== 1 ||
          !matchesRepository(grant.repositories[0],expected) || !exactPermissions(grant.permissions)) throw new Error();
      if (!matchesRepository(await request(base,'GET',grant.token,null,200),expected)) throw new Error();
      const pages = await request(`${base}/pages`,'GET',grant.token,null,200);
      const observedUrl = typeof pages.html_url === 'string' && /^https:\/\/[^/]+$/.test(pages.html_url) ? pages.html_url + '/' : pages.html_url;
      if (observedUrl !== expectedPagesUrl || typeof pages.public !== 'boolean' ||
          ![null,'built','building','errored'].includes(pages.status)) throw new Error();
      let deploymentSuccess = false;
      if (pages.status === null) {
        if (pages.build_type !== 'workflow') throw new Error();
        // Generic deployments are untrusted hints only. Never follow URLs
        // or inspect their status; Pages accepts a commit SHA as its lookup ID.
        const deployments = await request(`${base}/deployments?per_page=10&page=1`,'GET',grant.token,null,200,true);
        if (!Array.isArray(deployments) || deployments.length > 10) throw new Error();
        const candidates = [...new Set(deployments.filter(isObject).map(x => x.sha)
          .filter(x => typeof x === 'string' && /^[0-9a-f]{40}$/i.test(x)).map(x => x.toLowerCase()))];
        for (const sha of candidates) {
          const result = await request(`${base}/pages/deployments/${sha}`,'GET',grant.token,null,200,false,true);
          if (result?.status === 'succeed') {deploymentSuccess = true; break;}
        }
        if (!deploymentSuccess) throw new Error();
      } else if (pages.status !== 'built') throw new Error();
      if (!matchesRepository(await request(base,'GET',grant.token,null,200),expected)) throw new Error();
      check();
      return Object.freeze({status:'observed',htmlUrl:expectedPagesUrl,public:pages.public,pagesStatus:pages.status,
        evidence:deploymentSuccess ? 'pages-deployment-succeed' : 'pages-built'});
    } catch {return failed();}
    finally {clearTimeout(timer); if (externalAbort) options.signal?.removeEventListener('abort',externalAbort); controller?.abort(); if (admitted) active--;}
  };
}
