'use client';
import {useEffect, useState} from 'react';

type Grant = {id:string; capability:string; source:string; createdAt:string; expiresAt:string|null; revokedAt:string|null};
type Audit = {operationId:string; grantId:string; actorId:string; action:string; reason:string; createdAt:string};
type Payload = Record<string, string | null>;
type Pending = {payload:Payload; targetId:string};
const pendingKey = 'zero-entitlement-pending-v1';
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
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(pendingKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed.targetId !== 'string' || !parsed.payload || typeof parsed.payload.operationId !== 'string') throw new Error();
        setPending(parsed); setTarget(parsed.targetId);
      }
    } catch { setError('Pending action storage could not be read. Do not start another action until the previous result is checked.'); return; }
    data(endpoint).then(value => setCsrf(value.csrfToken)).catch(e => setError(e.message));
  }, []);
  async function lookup(id:string) {
    const result = await data(`${endpoint}?accountId=${encodeURIComponent(id)}`);
    setGrants(result.grants); setAudit(result.audit); setAccess(result.access); setLoaded(id);
  }
  async function search(event:React.FormEvent) {
    event.preventDefault(); setLoaded(''); setAccess(null); setGrants([]); setAudit([]); setBusy(true); setError(''); setNotice('');
    try { await lookup(target); } catch (e) { setError(e instanceof Error ? e.message : 'Lookup failed.'); }
    finally { setBusy(false); }
  }
  async function send(item:Pending) {
    setBusy(true); setError(''); setNotice('');
    try { sessionStorage.setItem(pendingKey, JSON.stringify(item)); setPending(item); }
    catch { setError('The action could not be saved for recovery and was not sent.'); setBusy(false); return; }
    try {
      await data(endpoint, {method:'POST', headers:{'Content-Type':'application/json','X-Hub-CSRF':csrf}, body:JSON.stringify(item.payload)});
      sessionStorage.removeItem(pendingKey); setPending(null); setReason(''); setNotice('Saved.');
      try { await lookup(item.targetId); } catch { setError('Saved, but the account could not be refreshed. Look it up again.'); }
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Request failed.'} The action remains saved for recovery. Sign in again if needed, then retry the same action or check the account audit.`);
    }
    finally { setBusy(false); }
  }
  function clearReviewed() {
    if (!window.confirm('Have you checked the account audit and resolved this action? Clearing this record does not cancel a write.')) return;
    try { sessionStorage.removeItem(pendingKey); setPending(null); setNotice('Recovery record cleared.'); }
    catch { setError('The recovery record could not be cleared.'); }
  }
  function grant(event:React.FormEvent) {
    event.preventDefault();
    let expiresAt:string|null = null;
    if (expiry) { const date = new Date(expiry); if (!Number.isFinite(date.getTime())) {setError('Enter a valid expiry.'); return;} expiresAt = date.toISOString(); }
    void send({targetId:loaded,payload:{action:'grant',targetId:loaded,capability,expiresAt,reason:reason.trim(),operationId:crypto.randomUUID()}});
  }
  return <main style={{maxWidth:'60rem',margin:'2rem auto',padding:'0 1rem'}}>
    <h1>Entitlement administration</h1>
    <p>Independent legacy grants remain effective until migrated. This page manages central manual grants; purchases and Stripe are not connected. The API verifies authorization before showing or changing account data.</p>
    {error && <p role="alert">{error}</p>}{!csrf && <p><a href="/zero-account/sign-in">Sign in to Zero</a>, then return to this page in the same tab to recover any pending action.</p>}{notice && <p role="status">{notice}</p>}
    {csrf && pending && <section><h2>Action awaiting recovery</h2>
      <p>Account {pending.targetId} · {pending.payload.action} · {pending.payload.capability || pending.payload.grantId} · reason: {pending.payload.reason} · operation {pending.payload.operationId}. This record is kept in this browser tab across reloads. Look up the account and check its audit; retry uses the same operation ID and details.</p>
      <button disabled={busy} onClick={() => void send(pending)}>Retry the same action</button>{' '}
      <button disabled={busy} onClick={clearReviewed}>I checked the audit; clear recovery record</button>
    </section>}
    {csrf && <form onSubmit={search}><label>GitHub numeric ID <input required inputMode="numeric" pattern="[1-9][0-9]{0,19}" value={target} onChange={e => setTarget(e.target.value)} /></label>{' '}<button disabled={busy}>Look up</button></form>}
    {csrf && loaded && <section><h2>Account {loaded}</h2>
      {access && <><p>Effective listing tier: {access.listingLimit === 10 ? 'Pro (10 listings)' : 'Free (1 listing)'}. Jam hosting: {access.jamHosting ? 'enabled' : 'not enabled'}.</p><p>Legacy listing grant: {access.legacyListings ? 'active' : 'none'}. Legacy Jam hosting grant: {access.legacyJamHosting ? 'active' : 'none'}. Revoking a central grant does not remove a legacy grant.</p></>}
      <h3>Grants</h3>{grants.length === 0 ? <p>No central grants.</p> : <ul>{grants.map(item => <li key={item.id}>
        {item.capability} · {item.source} · {item.revokedAt ? `revoked ${item.revokedAt}` : item.expiresAt ? `expires ${item.expiresAt}` : 'no expiry'}{' '}
        {!item.revokedAt && <button disabled={busy || !!pending || !reason.trim()} onClick={() => void send({targetId:loaded,payload:{action:'revoke',grantId:item.id,reason:reason.trim(),operationId:crypto.randomUUID()}})}>Revoke</button>}
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
