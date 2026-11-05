import {createHash} from 'node:crypto';
import {ID,LIMITS,SHA,fail,validateState,validateSettlements} from './schema.mjs';
import {decodeGitHubBlob} from './github-source.mjs';
import {credential,githubRequest} from './github-transport.mjs';
import {JAM_REGISTRY_REPOSITORY,JAM_REGISTRY_BRANCH} from './github-store.mjs';

import {JAM_REGISTRY_PROTOCOL_MARKER} from './registry-protocol.mjs';
export {JAM_REGISTRY_PROTOCOL_MARKER} from './registry-protocol.mjs';
const ROOT=`/repos/${JAM_REGISTRY_REPOSITORY}`;
const V2='zero-jams-v2',EVENTS=`${V2}/events`,SETTLEMENTS=`${V2}/settlements.json`;
const unavailable=()=>fail(503,'Official jam records are unavailable.');
const blobSha=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const bytesFor=value=>Buffer.from(JSON.stringify(value)+'\n');
const checkReadSignal=signal=>{if(signal?.aborted)unavailable();};
function discardResponse(response){try{void Promise.resolve(response?.body?.cancel()).catch(()=>{});}catch{/* Advisory only. */}}
// Keep the rejection observed even when a noncooperative transport finishes
// after its caller has left. Never bind this lifetime to a shared store.
function waitForRead(signal,work,onLate){
  if(!signal)return Promise.resolve().then(work);
  return new Promise((resolve,reject)=>{
    let ended=false;
    const cleanup=()=>signal.removeEventListener('abort',abort);
    const abort=()=>{if(ended)return;ended=true;cleanup();try{checkReadSignal(signal);}catch(error){reject(error);}};
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    Promise.resolve().then(()=>{checkReadSignal(signal);return work();}).then(value=>{
      if(ended){onLate?.(value);return;}
      ended=true;cleanup();
      try{checkReadSignal(signal);resolve(value);}catch(error){onLate?.(value);reject(error);}
    },error=>{if(ended)return;ended=true;cleanup();reject(error);});
  });
}

/** Every authoritative read is pinned to one immutable commit. Only a
 * non-forced branch update publishes staged objects; event and fence changes
 * therefore share one compare-and-swap domain. Migration is explicitly invoked. */
export function createAtomicGitHubJamStore({token,fetchImpl=fetch,timeoutMs=8000,maxEvents=LIMITS.events,registryBranch=JAM_REGISTRY_BRANCH}={}) {
  credential(token);
  if(registryBranch!==JAM_REGISTRY_BRANCH||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>LIMITS.events)fail(503,'Invalid jam registry target or limit.');
  const ref=`refs/heads/${registryBranch}`;
  // Only bases validated and issued by this store may skip immutable rereads
  // during CAS. Every snapshot and CAS still checks the authoritative head.
  const issuedBases=new Map(),maxIssuedBases=16;
  const request=(route,options={})=>githubRequest(ROOT+route,{token,fetchImpl,timeoutMs,maxBytes:3_000_000,...options});
  function readRequest(route,options={},signal){
    if(!signal)return request(route,options);
    // githubRequest owns its per-call timeout. Combine it at the transport
    // boundary, and also bound body consumption if an injected stream ignores it.
    const callerFetch=(input,init={})=>{
      const combined=AbortSignal.any([signal,init.signal,input instanceof Request?input.signal:null].filter(Boolean));
      return waitForRead(combined,()=>fetchImpl(input,{...init,signal:combined}),discardResponse);
    };
    return waitForRead(signal,()=>request(route,{...options,fetchImpl:callerFetch}));
  }
  function validId(id){if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');}
  async function head(signal){
    const response=await readRequest(`/git/ref/heads/${registryBranch}`,{maxBytes:16384},signal);
    if(response.status!==200||response.data?.ref!==ref||response.data?.object?.type!=='commit'||!SHA.test(response.data?.object?.sha||''))fail(503,'The atomic jam registry requires operator setup.');
    return response.data.object.sha;
  }
  async function tree(sha,signal){
    const response=await readRequest(`/git/trees/${sha}`,{},signal);
    const data=response.data;
    if(response.status!==200||data?.sha!==sha||data.truncated!==false||!Array.isArray(data.tree)||data.tree.length>4096)unavailable();
    const entries=new Map();
    for(const entry of data.tree){
      if(!entry||typeof entry.path!=='string'||!entry.path.length||entry.path.length>256||/[\/\\\0]/.test(entry.path)||['.','..'].includes(entry.path)||entries.has(entry.path)||!SHA.test(entry.sha||'')||!['blob','tree','commit'].includes(entry.type)||!({blob:['100644','100755','120000'],tree:['040000'],commit:['160000']}[entry.type]).includes(entry.mode)||entry.size!==undefined&&(!Number.isSafeInteger(entry.size)||entry.size<0))unavailable();
      entries.set(entry.path,{...entry});
    }
    return entries;
  }
  async function rootAt(revision,signal){
    const response=await readRequest(`/git/commits/${revision}`,{maxBytes:32768},signal);
    if(response.status!==200||response.data?.sha!==revision||!SHA.test(response.data?.tree?.sha||''))unavailable();
    return {revision,treeSha:response.data.tree.sha,root:await tree(response.data.tree.sha,signal)};
  }
  function regular(entry){if(!entry||entry.type!=='blob'||entry.mode!=='100644')unavailable();return entry;}
  async function blob(entry,maxBytes,signal){
    regular(entry);
    if(entry.size!==undefined&&entry.size>maxBytes)unavailable();
    const response=await readRequest(`/git/blobs/${entry.sha}`,{maxBytes:Math.ceil(maxBytes*1.4)+32768},signal);
    if(response.status!==200||response.data?.sha!==entry.sha||entry.size!==undefined&&response.data?.size!==entry.size)unavailable();
    return decodeGitHubBlob({...response.data,type:'file'},maxBytes);
  }
  async function jsonBlob(entry,maxBytes,signal){
    const bytes=await blob(entry,maxBytes,signal);
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{unavailable();}
  }
  async function eventFiles(entry,signal){
    if(!entry)return new Map();
    if(entry.type!=='tree'||entry.mode!=='040000')unavailable();
    const entries=await tree(entry.sha,signal),files=new Map();
    if(entries.size>maxEvents)fail(503,'The jam registry listing is unavailable or at capacity.');
    for(const [name,value]of entries){
      const match=/^(jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32}))\.json$/.exec(name);
      if(!match)unavailable();
      files.set(match[1],regular(value));
    }
    return files;
  }
  async function atomicAt(revision,signal){
    const base=await rootAt(revision,signal);
    const marker=await blob(regular(base.root.get('jams')),1024,signal);
    if(!marker.equals(Buffer.from(JAM_REGISTRY_PROTOCOL_MARKER)))fail(503,'The atomic jam registry requires operator setup.');
    const v2=base.root.get(V2);
    if(v2?.type!=='tree'||v2.mode!=='040000')unavailable();
    const entries=await tree(v2.sha,signal);
    if([...entries.keys()].some(name=>!['events','settlements.json'].includes(name)))unavailable();
    const files=await eventFiles(entries.get('events'),signal);
    const settlements=validateSettlements(await jsonBlob(regular(entries.get('settlements.json')),LIMITS.settlementBytes+1,signal));
    return {...base,files,settlements};
  }
  async function snapshot({signal}={}){
    const base=await atomicAt(await head(signal),signal);
    checkReadSignal(signal);
    issuedBases.delete(base.revision);issuedBases.set(base.revision,{revision:base.revision,treeSha:base.treeSha,files:base.files});
    while(issuedBases.size>maxIssuedBases)issuedBases.delete(issuedBases.keys().next().value);
    const ids=[...base.files.keys()].sort();
    const reads=new Map();
    return {revision:base.revision,ids,settlements:structuredClone(base.settlements),async read(id,{signal}={}){
      checkReadSignal(signal);
      validId(id);
      const entry=base.files.get(id);if(!entry)return {state:null};
      let pending=reads.get(id);
      if(!pending){
        pending=jsonBlob(entry,LIMITS.stateBytes+1,signal).then(state=>validateState(state,id,LIMITS,{enforceReserve:false}));
        void pending.catch(()=>{});
        // Cancellable reads own their in-flight request. Only their completed
        // value may be reused by another reader of this pinned snapshot.
        if(!signal)reads.set(id,pending);
      }
      try{
        const state=await waitForRead(signal,()=>pending);checkReadSignal(signal);
        if(!reads.has(id))reads.set(id,Promise.resolve(state));
        return {state:structuredClone(state)};
      }
      catch(error){if(!signal?.aborted&&reads.get(id)===pending)reads.delete(id);throw error;}
    }};
  }
  async function stageBlob(bytes){
    const expected=blobSha(bytes);
    const response=await request('/git/blobs',{method:'POST',body:{content:bytes.toString('base64'),encoding:'base64'}});
    if(response.status!==201||response.data?.sha!==expected)unavailable();
    return expected;
  }
  async function publish(base,changes,message){
    const entries=[];
    for(const [path,bytes]of changes)entries.push({path,mode:'100644',type:'blob',sha:await stageBlob(bytes)});
    const treeResponse=await request('/git/trees',{method:'POST',body:{base_tree:base.treeSha,tree:entries}});
    const nextTree=treeResponse.data?.sha;
    if(treeResponse.status!==201||!SHA.test(nextTree||''))unavailable();
    const commit=await request('/git/commits',{method:'POST',body:{message,tree:nextTree,parents:[base.revision]}});
    const next=commit.data?.sha;
    if(commit.status!==201||!SHA.test(next||'')||commit.data?.tree?.sha!==nextTree||!Array.isArray(commit.data?.parents)||commit.data.parents.length!==1||commit.data.parents[0]?.sha!==base.revision)unavailable();
    const response=await request(`/git/refs/heads/${registryBranch}`,{method:'PATCH',body:{sha:next,force:false},maxBytes:16384});
    if([409,422].includes(response.status))return false;
    if(response.status!==200||response.data?.ref!==ref||response.data?.object?.type!=='commit'||response.data?.object?.sha!==next)fail(503,'Jam write result is unknown. Retry with the same operation ID.');
    return true;
  }
  async function compareAndSwap(id,expectedRevision,nextState,{settlements}={}){
    if(id!==null)validId(id);
    if(!SHA.test(expectedRevision||''))fail(400,'An exact registry revision is required.');
    if(id===null&&nextState!==null||id!==null&&nextState===null||id===null&&settlements===undefined)fail(400,'Invalid atomic jam update.');
    const state=id===null?null:validateState(nextState,id,LIMITS,{enforceReserve:false});
    const ledger=settlements===undefined?undefined:validateSettlements(settlements);
    if(await head()!==expectedRevision){issuedBases.delete(expectedRevision);return false;}
    const base=issuedBases.get(expectedRevision)||await atomicAt(expectedRevision),changes=[];
    if(id!==null){
      if(!base.files.has(id)&&base.files.size>=maxEvents)fail(429,'The jam pilot is at event capacity.');
      changes.push([`${EVENTS}/${id}.json`,bytesFor(state)]);
    }
    if(ledger!==undefined)changes.push([SETTLEMENTS,bytesFor(ledger)]);
    try{return await publish(base,changes,id===null?'ZeroJams close request':`ZeroJams ${id}`);}
    finally{issuedBases.delete(expectedRevision);}
  }
  async function migrate({expectedRevision}={}){
    if(expectedRevision!==undefined&&!SHA.test(expectedRevision))fail(400,'An exact planned registry revision is required.');
    for(let attempt=0;attempt<LIMITS.retries;attempt++){
      const revision=await head();
      if(expectedRevision!==undefined&&revision!==expectedRevision)fail(409,'The registry changed. Inspect a fresh migration plan before applying.');
      const base=await rootAt(revision),legacy=base.root.get('jams');
      if(legacy?.type==='blob'){
        const bytes=await blob(regular(legacy),1024);
        if(!bytes.equals(Buffer.from(JAM_REGISTRY_PROTOCOL_MARKER)))fail(503,'The jam registry protocol marker is invalid.');
        return snapshot();
      }
      if(base.root.has(V2))fail(503,'The jam registry migration requires operator inspection.');
      const files=await eventFiles(legacy),changes=[];
      for(const [id,entry]of files){
        const bytes=await blob(entry,LIMITS.stateBytes+1);
        let state;try{state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{unavailable();}
        validateState(state,id,LIMITS,{enforceReserve:false});
        changes.push([`${EVENTS}/${id}.json`,bytes]);
      }
      changes.push([SETTLEMENTS,bytesFor(validateSettlements({schema:1,operations:{}}))],['jams',Buffer.from(JAM_REGISTRY_PROTOCOL_MARKER)]);
      if(await publish(base,changes,'ZeroJams atomic registry migration'))return snapshot();
      if(expectedRevision!==undefined)fail(409,'The registry changed. Inspect a fresh migration plan before applying.');
    }
    fail(409,'The jam registry changed repeatedly. Retry migration after checking active writers.');
  }
  async function read(id,options){validId(id);const current=await snapshot(options);return {...await current.read(id,options),revision:current.revision};}
  async function list(options){return (await snapshot(options)).ids;}
  return {read,list,snapshot,compareAndSwap,migrate};
}
