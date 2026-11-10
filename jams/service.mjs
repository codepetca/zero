import {projectVisibility} from './project-visibility.mjs';
import {canPickGameJamWinner, eligibleGameJamEntry, gameJamWinningEntry, onTimePages} from './winner.mjs';
import {JamError, LIMITS, PRO_AUTO_APPROVAL, ID, SHA, ACCOUNT, SAFETY_SLOT_BYTES, safetySlots, operationCounts, stateBudget, actorIdentity, digest, fail, keys, manifestData, hostedManifestData, repositoryData, participantRepositoryData, pagesVerificationData, repositoryUrl, validateState, validateSettlements} from './schema.mjs';
export {JamError} from './schema.mjs';

// Trusted in-process provenance, deliberately absent from JSON and object spreads.
// HTTP must retain this exact result until its final complete-authority check.
export const JAM_PROJECTION_REVISION=Symbol('ZeroJams projection revision');
// Server-only routing metadata. It is never a public cursor or cached authority.
export const JAM_PAGE_METADATA=Symbol('ZeroJams gallery page metadata');
function taggedProjection(result,revision) {
  if(typeof revision!=='string'||!SHA.test(revision))fail(503,'Project visibility is unavailable.');
  return Object.defineProperty(result,JAM_PROJECTION_REVISION,{value:revision});
}

import {requestPayload,requestDigest,legacyRequestDigest,REVIEW,MODERATION,SAFETY} from './requests.mjs';
const operationKey = (actor,id) => `${actor.id}:${id}`;
const DISCOVERY_TIMEOUT_MS=18_000;
const discoveryUnavailable=()=>fail(503,'Project visibility is unavailable.');
// A rejected ref update is known not to have committed. Spread retrying
// participants out so synchronized requests are less likely to collide again.
// This is not a queue or a fleet-wide admission guarantee.
function waitAfterRejectedUpdate(signal) {
  return new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new Error('Request canceled.'));};
    if(signal.aborted)return abort();
    signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{cleanup();resolve();},10+Math.floor(Math.random()*291));
  });
}
// One request-local lifetime covers authority, materialization and projection.
// Race noncooperative adapters, observe their
// eventual rejection, and check again before every subsequent dispatch. Cleanup
// never waits for adapters or an advisory cancellation to settle.
async function withDiscoveryDeadline(signal,timeoutMs,work) {
  const controller=new AbortController(),abort=()=>controller.abort();
  const check=()=>{if(controller.signal.aborted)discoveryUnavailable();};
  const interrupted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>{
    try{discoveryUnavailable();}catch(error){reject(error);}
  },{once:true}));
  void interrupted.catch(()=>{});
  const timer=setTimeout(abort,timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  const scope={signal:controller.signal,check,async run(next) {
    check();
    const pending=Promise.resolve().then(()=>{check();return next();});
    try{const value=await Promise.race([pending,interrupted]);check();return value;}
    catch(error){check();throw error;}
  }};
  try{return await scope.run(()=>work(scope));}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}
function readOptions(options) {
  keys(options,['signal'],[]);
  if(options.signal!==undefined&&!(options.signal instanceof AbortSignal))fail(400,'Invalid jam read options.');
  return options;
}
function pageOptions(options) {
  keys(options,['signal','offset','revision','validUntil','notBefore'],['offset']);
  readOptions({signal:options.signal});
  if(!Number.isInteger(options.offset)||options.offset<0||options.offset>LIMITS.participants||
      options.revision!==undefined&&(typeof options.revision!=='string'||!SHA.test(options.revision))||
      options.validUntil!==undefined&&options.validUntil!==null&&(!Number.isSafeInteger(options.validUntil)||options.validUntil<=0)||
      options.notBefore!==undefined&&(!Number.isSafeInteger(options.notBefore)||options.notBefore<0)||
      options.offset!==0&&(options.revision===undefined||options.validUntil===undefined||options.notBefore===undefined))fail(400,'Invalid gallery page options.');
  return {signal:options.signal,offset:options.offset,revision:options.revision,validUntil:options.validUntil,notBefore:options.notBefore};
}
const participantOrder=(a,b)=>a.participantId.length-b.participantId.length||(a.participantId<b.participantId?-1:a.participantId>b.participantId?1:0);
function operationId(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) fail(400,'Use a valid operation ID.'); return value; }
function currentTime(now) { const value=now();if(!Number.isSafeInteger(value))fail(503,'Jam clock is unavailable.');return value; }
function inWindow(time,opens,closes) { return time>=Date.parse(opens)&&time<Date.parse(closes); }
function initial(id,actor,repositoryId,time) {
  return {schema:1,id,creator:actor,repositoryId,proposals:[],accepted:null,moderation:{status:'active'},registrations:{},entries:{},operations:{},history:[],updatedAt:time};
}

export function createJamService({store,verifySource,verifyRepository,pagesBindingReader,maintainerIds=[],now=Date.now,limits={},canCreateJam=()=>false}={}) {
  if (!store?.snapshot || !store?.compareAndSwap || typeof verifySource !== 'function') fail(503,'ZeroJams is unavailable.');
  if (typeof canCreateJam!=='function') fail(503,'Jam creation access is unavailable.');
  if (store.transact!==undefined&&typeof store.transact!=='function') fail(503,'ZeroJams is unavailable.');
  if (!Array.isArray(maintainerIds) || maintainerIds.some(id=>typeof id!=='string'||!ACCOUNT.test(id))) fail(503,'Jam maintainers are not configured.');
  const maintainers=new Set(maintainerIds), bound={...LIMITS,...limits};
  if (Object.keys(limits).some(key=>!Object.hasOwn(LIMITS,key)) || Object.entries(bound).some(([key,value])=>!Number.isSafeInteger(value)||value<1||value>LIMITS[key])) fail(503,'Invalid jam pilot limits.');
  if(bound.entryHistory<2||bound.stateBytes-safetySlots(bound)*SAFETY_SLOT_BYTES<65536)fail(503,'Jam limits must preserve ordinary capacity and reserved moderation space.');
  function hasCreationAccess(accountId) {
    try {
      const result=canCreateJam(accountId);
      // The trusted hook is synchronous; an asynchronous result cannot grant.
      if(result&&typeof result.then==='function')void Promise.resolve(result).catch(()=>{});
      return result===true;
    } catch {/* Deny without disclosing configuration. */}
    return false;
  }
  function assertCreationAccess(accountId) {
    if(!hasCreationAccess(accountId))fail(403,'A Pro license is required to propose a jam. Contact info@codepet.ca to request access.');
  }
  async function safeCall(work) { try{return await work();}catch(error){if(error instanceof JamError)throw error;fail(503,'Official jam records are unavailable. Retry with the same operation ID.');} }
  async function load(id,snapshot,scope) {
    if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');
    snapshot ||= await safeCall(()=>scope?scope.run(()=>store.snapshot({signal:scope.signal})):store.snapshot());
    if(!snapshot||!SHA.test(snapshot.revision||'')||typeof snapshot.read!=='function')fail(503,'Official jam records are unavailable.');
    validateSettlements(snapshot.settlements,bound);
    const item=await safeCall(()=>scope?scope.run(()=>snapshot.read(id,{signal:scope.signal})):snapshot.read(id));
    const value={...item,revision:snapshot.revision};
    if(!value || value.state!==null&&(typeof value.revision!=='string'||!value.revision))fail(503,'Official jam records are unavailable.');
    return {...value,snapshot,state:value.state===null?null:validateState(value.state,id,bound)};
  }
  async function ids(snapshot) {
    snapshot ||= await safeCall(()=>store.snapshot());
    const result=snapshot.ids;
    if(!Array.isArray(result)||result.length>bound.events||result.some(id=>typeof id!=='string'||!ID.test(id))||new Set(result).size!==result.length)fail(503,'The jam registry listing is unavailable.');
    return result;
  }
  async function source(input,scope) {
    const result=await safeCall(()=>scope?scope.run(()=>verifySource(input)):verifySource(input));
    if(!result)fail(503,'The public source could not be verified.');
    const repository=repositoryData(result.repository,input.actor,input.commit);
    const expected=repositoryUrl(input.repositoryUrl);
    if(repository.fullName.toLowerCase()!==`${expected.owner}/${expected.repo}`.toLowerCase())fail(403,'The verified source does not match the chosen repository.');
    return {repository,...(input.manifest?{manifest:manifestData(result.manifest)}:{})};
  }
  function summary(state,time,visibility,{moderation=false,pagesEligible,pagesUnverified,entryParticipants}={}) {
    const proposal=state.accepted||state.proposals.at(-1), manifest=proposal.manifest;
    const participants=Object.values(state.registrations).filter(item=>item.status==='joined').map(({id,login})=>({id,login}));
    const entries=Object.values(state.entries).map(history=>history.at(-1)).filter(item=>item?.status==='active'&&state.registrations[item.participantId]?.status==='joined'&&(!entryParticipants||entryParticipants.has(item.participantId))).map(({participantId,login,title,description,demoUrl,instructions,repository,submittedAt,pagesVerification})=>({participantId,login,title,description,demoUrl,instructions,repository,submittedAt,...(pagesVerification?{pagesVerification}:{})}));
    const active=!!state.accepted&&state.moderation.status==='active';
    const approvalHistory=state.proposals.filter(proposal=>proposal.status==='approved').map(proposal=>({revision:proposal.revision,approvedAt:proposal.reviewedAt,manifest:structuredClone(proposal.manifest)}));
    const galleryRevealed=!manifest.schedule.galleryRevealAt||time>=Date.parse(manifest.schedule.galleryRevealAt);
    const galleryIncomplete=galleryRevealed&&entries.some(entry=>!visibility.isHeld(entry.repository.id)&&pagesUnverified?.has(pagesKey(entry)));
    const winner = galleryRevealed ? gameJamWinningEntry(state,time) : null;
    const publicEntries = galleryRevealed ? entries.filter(entry=>!visibility.isHeld(entry.repository.id)&&
      (!manifest.schedule.galleryRevealAt||Object.hasOwn(entry.repository,'commit')||onTimePages(entry,manifest.schedule)&&pagesEligible?.has(pagesKey(entry))))
      .map(({pagesVerification,...entry})=>entry.participantId===winner?.participantId ? {...entry,winner:true} : entry) : [];
    return {id:state.id,creator:structuredClone(state.creator),hosting:state.hosting||'creator',revision:state.accepted?.revision||null,...manifest,approvalHistory,...(state.accepted?.approvalMode?{approvalMode:state.accepted.approvalMode}:{}),reviewStatus:state.proposals.at(-1).status,moderation:structuredClone(state.moderation),registrationOpen:active&&inWindow(time,manifest.schedule.registrationOpensAt,manifest.schedule.registrationClosesAt),submissionsOpen:active&&inWindow(time,manifest.schedule.submissionsOpenAt,manifest.schedule.submissionsCloseAt),participantCount:participants.length,participantLimit:bound.participants,participants,entries:moderation?entries:publicEntries,...(galleryIncomplete?{galleryIncomplete:true}:{}),...(manifest.schedule.galleryRevealAt?{galleryRevealed}:{}),updatedAt:state.updatedAt};
  }
  function recover(state,actor,op,payloadDigest) {
    const previous=state?.operations[operationKey(actor,op)];
    if(!previous)return null;
    if(previous.payloadDigest!==payloadDigest)fail(409,'This operation ID was used for different information.');
    return structuredClone(previous.result);
  }
  const settlementKey=(scope,actor,op)=>`${scope}:${actor.id}:${op}`;
  const closedResult=(scope,op)=>({operationId:op,scope,settlement:'not-applied',status:'not-applied',...(scope==='proposals'?{}:{eventId:scope})});
  function fenced(snapshot,scope,actor,op,payloadDigest,legacyDigest) {
    const previous=snapshot.settlements.operations[settlementKey(scope,actor,op)];
    if(!previous)return null;
    if(previous.payloadDigest!==payloadDigest&&previous.payloadDigest!==legacyDigest)fail(409,'This operation ID was used for different information.');
    return closedResult(scope,op);
  }
  async function proposalResult(snapshot,actor,op,payloadDigest) {
    let result=null;
    for(const id of await ids(snapshot)) {
      const {state}=await load(id,snapshot);
      if(!state)fail(503,'Official jam records are unavailable.');
      const previous=state.creator.id===actor.id&&state.operations[operationKey(actor,op)];
      // Historical proposal records have no action discriminator. Their result
      // references a proposal revision, unlike entry submission/review results.
      const proposal=previous&&state.proposals.find(proposal=>proposal.revision===previous.result.revision);
      if(proposal&&(previous.result.status==='submitted'||previous.result.status==='approved'&&previous.result.approvalMode===PRO_AUTO_APPROVAL&&proposal.approvalMode===PRO_AUTO_APPROVAL)) {
        const recovered=recover(state,actor,op,payloadDigest);
        if(result)fail(503,'Official request history is ambiguous.');
        result=recovered;
      }
    }
    return result;
  }
  // The optional store owns commit/rollback and publishes the callback result
  // only after a confirmed commit. Its facade is local to this callback. Source
  // and Pages verification must finish before entering this boundary; final
  // authority, caps, clock, recovery and state changes use the locked snapshot.
  async function withWriteStore(work,callScope) {
    if(typeof store.transact!=='function')return work(store,false);
    const transaction=()=>{
      const callback=writeStore=>{
        callScope?.check();
        if(!writeStore||typeof writeStore.snapshot!=='function'||typeof writeStore.compareAndSwap!=='function')fail(503,'Official jam records are unavailable.');
        return work(writeStore,true);
      };
      return callScope?store.transact(callback,{signal:callScope.signal}):store.transact(callback);
    };
    // Cancellation can race a dispatched commit. It never establishes that a
    // write was rejected; the unchanged operation ID recovers the durable result.
    return safeCall(()=>callScope?callScope.run(transaction):transaction());
  }
  async function commitLoop(id,actor,op,payloadDigest,change,options={}) {
    return withWriteStore((writeStore,transactional)=>commitOnStore(writeStore,transactional,id,actor,op,payloadDigest,change,options),options.callScope);
  }
  function occupiesOrganizerSlot(state,time) {
    if(state.moderation.status==='cancelled')return false;
    const current=state.accepted||state.proposals.at(-1);
    if(!state.accepted&&!['submitted','changes-requested'].includes(current.status))return false;
    return time<Date.parse(current.manifest.schedule.galleryRevealAt||current.manifest.schedule.submissionsCloseAt);
  }
  const canCancelOwnJam=(state,actor)=>state?.hosting==='zero'&&state.creator.id===actor.id&&state.accepted?.approvalMode===PRO_AUTO_APPROVAL;
  async function assertCreationRate(snapshot,actor,time) {
    let recent=0;
    for(const id of await ids(snapshot)) {
      const existing=(await load(id,snapshot)).state;
      if(!existing)fail(503,'Official jam records are unavailable.');
      if(existing.creator.id!==actor.id)continue;
      const created=Date.parse(existing.proposals[0].proposedAt);
      if(!Number.isFinite(created))fail(503,'Official jam records are unavailable.');
      if(created>time-bound.writeWindowMs)recent++;
    }
    if(recent>=bound.actorCreations)fail(429,'Too many jam creations. Wait a minute and retry with the same operation ID.');
  }
  async function assertOrganizerSlot(snapshot,next,time) {
    if(!occupiesOrganizerSlot(next,time))return;
    for(const existingId of await ids(snapshot)) {
      if(existingId===next.id)continue;
      const existing=(await load(existingId,snapshot)).state;
      if(!existing)fail(503,'Official jam records are unavailable.');
      if(existing.creator.id===next.creator.id&&occupiesOrganizerSlot(existing,time))fail(429,'You can have only one active jam at a time.');
    }
  }
  async function commitOnStore(writeStore,transactional,id,actor,op,payloadDigest,change,{create=false,pool='ordinary',scope=id,legacyDigest,callScope,recoverOnly=false,enforceOrganizerSlot=false,creatorCancellation=false,updateEventTimestamp=true}={}) {
    for(let attempt=0;attempt<(transactional?1:bound.retries);attempt++) {
      callScope?.check();
      const snapshot=await safeCall(()=>callScope?callScope.run(()=>writeStore.snapshot({signal:callScope.signal})):writeStore.snapshot());
      const {state,revision}=await load(id,snapshot,callScope);
      const rejected=fenced(snapshot,scope,actor,op,payloadDigest,legacyDigest);
      const previous=scope==='proposals'?await proposalResult(snapshot,actor,op,payloadDigest):recover(state,actor,op,payloadDigest);
      if(rejected&&previous)fail(503,'Official request history is inconsistent.');
      if(rejected||previous)return rejected||previous;
      if(recoverOnly)fail(503,'Earlier request history is unavailable. Retry with the same operation ID.');
      // Recover accepted/fenced requests first, including after a grant is revoked.
      // New proposals alone require a current trusted numeric-ID entitlement.
      if(scope==='proposals')assertCreationAccess(actor.id);
      if(scope==='proposals'&&state?.operations[operationKey(actor,op)])recover(state,actor,op,payloadDigest);
      const time=currentTime(now),stamp=new Date(time).toISOString();
      if(!state&&!create)fail(404,'Jam not found.');
      if(!state&&create)await assertCreationRate(snapshot,actor,time);
      if(!state&&(await ids(snapshot)).length>=bound.events)fail(429,'The jam pilot is at event capacity.');
      const next=state?structuredClone(state):{...initial(id,actor,null,stamp),hosting:'zero'};
      const counts=operationCounts(next);
      if(pool==='safety') {
        if(!maintainers.has(actor.id)&&!(creatorCancellation&&canCancelOwnJam(state,actor)))fail(403,'A Zero maintainer must perform this action.');
        if(counts.safety>=safetySlots(bound))fail(429,'Reserved safety moderation capacity is exhausted. Operator intervention is required.');
      } else {
        if(counts.ordinary>=bound.operations)fail(429,'This jam has reached its ordinary operation capacity.');
        const recentWrites=Object.values(next.operations).filter(operation=>operation.pool==='ordinary'&&operation.actorId===actor.id&&Number.isSafeInteger(operation.acceptedAt)&&operation.acceptedAt>time-bound.writeWindowMs).length;
        if(recentWrites>=bound.actorWrites)fail(429,'Too many jam changes. Wait a minute and retry with the same operation ID.');
      }
      const previousBytes=Buffer.byteLength(JSON.stringify(next));
      callScope?.check();
      const detail=change(next,time,stamp);
      if(create||enforceOrganizerSlot)await assertOrganizerSlot(snapshot,next,time);
      const result={eventId:id,operationId:op,...detail};
      if(updateEventTimestamp)next.updatedAt=stamp;
      next.operations[operationKey(actor,op)]={actorId:actor.id,acceptedAt:time,payloadDigest,result,pool};
      const nextBytes=Buffer.byteLength(JSON.stringify(next));
      if(pool==='safety'&&nextBytes-previousBytes>SAFETY_SLOT_BYTES)fail(413,'This safety action exceeds its reserved record capacity.');
      if(nextBytes>stateBudget(next,bound))fail(413,'This jam has reached its ordinary record capacity; safety moderation space is reserved.');
      validateState(next,id,bound);
      if(scope==='proposals')assertCreationAccess(actor.id);
      const applied=await safeCall(()=>callScope?callScope.run(()=>writeStore.compareAndSwap(id,revision,next,{signal:callScope.signal})):writeStore.compareAndSwap(id,revision,next));
      if(applied===true)return structuredClone(result);
      if(applied!==false)fail(503,'Official jam records are unavailable. Retry with the same operation ID.');
      if(transactional)fail(503,'The transactional jam registry changed unexpectedly. Retry with the same operation ID.');
      // Unknown outcomes throw above and must never enter this branch. Safety
      // actions remain immediate; the next ordinary attempt rereads authority,
      // recovers the same operation, and checks the clock and limits again.
      if(callScope&&pool==='ordinary'&&attempt+1<bound.retries)await callScope.run(()=>waitAfterRejectedUpdate(callScope.signal));
    }
    fail(409,'This jam changed repeatedly. Retry with the same operation ID.');
  }
  async function discovery(scope) {
    const snapshot=await safeCall(()=>scope.run(()=>store.snapshot({signal:scope.signal}))), states=new Map();
    validateSettlements(snapshot?.settlements,bound);
    for(const id of await ids(snapshot)) {
      const {state}=await load(id,snapshot,scope);
      if(!state)fail(503,'Official jam records are unavailable.');
      states.set(id,state);
    }
    const time=currentTime(now);
    const pinned={revision:snapshot.revision,ids:[...states.keys()],async read(id){return {state:structuredClone(states.get(id)||null)};}};
    const visibility=await scope.run(()=>safeCall(()=>projectVisibility(pinned,time)));
    return {states,time,visibility,revision:snapshot.revision};
  }
  const pagesKey=entry=>digest({repository:entry.repository,pagesUrl:entry.demoUrl});
  async function observePages(scope,candidates) {
    const pagesEligible=new Set(),pagesUnverified=new Set();
    if(typeof pagesBindingReader!=='function')return {pagesEligible,pagesUnverified:new Set(candidates.keys())};
    const pending=[...candidates];let cursor=0;
    await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
      while(cursor<pending.length) {
        scope.check();const [key,entry]=pending[cursor++],repository=entry.repository;
        let receipt;
        try {
          receipt=await scope.run(()=>pagesBindingReader({url:`https://github.com/${repository.fullName}`,id:repository.id,ownerId:repository.ownerId},entry.demoUrl,{signal:scope.signal}));
        } catch {scope.check();pagesUnverified.add(key);continue;}
        if(receipt?.status==='verified'&&receipt.pagesUrl===entry.demoUrl&&receipt.repositoryId===repository.id&&receipt.ownerId===repository.ownerId)pagesEligible.add(key);
        else pagesUnverified.add(key);
      }
    }));
    return {pagesEligible,pagesUnverified};
  }
  async function pageDiscovery(scope,eventId,{offset,revision,validUntil,notBefore}) {
    const initial=await discovery(scope);
    if(revision!==undefined&&revision!==initial.revision||notBefore!==undefined&&initial.time<notBefore)
      fail(409,'The gallery changed. Restart loading its pages.');
    // Time can change global holds without a Git write, including those recorded
    // by suspended/cancelled events. Never carry an offset across such a boundary.
    let horizon=null;
    for(const state of initial.states.values()) {
      const reveal=Date.parse(state.accepted?.manifest.schedule.galleryRevealAt);
      if(reveal>initial.time&&(horizon===null||reveal<horizon))horizon=reveal;
    }
    if(validUntil!==undefined&&(validUntil!==horizon||validUntil!==null&&initial.time>=validUntil))
      fail(409,'The gallery changed. Restart loading its pages.');
    const state=initial.states.get(eventId),schedule=state?.accepted?.manifest.schedule;
    const candidates=!schedule||schedule.galleryRevealAt&&initial.time<Date.parse(schedule.galleryRevealAt)?[]:
      Object.values(state.entries).map(history=>history.at(-1)).filter(entry=>entry?.status==='active'&&
        state.registrations[entry.participantId]?.status==='joined'&&!initial.visibility.isHeld(entry.repository.id)&&
        (Object.hasOwn(entry.repository,'commit')||onTimePages(entry,schedule))).sort(participantOrder);
    const selected=candidates.slice(offset,offset+8),entryParticipants=new Set(selected.map(entry=>entry.participantId));
    const observations=await observePages(scope,new Map(selected.filter(entry=>!Object.hasOwn(entry.repository,'commit')).map(entry=>[pagesKey(entry),entry])));
    // Cursors select bounded work, never old authority. Even an empty or entirely
    // legacy page rechecks the complete registry before returning its projection.
    const final=await discovery(scope);
    if(final.revision!==initial.revision)discoveryUnavailable();
    const finalTime=currentTime(now);
    if(final.time<initial.time||finalTime<final.time||horizon!==null&&(final.time>=horizon||finalTime>=horizon))
      fail(409,'The gallery changed. Restart loading its pages.');
    return {...final,...observations,entryParticipants,
      pageMetadata:Object.freeze({nextOffset:offset+selected.length<candidates.length?offset+selected.length:null,revision:initial.revision,validUntil:horizon,observedAt:final.time})};
  }
  async function publicDiscovery(scope,{eventId,directory=false}={}) {
    const initial=await discovery(scope),pagesEligible=new Set(),pagesUnverified=new Set();
    if(directory)return {...initial,pagesEligible,pagesUnverified};
    const candidates=new Map();
    for(const [id,state] of initial.states) {
      if(!state?.accepted||eventId!==undefined&&id!==eventId||eventId===undefined&&state.moderation.status!=='active')continue;
      const schedule=state.accepted.manifest.schedule;
      if(!schedule.galleryRevealAt||initial.time<Date.parse(schedule.galleryRevealAt))continue;
      for(const history of Object.values(state.entries)) {
        const entry=history.at(-1);
        if(entry?.status!=='active'||state.registrations[entry.participantId]?.status!=='joined'||
            Object.hasOwn(entry.repository,'commit')||!onTimePages(entry,schedule)||initial.visibility.isHeld(entry.repository.id))continue;
        candidates.set(pagesKey(entry),entry);
      }
    }
    // Directory discovery remains useful when several individually bounded
    // events exceed the total provider-observation budget. No destination or
    // entry data leaves this summary projection; detail keeps its own budget.
    if(eventId===undefined&&candidates.size>LIMITS.participants)return {...initial,pagesEligible,galleriesDeferred:true};
    if(!candidates.size)return {...initial,pagesEligible,pagesUnverified};
    if(typeof pagesBindingReader!=='function')return {...initial,pagesEligible,pagesUnverified:new Set(candidates.keys())};
    const observations=await observePages(scope,candidates);
    // A trusted reader can make multiple provider requests per candidate.
    // Recheck all global hold authority after slow observations, within the
    // original caller deadline. A changed registry needs a fresh caller retry.
    const final=await discovery(scope);
    if(final.revision!==initial.revision)discoveryUnavailable();
    return {...final,...observations};
  }
  async function list(actor,options={}) {
    const {signal}=readOptions(options);
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,scope=>listScoped(actor,scope));
  }
  async function listSummaries(actor,options={}) {
    const {signal}=readOptions(options);
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,scope=>listScoped(actor,scope,{directory:true}));
  }
  async function listScoped(actor,scope,{directory=false}={}) {
    if(actor)actor=actorIdentity(actor);
    const events=[],proposals=[],canMaintain=!!actor&&maintainers.has(actor.id);
    const {states,time,visibility,pagesEligible,pagesUnverified,galleriesDeferred,revision}=await publicDiscovery(scope,{directory});
    for(const [id,state] of states) {
      if(state?.accepted&&state.moderation.status==='active'){
        const event=summary(state,time,visibility,{pagesEligible,pagesUnverified});
        if(directory||galleriesDeferred)delete event.entries;
        events.push(event);
      }
      const proposal=state?.proposals.at(-1);
      if(canMaintain&&proposal&&['submitted','changes-requested'].includes(proposal.status))proposals.push({id,title:proposal.manifest.title,type:proposal.manifest.type,revision:proposal.revision,status:proposal.status,organizerLogin:state.creator.login,submittedAt:proposal.proposedAt});
    }
    const hostingAccess=directory&&actor?{accountId:actor.id,canCreate:hasCreationAccess(actor.id)}:undefined;
    return taggedProjection({events,canMaintain,...(directory||galleriesDeferred?{galleriesDeferred:true}:{}),...(canMaintain?{proposals}:{}),...(hostingAccess?{hostingAccess}:{})},revision);
  }
  async function read(id,actor,options={}) {
    const {signal}=readOptions(options);
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,scope=>readScoped(id,actor,scope));
  }
  async function readOverview(id,actor,options={}) {
    const {signal}=readOptions(options);
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,scope=>readScoped(id,actor,scope,undefined,{overview:true}));
  }
  async function readModeration(id,actor,options={}) {
    // This private lane is separate from public page eligibility. Authorize
    // before any registry read; a held or unverifiable entry still needs review.
    if(!actor)fail(403,'A Zero maintainer must perform this action.');
    actor=actorIdentity(actor);
    if(!maintainers.has(actor.id))fail(403,'A Zero maintainer must perform this action.');
    const {signal}=readOptions(options);
    if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,async scope=>{
      const {states,time,visibility,revision}=await discovery(scope),state=states.get(id);
      if(!state)fail(404,'Jam not found.');
      const moderationEntries=summary(state,time,visibility,{moderation:true}).entries.sort(participantOrder);
      scope.check();
      return taggedProjection({moderationEntries},revision);
    });
  }
  async function readWinnerSelection(id,actor,options={}) {
    if(!actor)fail(403,'Only the host can pick a winner.');
    actor=actorIdentity(actor);
    const {signal}=readOptions(options);
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,async scope=>{
      const {state}=await load(id,undefined,scope);
      if(!state||state.creator.id!==actor.id)fail(403,'Only the host can pick a winner.');
      const time=currentTime(now);
      if(!canPickGameJamWinner(state,time))fail(409,'Pick a winner after submissions close for an active Game Jam.');
      const entries=Object.keys(state.entries).map(participantId=>eligibleGameJamEntry(state,participantId))
        .filter(Boolean).sort(participantOrder).map(({participantId,revision,title,login,demoUrl})=>({participantId,revision,title,login,demoUrl}));
      return {winnerSelection:{currentRevision:gameJamWinningEntry(state,time)?.revision??null,entries}};
    });
  }
  async function readPage(id,actor,options={}) {
    // Offsets count eligible candidates, including failed current proofs. A page
    // can therefore be empty and incomplete while still having a continuation.
    const page=pageOptions(options);
    return withDiscoveryDeadline(page.signal,DISCOVERY_TIMEOUT_MS,scope=>readScoped(id,actor,scope,page));
  }
  async function readScoped(id,actor,scope,page,{overview=false}={}) {
    if(actor)actor=actorIdentity(actor);
    if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');
    const discoveryResult=await (page?pageDiscovery(scope,id,page):publicDiscovery(scope,{eventId:id,directory:overview}));
    const {states,time,visibility,pagesEligible,pagesUnverified,revision,pageMetadata}=discoveryResult;
    const entryParticipants=overview?new Set():discoveryResult.entryParticipants;
    const state=states.get(id),canMaintain=!!actor&&maintainers.has(actor.id);
    const authorized=state&&!!actor&&(state.creator.id===actor.id||canMaintain);
    if(!state||!state.accepted&&!authorized)fail(404,'Jam not found.');
    const registration=actor&&state.registrations[actor.id]||null;
    const entryHistory=actor&&state.entries[actor.id];
    const latestEntry=entryHistory?.at(-1);
    // Keep the durable safety revision compact while returning useful source
    // metadata to the participant whose submission was removed.
    const entry=latestEntry?.moderatedBy?{...entryHistory.find(entry=>entry.revision===latestEntry.previousRevision),...latestEntry}:latestEntry||null;
    const proposal=authorized?state.proposals.at(-1):null;
    const event=summary(state,time,visibility,{pagesEligible,pagesUnverified,entryParticipants});
    if(page)event.entries.sort(participantOrder);
    if(overview)delete event.entries;
    const publicParticipants=new Set((event.entries??[]).map(item=>item.participantId));
    const moderationEntries=canMaintain&&!overview?summary(state,time,visibility,{moderation:true,entryParticipants}).entries.filter(item=>!publicParticipants.has(item.participantId)):[];
    if(page)moderationEntries.sort(participantOrder);
    const canPickWinner=overview&&actor?.id===state.creator.id&&canPickGameJamWinner(state,time);
    const result=taggedProjection({event,registration:structuredClone(registration),entry:structuredClone(entry),canMaintain,...(canPickWinner?{canPickWinner}:{}),...(canMaintain&&!overview?{moderationEntries}:{}),...(proposal?{proposal:structuredClone(proposal)}:{})},revision);
    return page?Object.defineProperty(result,JAM_PAGE_METADATA,{value:pageMetadata}):result;
  }
  async function propose(input) {
    // Creator-hosted intake is closed even to direct service callers. Archived
    // records retain their original schema and remain readable/reviewable.
    keys(input,['actor','operationId','manifest']);
    const actor=actorIdentity(input.actor),op=operationId(input.operationId),manifest=hostedManifestData(input.manifest);
    const payloadDigest=digest({action:'propose',hosting:'zero',manifest});
    // A distinct deterministic namespace avoids numeric repository IDs. The
    // proposal-scope history scan also preserves historical operation keys.
    const id=`jam-zero-${digest({domain:'zero-hosted-jam-v1',creatorId:actor.id,operationId:op}).slice(0,32)}`;
    const proposalRevision=digest({hosting:'zero',creatorId:actor.id,manifest});
    return commitLoop(id,actor,op,payloadDigest,(next,time,stamp)=>{
      if(next.hosting!=='zero'||next.creator.id!==actor.id||next.proposals.length)fail(409,'This jam identifier is already in use.');
      if(Date.parse(manifest.schedule.galleryRevealAt)<=time)fail(400,'Choose a future gallery reveal time after the submission deadline.');
      next.creator.login=actor.login;
      const proposal={revision:proposalRevision,hosting:'zero',manifest,repository:null,status:'approved',reason:'',proposedAt:stamp,approvalMode:PRO_AUTO_APPROVAL,reviewedBy:null,reviewedAt:stamp};
      next.proposals.push(proposal);
      next.accepted={...structuredClone(proposal),approvedBy:null,approvedAt:stamp};
      next.history.push({action:'auto-approve',policy:PRO_AUTO_APPROVAL,actorId:actor.id,revision:proposalRevision,at:stamp});
      return {revision:proposalRevision,status:'approved',approvalMode:PRO_AUTO_APPROVAL};
    },{create:true,scope:'proposals',legacyDigest:legacyRequestDigest('proposals',{manifest:input.manifest})});
  }
  async function mutate(input,options={}) {
    const {signal}=readOptions(options);
    return withDiscoveryDeadline(signal,DISCOVERY_TIMEOUT_MS,scope=>mutateScoped(input,scope));
  }
  async function mutateScoped(input,callScope) {
    keys(input,['id','actor','operationId','action','revision','reason','participantId','repositoryUrl','source','title','description','demoUrl','instructions'],['id','actor','operationId','action']);
    const actor=actorIdentity(input.actor),op=operationId(input.operationId),{id,action}=input;
    const {id:ignoredId,actor:ignoredActor,operationId:ignoredOperation,...publicInput}=input;
    const payload=requestPayload(id,publicInput),payloadDigest=digest(payload);
    const legacyDigest=legacyRequestDigest(id,publicInput);
    // Read before expensive source verification so accepted retries still recover
    // if the source becomes unavailable or the deadline passes.
    const loaded=await load(id,undefined,callScope),before=loaded.state;
    if(typeof store.transact==='function') {
      // This first read only avoids unnecessary provider work. The locked final
      // snapshot decides whether the operation was accepted, fenced or changed.
      if(loaded.snapshot.settlements.operations[settlementKey(id,actor,op)]||before?.operations[operationKey(actor,op)])
        return commitLoop(id,actor,op,payloadDigest,null,{legacyDigest,callScope,recoverOnly:true});
    } else {
      const rejected=fenced(loaded.snapshot,id,actor,op,payloadDigest,legacyDigest),previous=recover(before,actor,op,payloadDigest);
      if(rejected&&previous)fail(503,'Official request history is inconsistent.');
      if(rejected||previous)return rejected||previous;
    }
    if(!before)fail(404,'Jam not found.');
    if(action==='pick-winner'&&before.creator.id!==actor.id)fail(403,'Only the host can pick a winner.');
    if((REVIEW.has(action)||MODERATION.has(action)||action==='withdraw-entry')&&!maintainers.has(actor.id)&&!(action==='cancel'&&canCancelOwnJam(before,actor)))fail(403,'A Zero maintainer must perform this action.');
    if(action==='approve'&&before.creator.id===actor.id)fail(403,'A different maintainer must approve your jam.');
    let joinedRepository=null,verified=null,pagesVerification=null;
    if(action==='join'&&payload.repositoryUrl) {
      if(typeof verifyRepository!=='function')fail(503,'The public project repository could not be verified.');
      joinedRepository=participantRepositoryData((await safeCall(()=>callScope.run(()=>verifyRepository({repositoryUrl:payload.repositoryUrl,actor}))))?.repository,actor);
      const expected=repositoryUrl(payload.repositoryUrl);
      if(joinedRepository.fullName.toLowerCase()!==`${expected.owner}/${expected.repo}`.toLowerCase())fail(403,'The verified repository does not match the chosen repository.');
    }
    if(action==='submit'&&payload.source)verified=await source({...payload.source,actor,manifest:false},callScope);
    if(action==='submit'&&!payload.source) {
      const registered=before.registrations[actor.id]?.repository;
      if(!before.accepted?.manifest.schedule.galleryRevealAt||!registered)fail(409,'Join this showcase with your public project repository first.');
      if(typeof verifyRepository!=='function')fail(503,'The public project repository could not be verified.');
      const current=participantRepositoryData((await safeCall(()=>callScope.run(()=>verifyRepository({repositoryId:registered.id,actor}))))?.repository,actor);
      if(current.id!==registered.id)fail(403,'The linked repository is no longer available under your account.');
      if(typeof pagesBindingReader!=='function')fail(503,'The project Pages association could not be verified. Retry with the same operation ID.');
      const receipt=await safeCall(()=>callScope.run(()=>pagesBindingReader({url:`https://github.com/${current.fullName}`,id:current.id,ownerId:current.ownerId},payload.demoUrl,{signal:callScope.signal})));
      if(receipt?.status!=='verified')fail(503,'The project Pages association could not be verified. Retry with the same operation ID.');
      pagesVerification=pagesVerificationData({pagesUrl:receipt.pagesUrl,repositoryId:receipt.repositoryId,ownerId:receipt.ownerId,verifiedAt:new Date(currentTime(now)).toISOString()},current,payload.demoUrl);
      verified={repository:current};
    }
    return commitLoop(id,actor,op,payloadDigest,(next,time,stamp)=>{
      if(action==='pick-winner') {
        if(next.creator.id!==actor.id)fail(403,'Only the host can pick a winner.');
        if(!canPickGameJamWinner(next,time))fail(409,'Pick a winner after submissions close for an active Game Jam.');
        const entry=eligibleGameJamEntry(next,payload.participantId);
        if(entry?.revision!==payload.revision)fail(409,'Choose a current eligible submission.');
        next.history.push({action,actorId:actor.id,participantId:entry.participantId,revision:entry.revision,at:stamp});
        return {status:'winner-selected',participantId:entry.participantId,revision:entry.revision};
      }
      if(REVIEW.has(action)) {
        if(!maintainers.has(actor.id))fail(403,'A Zero maintainer must perform this action.');
        const proposal=next.proposals.at(-1);
        if(proposal.revision!==payload.revision||proposal.status!=='submitted')fail(409,'Review the latest submitted proposal.');
        if(action==='approve') {
          if(next.creator.id===actor.id)fail(403,'A different maintainer must approve your jam.');
          if(next.moderation.status==='cancelled')fail(409,'This official jam was cancelled.');
          proposal.status='approved';proposal.reason=payload.reason||'';proposal.reviewedAt=stamp;proposal.reviewedBy=actor.id;
          next.accepted={...structuredClone(proposal),approvedBy:actor.id,approvedAt:stamp};
        } else { proposal.status=action==='reject'?'rejected':'changes-requested';proposal.reason=payload.reason;proposal.reviewedAt=stamp;proposal.reviewedBy=actor.id; }
        next.history.push({action,actorId:actor.id,revision:proposal.revision,reason:payload.reason||'',at:stamp});
        return {revision:proposal.revision,status:proposal.status};
      }
      if(MODERATION.has(action)) {
        if(!maintainers.has(actor.id)&&!(action==='cancel'&&canCancelOwnJam(next,actor)))fail(403,'A Zero maintainer must perform this action.');
        if(next.moderation.status==='cancelled')fail(409,'This official jam was cancelled.');
        if(!next.accepted)fail(409,'Approve the jam before changing official participation.');
        next.moderation={status:action==='suspend'?'suspended':action==='cancel'?'cancelled':'active',reason:payload.reason,updatedAt:stamp};
        next.history.push({action,actorId:actor.id,reason:payload.reason,at:stamp});
        return {status:next.moderation.status};
      }
      if(action==='withdraw-entry') {
        if(!maintainers.has(actor.id))fail(403,'A Zero maintainer must perform this action.');
        const history=next.entries[payload.participantId],entry=history?.at(-1);
        if(!entry||entry.status!=='active')fail(409,'This participant has no active entry.');
        if(history.length>=bound.entryHistory)fail(429,'This entry has reached its revision capacity.');
        const revision=digest({actor:actor.id,operationId:op,payload});
        history.push({participantId:payload.participantId,status:'withdrawn',withdrawnAt:stamp,previousRevision:entry.revision,revision,moderatedBy:actor.id,reason:payload.reason});
        next.history.push({action,actorId:actor.id,participantId:payload.participantId,reason:payload.reason,revision,at:stamp});
        return {status:'withdrawn',revision};
      }
      if(!next.accepted||next.moderation.status!=='active')fail(409,'Official participation is not active for this jam.');
      const accepted=next.accepted, schedule=accepted.manifest.schedule;
      if((action==='join'||action==='submit')&&payload.revision!==accepted.revision)fail(409,'Review and acknowledge the current event rules.');
      const registration=next.registrations[actor.id];
      if(action==='join') {
        if(!inWindow(time,schedule.registrationOpensAt,schedule.registrationClosesAt))fail(409,'Registration is closed.');
        if(schedule.galleryRevealAt&&!joinedRepository)fail(400,'Choose your public project repository to join.');
        if(registration?.repository&&joinedRepository&&registration.repository.id!==joinedRepository.id)fail(409,'This registration is already linked to a different repository.');
        if(!registration&&Object.keys(next.registrations).length>=bound.participants)fail(429,`This jam has reached its capacity of ${bound.participants} participants.`);
        next.registrations[actor.id]={id:actor.id,login:actor.login,status:'joined',revision:accepted.revision,joinedAt:registration?.joinedAt||stamp,updatedAt:stamp,...(joinedRepository?{repository:joinedRepository}:registration?.repository?{repository:registration.repository}:{})};
        return {status:'joined',revision:accepted.revision};
      }
      if(!registration||registration.status!=='joined')fail(409,'Join this jam before changing an entry.');
      if(action==='submit') {
        if(!inWindow(time,schedule.submissionsOpenAt,schedule.submissionsCloseAt))fail(409,'Submissions are closed.');
        if(schedule.galleryRevealAt&&payload.source)fail(400,'Showcase entries use the live project linked when you joined.');
        if(schedule.galleryRevealAt&&(!pagesVerification||Date.parse(pagesVerification.verifiedAt)>=Date.parse(schedule.submissionsCloseAt)))fail(409,'Verify and submit your GitHub Pages project before submissions close.');
        if(!schedule.galleryRevealAt&&!payload.source)fail(400,'Choose an exact source commit.');
        if(registration.repository&&verified.repository.id!==registration.repository.id)fail(409,'Use the repository linked when you joined.');
        const history=next.entries[actor.id]||[];
        // Reserve the final bounded history slot for participant withdrawal or
        // maintainer removal, including after the ordinary entry deadline.
        if(history.length>=bound.entryHistory-1)fail(429,'This entry has reached its submission revision capacity.');
        const entry={participantId:actor.id,login:actor.login,title:payload.title,description:payload.description,demoUrl:payload.demoUrl,instructions:payload.instructions,repository:verified.repository,...(pagesVerification?{pagesVerification}:{}),submittedAt:stamp,status:'active',eventRevision:accepted.revision,revision:digest({actor:actor.id,operationId:op,payload}),previousRevision:history.at(-1)?.revision||null};
        history.push(entry);next.entries[actor.id]=history;registration.revision=accepted.revision;registration.login=actor.login;
        return {status:'submitted',revision:entry.revision};
      }
      if(time>=Date.parse(schedule.submissionsCloseAt))fail(409,'Entry changes are closed.');
      const history=next.entries[actor.id],activeEntry=history?.at(-1);
      if(activeEntry?.status==='active') {
        if(history.length>=bound.entryHistory)fail(429,'This entry has reached its revision capacity.');
        history.push({...structuredClone(activeEntry),status:'withdrawn',withdrawnAt:stamp,previousRevision:activeEntry.revision,revision:digest({actor:actor.id,operationId:op,payload})});
      }
      if(action==='leave') {registration.status='left';registration.updatedAt=stamp;}
      return {status:action==='leave'?'left':'withdrawn'};
    },{pool:SAFETY.has(action)?'safety':'ordinary',legacyDigest,callScope,enforceOrganizerSlot:action==='approve'||action==='resume',
      creatorCancellation:action==='cancel',updateEventTimestamp:action!=='pick-winner'});
  }
  async function settlement(input) {
    keys(input,['actor','scope','operationId','payload']);
    const actor=actorIdentity(input.actor),op=operationId(input.operationId),{scope}=input;
    if(scope!=='proposals'&&(typeof scope!=='string'||!ID.test(scope)))fail(400,'Invalid request scope.');
    if(typeof store.snapshot!=='function')fail(503,'Safe request settlement requires the current registry protocol.');
    const payloadDigest=requestDigest(scope,input.payload,{allowInvalid:true});
    const legacyDigest=legacyRequestDigest(scope,input.payload);
    return withWriteStore((writeStore,transactional)=>settleOnStore(writeStore,transactional,scope,actor,op,payloadDigest,legacyDigest));
  }
  async function settleOnStore(writeStore,transactional,scope,actor,op,payloadDigest,legacyDigest) {
    for(let attempt=0;attempt<(transactional?1:bound.retries);attempt++) {
      const snapshot=await safeCall(()=>writeStore.snapshot());
      const ledger=validateSettlements(snapshot.settlements,bound);
      const rejected=fenced(snapshot,scope,actor,op,payloadDigest,legacyDigest);
      const state=scope==='proposals'?null:(await safeCall(()=>snapshot.read(scope))).state;
      if(state)validateState(state,scope,bound);
      const accepted=scope==='proposals'?await proposalResult(snapshot,actor,op,payloadDigest):recover(state,actor,op,payloadDigest);
      if(rejected&&accepted)fail(503,'Official request history is inconsistent.');
      if(rejected)return rejected;
      if(accepted) {
        const result={...accepted,scope,settlement:'applied'};
        return result;
      }
      const time=currentTime(now),operations=Object.values(ledger.operations),own=operations.filter(item=>item.actorId===actor.id);
      if(operations.length>=bound.settlements||own.length>=bound.actorSettlements)fail(429,'Request settlement capacity is exhausted. Keep the earlier request and contact the maintainer.');
      if(own.filter(item=>item.settledAt>time-bound.writeWindowMs).length>=bound.actorWrites)fail(429,'Too many request settlements. Wait a minute and retry.');
      ledger.operations[settlementKey(scope,actor,op)]={scope,actorId:actor.id,operationId:op,payloadDigest,settledAt:time};
      if(Buffer.byteLength(JSON.stringify(ledger))>bound.settlementBytes)fail(413,'Request settlement storage is full. Keep the earlier request and contact the maintainer.');
      validateSettlements(ledger,bound);
      const applied=await safeCall(()=>writeStore.compareAndSwap(null,snapshot.revision,null,{settlements:ledger}));
      if(applied===true)return closedResult(scope,op);
      if(applied!==false)fail(503,'Official jam records are unavailable. Retry with the same operation ID.');
      if(transactional)fail(503,'The transactional jam registry changed unexpectedly. Retry with the same operation ID.');
    }
    fail(409,'Official records changed repeatedly. Keep the earlier request and retry closing it.');
  }
  return {list,listSummaries,read,readOverview,readModeration,readWinnerSelection,readPage,propose,mutate,settle:settlement};
}
