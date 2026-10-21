'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAuthentication} = require('../src/authentication');
function fixture() {
  let session, listener, failure = false, disposed = false;
  const calls = [];
  const api = {
    async getSession(provider, scopes, options) { calls.push({provider, scopes, options}); if (failure) throw new Error('PRIVATE token'); return session; },
    onDidChangeSessions(fn) { listener = fn; return {dispose() { disposed = true; }}; }
  };
  return {api, calls, set(value) { session = value; }, fail() { failure = true; }, event(provider = 'zero-github') { listener({provider:{id:provider}}); }, get disposed() {return disposed;}};
}
const session = (account = 'student', token = 'TEST_SECRET') => ({id:'session',account:{id:account,label:account},accessToken:token});
test('activation/revalidation are silent and only explicit sign-in can create/select a native session', async () => {
  const f = fixture(); const auth = createAuthentication(f.api);
  await auth.refresh(); assert.equal(auth.signedIn,false); assert.equal(auth.accountLabel,undefined); assert.equal(auth.status,'Not signed in');
  await assert.rejects(auth.capture(), /Sign in to GitHub/);
  assert.ok(f.calls.every(call => call.provider === 'zero-github' && call.scopes.length === 0 && call.options.silent));
  f.set(session()); await auth.signIn(); assert.equal(auth.status,'Signed in as student'); assert.equal(auth.accountLabel,'student');
  assert.deepEqual(f.calls.at(-1).options,{createIfNone:true});
  await auth.signIn(true); assert.deepEqual(f.calls.at(-1).options,{createIfNone:true,clearSessionPreference:true});
  auth.dispose(); assert.equal(f.disposed,true); assert.equal(auth.signedIn,false); assert.equal(auth.accountLabel,undefined);
});
test('session/account/token drift, removal, and provider changes invalidate a captured upload', async () => {
  for (const next of [undefined, session('other'), session('student','rotated')]) {
    const f=fixture();f.set(session());const auth=createAuthentication(f.api);const ticket=await auth.capture();
    f.set(next);await assert.rejects(auth.assertCurrent(ticket), /account or sign-in changed/);auth.dispose();
  }
  const f=fixture();f.set(session());const auth=createAuthentication(f.api);const ticket=await auth.capture();
  f.event('microsoft');await auth.assertCurrent(ticket);
  f.event();await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);auth.dispose();
});
test('unavailable provider/cancelled sign-in never leaks its private error or blocks local code', async () => {
  const f=fixture();f.fail();const auth=createAuthentication(f.api);await auth.refresh();
  assert.match(auth.status,/unavailable/);assert.doesNotMatch(auth.status,/PRIVATE/);
  await assert.rejects(auth.signIn(),error=>{assert.doesNotMatch(error.message,/PRIVATE/);return /cancelled or unavailable/.test(error.message);});auth.dispose();
});

test('synchronous captured-session guard uses the same checks without starting a native lookup', async () => {
  const f=fixture();f.set(session());const auth=createAuthentication(f.api);const ticket=await auth.capture();
  const initialCalls=f.calls.length;const current=auth.assertCurrentNow(ticket);
  assert.equal(current.accessToken,'TEST_SECRET');assert.equal(current.then,undefined);assert.equal(f.calls.length,initialCalls);
  f.event();assert.throws(()=>auth.assertCurrentNow(ticket),/account or sign-in changed/);
  assert.equal(f.calls.length,initialCalls,'Immediate invalidation requires no asynchronous native lookup');
  await auth.refresh();assert.throws(()=>auth.assertCurrentNow(ticket),/account or sign-in changed/);
  const next=await auth.capture();await auth.assertCurrent(next);assert.equal(auth.assertCurrentNow(next).accountId,'student');
  auth.dispose();assert.throws(()=>auth.assertCurrentNow(next),/account or sign-in changed/);
});

test('App sessions use empty scopes for publishing and ordinary uploads',async()=>{
  const f=fixture();f.set({...session(),scopes:[]});
  const auth=createAuthentication(f.api);const ticket=await auth.capture();
  assert.deepEqual(f.calls.at(-1),{provider:'zero-github',scopes:[],options:{silent:true}});
  assert.deepEqual(ticket.session.scopes,[]);assert.equal(auth.sessionId,'session');
  assert.equal(Object.isFrozen(ticket),true);assert.equal(Object.isFrozen(ticket.session),true);
  auth.dispose();assert.equal(auth.sessionId,undefined);
});
test('App account hints reach silent and interactive lookups without trusting provider identity',async()=>{
  const f=fixture();f.set(session());const account={id:'student',label:'student'};
  const auth=createAuthentication(f.api,()=>{},[],account);
  const ticket=await auth.capture();assert.deepEqual(f.calls.at(-1).options,{silent:true,account});
  await auth.signIn();assert.deepEqual(f.calls.at(-1).options,{createIfNone:true,account});
  f.set(session('other'));await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);
  auth.dispose();
});
test('session ID drift invalidates tickets while the built-in GitHub provider cannot invalidate Zero',async()=>{
  const f=fixture();f.set(session());const auth=createAuthentication(f.api);const ticket=await auth.capture();
  f.event('github');assert.equal(auth.assertCurrentNow(ticket).accountId,'student');
  f.set({...session(),id:'replacement'});await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);
  auth.dispose();
});
test('cancelled interactive sign-in without a session remains disconnected',async()=>{
  const f=fixture();const auth=createAuthentication(f.api);
  await assert.rejects(auth.signIn(),/Sign in to GitHub/);assert.equal(auth.signedIn,false);
  assert.ok(f.calls.every(call=>call.provider==='zero-github'&&call.scopes.length===0));auth.dispose();
});
test('busy includes queued, active and session-event renewal until completion or failure',async()=>{
  const f=fixture();let release;
  f.api.getSession=async()=>{await new Promise(resolve=>{release=resolve;});throw new Error('unavailable');};
  const auth=createAuthentication(f.api);
  const first=auth.refresh(),second=auth.refresh();assert.equal(auth.busy,true);
  await new Promise(resolve=>setImmediate(resolve));release();await first;
  assert.equal(auth.busy,true,'Queued work still protects renewal');
  await new Promise(resolve=>setImmediate(resolve));release();await second;assert.equal(auth.busy,false);
  f.event();assert.equal(auth.busy,true);await new Promise(resolve=>setImmediate(resolve));release();
  while(auth.busy)await new Promise(resolve=>setImmediate(resolve));auth.dispose();
});
