'use client';

import {useEffect, useRef, useState} from 'react';
import {HubAccount, useHubGitHub} from './HubGitHub';
import styles from '@/app/hub/hub.module.css';
import {listingSlotsMessage} from '../lib/hub-listings-copy.mjs';
import {requestListings, updateListing} from '../lib/hub-listings-client.mjs';

type Listing = {repositoryId:string; title:string; pagesUrl:string; listed:boolean; protected:boolean};
type Action = 'protect' | 'unprotect' | 'move' | 'unlist' | 'list';
type Listings = {account:string; limit:number|null; projects:Listing[]; next:string|null};

function MyListings({account, csrfToken}:{account:string; csrfToken:string}) {
  const [data, setData] = useState<Listings|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [before, setBefore] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);
  const pendingOutcome = useRef<{outcome:string;message:string}|null>(null);
  const lifetime = useRef<AbortController|null>(null);
  useEffect(() => {const controller = new AbortController(); lifetime.current = controller; return () => controller.abort();}, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    void requestListings({before, account, signal}).then(result => {
      if (!controller.signal.aborted) {
        setData(result); setStale(false);
        if (pendingOutcome.current) {
          setMessage(pendingOutcome.current.outcome === 'uncertain'
            ? 'Your apps were refreshed. A delayed change may still appear; check the list before acting.'
            : pendingOutcome.current.message);
          pendingOutcome.current = null;
        }
      }
    }).catch(() => {
      if (!controller.signal.aborted) setMessage(stale && pendingOutcome.current ? `${pendingOutcome.current.message} Your apps could not be refreshed. Try again.` : 'Your apps could not be loaded.');
    }).finally(()=>{if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [account, before, retry]);

  async function manage(project:Listing, action:Action) {
    if (inFlight.current || stale || loading) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const controller = lifetime.current;
    try {
      const result = await updateListing({csrfToken, project, action,
        signal:AbortSignal.any([controller!.signal, AbortSignal.timeout(15_000)])});
      if (controller?.signal.aborted) return;
      setMessage(result.message);
      if (result.outcome === 'rejected') return;
      pendingOutcome.current = result;
      setStale(true);
      if (result.outcome === 'uncertain') return;
      try {
        const current = await requestListings({before, account,
          signal:AbortSignal.any([controller!.signal, AbortSignal.timeout(10_000)])});
        if (!controller?.signal.aborted) {setData(current); setStale(false); pendingOutcome.current = null;}
      } catch {
        if (!controller?.signal.aborted) setMessage(`${result.message} Your apps could not be refreshed.`);
      }
    } finally {
      inFlight.current = false;
      if (!controller?.signal.aborted) setBusy(false);
    }
  }

  function action(project:Listing, name:Action, label:string, disabled=false) {
    return <button className={styles.retry} type="button" disabled={loading || busy || stale || disabled}
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
    {stale && <button type="button" className={styles.retry} disabled={loading || busy}
      onClick={()=>{setLoading(true);setRetry(value=>value+1);}}>Refresh your apps</button>}
    {active.length > 0 && <ol aria-label="Replacement queue">{active.map((project, index)=><li key={project.repositoryId}>
      <a href={project.pagesUrl}>{project.title}</a> {project.protected && <span>· Protected</span>}
      <div className="resource-links">
        {project.protected ? action(project,'unprotect','Clear protection') : action(project,'protect','Do not replace')}
        {active.length > 1 && action(project,'move','Move to back',index === active.length - 1)}
        {action(project,'unlist','Remove from ZeroHub')}
      </div>
    </li>)}</ol>}
    {!active.length && <p>Publish an app through Zero to add it here.</p>}
    {unlisted.length > 0 && <><h2>Apps not on ZeroHub</h2><ul>{unlisted.map(project=><li key={project.repositoryId}>
      <a href={project.pagesUrl}>{project.title}</a> {action(project,'list','Add to ZeroHub',data.limit === null)}
    </li>)}</ul></>}
    {(before || data.next) && <div className="resource-links">
      {before && <button className={styles.retry} disabled={loading || busy || stale} type="button" onClick={()=>changePage(null)}>First page of apps</button>}
      {data.next && <button className={styles.retry} disabled={loading || busy || stale} type="button" onClick={()=>changePage(data.next)}>More apps</button>}
    </div>}
  </>;
}

export function HubListings() {
  const {user} = useHubGitHub();
  return <><HubAccount showSignOut={false} showZeroAccountStatus />{user && <MyListings key={user.id} account={user.id} csrfToken={user.csrfToken} />}</>;
}
