'use client';

import {useEffect, useState} from 'react';
import {HubProjectCard} from './HubProjectCard';
import styles from '@/app/hub/hub.module.css';

type Project = {id:string; title:string; author:string; repositoryUrl:string; pagesUrl:string};

export function HubPublishedProjects({search, hasOtherProjects}:{search:string; hasOtherProjects:boolean}) {
  const [before, setBefore] = useState<string|null>(null);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState<{projects:Project[]; next:string|null}|null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({q:search});
    if (before) params.set('before', before);
    void fetch('/api/hub/listings/discover?' + params, {cache:'no-store', redirect:'error',
      signal:AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])})
      .then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setPage(result);
      }).catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [before, retry, search]);

  function changePage(cursor:string|null) {
    setPage(null);
    setError(false);
    setBefore(cursor);
  }
  if (error) return <div role="status">Published projects are unavailable. <button className={styles.retry}
    type="button" onClick={()=>{setError(false);setRetry(value=>value+1);}}>Try again</button></div>;
  if (!page) return hasOtherProjects ? null : <p role="status">Checking published projects…</p>;
  return <>
    {page.projects.map(project=><HubProjectCard key={project.id} title={project.title}
      description="Published with Zero" author={project.author} playHref={project.pagesUrl} repositoryHref={project.repositoryUrl} compact />)}
    {!page.projects.length && !hasOtherProjects && !page.next && <p role="status">{search.trim() ? 'No projects match this search.' : 'No projects are available yet.'}</p>}
    {(before || page.next) && <div className="resource-links">
      {before && <button className={styles.retry} type="button" onClick={()=>changePage(null)}>First published projects</button>}
      {page.next && <button className={styles.retry} type="button" onClick={()=>changePage(page.next)}>Next published projects</button>}
    </div>}
  </>;
}
