import {createHash} from 'node:crypto';
import contracts from '../../extension/src/sharing/contracts.js';
import sourceDiagnostics from '../../extension/src/sharing/source-diagnostics.js';
import {releaseLink} from './sharing-client.mjs';
import {CATALOG_TIMEOUT_MS, readPublicRegistry, readRegistryCatalog} from './sharing-catalog.mjs';

export function parseIssue(value) {
  if (typeof value !== 'string' || value.length > 150) throw new Error('Enter an official GitHub issue URL or a positive issue number.');
  const input = value.trim();
  const match = /^(?:https:\/\/github\.com\/codepetca\/zero\/issues\/|#)?([1-9][0-9]*)$/.exec(input);
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error('Enter an official GitHub issue URL or a positive issue number.');
  return match[1];
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const messages = {
  waiting:'This issue has no recorded result yet. It may be waiting for processing. Check again later; no release is confirmed.',
  queued:'This request is waiting for processing. Check again later.',
  retrying:'The publication service could not finish. Your source has not failed; the service will retry. Check again later.',
  'source-failure':'Source checks failed. Correct your source, upload the new commit and prepare another Share request.',
  'version-conflict':'This exact version was already accepted with different source. Choose a new version, upload its metadata and prepare another Share request.',
  paused:'Publication is paused after service failures. Your source has not failed. An operator must resume processing; check again later.',
  'library-closed':'Public library checking is not active. Local Check library does not publish a release. Keep your source and check again after activation.',
  cancelled:'This request was cancelled or its issue was closed. Prepare a new Share request if you still want to share.',
  'accepted-pending':'This exact version was accepted, but delivery or catalog publication is still pending. Check again later; do not change this accepted version.',
  available:'This exact release is available on ZeroHub.',
  withdrawn:'This accepted release has been withdrawn and is unavailable.'
};
function summary(record, state, artifactOrigin) {
  const {sourceDigest,...request} = record.frozen || {};
  const frozen = contracts.validateRequest(request);
  if (!/^[a-f0-9]{64}$/.test(sourceDigest) || !/^[a-f0-9]{64}$/.test(record.id) ||
      createHash('sha256').update(canonical(record.frozen)).digest('hex') !== record.id ||
      !['queued','failed','cancelled','paused','delivery-pending','available'].includes(record.status)) throw new Error('Invalid request binding.');
  const correction = sourceDiagnostics.publicCorrection(record);
  let status;
  if (record.releaseKey) {
    const origin = new URL(artifactOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== artifactOrigin || origin.username || origin.password) throw new Error('Invalid artifact origin.');
    const identity = contracts.identity(frozen.kind, frozen.repository.id, frozen.slug);
    const key = `${frozen.kind}/${identity.id}/${frozen.version}`;
    const accepted = state.releases[key];
    if (record.releaseKey !== key || !accepted || accepted.requestId !== record.id || !['pending','ready'].includes(accepted.delivery)) throw new Error('Invalid acceptance binding.');
    const release = contracts.validateRelease(accepted.release, {artifactOrigin});
    if (release.kind !== frozen.kind || release.id !== identity.id || release.version !== frozen.version ||
        release.source.commit !== frozen.commit || release.source.folder !== frozen.folder || release.source.sha256 !== sourceDigest ||
        release.repository.id !== frozen.repository.id || release.contributor.githubId !== frozen.requester.githubId ||
        release.policyRevision !== frozen.policyRevision || canonical(release.web??null) !== canonical(frozen.web??null)) throw new Error('Invalid accepted source.');
    status = 'accepted-pending';
  } else if (record.status === 'available' || record.status === 'delivery-pending') throw new Error('Missing acceptance.');
  else if (record.status === 'cancelled') status = 'cancelled';
  else if (record.status === 'failed') status = correction?.code === 'version-conflict' ? 'version-conflict' : 'source-failure';
  else if (frozen.kind === 'library') status = 'library-closed';
  else if (record.status === 'paused') status = 'paused';
  else status = record.infrastructureFailures > 0 ? 'retrying' : 'queued';
  return {requestId:record.id,status,kind:frozen.kind,version:frozen.version,commit:frozen.commit,message:messages[status],...(correction && !record.releaseKey ? {correction} : {})};
}
/** Only ledger-bound summaries leave this module; never operational attempts or frozen source metadata.
 * @param {string} issue
 * @param {{env?: Record<string,string|undefined>, fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export async function readRequestResults(issue, {env = process.env, fetchImpl = fetch, signal, timeoutMs = CATALOG_TIMEOUT_MS} = {}) {
  const number = parseIssue(issue);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once:true});
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    const state = await readPublicRegistry({fetchImpl,signal:controller.signal});
    const related = [];
    for (const [id,record] of Object.entries(state.requests)) {
      if (!record || !Array.isArray(record.issueIds)) throw new Error('Invalid issue binding.');
      if (!record.issueIds.includes(number)) continue;
      if (record.id !== id || record.issueIds.some(value=> typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))) throw new Error('Invalid issue binding.');
      related.push(record);
      if (related.length > 32) throw new Error('Too many related records.');
    }
    const results = related.map(record=>summary(record,state,env.ZERO_SHARING_ARTIFACT_ORIGIN));
    if (results.some(result=>result.status==='accepted-pending')) {
      // Snapshot availability is necessary before linking a release. A stale catalog stays pending.
      const catalog = state.catalog ? await readRegistryCatalog(state,{artifactOrigin:env.ZERO_SHARING_ARTIFACT_ORIGIN,fetchImpl,signal:controller.signal}) : null;
      for (let index=0; index<results.length; index++) {
        if (results[index].status !== 'accepted-pending') continue;
        const record = related[index], accepted = state.releases[record.releaseKey];
        if (accepted.delivery !== 'ready') continue;
        const release = catalog?.releases.find(value=>`${value.kind}/${value.id}/${value.version}`===record.releaseKey);
        if (!release || canonical({...release,status:accepted.release.status}) !== canonical(accepted.release)) continue;
        const event = [...state.availability].reverse().find(value=>value.key===record.releaseKey);
        const status = event?.status || 'available';
        if (!['available','withdrawn'].includes(status) || release.status !== status) continue;
        results[index] = {...results[index],status,message:messages[status],...(status==='available'?{releaseLink:releaseLink(release)}:{})};
      }
    }
    controller.signal.throwIfAborted();
    return {issue:number,results:results.sort((a,b)=>a.requestId.localeCompare(b.requestId)),message:results.length?'Each result belongs to a frozen source request on this issue. Results are not ordered by date.':messages.waiting};
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
