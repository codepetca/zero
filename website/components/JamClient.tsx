'use client';
import Link from 'next/link';
import {JamPreparation} from './JamPreparation';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {HubAccount,useHubGitHub} from './HubGitHub';

type Source = {repositoryUrl:string;commit:string};
type Repository = {id:string;ownerId:string;fullName:string;commit:string};
type Manifest = {type:'game'|'app';title:string;summary:string;theme:string;rules:string;eligibility:string;websiteUrl:string;timezone:string;schedule:Record<string,string>};
type Entry = {participantId:string;login:string;title:string;description:string;demoUrl?:string;instructions?:string;repository:Repository;submittedAt:string;status?:string};
type Event = Manifest & {id:string;revision:string|null;approvalHistory?:{revision:string;approvedAt:string;manifest:Manifest}[];reviewStatus:string;moderation:{status:string;reason?:string};registrationOpen:boolean;submissionsOpen:boolean;participantCount:number;participants:{id:string;login:string}[];entries:Entry[];updatedAt:string};
type Detail = {configured:boolean;event:Event;registration:{status:string;revision?:string}|null;entry:Entry|null;canMaintain:boolean;proposal?:{revision:string;manifest:Manifest;repository:Repository;status:string;reason?:string}};
type Mutation = Record<string,unknown>;
const kindLabel = (type:string) => type === 'app' ? 'App Jam' : 'Game Jam';
const reviewLabel = (status:string) => ({submitted:'Awaiting review',approved:'Approved','changes-requested':'Changes requested',rejected:'Rejected'}[status] || status);
function message(error:unknown) { return error instanceof Error ? error.message : 'The request failed. Your form is kept; try again.'; }
async function jsonResponse(response:Response) {
  let body;try {body=await response.json();}catch {throw new Error('ZeroJams returned an unreadable response. Try again.');}
  if(!response.ok || body.configured===false) throw new Error(typeof body.error==='string' ? body.error : 'ZeroJams is unavailable. Keep your work and try again later.');
  return body;
}
function useResource<T>(path:string) {
  const {user}=useHubGitHub(),identity=`${path}:${user?.id||'public'}`;
  const [resource,setResource]=useState<{identity:string;value:T}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;setLoading(true);setError('');
    try { const body=await jsonResponse(await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)}));if(current===generation.current)setResource({identity,value:body}); }
    catch(e){if(current===generation.current)setError(message(e));}
    finally {if(current===generation.current)setLoading(false);}
  },[path,identity]);
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
  return <>{loading&&<p role="status">Checking ZeroJams…</p>}{error&&<div className="jam-notice"><p role="alert">{error}</p><button type="button" onClick={()=>void refresh()} disabled={loading}>Retry loading</button><p className="jam-muted">Keep your repository and commit. No action has been confirmed here.</p></div>}</>;
}
function DirectPage({path}:{path:string}) {return <p className="jam-notice">Participation and review need a direct Zero page. <a href={path} target="_blank" rel="noopener noreferrer">Open this page on Zero</a>. If a new tab is blocked, copy or open this link directly.</p>;}
function EventFacts({event}:{event:Manifest}) {
  const labels:Record<string,string>={registrationOpensAt:'Registration opens',registrationClosesAt:'Registration closes',startsAt:'Jam starts',submissionsOpenAt:'Submissions open',submissionsCloseAt:'Submissions close'};
  function date(value:string) {try{return new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:event.timezone}).format(new Date(value));}catch{return value;}}
  return <><p className="jam-muted">{kindLabel(event.type)} · {event.timezone}</p><p className="lead">{event.summary}</p><dl className="jam-facts">{Object.entries(labels).map(([key,label])=><div key={key}><dt>{label}</dt><dd><time dateTime={event.schedule[key]}>{date(event.schedule[key])}</time></dd></div>)}</dl><h2>Theme</h2><p className="jam-prose">{event.theme}</p><h2>Rules</h2><p className="jam-prose">{event.rules}</p><h2>Who can take part</h2><p>Every jam requires a GitHub account. Sign in on Zero to join and submit your own public GitHub repository at an exact commit.</p><p className="jam-prose">{event.eligibility}</p></>;
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
  const {data,error,loading,refresh}=useResource<{configured:boolean;events:Event[];canMaintain?:boolean;proposals?:{id:string;title:string;type:string;revision:string;status:string;organizerLogin:string;submittedAt:string}[]}>('/api/jams');
  const [type,setType]=useState('all');
  const events=(data?.events||[]).filter(event=>type==='all'||event.type===type);
  return <><h1>ZeroJams</h1><p className="lead">Build something together. Browse approved Game Jams and App Jams, then review the rules on Zero before taking part.</p><p><Link className="jam-button jam-primary" href="/hub/jams/create">Create a jam</Link></p>{data?.canMaintain&&Boolean(data.proposals?.length)&&<section><h2>Review proposals</h2><ul>{data.proposals!.map(proposal=><li key={proposal.id}><Link href={`/hub/jams/${proposal.id}`}>{proposal.title}</Link> · {kindLabel(proposal.type)} · @{proposal.organizerLogin} · {reviewLabel(proposal.status)}</li>)}</ul></section>}<div className="jam-filter"><select aria-label="Jam type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All jams</option><option value="game">Game Jams</option><option value="app">App Jams</option></select></div><Retry error={error} loading={loading} refresh={refresh}/>{data&&!loading&&!error&&!events.length&&<p>No approved {type==='all'?'jams':kindLabel(type)+'s'} are listed yet. You can prepare your own template while you wait.</p>}<div className="jam-cards">{events.map(event=><article className="jam-card" key={event.id}><p className="jam-muted">{kindLabel(event.type)}</p><h2><Link href={`/hub/jams/${event.id}`}>{event.title}</Link></h2><p>{event.summary}</p><p>{event.registrationOpen?'Registration open':'Registration closed'} · {event.participantCount} participants</p><p><Link href={`/hub/jams/${event.id}`}>View rules and schedule</Link></p></article>)}</div></>;
}
export function JamCreate() {
  const {user}=useHubGitHub(),top=useTopLevel();const [source,setSource]=useDraft<Source>('create-source',{repositoryUrl:'',commit:''});
  const [eventId,setEventId]=useState('');const mutation=useMutation('/api/jams/proposals');
  async function propose(e:FormEvent){e.preventDefault();const result=await mutation.send(source);if(result?.eventId)setEventId(result.eventId);}
  return <><JamPreparation/><details className="jam-review"><summary>Submit a published site for approval</summary><p>After publishing your site, propose its exact source for a Zero maintainer to review.</p><HubAccount/>{!top?<DirectPage path="/hub/jams/create"/>:<form className="jam-form" onSubmit={e=>void propose(e)}><SourceFields source={source} setSource={setSource} disabled={mutation.busy}/><p>Use the GitHub account that owns this repository. A Zero maintainer will review the exact manifest and source commit before official registration can open.</p><button className="jam-primary" disabled={!user||mutation.busy}>{mutation.busy?'Sending proposal…':'Send for maintainer review'}</button><Feedback error={mutation.error} success={mutation.success}/>{eventId&&<p><Link href={`/hub/jams/${eventId}`}>View your proposal and review status</Link></p>}</form>}</details></>;
}
function Proposal({id,data,onChanged}:{id:string;data:Detail;onChanged:()=>Promise<void>}) {
  const {user}=useHubGitHub(),top=useTopLevel(),mutation=useMutation(`/api/jams/${id}/actions`);
  const proposeMutation=useMutation('/api/jams/proposals');
  const [reason,setReason]=useState(''),[source,setSource]=useDraft<Source>(`update-source:${id}`,{repositoryUrl:'',commit:''});
  const proposal=data.proposal; const creator=Boolean(user&&proposal?.repository.ownerId===user.id);
  if(!top)return null;
  async function review(action:string){const result=await mutation.send({action,revision:proposal?.revision,...(reason?{reason}:{})});if(result)await onChanged();}
  async function update(e:FormEvent){e.preventDefault();const result=await proposeMutation.send({...source,repositoryUrl:`https://github.com/${proposal!.repository.fullName}`});if(result)await onChanged();}
  return <>{proposal&&<details className="jam-review" open={!data.event.revision}><summary>Proposal · {reviewLabel(proposal.status)}</summary><p className="jam-source">Source: <a href={`https://github.com/${proposal.repository.fullName}/tree/${proposal.repository.commit}`} target="_blank" rel="noopener noreferrer">{proposal.repository.fullName} at {proposal.repository.commit}</a></p>{proposal.reason&&<p className="jam-notice">Review note: {proposal.reason}</p>}<h2>{proposal.manifest.title}</h2><EventFacts event={proposal.manifest}/><p><a href={proposal.manifest.websiteUrl} target="_blank" rel="noopener noreferrer">Proposed creator page</a></p>{data.canMaintain&&proposal.status==='submitted'&&<div className="jam-form"><p>Review the exact proposed details above. Approval makes this revision official. Existing accepted details stay active until a replacement is approved.</p><label>Review reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} disabled={mutation.busy}/></label>{creator&&<p>A different Zero maintainer must review your proposal.</p>}<div className="jam-actions"><button className="jam-primary" disabled={creator||mutation.busy} onClick={()=>void review('approve')}>Approve this revision</button><button disabled={creator||mutation.busy||!reason.trim()} onClick={()=>void review('request-changes')}>Request changes</button><button disabled={creator||mutation.busy||!reason.trim()} onClick={()=>void review('reject')}>Reject proposal</button></div><Feedback error={mutation.error} success={mutation.success}/></div>}</details>}{creator&&<section><h2>Propose an update</h2><p>Commit your changed manifest, then send the new exact source. Approved details stay active while the update is reviewed.</p><form className="jam-form" onSubmit={e=>void update(e)}><SourceFields source={source} setSource={setSource} disabled={proposeMutation.busy} fixedRepository={`https://github.com/${proposal!.repository.fullName}`}/><button disabled={proposeMutation.busy||!user}>{proposeMutation.busy?'Sending update…':'Send updated source for review'}</button><Feedback error={proposeMutation.error} success={proposeMutation.success}/></form></section>}{data.canMaintain&&data.event.revision&&<Moderation id={id} event={data.event} onChanged={onChanged}/>}</>;
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
export function JamDetail({id}:{id:string}) {
  const {data,error,loading,refresh}=useResource<Detail>(`/api/jams/${encodeURIComponent(id)}`);
  return <><h1>{data?.event.title||'Jam details'}</h1><Retry error={error} loading={loading} refresh={refresh}/>{data&&<><EventStatus event={data.event}/><EventFacts event={data.event}/><ApprovedVersions event={data.event}/><div className="jam-actions"><a className="jam-button" href={data.event.websiteUrl} target="_blank" rel="noopener noreferrer">Creator’s jam page</a>{data.event.revision&&<Link className="jam-button jam-primary" href={`/hub/jams/${id}/participate`}>Review and take part</Link>}</div><h2>Participants · {data.event.participantCount}</h2>{data.event.participants.length?<p>{data.event.participants.map(p=>`@${p.login}`).join(', ')}</p>:<p>No participants yet.</p>}<h2>Submitted work</h2>{data.event.entries.length?<ul className="jam-entries">{data.event.entries.map(entry=><li key={entry.participantId}><h3>{entry.title}</h3><p className="jam-muted">@{entry.login}</p><p className="jam-prose">{entry.description}</p>{entry.instructions&&<p className="jam-prose">{entry.instructions}</p>}<div className="jam-actions"><a href={`https://github.com/${entry.repository.fullName}/tree/${entry.repository.commit}`} target="_blank" rel="noopener noreferrer">Exact source</a>{entry.demoUrl&&<a href={entry.demoUrl} target="_blank" rel="noopener noreferrer">Open demo</a>}</div>{data.canMaintain&&<EntryModeration id={id} participantId={entry.participantId} onChanged={refresh}/>}</li>)}</ul>:<p>No active submissions yet.</p>}<HubAccount/><Proposal id={id} data={data} onChanged={refresh}/></>}</>;
}
export function JamParticipate({id}:{id:string}) {
  const top=useTopLevel(),{user}=useHubGitHub(),{data,error,loading,refresh}=useResource<Detail>(`/api/jams/${encodeURIComponent(id)}`);
  const mutation=useMutation(`/api/jams/${encodeURIComponent(id)}/actions`);
  const [ack,setAck]=useState(''),[source,setSource]=useDraft<Source>(`entry-source:${id}`,{repositoryUrl:'',commit:''});
  const [entryDraft,setEntryDraft]=useDraft(`entry-details:${id}`,{title:'',description:'',demoUrl:'',instructions:''});
  const {title,description,demoUrl,instructions}=entryDraft;
  const setTitle=(title:string)=>setEntryDraft({...entryDraft,title}),setDescription=(description:string)=>setEntryDraft({...entryDraft,description}),setDemoUrl=(demoUrl:string)=>setEntryDraft({...entryDraft,demoUrl}),setInstructions=(instructions:string)=>setEntryDraft({...entryDraft,instructions});
  async function act(action:string,extra:Mutation={}){if(!data)return;if(['join','submit'].includes(action)&&(!data.event.revision||ack!==data.event.revision))return;const result=await mutation.send({action,...(['join','submit'].includes(action)?{revision:data.event.revision}:{}),...extra});if(result)await refresh();}
  async function submit(e:FormEvent){e.preventDefault();await act('submit',{source,title,description,demoUrl,...(instructions?{instructions}:{})});}
  const joined=data?.registration?.status==='joined',activeEntry=data?.entry?.status==='active';
  const changedSinceJoining=Boolean(joined&&data?.event.revision&&data.registration?.revision!==data.event.revision);
  const fresh=Boolean(data?.event.revision&&ack===data.event.revision),allowed=Boolean(user&&data?.event.revision&&!loading&&!error);
  return <><h1>{data?`Take part in ${data.event.title}`:'Take part in a jam'}</h1><p><Link href={`/hub/jams/${id}`}>Official jam details and entries</Link></p><HubAccount/><Retry error={error} loading={loading} refresh={refresh}/>{!top?<DirectPage path={`/hub/jams/${id}/participate`}/>:data&&<><EventStatus event={data.event}/>{changedSinceJoining&&<p className="jam-notice" role="status">This jam has a newer approved version since you last agreed. Review the current rules and schedule before submitting. You can compare earlier approved versions below.</p>}<EventFacts event={data.event}/><ApprovedVersions event={data.event}/>{!data.event.revision?<p>This jam has no approved revision. Participation is unavailable until maintainer approval.</p>:<><p>Your GitHub identity, source links and submission details will be public. Coursework links still go separately to Pika.</p><label className="jam-check"><input type="checkbox" checked={fresh} onChange={e=>setAck(e.target.checked?data.event.revision||'':'')} disabled={mutation.busy}/><span>I reviewed the current approved rules, eligibility and schedule above.</span></label><p className="jam-status">{joined?'You are registered.':'You are not registered.'}{activeEntry?' You have an active submission.':''}</p><div className="jam-actions">{!joined?<button className="jam-primary" disabled={!allowed||!fresh||!data.event.registrationOpen||mutation.busy} onClick={()=>void act('join')}>{mutation.busy?'Confirming…':'Join this jam'}</button>:<button disabled={!allowed||mutation.busy} onClick={()=>void act('leave')}>Leave jam and withdraw my entry</button>}{activeEntry&&<button disabled={!allowed||mutation.busy} onClick={()=>void act('withdraw')}>Withdraw my submission</button>}</div>{!data.event.registrationOpen&&!joined&&<p className="jam-muted">Registration is closed. Check the schedule or return to the official jam page.</p>}{joined&&<><h2>{activeEntry?'Replace your submission':'Submit your work'}</h2><p>Submit your own public source at an exact commit. A replacement keeps one active entry; leaving withdraws it, and joining again does not restore it.</p><form className="jam-form" onSubmit={e=>void submit(e)}><SourceFields source={source} setSource={setSource} disabled={mutation.busy}/><label>Entry title<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120} disabled={mutation.busy}/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} required maxLength={2000} disabled={mutation.busy}/></label><label>Demo URL<input type="url" required value={demoUrl} onChange={e=>setDemoUrl(e.target.value)} maxLength={500} disabled={mutation.busy}/></label><label>Instructions (optional)<textarea value={instructions} onChange={e=>setInstructions(e.target.value)} maxLength={2000} disabled={mutation.busy}/></label><button className="jam-primary" disabled={!allowed||!fresh||!data.event.submissionsOpen||mutation.busy}>{mutation.busy?'Confirming submission…':activeEntry?'Replace my submission':'Submit my work'}</button>{!data.event.submissionsOpen&&<p className="jam-muted">Submissions are closed. Your draft stays in this page while you check the schedule.</p>}</form></>}<Feedback error={mutation.error} success={mutation.success}/></>}</>}</>;
}
