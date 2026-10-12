'use client';
import {useEffect,useState} from 'react';
import {folderBundle,validateUploadBundle,publishedSubmission} from '@/lib/hub-client.mjs';
import type {HubRelease} from './HubDiscovery';
type Bundle = {descriptor:{libraryId:string;version:string;[key:string]:unknown};files:Record<string,string>};
type Session = {mode:string;user:null|{id:string;login:string};csrfToken?:string};
type Job = {id:string;status:string;error?:string;report?:{checks?:{id:string;passed:boolean;detail:string}[];platforms?:string[];error?:string};release?:HubRelease};
async function download(bundle:Bundle) {
  const response=await fetch('/api/hub/project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bundle)});
  if(!response.ok){const data=await response.json();throw new Error(data.error||'Could not prepare the editable project.');}
  const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${bundle.descriptor.libraryId}-${bundle.descriptor.version}.zip`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function HubPrepare() {
  const [session,setSession]=useState<Session|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [className,setClassName]=useState('MyWidget');const [title,setTitle]=useState('');const [bundle,setBundle]=useState<Bundle|null>(null);const [upload,setUpload]=useState<Bundle|null>(null);const [job,setJob]=useState<Job|null>(null);const [polling,setPolling]=useState(false);
  async function api(path:string,body?:unknown) { const response=await fetch(`/api/hub/${path}`,{method:body===undefined?'GET':'POST',cache:'no-store',headers:body===undefined?undefined:{'Content-Type':'application/json','X-Zero-CSRF':session?.csrfToken||''},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||`Hub request failed (${response.status}).`);return data; }
  useEffect(()=>{let active=true;fetch('/api/hub/session',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Hub unavailable.');if(active)setSession(data);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
  useEffect(()=>{if(!job||!['queued','checking','checked','publishing','running','pending'].includes(job.status))return;let active=true;let timer:ReturnType<typeof setTimeout>;setPolling(true);const poll=async()=>{try{const data=await api(`submissions/${encodeURIComponent(job.id)}`);if(active){setJob(data);setError('');if(['queued','checking','checked','publishing','running','pending'].includes(data.status))timer=setTimeout(poll,2000);else setPolling(false);}}catch(error){if(active){setError(error instanceof Error?error.message:'Could not check submission.');setPolling(false);}}};timer=setTimeout(poll,2000);return()=>{active=false;clearTimeout(timer);};},[job]);
  async function action(run:()=>Promise<void>){setBusy(true);setError('');try{await run();}catch(error){setError(error instanceof Error?error.message:'Hub action failed.');}finally{setBusy(false);}}
  return <>
    {session?.mode==='local'&&<p className="community-preview-note">Local test hub. Sign in uses the configured local developer identity. Uploads remain in this local service.</p>}
    {error&&<p className="hub-error" role="alert">{error}</p>}
    {!session ? <p role="status">{error?'The library hub is unavailable. Existing community downloads still work.':'Connecting to the hub…'}</p> : !session.user ? <a className="button compact" href="/api/hub/auth/start">{session.mode==='local'?'Sign in to local test hub':'Sign in with GitHub'}</a> : <>
      <div className="resource-links"><p>Signed in as {session.user.login}</p><button className="text-button" disabled={busy} onClick={()=>action(async()=>{await api('logout',{});setSession(await api('session'));setBundle(null);setUpload(null);setJob(null);})}>Sign out</button></div>
      <section><h2>1. Prepare your library</h2><form className="hub-form" onSubmit={event=>{event.preventDefault();void action(async()=>{const result=await api('libraries',{className,title});validateUploadBundle(result.bundle);setBundle(result.bundle);});}}>
        <label htmlFor="class-name">Java class name</label><input id="class-name" required pattern="[A-Z][A-Za-z0-9]*" maxLength={64} value={className} onChange={event=>setClassName(event.target.value)} />
        <label htmlFor="library-title">Library title</label><input id="library-title" required maxLength={100} value={title} onChange={event=>setTitle(event.target.value)} placeholder="A useful name" />
        <button className="button compact" disabled={busy}>Prepare library</button>
      </form>{bundle&&<div><p>Reserved <code>{bundle.descriptor.libraryId}</code>. Your classes belong in <code>zero.{bundle.descriptor.libraryId}</code>.</p><button className="button secondary compact" disabled={busy} onClick={()=>action(()=>download(bundle))}>Download editable folder</button><p className="fine-print">Extract the ZIP and open the folder in VS Code. Run App opens the editable preview. Edit the ordinary Java source, API notes, behavior check, two examples and PNG preview. Local POM, wrapper, preview Main and editor files stay outside the uploaded library. Keep .zero-library.json in the folder; it identifies your reservation. Update the descriptor’s version for each new release.</p></div>}</section>
      <section><h2>2. Upload your folder</h2><p>Choose the extracted library folder after editing. The hub checks your actual files before listing a release.</p>
        <div className="hub-form"><label htmlFor="library-folder">Library folder</label><input id="library-folder" ref={input=>{input?.setAttribute('webkitdirectory','');}} type="file" multiple disabled={busy} onChange={event=>{const files=Array.from(event.target.files||[]);setUpload(null);void action(async()=>{setUpload(await folderBundle(files));});}} />
          <details><summary>Use submission JSON instead</summary><label htmlFor="library-json">JSON containing descriptor and files</label><input id="library-json" type="file" accept=".json,application/json" disabled={busy} onChange={event=>{const file=event.target.files?.[0];setUpload(null);if(file)void action(async()=>{if(file.size>1024*1024)throw new Error('Submission exceeds 1 MiB.');setUpload(validateUploadBundle(JSON.parse(await file.text())));});}} /></details>
          {upload&&<p>{upload.descriptor.libraryId} · {upload.descriptor.version} · {Object.keys(upload.files).length} files ready</p>}
          <button className="button compact" disabled={busy||!upload} onClick={()=>action(async()=>{const data=await api('submissions',upload);setJob(data);setUpload(null);})}>Upload for checks</button>
        </div>
      </section>
      {job&&<section aria-live="polite"><h2>3. Check result</h2><p>Submission <code>{job.id}</code>: <strong>{job.status}</strong>{polling?' · Checking status…':''}</p>
        {job.error&&<p className="hub-error">{job.error}</p>}
        {job.report?.error&&<p className="hub-error">{job.report.error}</p>}
        {job.report?.checks&&<ul>{job.report.checks.map(check=><li key={check.id}>{check.passed?'Passed':'Failed'}: {check.detail}</li>)}</ul>}
        {job.report?.platforms&&<p>Checked platforms: {job.report.platforms.join(', ')}</p>}
        {publishedSubmission(job)&&job.release&&<p>Listed: {job.release.title} {job.release.version}. <a href="/community">View library components</a></p>}
        {!polling&&<button className="text-button" disabled={busy} onClick={()=>action(async()=>{setJob(await api(`submissions/${encodeURIComponent(job.id)}`));})}>Refresh result</button>}
        <p className="fine-print">A failed or unavailable check does not publish your library. Fix the reported files and upload again. Once a version is published, use a new version for changes.</p>
      </section>}
    </>}
  </>;
}
