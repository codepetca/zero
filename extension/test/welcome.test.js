'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createAuthentication} = require('../src/authentication');
const {createWelcome, WELCOME_KEY} = require('../src/welcome');
const session = label => ({id:label,account:{id:label,label},accessToken:'MOCK_ONLY'});
function fixture({current, choices = [], remembered = new Map(), eligible = true} = {}) {
  const calls = [], messages = [];
  let listener, next = current, failure = false, starts = 0, busy = false;
  const auth = createAuthentication({
    async getSession(provider, scopes, options) {
      assert.equal(provider,'zero-github');assert.deepEqual(scopes,[]);calls.push({provider,scopes,options});
      if (failure) throw new Error('PRIVATE_PROVIDER_DETAIL');
      return next;
    },
    onDidChangeSessions(fn) {listener = fn;return {dispose(){}};}
  });
  const welcome = createWelcome({
    window:{async showInformationMessage(text,...actions) {messages.push({text,actions});const choice = choices.shift();return typeof choice === 'function' ? choice() : choice;}},
    globalState:{get:key=>remembered.get(key),update:async(key,value)=>remembered.set(key,value)},
    authentication:auth, connect:()=>auth.signIn(), startProject:async()=>{starts++;},eligible:async()=>eligible,isBusy:()=>busy
  });
  return {auth,welcome,calls,messages,remembered,set(value){next=value;},fail(value=true){failure=value;},event(){listener({provider:{id:'zero-github'}});},busy(value){busy=value;},get starts(){return starts;}};
}
test('connected first launch uses silent Zero App lookup and offers the tutorial with the actual username',async()=>{
  const f=fixture({current:session('learner'),choices:['Start tutorial']});await f.welcome.show();
  assert.match(f.messages[0].text,/connected as learner/);assert.deepEqual(f.messages[0].actions,[{modal:true,detail:'Welcome to Zero. Create your own tutorial repository to start learning.'},'Start tutorial','Later']);assert.equal(f.starts,1);
  assert.deepEqual(f.calls,[{provider:'zero-github',scopes:[],options:{silent:true}}]);assert.equal(f.remembered.get(WELCOME_KEY),true);
});
test('disconnected modal Later and Escape never create sessions, and profile state prevents repeat offers after session changes',async()=>{
  for(const choice of ['Later',undefined]) {
    const f=fixture({choices:[choice]});await f.welcome.show();assert.match(f.messages[0].text,/Connect GitHub/);assert.equal(f.messages[0].actions[0].modal,true);assert.match(f.messages[0].actions[0].detail,/Later.*locally.*Zero: Get Started/);assert.deepEqual(f.messages[0].actions.slice(1),['Connect GitHub','Later']);assert.equal(f.calls.filter(call=>call.options.createIfNone).length,0);
    f.set(session('other'));f.event();await f.auth.refresh();await f.welcome.show();assert.equal(f.messages.length,1);
    const next=fixture({remembered:f.remembered,current:session('other')});await next.welcome.show();assert.equal(next.messages.length,0);assert.ok(next.calls.every(call=>call.options.silent));
  }
});
test('only explicit Connect creates a session; cancellation/provider failure remain retryable without false success',async()=>{
  for(const failed of [false,true]) {
    const f=fixture({choices:['Connect GitHub']});f.fail(failed);
    await assert.rejects(f.welcome.show(),error=>/Sign in|cancelled/.test(error.message)&&!error.message.includes('PRIVATE'));
    assert.equal(f.calls.filter(call=>call.options.createIfNone).length,1);assert.equal(f.messages.length,1);assert.equal(f.auth.signedIn,false);
    f.fail(false);f.set(session('retry'));await f.auth.signIn();assert.equal(f.auth.accountLabel,'retry');
    await f.welcome.show().catch(()=>{});assert.equal(f.messages.length,1,'A failed welcome is not another automatic offer');
  }
});
test('connection success follows the authoritative session and routes Start tutorial once',async()=>{
  const f=fixture({choices:[()=>{f.set(session('student'));return 'Connect GitHub';},'Start tutorial']});
  // An account connected elsewhere while the offer is open is reused silently.
  await Promise.all([f.welcome.show(),f.welcome.show()]);assert.ok(f.calls.every(call=>call.options.silent));assert.match(f.messages[1].text,/connected as student/);assert.equal(f.starts,1);
});
test('disposal and newly busy operations discard stale dialog choices',async()=>{
  for(const action of ['dispose','busy']) {
    let release;const f=fixture({choices:[()=>new Promise(resolve=>{release=resolve;})]});const pending=f.welcome.show();
    while(!release) await new Promise(resolve=>setImmediate(resolve));
    if(action==='dispose')f.welcome.dispose();else f.busy(true);
    release('Connect GitHub');await pending;assert.equal(f.calls.filter(call=>call.options.createIfNone).length,0);assert.equal(f.starts,0);
  }
});
test('unrelated editor/workspace context does not consume the profile welcome or show a prompt',async()=>{
  const f=fixture({eligible:false});await f.welcome.show();assert.equal(f.messages.length,0);assert.equal(f.remembered.has(WELCOME_KEY),false);assert.ok(f.calls.every(call=>call.options.silent));
});
