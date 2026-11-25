'use strict';

const {randomUUID} = require('node:crypto');
const {parseRepositoryUrl} = require('./core');
const {openGameJamRules} = require('./tutorial-browser');

const ORIGIN = 'https://zero.codepet.ca';
const JAM_ID = /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/;
const REVISION = /^[a-f0-9]{64}$/;

function describeDeadline(timestamp, timezone) {
  if (!Number.isFinite(Date.parse(timestamp))) return '';
  try {
    return new Intl.DateTimeFormat(undefined,{
      year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',
      timeZone:timezone,timeZoneName:'short'
    }).format(new Date(timestamp));
  } catch {return timestamp;}
}

function rulesPreview(rules) {
  const text = rules.trim().replace(/\s+/gu,' ');
  const prefix = text.match(/^.{0,220}/u)[0];
  if (prefix === text) return text;
  const lastSpace = prefix.lastIndexOf(' ');
  return (lastSpace > 0 ? prefix.slice(0,lastSpace) : prefix) + '…';
}

function createGameJamJoin({vscode,authentication,projects,projectPicker,openGameJamProject,globalState,active,report,onJoined=async()=>{},openRules=id=>openGameJamRules(vscode,id),request=globalThis.fetch}) {
  const unavailable = 'ZeroJams is unavailable. Try again later.';
  const unconfirmed = 'Zero could not confirm that you joined. Choose Join a Game Jam to retry with the same repository.';
  let review;
  const pendingPrefix = account => `zero.gameJam.pending:${account}:`;
  const currentReview = account => review?.account === account ? review : undefined;
  const editorJoinUrl = id => ORIGIN+`/api/desktop/jams/${id}/join`;
  const editorHeaders = ticket => {
    const session = authentication.assertCurrentNow(ticket);
    return {'X-Zero-Desktop':'1',Authorization:'Bearer '+session.accessToken};
  };

  async function clearPending(key,operationId) {
    if (globalState.get(key)?.operationId === operationId) await globalState.update(key,undefined);
  }

  async function listJams(ticket) {
    let data;
    try {
      const response = await request(ORIGIN+'/api/jams?view=summaries',{
        redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw Error();
      data = await response.json();
    } catch {throw Error(unavailable);}
    if (data?.configured !== true || !Array.isArray(data.events)) throw Error(unavailable);
    await authentication.assertCurrent(ticket);
    const checkedAt=Date.parse(data.checkedAt);
    return data.events.flatMap(event=>{
      if(event?.type!=='game'||!JAM_ID.test(event.id)||!REVISION.test(event.revision)||typeof event.title!=='string')return [];
      const joined=Array.isArray(event.participants)&&event.participants.some(person=>person?.id===ticket.session.accountId);
      const canOpen=joined&&(event.submissionsOpen===true||Date.parse(event.schedule?.submissionsCloseAt)>checkedAt);
      return event.registrationOpen===true||canOpen?[{...event,joined}]:[];
    });
  }

  async function readJoinDetails(ticket,id) {
    const headers = editorHeaders(ticket);
    let response, data;
    try {
      response = await request(editorJoinUrl(id),{
        method:'GET',redirect:'error',cache:'no-store',headers,signal:AbortSignal.timeout(20_000)
      });
      data = await response.json();
    } catch {throw Error(unavailable);}
    authentication.assertCurrentNow(ticket);
    if (response.status === 401) throw Error('Reconnect GitHub to join this Game Jam.');
    if (!response.ok || data?.configured !== true || data.event?.id !== id ||
        data.event.type !== 'game' || !REVISION.test(data.event.revision) ||
        typeof data.event.title !== 'string' || typeof data.event.rules !== 'string') throw Error(unavailable);
    return data;
  }

  async function register(ticket, key, pending, signal) {
    if (!active()) return false;
    signal?.throwIfAborted();
    await authentication.assertCurrent(ticket);
    await globalState.update(key,pending);
    if (!active()) return false;
    signal?.throwIfAborted();
    const headers = editorHeaders(ticket);
    const {id,title,operationId,revision,repositoryUrl} = pending;
    let response, result;
    try {
      response = await request(editorJoinUrl(id),{
        method:'POST',redirect:'error',
        headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({operationId,revision,repositoryUrl}),
        signal:AbortSignal.any([AbortSignal.timeout(24_000),...(signal ? [signal] : [])])
      });
      result = await response.json();
    } catch {throw Error(unconfirmed);}
    if (!active()) return false;
    authentication.assertCurrentNow(ticket);
    if (!response.ok) {
      if (result?.configured === true && [400,403,404,409,413,429].includes(response.status)) {
        await clearPending(key,operationId);
        const reason = typeof result.error === 'string' ? result.error.slice(0,400) : 'Could not join this Game Jam.';
        throw Error(`${reason} Choose Join a Game Jam to try again.`);
      }
      if (response.status === 401) throw Error('Reconnect GitHub to retry joining this Game Jam.');
      throw Error(unconfirmed);
    }
    if (result?.configured !== true || result.status !== 'joined' || !REVISION.test(result.revision)) {
      throw Error(unconfirmed);
    }
    await onJoined({account:ticket.session.accountId,repository:repositoryUrl,id});
    await clearPending(key,operationId);
    if (!active()) return false;
    authentication.assertCurrentNow(ticket);
    report(`Joined ${title}`);
    return true;
  }

  async function chooseJam(ticket) {
    const prefix = pendingPrefix(ticket.session.accountId);
    const pending = new Map();
    for (const key of globalState.keys().filter(key=>key.startsWith(prefix))) {
      const item = globalState.get(key);
      if (!item || !JAM_ID.test(item.id) || key !== prefix+item.id || !REVISION.test(item.revision) ||
          !/^[a-f0-9-]{36}$/.test(item.operationId) || typeof item.title !== 'string') continue;
      try {
        if (parseRepositoryUrl(item.repositoryUrl).page === item.repositoryUrl) pending.set(item.id,item);
      } catch { /* An invalid local record cannot block other jams. */ }
    }

    let events;
    try { events = await listJams(ticket); }
    catch (error) { if (!pending.size) throw error; events=[]; }
    if (!active()) return;
    authentication.assertCurrentNow(ticket);
    const choices = [
      ...Array.from(pending.values(),item=>({
        label:`Retry joining ${item.title}`,description:item.repositoryUrl,id:item.id
      })),
      ...events.filter(event=>!pending.has(event.id)).map(event=>({
        label:event.joined?`Open jam project · ${event.title}`:event.title,
        description:event.joined?'Already joined':describeDeadline(event.schedule?.registrationClosesAt,event.timezone),
        id:event.id
      }))
    ];
    if (!choices.length) {report('No Game Jams are open for registration.');return;}
    const choice = await vscode.window.showQuickPick(choices,{title:'Join a Game Jam',placeHolder:'Choose a Game Jam'});
    if (!choice || !active()) return;
    authentication.assertCurrentNow(ticket);
    review=undefined;
    const key = prefix+choice.id;
    const retry = pending.get(choice.id);
    if (retry) {
      if (await register(ticket,key,retry)) {
        await openJoinedProject(ticket,retry.title,retry.repositoryUrl,retry.projectPath);
      }
      return;
    }

    const details=await readJoinDetails(ticket,choice.id);
    if (!active()) return;
    if (details.registration?.status==='joined') return reopenRegistration(ticket,details);
    if (canContinue(details)) await showRules(ticket,details.event);
  }

  async function openJoinedProject(ticket,title,repositoryUrl,preferredPath) {
    if(!active())return;
    try {await openGameJamProject({ticket,repositoryUrl,preferredPath});}
    catch(error) {
      if(active()&&error?.code!=='cancelled'&&error?.name!=='Canceled'&&error?.name!=='CancellationError')
        throw Error(`Joined ${title}. ${error?.message||'Could not open the project.'}`);
    }
  }

  async function reopenRegistration(ticket,{event,registration}) {
    review=undefined;
    report(`You’ve already joined ${event.title}.`);
    if (!registration.repository?.id) return;
    const existing=await projectPicker.choose({publicRepositoriesOnly:true,repositoryId:registration.repository.id});
    if (!existing||!active())return;
    authentication.assertCurrentNow(ticket);
    await onJoined({account:ticket.session.accountId,repository:existing.repositoryUrl,id:event.id});
    await openJoinedProject(ticket,event.title,existing.repositoryUrl);
  }

  function canContinue({event,hasRegistrationSpace}) {
    if (!event.registrationOpen) report(`Registration is closed for ${event.title}.`);
    else if (hasRegistrationSpace === false) report(`${event.title} is full.`);
    else return true;
    review=undefined;
    return false;
  }

  async function showRules(ticket,event) {
    authentication.assertCurrentNow(ticket);
    await openRules(event.id);
    if (!active()) return;
    authentication.assertCurrentNow(ticket);
    review={id:event.id,revision:event.revision,account:ticket.session.accountId,details:{
      title:event.title,rules:rulesPreview(event.rules),
      registrationDeadline:describeDeadline(event.schedule?.registrationClosesAt,event.timezone),
      submissionDeadline:describeDeadline(event.schedule?.submissionsCloseAt,event.timezone)
    }};
  }

  async function continueJoining(ticket) {
    const selectedReview=currentReview(ticket.session.accountId);
    if (!selectedReview || !active()) return;
    const details=await readJoinDetails(ticket,selectedReview.id);
    if (!active() || review!==selectedReview) return;
    if (details.registration?.status==='joined') return reopenRegistration(ticket,details);
    if (!canContinue(details)) return;
    const {event,registration}=details;
    if (event.revision!==selectedReview.revision) {
      await showRules(ticket,event);
      if (active()) report('The jam rules changed. Review them before continuing.');
      return;
    }
    const key=pendingPrefix(ticket.session.accountId)+event.id;
    const boundRepository = registration?.repository;
    const join = async ({repositoryUrl,projectPath,signal}) => {
      const operation = {id:event.id,title:event.title,revision:event.revision,operationId:randomUUID(),
        repositoryUrl:parseRepositoryUrl(repositoryUrl).page,...(projectPath ? {projectPath} : {})};
      review=undefined;
      try {return await register(ticket,key,operation,signal);}
      catch (error) {
        error.gameJamJoin = true;
        if (projectPath) error.message += ' Your new project was kept.';
        throw error;
      }
    };

    const joinExisting = async repositoryId => {
      const existing=await projectPicker.choose(repositoryId ? {publicRepositoriesOnly:true,repositoryId} :
        {publicRepositoriesOnly:true,standaloneOnly:true});
      if(existing&&active()&&await join(existing)) await openJoinedProject(ticket,event.title,existing.repositoryUrl);
    };
    if (boundRepository) return joinExisting(boundRepository.id);
    const selected = await vscode.window.showQuickPick([
      {label:'New project',description:'Create a public GitHub repository',action:'new'},
      {label:'Use an existing repository',action:'existing'}
    ],{title:event.title,placeHolder:'Choose a project for this Game Jam'});
    if (!selected || !active()) return;
    authentication.assertCurrentNow(ticket);
    if (selected.action === 'new') {
      await projects.newProject({preparedTicket:ticket,onCloned:join});
    } else if (selected.action === 'existing') {
      await joinExisting();
    }
  }
  return {chooseJam,continueJoining,reviewDetails:account=>currentReview(account)?.details};
}

module.exports = {createGameJamJoin};
