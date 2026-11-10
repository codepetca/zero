'use client';
import {useEffect, useState} from 'react';

type Account = {configured:boolean; user:{id:string; avatarId:string|null}|null};
export function useZeroAccount() {
  const [state, setState] = useState<Account|null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/zero-account/session', {cache:'no-store', signal:controller.signal})
      .then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setState).catch(() => {if (!controller.signal.aborted) setError(true);});
    return () => controller.abort();
  }, []);
  return {state,error};
}
