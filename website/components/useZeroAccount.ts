'use client';
import {useEffect, useState} from 'react';

type Account = {configured:boolean; user:{avatarId:string|null}|null};
export function useZeroAccount() {
  const [state, setState] = useState<Account|null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    fetch('/api/zero-account/profile', {cache:'no-store', signal})
      .then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setState).catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  }, []);
  return {state,error};
}
