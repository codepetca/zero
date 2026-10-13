'use client';
import Link from 'next/link';
import {useEffect, useRef, useState, type FormEvent} from 'react';
type Result = {requestId:string;status:string;kind:string;version:string;commit:string;message:string;releaseLink?:string};
type Results = {issue:string;results:Result[];message:string};
function issueNumber(value:string) {
  const match = /^(?:https:\/\/github\.com\/codepetca\/zero\/issues\/|#)?([1-9][0-9]*)$/.exec(value.trim());
  return value.length<=150 && match && Number.isSafeInteger(Number(match[1])) ? match[1] : null;
}
export function HubRequestResults() {
  const [input,setInput] = useState(''), [error,setError] = useState(''), [data,setData] = useState<Results|null>(null), [loading,setLoading] = useState(false);
  const active = useRef<AbortController|null>(null);
  useEffect(()=>{
    const initial = new URLSearchParams(window.location.search).get('issue');
    if (initial && issueNumber(initial)) setInput(initial);
    return ()=>active.current?.abort();
  },[]);
  async function check(event:FormEvent) {
    event.preventDefault();
    const number = issueNumber(input);
    if (!number) {setData(null);setError('Enter an official GitHub issue URL or a positive issue number.');return;}
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(()=>controller.abort(),10000);
    setError('');setData(null);setLoading(true);
    try {
      const response = await fetch(`/api/sharing/requests/${number}`,{cache:'no-store',redirect:'error',signal:controller.signal});
      if (!response.ok) throw new Error('Unavailable');
      const result:Results = await response.json();
      if (active.current===controller) setData(result);
    } catch {
      if (active.current===controller) setError('Request results are unavailable. Try again shortly, or view your official GitHub issue.');
    } finally {
      clearTimeout(timer);
      if (active.current===controller) {active.current=null;setLoading(false);}
    }
  }
  function cancel() {active.current?.abort();active.current=null;setLoading(false);setError('Lookup cancelled. Your issue number is still entered.');}
  const number = issueNumber(input);
  return <div>
    <form className="hub-form" onSubmit={check}>
      <label htmlFor="request-issue">Check your publication request</label>
      <input id="request-issue" value={input} onChange={event=>setInput(event.target.value)} maxLength={150} placeholder="Official GitHub issue URL or #123" aria-describedby="request-help request-feedback" aria-invalid={Boolean(error)} />
      <p id="request-help" className="fine-print">Use the issue created in codepetca/zero. Checking reads public results and does not submit or retry publication.</p>
      <button className="button primary compact" disabled={loading} type="submit">{loading?'Checking request…':'Check request'}</button>
      {loading && <button type="button" className="text-button" onClick={cancel}>Cancel lookup</button>}
    </form>
    <div id="request-feedback" role="status" aria-live="polite">
      {error && <p className="hub-error">{error}</p>}
      {data && <><p>Issue #{data.issue}: {data.message}</p>{data.results.map(result=><article key={result.requestId}>
        <h3>{result.kind==='game'?'Game':'Library'} · Version {result.version}</h3><p>{result.message}</p>
        <p className="fine-print">Source commit: <code style={{overflowWrap:'anywhere'}}>{result.commit}</code></p>
        <details><summary>Request identity</summary><p><code style={{overflowWrap:'anywhere'}}>{result.requestId}</code></p></details>
        {result.releaseLink && <p><Link href={result.releaseLink}>View exact release</Link></p>}
      </article>)}</>}
    </div>
    {number && <p><a href={`https://github.com/codepetca/zero/issues/${number}`}>View official GitHub issue #{number}</a></p>}
  </div>;
}
