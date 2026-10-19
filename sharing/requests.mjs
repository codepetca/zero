import contracts from '../extension/src/sharing/contracts.js';
import { digest, appendAttempt } from './registry.mjs';
import sourceDiagnostics from '../extension/src/sharing/source-diagnostics.js';

const hex = /^[a-f0-9]{64}$/;
/** Display labels can change on GitHub. Numeric ownership and all frozen source
 * inputs remain part of the match; source digests are included after retrieval. */
export function sameStableRequest(left,right,{includeSourceDigest=true}={}) {
  const stable=value=>({schema:value.schema,kind:value.kind,slug:value.slug,version:value.version,
    repository:{id:value.repository.id,ownerId:value.repository.ownerId},requester:{githubId:value.requester.githubId},
    commit:value.commit,folder:value.folder,descriptor:value.descriptor,policyRevision:value.policyRevision,
    ...(value.web?{web:value.web}:{}),
    ...(includeSourceDigest?{sourceDigest:value.sourceDigest}:{})});
  return digest(stable(left))===digest(stable(right));
}
export function freezeRequest({request, repositoryMetadata, sourceDigest, authenticatedActor}) {
  const validated = contracts.validateRequest(request);
  if (!authenticatedActor || authenticatedActor.githubId !== validated.requester.githubId || authenticatedActor.login !== validated.requester.login) throw new Error('Authenticated issue actor does not match the requester');
  const resolved = contracts.validateRepository(Object.fromEntries(['id','ownerId','owner','name','url'].map(key => [key, repositoryMetadata?.[key]])));
  if (!hex.test(sourceDigest)) throw new Error('Trusted source digest required');
  for (const field of ['id', 'ownerId', 'owner', 'name', 'url']) {
    if (resolved[field] !== validated.repository[field]) throw new Error('Repository metadata drift; prepare a new request');
  }
  if (repositoryMetadata.visibility !== 'public' || repositoryMetadata.ownerType !== 'User') throw new Error('A public personal repository is required');
  if (resolved.ownerId !== validated.requester.githubId) throw new Error('Only the verified repository owner may share');
  const frozen = {...validated, sourceDigest};
  return {id: digest(frozen), frozen};
}

export async function ingestRequest(registry, input, {resumeCancelled=false}={}) {
  if(typeof resumeCancelled!=='boolean')throw new Error('Invalid cancelled request recovery option');
  if (!/^[1-9][0-9]*$/.test(String(input.issueId))) throw new Error('Positive issue ID required');
  const {id, frozen} = freezeRequest(input);
  const result = await registry.update(state => {
    let record = state.requests[id]||Object.values(state.requests).find(value=>sameStableRequest(value.frozen,frozen));
    if (!record) record = state.requests[id] = {id, frozen, issueIds: [], status: 'queued', attempts: [], attemptCount: 0, releaseKey: null};
    // Only trusted intake that has observed an open owner-authored issue may
    // resume cancellation. Duplicates alone never reset failed/paused/accepted work.
    if(resumeCancelled && !record.releaseKey && record.status==='cancelled')record.status='queued';
    const issueId = String(input.issueId);
    if (!record.issueIds.includes(issueId)) record.issueIds.push(issueId);
    return structuredClone(record);
  });
  return result.value;
}

export async function cancelRequest(registry, requestId) {
  return (await registry.update(state => {
    const record = state.requests[requestId];
    if (!record) throw new Error('Unknown request');
    if (record.releaseKey) throw new Error('Accepted versions require an availability event; they cannot be cancelled');
    record.status = 'cancelled';
    return structuredClone(record);
  })).value;
}

export async function reportAttempt(registry, requestId, {kind, message, diagnostics = [], sourceDiagnostic, maxInfrastructureRetries = 3}) {
  if (!['source-failure', 'infrastructure-failure'].includes(kind)) throw new Error('Unknown attempt outcome');
  if (typeof message !== 'string' || message.length > 2000 || !Array.isArray(diagnostics) || diagnostics.length > 64) throw new Error('Attempt report exceeds limits');
  if (Buffer.byteLength(JSON.stringify(diagnostics)) > 16384) throw new Error('Diagnostics exceed limits');
  if(kind!=='source-failure'&&diagnostics.length)throw new Error('Only source failures may carry source locations');
  const locations=diagnostics.map(diagnostic=>{
    if(!diagnostic||typeof diagnostic!=='object'||Array.isArray(diagnostic)||Object.keys(diagnostic).some(key=>!['file','line','message'].includes(key)))throw new Error('Invalid source location');
    if(diagnostic.file!==undefined)contracts.validateFolder(diagnostic.file);
    if(diagnostic.line!==undefined&&(!Number.isInteger(diagnostic.line)||diagnostic.line<1||diagnostic.line>1000000))throw new Error('Invalid source location');
    return {...(diagnostic.file!==undefined?{file:diagnostic.file}:{}),...(diagnostic.line!==undefined?{line:diagnostic.line}:{}),message:'Source check failed at this location'};
  });
  if(sourceDiagnostic!==undefined&&kind!=='source-failure')throw new Error('Only source failures may carry a public source correction');
  const correction=sourceDiagnostic===undefined?undefined:sourceDiagnostics.validateSourceDiagnostic(sourceDiagnostic);
  return (await registry.update(state => {
    const record = state.requests[requestId];
    if (!record) throw new Error('Unknown request');
    if (!record.releaseKey && record.status !== 'cancelled') {
      // Typed public corrections carry trusted fixed wording. Keep candidate or
      // provider exception strings out of the public authoritative attempt.
      appendAttempt(record, {kind, message:kind==='source-failure'?'Source checks failed; use the recorded correction':'Platform unavailable; durable request retained', diagnostics:locations,...(correction?{sourceDiagnostic:correction}:{})});
      if (kind === 'infrastructure-failure') record.infrastructureFailures = (record.infrastructureFailures || 0) + 1;
      record.status = kind === 'source-failure' ? 'failed' : record.infrastructureFailures >= maxInfrastructureRetries ? 'paused' : 'queued';
    }
    return structuredClone(record);
  })).value;
}

export async function retryRequest(registry, requestId) {
  return (await registry.update(state => {
    const record = state.requests[requestId];
    if (!record || record.releaseKey || record.status !== 'paused') throw new Error('Only infrastructure-paused requests can be manually retried');
    record.infrastructureFailures = 0;
    record.status = 'queued';
    return structuredClone(record);
  })).value;
}

export async function pendingRequests(registry) {
  const {state} = await registry.read();
  return Object.values(state.requests).filter(record => record.status === 'queued' || record.status === 'delivery-pending');
}

/** Call with a trusted issue reader/source resolver; dropped event jobs have no
 * effect on this finite scan. Issue edits create another immutable fingerprint. */
export async function reconcileInbox(registry, issues, resolve) {
  const results = [];
  for (const issue of issues) {
    try { results.push({issueId: issue.id, request: await ingestRequest(registry, {issueId: issue.id, ...await resolve(issue)})}); }
    catch (error) { results.push({issueId: issue.id, error: error.message}); }
  }
  return results;
}
