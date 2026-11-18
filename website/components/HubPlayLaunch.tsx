'use client';

import {useEffect, useState} from 'react';
import {recordPlayOpen} from '@/lib/hub-metrics-client.mjs';
import styles from '@/app/hub/hub.module.css';

export function HubPlayLaunch({reference}:{reference:string|null}) {
  const [attempt,setAttempt] = useState(0);
  const [error,setError] = useState('');
  useEffect(()=>{
    if (!reference) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ref:reference});
    async function launch() {
      try {
        const response = await fetch(`/api/hub/projects/play?${params}`,{cache:'no-store', redirect:'error',
          signal:AbortSignal.any([controller.signal,AbortSignal.timeout(17_000)])});
        if (!response.ok) throw new Error('unavailable');
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (typeof result.url !== 'string' || new URL(result.url).protocol !== 'https:') throw new Error('unavailable');
        if (typeof result.projectId === 'string') recordPlayOpen(result.projectId);
        window.location.replace(result.url);
      } catch {
        if (!controller.signal.aborted) setError('This project could not be opened.');
      }
    }
    void launch();
    return ()=>controller.abort();
  },[reference,attempt]);
  if (reference && !error) return <>
    <p className={styles.progress} role="status">Loading…</p>
    <noscript>Enable JavaScript to check and open this project.</noscript>
  </>;
  const message = reference ? error : 'This Play link is invalid.';
  return <section>
    <h1>Play a project</h1>
    <p role="status">{message}</p>
    {reference && error && <button type="button" className={styles.retry} onClick={()=>{setError('');setAttempt(value=>value+1);}}>Try again</button>}
    <p><a href="/hub">Back to Projects</a></p>
  </section>;
}
