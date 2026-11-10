'use client';
import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import styles from '@/app/hub/hub.module.css';

type HubUser = {id:string; login:string; csrfToken:string};
type Connection = {configured:boolean|null; managed:boolean; user:HubUser|null; error:string; callbackError:boolean; returnTo?:string; refresh:()=>Promise<void>};
const GitHubContext = createContext<Connection>({configured:null,managed:false,user:null,error:'',callbackError:false,refresh:async()=>{}});
export function HubGitHubProvider({children,returnTo}:{children:ReactNode;returnTo?:string}) {
  const [configured,setConfigured]=useState<boolean|null>(null),[user,setUser]=useState<HubUser|null>(null),[error,setError]=useState('');
  const [callbackError,setCallbackError]=useState(false);
  const [managed,setManaged]=useState(false);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;
    try {
      const response=await fetch('/api/hub/github/session',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(current!==generation.current)return;
      if(typeof data.configured!=='boolean'||data.user&&(!/^[0-9]+$/.test(data.user.id)||typeof data.user.login!=='string'||typeof data.user.csrfToken!=='string'))throw new Error();
      setConfigured(data.configured);setManaged(data.managed===true);setUser(data.user||null);setError('');if(data.user)setCallbackError(false);
    }catch {if(current===generation.current){setUser(null);setError('Could not check your GitHub connection.');}}
  },[]);
  const [pathname, query] = returnTo?.split('?') ?? [];
  useEffect(()=>{
    const search = returnTo === undefined ? window.location.search : query;
    setCallbackError(['denied','invalid','failed','unavailable','error','expired'].includes(new URLSearchParams(search).get('github')||''));
  },[returnTo,query]);
  useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh,pathname]);
  return <GitHubContext.Provider value={{configured,managed,user,error,callbackError,returnTo,refresh}}>{children}</GitHubContext.Provider>;
}
export function useHubGitHub(){return useContext(GitHubContext);}
export function hubLoginHref(returnTo=typeof window==='undefined'?'/hub':window.location.pathname+window.location.search){
  return `/api/hub/github/login?${new URLSearchParams({returnTo})}`;
}
export function HubAccount({onSignedOut,onRetryComplete,showSignOut=true,signInLabel='Sign in to GitHub'}:{onSignedOut?:()=>void;onRetryComplete?:()=>void;showSignOut?:boolean;signInLabel?:string}={}){
  const {configured,managed,user,error,callbackError,returnTo,refresh}=useHubGitHub();const[busy,setBusy]=useState(false),[failure,setFailure]=useState('');
  async function signOut(){
    if(!user||busy)return;setBusy(true);setFailure('');
    try{const response=await fetch('/api/hub/github/logout',{method:'POST',credentials:'same-origin',headers:{'X-Hub-CSRF':user.csrfToken},redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok&&response.status!==401)throw new Error();await refresh();onSignedOut?.();}
    catch{setFailure('Could not sign out. Try again.');}finally{setBusy(false);}
  }
  return <div className={styles.account}>
    {user?<><span>GitHub · @{user.login}</span>{showSignOut&&(managed
      ? <form action="/zero-account/sign-out" method="post"><button type="submit">Sign out</button></form>
      : <button type="button" onClick={()=>void signOut()} disabled={busy}>{busy?'Signing out…':'Sign out'}</button>)}</>:configured?<a href={hubLoginHref(returnTo)}>{signInLabel}</a>:configured===false?<span>GitHub sign-in is unavailable.</span>:!error?<span>Checking GitHub connection…</span>:null}
    {error&&<span role="status">{error} <button type="button" onClick={()=>void refresh().then(()=>onRetryComplete?.())}>Retry</button></span>}
    {(failure||callbackError&&!user)&&<span role="status">{failure||'GitHub connection was not completed. Try again.'}</span>}
  </div>;
}
