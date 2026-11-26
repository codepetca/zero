'use strict';

const {randomUUID} = require('node:crypto');
const {parseRepositoryUrl} = require('./core');
const {openGameJamRules} = require('./tutorial-browser');

const ORIGIN = 'https://zero.codepet.ca';
const JAM_ID = /^jam-(?:[1-9][0-9]{0,19}|zero-[a-f0-9]{32})$/;
const REVISION = /^[a-f0-9]{64}$/;
const validRepositoryId = id => typeof id==='string' && /^[1-9][0-9]{0,19}$/.test(id);

const validJamId = id => typeof id === 'string' && JAM_ID.test(id) && !/\s/u.test(id);

function gameJamLinkId(uri) {
  if (uri?.scheme !== 'vscode' || uri.authority !== 'zero.zero' || uri.query || uri.fragment || typeof uri.path !== 'string' || !uri.path.startsWith('/jam/')) return undefined;
  const id = uri.path.slice('/jam/'.length);
  return validJamId(id) ? id : undefined;
}

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

function createGameJamJoin({vscode,authentication,projects,projectPicker,repositories,openGameJamProject,globalState,active,report,onJoined=async()=>{},openRules=id=>openGameJamRules(vscode,id),request=globalThis.fetch}) {
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

  async function readCatalog(signal) {
    let data;
    try {
      const response = await request(ORIGIN+'/api/jams?view=summaries',{
        redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(20_000),...(signal ? [signal] : [])])
      });
      if (response.status === 404) return {checkedAt:NaN,events:[]};
      if (!response.ok) throw Error();
      data = await response.json();
    } catch {throw Error(unavailable);}
    if (data?.configured !== true || !Array.isArray(data.events)) throw Error(unavailable);
    return {checkedAt:Date.parse(data.checkedAt),events:data.events.filter(event=>
      event?.type==='game'&&validJamId(event.id)&&REVISION.test(event.revision)&&typeof event.title==='string')};
  }

  const registrationOpen = (event, checkedAt) => event.registrationOpen===true &&
    !(Date.parse(event.schedule?.registrationClosesAt)<=checkedAt);

  async function listOpenJams(signal) {
    const {events,checkedAt}=await readCatalog(signal);
    return events.filter(event=>registrationOpen(event,checkedAt))
      .map(event=>({id:event.id,title:event.title,
        deadline:describeDeadline(event.schedule?.registrationClosesAt,event.timezone)}));
  }

  function reviewDetails(event) {
    return {title:event.title,rules:rulesPreview(event.rules),
      registrationDeadline:describeDeadline(event.schedule?.registrationClosesAt,event.timezone),
      submissionDeadline:describeDeadline(event.schedule?.submissionsCloseAt,event.timezone)};
  }

  async function readLinkedJam(id,signal) {
    if (!validJamId(id)) throw Error('This Game Jam link is invalid.');
    let data;
    try {
      const response=await request(ORIGIN+`/api/jams/${id}?view=overview`,{
        redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)])
      });
      if (response.ok) data=await response.json();
    } catch {throw Error(unavailable);}
    const event=data?.event;
    if (data?.configured!==true || event?.id!==id || event.type!=='game' ||
        !REVISION.test(event.revision) || typeof event.title!=='string' || typeof event.rules!=='string') {
      throw Error('This Game Jam could not be opened. Check its official page or try again.');
    }
    return {id,revision:event.revision,...reviewDetails(event),fullRules:event.rules,
      eligibility:typeof event.eligibility==='string'?event.eligibility:'',registrationOpen:registrationOpen(event,Date.parse(data.checkedAt))};
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
    const {id,title,operationId,revision,repositoryUrl,repositoryId} = pending;
    let response, result;
    try {
      response = await request(editorJoinUrl(id),{
        method:'POST',redirect:'error',
        headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({operationId,revision,repositoryUrl,repositoryId}),
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
    await onJoined({account:ticket.session.accountId,repository:repositoryUrl,repositoryId,id});
    await clearPending(key,operationId);
    if (!active()) return false;
    authentication.assertCurrentNow(ticket);
    report(`Joined ${title}`);
    return true;
  }

  function pendingJoins(account) {
    const prefix = pendingPrefix(account);
    const pending = new Map();
    for (const key of globalState.keys().filter(key=>key.startsWith(prefix))) {
      const item = globalState.get(key);
      if (!item || !validJamId(item.id) || key !== prefix+item.id || !REVISION.test(item.revision) ||
          !/^[a-f0-9-]{36}$/.test(item.operationId) || typeof item.title !== 'string') continue;
      try {
        if (parseRepositoryUrl(item.repositoryUrl).page === item.repositoryUrl) pending.set(item.id,item);
      } catch { /* An invalid local record cannot block other jams. */ }
    }

    return pending;
  }

  async function chooseJam(ticket) {
    const pending = pendingJoins(ticket.session.accountId);
    let catalog;
    try { catalog = await readCatalog(); }
    catch (error) { if (!pending.size) throw error; catalog={events:[]}; }
    if (!active()) return;
    await authentication.assertCurrent(ticket);
    const choices = [
      ...Array.from(pending.values(),item=>({
        label:`${validRepositoryId(item.repositoryId) ? 'Retry joining' : 'Review registration for'} ${item.title}`,description:item.repositoryUrl,id:item.id
      })),
      ...catalog.events.flatMap(event=>{
        if (pending.has(event.id)) return [];
        const joined=Array.isArray(event.participants)&&event.participants.some(person=>person?.id===ticket.session.accountId);
        const canOpen=joined&&(event.submissionsOpen===true||Date.parse(event.schedule?.submissionsCloseAt)>catalog.checkedAt);
        if (!registrationOpen(event,catalog.checkedAt)&&!canOpen) return [];
        return [{label:joined?`Open jam project · ${event.title}`:event.title,
          description:joined?'Already joined':describeDeadline(event.schedule?.registrationClosesAt,event.timezone),id:event.id}];
      })
    ];
    if (!choices.length) {report('No Game Jams are open for registration.');return;}
    const choice = await vscode.window.showQuickPick(choices,{title:'Join a Game Jam',placeHolder:'Choose a Game Jam'});
    if (choice) await selectJam(ticket,choice.id);
  }

  async function selectJam(ticket,id) {
    if (!active() || !validJamId(id)) return;
    authentication.assertCurrentNow(ticket);
    review=undefined;
    const key = pendingPrefix(ticket.session.accountId)+id;
    const retry = pendingJoins(ticket.session.accountId).get(id);
    if (retry && validRepositoryId(retry.repositoryId)) {
      if (await register(ticket,key,retry)) await openJoinedProject(ticket,retry.title,retry);
      return;
    }

    const details=await readJoinDetails(ticket,id);
    if (!active()) return;
    if (details.registration?.status==='joined') {
      if(retry) await clearPending(key,retry.operationId);
      return reopenRegistration(ticket,details);
    }
    if (canContinue(details)) {
      await showRules(ticket,details.event);
      if(retry && active()) report('Choose a repository again to confirm this registration.');
    }
  }

  async function openJoinedProject(ticket,title,{repositoryUrl,repositoryId,projectPath}) {
    if(!active())return;
    try {await openGameJamProject({ticket,repositoryUrl,repositoryId,preferredPath:projectPath});}
    catch(error) {
      if(active()&&error?.code!=='cancelled'&&error?.name!=='Canceled'&&error?.name!=='CancellationError')
        throw Error(`Joined ${title}. ${error?.message||'Could not open the project.'}`);
    }
  }

  async function registeredRepository(ticket,expected) {
    const {id,fullName}=expected;
    if(!validRepositoryId(id))throw Error('Zero could not identify the registered Game Jam repository.');
    if(typeof fullName==='string') {
      const repositoryUrl=parseRepositoryUrl('https://github.com/'+fullName).page;
      try {
        const repo=await repositories.readOwnedRepository(repositoryUrl,{ticket,signal:AbortSignal.timeout(20_000)});
        if(String(repo.id)===id) {
          if(repo.private!==false)throw Error('Make the registered Game Jam repository public on GitHub before opening it in Zero.');
          return {repositoryUrl:repo.html_url,repositoryId:id};
        }
      } catch(error) {
        if(!['network-error','repository-not-selected','repository-mismatch'].includes(error.code))throw error;
      }
    }
    // A rename can make the original full name unavailable or point to a
    // different project. Discovery only accepts the immutable registered ID.
    const selected=await projectPicker.choose({publicRepositoriesOnly:true,repositoryId:id});
    return selected?.repositoryId===id ? selected : undefined;
  }

  async function reopenRegistration(ticket,{event,registration}) {
    review=undefined;
    report(`You’ve already joined ${event.title}.`);
    if (!registration.repository) return;
    const existing=await registeredRepository(ticket,registration.repository);
    if (!existing||!active())return;
    authentication.assertCurrentNow(ticket);
    await onJoined({account:ticket.session.accountId,repository:existing.repositoryUrl,repositoryId:existing.repositoryId,id:event.id});
    await openJoinedProject(ticket,event.title,existing);
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
    review={id:event.id,revision:event.revision,account:ticket.session.accountId,details:reviewDetails(event)};
  }

  async function continueLinkedJam(ticket,linked) {
    if (!active() || !validJamId(linked.id) || !REVISION.test(linked.revision)) return;
    authentication.assertCurrentNow(ticket);
    if (pendingJoins(ticket.session.accountId).has(linked.id)) return selectJam(ticket,linked.id);
    review={id:linked.id,revision:linked.revision,account:ticket.session.accountId,details:linked};
    await continueJoining(ticket);
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
    const join = async ({repositoryUrl,repositoryId,projectPath,signal}) => {
      if(!validRepositoryId(repositoryId))throw Error('Zero could not identify this repository. Choose the project again.');
      const operation = {id:event.id,title:event.title,revision:event.revision,operationId:randomUUID(),
        repositoryUrl:parseRepositoryUrl(repositoryUrl).page,repositoryId,...(projectPath ? {projectPath} : {})};
      review=undefined;
      try {return await register(ticket,key,operation,signal);}
      catch (error) {
        error.gameJamJoin = true;
        if (projectPath) error.message += ' Your new project was kept.';
        throw error;
      }
    };

    const joinExisting = async expected => {
      const existing=expected ? await registeredRepository(ticket,expected) :
        await projectPicker.choose({publicRepositoriesOnly:true,standaloneOnly:true});
      if(existing&&active()&&await join(existing)) await openJoinedProject(ticket,event.title,existing);
    };
    if (boundRepository) return joinExisting(boundRepository);
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
  return {chooseJam,selectJam,listOpenJams,readLinkedJam,continueLinkedJam,continueJoining,
    reviewDetails:account=>currentReview(account)?.details,
    dismissReview(account) {if (currentReview(account)) review=undefined;}
  };
}

module.exports = {createGameJamJoin,gameJamLinkId};
