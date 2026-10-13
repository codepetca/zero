'use client';
import {useEffect,useRef,useState} from 'react';
import {createHubPoll} from '@/lib/hub-poll.mjs';
import Link from 'next/link';
import {checkLabel,folderBundle,validateUploadBundle,publishedSubmission,uploadsAvailable} from '@/lib/hub-client.mjs';
import {clearSubmissionReturn,consumeSubmissionReturn,createSubmissionReader,rememberSubmissionReturn,submissionLink,takeSelectedFiles,validSubmissionId} from '@/lib/hub-submission.mjs';
import type {HubRelease} from './HubDiscovery';
type Bundle = {descriptor:{libraryId:string;version:string;[key:string]:unknown};files:Record<string,string>};
type Session = {mode:string;capabilities?:{uploads:boolean};user:null|{id:string;login:string};csrfToken?:string};
type Job = {id:string;status:string;error?:string;report?:{checks?:{id:string;passed:boolean;detail:string}[];platforms?:string[];error?:string};release?:HubRelease};
function returnStorage(){try{return window.sessionStorage;}catch{return null;}}
async function download(bundle:Bundle) {
  const response=await fetch('/api/hub/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bundle)});
  if(!response.ok){const data=await response.json();throw new Error(data.error||'Could not prepare the editable project.');}
  const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${bundle.descriptor.libraryId}-${bundle.descriptor.version}.zip`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function HubPrepare() {
  const [session,setSession]=useState<Session|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [className,setClassName]=useState('MyWidget');const [title,setTitle]=useState('');const [bundle,setBundle]=useState<Bundle|null>(null);const [upload,setUpload]=useState<Bundle|null>(null);const [job,setJob]=useState<Job|null>(null);const [pollView,setPollView]=useState({state:'complete',message:'',inFlight:false});
  const pollRef=useRef<ReturnType<typeof createHubPoll>|null>(null);
  const [reader]=useState(()=>createSubmissionReader());
  const epoch=useRef(0);
  const jobRevision=useRef(0);
  const [resultId,setResultId]=useState<string|null>(null);
  const jobId=job?.id;const accountId=session?.user?.id;const canUpload=uploadsAvailable(session);
  async function api(path:string,body?:unknown) { const response=await fetch(`/api/hub/${path}`,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json','X-Zero-CSRF':session?.csrfToken||''},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||`Hub request failed (${response.status}).`);return data; }
  useEffect(()=>{const controller=new AbortController();fetch('/api/hub/session',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Hub unavailable.');if(!controller.signal.aborted)setSession(data);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[]);
  useEffect(()=>{
    const version=++epoch.current;
    reader.invalidate();pollRef.current?.dispose();setJob(null);setResultId(null);setBundle(null);setUpload(null);setError('');setBusy(false);
    if(accountId&&canUpload) {
      void (async()=>{
        try {
          const id=consumeSubmissionReturn(window.location.search,returnStorage());
          if(!id)return;
          window.history.replaceState(window.history.state,'',submissionLink(id));
          setResultId(id);
          const restored=await reader.read(id);
          if(restored&&epoch.current===version)setJob(restored);
        }catch(error){if(epoch.current===version)setError(error instanceof Error?error.message:'Could not retrieve this submission.');}
      })();
    }
    return()=>{epoch.current++;reader.invalidate();pollRef.current?.dispose();};
  },[accountId,canUpload,reader]);
  useEffect(()=>{
    if(!jobId||!accountId||!canUpload)return;
    const poll=createHubPoll({jobId,status:job?.status,onJob:(data:Job)=>{jobRevision.current++;setJob(data);setError('');},onState:(view:{state:string;message:string;inFlight:boolean})=>setPollView(view),onError:(message:string)=>setError(message)});
    pollRef.current=poll;
    const availability=()=>poll.setAvailable({visible:!document.hidden,online:navigator.onLine});
    availability();poll.start();
    document.addEventListener('visibilitychange',availability);window.addEventListener('online',availability);window.addEventListener('offline',availability);
    return()=>{poll.dispose();if(pollRef.current===poll)pollRef.current=null;document.removeEventListener('visibilitychange',availability);window.removeEventListener('online',availability);window.removeEventListener('offline',availability);};
    // A status snapshot changes on every response; only job/account changes own a new budget.
  },[jobId,accountId,canUpload]);
  useEffect(()=>{pollRef.current?.setStatus(job?.status);},[job?.status]);
  async function action(run:()=>Promise<void>){const version=epoch.current;setBusy(true);setError('');try{await run();}catch(error){if(epoch.current===version)setError(error instanceof Error?error.message:'Hub action failed.');}finally{if(epoch.current===version)setBusy(false);}}
  async function submitUpload(){
    const version=epoch.current;
    const data=await api('submissions',upload);
    if(epoch.current!==version)return;
    if(!validSubmissionId(data.id)||typeof data.status!=='string')throw new Error('Could not identify this submission.');
    reader.invalidate();
    if(data.id!==jobId)pollRef.current?.dispose();else pollRef.current?.setStatus(data.status);
    setJob(data);setUpload(null);setResultId(data.id);
    window.history.replaceState(window.history.state,'',submissionLink(data.id));
    // Terminal duplicate source needs its report/release immediately. Pending
    // jobs use the existing single-flight polling budget without a parallel read.
    if(data.status==='failed'||data.status==='published') {
      const revision=jobRevision.current;
      const complete=await reader.read(data.id);
      if(complete&&epoch.current===version&&jobRevision.current===revision)setJob(complete);
    }
  }
  async function signOut(){
    const version=epoch.current;
    const poll=pollRef.current;
    reader.invalidate();
    poll?.setAvailable({visible:false,online:false});
    try{await api('logout',{});if(epoch.current!==version)return;epoch.current++;poll?.dispose();setSession(session?{...session,user:null,csrfToken:undefined}:null);setBundle(null);setUpload(null);setJob(null);setResultId(null);setBusy(false);clearSubmissionReturn(returnStorage());window.history.replaceState(window.history.state,'','/hub/prepare');}
    finally{poll?.setAvailable({visible:!document.hidden,online:navigator.onLine});}
  }
  return <>
    {session?.mode==='local'&&<p className="hub-note">Local test hub. Sign in uses the configured local developer identity. Uploads remain in this local service.</p>}
    {error&&<p className="hub-error" role="alert">{error}</p>}
    {!session ? <p role="status">{error?'ZeroHub is unavailable. Try again shortly.':'Connecting to the hub…'}</p> : !uploadsAvailable(session) ? <p role="status">Library uploads are not open yet. <Link href="/hub">Browse available libraries</Link>.</p> : !session.user ? <a className="button compact" href="/api/hub/auth/start" onClick={()=>rememberSubmissionReturn(window.location.search,returnStorage())}>{session.mode==='local'?'Sign in to local test hub':'Sign in with GitHub'}</a> : <>
      <div className="resource-links"><p>Signed in as {session.user.login}</p><button className="text-button" disabled={busy} onClick={()=>action(signOut)}>Sign out</button></div>
      <section><h2>1. Prepare your library</h2><form className="hub-form" onSubmit={event=>{event.preventDefault();const version=epoch.current;void action(async()=>{const result=await api('libraries',{className,title});validateUploadBundle(result.bundle);if(epoch.current===version)setBundle(result.bundle);});}}>
        <label htmlFor="class-name">Java class name</label><input id="class-name" required pattern="[A-Z][A-Za-z0-9]*" maxLength={64} value={className} onChange={event=>setClassName(event.target.value)} />
        <label htmlFor="library-title">Library title</label><input id="library-title" required maxLength={100} value={title} onChange={event=>setTitle(event.target.value)} placeholder="A useful name" />
        <button className="button compact" disabled={busy}>Prepare library</button>
      </form>{bundle&&<div><p>Reserved <code>{bundle.descriptor.libraryId}</code>. Your classes belong in <code>zero.{bundle.descriptor.libraryId}</code>.</p><button className="button secondary compact" disabled={busy} onClick={()=>action(()=>download(bundle))}>Download editable folder</button><p className="fine-print">Extract the ZIP and open the folder in VS Code. Run App opens the editable preview. Edit the ordinary Java source, API notes, behavior check, two examples and PNG preview. Local POM, wrapper, preview Main and editor files stay outside the uploaded library. Keep .zero-library.json in the folder; it identifies your reservation. Update the descriptor’s version for each new release.</p></div>}</section>
      <section><h2>2. Upload your folder</h2><p>Choose the extracted library folder after editing. The hub checks your actual files before listing a release.</p>
        <div className="hub-form"><label htmlFor="library-folder">Library folder</label><input id="library-folder" ref={input=>{input?.setAttribute('webkitdirectory','');}} type="file" multiple disabled={busy} onChange={event=>{const files=takeSelectedFiles(event.currentTarget);const version=epoch.current;setUpload(null);if(files.length)void action(async()=>{const selected=await folderBundle(files);if(epoch.current===version)setUpload(selected);});}} />
          <details><summary>Use submission JSON instead</summary><label htmlFor="library-json">JSON containing descriptor and files</label><input id="library-json" type="file" accept=".json,application/json" disabled={busy} onChange={event=>{const [file]=takeSelectedFiles(event.currentTarget);const version=epoch.current;setUpload(null);if(file)void action(async()=>{if(file.size>1024*1024)throw new Error('Submission exceeds 1 MiB.');const selected=validateUploadBundle(JSON.parse(await file.text()));if(epoch.current===version)setUpload(selected);});}} /></details>
          {upload&&<p>{upload.descriptor.libraryId} · {upload.descriptor.version} · {Object.keys(upload.files).length} files ready</p>}
          <button className="button compact" disabled={busy||!upload} onClick={()=>action(submitUpload)}>Upload for checks</button>
        </div>
      </section>
      {resultId&&<p><a href={submissionLink(resultId)}>Return to this submission result</a>. Bookmark this link; sign in with the same contributor account to resume.</p>}
      {job&&<section aria-live="polite"><h2>3. Check result</h2><p>Submission <code>{job.id}</code>: <strong>{job.status}</strong></p>{pollView.message&&<p role="status" className="fine-print">{pollView.message}</p>}
        {job.error&&<p className="hub-error">{job.error}</p>}
        {job.report?.error&&<p className="hub-error">{job.report.error}</p>}
        {job.report?.checks&&<ul>{job.report.checks.map(check=><li key={check.id}>{check.passed?'Passed':'Failed'}: {checkLabel(check.id)}{!check.passed&&`: ${check.detail}`} </li>)}</ul>}
        {job.report?.platforms&&<p>Checked platforms: {job.report.platforms.join(', ')}</p>}
        {publishedSubmission(job)&&job.release&&<p>Listed: {job.release.title} {job.release.version}. <a href={`/hub?library=${encodeURIComponent(job.release.libraryId)}&version=${encodeURIComponent(job.release.version)}`}>View this library release</a></p>}
        <button className="text-button" disabled={busy||pollView.inFlight} onClick={()=>action(async()=>{await pollRef.current?.refresh();})}>Refresh result</button>
        <p className="fine-print">A failed or unavailable check does not publish your library. Fix the reported files and upload again. Once a version is published, use a new version for changes.</p>
      </section>}
    </>}
  </>;
}
