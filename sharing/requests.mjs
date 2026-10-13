import contracts from '../extension/src/sharing/contracts.js';
import { digest, appendAttempt } from './registry.mjs';

const hex = /^[a-f0-9]{64}$/;
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

export async function ingestRequest(registry, input) {
  if (!/^[1-9][0-9]*$/.test(String(input.issueId))) throw new Error('Positive issue ID required');
  const {id, frozen} = freezeRequest(input);
  const result = await registry.update(state => {
    let record = state.requests[id];
    if (!record) record = state.requests[id] = {id, frozen, issueIds: [], status: 'queued', attempts: [], attemptCount: 0, releaseKey: null};
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

export async function reportAttempt(registry, requestId, {kind, message, diagnostics = [], maxInfrastructureRetries = 3}) {
  if (!['source-failure', 'infrastructure-failure'].includes(kind)) throw new Error('Unknown attempt outcome');
  if (typeof message !== 'string' || message.length > 2000 || !Array.isArray(diagnostics) || diagnostics.length > 64) throw new Error('Attempt report exceeds limits');
  if (Buffer.byteLength(JSON.stringify(diagnostics)) > 16384) throw new Error('Diagnostics exceed limits');
  return (await registry.update(state => {
    const record = state.requests[requestId];
    if (!record) throw new Error('Unknown request');
    if (!record.releaseKey && record.status !== 'cancelled') {
      appendAttempt(record, {kind, message, diagnostics});
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
