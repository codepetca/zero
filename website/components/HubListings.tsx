'use client';

import {useEffect, useState} from 'react';
import {HubAccount, useHubGitHub} from './HubGitHub';
import styles from '@/app/hub/hub.module.css';
import {listingSlotsMessage} from '../lib/hub-listings-copy.mjs';

type Listing = {repositoryId:string; title:string; pagesUrl:string; listed:boolean; protected:boolean};
type Action = 'protect' | 'unprotect' | 'move' | 'unlist' | 'list';
type Listings = {account:string; limit:number|null; projects:Listing[]; next:string|null};

async function requestListings(before:string|null, signal?:AbortSignal) {
  const query = before ? '?' + new URLSearchParams({before}) : '';
  const response = await fetch('/api/hub/listings' + query, {cache:'no-store', redirect:'error', signal});
  if (!response.ok) throw new Error('Your apps could not be loaded.');
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
      if (!controller.signal.aborted) setMessage('Your apps could not be loaded.');
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
      if (!response.ok) throw new Error(result.error || 'The app listing could not be updated.');
      const current = await requestListings(before, AbortSignal.timeout(10_000));
      if (current.account !== account) throw new Error('Sign in again to see your apps.');
      setData(current);
      setMessage(result.status === 'unlisted'
        ? result.reason === 'protected' ? 'Clear protection on your current app to add this app to ZeroHub.' : 'Free up an app slot to add this app to ZeroHub.'
        : result.replaced ? `${project.title} replaced ${result.replaced} on ZeroHub.`
        : action === 'move' ? `${project.title} moved to the back.`
        : action === 'protect' ? `${project.title} is protected.`
        : action === 'unprotect' ? `Protection cleared for ${project.title}.`
        : action === 'unlist' ? `${project.title} removed from ZeroHub.` : `${project.title} added to ZeroHub.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The app listing could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  function action(project:Listing, name:Action, label:string, disabled=false) {
    return <button className={styles.retry} type="button" disabled={loading || busy || disabled}
      aria-label={`${label} ${project.title}`} onClick={()=>void manage(project, name)}>{label}</button>;
  }
  function changePage(cursor:string|null) {
    setData(null);
    setLoading(true);
    setMessage('');
    setBefore(cursor);
  }

  if (!data) return <div role="status">{message || 'Loading your apps…'} {message &&
    <button type="button" className={styles.retry} onClick={()=>{setLoading(true);setMessage('');setRetry(value=>value+1);}}>Try again</button>}</div>;
  const active = data.projects.filter(project=>project.listed);
  const unlisted = data.projects.filter(project=>!project.listed);
  return <>
    <p>{listingSlotsMessage(active.length, data.limit)}</p>
    <p role="status" aria-live="polite">{message}</p>
    {active.length > 0 && <ol aria-label="Replacement queue">{active.map((project, index)=><li key={project.repositoryId}>
      <a href={project.pagesUrl}>{project.title}</a> {project.protected && <span>· Protected</span>}
      <div className="resource-links">
        {project.protected ? action(project,'unprotect','Clear protection') : action(project,'protect','Do not replace')}
        {active.length > 1 && action(project,'move','Move to back',index === active.length - 1)}
        {action(project,'unlist','Remove from ZeroHub')}
      </div>
    </li>)}</ol>}
    {!active.length && <p>Publish an app through Zero to add it here.</p>}
    {unlisted.length > 0 && <><h3>Apps not on ZeroHub</h3><ul>{unlisted.map(project=><li key={project.repositoryId}>
      <a href={project.pagesUrl}>{project.title}</a> {action(project,'list','Add to ZeroHub',data.limit === null)}
    </li>)}</ul></>}
    {(before || data.next) && <div className="resource-links">
      {before && <button className={styles.retry} disabled={loading || busy} type="button" onClick={()=>changePage(null)}>First page of apps</button>}
      {data.next && <button className={styles.retry} disabled={loading || busy} type="button" onClick={()=>changePage(data.next)}>More apps</button>}
    </div>}
  </>;
}

export function HubListings() {
  const {user} = useHubGitHub();
  return <><HubAccount showSignOut={false} />{user && <MyListings key={user.id} account={user.id} csrfToken={user.csrfToken} />}</>;
}
