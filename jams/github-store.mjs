import {createHash} from 'node:crypto';
import {ID, LIMITS, SHA, fail, validateState} from './schema.mjs';
import {decodeGitHubBlob} from './github-source.mjs';
import {credential, githubRequest} from './github-transport.mjs';

export const JAM_REGISTRY_REPOSITORY = 'codepetca/zero';
export const JAM_REGISTRY_BRANCH = 'zero-jams-registry';
export const JAM_PILOT_REGISTRY_BRANCH = 'zero-jams-pilot-registry';
const ROOT = `/repos/${JAM_REGISTRY_REPOSITORY}`;
export function createGitHubJamStore({token,fetchImpl=fetch,timeoutMs=8000,maxEvents=LIMITS.events,registryBranch=JAM_REGISTRY_BRANCH}={}) {
  if (![JAM_REGISTRY_BRANCH,JAM_PILOT_REGISTRY_BRANCH].includes(registryBranch)) fail(503,'Invalid jam registry target.');
  const branch=`?ref=${registryBranch}`;
  credential(token);
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > LIMITS.events) fail(503,'Invalid jam registry limit.');
  const request = (route,options={}) => githubRequest(ROOT+route,{token,fetchImpl,timeoutMs,maxBytes:3_000_000,...options});
  async function requireBranch() {
    const response = await request(`/branches/${registryBranch}`,{maxBytes:16384});
    if (response.status !== 200 || response.data?.name !== registryBranch || !SHA.test(response.data?.commit?.sha||'')) fail(503,'The jam registry requires operator setup.');
  }
  function validId(id) { if (!ID.test(id||'')) fail(400,'Invalid jam ID.'); }
  async function read(id) {
    validId(id);
    let response = await request(`/contents/jams/${id}.json${branch}`);
    if (response.status === 404) { await requireBranch(); return {state:null,revision:null}; }
    if (response.status !== 200 || response.data?.path !== `jams/${id}.json`) fail(503,'Official jam records are unavailable.');
    let resource = response.data;
    if (resource.encoding === 'none' && SHA.test(resource.sha||'')) {
      const blob = await request(`/git/blobs/${resource.sha}`);
      if (blob.status !== 200 || blob.data?.sha !== resource.sha || blob.data?.size !== resource.size) fail(503,'Official jam records are unavailable.');
      resource = {...blob.data,type:'file'};
    }
    const bytes = decodeGitHubBlob(resource,LIMITS.stateBytes+1);
    let state;try { state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }catch { fail(503,'Official jam records are unavailable.'); }
    // The storage adapter enforces physical/schema maxima. The service applies
    // its configured ordinary/safety reserve policy on every authoritative read.
    return {state:validateState(state,id,LIMITS,{enforceReserve:false}),revision:resource.sha};
  }
  async function list() {
    const response = await request(`/contents/jams${branch}`,{maxBytes:256000});
    if (response.status === 404) { await requireBranch(); return []; }
    if (response.status !== 200 || !Array.isArray(response.data) || response.data.length > maxEvents) fail(503,'The jam registry listing is unavailable or at capacity.');
    const ids=[];
    for (const item of response.data) {
      const match = /^(jam-[1-9][0-9]{0,19})\.json$/.exec(item?.name||'');
      if (!match || item.type !== 'file' || item.path !== `jams/${item.name}` || !SHA.test(item.sha||'')) fail(503,'The jam registry listing is invalid.');
      ids.push(match[1]);
    }
    if (new Set(ids).size !== ids.length) fail(503,'The jam registry listing is invalid.');
    return ids.sort();
  }
  async function compareAndSwap(id,expectedRevision,nextState) {
    validId(id);
    if (expectedRevision !== null && !SHA.test(expectedRevision||'')) fail(400,'An exact jam record revision is required.');
    const state = validateState(nextState,id,LIMITS,{enforceReserve:false});
    if (expectedRevision === null) { await requireBranch(); const ids=await list(); if(!ids.includes(id)&&ids.length>=maxEvents)fail(429,'The jam pilot is at event capacity.'); }
    const bytes=Buffer.from(JSON.stringify(state)+'\n');
    const response = await request(`/contents/jams/${id}.json`,{method:'PUT',body:{message:`ZeroJams ${id}`,branch:registryBranch,...(expectedRevision?{sha:expectedRevision}:{}),content:bytes.toString('base64')}});
    if ([409,422].includes(response.status)) return false;
    const expectedBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (response.status !== 200 && response.status !== 201 || response.data?.content?.sha !== expectedBlob) fail(503,'Jam write result is unknown. Retry with the same operation ID.');
    return true;
  }
  return {read,list,compareAndSwap};
}
