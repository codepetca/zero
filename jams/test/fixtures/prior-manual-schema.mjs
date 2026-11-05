// TEST ONLY: archived prior manual-approval reader from f8b1a7e3a5b64fa0b8165893bea556b298dba9ec.
// Original jams/schema.mjs SHA-256: bb870268c312fc3da2b34f98af1075c246620501aae450316ef3dee0c82bf40b
// Only relative import paths are adjusted; never use this reader in production.
import {JamError, fail, object, keys, text, httpsUrl, manifestData, hostedManifestData} from '../../manifest.mjs';
export {JamError, fail, object, keys, text, httpsUrl, manifestData, hostedManifestData} from '../../manifest.mjs';
import {createHash} from 'node:crypto';

export const ID = /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/;
export const HOSTED_ID = /^jam-zero-[a-f0-9]{32}$/;
export const SHA = /^[a-f0-9]{40}$/;
export const ACCOUNT = /^[1-9][0-9]{0,19}$/;
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
export const LIMITS = Object.freeze({events:100, participants:200, operations:1000, safetyOperations:202, proposals:50, entryHistory:30, retries:8, stateBytes:2_000_000, actorWrites:10, writeWindowMs:60000, actorCreations:3, settlements:1000, actorSettlements:50, settlementBytes:512000});
export const SAFETY_SLOT_BYTES=4096;
export const safetySlots=limit=>Math.min(limit.safetyOperations,limit.participants+2);
export const operationCounts=state=>Object.values(state.operations).reduce((counts,operation)=>{counts[operation.pool]=(counts[operation.pool]||0)+1;return counts;},{ordinary:0,safety:0});
export const stateBudget=(state,limit)=>limit.stateBytes-(safetySlots(limit)-operationCounts(state).safety)*SAFETY_SLOT_BYTES;
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function repositoryUrl(value) {
  if (typeof value !== 'string' || value.length > 256) fail(400,'Use a public GitHub repository URL.');
  const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(value);
  if (!match || /(?:^\.|\.$|\.\.|\.git$)/i.test(match[2])) fail(400,'Use a public GitHub repository URL.');
  return {owner:match[1],repo:match[2],url:`https://github.com/${match[1]}/${match[2]}`};
}
export function actorIdentity(actor) {
  keys(actor,['id','login']);
  if (!ACCOUNT.test(actor.id) || !LOGIN.test(actor.login)) fail(401,'GitHub sign-in required.');
  return {id:actor.id,login:actor.login};
}
export function repositoryData(input, actor, expectedCommit) {
  keys(input,['id','ownerId','fullName','commit']);
  if (!ACCOUNT.test(input.id) || input.ownerId !== actor.id || !SHA.test(input.commit) || input.commit !== expectedCommit || typeof input.fullName !== 'string') fail(403,'The public source must belong to your GitHub account.');
  const parsed = repositoryUrl(`https://github.com/${input.fullName}`);
  if (parsed.owner.toLowerCase() !== actor.login.toLowerCase()) fail(403,'The public source must belong to your GitHub account.');
  return {...input};
}
export function participantRepositoryData(input,actor) {
  keys(input,['id','ownerId','fullName']);
  if(typeof input.id!=='string'||!ACCOUNT.test(input.id)||input.ownerId!==actor.id||typeof input.fullName!=='string')fail(403,'The public project must belong to your GitHub account.');
  const parsed=repositoryUrl(`https://github.com/${input.fullName}`);
  if(parsed.owner.toLowerCase()!==actor.login.toLowerCase())fail(403,'The public project must belong to your GitHub account.');
  return {...input};
}
// A bounded server-observed receipt records association at submission time.
// It is never client authority or evidence that the mutable site is still bound.
export function pagesVerificationData(input, repository, pagesUrl) {
  keys(input,['pagesUrl','repositoryId','ownerId','verifiedAt']);
  if(input.pagesUrl!==pagesUrl||httpsUrl(input.pagesUrl)!==input.pagesUrl||
      input.repositoryId!==repository?.id||input.ownerId!==repository?.ownerId||
      !ACCOUNT.test(input.repositoryId)||!ACCOUNT.test(input.ownerId)||
      typeof input.verifiedAt!=='string'||!Number.isFinite(Date.parse(input.verifiedAt))||
      new Date(input.verifiedAt).toISOString()!==input.verifiedAt)fail(503,'The project Pages association could not be verified.');
  return {...input};
}
export function validateState(state, id, limit = LIMITS, {enforceReserve=true} = {}) {
  // The registry is operator-controlled, but malformed/truncated state must never
  // become an empty event or supply authority through an unchecked record.
  try {
    keys(state,['schema','id','creator','repositoryId','hosting','proposals','accepted','moderation','registrations','entries','operations','history','updatedAt'],['schema','id','creator','repositoryId','proposals','accepted','moderation','registrations','entries','operations','history','updatedAt']);
    const hosted=state.hosting==='zero';
    if (state.schema !== 1 || state.id !== id || !ID.test(id) || (hosted? !HOSTED_ID.test(id)||state.repositoryId!==null : Object.hasOwn(state,'hosting')||HOSTED_ID.test(id)||state.repositoryId!==id.slice(4))) throw Error();
    actorIdentity(state.creator);
    if (!Array.isArray(state.proposals) || !state.proposals.length || state.proposals.length > limit.proposals || !object(state.registrations) || !object(state.entries) || !object(state.operations) || !Array.isArray(state.history) || !['active','suspended','cancelled'].includes(state.moderation?.status)) throw Error();
    const counts=operationCounts(state);
    if (Object.keys(state.registrations).length > limit.participants || counts.ordinary > limit.operations || counts.safety > safetySlots(limit) || Buffer.byteLength(JSON.stringify(state)) > (enforceReserve?stateBudget(state,limit):limit.stateBytes)) throw Error();
    for (const proposal of state.proposals) {
      if (!/^[a-f0-9]{64}$/.test(proposal.revision) || !['submitted','changes-requested','approved','rejected'].includes(proposal.status)) throw Error();
      if(hosted) {
        if(proposal.hosting!=='zero'||proposal.repository!==null)throw Error();
        hostedManifestData(proposal.manifest);
      } else {
        if(Object.hasOwn(proposal,'hosting'))throw Error();
        manifestData(proposal.manifest);
        // Archived source names survive an account/repository rename. Numeric
        // ownership is the durable binding; current names were checked on intake.
        repositoryData(proposal.repository,{id:state.creator.id,login:proposal.repository?.fullName?.split('/')[0]},proposal.repository.commit);
        if (proposal.repository.id !== state.repositoryId) throw Error();
      }
    }
    if (state.accepted) {
      const proposal=state.proposals.find(proposal=>proposal.revision===state.accepted.revision&&proposal.status==='approved');
      const {approvedBy,approvedAt,...acceptedProposal}=state.accepted;
      if(!proposal||canonical(proposal)!==canonical(acceptedProposal)||!ACCOUNT.test(approvedBy)||approvedBy===state.creator.id||approvedAt!==proposal.reviewedAt)throw Error();
    }
    for (const [key,value] of Object.entries(state.registrations)) {
      if (!ACCOUNT.test(key) || value.id !== key || !LOGIN.test(value.login) || !['joined','left'].includes(value.status)) throw Error();
      if(value.repository)participantRepositoryData(value.repository,{id:key,login:value.repository.fullName?.split('/')[0]});
    }
    for (const [key,history] of Object.entries(state.entries)) {
      if (!ACCOUNT.test(key) || !state.registrations[key] || !Array.isArray(history) || history.length > limit.entryHistory || history.some(entry => entry.participantId !== key || !['active','withdrawn'].includes(entry.status))) throw Error();
      for(const entry of history.filter(entry=>!entry.moderatedBy)) {
        const repo=entry.repository, owner={id:key,login:repo?.fullName?.split('/')[0]};
        if(Object.hasOwn(repo||{},'commit'))repositoryData(repo,owner,repo.commit);else participantRepositoryData(repo,owner);
        if(Object.hasOwn(entry,'pagesVerification')) {
          pagesVerificationData(entry.pagesVerification,repo,entry.demoUrl);
          if(!Number.isFinite(Date.parse(entry.submittedAt))||Date.parse(entry.pagesVerification.verifiedAt)>Date.parse(entry.submittedAt))throw Error();
        }
      }
      for(const entry of history.filter(entry=>entry.moderatedBy)) {
        keys(entry,['participantId','revision','previousRevision','status','withdrawnAt','moderatedBy','reason']);
        if(entry.status!=='withdrawn'||!ACCOUNT.test(entry.moderatedBy)||text(entry.reason,256)!==entry.reason||!history.some(previous=>previous.revision===entry.previousRevision&&previous.status==='active'))throw Error();
      }
    }
    for(const [key,operation]of Object.entries(state.operations)) {
      keys(operation,['actorId','acceptedAt','payloadDigest','result','pool']);
      if(!['ordinary','safety'].includes(operation.pool)||!ACCOUNT.test(operation.actorId)||!key.startsWith(operation.actorId+':')||!Number.isSafeInteger(operation.acceptedAt)||! /^[a-f0-9]{64}$/.test(operation.payloadDigest)||operation.result?.eventId!==id||operation.result.operationId!==key.slice(operation.actorId.length+1))throw Error();
    }
    return structuredClone(state);
  } catch { fail(503,'Official jam records are unavailable.'); }
}

export function validateSettlements(value,limit=LIMITS) {
  try {
    keys(value,['schema','operations']);
    if(value.schema!==1||!object(value.operations)||Object.keys(value.operations).length>limit.settlements||Buffer.byteLength(JSON.stringify(value))>limit.settlementBytes)throw Error();
    const actors=new Map();
    for(const [key,item]of Object.entries(value.operations)) {
      keys(item,['scope','actorId','operationId','payloadDigest','settledAt']);
      if(!(item.scope==='proposals'||ID.test(item.scope))||!ACCOUNT.test(item.actorId)||typeof item.operationId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(item.operationId)||key!==`${item.scope}:${item.actorId}:${item.operationId}`||!/^[a-f0-9]{64}$/.test(item.payloadDigest)||!Number.isSafeInteger(item.settledAt)||item.settledAt<0)throw Error();
      actors.set(item.actorId,(actors.get(item.actorId)||0)+1);
      if(actors.get(item.actorId)>limit.actorSettlements)throw Error();
    }
    return structuredClone(value);
  }catch {fail(503,'Official request settlements are unavailable. Keep the earlier request and retry.');}
}
