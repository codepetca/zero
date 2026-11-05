'use client';
import Link from 'next/link';
import {defaultHostedJamDraft,prepareHostedJamDraft,JAM_DRAFT_LIMITS} from '../lib/jam-draft.mjs';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {HubAccount,useHubGitHub} from './HubGitHub';

type Source = {repositoryUrl:string;commit:string};
type Repository = {id:string;ownerId:string;fullName:string;commit?:string};
type Manifest = {type:'game'|'app';title:string;summary:string;theme:string;rules:string;eligibility:string;websiteUrl?:string;timezone:string;schedule:Record<string,string>};
type Entry = {participantId:string;login:string;title:string;description:string;demoUrl?:string;instructions?:string;repository:Repository;submittedAt:string;status?:string};
type Event = Manifest & {creator?:{id:string;login:string};id:string;revision:string|null;approvalHistory?:{revision:string;approvedAt:string;manifest:Manifest}[];reviewStatus:string;moderation:{status:string;reason?:string};registrationOpen:boolean;submissionsOpen:boolean;participantCount:number;participantLimit:number;galleryIncomplete?:boolean;participants:{id:string;login:string}[];entries:Entry[];updatedAt:string};
type Detail = {configured:boolean;event:Event;registration:{status:string;revision?:string;repository?:Repository}|null;entry:Entry|null;moderationEntries?:Entry[];canMaintain:boolean;proposal?:{revision:string;manifest:Manifest;repository?:Repository;hosting?:string;organizerId?:string;organizerLogin?:string;status:string;reason?:string}};
type Mutation = Record<string,unknown>;
const kindLabel = (type:string) => type === 'app' ? 'App Jam' : 'Game Jam';
const reviewLabel = (status:string) => ({submitted:'Awaiting review',approved:'Approved','changes-requested':'Changes requested',rejected:'Rejected'}[status] || status);
function message(error:unknown) { return error instanceof Error ? error.message : 'The request failed. Your form is kept; try again.'; }
async function jsonResponse(response:Response) {
  let body;try {body=await response.json();}catch {throw new Error('ZeroJams returned an unreadable response. Try again.');}
  if(!response.ok || body.configured===false) throw new Error(typeof body.error==='string' ? body.error : 'ZeroJams is unavailable. Keep your work and try again later.');
  return body;
}
function useResource<T>(path:string,discardOnError=false) {
  const {user}=useHubGitHub(),identity=`${path}:${user?.id||'public'}`;
  const [resource,setResource]=useState<{identity:string;value:T}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;setLoading(true);setError('');if(discardOnError)setResource(null);
    try { const body=await jsonResponse(await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(22000)}));if(current===generation.current)setResource({identity,value:body}); }
    catch(e){if(current===generation.current){if(discardOnError)setResource(null);setError(message(e));}}
    finally {if(current===generation.current)setLoading(false);}
  },[path,identity,discardOnError]);
  useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh]);
  return {data:resource?.identity===identity?resource.value:null,error,loading,refresh};
}
function useDraft<T>(name:string,initial:T):[T,(value:T)=>void] {
  const [value,setValue]=useState(initial),[restored,setRestored]=useState(false);
  useEffect(()=>{try {const saved=sessionStorage.getItem(`zero-jam-draft:${name}`);if(saved){const parsed=JSON.parse(saved);if(parsed&&typeof parsed==='object'&&Object.entries(initial as object).every(([key,item])=>typeof parsed[key]===typeof item))setValue(parsed);}}catch{/* Keep editable defaults if storage is unavailable. */}setRestored(true);},[name]);
  useEffect(()=>{if(restored)try{sessionStorage.setItem(`zero-jam-draft:${name}`,JSON.stringify(value));}catch{/* In-memory editing remains available. */}},[name,value,restored]);
  return [value,setValue];
}
function useTopLevel() {
  const [top,setTop]=useState(false);
  useEffect(()=>{setTop(window.self===window.top);},[]);
  return top;
}
function useMutation(path:string) {
  const {user}=useHubGitHub(); const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const operationKeys=useRef(new Map<string,string>()),inFlight=useRef(false);
  async function send(payload:Mutation) {
    if(inFlight.current)return null;
    if(window.self!==window.top){setError('Open this page directly on Zero to confirm this action.');return null;}
    if(!user){setError('Sign in to GitHub on Zero, then retry. Your form is kept.');return null;}
    // Keep the same operation key after errors/timeouts, including unknown outcomes.
    const signature=JSON.stringify([user.id,path,payload]);let operationId=operationKeys.current.get(signature);
    const storageKey=`zero-jam-operation:${signature}`;
    if(!operationId)try{const saved=sessionStorage.getItem(storageKey);if(saved&&/^[0-9a-f-]{36}$/.test(saved))operationId=saved;}catch{/* Storage is optional. */}
    if(!operationId){operationId=crypto.randomUUID();}
    operationKeys.current.set(signature,operationId);
    try{sessionStorage.setItem(storageKey,operationId);}catch{/* Retry still retains its in-memory key. */}
    inFlight.current=true;setBusy(true);setError('');setSuccess('');
    try {
      const body=await jsonResponse(await fetch(path,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','x-hub-csrf':user.csrfToken},body:JSON.stringify({...payload,operationId}),signal:AbortSignal.timeout(20000)}));
      if(body.configured!==true||body.operationId!==operationId)throw new Error('Zero did not confirm this operation. Keep this form and retry.');
      operationKeys.current.delete(signature);try{sessionStorage.removeItem(storageKey);}catch{/* No credential data is stored. */}setSuccess('Confirmed by Zero.');return body;
    }catch(e){setError(message(e));return null;}finally{inFlight.current=false;setBusy(false);}
  }
  return {send,busy,error,success};
}
function Feedback({error,success}:{error?:string;success?:string}) {return <>{error&&<p role="alert" className="jam-error">{error}</p>}{success&&<p role="status">{success}</p>}</>;}
function SourceFields({source,setSource,disabled=false,fixedRepository}:{source:Source;setSource:(source:Source)=>void;disabled?:boolean;fixedRepository?:string}) {
  return <><label>Public GitHub repository<input name="repositoryUrl" type="url" required maxLength={500} placeholder="https://github.com/your-name/your-jam" value={fixedRepository||source.repositoryUrl} readOnly={Boolean(fixedRepository)} onChange={e=>setSource({...source,repositoryUrl:e.target.value})} disabled={disabled}/></label><label>Full commit SHA<input name="commit" required pattern="[0-9a-fA-F]{40}" minLength={40} maxLength={40} spellCheck={false} autoCapitalize="none" value={source.commit} onChange={e=>setSource({...source,commit:e.target.value})} disabled={disabled}/><small>The exact 40-character commit in your own public repository.</small></label></>;
}
function Retry({error,loading,refresh}:{error:string;loading:boolean;refresh:()=>Promise<void>}) {
  return <>{loading&&<p role="status">Checking ZeroJams…</p>}{error&&<div className="jam-notice"><p role="alert">{error}</p><button type="button" onClick={()=>void refresh()} disabled={loading}>Retry loading</button><p className="jam-muted">Keep your project links and form details while you retry.</p></div>}</>;
}
function DirectPage({path}:{path:string}) {return <p className="jam-notice">Participation and review need a direct Zero page. <a href={path} target="_blank" rel="noopener noreferrer">Open this page on Zero</a>. If a new tab is blocked, copy or open this link directly.</p>;}
function JamPlanNotice() {return <p>Joining a jam is free. To propose a jam for up to 100 participants, you need a Pro license. <a href="mailto:info@codepet.ca">Contact Codepet to request Pro access</a>; licenses are enabled manually and there is no online checkout yet.</p>;}
function EventFacts({event}:{event:Manifest}) {
  const labels:Record<string,string>={registrationOpensAt:'Registration opens',registrationClosesAt:'Registration closes',startsAt:'Jam starts',submissionsOpenAt:'Submissions open',submissionsCloseAt:'Submissions close',galleryRevealAt:'Gallery opens'};
  function date(value:string) {try{return new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:event.timezone}).format(new Date(value));}catch{return value;}}
  return <><p className="jam-muted">{kindLabel(event.type)} · {event.timezone}</p><p className="lead">{event.summary}</p><dl className="jam-facts">{Object.entries(labels).filter(([key])=>event.schedule[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd><time dateTime={event.schedule[key]}>{date(event.schedule[key])}</time></dd></div>)}</dl><h2>Theme</h2><p className="jam-prose">{event.theme}</p><h2>Rules</h2><p>{event.schedule.galleryRevealAt?'Use your own public GitHub repository. Sign in on Zero and link it when you join. Before submissions close, submit its published GitHub Pages URL or a custom domain configured for that repository. No commit is required.':'Use GitHub for your project. Your repository must be public. Sign in on Zero to join and submit your repository URL and exact commit.'}</p><p className="jam-prose">{event.rules}</p><h2>Who can take part</h2><p className="jam-prose">{event.eligibility}</p></>;
}
function EventStatus({event}:{event:Event}) {
  const status=event.moderation?.status || 'active';
  return <div className="jam-notice"><p className="jam-status">{!event.revision?'Not approved':status==='suspended'?'Suspended':status==='cancelled'?'Cancelled':'Approved'} · {event.registrationOpen?'Registration open':'Registration closed'} · {event.submissionsOpen?'Submissions open':'Submissions closed'}</p>{event.moderation?.reason&&<p>{event.moderation.reason}</p>}{event.revision&&<p className="jam-source">Accepted revision: <code>{event.revision}</code></p>}</div>;
}
function ApprovedVersions({event}:{event:Event}) {
  const versions=event.approvalHistory||[];
  if(!versions.length)return null;
  return <details className="jam-review"><summary>Approved versions</summary><p>Compare the rules and dates accepted by Zero maintainers. Pending proposals are excluded.</p>{versions.map(version=><details key={version.revision}><summary>{version.revision===event.revision?'Current approved version':'Earlier approved version'} · <time dateTime={version.approvedAt}>{new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(version.approvedAt))} UTC</time></summary><h2>{version.manifest.title}</h2><EventFacts event={version.manifest}/><p className="jam-source">Version: <code>{version.revision}</code></p></details>)}</details>;
}
export function JamDiscovery() {
  const {data,error,loading,refresh}=useResource<{configured:boolean;events:Event[];canMaintain?:boolean;proposals?:{id:string;title:string;type:string;revision:string;status:string;organizerLogin:string;submittedAt:string}[]}>('/api/jams?view=summaries');
  const [type,setType]=useState('all');
  const events=(data?.events||[]).filter(event=>type==='all'||event.type===type);
  return <><h1>ZeroJams</h1><p className="lead">Build something together. Browse approved Game Jams and App Jams, then review the rules on Zero before taking part.</p><JamPlanNotice/><p><Link className="jam-button jam-primary" href="/hub/jams/create">Create a jam</Link></p>{data?.canMaintain&&Boolean(data.proposals?.length)&&<section><h2>Review proposals</h2><ul>{data.proposals!.map(proposal=><li key={proposal.id}><Link href={`/hub/jams/${proposal.id}`}>{proposal.title}</Link> · {kindLabel(proposal.type)} · @{proposal.organizerLogin} · {reviewLabel(proposal.status)}</li>)}</ul></section>}<div className="jam-filter"><select aria-label="Jam type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All jams</option><option value="game">Game Jams</option><option value="app">App Jams</option></select></div><Retry error={error} loading={loading} refresh={refresh}/>{data&&!loading&&!error&&!events.length&&<p>No approved {type==='all'?'jams':kindLabel(type)+'s'} are listed yet. Pro license holders can propose a jam while they wait.</p>}<div className="jam-cards">{events.map(event=><article className="jam-card" key={event.id}><p className="jam-muted">{kindLabel(event.type)}</p><h2><Link href={`/hub/jams/${event.id}`}>{event.title}</Link></h2><p>{event.summary}</p><p>{event.registrationOpen?'Registration open':'Registration closed'} · {event.participantCount} participants</p><p><Link href={`/hub/jams/${event.id}`}>View rules and schedule</Link></p></article>)}</div></>;
}
export function JamCreate() {
  const {user}=useHubGitHub(),top=useTopLevel();
  const [draft,setDraft]=useDraft('hosted-create',defaultHostedJamDraft());
  const [errors,setErrors]=useState<Record<string,string>>({}),[eventId,setEventId]=useState('');
  const mutation=useMutation('/api/jams/proposals');
  function change(field:string,value:string){setDraft({...draft,[field]:value});setErrors({...errors,[field]:''});}
  async function propose(e:FormEvent){
    e.preventDefault();if(eventId)return;const result=prepareHostedJamDraft(draft);setErrors(result.errors as Record<string,string>);
    if(!result.manifest)return;
    const response=await mutation.send({manifest:result.manifest});if(response?.eventId)setEventId(response.eventId);
  }
  function field(name:string,label:string,options:{multiline?:boolean;date?:boolean;optional?:boolean;help?:string}={}) {
    const value=(draft as Record<string,string>)[name];
    const props={name,value,required:!options.optional,disabled:mutation.busy,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>change(name,e.target.value),'aria-invalid':Boolean(errors[name]),'aria-describedby':errors[name]?`${name}-error`:undefined};
    return <label>{label}{options.multiline?<textarea {...props} rows={name==='rules'?5:3} maxLength={(JAM_DRAFT_LIMITS as Record<string,number>)[name]}/>:<input {...props} type={options.date?'datetime-local':'text'} maxLength={options.date?undefined:(JAM_DRAFT_LIMITS as Record<string,number>)[name]}/>} {options.help&&<small>{options.help}</small>}{errors[name]&&<span id={`${name}-error`} className="jam-error">{errors[name]}</span>}</label>;
  }
  return <><h1>Propose a ZeroJam</h1><p className="lead">Create a Game Jam or App Jam hosted on Zero. An independent Zero maintainer reviews your proposal before it becomes official.</p><JamPlanNotice/><p>Participants sign in with GitHub and link their own public repository. Before submissions close, they submit its published GitHub Pages URL or a custom domain configured for that repository.</p><HubAccount/>{!top?<DirectPage path="/hub/jams/create"/>:<form className="jam-form" noValidate onSubmit={e=>void propose(e)}>
    <label>Jam type<select value={draft.type} onChange={e=>change('type',e.target.value)} disabled={mutation.busy}><option value="game">Game Jam</option><option value="app">App Jam</option></select></label>
    {field('title','Title')}{field('summary','Description',{multiline:true})}{field('theme','Theme',{multiline:true})}{field('rules','Rules',{multiline:true})}{field('eligibility','Who can take part',{multiline:true})}
    <fieldset><legend>Schedule</legend><p>Enter dates and times in the timezone below.</p>{field('timezone','Timezone',{help:'Use an IANA timezone, such as America/Toronto.'})}{field('registrationOpensAt','Registration opens',{date:true})}{field('startsAt','Jam starts',{date:true})}{field('submissionsCloseAt','Submissions close',{date:true})}{field('galleryRevealAt','Gallery opens',{date:true,help:'The gallery opens after submissions close.'})}<details open={Boolean(errors.registrationClosesAt||errors.submissionsOpenAt)||undefined}><summary>More schedule options</summary><p>By default, registration closes and submissions open when the jam starts.</p>{field('registrationClosesAt','Registration closes',{date:true,optional:true})}{field('submissionsOpenAt','Submissions open',{date:true,optional:true})}</details></fieldset>
    {Object.values(errors).some(Boolean)&&<p role="alert" className="jam-error">{errors.form||'Review the highlighted details and try again.'}</p>}
    <button className="jam-primary" disabled={!user||mutation.busy||Boolean(eventId)}>{mutation.busy?'Sending proposal…':'Send for maintainer review'}</button><Feedback error={mutation.error} success={mutation.success}/>{eventId&&<p><Link href={`/hub/jams/${eventId}`}>View your proposal and review status</Link>. To propose another jam, <button type="button" onClick={()=>setEventId('')}>start another proposal</button>.</p>}
  </form>}</>;
}

function Proposal({id,data,onChanged}:{id:string;data:Detail;onChanged:()=>Promise<void>}) {
  const {user}=useHubGitHub(),top=useTopLevel(),mutation=useMutation(`/api/jams/${id}/actions`);
  const [reason,setReason]=useState('');
  const proposal=data.proposal; const creator=Boolean(user&&(data.event.creator?.id===user.id||proposal?.repository?.ownerId===user.id));
  if(!top)return null;
  async function review(action:string){const result=await mutation.send({action,revision:proposal?.revision,...(reason?{reason}:{})});if(result)await onChanged();}
  return <>{proposal&&<details className="jam-review" open={!data.event.revision}><summary>Proposal · {reviewLabel(proposal.status)}</summary>{proposal.repository?<p className="jam-source">Source: <a href={`https://github.com/${proposal.repository.fullName}/tree/${proposal.repository.commit}`} target="_blank" rel="noopener noreferrer">{proposal.repository.fullName} at {proposal.repository.commit}</a></p>:<p>Proposed by {data.event.creator?.login?`@${data.event.creator.login}`:'the organizer'} · Hosted on Zero</p>}{proposal.reason&&<p className="jam-notice">Review note: {proposal.reason}</p>}<h2>{proposal.manifest.title}</h2><EventFacts event={proposal.manifest}/>{proposal.manifest.websiteUrl&&<p><a href={proposal.manifest.websiteUrl} target="_blank" rel="noopener noreferrer">Proposed creator page</a></p>}{data.canMaintain&&proposal.status==='submitted'&&<div className="jam-form"><p>Review the exact proposed details above. Approval makes this revision official. Existing accepted details stay active until a replacement is approved.</p><label>Review reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} disabled={mutation.busy}/></label>{creator&&<p>You cannot review your own proposal. Another person must propose the jam for you to review.</p>}<div className="jam-actions"><button className="jam-primary" disabled={creator||mutation.busy} onClick={()=>void review('approve')}>Approve this revision</button><button disabled={creator||mutation.busy||!reason.trim()} onClick={()=>void review('request-changes')}>Request changes</button><button disabled={creator||mutation.busy||!reason.trim()} onClick={()=>void review('reject')}>Reject proposal</button></div><Feedback error={mutation.error} success={mutation.success}/></div>}</details>}{data.canMaintain&&data.event.revision&&<Moderation id={id} event={data.event} onChanged={onChanged}/>}</>;
}
function Moderation({id,event,onChanged}:{id:string;event:Event;onChanged:()=>Promise<void>}) {
  const [reason,setReason]=useState(''),mutation=useMutation(`/api/jams/${id}/actions`);
  async function act(action:string){const result=await mutation.send({action,reason});if(result)await onChanged();}
  return <details className="jam-review"><summary>Maintainer moderation</summary><div className="jam-form"><label>Public reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={256} disabled={mutation.busy}/></label><p>Suspension stops participation. Cancellation closes this event. The reason is visible on its official page.</p><div className="jam-actions">{event.moderation.status==='active'&&<button disabled={!reason.trim()||mutation.busy} onClick={()=>void act('suspend')}>Suspend jam</button>}{event.moderation.status==='suspended'&&<button disabled={!reason.trim()||mutation.busy} onClick={()=>void act('resume')}>Resume jam</button>}{event.moderation.status!=='cancelled'&&<button disabled={!reason.trim()||mutation.busy} onClick={()=>void act('cancel')}>Cancel jam</button>}</div><Feedback error={mutation.error} success={mutation.success}/></div></details>;
}
function EntryModeration({id,participantId,onChanged}:{id:string;participantId:string;onChanged:()=>Promise<void>}) {
  const top=useTopLevel(),[reason,setReason]=useState(''),mutation=useMutation(`/api/jams/${id}/actions`);
  async function withdraw(e:FormEvent) {
    e.preventDefault();
    if(!reason.trim())return;
    const result=await mutation.send({action:'withdraw-entry',participantId,reason});
    if(result)await onChanged();
  }
  if(!top)return null;
  return <details className="jam-review"><summary>Maintainer review</summary><form className="jam-form" onSubmit={e=>void withdraw(e)}><label>Public reason<textarea required value={reason} onChange={e=>setReason(e.target.value)} maxLength={256} disabled={mutation.busy}/></label><p>This removes the active entry from the gallery and keeps its withdrawal history. The participant stays registered and can submit a corrected entry while submissions are open.</p><button disabled={!reason.trim()||mutation.busy}>{mutation.busy?'Withdrawing entry…':'Withdraw this entry'}</button><Feedback error={mutation.error} success={mutation.success}/></form></details>;
}
function HeldEntryModeration({id,entries,onChanged,all=false}:{id:string;entries:Entry[];onChanged:()=>Promise<void>;all?:boolean}) {
  return <details className="jam-review"><summary>{all?'All submissions for maintainer review':'Held entries for maintainer review'} · {entries.length}</summary><p>{all?'This private review list includes submissions that may not appear in the public gallery.':'These entries are hidden from the public gallery until the applicable reveal.'} Review links carefully; GitHub Pages content can change.</p><ul className="jam-entries">{entries.map(entry=><li key={entry.participantId}><h3>{entry.title}</h3><p className="jam-muted">@{entry.login}</p><p className="jam-prose">{entry.description}</p>{entry.instructions&&<p className="jam-prose">{entry.instructions}</p>}<div className="jam-actions"><a href={`https://github.com/${entry.repository.fullName}${entry.repository.commit?`/tree/${entry.repository.commit}`:''}`} target="_blank" rel="noopener noreferrer">{entry.repository.commit?'Exact source':'Project source'}</a>{entry.demoUrl&&<a href={entry.demoUrl} target="_blank" rel="noopener noreferrer">Open demo</a>}</div><EntryModeration id={id} participantId={entry.participantId} onChanged={onChanged}/></li>)}</ul></details>;
}
function ModerationInbox({id,onChanged}:{id:string;onChanged:()=>Promise<void>}) {
  const {data,error,loading,refresh}=useResource<{moderationEntries:Entry[]}>(`/api/jams/${encodeURIComponent(id)}?view=moderation`,true);
  const updated=async()=>{await Promise.all([refresh(),onChanged()]);};
  return <><Retry error={error} loading={loading} refresh={refresh}/>{Boolean(data?.moderationEntries.length)&&<HeldEntryModeration id={id} entries={data!.moderationEntries} onChanged={updated} all/>}</>;
}
function MaintainerTools({id,onChanged,galleryError=''}:{id:string;onChanged:()=>Promise<void>;galleryError?:string}) {
  const {data,error,loading,refresh}=useResource<Detail>(`/api/jams/${encodeURIComponent(id)}?view=overview`,true);
  if(error)return error===galleryError?<button type="button" disabled={loading} onClick={()=>void refresh()}>Retry account view</button>:<Retry error={error} loading={loading} refresh={refresh}/>;
  return data?.canMaintain?<ModerationInbox id={id} onChanged={onChanged}/>:null;
}
export function JamDetail({id}:{id:string}) {
  const {user}=useHubGitHub();
  const [page,setPage]=useState<{id:string;cursor:string|null;previous:(string|null)[]}>({id,cursor:null,previous:[]});
  const [moderationVersion,setModerationVersion]=useState(0);
  const [moderationNotice,setModerationNotice]=useState<{id:string;userId:string}|null>(null);
  const cursor=page.id===id?page.cursor:null,previous=page.id===id?page.previous:[];
  const path=`/api/jams/${encodeURIComponent(id)}?view=gallery${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`;
  const {data,error,loading,refresh}=useResource<Detail & {nextCursor:string|null}>(path,true);
  const refreshAfterModeration=async()=>{if(user)setModerationNotice({id,userId:user.id});setModerationVersion(version=>version+1);await refresh();};
  return <>{cursor&&<button type="button" onClick={()=>setPage({id,cursor:null,previous:[]})}>Start gallery again</button>}<h1>{data?.event.title||'Jam details'}</h1>{moderationNotice?.id===id&&moderationNotice.userId===user?.id&&<p role="status">Most recent confirmed moderation: submission withdrawn.</p>}<Retry error={error} loading={loading} refresh={refresh}/>{data&&<><EventStatus event={data.event}/><EventFacts event={data.event}/><ApprovedVersions event={data.event}/><div className="jam-actions">{data.event.websiteUrl&&<a className="jam-button" href={data.event.websiteUrl} target="_blank" rel="noopener noreferrer">Creator’s jam page</a>}{data.event.revision&&<Link className="jam-button jam-primary" href={`/hub/jams/${id}/participate`}>Review and take part</Link>}</div><h2>Participants · {data.event.participantCount}</h2>{data.event.participants.length?<p>{data.event.participants.map(p=>`@${p.login}`).join(', ')}</p>:<p>No participants yet.</p>}<h2>Submitted work</h2>{data.event.galleryIncomplete&&<div className="jam-notice"><p role="status">Some submissions could not be verified. Try again later to see the complete gallery.</p><button type="button" disabled={loading} onClick={()=>void refresh()}>Retry verification for this page</button></div>}{data.event.entries.length?<ul className="jam-entries">{data.event.entries.map(entry=><li key={entry.participantId}><h3>{entry.title}</h3><p className="jam-muted">@{entry.login}</p><p className="jam-prose">{entry.description}</p>{entry.instructions&&<p className="jam-prose">{entry.instructions}</p>}<div className="jam-actions"><a href={`https://github.com/${entry.repository.fullName}${entry.repository.commit?`/tree/${entry.repository.commit}`:''}`} target="_blank" rel="noopener noreferrer">{entry.repository.commit?'Exact source':'Project source'}</a>{entry.demoUrl&&<a href={entry.demoUrl} target="_blank" rel="noopener noreferrer">Open demo</a>}</div>{data.canMaintain&&<EntryModeration id={id} participantId={entry.participantId} onChanged={refreshAfterModeration}/>}</li>)}</ul>:<p>{data.event.schedule.galleryRevealAt&&Date.parse(data.event.schedule.galleryRevealAt)>Date.now()?'The gallery opens after submissions close, at the time shown in the schedule.':data.event.galleryIncomplete?'No verified submissions are available right now.':data.nextCursor||previous.length?'No visible submissions on this page.':'No submissions are available to display.'}</p>}{previous.length>0&&<button type="button" disabled={loading} onClick={()=>setPage({id,cursor:previous.at(-1)??null,previous:previous.slice(0,-1)})}>Previous gallery page</button>}{data.nextCursor&&<button type="button" disabled={loading} onClick={()=>setPage({id,cursor:data.nextCursor,previous:[...previous,cursor]})}>Next gallery page</button>}<HubAccount/><Proposal id={id} data={data} onChanged={refresh}/></>}{user&&<MaintainerTools key={`${id}:${user.id}:${moderationVersion}`} id={id} onChanged={refreshAfterModeration} galleryError={error}/>}</>;
}
export function JamParticipate({id,pagesInstallLink}:{id:string,pagesInstallLink:string|null}) {
  const {user}=useHubGitHub();
  return <JamParticipateForm key={`${id}:${user?.id||'public'}`} id={id} pagesInstallLink={pagesInstallLink}/>;
}
function JamParticipateForm({id,pagesInstallLink}:{id:string,pagesInstallLink:string|null}) {
  const top=useTopLevel(),{user}=useHubGitHub(),{data,error,loading,refresh}=useResource<Detail>(`/api/jams/${encodeURIComponent(id)}?view=overview`);
  const mutation=useMutation(`/api/jams/${encodeURIComponent(id)}/actions`);
  const [ack,setAck]=useState(''),[source,setSource]=useDraft<Source>(`entry-source:${id}:${user?.id||'public'}`,{repositoryUrl:'',commit:''});
  const [repositoryEdited,setRepositoryEdited]=useState(false);
  const [entryDraft,setEntryDraft]=useDraft(`entry-details:${id}:${user?.id||'public'}`,{title:'',description:'',demoUrl:'',instructions:''});
  const {title,description,demoUrl,instructions}=entryDraft;
  const setTitle=(title:string)=>setEntryDraft({...entryDraft,title}),setDescription=(description:string)=>setEntryDraft({...entryDraft,description}),setDemoUrl=(demoUrl:string)=>setEntryDraft({...entryDraft,demoUrl}),setInstructions=(instructions:string)=>setEntryDraft({...entryDraft,instructions});
  async function act(action:string,extra:Mutation={}){if(!data)return;if(['join','submit'].includes(action)&&(!data.event.revision||ack!==data.event.revision))return;const result=await mutation.send({action,...(['join','submit'].includes(action)?{revision:data.event.revision}:{}),...extra});if(result)await refresh();}
  async function submit(e:FormEvent){e.preventDefault();await act('submit',{...(!showcase?{source}:{}),title,description,demoUrl,...(instructions?{instructions}:{})});}
  const showcase=Boolean(data?.event.schedule.galleryRevealAt);
  const boundRepository=data?.registration?.repository;
  const repositoryUrl=source.repositoryUrl||(!repositoryEdited&&boundRepository?`https://github.com/${boundRepository.fullName}`:'');
  const joined=data?.registration?.status==='joined',activeEntry=data?.entry?.status==='active';
  const changedSinceJoining=Boolean(joined&&data?.event.revision&&data.registration?.revision!==data.event.revision);
  const fresh=Boolean(data?.event.revision&&ack===data.event.revision),allowed=Boolean(user&&data?.event.revision&&!loading&&!error);
  return <><h1>{data?`Take part in ${data.event.title}`:'Take part in a jam'}</h1><p><Link href={`/hub/jams/${id}`}>Official jam details and entries</Link></p><HubAccount/><Retry error={error} loading={loading} refresh={refresh}/>{!top?<DirectPage path={`/hub/jams/${id}/participate`}/>:data&&<><EventStatus event={data.event}/>{changedSinceJoining&&<p className="jam-notice" role="status">This jam has a newer approved version since you last agreed. Review the current rules and schedule before submitting. You can compare earlier approved versions below.</p>}<EventFacts event={data.event}/><ApprovedVersions event={data.event}/>{!data.event.revision?<p>This jam has no approved revision. Participation is unavailable until maintainer approval.</p>:<><p>Your GitHub identity, source links and submission details will be public. Coursework links still go separately to Pika.</p><label className="jam-check"><input type="checkbox" checked={fresh} onChange={e=>setAck(e.target.checked?data.event.revision||'':'')} disabled={mutation.busy}/><span>I reviewed the current approved rules, eligibility and schedule above.</span></label><p className="jam-status">{joined?'You are registered.':'You are not registered.'}{activeEntry?' You have an active submission.':''}</p>{showcase&&!joined&&<div className="jam-form"><label>Public GitHub repository<input name="repositoryUrl" type="url" required maxLength={256} placeholder="https://github.com/your-name/your-project" value={repositoryUrl} onChange={e=>{setRepositoryEdited(true);setSource({...source,repositoryUrl:e.target.value});}} disabled={mutation.busy}/></label><p>Use the public repository owned by your signed-in GitHub account. You can join before publishing. When rejoining, enter the current URL if you renamed your repository. It must still be the same GitHub repository; you cannot switch to another one.</p></div>}{showcase&&<section><h2>GitHub Pages access</h2><p>You can join before publishing. To verify your published site at submission and again when the gallery is revealed, Zero needs read access to GitHub Pages for your project repository. Use the existing Codepet Zero GitHub App. If it is already installed, add your project repository to its selection and keep any repositories you still use with Zero. The App also requests broader repository permissions for Zero development; review the permissions GitHub displays. You can change or revoke access later in GitHub.</p>{pagesInstallLink?<p><a className="jam-button" href={pagesInstallLink} target="_blank" rel="noopener noreferrer">Set up GitHub Pages access</a></p>:<p className="jam-muted">GitHub Pages access setup is unavailable in this preview.</p>}<p>Already using Zero? <a href="https://github.com/settings/installations" target="_blank" rel="noopener noreferrer">Manage your existing GitHub App installation</a>.</p><p>Returning from GitHub does not confirm installation or verification. Submit your published URL to request verification.</p></section>}<p>Joining is free. This jam has room for up to {data.event.participantLimit} participants.</p><div className="jam-actions">{!joined?<button className="jam-primary" disabled={!allowed||!fresh||!data.event.registrationOpen||mutation.busy||showcase&&!repositoryUrl.trim()} onClick={()=>void act('join',showcase?{repositoryUrl}:{})}>{mutation.busy?'Confirming…':'Join this jam'}</button>:<button disabled={!allowed||mutation.busy} onClick={()=>void act('leave')}>Leave jam and withdraw my entry</button>}{activeEntry&&<button disabled={!allowed||mutation.busy} onClick={()=>void act('withdraw')}>Withdraw my submission</button>}</div>{!data.event.registrationOpen&&!joined&&<p className="jam-muted">Registration is closed. Check the schedule or return to the official jam page.</p>}{joined&&<><h2>{activeEntry?'Replace your submission':'Submit your work'}</h2><p>{showcase?'Submit the published GitHub Pages URL for your linked repository before submissions close. A custom domain configured for that repository is also accepted. Zero checks GitHub metadata at submission and again for the gallery. This confirms the reported association, not the site contents or source commit; the site can change. Verification and Zero’s final check must finish before the deadline. GitHub may confirm afterward; the submission is accepted only when Zero confirms it. If verification is unavailable, check that Pages is published for this repository and retry before the deadline.':'Submit your own public source at an exact commit.'} A replacement keeps one active entry; leaving withdraws it, and joining again does not restore it.</p><form className="jam-form" onSubmit={e=>void submit(e)}>{showcase?<p>Linked repository: <a href={`https://github.com/${boundRepository?.fullName}`} target="_blank" rel="noopener noreferrer">{boundRepository?.fullName}</a></p>:<SourceFields source={source} setSource={setSource} disabled={mutation.busy}/>}<label>Entry title<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120} disabled={mutation.busy}/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} required maxLength={2000} disabled={mutation.busy}/></label><label>{showcase?'Published GitHub Pages URL':'Demo URL'}<input type="url" required value={demoUrl} onChange={e=>setDemoUrl(e.target.value)} maxLength={500} disabled={mutation.busy}/></label><label>Instructions (optional)<textarea value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={2000} disabled={mutation.busy}/></label><button className="jam-primary" disabled={!allowed||!fresh||!data.event.submissionsOpen||mutation.busy}>{mutation.busy?'Confirming submission…':activeEntry?'Replace my submission':'Submit my work'}</button>{!data.event.submissionsOpen&&<p className="jam-muted">Submissions are closed. Your draft stays in this page while you check the schedule.</p>}</form></>}<Feedback error={mutation.error} success={mutation.success}/></>}</>}</>;
}
