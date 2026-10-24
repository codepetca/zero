'use client';
import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import styles from '@/app/hub/hub.module.css';

type HubUser = {id:string; login:string; csrfToken:string};
type Connection = {configured:boolean|null; user:HubUser|null; error:string; refresh:()=>Promise<void>};
const GitHubContext = createContext<Connection>({configured:null,user:null,error:'',refresh:async()=>{}});
export function HubGitHubProvider({children}:{children:ReactNode}) {
  const [configured,setConfigured]=useState<boolean|null>(null),[user,setUser]=useState<HubUser|null>(null),[error,setError]=useState('');
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=++generation.current;
    try {
      const response=await fetch('/api/hub/github/session',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(current!==generation.current)return;
      if(typeof data.configured!=='boolean'||data.user&&(!/^[0-9]+$/.test(data.user.id)||typeof data.user.login!=='string'||typeof data.user.csrfToken!=='string'))throw new Error();
      setConfigured(data.configured);setUser(data.user||null);setError('');
    }catch {if(current===generation.current){setUser(null);setError('Could not check your GitHub connection.');}}
  },[]);
  useEffect(()=>{void refresh();return()=>{generation.current++;};},[refresh]);
  return <GitHubContext.Provider value={{configured,user,error,refresh}}>{children}</GitHubContext.Provider>;
}
export function useHubGitHub(){return useContext(GitHubContext);}
export function hubLoginHref(){
  const returnTo=typeof window==='undefined'?'/hub':window.location.pathname+window.location.search;
  return `/api/hub/github/login?${new URLSearchParams({returnTo})}`;
}
export function HubAccount({onSignedOut,onRetryComplete}:{onSignedOut?:()=>void;onRetryComplete?:()=>void}={}){
  const {configured,user,error,refresh}=useHubGitHub();const[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[callbackError,setCallbackError]=useState(false);
  useEffect(()=>{setCallbackError(['denied','invalid','failed','unavailable','error','expired'].includes(new URLSearchParams(window.location.search).get('github')||''));},[]);
  async function signOut(){
    if(!user||busy)return;setBusy(true);setFailure('');
    try{const response=await fetch('/api/hub/github/logout',{method:'POST',credentials:'same-origin',headers:{'X-Hub-CSRF':user.csrfToken},redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok&&response.status!==401)throw new Error();await refresh();onSignedOut?.();}
    catch{setFailure('Could not sign out. Try again.');}finally{setBusy(false);}
  }
  return <div className={styles.account}>
    {user?<><span>GitHub · @{user.login}</span><button type="button" onClick={()=>void signOut()} disabled={busy}>{busy?'Signing out…':'Sign out'}</button></>:configured?<a href={hubLoginHref()}>Sign in to GitHub</a>:configured===false?<span>GitHub sign-in is unavailable.</span>:!error?<span>Checking GitHub connection…</span>:null}
    {error&&<span role="status">{error} <button type="button" onClick={()=>void refresh().then(()=>onRetryComplete?.())}>Retry</button></span>}
    {(failure||callbackError&&!user)&&<span role="status">{failure||'GitHub connection was not completed. Try again.'}</span>}
  </div>;
}
