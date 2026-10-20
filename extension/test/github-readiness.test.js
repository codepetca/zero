'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAuthentication} = require('../src/authentication');
const {createGitHubReadiness} = require('../src/github-app/readiness');
const installationUrl = 'https://github.com/apps/codepet-zero/installations/new';
const session = (account='42', token='test-token') => ({id:'session-'+account, account:{id:account,label:'learner-'+account}, accessToken:token});
const deferred = () => {let resolve, reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const waitFor = async predicate => {const end=Date.now()+2000;while(!predicate()){assert.ok(Date.now()<end,'Readiness state did not arrive');await new Promise(resolve=>setImmediate(resolve));}};
const approval = (code='installation-required', actionUrl=installationUrl) => Object.assign(Error('Install access'),{code,actionUrl});
function fixture({saved, check=async()=>({})}={}) {
  let currentSession=saved, listener, active=true, readiness;
  const nativeCalls=[],checks=[],phases=[];
  const authentication=createAuthentication({
    async getSession(provider,scopes,options) {nativeCalls.push({provider,scopes,options});assert.deepEqual(options,{silent:true});return currentSession;},
    onDidChangeSessions(fn) {listener=fn;return {dispose(){}};}
  },()=>readiness?.sync());
  authentication.signIn=()=>assert.fail('Readiness must never start sign-in');
  readiness=createGitHubReadiness({authentication,installationUrl,active:()=>active,onChange:()=>{phases.push(readiness.phase);readiness.sync();},repositories:{checkSetup(options){checks.push(options);return check(options);}}});
  return {authentication,readiness,nativeCalls,checks,phases,
    async initialize(){await authentication.refresh();},
    set(value){currentSession=value;},
    event(){listener({provider:{id:'zero-github'}});},
    deactivate(){active=false;readiness.sync();},
    activate(){active=true;readiness.sync();},
    dispose(){readiness.dispose();authentication.dispose();}
  };
}
test('signed-out activation and explicit refresh perform no repository requests or interactive authentication',async()=>{
  const f=fixture();await f.initialize();assert.equal(f.readiness.phase,'signed-out');assert.equal(await f.readiness.refresh(),'signed-out');assert.equal(f.checks.length,0);assert.equal(f.nativeCalls.length,1);f.dispose();
});
test('saved ready sessions check silently once and same-session auth refreshes preserve the cache',async()=>{
  const f=fixture({saved:session()});await f.initialize();await waitFor(()=>f.readiness.phase==='ready');
  assert.equal(f.checks.length,1);assert.equal(f.checks[0].ticket.session.accountId,'42');assert.ok(f.checks[0].signal instanceof AbortSignal);
  const nativeBefore=f.nativeCalls.length;await f.authentication.refresh();await f.authentication.refresh();f.readiness.sync();
  assert.equal(f.checks.length,1);assert.equal(f.nativeCalls.length,nativeBefore+2);assert.deepEqual(f.phases,['checking','ready']);f.dispose();
});
test('saved missing installations cache install state without opening UI, browsers, or creating sessions',async()=>{
  const f=fixture({saved:session(),check:async()=>{throw approval();}});await f.initialize();await waitFor(()=>f.readiness.phase==='install');
  await f.authentication.refresh();f.readiness.sync();assert.equal(f.checks.length,1);assert.deepEqual(f.phases,['checking','install']);
  assert.ok(f.nativeCalls.every(call=>call.provider==='zero-github'&&call.options.silent));f.dispose();
});
test('synchronous onChange during capture and assertCurrent does not recurse or start duplicate probes',async()=>{
  const f=fixture({saved:session()});await f.initialize();await waitFor(()=>f.readiness.phase==='ready');
  assert.equal(f.nativeCalls.length,3,'initial lookup, capture, and final assertion only');assert.equal(f.checks.length,1);
  assert.equal(await f.readiness.refresh(),'ready');assert.equal(f.checks.length,2);assert.equal(f.nativeCalls.length,5);f.dispose();
});
test('explicit refresh coalesces current-generation checks and retries unavailable access',async()=>{
  let attempt=0;const gate=deferred();const f=fixture({saved:session(),check:()=>++attempt===1?Promise.reject(Object.assign(Error('offline'),{code:'network-error'})):gate.promise});
  await f.initialize();await waitFor(()=>f.readiness.phase==='unavailable');await f.authentication.refresh();assert.equal(f.checks.length,1);
  const first=f.readiness.refresh(),second=f.readiness.refresh();assert.equal(first,second);await waitFor(()=>f.checks.length===2);gate.resolve({});assert.equal(await first,'ready');f.dispose();
});
test('only recognized approval errors with the exact pinned URL become install',async()=>{
  for(const [error,expected] of [
    [approval(),'install'],[approval('permission-required'),'install'],[approval('github-error'),'install'],
    [approval('permission-required','https://example.invalid'),'unavailable'],[approval('repository-not-selected'),'unavailable'],
    [Object.assign(Error('HTTP 401'),{code:'github-error'}),'unavailable'],[Error('unexpected'),'unavailable']
  ]) {
    const f=fixture({saved:session(),check:async()=>{throw error;}});await f.initialize();await waitFor(()=>f.readiness.phase===expected);assert.equal(f.checks.length,1);f.dispose();
  }
});
test('same-account token revision invalidates ready immediately and checks a fresh ticket',async()=>{
  const gate=deferred();let count=0;const f=fixture({saved:session(),check:()=>++count===1?Promise.resolve({}):gate.promise});
  await f.initialize();await waitFor(()=>f.readiness.phase==='ready');const old=f.checks[0].ticket;
  f.set(session('42','rotated-token'));await f.authentication.refresh();assert.equal(f.readiness.phase,'checking');
  await waitFor(()=>f.checks.length===2);assert.throws(()=>f.authentication.assertCurrentNow(old));assert.equal(f.checks[1].ticket.session.accessToken,'rotated-token');
  gate.resolve({});await waitFor(()=>f.readiness.phase==='ready');f.dispose();
});
test('provider revision invalidation cannot reuse a cached ticket even when the account and token return unchanged',async()=>{
  const gate=deferred();let count=0;const f=fixture({saved:session(),check:()=>++count===1?Promise.resolve({}):gate.promise});
  await f.initialize();await waitFor(()=>f.readiness.phase==='ready');f.event();assert.equal(f.readiness.phase,'signed-out');
  await waitFor(()=>f.checks.length===2);assert.equal(f.readiness.phase,'checking');gate.resolve({});await waitFor(()=>f.readiness.phase==='ready');f.dispose();
});
test('new account checks independently when an old fetch ignores abort and late completion cannot overwrite it',async()=>{
  const old=deferred(),fresh=deferred();const f=fixture({saved:session(),check:({ticket})=>ticket.session.accountId==='42'?old.promise:fresh.promise});
  await f.initialize();await waitFor(()=>f.checks.length===1);f.set(session('99'));await f.authentication.refresh();
  await waitFor(()=>f.checks.length===2);assert.equal(f.checks[0].signal.aborted,true);assert.equal(f.checks[1].ticket.session.accountId,'99');
  fresh.reject(approval());await waitFor(()=>f.readiness.phase==='install');const before=[...f.phases];old.resolve({});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.readiness.phase,'install');assert.deepEqual(f.phases,before);f.dispose();
});
test('sign-out aborts a pending check and a late approval rejection cannot restore install',async()=>{
  const gate=deferred(),f=fixture({saved:session(),check:()=>gate.promise});await f.initialize();await waitFor(()=>f.checks.length===1);
  f.set(undefined);await f.authentication.refresh();assert.equal(f.readiness.phase,'signed-out');assert.equal(f.checks[0].signal.aborted,true);
  gate.reject(approval());await new Promise(resolve=>setImmediate(resolve));assert.equal(f.readiness.phase,'signed-out');assert.equal(f.checks.length,1);f.dispose();
});
test('inactive cancellation and disposal discard results without publishing stale phases',async()=>{
  for(const cancel of ['deactivate','dispose']) {
    const gate=deferred(),f=fixture({saved:session(),check:()=>gate.promise});await f.initialize();await waitFor(()=>f.checks.length===1);
    f[cancel]();const before=[...f.phases];assert.equal(f.checks[0].signal.aborted,true);gate.resolve({});await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(f.phases,before);assert.notEqual(f.readiness.phase,'ready');assert.equal(f.readiness.confirm(f.checks[0].ticket),false);f.dispose();
  }
});
test('confirm accepts only a current ticket, aborts older work, and preserves ready across same-session refresh',async()=>{
  const gate=deferred(),f=fixture({saved:session(),check:()=>gate.promise});await f.initialize();await waitFor(()=>f.checks.length===1);
  const ticket=f.checks[0].ticket;assert.equal(f.readiness.confirm(ticket),true);assert.equal(f.checks[0].signal.aborted,true);assert.equal(f.readiness.phase,'ready');
  gate.reject(approval());await new Promise(resolve=>setImmediate(resolve));await f.authentication.refresh();assert.equal(f.checks.length,1);assert.equal(f.readiness.phase,'ready');
  f.set(undefined);await f.authentication.refresh();assert.equal(f.readiness.confirm(ticket),false);assert.equal(f.readiness.phase,'signed-out');f.dispose();
});
test('account drift during final asynchronous assertion cannot publish old ready',async()=>{
  let checks=0;const fresh=deferred();const f=fixture({saved:session(),check:()=>++checks===1?Promise.resolve({}):fresh.promise});
  const original=f.authentication.assertCurrent;
  f.authentication.assertCurrent=async ticket=>{if(ticket.session.accountId==='42')f.set(session('99'));return original(ticket);};
  await f.initialize();await waitFor(()=>f.checks.length===2);assert.equal(f.readiness.phase,'checking');assert.ok(!f.phases.includes('ready'));
  fresh.reject(approval());await waitFor(()=>f.readiness.phase==='install');f.dispose();
});
test('a stale signed-in confirmation cannot abort the new account probe or restore ready',async()=>{
  const old=deferred(),fresh=deferred(),f=fixture({saved:session(),check:({ticket})=>ticket.session.accountId==='42'?old.promise:fresh.promise});
  await f.initialize();await waitFor(()=>f.checks.length===1);const stale=f.checks[0].ticket;
  f.set(session('99'));await f.authentication.refresh();await waitFor(()=>f.checks.length===2);
  assert.equal(f.readiness.confirm(stale),false);assert.equal(f.readiness.phase,'checking');assert.equal(f.checks[1].signal.aborted,false);
  fresh.reject(approval());await waitFor(()=>f.readiness.phase==='install');old.resolve({});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.readiness.phase,'install');f.dispose();
});
