import {JamError, LIMITS, ID, SHA, ACCOUNT, SAFETY_SLOT_BYTES, safetySlots, operationCounts, stateBudget, actorIdentity, digest, fail, keys, manifestData, repositoryData, repositoryUrl, text, httpsUrl, validateState} from './schema.mjs';
export {JamError} from './schema.mjs';

const ACTIONS = ['approve','request-changes','reject','suspend','resume','cancel','withdraw-entry','join','leave','submit','withdraw'];
const REVIEW = new Set(['approve','request-changes','reject']);
const MODERATION = new Set(['suspend','resume','cancel']);
const SAFETY = new Set(['suspend','cancel','withdraw-entry']);
const operationKey = (actor,id) => `${actor.id}:${id}`;
function operationId(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) fail(400,'Use a valid operation ID.'); return value; }
function currentTime(now) { const value=now();if(!Number.isSafeInteger(value))fail(503,'Jam clock is unavailable.');return value; }
function inWindow(time,opens,closes) { return time>=Date.parse(opens)&&time<Date.parse(closes); }
function initial(id,actor,repositoryId,time) {
  return {schema:1,id,creator:actor,repositoryId,proposals:[],accepted:null,moderation:{status:'active'},registrations:{},entries:{},operations:{},history:[],updatedAt:time};
}

export function createJamService({store,verifySource,maintainerIds=[],now=Date.now,limits={}}={}) {
  if (!store?.read || !store?.compareAndSwap || !store?.list || typeof verifySource !== 'function') fail(503,'ZeroJams is unavailable.');
  if (!Array.isArray(maintainerIds) || maintainerIds.some(id=>typeof id!=='string'||!ACCOUNT.test(id))) fail(503,'Jam maintainers are not configured.');
  const maintainers=new Set(maintainerIds), bound={...LIMITS,...limits};
  if (Object.keys(limits).some(key=>!Object.hasOwn(LIMITS,key)) || Object.entries(bound).some(([key,value])=>!Number.isSafeInteger(value)||value<1||value>LIMITS[key])) fail(503,'Invalid jam pilot limits.');
  if(bound.entryHistory<2||bound.stateBytes-safetySlots(bound)*SAFETY_SLOT_BYTES<65536)fail(503,'Jam limits must preserve ordinary capacity and reserved moderation space.');
  async function safeCall(work) { try{return await work();}catch(error){if(error instanceof JamError)throw error;fail(503,'Official jam records are unavailable. Retry with the same operation ID.');} }
  async function load(id) {
    if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');
    const value=await safeCall(()=>store.read(id));
    if(!value || value.state===null&&value.revision!==null || value.state!==null&&(typeof value.revision!=='string'||!value.revision))fail(503,'Official jam records are unavailable.');
    return {...value,state:value.state===null?null:validateState(value.state,id,bound)};
  }
  async function ids() {
    const result=await safeCall(()=>store.list());
    if(!Array.isArray(result)||result.length>bound.events||result.some(id=>typeof id!=='string'||!ID.test(id))||new Set(result).size!==result.length)fail(503,'The jam registry listing is unavailable.');
    return result;
  }
  async function source(input) {
    const result=await safeCall(()=>verifySource(input));
    if(!result)fail(503,'The public source could not be verified.');
    const repository=repositoryData(result.repository,input.actor,input.commit);
    const expected=repositoryUrl(input.repositoryUrl);
    if(repository.fullName.toLowerCase()!==`${expected.owner}/${expected.repo}`.toLowerCase())fail(403,'The verified source does not match the chosen repository.');
    return {repository,...(input.manifest?{manifest:manifestData(result.manifest)}:{})};
  }
  function summary(state,time) {
    const proposal=state.accepted||state.proposals.at(-1), manifest=proposal.manifest;
    const participants=Object.values(state.registrations).filter(item=>item.status==='joined').map(({id,login})=>({id,login}));
    const entries=Object.values(state.entries).map(history=>history.at(-1)).filter(item=>item?.status==='active'&&state.registrations[item.participantId]?.status==='joined').map(({participantId,login,revision,title,description,demoUrl,instructions,repository,submittedAt})=>({participantId,login,revision,title,description,demoUrl,instructions,repository,submittedAt}));
    const active=!!state.accepted&&state.moderation.status==='active';
    const approvalHistory=state.proposals.filter(proposal=>proposal.status==='approved').map(proposal=>({revision:proposal.revision,approvedAt:proposal.reviewedAt,manifest:structuredClone(proposal.manifest)}));
    return {id:state.id,revision:state.accepted?.revision||null,...manifest,approvalHistory,reviewStatus:state.proposals.at(-1).status,moderation:structuredClone(state.moderation),registrationOpen:active&&inWindow(time,manifest.schedule.registrationOpensAt,manifest.schedule.registrationClosesAt),submissionsOpen:active&&inWindow(time,manifest.schedule.submissionsOpenAt,manifest.schedule.submissionsCloseAt),participantCount:participants.length,participants,entries,updatedAt:state.updatedAt};
  }
  function recover(state,actor,op,payloadDigest) {
    const previous=state?.operations[operationKey(actor,op)];
    if(!previous)return null;
    if(previous.payloadDigest!==payloadDigest)fail(409,'This operation ID was used for different information.');
    return structuredClone(previous.result);
  }
  async function commitLoop(id,actor,op,payloadDigest,change,{create=false,pool='ordinary'}={}) {
    for(let attempt=0;attempt<bound.retries;attempt++) {
      const {state,revision}=await load(id);
      const previous=recover(state,actor,op,payloadDigest);if(previous)return previous;
      const time=currentTime(now),stamp=new Date(time).toISOString();
      if(!state&&!create)fail(404,'Jam not found.');
      if(!state&&(await ids()).length>=bound.events)fail(429,'The jam pilot is at event capacity.');
      const next=state?structuredClone(state):initial(id,actor,id.slice(4),stamp);
      const counts=operationCounts(next);
      if(pool==='safety') {
        if(!maintainers.has(actor.id))fail(403,'A Zero maintainer must perform this action.');
        if(counts.safety>=safetySlots(bound))fail(429,'Reserved safety moderation capacity is exhausted. Operator intervention is required.');
      } else {
        if(counts.ordinary>=bound.operations)fail(429,'This jam has reached its ordinary operation capacity.');
        const recentWrites=Object.values(next.operations).filter(operation=>operation.pool==='ordinary'&&operation.actorId===actor.id&&Number.isSafeInteger(operation.acceptedAt)&&operation.acceptedAt>time-bound.writeWindowMs).length;
        if(recentWrites>=bound.actorWrites)fail(429,'Too many jam changes. Wait a minute and retry with the same operation ID.');
      }
      const previousBytes=Buffer.byteLength(JSON.stringify(next));
      const detail=change(next,time,stamp);
      const result={eventId:id,operationId:op,...detail};
      next.updatedAt=stamp;next.operations[operationKey(actor,op)]={actorId:actor.id,acceptedAt:time,payloadDigest,result,pool};
      const nextBytes=Buffer.byteLength(JSON.stringify(next));
      if(pool==='safety'&&nextBytes-previousBytes>SAFETY_SLOT_BYTES)fail(413,'This safety action exceeds its reserved record capacity.');
      if(nextBytes>stateBudget(next,bound))fail(413,'This jam has reached its ordinary record capacity; safety moderation space is reserved.');
      validateState(next,id,bound);
      if(await safeCall(()=>store.compareAndSwap(id,revision,next)))return structuredClone(result);
    }
    fail(409,'This jam changed repeatedly. Retry with the same operation ID.');
  }
  async function list(actor) {
    if(actor)actor=actorIdentity(actor);
    const events=[],proposals=[],canMaintain=!!actor&&maintainers.has(actor.id),time=currentTime(now);
    for(const id of await ids()) {
      const {state}=await load(id);
      if(state?.accepted&&state.moderation.status==='active')events.push(summary(state,time));
      const proposal=state?.proposals.at(-1);
      if(canMaintain&&proposal&&['submitted','changes-requested'].includes(proposal.status))proposals.push({id,title:proposal.manifest.title,type:proposal.manifest.type,revision:proposal.revision,status:proposal.status,organizerLogin:state.creator.login,submittedAt:proposal.proposedAt});
    }
    return {events,canMaintain,...(canMaintain?{proposals}:{})};
  }
  async function read(id,actor) {
    if(actor)actor=actorIdentity(actor);
    const {state}=await load(id),canMaintain=!!actor&&maintainers.has(actor.id);
    const authorized=state&&!!actor&&(state.creator.id===actor.id||canMaintain);
    if(!state||!state.accepted&&!authorized)fail(404,'Jam not found.');
    const registration=actor&&state.registrations[actor.id]||null;
    const entryHistory=actor&&state.entries[actor.id];
    const latestEntry=entryHistory?.at(-1);
    // Keep the durable safety revision compact while returning useful source
    // metadata to the participant whose submission was removed.
    const entry=latestEntry?.moderatedBy?{...entryHistory.find(entry=>entry.revision===latestEntry.previousRevision),...latestEntry}:latestEntry||null;
    const proposal=authorized?state.proposals.at(-1):null;
    return {event:summary(state,currentTime(now)),registration:structuredClone(registration),entry:structuredClone(entry),canMaintain,...(proposal?{proposal:structuredClone(proposal)}:{})};
  }
  async function propose(input) {
    keys(input,['actor','operationId','repositoryUrl','commit']);
    const actor=actorIdentity(input.actor),op=operationId(input.operationId),url=repositoryUrl(input.repositoryUrl).url;
    if(!SHA.test(input.commit||''))fail(400,'Choose an exact 40-character source commit.');
    const payloadDigest=digest({action:'propose',repositoryUrl:url,commit:input.commit});
    // Proposal requests do not carry an event ID. The bounded pilot listing
    // lets a retry recover its already committed result without relying on the
    // creator repository still being available, unchanged or in the same hands.
    for(const existingId of await ids()) {
      const existing=(await load(existingId)).state;
      if(existing?.creator.id===actor.id&&existing.proposals.some(proposal=>`https://github.com/${proposal.repository.fullName}`.toLowerCase()===url.toLowerCase())) {
        const previous=recover(existing,actor,op,payloadDigest);if(previous)return previous;
      }
    }
    const verified=await source({actor,repositoryUrl:url,commit:input.commit,manifest:true});
    const id=`jam-${verified.repository.id}`;
    const proposalRevision=digest(verified);
    return commitLoop(id,actor,op,payloadDigest,(next,time,stamp)=>{
      if(next.creator.id!==actor.id||next.repositoryId!==verified.repository.id)fail(403,'Repository transfers do not transfer jam organizer authority.');
      if(next.moderation.status==='cancelled')fail(409,'This official jam was cancelled.');
      if(next.proposals.some(proposal=>proposal.revision===proposalRevision))fail(409,'This exact proposal has already been recorded. Use its existing review.');
      if(next.proposals.length>=bound.proposals)fail(429,'This jam has reached its proposal capacity.');
      next.creator.login=actor.login;
      next.proposals.push({revision:proposalRevision,...verified,status:'submitted',reason:'',proposedAt:stamp});
      return {revision:proposalRevision,status:'submitted'};
    },{create:true});
  }
  async function mutate(input) {
    keys(input,['id','actor','operationId','action','revision','reason','participantId','source','title','description','demoUrl','instructions'],['id','actor','operationId','action']);
    const actor=actorIdentity(input.actor),op=operationId(input.operationId),{id,action}=input;
    if(!ACTIONS.includes(action))fail(400,'Unknown jam action.');
    const allowed=['id','actor','operationId','action',...(REVIEW.has(action)?['revision','reason']:MODERATION.has(action)?['reason']:action==='withdraw-entry'?['participantId','reason']:action==='join'?['revision']:action==='submit'?['revision','source','title','description','demoUrl','instructions']:[])];
    if(Object.keys(input).some(key=>!allowed.includes(key)))fail(400,'Unexpected fields for this action.');
    const payload={action};
    if(REVIEW.has(action)||action==='join'||action==='submit') { if(!/^[a-f0-9]{64}$/.test(input.revision||''))fail(400,'A reviewed event revision is required.');payload.revision=input.revision; }
    if(MODERATION.has(action)||['request-changes','reject','withdraw-entry'].includes(action))payload.reason=text(input.reason,SAFETY.has(action)?256:2000);
    else if(Object.hasOwn(input,'reason'))payload.reason=text(input.reason,2000,true);
    if(action==='withdraw-entry') {if(typeof input.participantId!=='string'||!ACCOUNT.test(input.participantId))fail(400,'Choose a valid participant ID.');payload.participantId=input.participantId;}
    if(action==='submit') {
      keys(input.source,['repositoryUrl','commit']);
      if(!SHA.test(input.source.commit||''))fail(400,'Choose an exact 40-character source commit.');
      payload.source={repositoryUrl:repositoryUrl(input.source.repositoryUrl).url,commit:input.source.commit};
      Object.assign(payload,{title:text(input.title,120),description:text(input.description,2000),demoUrl:httpsUrl(input.demoUrl),instructions:text(input.instructions === undefined ? '' : input.instructions,4000,true)});
    }
    const payloadDigest=digest(payload);
    // Read before expensive source verification so accepted retries still recover
    // if the source becomes unavailable or the deadline passes.
    const before=(await load(id)).state;
    if(!before)fail(404,'Jam not found.');
    const previous=recover(before,actor,op,payloadDigest);if(previous)return previous;
    if((REVIEW.has(action)||MODERATION.has(action)||action==='withdraw-entry')&&!maintainers.has(actor.id))fail(403,'A Zero maintainer must perform this action.');
    if(action==='approve'&&before.creator.id===actor.id)fail(403,'A different maintainer must approve your jam.');
    const verified=action==='submit'?await source({...payload.source,actor,manifest:false}):null;
    return commitLoop(id,actor,op,payloadDigest,(next,time,stamp)=>{
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
        if(!maintainers.has(actor.id))fail(403,'A Zero maintainer must perform this action.');
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
        if(!registration&&Object.keys(next.registrations).length>=bound.participants)fail(429,'This jam has reached its participant capacity.');
        next.registrations[actor.id]={id:actor.id,login:actor.login,status:'joined',revision:accepted.revision,joinedAt:registration?.joinedAt||stamp,updatedAt:stamp};
        return {status:'joined',revision:accepted.revision};
      }
      if(!registration||registration.status!=='joined')fail(409,'Join this jam before changing an entry.');
      if(action==='submit') {
        if(!inWindow(time,schedule.submissionsOpenAt,schedule.submissionsCloseAt))fail(409,'Submissions are closed.');
        const history=next.entries[actor.id]||[];
        // Reserve the final bounded history slot for participant withdrawal or
        // maintainer removal, including after the ordinary entry deadline.
        if(history.length>=bound.entryHistory-1)fail(429,'This entry has reached its submission revision capacity.');
        const entry={participantId:actor.id,login:actor.login,title:payload.title,description:payload.description,demoUrl:payload.demoUrl,instructions:payload.instructions,repository:verified.repository,submittedAt:stamp,status:'active',eventRevision:accepted.revision,revision:digest({actor:actor.id,operationId:op,payload}),previousRevision:history.at(-1)?.revision||null};
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
    },{pool:SAFETY.has(action)?'safety':'ordinary'});
  }
  return {list,read,propose,mutate};
}
