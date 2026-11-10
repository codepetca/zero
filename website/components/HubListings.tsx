'use client';

import {useEffect, useState} from 'react';
import {HubAccount, useHubGitHub} from './HubGitHub';
import styles from '@/app/hub/hub.module.css';

type Listing = {repositoryId:string; title:string; pagesUrl:string; listed:boolean; protected:boolean};
type Action = 'protect' | 'unprotect' | 'move' | 'unlist' | 'list';
type Listings = {account:string; limit:number; projects:Listing[]; next:string|null};

async function requestListings(before:string|null, signal?:AbortSignal) {
  const query = before ? '?' + new URLSearchParams({before}) : '';
  const response = await fetch('/api/hub/listings' + query, {cache:'no-store', redirect:'error', signal});
  if (!response.ok) throw new Error('Your listings could not be loaded.');
  return await response.json() as Listings;
}

function MyListings({account, csrfToken}:{account:string; csrfToken:string}) {
  const [data, setData] = useState<Listings|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [before, setBefore] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    void requestListings(before, signal).then(result => {
      if (result.account !== account) throw new Error();
      if (!controller.signal.aborted) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) setMessage('Your listings could not be loaded.');
    }).finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [account, before, retry]);

  async function manage(project:Listing, action:Action) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/hub/listings', {
        method:'POST', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(15_000),
        headers:{'Content-Type':'application/json', 'X-Hub-CSRF':csrfToken},
        body:JSON.stringify({action, repositoryId:project.repositoryId})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Your listing could not be updated.');
      const current = await requestListings(before, AbortSignal.timeout(10_000));
      if (current.account !== account) throw new Error('Sign in again to see your listings.');
      setData(current);
      setMessage(result.status === 'unlisted'
        ? result.reason === 'protected' ? 'Clear protection on your current listing to list this project.' : 'Free up a slot before listing this project.'
        : result.replaced ? `${project.title} listed. ${result.replaced} was unlisted.`
        : action === 'move' ? `${project.title} moved to the back.`
        : action === 'protect' ? `${project.title} is protected.`
        : action === 'unprotect' ? `Protection cleared for ${project.title}.`
        : action === 'unlist' ? `${project.title} unlisted.` : `${project.title} listed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your listing could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  function action(project:Listing, name:Action, label:string, disabled=false) {
    return <button className={styles.retry} type="button" disabled={loading || busy || disabled}
      aria-label={`${label} ${project.title}`} onClick={()=>void manage(project, name)}>{label}</button>;
  }
  function changePage(cursor:string|null) {
    setLoading(true);
    setMessage('');
    setBefore(cursor);
  }

  if (!data) return <div role="status">{message || 'Loading your listings…'} {message &&
    <button type="button" className={styles.retry} onClick={()=>{setLoading(true);setMessage('');setRetry(value=>value+1);}}>Try again</button>}</div>;
  const active = data.projects.filter(project=>project.listed);
  const unlisted = data.projects.filter(project=>!project.listed);
  return <>
    <p>{active.length} of {data.limit} listings in use. A new publish replaces the first unprotected listing when you reach your limit.</p>
    <p role="status" aria-live="polite">{message}</p>
    {active.length > 0 && <ol aria-label="Replacement queue">{active.map((project, index)=><li key={project.repositoryId}>
      <a href={project.pagesUrl}>{project.title}</a> {project.protected && <span>· Protected</span>}
      <div className="resource-links">
        {project.protected ? action(project,'unprotect','Clear protection') : action(project,'protect','Do not replace')}
        {active.length > 1 && action(project,'move','Move to back',index === active.length - 1)}
        {action(project,'unlist','Unlist')}
      </div>
    </li>)}</ol>}
    {!active.length && <p>Publish a project through Zero to list it here.</p>}
    {unlisted.length > 0 && <><h2>Unlisted projects</h2><ul>{unlisted.map(project=><li key={project.repositoryId}>
      <a href={project.pagesUrl}>{project.title}</a> {action(project,'list','List on ZeroHub')}
    </li>)}</ul></>}
    {(before || data.next) && <div className="resource-links">
      {before && <button className={styles.retry} disabled={loading || busy} type="button" onClick={()=>changePage(null)}>First unlisted projects</button>}
      {data.next && <button className={styles.retry} disabled={loading || busy} type="button" onClick={()=>changePage(data.next)}>More unlisted projects</button>}
    </div>}
  </>;
}

export function HubListings() {
  const {user} = useHubGitHub();
  return <><HubAccount showSignOut={false} />{user && <MyListings key={user.id} account={user.id} csrfToken={user.csrfToken} />}</>;
}
