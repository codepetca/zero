import {createHash} from 'node:crypto';
import {ID, LIMITS, SHA, fail, validateSettlements, validateState} from './schema.mjs';
import {decodeGitHubBlob} from './github-source.mjs';
import {JAM_REGISTRY_REPOSITORY, JAM_REGISTRY_BRANCH} from './github-store.mjs';
import {JAM_REGISTRY_PROTOCOL_MARKER} from './registry-protocol.mjs';
import {projectVisibility} from './project-visibility.mjs';

const ROOT=`https://api.github.com/repos/${JAM_REGISTRY_REPOSITORY}`;
const unavailable=()=>fail(503,'Project visibility is unavailable.');
const exactSha=value=>typeof value==='string'&&SHA.test(value);
const objectHash=(type,bytes)=>createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
const MAX_RESPONSE_BYTES=16_000_000, MAX_REQUESTS=LIMITS.events+8;
const MAX_CACHE_ENTRIES=4, MAX_CACHE_BYTES=4_000_000, MAX_ACTIVE_SNAPSHOTS=4, MAX_INFLIGHT_BUILDS=2;

/** Local-only authority reader; deliberately has no credentials or writes.
 * Each call independently reads the uncached official head before selecting an
 * immutable validated body by SHA. Cold/missing bodies are built completely and
 * every waiting call rechecks the head afterward. No final visibility decision
 * or separate negative lookup is cached; reveal time is evaluated on every call.
 * snapshot() is historical after issuance: never reuse it to authorize a later
 * public response. Caller mutations cannot reach the private serialized cache.
 *
 * The per-instance LRU holds at most four bodies / 4 MB of serialized UTF-8;
 * larger bodies are served uncached. At most four calls and two distinct builds
 * may be active; excess calls fail closed. Identical cold builds can be shared,
 * but head observations are never shared. These bounds cover retained cache and
 * accepted concurrent work, not exact JS heap overhead or caller-held snapshots.
 *
 * A warm one-event call uses one GET instead of nine. GitHub's unauthenticated
 * quota/secondary limits can still make it unavailable; this is not a production
 * capacity claim or a cache shared between instances. A write after a call's
 * final head observation remains a race. Each accepted call allows at most 108
 * GETs, 16 MB of JSON transfer and 15 seconds. Shared work retains its initiating
 * call's budget, and every waiter independently enforces its own deadline.
 * snapshot({signal}) and visibility(now,{signal}) also release an aborted
 * caller's admission and cancel its own head reads promptly. A shared immutable
 * build continues within its original bounds, even if its initiating caller
 * aborts; it cannot authorize or populate the cache without a remaining caller's
 * independent final head check.
 *
 * Trusted per-call composition may supply {fetchImpl,transportIdentity} to
 * snapshot() or visibility(). Both are required together; identity is a
 * lowercase SHA-256 digest of a stable, non-secret credential scope/version,
 * never the credential itself. The composing caller must change the identity
 * whenever transports must not share credential-bound work. Each caller's
 * own transport reads its fresh heads, including cache hits. Cold flights are
 * partitioned by revision and identity (the default transport is separate),
 * retain the initiating transport/deadline, and share the two-flight bound.
 * Validated immutable bodies remain keyed only by SHA, never by credentials.
 *
 * Trust boundary: HTTPS authenticates the fixed GitHub API host (and any
 * injected fetch implementation must be trusted). The branch-to-commit and
 * commit-to-root-tree bindings rely on truthful GitHub REST metadata. Raw Git
 * commit bytes are not obtained or hashed here; blob/tree hash checks do not
 * establish that full cryptographic chain against a compromised API. Secure
 * raw-commit verification remains an unimplemented production assurance gate.
 */
export function createProjectVisibilityReader(options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['registryBranch','fetchImpl','timeoutMs','totalTimeoutMs'].includes(key)))unavailable();
  const {registryBranch=JAM_REGISTRY_BRANCH,fetchImpl:defaultFetchImpl=fetch,timeoutMs=8000,totalTimeoutMs=15000}=options;
  if(![JAM_REGISTRY_BRANCH].includes(registryBranch)||typeof defaultFetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000||!Number.isSafeInteger(totalTimeoutMs)||totalTimeoutMs<1||totalTimeoutMs>15000)unavailable();
  const ref=`refs/heads/${registryBranch}`;
  const cache=new Map(),inflight=new Map();let cacheBytes=0,active=0;
  function remember(revision,body){
    const bytes=Buffer.byteLength(body);
    if(bytes>MAX_CACHE_BYTES||cache.has(revision))return;
    while(cache.size>=MAX_CACHE_ENTRIES||cacheBytes+bytes>MAX_CACHE_BYTES){
      const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).bytes;cache.delete(oldest);
    }
    cache.set(revision,{body,bytes});cacheBytes+=bytes;
  }
  function issue(revision,body){
    // Parsing anew isolates settlements and state objects from every other call
    // and from retained cache bytes. read() additionally isolates each result.
    const {settlements,records}=JSON.parse(body),states=new Map(records);
    return Object.freeze({revision,ids:Object.freeze([...states.keys()].sort()),settlements,async read(id){
      if(typeof id!=='string'||!ID.test(id))unavailable();
      return {state:states.has(id)?structuredClone(states.get(id)):null};
    }});
  }
  async function snapshot(callOptions={}) {
    if(!callOptions||typeof callOptions!=='object'||Array.isArray(callOptions)||Object.keys(callOptions).some(key=>!['signal','fetchImpl','transportIdentity'].includes(key)))unavailable();
    const {signal,fetchImpl:overrideFetchImpl,transportIdentity}=callOptions;
    const hasTransport=Object.hasOwn(callOptions,'fetchImpl'),hasIdentity=Object.hasOwn(callOptions,'transportIdentity');
    if(signal!==undefined&&!(signal instanceof AbortSignal)||hasTransport!==hasIdentity||hasTransport&&(typeof overrideFetchImpl!=='function'||typeof transportIdentity!=='string'||!/^[a-f0-9]{64}$/.test(transportIdentity)))unavailable();
    const fetchImpl=hasTransport?overrideFetchImpl:defaultFetchImpl;
    const checkSignal=()=>{if(signal?.aborted)unavailable();};
    checkSignal();
    if(active>=MAX_ACTIVE_SNAPSHOTS)unavailable();
    active++;
    const deadline=Date.now()+totalTimeoutMs;
    let requests=0,totalBytes=0;
    const checkDeadline=()=>{if(Date.now()>=deadline)unavailable();};
    const checkCaller=()=>{checkSignal();checkDeadline();};
    async function waitForBuild(pending){
      checkCaller();let timer,onAbort;
      try{
        // A slower initial head can make an earlier caller join a later build.
        // Bound this caller's wait without aborting work needed by other callers.
        return await Promise.race([pending,new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(Error('Snapshot timed out.')),deadline-Date.now());
          onAbort=()=>reject(Error('Snapshot aborted.'));
          signal?.addEventListener('abort',onAbort,{once:true});
        })]);
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
    }
    async function request(suffix,maxBytes,callerSignal) {
      let response,reader,timer;
      const controller=new AbortController();
      const onCallerAbort=()=>controller.abort();
      async function bounded(promise){
        let onAbort;
        try{return await Promise.race([promise,new Promise((_,reject)=>{
          onAbort=()=>reject(Error('Request timed out.'));
          if(controller.signal.aborted)onAbort();
          else controller.signal.addEventListener('abort',onAbort,{once:true});
        })]);}finally{controller.signal.removeEventListener('abort',onAbort);}
      }
      try {
        checkDeadline();if(++requests>MAX_REQUESTS)unavailable();
        if(callerSignal?.aborted)unavailable();
        callerSignal?.addEventListener('abort',onCallerAbort,{once:true});
        const url=ROOT+suffix;
        timer=setTimeout(()=>controller.abort(),Math.min(timeoutMs,deadline-Date.now()));
        response=await bounded(fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'ZeroJams-ProjectVisibility','Cache-Control':'no-cache'}}));
        checkDeadline();
        if(response.status!==200||response.redirected||response.url&&response.url!==url||!/^application\/(?:json|vnd\.github\+json)\b/i.test(response.headers.get('content-type')||''))unavailable();
        const declared=response.headers.get('content-length');
        if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes||Number(declared)>MAX_RESPONSE_BYTES-totalBytes))unavailable();
        reader=response.body?.getReader();if(!reader)unavailable();
        const chunks=[];let bytes=0;
        while(true){
          const {done,value}=await bounded(reader.read());checkDeadline();if(done)break;
          bytes+=value.byteLength;totalBytes+=value.byteLength;
          if(bytes>maxBytes||totalBytes>MAX_RESPONSE_BYTES)unavailable();
          chunks.push(Buffer.from(value));
        }
        return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
      } catch {unavailable();}
      finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort',onCallerAbort);
        controller.abort();
        // Do not await cancellation: a broken stream must not extend the bound.
        if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
        else void response?.body?.cancel().catch(()=>{});
      }
    }
    async function head() {
      const data=await request(`/git/ref/heads/${registryBranch}`,16384,signal);
      if(data?.ref!==ref||data.object?.type!=='commit'||!exactSha(data.object?.sha))unavailable();
      return data.object.sha;
    }
    async function tree(sha) {
      const data=await request(`/git/trees/${sha}`,3_000_000);
      if(data?.sha!==sha||data.truncated!==false||!Array.isArray(data.tree)||data.tree.length>4096)unavailable();
      const entries=new Map();
      for(const entry of data.tree){
        if(!entry||typeof entry.path!=='string'||!entry.path.length||Buffer.byteLength(entry.path)>256||/[\/\\\0]/.test(entry.path)||['.','..'].includes(entry.path)||entries.has(entry.path)||!exactSha(entry.sha)||!['blob','tree','commit'].includes(entry.type)||!({blob:['100644','100755','120000'],tree:['040000'],commit:['160000']}[entry.type]).includes(entry.mode)||entry.size!==undefined&&(!Number.isSafeInteger(entry.size)||entry.size<0))unavailable();
        entries.set(entry.path,{...entry});
      }
      // Hash the complete nonrecursive tree. This rejects omitted/extra entries
      // even when an upstream response incorrectly claims truncated:false.
      const sorted=[...entries.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.path+(a.type==='tree'?'/':'')),Buffer.from(b.path+(b.type==='tree'?'/':''))));
      const bytes=Buffer.concat(sorted.map(entry=>Buffer.concat([Buffer.from(`${entry.type==='tree'?'40000':entry.mode} ${entry.path}\0`),Buffer.from(entry.sha,'hex')])));
      if(objectHash('tree',bytes)!==sha)unavailable();
      return entries;
    }
    function regular(entry){if(!entry||entry.type!=='blob'||entry.mode!=='100644')unavailable();return entry;}
    async function blob(entry,maxBytes) {
      regular(entry);if(entry.size!==undefined&&entry.size>maxBytes)unavailable();
      const data=await request(`/git/blobs/${entry.sha}`,Math.ceil(maxBytes*1.4)+32768);
      if(data?.sha!==entry.sha||entry.size!==undefined&&data.size!==entry.size)unavailable();
      return decodeGitHubBlob({...data,type:'file'},maxBytes);
    }
    async function json(entry,maxBytes) {
      try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await blob(entry,maxBytes)));}catch{unavailable();}
    }
    async function build(revision){
      // This checks API identity only, not the hash of a raw Git commit.
      const commit=await request(`/git/commits/${revision}`,32768);
      if(commit?.sha!==revision||!exactSha(commit.tree?.sha))unavailable();
      const root=await tree(commit.tree.sha);
      if(!(await blob(root.get('jams'),1024)).equals(Buffer.from(JAM_REGISTRY_PROTOCOL_MARKER)))unavailable();
      const v2=root.get('zero-jams-v2');if(v2?.type!=='tree'||v2.mode!=='040000')unavailable();
      const layout=await tree(v2.sha);
      if([...layout.keys()].some(name=>!['events','settlements.json'].includes(name)))unavailable();
      const settlements=validateSettlements(await json(layout.get('settlements.json'),LIMITS.settlementBytes+1));
      const states=new Map(),events=layout.get('events');
      // Git cannot represent an empty directory; an absent events tree is the
      // valid empty registry, but a present malformed tree is never empty.
      if(events){
        if(events.type!=='tree'||events.mode!=='040000')unavailable();
        const files=await tree(events.sha);if(files.size>LIMITS.events)unavailable();
        for(const [name,entry]of files){
          if(!name.endsWith('.json'))unavailable();
          const id=name.slice(0,-5);if(!ID.test(id))unavailable();states.set(id,validateState(await json(entry,LIMITS.stateBytes+1),id,LIMITS,{enforceReserve:false}));
        }
      }
      checkDeadline();
      return JSON.stringify({settlements,records:[...states]});
    }
    try {
      const revision=await head();
      checkCaller();
      const hit=cache.get(revision);
      if(hit){cache.delete(revision);cache.set(revision,hit);const issued=issue(revision,hit.body);checkCaller();return issued;}
      // Identity partitions credential-bound work only. It is never included in
      // issued values, retained body-cache keys, diagnostics or failure text.
      const flightKey=revision+':'+(hasTransport?transportIdentity:'default');
      let pending=inflight.get(flightKey);
      if(!pending){
        if(inflight.size>=MAX_INFLIGHT_BUILDS)unavailable();
        pending=build(revision);inflight.set(flightKey,pending);
        // Identity guards prevent an older completion removing a newer build.
        void pending.finally(()=>{if(inflight.get(flightKey)===pending)inflight.delete(flightKey);}).catch(()=>{});
      }
      const body=await waitForBuild(pending);
      checkCaller();
      if(await head()!==revision)unavailable();
      checkCaller();
      remember(revision,body);
      const issued=issue(revision,body);checkCaller();return issued;
    } catch {unavailable();}
    finally{active--;}
  }
  return Object.freeze({snapshot,async visibility(now,callOptions={}){
    const result=await projectVisibility(await snapshot(callOptions),now);
    if(callOptions.signal?.aborted)unavailable();
    return result;
  }});
}
