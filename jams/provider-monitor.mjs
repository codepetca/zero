import {performance} from 'node:perf_hooks';
import {JamError} from './schema.mjs';

const processStates = new Map();
const SCOPES = new Set(['installation','setup','participant']);
const WRITES = new Set(['POST','PUT','PATCH','DELETE']);
const RESOURCES = new Set(['core','search','code_search','graphql','integration_manifest',
  'source_import','scim','dependency_snapshots','code_scanning_upload','actions_runner_registration']);
const MAX_WAIT = 4000;
const defaultSummary = value => console.info(JSON.stringify(value));

function unavailable(seconds = 1) {
  const error = new JamError(503,'GitHub is temporarily unavailable. Keep this request and retry with the same operation ID.');
  error.retryAfterSeconds = Math.max(1,Math.min(86400,Math.ceil(seconds)));
  return error;
}
function state(time) {
  return {since:time,inFlight:0,waiters:new Set(),nextWrite:0,circuitUntil:0,failures:0,
    quota:null,latestHasQuota:false,counters:{dispatched:0,reads:0,writes:0,failed:0,timeouts:0,blocked:0,
      responses:0,cancelled:0,statuses:{'2xx':0,'403':0,'409':0,'422':0,'429':0,'5xx':0,other:0}}};
}
function integer(value, maximum = 1_000_000_000) {
  if(typeof value !== 'string' || !/^\d{1,16}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}
function quotaHeaders(headers,time) {
  const limit=integer(headers.get('x-ratelimit-limit'));
  const remaining=integer(headers.get('x-ratelimit-remaining'));
  const used=integer(headers.get('x-ratelimit-used'));
  const reset=integer(headers.get('x-ratelimit-reset'),Number.MAX_SAFE_INTEGER/1000);
  const resource=headers.get('x-ratelimit-resource');
  if(!limit || remaining===null || remaining>limit || used!==null&&used>limit || reset===null ||
    reset*1000<time-3_600_000 || reset*1000>time+86_400_000 ||
    !RESOURCES.has(resource)) return null;
  return {limit,remaining,used,resetAt:reset*1000,resource,observedAt:time};
}
function retryTime(headers,time) {
  const raw=headers.get('retry-after');
  const seconds=integer(raw,604800);
  if(seconds!==null)return time+seconds*1000;
  if(typeof raw!=='string'||raw.length>64)return null;
  // Only HTTP-date syntax; Date.parse also accepts strings such as "1".
  if(!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(raw))return null;
  const date=Date.parse(raw);
  return Number.isFinite(date)&&date>=time&&date<=time+604800000?date:null;
}
function observe(target,response,time) {
  const headers=response.headers,quota=quotaHeaders(headers,time);
  target.latestHasQuota=false;
  if(quota) {
    const previous=target.quota;
    if(!previous||quota.resource===previous.resource&&quota.resetAt>previous.resetAt||previous.resource!=='core'&&quota.resource==='core') {
      target.quota=quota;target.latestHasQuota=true;
    } else if(quota.resource===previous.resource&&quota.resetAt===previous.resetAt&&quota.limit===previous.limit) {
      target.quota={...quota,remaining:Math.min(previous.remaining,quota.remaining),
        used:previous.used===null?quota.used:quota.used===null?previous.used:Math.max(previous.used,quota.used)};
      target.latestHasQuota=true;
    }
  }
  const status=response.status;
  target.counters.responses++;
  const category=[403,409,422,429].includes(status)?String(status):status>=500?'5xx':status>=200&&status<300?'2xx':'other';
  target.counters.statuses[category]++;
  const retryAt=retryTime(headers,time),zero=integer(headers.get('x-ratelimit-remaining'))===0;
  if(status===429||status===403&&(zero||retryAt!==null)) {
    const reset=quota?.remaining===0&&quota.resetAt>time?quota.resetAt:null;
    target.circuitUntil=Math.max(target.circuitUntil,time+1000,retryAt??0,reset??0,
      retryAt===null&&reset===null?time+60000:0);
    return true;
  }
  return false;
}
function failure(target,time) {
  target.counters.failed++;
  target.failures++;
  if(target.failures>=2)target.circuitUntil=Math.max(target.circuitUntil,time+15000);
}
function publicState(target,scope,time) {
  return {scope:scope==='participant-request'?'request':'process',since:target.since,counters:structuredClone(target.counters),
    inFlight:target.inFlight,queued:target.waiters.size,circuitUntil:target.circuitUntil||null,
    quota:{scope,...(target.quota??{limit:null,remaining:null,used:null,resetAt:null,resource:null,observedAt:null}),
      stale:!target.quota||!target.latestHasQuota||time-target.quota.observedAt>60000||time>=target.quota.resetAt}};
}
function routeLabel(route) {
  if(['list','read','proposals','actions','settlements','provider'].includes(route))return route;
  if(route==='/api/jams')return 'list';
  if(['/api/jams/proposals','/api/jams/settlements','/api/jams/provider'].includes(route))return route.split('/').at(-1);
  if(typeof route==='string'&&/^\/api\/jams\/jam-\d+(?:\/actions)?$/.test(route))return route.endsWith('/actions')?'actions':'read';
  return 'unknown';
}
function waitForChange(target,milliseconds,signal) {
  return new Promise((resolve,reject)=>{
    let timer;
    const clear=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);target.waiters.delete(done);};
    const done=()=>{clear();resolve();};
    const abort=()=>{clear();reject(unavailable());};
    target.waiters.add(done);
    signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(done,Math.max(1,Math.ceil(milliseconds)));
    if(signal.aborted)abort();
  });
}

function guardedResponse(response,signal,release,failed,completed,cancelled) {
  if(!response.body){completed();release();return response;}
  const reader=response.body.getReader();
  let ended=false,streamController;
  function finish(){if(ended)return;ended=true;signal.removeEventListener('abort',abort);release();}
  function abort(){if(ended)return;streamController.error(failed());void reader.cancel().catch(()=>{});finish();}
  signal.addEventListener('abort',abort,{once:true});
  const stream=new ReadableStream({
    start(controller){streamController=controller;},
    async pull(controller){
      try {
        const {done,value}=await reader.read();
        if(done){completed();controller.close();finish();}else controller.enqueue(value);
      }catch{controller.error(ended?unavailable():failed());finish();}
    },
    async cancel(reason){cancelled();try{await reader.cancel(reason);}finally{finish();}}
  },{highWaterMark:0});
  const result=new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
  Object.defineProperties(result,{url:{value:response.url},redirected:{value:response.redirected},type:{value:response.type}});
  if(signal.aborted)abort();
  return result;
}

/** Ephemeral, process-local mitigation. Provider quota observations may reflect
 * the installation; counters and circuit state never claim fleet-wide control. */
export function createJamProviderContext(config,{fetchImpl=fetch,now=Date.now,states=processStates,
  priority='ordinary',emit=defaultSummary,writeIntervalMs=1000,deadlineMs=18000}={}) {
  if(!/^[1-9][0-9]{0,19}$/.test(config?.appId||'')||!/^[1-9][0-9]{0,19}$/.test(config?.installationId||'')||
    !['ordinary','safety','recovery'].includes(priority)||!(states instanceof Map)||
    !Number.isSafeInteger(writeIntervalMs)||writeIntervalMs<0||writeIntervalMs>4000||
    !Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>120000)throw unavailable();
  // Deliberately capture only public IDs, never the caller's config or token.
  const key=`${config.appId}:${config.installationId}`;
  config=null;
  const started=now(),startedMonotonic=performance.now(),participant=state(started);
  const requestCalls=Object.fromEntries([...SCOPES].map(scope=>[scope,{reads:0,writes:0}]));
  if(!Number.isSafeInteger(started)||started<0)throw unavailable();
  let finished=false;
  function shared() {
    let result=states.get(key);
    if(!result) {
      if(states.size>=16) {
        const removable=[...states].find(([,entry])=>[entry.installation,entry.setup].every(value=>!value.inFlight&&!value.waiters.size));
        if(!removable)throw unavailable();
        states.delete(removable[0]);
      }
      result={installation:state(now()),setup:state(now())};states.set(key,result);
    }
    return result;
  }
  function clock() {const time=now();if(!Number.isSafeInteger(time)||time<0)throw unavailable();return time;}
  function gate(target,scope,write,time) {
    if(target.circuitUntil>time)throw unavailable((target.circuitUntil-time)/1000);
    const quota=target.quota;
    if(!quota||quota.resetAt<=time)return;
    const remaining=quota.remaining-target.inFlight;
    if(remaining<=0)throw unavailable((quota.resetAt-time)/1000);
    if(scope==='installation'&&write&&quota.resource==='core') {
      const reserve=priority==='ordinary'?Math.max(100,Math.ceil(quota.limit*0.1)):32;
      if(remaining<=reserve)throw unavailable((quota.resetAt-time)/1000);
    }
  }
  async function acquire(target,scope,write,signal) {
    const queuedAt=performance.now();
    try {
      while(true) {
        if(signal.aborted)throw unavailable();
        gate(target,scope,write,clock());
        const elapsed=performance.now()-queuedAt;
        const delay=scope==='installation'&&write?Math.max(0,target.nextWrite-performance.now()):0;
        if((scope!=='installation'||target.inFlight<4)&&delay<=0) {
          target.inFlight++;
          if(scope==='installation'&&write)target.nextWrite=performance.now()+writeIntervalMs;
          return;
        }
        if(elapsed>=MAX_WAIT)throw unavailable();
        await waitForChange(target,Math.min(MAX_WAIT-elapsed,delay||MAX_WAIT),signal);
      }
    } catch(error) {target.counters.blocked++;throw error;}
  }
  function wrapped(scope) {
    if(!SCOPES.has(scope))throw unavailable();
    return async (input,options={})=>{
      let url;
      try {url=new URL(input instanceof Request?input.url:input);}catch{throw unavailable();}
      if(url.origin!=='https://api.github.com'||url.username||url.password||url.hash)throw unavailable();
      const method=String(options.method??(input instanceof Request?input.method:'GET')).toUpperCase();
      if(!['GET','HEAD','OPTIONS',...WRITES].includes(method))throw unavailable();
      const time=clock();
      const remaining=Math.min(deadlineMs-(time-started),deadlineMs-(performance.now()-startedMonotonic));
      if(remaining<=0)throw unavailable();
      const signals=[AbortSignal.timeout(Math.max(1,Math.ceil(remaining))),options.signal,
        input instanceof Request?input.signal:null].filter(Boolean);
      const signal=AbortSignal.any(signals);
      const target=scope==='participant'?participant:shared()[scope];
      await acquire(target,scope,WRITES.has(method),signal);
      let released=false;
      const release=()=>{
        if(released)return;released=true;target.inFlight--;
        for(const wake of [...target.waiters])wake();
      };
      // Headers establish quota/status, not successful body completion. One
      // dispatch has one terminal outcome, even if a5xx body later also fails.
      let outcome=null;
      const terminal=kind=>{
        if(outcome!==null)return;
        outcome=kind;
        if(kind==='cancelled')target.counters.cancelled++;
        else if(kind==='failure'||kind==='timeout') {
          if(kind==='timeout')target.counters.timeouts++;
          failure(target,clock());
        } else if(kind==='success')target.failures=0;
      };
      const currentError=()=>unavailable(Math.max(1,(target.circuitUntil-clock())/1000));
      const failed=()=>{
        terminal(signal.aborted?(signal.reason?.name==='TimeoutError'?'timeout':'cancelled'):'failure');
        return currentError();
      };
      try {
        target.counters.dispatched++;
        const category=WRITES.has(method)?'writes':'reads';
        target.counters[category]++;requestCalls[scope][category]++;
        let response;
        try {response=await fetchImpl(input,{...options,redirect:'error',signal});}
        catch {throw failed();}
        const limited=observe(target,response,clock());
        if(limited) {
          terminal('throttled');
          await response.body?.cancel().catch(()=>{});
          throw currentError();
        }
        if(response.status>=500) {
          terminal('failure');
          if(target.circuitUntil>clock()) {
            await response.body?.cancel().catch(()=>{});
            throw currentError();
          }
        }
        return guardedResponse(response,signal,release,failed,
          ()=>terminal(response.ok?'success':'neutral'),()=>terminal('cancelled'));
      } catch(error) {release();throw error;}
    };
  }
  function snapshot() {
    const time=clock(),entry=states.get(key);
    return {scope:'process',checkedAt:time,
      request:{scope:'request',elapsedMs:Math.max(0,Math.round(performance.now()-startedMonotonic)),calls:structuredClone(requestCalls)},
      installation:publicState(entry?.installation??state(started),'installation',time),
      setup:publicState(entry?.setup??state(started),'setup',time),
      participant:publicState(participant,'participant-request',time)};
  }
  function finish(route,status) {
    if(finished)return;finished=true;
    try {
      const view=snapshot();
      // A participant's personal GitHub bucket is shared with their other apps.
      // Keep its observation request-local; persistent logs need only our counts.
      view.participant={scope:'request',counters:view.participant.counters};
      emit({event:'zerojams-provider',route:routeLabel(route),status:Number.isInteger(status)&&status>=100&&status<=599?status:null,...view});
    }catch{}
  }
  return {fetch:wrapped,snapshot,finish};
}
