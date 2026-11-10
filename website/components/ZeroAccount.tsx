'use client';
import {useEffect, useState} from 'react';
import {Icon} from './Icon';

type Account = {configured:boolean; user:{id:string}|null};
function useAccount() {
  const [state, setState] = useState<Account|null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/zero-account/session', {cache:'no-store', signal:controller.signal})
      .then(response => {if (!response.ok) throw new Error(); return response.json();})
      .then(setState).catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  }, []);
  return {state,error};
}
export function ZeroAccount() {
  const {state} = useAccount();
  if (!state?.configured) return null;
  return <a className="zero-account-link" href="/zero-account" aria-label="Zero account" title="Zero account"><Icon name="user"/><span>Account</span></a>;
}
export function ZeroAccountDetails() {
  const {state,error} = useAccount();
  if (error) return <p role="status">Could not check your account. Reload to try again.</p>;
  if (!state) return <p>Checking your account…</p>;
  if (!state.configured) return <p>Zero sign-in is unavailable.</p>;
  return state.user ? <><p>Signed in to Zero.</p><form action="/zero-account/sign-out" method="post"><button type="submit">Sign out of Zero</button></form></>
    : <a href="/zero-account/sign-in">Sign in to Zero</a>;
}
