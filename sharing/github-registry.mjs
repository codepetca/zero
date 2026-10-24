import contracts from '../extension/src/sharing/contracts.js';
import { validateAdoption } from './adoption.mjs';
import sourceDiagnostics from '../extension/src/sharing/source-diagnostics.js';
import { createHash } from 'node:crypto';
import { canonical, digest, initialState } from './registry.mjs';

export const REGISTRY_REPOSITORY = 'codepetca/zero';
export const REGISTRY_BRANCH = 'zero-sharing-registry';
export const REGISTRY_PATH = 'registry/state.json';
export const REGISTRY_MAX_BYTES = 8388608;
const API = 'https://api.github.com';
const sha40 = /^[a-f0-9]{40}$/;

export function validateRegistryState(state) {
  const required = ['schema','sequence','items','requests','releases','availability','catalog','inbox'];
  if (!state || state.schema !== 1 || !Number.isSafeInteger(state.sequence) || state.sequence < 0 || Object.keys(state).some(key => ![...required,'libraryInbox'].includes(key)) || required.some(key => !Object.hasOwn(state,key))) throw new Error('Registry schema is invalid');
  if (Buffer.byteLength(canonical(state)) > REGISTRY_MAX_BYTES || Object.keys(state.requests).length > 50000 || Object.keys(state.releases).length > contracts.LIMITS.catalogReleases || !Array.isArray(state.availability)) throw new Error('Registry capacity exceeded');
  if(!state.inbox||Object.keys(state.inbox).some(key=>!['page','offset'].includes(key))||!Number.isInteger(state.inbox.page)||state.inbox.page<1||state.inbox.page>1000||!Number.isInteger(state.inbox.offset)||state.inbox.offset<0||state.inbox.offset>=100)throw new Error('Registry inbox cursor invalid');
  if(state.libraryInbox!==undefined&&(!state.libraryInbox||Object.keys(state.libraryInbox).some(key=>!['page','offset'].includes(key))||!Number.isInteger(state.libraryInbox.page)||state.libraryInbox.page<1||state.libraryInbox.page>1000||!Number.isInteger(state.libraryInbox.offset)||state.libraryInbox.offset<0||state.libraryInbox.offset>=100))throw new Error('Registry library inbox cursor invalid');
  for(const [id,item]of Object.entries(state.items)) {
    if(Object.keys(item).some(key=>!['kind','slug','repositoryId','contributorId','folder'].includes(key))||contracts.identity(item.kind,item.repositoryId,item.slug).id!==id||! /^[1-9][0-9]*$/.test(item.contributorId)||item.folder!==(item.kind==='game'?'.':`libraries/${item.slug}`))throw new Error('Registry item binding invalid');
  }
  for (const [id, record] of Object.entries(state.requests)) {
    const {sourceDigest,...request} = record.frozen || {};
    contracts.validateRequest(request);
    if (!/^[a-f0-9]{64}$/.test(id) || record.id !== id || digest(record.frozen) !== id || !/^[a-f0-9]{64}$/.test(sourceDigest) || !Array.isArray(record.issueIds) || record.issueIds.some(value=>! /^[1-9][0-9]*$/.test(value)) || !Array.isArray(record.attempts) || record.attempts.length > 32) throw new Error('Frozen registry request is invalid');
    if (Object.keys(record).some(key => !['id','frozen','issueIds','status','attempts','attemptCount','releaseKey','infrastructureFailures'].includes(key))||!['queued','failed','cancelled','paused','delivery-pending','available'].includes(record.status)) throw new Error('Unsupported request ledger field');
    for (const attempt of record.attempts) {
      if (Object.keys(attempt).some(key => !['number','kind','message','diagnostics','sourceDiagnostic'].includes(key)) || Buffer.byteLength(JSON.stringify(attempt)) > 20000 || !['source-failure','infrastructure-failure','published'].includes(attempt.kind) || typeof attempt.message!=='string' || attempt.message.length>2000) throw new Error('Unsupported operational report');
      if(attempt.sourceDiagnostic!==undefined){if(attempt.kind!=='source-failure')throw new Error('Infrastructure reports cannot carry source corrections');sourceDiagnostics.validateSourceDiagnostic(attempt.sourceDiagnostic);}
      for(const diagnostic of attempt.diagnostics||[]) if(Object.keys(diagnostic).some(key=>!['file','line','message'].includes(key)))throw new Error('Unsupported diagnostic field');
    }
  }
  for(const event of state.availability)if(Object.keys(event).some(key=>!['sequence','key','status'].includes(key))||!state.releases[event.key]||!['available','withdrawn'].includes(event.status)||!Number.isSafeInteger(event.sequence))throw new Error('Availability event invalid');
  if(state.catalog && (Object.keys(state.catalog).some(key=>!['path','url','revision','sequence','sha256','size'].includes(key))||!/^catalog\/snapshots\/[a-f0-9]{64}\.json$/.test(state.catalog.path)||! /^[a-f0-9]{40}$/.test(state.catalog.revision)||!Number.isSafeInteger(state.catalog.sequence)))throw new Error('Catalog pointer invalid');
  for (const [key, value] of Object.entries(state.releases)) {
    contracts.validateRelease(value.release);
    if (key !== `${value.release.kind}/${value.release.id}/${value.release.version}` || !state.requests[value.requestId] || !['pending','ready'].includes(value.delivery) || !/^[a-f0-9]{64}$/.test(value.evidenceDigest)) throw new Error('Release ledger is invalid');
    if (Object.keys(value).some(field=>!['requestId','release','staged','delivery','evidenceDigest','stagingCleaned','adoption'].includes(field))) throw new Error('Unsupported release ledger field');
    if(value.adoption!==undefined){if(value.release.kind!=='game')throw new Error('Only game releases have adoption observations');validateAdoption(value.adoption);}
  }
  return structuredClone(state);
}

/** Contents API CAS uses the authoritative file blob SHA. Only this existing
 * dedicated branch/file is writable; it never creates a branch or force pushes. */
export function createGitHubRegistryAdapter({fetcher = fetch, token, repository = REGISTRY_REPOSITORY, branch = REGISTRY_BRANCH, timeoutMs = 15000, readOnly = false} = {}) {
  if (repository !== REGISTRY_REPOSITORY || branch !== REGISTRY_BRANCH) throw new Error('Unknown registry destination');
  if (!readOnly && (!token || typeof token !== 'string') || token && /[\r\n]/.test(token)) throw new Error('Explicit registry credential required');
  const observedSequences=new Map();
  async function request(route, {method='GET', body}={}) {
    const headers = {accept:'application/vnd.github+json','x-github-api-version':'2026-03-10','user-agent':'zero-sharing',...(token?{authorization:`Bearer ${token}`}:{})};
    if (body) headers['content-type']='application/json';
    let response;
    try { response=await fetcher(API+route,{method,headers,body:body&&JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs)}); }
    catch { throw new Error('GitHub registry transport unavailable'); }
    if ([409,422].includes(response.status) && method==='PUT') return {conflict:true};
    if (response.status===404) throw new Error('Registry branch/state missing; explicit operator setup required');
    if (!response.ok) throw new Error(`GitHub registry operation failed (HTTP ${response.status})`);
    if(!/^application\/(?:json|vnd\.github\+json)\b/i.test(response.headers.get('content-type')||''))throw new Error('GitHub registry response type invalid');
    const reader=response.body?.getReader(); if (!reader) throw new Error('GitHub registry response missing');
    const chunks=[];let size=0;
    try { while(true){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>Math.ceil(REGISTRY_MAX_BYTES*1.4)+65536)throw new Error('GitHub registry response exceeds limits');chunks.push(Buffer.from(value.value));} }
    finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('GitHub registry returned invalid JSON'); }
  }
  const endpoint=`/repos/${REGISTRY_REPOSITORY}/contents/${REGISTRY_PATH}`;
  return {
    async read() {
      let resource=await request(endpoint+`?ref=${REGISTRY_BRANCH}`);
      if (!sha40.test(resource.sha || '') || resource.type!=='file' || resource.path!==REGISTRY_PATH || !Number.isSafeInteger(resource.size) || resource.size > REGISTRY_MAX_BYTES) throw new Error('GitHub registry state metadata invalid');
      const revision=resource.sha;
      const expectedSize=resource.size;
      if (resource.encoding==='none') resource=await request(`/repos/${REGISTRY_REPOSITORY}/git/blobs/${revision}`);
      if (resource.sha!==revision || resource.encoding!=='base64' || typeof resource.content!=='string') throw new Error('GitHub registry encoding invalid');
      const bytes=Buffer.from(resource.content.replace(/[\r\n]/g,''),'base64');
      if (bytes.length > REGISTRY_MAX_BYTES || bytes.length!==expectedSize || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==revision) throw new Error('Registry blob integrity failure');
      let state;try{state=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Registry JSON invalid');}
      const checked=validateRegistryState(state);
      observedSequences.set(revision,checked.sequence);
      if(observedSequences.size>32)observedSequences.delete(observedSequences.keys().next().value);
      return {state:checked,revision};
    },
    async compareAndSwap(expected, next) {
      if(readOnly)throw new Error('Read-only registry adapter cannot publish');
      if (!sha40.test(expected)) throw new Error('Exact registry blob revision required');
      const state=validateRegistryState(next);
      if(!observedSequences.has(expected)){const observed=await this.read();if(observed.revision!==expected)return false;}
      if(state.sequence!==observedSequences.get(expected)+1)throw new Error('Registry sequence must advance exactly once');
      const response=await request(endpoint,{method:'PUT',body:{message:`Zero registry sequence ${state.sequence}`,branch:REGISTRY_BRANCH,sha:expected,content:Buffer.from(canonical(state)+'\n').toString('base64')}});
      if (response.conflict) return false;
      if (!sha40.test(response.content?.sha||'')) throw new Error('GitHub did not confirm the registry write');
      return true;
    }
  };
}

export function registrySetupDocument() {
  return {repository:REGISTRY_REPOSITORY,branch:REGISTRY_BRANCH,path:REGISTRY_PATH,state:initialState(),permissions:['contents:read for intake','contents:write for separate publisher'],automaticCreation:false};
}
