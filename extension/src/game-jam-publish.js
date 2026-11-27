'use strict';

const {randomUUID} = require('node:crypto');
const core = require('./core');
const {assertShareable} = require('./lesson-projects');
const {safePagesUrl} = require('./web-pages-verification');

const ORIGIN = 'https://zero.codepet.ca';
const JAM = /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/;
const REVISION = /^[a-f0-9]{64}$/;
const validEntryRevision = value => value==='' || typeof value==='string' && value.length===64 && REVISION.test(value);
const POSITIVE = /^[1-9][0-9]{0,19}$/;
const unavailable = 'Zero could not check where this project should publish. Try publishing again.';
const changed = 'The Game Jam publishing account or repository changed. Choose Publish again.';
const retryMessage = 'Your Pages site is live. Choose Publish to Jam again to check the submission.';
const knownKey = (account,repository) => 'zero.gameJam.link:'+account+':'+repository.toLowerCase();
const pendingPrefix = (account,repositoryId) => 'zero.gameJam.submission:'+account+':'+repositoryId+':';

async function readRepository(root) {
  await assertShareable(root);
  if (await core.repositoryRoot(root)!==root) throw Error(changed);
  const [fetchUrl,pushUrl]=await Promise.all([
    core.git(root,['remote','get-url','--all','origin']),
    core.git(root,['remote','get-url','--push','--all','origin'])
  ]);
  const source=core.parseRepositoryUrl(fetchUrl);
  if(core.parseRepositoryUrl(pushUrl).remote!==source.remote)throw Error(changed);
  return source.page;
}

function createGameJamPublish({authentication,repositories,globalState,onChange=()=>{},request=globalThis.fetch,repositoryForRoot=readRepository}) {
  const writing = new Set();
  function pendingFor(account,repositoryId) {
    const prefix=pendingPrefix(account,repositoryId);
    const key=globalState.keys().find(key=>key.startsWith(prefix));
    if (!key) return;
    const item=globalState.get(key);
    if (!item || !JAM.test(item.id) || typeof item.title!=='string' ||
        key!==prefix+item.body?.operationId || item.body?.repositoryId!==repositoryId ||
        !REVISION.test(item.body?.revision) || !validEntryRevision(item.body?.entryRevision) ||
        item.body.projectRevision!==undefined&&!validEntryRevision(item.body.projectRevision) ||
        typeof item.body.commit!=='string' || !/^[a-f0-9]{40}$/.test(item.body.commit) || !POSITIVE.test(item.body.runId)) {
      throw Error('The saved Game Jam submission could not be read.');
    }
    return {key,item};
  }
  function hasKnownLink(account,repository) {
    if (!account || !repository) return false;
    const saved=globalState?.get(knownKey(account,repository));
    return saved==='ambiguous' || JAM.test(saved);
  }
  async function remember(account,repository,value) {
    const key=knownKey(account,repository);
    if (globalState.get(key)!==value) {await globalState.update(key,value);onChange();}
  }
  function headers(ticket) {
    const session=authentication.assertCurrentNow(ticket);
    return {'X-Zero-Desktop':'1',Authorization:'Bearer '+session.accessToken};
  }
  async function resolve(root,{signal,beforeSend=()=>{}}={}) {
    const repository=await repositoryForRoot(root);
    const ticket=await authentication.capture();
    const account=String(ticket.session.accountId);
    signal?.throwIfAborted();beforeSend();
    const repo=await repositories.readOwnedRepository(repository,{ticket,signal});
    const repositoryId=String(repo.id);
    if (!POSITIVE.test(repositoryId) || String(repo.owner?.id)!==account ||
        repo.html_url?.toLowerCase()!==repository.toLowerCase()) throw Error(changed);
    authentication.assertCurrentNow(ticket);
    signal?.throwIfAborted();beforeSend();
    const context=Object.freeze({account,repositoryId,repository,root});
    const pending=pendingFor(account,repositoryId);
    if (pending) {
      const {id,title,body}=pending.item;
      await remember(account,repository,id);
      return {...context,id,title,revision:body.revision,entryRevision:body.entryRevision,projectRevision:body.projectRevision,
        submissionsOpen:false,pending:true};
    }
    const known=()=>hasKnownLink(account,repository) || hasKnownLink(account,repositoryId);
    const routingFailure=()=>{
      signal?.throwIfAborted();authentication.assertCurrentNow(ticket);beforeSend();
      const error=Error(unavailable);
      if (!known() && !pendingFor(account,repositoryId)) {
        error.code='ZERO_JAM_STATUS_UNKNOWN';
        error.publishTarget=context;
      }
      return error;
    };
    let response;
    try {
      response=await request(ORIGIN+'/api/desktop/jams/project?repositoryId='+repositoryId,{
        method:'GET',headers:headers(ticket),redirect:'error',cache:'no-store',
        signal:AbortSignal.any([AbortSignal.timeout(20_000),...(signal?[signal]:[])])
      });
    } catch {throw routingFailure();}
    const data=await response.json().catch(()=>undefined);
    signal?.throwIfAborted();authentication.assertCurrentNow(ticket);beforeSend();
    if (response.status===401 || response.status===403) throw Error('Reconnect the GitHub account that owns this project to check its Game Jam.');
    if (data?.ambiguous===true) {
      await remember(account,repository,'ambiguous');
      await remember(account,repositoryId,'ambiguous');
      throw Object.assign(Error('This repository is linked to more than one Game Jam. Check your registrations before submitting.'),
        {code:'ZERO_JAM_DESTINATION_AMBIGUOUS',publishTarget:context});
    }
    const wasKnown=known();
    if (!wasKnown && (response.status===404 && data?.configured!==true || data?.configured===false)) return context;
    if (response.status===402 || response.status>=500 || response.ok && !data) throw routingFailure();
    if (!response.ok || data?.configured!==true) throw Error(unavailable);
    const result=data.destination;
    if (result!==null && (!result || !JAM.test(result.id) || !REVISION.test(result.revision) || !validEntryRevision(result.entryRevision) ||
        result.projectRevision!==undefined&&!validEntryRevision(result.projectRevision) ||
        result.replacesProject!==undefined&&(typeof result.replacesProject!=='string'||!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(result.replacesProject)) ||
        typeof result.title!=='string' || !result.title.trim() || typeof result.submissionsOpen!=='boolean')) throw Error(unavailable);
    await remember(account,repository,result?.id);
    await remember(account,repositoryId,result?.id);
    signal?.throwIfAborted();authentication.assertCurrentNow(ticket);beforeSend();
    if (wasKnown && !result) throw Error('This repository is no longer linked to a Game Jam. Review the publishing destination and choose Publish again.');
    return result ? {...result,...context} : context;
  }
  async function send(destination,key,record,{signal,beforeSend=()=>{}},persist=false) {
    const {account,root,repository}=destination;
    const ticket=await authentication.capture();
    if (String(ticket.session.accountId)!==account ||
        (await repositoryForRoot(root)).toLowerCase()!==repository.toLowerCase()) throw Error(changed);
    await authentication.assertCurrent(ticket);
    beforeSend();signal?.throwIfAborted();
    if (persist) {
      await globalState.update(key,record);
      authentication.assertCurrentNow(ticket);beforeSend();signal?.throwIfAborted();
    }
    let response,result;
    const options={method:'POST',headers:{...headers(ticket),'Content-Type':'application/json'},redirect:'error',
      body:JSON.stringify(record.body),signal:AbortSignal.any([AbortSignal.timeout(24_000),...(signal?[signal]:[])])};
    try {
      response=await request(ORIGIN+'/api/desktop/jams/'+record.id+'/submit',options);
      result=await response.json();
    } catch {return {status:'pending',message:retryMessage};}
    authentication.assertCurrentNow(ticket);beforeSend();signal?.throwIfAborted();
    const accepted=response.ok && result?.configured===true && result.status==='submitted' && REVISION.test(result.revision);
    const rejected=result?.configured===true && [400,403,404,409,413,429].includes(response.status);
    if (!accepted && !rejected) return {status:'pending',message:retryMessage};
    if(globalState.get(key)?.body?.operationId===record.body.operationId) await globalState.update(key,undefined);
    return accepted ? {status:'submitted'} :
      {status:'rejected',message:typeof result.error==='string' ? result.error.slice(0,400) : 'ZeroJams declined this submission.'};
  }
  async function recover(destination,options={}) {
    const pending=pendingFor(destination.account,destination.repositoryId);
    if (!pending) return null;
    if (pending.item.id!==destination.id) throw Error('A previous submission for this repository still needs confirmation. Choose Publish again.');
    return send(destination,pending.key,pending.item,options);
  }
  async function submit(destination,live,options={}) {
    const {account,repositoryId,repository}=destination;
    const receipt=live?.resume;
    if (!JAM.test(destination.id) || !REVISION.test(destination.revision) || !validEntryRevision(destination.entryRevision) || !POSITIVE.test(repositoryId) ||
        live?.status!=='live' || String(receipt?.repositoryId)!==repositoryId ||
        receipt.repository?.toLowerCase()!==repository.toLowerCase() ||
        typeof live.sha!=='string' || !/^[a-f0-9]{40}$/.test(live.sha) ||
        receipt.sha!==live.sha || receipt.destination?.url!==live.url ||
        !Number.isSafeInteger(receipt.runId) || receipt.runId<1 ||
        !safePagesUrl(live.url,receipt.destination?.cname)) throw Error('Verify the live Pages build for the linked repository before submitting.');
    const prefix=pendingPrefix(account,repositoryId);
    if (writing.has(prefix)) return {status:'pending',message:retryMessage};
    writing.add(prefix);
    try {
      const pending=pendingFor(account,repositoryId);
      if (pending) {
        const {body}=pending.item;
        if (pending.item.id!==destination.id || body.runId!==String(receipt.runId) || body.commit!==live.sha ||
            body.pagesUrl!==live.url || body.revision!==destination.revision || body.entryRevision!==destination.entryRevision ||
            body.projectRevision!==destination.projectRevision) {
          return {status:'pending',message:'The previous jam submission needs confirmation. Choose Publish to Jam again.'};
        }
        return await send(destination,pending.key,pending.item,options);
      }
      const operationId=randomUUID();
      const key=prefix+operationId;
      const record={id:destination.id,title:destination.title,body:{operationId,revision:destination.revision,entryRevision:destination.entryRevision,
        ...(destination.projectRevision!==undefined?{projectRevision:destination.projectRevision}:{}),
        repositoryId,pagesUrl:live.url,commit:live.sha,runId:String(receipt.runId)}};
      return await send(destination,key,record,options,true);
    } finally {writing.delete(prefix);}
  }
  async function rememberJoined(account,repository,id,repositoryId) {
    await remember(account,repository,id);
    if(POSITIVE.test(repositoryId))await remember(account,repositoryId,id);
  }
  return {resolve,submit,recover,hasKnownLink,rememberJoined};
}

module.exports={createGameJamPublish};
