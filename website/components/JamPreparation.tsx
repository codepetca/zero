'use client';

import {useEffect, useId, useRef, useState, type FormEvent, type ChangeEvent} from 'react';
import {defaultJamDraft, JAM_DRAFT_LIMITS, prepareJamDraft} from '../lib/jam-draft.mjs';
import './JamPreparation.css';

type Draft = ReturnType<typeof defaultJamDraft>;
type Field = keyof Draft;
type Manifest = {
  schema:number; templateVersion:string; type:'game'|'app'; title:string;
  summary:string; theme:string; rules:string; eligibility:string;
  websiteUrl:string; timezone:string; schedule:Record<string,string>;
};
type Preview = {html:string; manifest:Manifest};
type Step = 'details'|'preview'|'download';
const STORAGE_KEY = 'zero-jam-draft:preparation:v1';
// Persist only public event details, independently of account/proposal state.
const DRAFT_FIELDS:Field[] = ['type','title','summary','theme','rules','eligibility','websiteUrl','timezone','registrationOpensAt','startsAt','submissionsCloseAt','registrationClosesAt','submissionsOpenAt'];
const FIELD_LABELS:Record<Field,string> = {
  type:'Jam type', title:'Jam title', summary:'Introduction', theme:'Theme', rules:'Rules',
  eligibility:'Who can take part', websiteUrl:'Website URL (optional)', timezone:'Timezone',
  registrationOpensAt:'Registration opens', startsAt:'Jam starts', submissionsCloseAt:'Submission deadline',
  registrationClosesAt:'Registration closes (optional)', submissionsOpenAt:'Submissions open (optional)',
};
const OPTIONAL_DATES:Field[] = ['registrationClosesAt','submissionsOpenAt'];

function browserTimezone() {
  try {return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';}
  catch {return 'America/Toronto';}
}
function restoreDraft(initial:Draft):Draft {
  try {
    const raw=sessionStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length>50000) return initial;
    const saved:unknown=JSON.parse(raw);
    if (!saved || typeof saved!=='object' || Array.isArray(saved)) return initial;
    const restored={...initial}, source=saved as Record<string,unknown>;
    for (const field of DRAFT_FIELDS) {
      const value=source[field];
      const maximum=field in JAM_DRAFT_LIMITS ? JAM_DRAFT_LIMITS[field as keyof typeof JAM_DRAFT_LIMITS] : 32;
      if (typeof value==='string' && value.length<=maximum) restored[field]=value;
    }
    if (!['game','app'].includes(restored.type)) restored.type=initial.type;
    return restored;
  } catch {return initial;}
}
function failureMessage(error:unknown, operation:'preview'|'download') {
  if (error instanceof Error && (error.name==='TimeoutError' || error.name==='AbortError'))
    return `The ${operation} took too long. Your details are kept. Try again.`;
  if (error instanceof TypeError) return `The ${operation} could not connect to Zero. Your details are kept. Check your connection and try again.`;
  return error instanceof Error && error.message
    ? error.message
    : `The ${operation} could not be prepared. Your details are kept. Try again.`;
}
async function responseError(response:Response, fallback:string) {
  try {
    const body=await response.json();
    if (typeof body?.error==='string') return body.error;
  } catch {/* Keep a useful message for unavailable or non-JSON responses. */}
  return fallback;
}

export function JamPreparation() {
  const id=useId();
  const [draft,setDraft]=useState<Draft>(()=>defaultJamDraft());
  const [restored,setRestored]=useState(false);
  const [step,setStep]=useState<Step>('details');
  const [errors,setErrors]=useState<Partial<Record<Field|'form',string>>>({});
  const [preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState<'preview'|'download'|null>(null);
  const [error,setError]=useState('');
  const [optionalDates,setOptionalDates]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  const headingRef=useRef<HTMLHeadingElement>(null);
  const lastStep=useRef<Step>('details');
  const request=useRef<{generation:number; controller:AbortController|null}>({generation:0,controller:null});
  const downloadUrls=useRef(new Map<string,ReturnType<typeof setTimeout>>());

  useEffect(()=>{
    const saved=restoreDraft(defaultJamDraft('game',browserTimezone()));
    setDraft(saved);
    if (OPTIONAL_DATES.some(field=>saved[field])) setOptionalDates(true);
    setRestored(true);
  },[]);
  useEffect(()=>{
    if (!restored) return;
    const publicDraft=Object.fromEntries(DRAFT_FIELDS.map(field=>[field,draft[field]]));
    try {sessionStorage.setItem(STORAGE_KEY,JSON.stringify(publicDraft));}
    catch {/* In-memory preparation still works when storage is blocked or full. */}
  },[draft,restored]);
  useEffect(()=>{
    if (lastStep.current!==step) {headingRef.current?.focus(); lastStep.current=step;}
  },[step]);
  useEffect(()=>()=>{
    request.current.generation++;
    request.current.controller?.abort();
    for (const [url,timer] of downloadUrls.current) {clearTimeout(timer); URL.revokeObjectURL(url);}
    downloadUrls.current.clear();
  },[]);

  function change(field:Field,value:string) {
    setDraft(current=>({...current,[field]:value}));
    setErrors(current=>({...current,[field]:undefined,form:undefined}));
    setError('');
  }
  function edit() {
    request.current.generation++;
    request.current.controller?.abort();
    request.current.controller=null;
    setBusy(null); setError(''); setPreview(null); setStep('details');
  }
  function begin(operation:'preview'|'download') {
    if (request.current.controller) return null;
    const controller=new AbortController(), generation=++request.current.generation;
    request.current.controller=controller;
    setBusy(operation); setError('');
    return {controller,generation};
  }
  async function showPreview(event:FormEvent) {
    event.preventDefault();
    if (request.current.controller) return;
    const prepared=prepareJamDraft(draft) as {manifest:Manifest|null; errors:Partial<Record<Field|'form',string>>};
    setErrors(prepared.errors);
    if (!prepared.manifest) {
      if (OPTIONAL_DATES.some(field=>prepared.errors[field])) setOptionalDates(true);
      requestAnimationFrame(()=>{
        const field=DRAFT_FIELDS.find(field=>prepared.errors[field]);
        const input=field && formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`);
        if (input instanceof HTMLElement) input.focus();
        else headingRef.current?.focus();
      });
      return;
    }
    const pending=begin('preview');
    if (!pending) return;
    const timeout=setTimeout(()=>pending.controller.abort(),20000);
    try {
      const response=await fetch('/api/jams/template/preview',{
        method:'POST', credentials:'omit', redirect:'error', cache:'no-store',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({manifest:prepared.manifest}),
        signal:pending.controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response,'The website preview is unavailable. Your details are kept. Try again.'));
      let body;
      try {body=await response.json();}
      catch {throw new Error('Zero returned an unreadable website preview. Your details are kept. Try again.');}
      if (typeof body?.html!=='string' || !body.manifest || typeof body.manifest!=='object' || !['game','app'].includes(body.manifest.type))
        throw new Error('Zero returned an incomplete website preview. Your details are kept. Try again.');
      if (pending.generation!==request.current.generation) return;
      setPreview({html:body.html,manifest:body.manifest}); setStep('preview');
    } catch (caught) {
      if (pending.generation===request.current.generation) setError(failureMessage(caught,'preview'));
    } finally {
      clearTimeout(timeout);
      if (pending.generation===request.current.generation) {request.current.controller=null; setBusy(null);}
    }
  }
  async function download() {
    if (!preview) return;
    const pending=begin('download');
    if (!pending) return;
    const timeout=setTimeout(()=>pending.controller.abort(),20000);
    try {
      const response=await fetch('/api/jams/template',{
        method:'POST', credentials:'omit', redirect:'error', cache:'no-store',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({manifest:preview.manifest}),
        signal:pending.controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response,'The ZIP is unavailable. Your preview and details are kept. Try the download again.'));
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/zip'))
        throw new Error('Zero did not return a ZIP. Your preview is kept. Try the download again.');
      const blob=await response.blob();
      if (!blob.size) throw new Error('The ZIP was empty. Your preview is kept. Try the download again.');
      if (pending.generation!==request.current.generation) return;
      const url=URL.createObjectURL(blob), link=document.createElement('a');
      link.href=url; link.download=`zero-${preview.manifest.type}-jam.zip`;
      document.body.append(link);
      try {link.click();}
      catch (caught) {URL.revokeObjectURL(url); throw caught;}
      finally {link.remove();}
      // Allow the browser time to consume the download before releasing the URL.
      const timer=setTimeout(()=>{URL.revokeObjectURL(url); downloadUrls.current.delete(url);},60000);
      downloadUrls.current.set(url,timer);
      setStep('download');
    } catch (caught) {
      if (pending.generation===request.current.generation) setError(failureMessage(caught,'download'));
    } finally {
      clearTimeout(timeout);
      if (pending.generation===request.current.generation) {request.current.controller=null; setBusy(null);}
    }
  }
  function fieldHelp(field:Field,help?:string) {
    return <>{help&&<small id={`${id}-${field}-help`}>{help}</small>}{errors[field]&&<span className="jam-preparation-field-error" id={`${id}-${field}-error`}>{errors[field]}</span>}</>;
  }
  function describedBy(field:Field,help?:string) {
    return [help&&`${id}-${field}-help`,errors[field]&&`${id}-${field}-error`].filter(Boolean).join(' ') || undefined;
  }
  function textField(field:keyof typeof JAM_DRAFT_LIMITS,options:{multiline?:boolean;help?:string;optional?:boolean;placeholder?:string}={}) {
    const props={id:`${id}-${field}`,name:field,value:draft[field],onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>change(field,event.target.value),maxLength:JAM_DRAFT_LIMITS[field],disabled:busy!==null,required:!options.optional,'aria-invalid':Boolean(errors[field]) as boolean,'aria-describedby':describedBy(field,options.help)};
    return <label htmlFor={props.id}>{FIELD_LABELS[field]}{options.multiline?<textarea {...props} rows={field==='rules'?5:3}/>:<input {...props} type={field==='websiteUrl'?'url':'text'} placeholder={options.placeholder} autoCapitalize={field==='timezone'||field==='websiteUrl'?'none':undefined} spellCheck={field==='timezone'||field==='websiteUrl'?false:undefined}/>} {fieldHelp(field,options.help)}</label>;
  }
  function dateField(field:Field,help?:string) {
    return <label htmlFor={`${id}-${field}`}>{FIELD_LABELS[field]}<input id={`${id}-${field}`} name={field} type="datetime-local" step={60} value={draft[field]} required={!OPTIONAL_DATES.includes(field)} disabled={busy!==null} onChange={event=>change(field,event.target.value)} aria-invalid={Boolean(errors[field])} aria-describedby={describedBy(field,help)}/>{fieldHelp(field,help)}</label>;
  }
  const previewFrame=preview&&<iframe className="jam-preparation-preview" title={`Website preview: ${preview.manifest.title}`} srcDoc={preview.html} sandbox="allow-scripts" referrerPolicy="no-referrer"/>;

  return <section className="jam-preparation" aria-labelledby={`${id}-heading`}>
    <h1 id={`${id}-heading`}>Create a ZeroJam</h1>
    <p className="lead">Prepare your jam, preview its website, then download a complete editable copy for your own repository.</p>
    <p className="jam-muted">No sign-in is needed to prepare or download. Hosting and maintainer approval come later.</p>
    <ol className="jam-preparation-steps" aria-label="Preparation steps">
      <li aria-current={step==='details'?'step':undefined}>1. Jam details</li>
      <li aria-current={step==='preview'?'step':undefined}>2. Website preview</li>
      <li aria-current={step==='download'?'step':undefined}>3. Download and host</li>
    </ol>
    {step==='details'&&<>
      <h2 ref={headingRef} tabIndex={-1}>1. Add your jam details</h2>
      <form ref={formRef} className="jam-form jam-preparation-form" noValidate onSubmit={event=>void showPreview(event)}>
        <fieldset className="jam-preparation-types" disabled={busy!==null} aria-describedby={describedBy('type')}>
          <legend>Jam type</legend>
          {(['game','app'] as const).map(type=><label key={type} className="jam-preparation-type"><input type="radio" name="type" value={type} checked={draft.type===type} onChange={()=>change('type',type)} aria-invalid={Boolean(errors.type)}/><span>{type==='game'?'Game Jam':'App Jam'}</span></label>)}
          {fieldHelp('type')}
        </fieldset>
        {textField('title')}
        {textField('summary',{multiline:true,help:'Introduce the jam to someone visiting your website.'})}
        {textField('theme',{multiline:true})}
        {textField('rules',{multiline:true})}
        {textField('eligibility',{multiline:true})}
        {textField('websiteUrl',{optional:true,placeholder:'https://your-name.github.io/your-jam/',help:'Leave blank to use a placeholder. Replace it with your public HTTPS address after hosting.'})}
        <fieldset className="jam-preparation-schedule">
          <legend>Schedule</legend>
          <p className="jam-muted">Enter every date and time in the timezone below.</p>
          {textField('timezone',{help:'Use an IANA timezone such as America/Toronto or Europe/London.'})}
          <div className="jam-preparation-dates">
            {dateField('registrationOpensAt')}
            {dateField('startsAt')}
            {dateField('submissionsCloseAt')}
          </div>
          <details className="jam-preparation-options" open={optionalDates} onToggle={event=>setOptionalDates(event.currentTarget.open)}>
            <summary>Registration and submission options</summary>
            <p className="jam-muted">By default, registration closes and submissions open when the jam starts. Set different times here if needed.</p>
            <div className="jam-preparation-dates">{dateField('registrationClosesAt','Leave blank to use the jam start.')}{dateField('submissionsOpenAt','Leave blank to use the jam start.')}</div>
          </details>
        </fieldset>
        {Object.values(errors).some(Boolean)&&<p className="jam-error" role="alert">{errors.form||'Review the highlighted details, then preview your website again.'}</p>}
        {error&&<p className="jam-error" role="alert">{error}</p>}
        <button className="jam-primary" type="submit" disabled={busy!==null||!restored}>{busy==='preview'?'Preparing website preview…':'Preview website'}</button>
        {busy==='preview'&&<p className="jam-muted" role="status">Preparing the website from your details…</p>}
      </form>
    </>}
    {step==='preview'&&preview&&<>
      <h2 ref={headingRef} tabIndex={-1}>2. Preview your website</h2>
      <p>This is the website included in your download, with your jam details. The isolated preview has no live participation connection.</p>
      {preview.manifest.websiteUrl==='https://example.com/your-jam/'&&<p className="jam-notice">Your website address is a placeholder. Update <code>websiteUrl</code> in <code>zero-jam.json</code> after hosting.</p>}
      {previewFrame}
      <p>The ZIP includes all eight template files, your details, editable source and a GitHub Pages workflow. Downloading makes no repository or hosting changes.</p>
      {error&&<p className="jam-error" role="alert">{error}</p>}
      <div className="jam-actions"><button className="jam-primary" type="button" disabled={busy!==null} onClick={()=>void download()}>{busy==='download'?'Preparing ZIP…':'Download customized template'}</button><button type="button" onClick={edit}>Edit details</button></div>
      {busy==='download'&&<p className="jam-muted" role="status">Preparing the ZIP for this preview…</p>}
    </>}
    {step==='download'&&preview&&<>
      <h2 ref={headingRef} tabIndex={-1}>3. Host your jam</h2>
      <p role="status">ZIP download requested. Check your browser’s downloads for <code>zero-{preview.manifest.type}-jam.zip</code>.</p>
      <p>Your copy is editable and belongs in your own repository. Your website is not published or approved by downloading it.</p>
      <ol className="steps jam-preparation-hosting">
        <li>Extract the ZIP. Create your own public GitHub repository and copy in all eight files, including the hidden <code>.github</code> folder.</li>
        <li>Follow the included <code>README.md</code> to customize the page and preview it locally. The source, page and included assets will be public when you publish them.</li>
        <li>Commit and push your files. In your repository’s Settings → Pages, choose GitHub Actions as the source. Use <code>main</code> as your default branch. The included <code>.github/workflows/pages.yml</code> publishes the site; follow the README for the full setup. You can also use another static host.</li>
        <li>After hosting, set <code>websiteUrl</code> in <code>zero-jam.json</code> to your real public HTTPS address. Commit and push this update.</li>
        <li>Copy your repository URL and the full 40-character SHA of the exact commit to propose in the separate maintainer review form below. A hosted website alone does not approve the jam.</li>
      </ol>
      <details className="jam-preparation-inventory"><summary>All eight template files</summary><ul>{['index.html','zero-jam.json','README.md','LICENSE','assets/jam.css','assets/jam.js','assets/mark.svg','.github/workflows/pages.yml'].map(path=><li key={path}><code>{path}</code></li>)}</ul></details>
      {error&&<p className="jam-error" role="alert">{error}</p>}
      <div className="jam-actions"><button type="button" disabled={busy!==null} onClick={()=>void download()}>{busy==='download'?'Preparing ZIP…':'Download again'}</button><button type="button" onClick={edit}>Edit details and preview again</button></div>
      {busy==='download'&&<p className="jam-muted" role="status">Preparing the ZIP for the same preview…</p>}
      <details className="jam-preparation-saved-preview"><summary>View the website preview</summary>{previewFrame}</details>
    </>}
  </section>;
}
