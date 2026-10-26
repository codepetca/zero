import {createHash} from 'node:crypto';
import {ID,LIMITS,SHA,fail,validateState,validateSettlements} from './schema.mjs';
import {decodeGitHubBlob} from './github-source.mjs';
import {credential,githubRequest} from './github-transport.mjs';
import {JAM_REGISTRY_REPOSITORY,JAM_REGISTRY_BRANCH,JAM_PILOT_REGISTRY_BRANCH} from './github-store.mjs';

export const JAM_REGISTRY_PROTOCOL_MARKER='{"schema":2,"protocol":"zero-jams-atomic-git-v1","events":"zero-jams-v2/events","settlements":"zero-jams-v2/settlements.json"}\n';
const ROOT=`/repos/${JAM_REGISTRY_REPOSITORY}`;
const V2='zero-jams-v2',EVENTS=`${V2}/events`,SETTLEMENTS=`${V2}/settlements.json`;
const unavailable=()=>fail(503,'Official jam records are unavailable.');
const blobSha=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const bytesFor=value=>Buffer.from(JSON.stringify(value)+'\n');

/** Every authoritative read is pinned to one immutable commit. Only a
 * non-forced branch update publishes staged objects; event and fence changes
 * therefore share one compare-and-swap domain. Migration is explicitly invoked. */
export function createAtomicGitHubJamStore({token,fetchImpl=fetch,timeoutMs=8000,maxEvents=LIMITS.events,registryBranch=JAM_REGISTRY_BRANCH}={}) {
  credential(token);
  if(![JAM_REGISTRY_BRANCH,JAM_PILOT_REGISTRY_BRANCH].includes(registryBranch)||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>LIMITS.events)fail(503,'Invalid jam registry target or limit.');
  const ref=`refs/heads/${registryBranch}`;
  const request=(route,options={})=>githubRequest(ROOT+route,{token,fetchImpl,timeoutMs,maxBytes:3_000_000,...options});
  function validId(id){if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');}
  async function head(){
    const response=await request(`/git/ref/heads/${registryBranch}`,{maxBytes:16384});
    if(response.status!==200||response.data?.ref!==ref||response.data?.object?.type!=='commit'||!SHA.test(response.data?.object?.sha||''))fail(503,'The atomic jam registry requires operator setup.');
    return response.data.object.sha;
  }
  async function tree(sha){
    const response=await request(`/git/trees/${sha}`);
    const data=response.data;
    if(response.status!==200||data?.sha!==sha||data.truncated!==false||!Array.isArray(data.tree)||data.tree.length>4096)unavailable();
    const entries=new Map();
    for(const entry of data.tree){
      if(!entry||typeof entry.path!=='string'||!entry.path.length||entry.path.length>256||/[\/\\\0]/.test(entry.path)||['.','..'].includes(entry.path)||entries.has(entry.path)||!SHA.test(entry.sha||'')||!['blob','tree','commit'].includes(entry.type)||!({blob:['100644','100755','120000'],tree:['040000'],commit:['160000']}[entry.type]).includes(entry.mode)||entry.size!==undefined&&(!Number.isSafeInteger(entry.size)||entry.size<0))unavailable();
      entries.set(entry.path,{...entry});
    }
    return entries;
  }
  async function rootAt(revision){
    const response=await request(`/git/commits/${revision}`,{maxBytes:32768});
    if(response.status!==200||response.data?.sha!==revision||!SHA.test(response.data?.tree?.sha||''))unavailable();
    return {revision,treeSha:response.data.tree.sha,root:await tree(response.data.tree.sha)};
  }
  function regular(entry){if(!entry||entry.type!=='blob'||entry.mode!=='100644')unavailable();return entry;}
  async function blob(entry,maxBytes){
    regular(entry);
    if(entry.size!==undefined&&entry.size>maxBytes)unavailable();
    const response=await request(`/git/blobs/${entry.sha}`,{maxBytes:Math.ceil(maxBytes*1.4)+32768});
    if(response.status!==200||response.data?.sha!==entry.sha||entry.size!==undefined&&response.data?.size!==entry.size)unavailable();
    return decodeGitHubBlob({...response.data,type:'file'},maxBytes);
  }
  async function jsonBlob(entry,maxBytes){
    const bytes=await blob(entry,maxBytes);
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{unavailable();}
  }
  async function eventFiles(entry){
    if(!entry)return new Map();
    if(entry.type!=='tree'||entry.mode!=='040000')unavailable();
    const entries=await tree(entry.sha),files=new Map();
    if(entries.size>maxEvents)fail(503,'The jam registry listing is unavailable or at capacity.');
    for(const [name,value]of entries){
      const match=/^(jam-[1-9][0-9]{0,19})\.json$/.exec(name);
      if(!match)unavailable();
      files.set(match[1],regular(value));
    }
    return files;
  }
  async function atomicAt(revision){
    const base=await rootAt(revision);
    const marker=await blob(regular(base.root.get('jams')),1024);
    if(!marker.equals(Buffer.from(JAM_REGISTRY_PROTOCOL_MARKER)))fail(503,'The atomic jam registry requires operator setup.');
    const v2=base.root.get(V2);
    if(v2?.type!=='tree'||v2.mode!=='040000')unavailable();
    const entries=await tree(v2.sha);
    if([...entries.keys()].some(name=>!['events','settlements.json'].includes(name)))unavailable();
    const files=await eventFiles(entries.get('events'));
    const settlements=validateSettlements(await jsonBlob(regular(entries.get('settlements.json')),LIMITS.settlementBytes+1));
    return {...base,files,settlements};
  }
  async function snapshot(){
    const base=await atomicAt(await head());
    const ids=[...base.files.keys()].sort();
    return {revision:base.revision,ids,settlements:structuredClone(base.settlements),async read(id){
      validId(id);const entry=base.files.get(id);
      return {state:entry?validateState(await jsonBlob(entry,LIMITS.stateBytes+1),id,LIMITS,{enforceReserve:false}):null};
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
    if(await head()!==expectedRevision)return false;
    const base=await atomicAt(expectedRevision),changes=[];
    if(id!==null){
      if(!base.files.has(id)&&base.files.size>=maxEvents)fail(429,'The jam pilot is at event capacity.');
      changes.push([`${EVENTS}/${id}.json`,bytesFor(state)]);
    }
    if(ledger!==undefined)changes.push([SETTLEMENTS,bytesFor(ledger)]);
    return publish(base,changes,id===null?'ZeroJams close request':`ZeroJams ${id}`);
  }
  async function migrate(){
    for(let attempt=0;attempt<LIMITS.retries;attempt++){
      const base=await rootAt(await head()),legacy=base.root.get('jams');
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
    }
    fail(409,'The jam registry changed repeatedly. Retry migration after checking active writers.');
  }
  async function read(id){validId(id);const current=await snapshot();return {...await current.read(id),revision:current.revision};}
  async function list(){return (await snapshot()).ids;}
  return {read,list,snapshot,compareAndSwap,migrate};
}
