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

function ownedFixture() {
  let sessions=[], listener, disposed=false, failure;
  const calls=[];
  const provider={
    async getSessions(scopes,options) {calls.push({method:'getSessions',scopes,options});if(failure)throw failure;return sessions;},
    async createSession(scopes) {calls.push({method:'createSession',scopes});if(failure)throw failure;return sessions[0]=session();},
    onDidChangeSessions(fn) {listener=fn;return {dispose(){disposed=true;}};}
  };
  return {provider,calls,set(value){sessions=value;},fail(){failure=new Error('PRIVATE');},event(){listener({added:[],changed:[],removed:[]});},get disposed(){return disposed;}};
}
test('Zero uses its owned provider directly: silent reads never create and explicit sign-in avoids host session consent',async()=>{
  const {ownedProviderApi}=require('../src/authentication');const f=ownedFixture();
  const auth=createAuthentication(ownedProviderApi(f.provider));
  await auth.refresh();assert.equal(auth.signedIn,false);
  assert.deepEqual(f.calls,[{method:'getSessions',scopes:[],options:undefined}]);
  await auth.signIn();assert.equal(auth.signedIn,true);
  assert.deepEqual(f.calls.slice(-2),[{method:'getSessions',scopes:[],options:undefined},{method:'createSession',scopes:[]}]);
  await auth.signIn();assert.equal(f.calls.filter(call=>call.method==='createSession').length,1);
  const ticket=await auth.capture();f.set([]);f.event();
  assert.throws(()=>auth.assertCurrentNow(ticket),/account or sign-in changed/);
  await auth.refresh();assert.equal(auth.signedIn,false);auth.dispose();assert.equal(f.disposed,true);
});
test('owned provider preserves account hints, token drift and fail-closed session selection',async()=>{
  const {ownedProviderApi}=require('../src/authentication');const f=ownedFixture(),account={id:'student',label:'student'};
  f.set([session()]);const auth=createAuthentication(ownedProviderApi(f.provider),()=>{},[],account);
  const ticket=await auth.capture();assert.deepEqual(f.calls[0].options,{account});
  f.set([session('student','rotated')]);await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);
  f.set([session(),session('other')]);await auth.refresh();assert.equal(auth.signedIn,false);
  await assert.rejects(auth.signIn(),/unavailable/);assert.equal(f.calls.some(call=>call.method==='createSession'),false);
  auth.dispose();
});
test('unconfigured or failing owned providers cannot prompt from silent reads or leak errors',async()=>{
  const {ownedProviderApi}=require('../src/authentication');
  const offline=createAuthentication(ownedProviderApi(null));await offline.refresh();assert.equal(offline.status,'Not signed in');
  await assert.rejects(offline.signIn(),/Sign in to GitHub/);offline.dispose();
  const f=ownedFixture();f.fail();const auth=createAuthentication(ownedProviderApi(f.provider));
  await auth.refresh();await assert.rejects(auth.signIn(),error=>/unavailable/.test(error.message)&&!error.message.includes('PRIVATE'));
  assert.equal(f.calls.some(call=>call.method==='createSession'),false);auth.dispose();
  const silent=ownedFixture();await ownedProviderApi(silent.provider).getSession('zero-github',[],{silent:true,createIfNone:true});
  assert.equal(silent.calls.length,1);assert.equal(silent.calls[0].method,'getSessions');
  await assert.rejects(ownedProviderApi(silent.provider).getSession('github',[],{createIfNone:true}));
});

test('operation reuse forwards only a privately retained provider session and capture always uses full lookup',async()=>{
  const {ownedProviderApi}=require('../src/authentication'),f=ownedFixture(),source=session();
  f.set([source]);let checks=0;
  f.provider.getSessionsForOperation=async(expected,scopes,options)=>{
    checks++;assert.equal(expected,source);assert.deepEqual(scopes,[]);assert.equal(options,undefined);return [source];
  };
  const auth=createAuthentication(ownedProviderApi(f.provider)),ticket=await auth.capture();
  assert.notEqual(ticket.session,source);assert.deepEqual(Object.keys(ticket).sort(),['revision','session']);
  await auth.assertCurrent(ticket);await auth.assertCurrent(ticket);
  assert.equal(checks,2);assert.equal(f.calls.length,1);
  await auth.capture();assert.equal(f.calls.length,2,'Capturing another operation never takes the private fast path');
  auth.dispose();await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);assert.equal(checks,2);
});

test('foreign API and older owned providers retain full silent revalidation for every assertion',async()=>{
  const f=fixture();f.set(session());const auth=createAuthentication(f.api),ticket=await auth.capture();
  await auth.assertCurrent(ticket);await auth.assertCurrent(ticket);assert.equal(f.calls.length,3);auth.dispose();
  const {ownedProviderApi}=require('../src/authentication'),older=ownedFixture();older.set([session()]);
  const owned=createAuthentication(ownedProviderApi(older.provider)),captured=await owned.capture();
  await owned.assertCurrent(captured);await owned.assertCurrent(captured);assert.equal(older.calls.length,3);owned.dispose();
});

test('owned operation lookup rejects ambiguous accounts and invalidated tickets before another request',async()=>{
  const {ownedProviderApi}=require('../src/authentication'),f=ownedFixture();f.set([session()]);let checks=0;
  f.provider.getSessionsForOperation=async()=>{checks++;return [session(),session('other')];};
  const auth=createAuthentication(ownedProviderApi(f.provider)),ticket=await auth.capture();
  await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);assert.equal(auth.signedIn,false);assert.equal(checks,1);
  await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);assert.equal(checks,1);auth.dispose();
});
