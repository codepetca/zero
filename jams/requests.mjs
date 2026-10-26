import {JamError,ID,SHA,ACCOUNT,digest,fail,keys,repositoryUrl,text,httpsUrl} from './schema.mjs';
export const ACTIONS=['approve','request-changes','reject','suspend','resume','cancel','withdraw-entry','join','leave','submit','withdraw'];
export const REVIEW=new Set(['approve','request-changes','reject']);
export const MODERATION=new Set(['suspend','resume','cancel']);
export const SAFETY=new Set(['suspend','cancel','withdraw-entry']);
export function requestPayload(scope,input) {
  if(scope==='proposals') {
    keys(input,['repositoryUrl','commit']);
    const url=repositoryUrl(input.repositoryUrl).url;
    if(!SHA.test(input.commit||''))fail(400,'Choose an exact 40-character source commit.');
    return {action:'propose',repositoryUrl:url,commit:input.commit};
  }
  if(typeof scope!=='string'||!ID.test(scope))fail(400,'Invalid request scope.');
  keys(input,['action','revision','reason','participantId','source','title','description','demoUrl','instructions'],['action']);
  const {action}=input;
  if(!ACTIONS.includes(action))fail(400,'Unknown jam action.');
  const allowed=['action',...(REVIEW.has(action)?['revision','reason']:MODERATION.has(action)?['reason']:action==='withdraw-entry'?['participantId','reason']:action==='join'?['revision']:action==='submit'?['revision','source','title','description','demoUrl','instructions']:[])];
  keys(input,allowed,['action']);
  const payload={action};
  if(REVIEW.has(action)||action==='join'||action==='submit') {if(!/^[a-f0-9]{64}$/.test(input.revision||''))fail(400,'A reviewed event revision is required.');payload.revision=input.revision;}
  if(MODERATION.has(action)||['request-changes','reject','withdraw-entry'].includes(action))payload.reason=text(input.reason,SAFETY.has(action)?256:2000);
  else if(Object.hasOwn(input,'reason'))payload.reason=text(input.reason,2000,true);
  if(action==='withdraw-entry'){if(typeof input.participantId!=='string'||!ACCOUNT.test(input.participantId))fail(400,'Choose a valid participant ID.');payload.participantId=input.participantId;}
  if(action==='submit') {
    keys(input.source,['repositoryUrl','commit']);
    if(!SHA.test(input.source.commit||''))fail(400,'Choose an exact 40-character source commit.');
    payload.source={repositoryUrl:repositoryUrl(input.source.repositoryUrl).url,commit:input.source.commit};
    Object.assign(payload,{title:text(input.title,120),description:text(input.description,2000),demoUrl:httpsUrl(input.demoUrl),instructions:text(input.instructions===undefined?'':input.instructions,4000,true)});
  }
  return payload;
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
