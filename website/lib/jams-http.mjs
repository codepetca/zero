import {hubConfig, readSession, sameOrigin, equalSecret, githubUser, json} from './hub-github-auth.mjs';
import {createJamRuntime, jamServiceConfig} from './jams-runtime.mjs';
import {JamError,JAM_PROJECTION_REVISION,JAM_PAGE_METADATA} from '../../jams/service.mjs';
import {createJamGalleryCursor,readJamGalleryCursor} from './jam-gallery-cursor.mjs';
import {createHubRequestDeadline} from './hub-request-deadline.mjs';
import {readJamDestinationBinding} from './jam-destination-binding.mjs';
import {readJamHubVisibility} from './jam-hub-visibility.mjs';
import {repositoryParts} from './hub-project-status.mjs';
import {LIMITS} from '../../jams/schema.mjs';
import {localJamAuthorityRequested} from './jams-default-authority.mjs';

const actions = new Set(['approve','request-changes','reject','suspend','resume','cancel','withdraw-entry','join','leave','submit','withdraw']);
const actionKeys = new Set(['operationId','action','revision','reason','participantId','source','title','description','demoUrl','instructions','repositoryUrl']);
const proposalKeys = new Set(['operationId','manifest']);
const unavailable = () => json({configured:false,error:'ZeroJams participation is not available yet. You can still prepare your proposal.'},503);
const validId = value => typeof value === 'string' && /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/.test(value);
export const MAX_PUBLIC_JAM_DESTINATIONS = LIMITS.participants;
const numericId = value => typeof value === 'string' && /^[1-9][0-9]{0,19}(?![\s\S])/.test(value);
const galleryUnavailable = () => {throw new JamError(503,'The public jam gallery is unavailable. Try again shortly.');};
const FINAL_VISIBILITY_TIME=Symbol('ZeroJams final visibility time');

// Only event.entries is public discovery. Personal registration/entry/proposal
// fields remain the participant's or maintainer's unchanged private projection.
async function publicGallery(result, options, deadline, directory, actor) {
  const events=directory?result.events:[result.event];
  if(!Array.isArray(events))galleryUnavailable();
  const destinations=new Map();
  for(const event of events) {
    if(!event||event.entries!==undefined&&!Array.isArray(event.entries))galleryUnavailable();
    for(const entry of event.entries??[]) {
      const repository=entry?.repository,url=`https://github.com/${repository?.fullName}`;
      const parts=repositoryParts(url);
      if(!numericId(repository?.id)||!numericId(repository?.ownerId)||!parts||
          `${parts.owner}/${parts.repo}`!==repository.fullName)galleryUnavailable();
      destinations.set(url,null);
      if(destinations.size>MAX_PUBLIC_JAM_DESTINATIONS) {
        // A directory can contain more projects than one event. Preserve event
        // discovery and the maintainer inbox without returning unverified links;
        // individual event pages remain available under the per-event limit.
        if(directory) {
          const summaries=events.map(({entries:ignored,...summary})=>summary);
          return {...result,events:summaries,galleriesDeferred:true};
        }
        galleryUnavailable();
      }
    }
  }
  if(!destinations.size)return result;
  // Names and Pages observations are slower than the service projection. Its
  // pinned revision must survive this boundary so a later withdrawal, entry
  // replacement or event moderation cannot authorize stale public entry data.
  const projectionRevision=result[JAM_PROJECTION_REVISION];
  if(typeof projectionRevision!=='string'||!/^[a-f0-9]{40}$/.test(projectionRevision))galleryUnavailable();
  const urls=[...destinations.keys()];let next=0;
  await deadline.run(async signal=>{
    await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{
      while(next<urls.length) {
        deadline.check();const url=urls[next++];
        const binding=await (options.destinationReader??readJamDestinationBinding)(url,{signal});
        deadline.check();
        const parts=repositoryParts(binding?.repositoryUrl);
        if(!numericId(binding?.repositoryId)||!numericId(binding?.ownerId)||!parts||
            binding.owner!==parts.owner||binding.repo!==parts.repo||
            binding.repositoryUrl.toLowerCase()!==url.toLowerCase())galleryUnavailable();
        destinations.set(url,binding);
      }
    }));
  });
  // Service discovery is older than the potentially slow namespace lookups.
  // Re-read complete trusted authority before serializing either public lane.
  const visibility=await deadline.run(signal=>(options.visibilityReader??readJamHubVisibility)({env:options.env,signal}));
  if(!visibility||typeof visibility.revision!=='string'||!/^[a-f0-9]{40}$/.test(visibility.revision)||
      !Number.isSafeInteger(visibility.observedAt)||visibility.observedAt<0||
      typeof visibility.isHeld!=='function'||visibility.revision!==projectionRevision)galleryUnavailable();
  const held=id=>{const value=visibility.isHeld(id);if(typeof value!=='boolean')galleryUnavailable();return value;};
  const projected=events.map(event=>{
    if(!event.entries)return {...event};
    let identityMismatch=false;
    const entries=event.entries.filter(entry=>{
      const repository=entry.repository,binding=destinations.get(`https://github.com/${repository.fullName}`);
      // Check both identities even on a confirmed namespace replacement. Neither
      // a historical ID nor a previously revealed event authorizes its new owner.
      const storedHeld=held(repository.id),currentHeld=held(binding.repositoryId);
      const mismatch=binding.repositoryId!==repository.id||binding.ownerId!==repository.ownerId;
      identityMismatch ||= mismatch;
      return !storedHeld&&!currentHeld&&!mismatch;
    });
    return {...event,entries,...(identityMismatch?{galleryIncomplete:true}:{})};
  });
  deadline.check();
  const response={...result,...(directory?{events:projected}:{event:projected[0]})};
  if(!directory&&actor&&result.canMaintain===true) {
    const publicParticipants=new Set(projected[0].entries.map(entry=>entry.participantId));
    if(result.moderationEntries!==undefined&&!Array.isArray(result.moderationEntries))galleryUnavailable();
    const moderation=new Map();
    for(const entry of [...result.moderationEntries??[],...events[0].entries]) {
      if(!publicParticipants.has(entry.participantId)&&!moderation.has(entry.participantId))moderation.set(entry.participantId,entry);
    }
    response.moderationEntries=[...moderation.values()];
  }
  return Object.defineProperty(response,FINAL_VISIBILITY_TIME,{value:visibility.observedAt});
}

function failure(error,signal) {
  if(signal?.aborted)return json({error:'ZeroJams could not confirm this request. Keep it and retry with the same operation ID.',configured:true},503);
  if (error instanceof JamError && [400,401,403,404,409,413,429,503].includes(error.status))
    return json({error:error.message,configured:true}, error.status);
  return json({error:'ZeroJams could not confirm this request. Keep your details and retry with the same request.',configured:true},503);
}

function optionsFor(options) {
  const now = typeof options.now === 'function' ? options.now : () => options.now ?? Date.now();
  return {...options,env:options.env ?? process.env,fetchImpl:options.fetchImpl ?? fetch,now};
}

function enabled(options) {
  return options.env.ZERO_JAMS_ENABLED === '1' &&
    (options.service !== undefined || localJamAuthorityRequested(options.env) || jamServiceConfig(options.env) !== null);
}

async function serviceFor(options, sourceToken) {
  return options.service ?? await createJamRuntime({...options,sourceToken});
}

async function bodyJson(request,maxBytes=16_384) {
  const reader = request.body?.getReader();
  if (!reader) throw new JamError(400,'Enter the request details.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const value = await reader.read();
      if (value.done) break;
      size += value.value.byteLength;
      if (size > maxBytes) throw new JamError(413,'This request is too large. Shorten the project details.');
      chunks.push(value.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new JamError(400,'Enter valid request details.'); }
}

export async function getJamsResponse(request, inputOptions = {}) {
  const options = optionsFor(inputOptions);
  if (!enabled(options)) return unavailable();
  // Each response obtains fresh registry authority for cross-gallery holds.
  const config = hubConfig(options.env);
  const session = config && await readSession(request,config,options.now(),options.env);
  const actor = session ? {id:session.id,login:session.login} : undefined;
  const deadline=createHubRequestDeadline({budgetMs:options.responseBudgetMs??18_000,signal:request.signal,now:options.deadlineNow});
  try {
    const service = await deadline.run(()=>serviceFor(options));
    const summaries=new URL(request.url).searchParams.get('view')==='summaries';
    const projection=await deadline.run(signal=>summaries?service.listSummaries(actor,{signal}):service.list(actor,{signal}));
    const visible=await publicGallery(projection,options,deadline,true,actor);
    // Legacy full directories have no reveal-horizon fence; a generic warning
    // could disclose that an entry became held after an earlier observation.
    const events=visible.events.map(({galleryIncomplete:ignored,...event})=>event);
    const checkedAt=options.now();
    if(visible[FINAL_VISIBILITY_TIME]!==undefined&&(!Number.isSafeInteger(checkedAt)||checkedAt<visible[FINAL_VISIBILITY_TIME]))galleryUnavailable();
    const result = {configured:true,...visible,events,checkedAt:new Date(checkedAt).toISOString()};
    deadline.check();
    return json(result);
  } catch (error) { return failure(error,deadline.signal); }
  finally {deadline.dispose();}
}

export async function getJamResponse(request, id, inputOptions = {}) {
  if (!validId(id)) return json({error:'Unknown jam.'},404);
  const options = optionsFor(inputOptions);
  if (!enabled(options)) return unavailable();
  const deadline=createHubRequestDeadline({budgetMs:options.responseBudgetMs??18_000,signal:request.signal,now:options.deadlineNow});
  try {
    const config = hubConfig(options.env);
    const session = config && await readSession(request,config,options.now(),options.env);
    const actor = session ? {id:session.id,login:session.login} : undefined;
    const service = await deadline.run(()=>serviceFor(options));
    const params=new URL(request.url).searchParams,paged=params.get('view')==='gallery',overview=params.get('view')==='overview',moderation=params.get('view')==='moderation';
    if(moderation) {
      const result=await deadline.run(signal=>service.readModeration(id,actor,{signal}));
      deadline.check();
      return json({configured:true,...result,checkedAt:new Date(options.now()).toISOString()});
    }
    let page;
    if(paged) {
      if(!config||params.getAll('cursor').length>1)galleryUnavailable();
      const cursor=params.get('cursor');
      page=cursor===null?{offset:0}:readJamGalleryCursor(cursor,id,options.now(),config);
      if(!page)throw new JamError(409,'The gallery changed or its page expired. Start again from the first page.');
    }
    const projection=await deadline.run(signal=>paged?service.readPage(id,actor,{signal,...page}):overview?service.readOverview(id,actor,{signal}):service.read(id,actor,{signal}));
    const metadata=paged?projection[JAM_PAGE_METADATA]:null;
    if(paged&&(!metadata||typeof metadata.revision!=='string'||!/^[a-f0-9]{40}$/.test(metadata.revision)||metadata.revision!==projection[JAM_PROJECTION_REVISION]||!Number.isSafeInteger(metadata.observedAt)||metadata.observedAt<0||
        !(metadata.validUntil===null||Number.isSafeInteger(metadata.validUntil)&&metadata.validUntil>0)||
        metadata.nextOffset!==null&&(!Number.isSafeInteger(metadata.nextOffset)||metadata.nextOffset<=page.offset)))galleryUnavailable();
    let visible=await publicGallery(projection,options,deadline,false,actor);
    const visibilityTime=visible[FINAL_VISIBILITY_TIME];
    if(!paged) {
      // Only paged responses fence clock/reveal transitions through the final
      // HTTP check. Keep legacy projections neutral about withheld entries.
      const {galleryIncomplete:ignored,...event}=visible.event;
      visible={...visible,event};
    }
    const checkedAt=options.now();
    if(visibilityTime!==undefined&&(!Number.isSafeInteger(checkedAt)||checkedAt<visibilityTime))galleryUnavailable();
    if(paged&&(!Number.isSafeInteger(checkedAt)||checkedAt<metadata.observedAt||metadata.validUntil!==null&&checkedAt>=metadata.validUntil))
      throw new JamError(409,'The gallery changed. Start again from the first page.');
    let nextCursor=null;
    if(paged&&metadata.nextOffset!==null) {
      nextCursor=createJamGalleryCursor({id,offset:metadata.nextOffset,revision:metadata.revision,validUntil:metadata.validUntil,now:checkedAt},config);
      if(!nextCursor)galleryUnavailable();
    }
    const result = {configured:true,...visible,...(paged?{nextCursor}:{}),checkedAt:new Date(checkedAt).toISOString()};
    deadline.check();
    return json(result);
  } catch (error) { return failure(error,deadline.signal); }
  finally {deadline.dispose();}
}

async function postResponse(request, id, proposal, inputOptions,settlement=false) {
  const options = optionsFor(inputOptions);
  if (!enabled(options)) return unavailable();
  if (!proposal && !settlement && !validId(id)) return json({error:'Unknown jam.'},404);
  const config = hubConfig(options.env);
  if (!config) return json({error:'GitHub sign-in is unavailable.'},503);
  if (!sameOrigin(request,config)) return json({error:'Open this action on Zero to continue.'},403);
  const session = await readSession(request,config,options.now(),options.env);
  if (!session) return json({error:'Sign in to GitHub to continue.'},401);
  if (!equalSecret(request.headers.get('x-hub-csrf'),session.csrf))
    return json({error:'Your session changed. Reconnect GitHub and try again.'},403);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
    return json({error:'Expected JSON request details.'},415);
  let deadline;
  try {
    deadline=createHubRequestDeadline({budgetMs:options.responseBudgetMs??18_000,signal:request.signal,now:options.deadlineNow});
    const body = await deadline.run(()=>bodyJson(request,settlement?17_408:16_384));
    const allowed = settlement?new Set(['operationId','scope','payload']):proposal ? proposalKeys : actionKeys;
    if (Object.keys(body).some(key => !allowed.has(key)) || !proposal && !settlement && !actions.has(body.action))
      return json({error:'This jam request contains unsupported details.'},400);
    if(settlement&&Buffer.byteLength(JSON.stringify({operationId:body.operationId,...body.payload}))>16_384)return json({error:'The original request is too large.',configured:true},413);
    // Session identity is sealed, but an expired/revoked GitHub authorization
    // must not continue accepting official actions for the remaining cookie age.
    const user = await deadline.run(()=>githubUser(session.token,options.fetchImpl));
    if (String(user.id) !== session.id || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user.login || ''))
      return json({error:'Your GitHub account changed. Reconnect to continue.'},401);
    const actor = {id:session.id,login:user.login};
    const service = await deadline.run(()=>serviceFor(options,session.token));
    // Expiry stops waiting, but cannot undo a dispatched registry write. Keep
    // the original operation ID until its durable settlement is confirmed.
    const result = await deadline.run(signal=>settlement?service.settle({...body,actor}):proposal?service.propose({...body,actor}):service.mutate({...body,id,actor},{signal}));
    if(!settlement&&result.settlement==='not-applied')return json({configured:true,...result,error:'This earlier request was closed without being applied. Reload Zero to start a new action.'},409);
    return json({configured:true,...result});
  } catch (error) { return failure(error,deadline?.signal); }
  finally { deadline?.dispose(); }
}

export const postJamProposalResponse = (request, options = {}) => postResponse(request,null,true,options);
export const postJamActionResponse = (request, id, options = {}) => postResponse(request,id,false,options);

export const postJamSettlementResponse = (request,options={})=>postResponse(request,null,false,options,true);
