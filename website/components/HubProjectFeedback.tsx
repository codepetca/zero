'use client';
import {useEffect,useRef,useState} from 'react';
import {problemLink,siteStatus} from '@/lib/hub-feedback-client.mjs';
import {hubLoginHref,useHubGitHub} from './HubGitHub';
import styles from '@/app/hub/hub.module.css';
export type ProjectFeedback={id:string;kind:'game'|'library';repositoryUrl:string;stars:number|null;issuesEnabled:boolean|null;site:{status:'reachable'|'unreachable'|'unknown'|'not-checked';checkedAt?:string}};
type Props={id:string;kind:'game'|'library';title:string;repositoryHref:string;playHref?:string;sourceCommit?:string;version?:string;feedback?:ProjectFeedback};
export function HubProjectFeedback({id,kind,title,repositoryHref,playHref,sourceCommit,version,feedback}:Props){
  const {configured,user,refresh}=useHubGitHub();const [starred,setStarred]=useState<boolean|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[freshCount,setFreshCount]=useState<number|null>(null),[visible,setVisible]=useState(false);
  const element=useRef<HTMLDivElement>(null),revision=useRef(0);
  useEffect(()=>{if(!element.current||!('IntersectionObserver' in window)){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'100px'});observer.observe(element.current);return()=>observer.disconnect();},[]);
  const currentUser=useRef(user?.id);currentUser.current=user?.id;
  const target=new URLSearchParams({kind,id}).toString();
  useEffect(()=>{
    const controller=new AbortController();let active=true;setStarred(null);setError('');setFreshCount(null);setPending(false);
    const started=revision.current;
    if(user&&visible)void fetch(`/api/hub/github/stars?${target}`,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])}).then(async response=>{
      if(response.status===401){if(active)await refresh();throw new Error('Reconnect GitHub to star this project.');}
      if(!response.ok)throw new Error('Could not check your star. Try again.');const data=await response.json();if(typeof data.starred!=='boolean')throw new Error('Could not check your star. Try again.');if(active&&started===revision.current)setStarred(data.starred);
    }).catch(failure=>{if(active&&!controller.signal.aborted)setError(failure.message||'Could not check your star. Try again.');});
    return()=>{active=false;controller.abort();};
  },[user?.id,target,retry,refresh,visible]);
  useEffect(()=>{const changed=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.repository===repositoryHref&&detail?.account===currentUser.current&&typeof detail.starred==='boolean'){revision.current++;setStarred(detail.starred);}};window.addEventListener('hub-star-changed',changed);return()=>window.removeEventListener('hub-star-changed',changed);},[repositoryHref]);
  async function toggle(){
    if(!user||starred===null||pending)return;const account=user.id,desired=!starred;setPending(true);setError('');
    try{
      const response=await fetch('/api/hub/github/stars',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-Hub-CSRF':user.csrfToken},body:JSON.stringify({kind,id,starred:desired}),signal:AbortSignal.timeout(12000)});
      if(response.status===401){await refresh();throw new Error('Reconnect GitHub to star this project.');}
      if(!response.ok)throw new Error('Could not confirm the change. Try again.');const data=await response.json();if(data.starred!==desired)throw new Error('Could not confirm the change. Try again.');
      if(currentUser.current===account){setStarred(desired);window.dispatchEvent(new CustomEvent('hub-star-changed',{detail:{repository:repositoryHref,account,starred:desired}}));if(Number.isSafeInteger(data.stars)&&data.stars>=0)setFreshCount(data.stars);}
    }catch(failure){if(currentUser.current===account)setError(failure instanceof Error?failure.message:'Could not confirm the change. Try again.');}finally{if(currentUser.current===account)setPending(false);}
  }
  const count=freshCount??feedback?.stars,status=siteStatus(feedback?.site),hint='One star per GitHub account per repository. Counts may take a few minutes to update.';
  const countLabel=count!==null&&count!==undefined?<span aria-label={`${count} repository stars`}>{count.toLocaleString()}</span>:null;
  return <div ref={element} className={styles.feedback}>
    <div className={styles.projectActions}>
      {user?<button className={styles.starButton} type="button" onClick={()=>starred===null?setRetry(value=>value+1):void toggle()} disabled={pending||starred===null&&!error} aria-pressed={starred===true} aria-label={`${starred?'Unstar':'Star'} ${title}`} title={hint}><span aria-hidden="true">{starred?'★':'☆'}</span> {pending?'Saving…':starred?'Starred':starred===null?(error?'Retry':'Checking…'):'Star'} {countLabel}</button>:configured?<a className={styles.starButton} href={hubLoginHref()} aria-label={`Connect GitHub to star ${title}`} title={hint}><span aria-hidden="true">☆</span> Star {countLabel}</a>:<button className={styles.starButton} type="button" disabled title="Connect GitHub when stars are available"><span aria-hidden="true">☆</span> Star {countLabel}</button>}
      <a href={problemLink({title,repositoryHref,playHref,sourceCommit,version},feedback?.issuesEnabled)} target="_blank" rel="noopener noreferrer">Report a problem<span className="sr-only"> (opens GitHub in a new tab)</span></a>
    </div>
    {status&&<p className={styles.siteStatus} title="Checks whether the hosted page responds. Gameplay bugs need testing or a report.">{status}{feedback?.site.checkedAt&&<> · <time dateTime={feedback.site.checkedAt} title={feedback.site.checkedAt}>checked {new Date(feedback.site.checkedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></>}</p>}
    {error&&<p role="status" className={styles.feedbackError}>{error}</p>}
  </div>;
}
