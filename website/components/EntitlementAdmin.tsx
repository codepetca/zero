'use client';
import {useEffect, useState} from 'react';

type Grant = {id:string; capability:string; source:string; createdAt:string; expiresAt:string|null; revokedAt:string|null};
type Audit = {operationId:string; grantId:string; actorId:string; action:string; reason:string; createdAt:string};
type Pending = Record<string, string | null>;
const endpoint = '/api/admin/entitlements';

export function EntitlementAdmin() {
  const [csrf, setCsrf] = useState('');
  const [target, setTarget] = useState('');
  const [loaded, setLoaded] = useState('');
  const [access, setAccess] = useState<{listingLimit:number; jamHosting:boolean; legacyListings:boolean; legacyJamHosting:boolean}|null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [capability, setCapability] = useState('pro_listings');
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<Pending|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function data(url:string, options?:RequestInit) {
    const response = await fetch(url, {...options, cache:'no-store'});
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || 'Request failed.'); Object.assign(error, {status:response.status}); throw error; }
    return result;
  }
  useEffect(() => { data(endpoint).then(value => setCsrf(value.csrfToken)).catch(e => setError(e.message)); }, []);
  async function lookup(id:string) {
    const result = await data(`${endpoint}?accountId=${encodeURIComponent(id)}`);
    setGrants(result.grants); setAudit(result.audit); setAccess(result.access); setLoaded(id);
  }
  async function search(event:React.FormEvent) {
    event.preventDefault(); setLoaded(''); setAccess(null); setGrants([]); setAudit([]); setBusy(true); setError(''); setNotice('');
    try { await lookup(target); } catch (e) { setError(e instanceof Error ? e.message : 'Lookup failed.'); }
    finally { setBusy(false); }
  }
  async function send(payload:Pending) {
    setBusy(true); setError(''); setNotice(''); setPending(payload);
    try {
      await data(endpoint, {method:'POST', headers:{'Content-Type':'application/json','X-Hub-CSRF':csrf}, body:JSON.stringify(payload)});
      setPending(null); setReason(''); setNotice('Saved.');
      try { await lookup(loaded); } catch { setError('Saved, but the account could not be refreshed. Look it up again.'); }
    } catch (e) {
      const definitive = e instanceof Error && [400,401,403,404,409,415].includes((e as Error & {status?:number}).status ?? 0);
      if (definitive) setPending(null);
      setError(`${e instanceof Error ? e.message : 'Request failed.'}${definitive ? '' : ' The result may be uncertain; retry the same action before starting another.'}`);
    }
    finally { setBusy(false); }
  }
  function grant(event:React.FormEvent) {
    event.preventDefault();
    let expiresAt:string|null = null;
    if (expiry) { const date = new Date(expiry); if (!Number.isFinite(date.getTime())) {setError('Enter a valid expiry.'); return;} expiresAt = date.toISOString(); }
    void send({action:'grant',targetId:loaded,capability,expiresAt,reason:reason.trim(),operationId:crypto.randomUUID()});
  }
  return <main style={{maxWidth:'60rem',margin:'2rem auto',padding:'0 1rem'}}>
    <h1>Entitlement administration</h1>
    <p>Independent legacy grants remain effective until migrated. This page manages central manual grants; purchases and Stripe are not connected.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && <p><button disabled={busy} onClick={() => void send(pending)}>Retry the same action</button></p>}
    <form onSubmit={search}><label>GitHub numeric ID <input required inputMode="numeric" pattern="[1-9][0-9]{0,19}" value={target} onChange={e => setTarget(e.target.value)} /></label>{' '}<button disabled={!csrf || busy || !!pending}>Look up</button></form>
    {loaded && <section><h2>Account {loaded}</h2>
      {access && <><p>Effective listing tier: {access.listingLimit === 10 ? 'Pro (10 listings)' : 'Free (1 listing)'}. Jam hosting: {access.jamHosting ? 'enabled' : 'not enabled'}.</p><p>Legacy listing grant: {access.legacyListings ? 'active' : 'none'}. Legacy Jam hosting grant: {access.legacyJamHosting ? 'active' : 'none'}. Revoking a central grant does not remove a legacy grant.</p></>}
      <h3>Grants</h3>{grants.length === 0 ? <p>No central grants.</p> : <ul>{grants.map(item => <li key={item.id}>
        {item.capability} · {item.source} · {item.revokedAt ? `revoked ${item.revokedAt}` : item.expiresAt ? `expires ${item.expiresAt}` : 'no expiry'}{' '}
        {!item.revokedAt && <button disabled={busy || !!pending || !reason.trim()} onClick={() => void send({action:'revoke',grantId:item.id,reason:reason.trim(),operationId:crypto.randomUUID()})}>Revoke</button>}
      </li>)}</ul>}
      <form onSubmit={grant}><h3>Add a grant</h3>
        <p><label>Capability <select value={capability} onChange={e => setCapability(e.target.value)}><option value="pro_listings">Pro listing allowance (10)</option><option value="jam_hosting">Jam hosting</option></select></label></p>
        <p><label>Expiry (optional, local time) <input type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)} /></label></p>
        <p><label>Reason for grant or revocation <input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label></p>
        <button disabled={busy || !!pending || !csrf}>Add grant</button>
      </form>
      <h3>Audit history</h3>{audit.length === 0 ? <p>No central audit entries.</p> : <ul>{audit.map(item => <li key={item.operationId}>{item.createdAt} · {item.action} · grant {item.grantId} · actor {item.actorId} · {item.reason}</li>)}</ul>}
    </section>}
  </main>;
}
