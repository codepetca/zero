import {JamError,ID,SHA,ACCOUNT,digest,fail,keys,repositoryUrl,text,httpsUrl,hostedManifestData} from './schema.mjs';
import {scheduleChangesData} from './manifest.mjs';
export const ACTIONS=['approve','request-changes','reject','suspend','resume','cancel','withdraw-entry','join','leave','submit','withdraw','pick-winner','edit-schedule','add-project','remove-project'];
export const REVIEW=new Set(['approve','request-changes','reject']);
export const MODERATION=new Set(['suspend','resume','cancel']);
export const SAFETY=new Set(['suspend','cancel','withdraw-entry']);
export const PARTICIPATION=new Set(['join','submit','leave','withdraw']);
export const GAME_PROJECT_ACTIONS=new Set(['add-project','remove-project']);
export function requestPayload(scope,input) {
  if(scope==='proposals') {
    if(Object.hasOwn(input||{},'manifest')) {
      keys(input,['manifest']);
      return {action:'propose',hosting:'zero',manifest:hostedManifestData(input.manifest)};
    }
    // Legacy proposal normalization is retained for recovery and settlement only.
    keys(input,['repositoryUrl','commit']);
    const url=repositoryUrl(input.repositoryUrl).url;
    if(!SHA.test(input.commit||''))fail(400,'Choose an exact 40-character source commit.');
    return {action:'propose',repositoryUrl:url,commit:input.commit};
  }
  if(typeof scope!=='string'||!ID.test(scope))fail(400,'Invalid request scope.');
  keys(input,['action','revision','reason','participantId','source','title','description','demoUrl','instructions','repositoryUrl','repositoryId','projectRevision','participationRevision','publication','schedule'],['action']);
  const {action}=input;
  if(!ACTIONS.includes(action))fail(400,'Unknown jam action.');
  if(GAME_PROJECT_ACTIONS.has(action)) {
    const add=action==='add-project';
    const required=['action','repositoryId',...(add?['repositoryUrl']:[])];
    keys(input,[...required,'projectRevision'],required);
    if(typeof input.repositoryId!=='string'||!ACCOUNT.test(input.repositoryId))fail(400,'Choose a Game Jam project in Zero.');
    if(Object.hasOwn(input,'projectRevision')&&(typeof input.projectRevision!=='string'||
        input.projectRevision!==''&&!/^[a-f0-9]{64}$/.test(input.projectRevision)))fail(400,'Reload your Game Jam projects in Zero.');
    return {action,repositoryId:input.repositoryId,...(add?{repositoryUrl:repositoryUrl(input.repositoryUrl).url}:{}),
      ...(Object.hasOwn(input,'projectRevision')?{projectRevision:input.projectRevision}:{})};
  }
  if(action==='edit-schedule') {
    keys(input,['action','revision','schedule']);
    if(typeof input.revision!=='string'||!/^[a-f0-9]{64}$/.test(input.revision))fail(400,'Open the current jam schedule before editing.');
    return {action,revision:input.revision,schedule:scheduleChangesData(input.schedule)};
  }
  const allowed=['action',...(PARTICIPATION.has(action)?['participationRevision']:[]),...(REVIEW.has(action)?['revision','reason']:MODERATION.has(action)?['reason']:action==='withdraw-entry'?['participantId','reason']:action==='pick-winner'?['participantId','revision']:action==='join'?['revision','repositoryUrl','repositoryId','demoUrl']:action==='submit'?['revision',...(Object.hasOwn(input,'publication')?['publication']:['source','title','description','demoUrl','instructions'])]:[])];
  keys(input,allowed,['action']);
  const payload={action};
  // Preserve historical participation bindings for recovery and settlement;
  // admission of new participation forms remains a service responsibility.
  if(Object.hasOwn(input,'participationRevision')) {
    if(typeof input.participationRevision!=='string'||!/^[a-f0-9]{64}$/.test(input.participationRevision))fail(400,'Refresh the jam before changing participation.');
    payload.participationRevision=input.participationRevision;
  }
  if(REVIEW.has(action)||action==='join'||action==='submit') {if(!/^[a-f0-9]{64}$/.test(input.revision||''))fail(400,'A reviewed event revision is required.');payload.revision=input.revision;}
  if(action==='join'&&Object.hasOwn(input,'repositoryUrl'))payload.repositoryUrl=repositoryUrl(input.repositoryUrl).url;
  if(action==='join'&&Object.hasOwn(input,'repositoryId')) {
    if(!payload.repositoryUrl||typeof input.repositoryId!=='string'||!ACCOUNT.test(input.repositoryId)||input.repositoryId.trim()!==input.repositoryId)
      fail(400,'Choose a Game Jam and your public GitHub repository in Zero.');
    payload.repositoryId=input.repositoryId;
  }
  // Keep old repo+demo Join digests recoverable; new admission creates no entry.
  if(action==='join'&&Object.hasOwn(input,'demoUrl'))payload.demoUrl=httpsUrl(input.demoUrl);
  if(MODERATION.has(action)||['request-changes','reject','withdraw-entry'].includes(action))payload.reason=text(input.reason,SAFETY.has(action)?256:2000);
  else if(Object.hasOwn(input,'reason'))payload.reason=text(input.reason,2000,true);
  if(action==='withdraw-entry'||action==='pick-winner'){if(typeof input.participantId!=='string'||!ACCOUNT.test(input.participantId))fail(400,'Choose a valid participant ID.');payload.participantId=input.participantId;}
  if(action==='pick-winner') {
    if(typeof input.revision!=='string'||!/^[a-f0-9]{64}$/.test(input.revision))fail(400,'Choose a submitted entry.');
    payload.revision=input.revision;
  }
  if(action==='submit') {
    if(Object.hasOwn(input,'publication')) {
      const {publication}=input;
      const required=['repositoryId','pagesUrl','commit','runId','entryRevision'];
      keys(publication,[...required,'projectRevision'],required);
      if(typeof publication.repositoryId!=='string'||!ACCOUNT.test(publication.repositoryId)||
          typeof publication.commit!=='string'||!SHA.test(publication.commit)||
          typeof publication.runId!=='string'||!ACCOUNT.test(publication.runId)||!Number.isSafeInteger(Number(publication.runId))||
          typeof publication.entryRevision!=='string'||publication.entryRevision!==''&&!/^[a-f0-9]{64}$/.test(publication.entryRevision)||
          Object.hasOwn(publication,'projectRevision')&&(typeof publication.projectRevision!=='string'||publication.projectRevision!==''&&!/^[a-f0-9]{64}$/.test(publication.projectRevision)))
        fail(400,'Publish the linked project in Zero to submit its verified build.');
      payload.publication={repositoryId:publication.repositoryId,pagesUrl:httpsUrl(publication.pagesUrl),commit:publication.commit,
        runId:publication.runId,entryRevision:publication.entryRevision,
        ...(Object.hasOwn(publication,'projectRevision')?{projectRevision:publication.projectRevision}:{})};
      return payload;
    }
    // Legacy submissions preserve their normalized payload and digest. A live
    // showcase uses the repository bound at Join and has no commit snapshot.
    if(Object.hasOwn(input,'source')) {
      keys(input.source,['repositoryUrl','commit']);
      if(!SHA.test(input.source.commit||''))fail(400,'Choose an exact 40-character source commit.');
      payload.source={repositoryUrl:repositoryUrl(input.source.repositoryUrl).url,commit:input.source.commit};
    }
    Object.assign(payload,{title:text(input.title,120),description:text(input.description,2000),demoUrl:httpsUrl(input.demoUrl),instructions:text(input.instructions===undefined?'':input.instructions,4000,true)});
  }
  return payload;
}
// Newly valid forms may already have an exact-representation invalidJSON fence.
// This alias is recovery-only: never use it to deduplicate distinct payloads.
export function legacyRequestDigest(scope,payload) {
  if(!(scope==='proposals'&&Object.hasOwn(payload||{},'manifest')||payload?.action==='pick-winner'||payload?.action==='edit-schedule'||payload?.action==='join'&&(Object.hasOwn(payload,'repositoryUrl')||Object.hasOwn(payload,'demoUrl'))||
    payload?.action==='submit'&&!Object.hasOwn(payload,'source')&&!Object.hasOwn(payload,'publication')||PARTICIPATION.has(payload?.action)&&Object.hasOwn(payload,'participationRevision')))return;
  try{requestPayload(scope,payload);}catch(error){if(error instanceof JamError)return;throw error;}
  return digest({invalidJSON:JSON.stringify(payload)});
}
export function requestDigest(scope,payload,{allowInvalid=false}={}) {
  try{return digest(requestPayload(scope,payload));}
  catch(error) {
    if(!allowInvalid||!(error instanceof JamError)||![400,413].includes(error.status))throw error;
    // Invalid old forms could never pass intake, but still receive a durable key
    // fence. Bound even direct service callers before serializing malformed data.
    let nodes=0;
    function bounded(value,depth=0){
      if(++nodes>256||depth>8)fail(400,'Earlier request details are too complex.');
      if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
      if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype&&!Array.isArray(value))fail(400,'Enter valid earlier request details.');
      for(const item of Object.values(value))bounded(item,depth+1);
    }
    bounded(payload);const serialized=JSON.stringify(payload);
    if(Buffer.byteLength(serialized)>16384)fail(413,'Earlier request details are too large.');
    return digest({invalidJSON:serialized});
  }
}
