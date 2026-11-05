// Manual-test preparation only. Import and call explicitly; no default transport,
// credential lookup, branch deletion, command-line entry point or live traffic.
import {createHash,randomBytes} from 'node:crypto';
import {createAtomicGitHubJamStore} from '../git-store.mjs';
import {createJamService} from '../service.mjs';
import {capacityTransport} from './capacity-transport.mjs';
import {hostedManifest} from './fixtures.mjs';

const ROOT='https://api.github.com/repos/codepetca/zero/git/';
const VERCEL_CONFIG=Buffer.from('{"git":{"deploymentEnabled":false}}\n');
const VERCEL_BLOB=createHash('sha1').update(`blob ${VERCEL_CONFIG.length}\0`).update(VERCEL_CONFIG).digest('hex');
const SHA=/^[a-f0-9]{40}$/;
const jsonHeaders={'content-type':'application/json','accept':'application/vnd.github+json','x-github-api-version':'2026-03-10','user-agent':'ZeroJams-capacity-test'};

// A permanent stop is intentionally conservative: 403 includes ordinary auth
// failures as well as secondary throttling. In-flight writes at stop, transport
// failures on writes and non-successful writes other than conflicts stay unknown.
function controlled(transport,{deadlineMs,maxRequests}) {
  const deadline=performance.now()+deadlineMs,active=new Set(),stats={requests:0,mutations:0,conflicts:0,statuses:{},unknownMutations:0};
  let reason=null,stoppedPending=false;
  function stop(why){if(reason)return;reason=why;if([...active].some(call=>call.mutation))stoppedPending=true;}
  function timeoutFor(reject,message){
    const remaining=deadline-performance.now(),why=remaining<=8000?'deadline':'transport-timeout';
    return setTimeout(()=>{stop(why);reject(new Error(message));},Math.max(1,Math.ceil(Math.min(8000,remaining))));
  }
  async function send(url,init={},readonly=false){
    if(performance.now()>=deadline)stop('deadline');
    if(reason&&!readonly)throw new Error('Capacity run stopped.');
    if(stats.requests>=maxRequests){stop('request-budget');throw new Error('Capacity request budget reached.');}
    if(readonly&&(!/^GET$/.test(init.method||'GET')||reason==='provider-throttle'))throw new Error('Reconciliation unavailable.');
    const call={mutation:!['GET','HEAD'].includes(init.method||'GET')};
    active.add(call);stats.requests++;if(call.mutation)stats.mutations++;
    let handedOff=false;
    const finish=()=>active.delete(call);
    try {
      let abandoned=false,timer;
      const pending=Promise.resolve().then(()=>transport(url,{...init,redirect:'error'}));
      const timeout=new Promise((_,reject)=>{timer=timeoutFor(error=>{abandoned=true;reject(error);},'Capacity transport timed out.');});
      let response;
      try{response=await Promise.race([pending,timeout]);}
      catch(error){if(abandoned){handedOff=true;void pending.then(value=>value.body?.cancel(),()=>{}).catch(()=>{}).finally(finish);}throw error;}
      finally{clearTimeout(timer);}
      if(response.redirected||response.url&&response.url!==url)throw new Error('Unexpected provider redirect.');
      stats.statuses[response.status]=(stats.statuses[response.status]||0)+1;
      if([409,422].includes(response.status))stats.conflicts++;
      if(response.status===403||response.status===429||response.headers.get('x-ratelimit-remaining')==='0')stop('provider-throttle');
      if(call.mutation&&!response.ok&&![409,422].includes(response.status))stats.unknownMutations++;
      if(!response.body)return response;
      const reader=response.body.getReader();let canceled=false;
      const stream=new ReadableStream({async pull(controller){
        let timer,abandoned=false;
        const pending=reader.read();
        const timeout=new Promise((_,reject)=>{timer=timeoutFor(error=>{abandoned=true;reject(error);},'Capacity response timed out.');});
        try{const part=await Promise.race([pending,timeout]);if(canceled)return;if(part.done){finish();controller.close();}else controller.enqueue(part.value);}
        catch(error){if(canceled)return;if(call.mutation)stats.unknownMutations++;stop('transport-error');if(abandoned)void pending.catch(()=>{}).finally(finish);else finish();controller.error(error);}
        finally{clearTimeout(timer);}
      },async cancel(){
        canceled=true;let timer,abandoned=false;
        const pending=Promise.resolve().then(()=>reader.cancel());
        const timeout=new Promise((_,reject)=>{timer=timeoutFor(error=>{abandoned=true;reject(error);},'Capacity cancellation timed out.');});
        try{await Promise.race([pending,timeout]);}
        catch{if(call.mutation)stats.unknownMutations++;stop('transport-error');if(abandoned){void pending.catch(()=>{}).finally(finish);return;}}
        finally{clearTimeout(timer);}
        finish();
      }});
      const wrapped=new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
      Object.defineProperties(wrapped,{url:{value:response.url},redirected:{value:response.redirected}});
      handedOff=true;return wrapped;
    }catch(error){if(call.mutation)stats.unknownMutations++;stop('transport-error');throw error;}
    finally{if(!handedOff)finish();}
  }
  return {send,stop,unknownMutation(){stats.unknownMutations++;stop('unknown-ref-response');},get stopped(){return reason;},get active(){return active.size;},get uncertain(){return stoppedPending||stats.unknownMutations>0;},stats};
}

async function body(response,max=16384){
  if(!/^application\/(?:json|vnd\.github\+json)\b/i.test(response.headers.get('content-type')||''))throw new Error('Invalid provider content type.');
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing provider response.');
  const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('Provider response too large.');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Only these exact bootstrap operations can move a ref, and create-ref is
// create-only. Never fall back to updating an existing branch after a collision.
async function bootstrap({branch,token,control,onRefDispatch}){
  const request=(route,method='GET',data)=>control.send(ROOT+route,{method,headers:{...jsonHeaders,authorization:`Bearer ${token}`},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(8000)});
  const absent=await request(`ref/heads/${branch}`);if(absent.status!==404){await absent.body?.cancel();throw new Error('Capacity branch not confirmed absent.');}await absent.body?.cancel();
  const blob=await request('blobs','POST',{content:VERCEL_CONFIG.toString('base64'),encoding:'base64'});
  if(blob.status!==201||(await body(blob)).sha!==VERCEL_BLOB)throw new Error('Deployment guard blob creation failed.');
  const tree=await request('trees','POST',{tree:[{path:'website/vercel.json',mode:'100644',type:'blob',sha:VERCEL_BLOB}]});
  if(tree.status!==201)throw new Error('Guarded tree creation failed.');
  const treeSha=(await body(tree)).sha;if(!SHA.test(treeSha||''))throw new Error('Guarded tree response invalid.');
  // Verify the only tree content before any ref can be created. This verifies
  // the commit's files, not whether Vercel or another integration honors them.
  const readTree=await request(`trees/${treeSha}`);if(readTree.status!==200)throw new Error('Root tree readback failed.');
  const checkedTree=await body(readTree),website=checkedTree.tree?.[0];
  if(checkedTree.sha!==treeSha||checkedTree.truncated!==false||checkedTree.tree?.length!==1||website?.path!=='website'||website.type!=='tree'||website.mode!=='040000'||!SHA.test(website.sha||''))throw new Error('Guarded root tree invalid.');
  const readWebsite=await request(`trees/${website.sha}`);if(readWebsite.status!==200)throw new Error('Guarded website tree readback failed.');
  const checkedWebsite=await body(readWebsite),guard=checkedWebsite.tree?.[0];
  if(checkedWebsite.sha!==website.sha||checkedWebsite.truncated!==false||checkedWebsite.tree?.length!==1||guard?.path!=='vercel.json'||guard.type!=='blob'||guard.mode!=='100644'||guard.sha!==VERCEL_BLOB)throw new Error('Guarded website tree invalid.');
  const commit=await request('commits','POST',{message:'ZeroJams isolated capacity test',tree:treeSha,parents:[]});
  if(commit.status!==201)throw new Error('Guarded root commit creation failed.');
  const created=await body(commit);
  if(!SHA.test(created.sha||'')||created.tree?.sha!==treeSha||!Array.isArray(created.parents)||created.parents.length)throw new Error('Invalid root commit response.');
  const readCommit=await request(`commits/${created.sha}`);if(readCommit.status!==200)throw new Error('Root commit readback failed.');
  const root=await body(readCommit);if(root.sha!==created.sha||root.tree?.sha!==treeSha||!Array.isArray(root.parents)||root.parents.length)throw new Error('Guarded root commit invalid.');
  onRefDispatch();
  const ref=await request('refs','POST',{ref:`refs/heads/${branch}`,sha:created.sha});
  if(ref.status!==201)throw new Error('Capacity branch creation not confirmed.');
  const result=await body(ref);
  if(result.ref!==`refs/heads/${branch}`||result.object?.type!=='commit'||result.object.sha!==created.sha)throw new Error('Capacity branch creation response invalid.');
  const confirm=await request(`ref/heads/${branch}`);if(confirm.status!==200)throw new Error('Capacity branch readback failed.');
  const head=await body(confirm);if(head.ref!==`refs/heads/${branch}`||head.object?.type!=='commit'||head.object.sha!==created.sha)throw new Error('Capacity branch changed during setup.');
  return created.sha;
}

/** No automatic execution. The injected transport owns credentials/network.
 * This invokes real API routes when given a real transport, and therefore needs
 * separate owner authorization and review before such use. */
export async function runCapacityTest({token,transport,runId=randomBytes(16).toString('hex'),deadlineMs=600000,maxRequests=8000,maxAttempts=3}={}){
  if(typeof token!=='string'||!/^\S{10,1024}$/.test(token)||typeof transport!=='function'||!/^[a-f0-9]{32}$/.test(runId)||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>600000||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>8000||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw new Error('Invalid capacity run configuration.');
  const branch=`zero-jams-capacity-${runId}`;
  const control=controlled(transport,{deadlineMs,maxRequests}),started=performance.now();
  const timer=setTimeout(()=>control.stop('deadline'),deadlineMs);
  const result={branch,status:'incomplete',simulatedIdentities:true,bootstrap:false,waves:{},verification:null};
  let store,inputsByWave={},eventId,bootstrapDispatched=false;
  try {
    const initial=await bootstrap({branch,token,control,onRefDispatch:()=>{bootstrapDispatched=true;}});result.bootstrap=true;
    const guarded=capacityTransport({branch,transport:(url,init)=>control.send(url,init),onInvalidRef:()=>control.unknownMutation()});
    store=createAtomicGitHubJamStore({token,fetchImpl:guarded});
    const migrated=await store.migrate({expectedRevision:initial});
    if(migrated.ids.length||Object.keys(migrated.settlements.operations).length)throw new Error('Initial registry is not empty.');
    const creator={id:'900000000000001',login:`capacity-${runId.slice(0,8)}-creator`},maintainer={id:'900000000000002',login:`capacity-${runId.slice(0,8)}-maintainer`};
    const actors=Array.from({length:30},(_,i)=>({id:String(900000000000100+i),login:`capacity-${runId.slice(0,8)}-student${i}`}));
    const service=createJamService({canCreateJam:()=>true,store,verifySource:async()=>{},maintainerIds:[maintainer.id],now:()=>Date.parse('2030-01-02T12:00:00Z'),
      verifyRepository:async({actor})=>({repository:{id:String(1000+Number(actor.id)),ownerId:actor.id,fullName:`${actor.login}/project`}}),
      pagesBindingReader:async(repo,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repo.id,ownerId:repo.ownerId})});
    const proposal=await service.propose({actor:creator,operationId:'capacity-propose-0001',manifest:hostedManifest()});
    eventId=proposal.eventId;
    await service.mutate({id:eventId,revision:proposal.revision,actor:maintainer,operationId:'capacity-approve-0001',action:'approve'});
    inputsByWave.join=actors.map(actor=>({id:eventId,revision:proposal.revision,actor,operationId:`capacity-join-${actor.id}`,action:'join',repositoryUrl:`https://github.com/${actor.login}/project`}));
    inputsByWave.submit=actors.map(actor=>({id:eventId,revision:proposal.revision,actor,operationId:`capacity-submit-${actor.id}`,action:'submit',title:'Synthetic capacity test',description:'Synthetic public test data.',demoUrl:`https://${actor.login}.github.io/project/`,instructions:'Synthetic test.'}));
    for(const [name,inputs] of Object.entries(inputsByWave)){
      if(control.stopped)break;
      const waveStart=performance.now(),times=Array(30).fill(null);let attempts=0;
      await Promise.all(inputs.map(async(input,i)=>{
        for(let attempt=0;attempt<maxAttempts&&!control.stopped;attempt++){
          attempts++;
          try{await service.mutate(input);times[i]=Math.round(performance.now()-waveStart);return;}catch(error){if(![409,503].includes(error?.status)){control.stop('unexpected-action-error');return;}}
        }
      }));
      result.waves[name]={attempts,returnedSuccess:times.filter(x=>x!==null).length,within5Minutes:times.filter(x=>x!==null&&x<=300000).length,elapsedMs:Math.round(performance.now()-waveStart)};
    }
    if(!control.stopped&&!control.uncertain&&control.active===0){
      const state=(await store.read(eventId)).state;
      const joins=inputsByWave.join.filter(input=>state.registrations[input.actor.id]?.status==='joined'&&state.operations[`${input.actor.id}:${input.operationId}`]);
      const submissions=inputsByWave.submit.filter(input=>state.entries[input.actor.id]?.length===1&&state.operations[`${input.actor.id}:${input.operationId}`]);
      const registrations=Object.keys(state.registrations).length,entries=Object.keys(state.entries).length,operations=Object.keys(state.operations).length;
      result.verification={joins:joins.length,submissions:submissions.length,registrations,entries,operations};
      if(!control.stopped&&!control.uncertain&&joins.length===30&&submissions.length===30&&registrations===30&&entries===30&&operations===62&&result.waves.join?.returnedSuccess===30&&result.waves.submit?.returnedSuccess===30&&result.waves.join.within5Minutes>=29&&result.waves.submit.within5Minutes>=29&&result.waves.join.elapsedMs<=600000&&result.waves.submit.elapsedMs<=600000)result.status='verified';
    }
  } catch {result.error='Capacity run failed; inspect the stop reason and provider state.';}
  finally{clearTimeout(timer);if(control.active){control.stop('undrained');const until=performance.now()+250;while(control.active&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,10));}result.stopReason=control.stopped;result.unresolved=control.uncertain||control.active>0||bootstrapDispatched&&!result.bootstrap;result.activeRequests=control.active;result.elapsedMs=Math.round(performance.now()-started);result.requests=structuredClone(control.stats);if(result.unresolved||result.stopReason)result.status='incomplete';}
  return result;
}
