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
  return {api, calls, set(value) { session = value; }, fail() { failure = true; }, event(provider = 'github') { listener({provider:{id:provider}}); }, get disposed() {return disposed;}};
}
const session = (account = 'student', token = 'TEST_SECRET') => ({id:'session',account:{id:account,label:account},accessToken:token});
test('activation/revalidation are silent and only explicit sign-in can create/select a native session', async () => {
  const f = fixture(); const auth = createAuthentication(f.api);
  await auth.refresh(); assert.equal(auth.signedIn,false); assert.equal(auth.status,'Not signed in');
  await assert.rejects(auth.capture(), /Sign in to GitHub/);
  assert.ok(f.calls.every(call => call.provider === 'github' && call.scopes.join() === 'repo' && call.options.silent));
  f.set(session()); await auth.signIn(); assert.equal(auth.status,'Signed in as student');
  assert.deepEqual(f.calls.at(-1).options,{createIfNone:true});
  await auth.signIn(true); assert.deepEqual(f.calls.at(-1).options,{createIfNone:true,clearSessionPreference:true});
  auth.dispose(); assert.equal(f.disposed,true); assert.equal(auth.signedIn,false);
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
