'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createNativeGitAuthentication, githubHTTPSHost} = require('../src/native-git-authentication');
const {createAuthentication} = require('../src/authentication');

const host = (authority = 'github.com', scheme = 'https', extra = {}) => ({scheme, authority, path:'', query:'', fragment:'', ...extra});
const deferred = () => {let resolve;const promise = new Promise(done => {resolve=done;});return {promise,resolve};};
function fixture({enabled = true, trusted = true, signedIn = true, gitAPI} = {}) {
  const configuration = {
    zero:{nativeGitAuthentication:enabled},
    git:{enabled:true,useIntegratedAskPass:true,terminalAuthentication:false},
    github:{gitAuthentication:false}
  };
  let inspect = {globalValue:enabled}, configEvent, trustEvent, current = signedIn ? {id:'one',accountId:'123',accessToken:'FAKE_ZERO_TOKEN'} : undefined;
  let captureHook, captureFailure, revision = 0, loads = 0, captures = 0, guards = 0, subscriptionDisposals = 0;
  const providers = [], registrations = [], notices = [];
  const authentication = {
    get signedIn() {return Boolean(current);},
    get sessionId() {return current?.id;},
    get accountId() {return current?.accountId;},
    async capture() {
      captures++;
      if (captureFailure) throw captureFailure;
      const ticket = {session:current, revision};
      if (captureHook) await captureHook();
      if (!current) throw new Error('signed out');
      return ticket;
    },
    assertCurrentNow(ticket) {
      guards++;
      if (!current || ticket.session !== current || ticket.revision !== revision) throw new Error('changed');
      return current;
    }
  };
  const api = gitAPI || {registerCredentialsProvider(provider) {
    providers.push(provider);
    const record = {disposed:false,dispose(){this.disposed=true;}};
    registrations.push(record);
    return record;
  }};
  const vscode = {workspace:{
    isTrusted:trusted,
    getConfiguration(section) {return {
      get(key, fallback) {return Object.hasOwn(configuration[section], key) ? configuration[section][key] : fallback;},
      inspect() {return inspect;}
    };},
    onDidChangeConfiguration(listener) {configEvent=listener;return {dispose(){subscriptionDisposals++;}};},
    onDidGrantWorkspaceTrust(listener) {trustEvent=listener;return {dispose(){subscriptionDisposals++;}};}
  }};
  const bridge = createNativeGitAuthentication({vscode,authentication,getGitAPI:async()=>{loads++;return api;},onChange:value=>notices.push(value)});
  return {bridge,configuration,vscode,authentication,providers,registrations,notices,
    setInspect(value){inspect=value;},
    setSession(value){current=value;revision++;},
    rotateToken(value){current={...current,accessToken:value};revision++;},
    captureWith(value){captureHook=value;},failCapture(){captureFailure=new Error('PRIVATE_FAKE_TOKEN');},
    configChanged(key){configEvent({affectsConfiguration:value=>value===key});},
    grantTrust(){vscode.workspace.isTrusted=true;trustEvent();},
    get loads(){return loads;},get captures(){return captures;},get guards(){return guards;},get subscriptionDisposals(){return subscriptionDisposals;}
  };
}

test('off by default and workspace settings cannot opt into credentials or activate Git', async () => {
  for (const inspection of [undefined, {}, {defaultValue:true}, {workspaceValue:true}, {workspaceFolderValue:true}, {globalValue:false,workspaceValue:true}]) {
    const f=fixture({enabled:false});f.configuration.zero.nativeGitAuthentication=true;f.setInspect(inspection);
    await f.bridge.refresh();
    assert.equal(f.bridge.status.phase,'disabled');assert.equal(f.loads,0);assert.equal(f.captures,0);
    f.bridge.dispose();
  }
});
test('trusted workspace, Zero sign-in, Askpass and provider isolation are required without changing settings', async () => {
  const cases = [
    [f=>{f.vscode.workspace.isTrusted=false;},/trusted workspace/],
    [f=>{f.configuration.git.enabled=false;},/Enable Git/],
    [f=>{f.configuration.git.useIntegratedAskPass=false;},/Integrated Ask Pass/],
    [f=>{f.configuration.git.terminalAuthentication=true;},/fresh isolated VS Code window/],
    [f=>{delete f.configuration.git.terminalAuthentication;},/Terminal Authentication/],
    [f=>{f.configuration.github.gitAuthentication=true;},/does not compete/],
    [f=>{delete f.configuration.github.gitAuthentication;},/GitHub: Git Authentication/],
    [f=>{f.setSession(undefined);},/Sign in to GitHub in Zero/]
  ];
  for (const [change,message] of cases) {
    const f=fixture();change(f);const before=JSON.stringify(f.configuration);await f.bridge.refresh();
    assert.match(f.bridge.status.message,message);assert.equal(f.loads,0);assert.equal(f.captures,0);
    assert.equal(JSON.stringify(f.configuration),before);f.bridge.dispose();
  }
});
test('strict destination validation accepts HTTPS github.com only, with no port or user information', () => {
  for (const value of [host(),host('GITHUB.COM'),host('github.com','https',{path:'/owner/repo.git'})]) assert.equal(githubHTTPSHost(value),true);
  for (const value of [undefined,{},host('github.com','http'),host('github.com','ssh'),host('github.com:443'),host('github.com:80'),host('student@github.com'),host('token:secret@github.com'),host('github.com.evil.test'),host('github.com.'),host(' github.com'),host('github.com\n'),host('github%2ecom'),host('evil.test@github.com'),host('github.com','https',{query:'secret'}),host('github.com','https',{fragment:'x'}),host('github.com','https',{path:'/bad\npath'})]) assert.equal(githubHTTPSHost(value),false,JSON.stringify(value));
});
test('bridge registers once and returns the latest Zero token through one silent capture and synchronous guard', async () => {
  const f=fixture();await f.bridge.refresh();await f.bridge.refresh();
  assert.equal(f.loads,1);assert.equal(f.providers.length,1);assert.equal(f.bridge.status.phase,'ready');
  f.rotateToken('ROTATED_FAKE_TOKEN');await f.bridge.refresh();assert.equal(f.providers.length,1);
  assert.deepEqual(await f.providers[0].getCredentials(host()),{username:'123',password:'ROTATED_FAKE_TOKEN'});
  assert.equal(f.captures,1);assert.equal(f.guards,1);
  assert.match(f.bridge.status.message,/60 seconds/);assert.match(f.bridge.status.message,/helpers may take precedence/);
  assert.doesNotMatch(JSON.stringify(f.notices),/FAKE_TOKEN/);f.bridge.dispose();
});
test('rejected hosts never ask Zero for credentials', async () => {
  const f=fixture();await f.bridge.refresh();
  for (const value of [host('api.github.com'),host('github.com:443'),host('token@github.com'),host('github.com','http')]) assert.equal(await f.providers[0].getCredentials(value),undefined);
  assert.equal(f.captures,0);f.bridge.dispose();
});
test('configuration changes unregister immediately and stale callbacks remain closed after re-enabling', async () => {
  const f=fixture();await f.bridge.refresh();const old=f.providers[0];
  f.configuration.git.terminalAuthentication=true;f.configChanged('git');
  assert.equal(f.registrations[0].disposed,true);assert.equal(await old.getCredentials(host()),undefined);
  f.configuration.git.terminalAuthentication=false;await f.bridge.refresh();
  assert.equal(f.providers.length,2);assert.equal(await old.getCredentials(host()),undefined);
  assert.deepEqual(await f.providers[1].getCredentials(host()),{username:'123',password:'FAKE_ZERO_TOKEN'});
  f.setInspect({globalValue:false});f.configChanged('zero.nativeGitAuthentication');assert.equal(f.registrations[1].disposed,true);
  assert.equal(await f.providers[1].getCredentials(host()),undefined);f.bridge.dispose();
});
test('sign-out, account changes and trust loss block retained callbacks even before refresh', async () => {
  for (const change of [f=>f.setSession(undefined),f=>f.setSession({id:'two',accountId:'456',accessToken:'OTHER_FAKE_TOKEN'}),f=>{f.vscode.workspace.isTrusted=false;}]) {
    const f=fixture();await f.bridge.refresh();change(f);
    assert.equal(await f.providers[0].getCredentials(host()),undefined);assert.equal(f.captures,0);
    await f.bridge.refresh();assert.equal(f.registrations[0].disposed,true);f.bridge.dispose();
  }
});
test('async capture cannot cross sign-out, disposal, policy changes or session/token drift', async () => {
  for (const change of [f=>f.setSession(undefined),f=>f.bridge.dispose(),f=>{f.configuration.github.gitAuthentication=true;},f=>f.rotateToken('REPLACEMENT_FAKE_TOKEN')]) {
    const f=fixture(),gate=deferred();f.captureWith(()=>gate.promise);await f.bridge.refresh();
    const request=f.providers[0].getCredentials(host());change(f);gate.resolve();
    assert.equal(await request,undefined);f.bridge.dispose();
  }
});
test('pending Git activation cannot register after authority changes and trust grant can retry', async () => {
  const gate=deferred();let registrations=0;
  const f=fixture({gitAPI:{registerCredentialsProvider(){registrations++;return {dispose(){}};}}});
  const bridge=createNativeGitAuthentication({vscode:f.vscode,authentication:f.authentication,getGitAPI:()=>gate.promise});
  const startup=bridge.refresh();await Promise.resolve();f.vscode.workspace.isTrusted=false;
  await bridge.refresh();gate.resolve({registerCredentialsProvider(){registrations++;return {dispose(){}};}});await startup;
  assert.equal(registrations,0);bridge.dispose();f.bridge.dispose();
  const next=fixture({trusted:false});await next.bridge.refresh();next.grantTrust();await next.bridge.refresh();
  assert.equal(next.providers.length,1);next.bridge.dispose();
});
test('credential errors and malformed values remain private with no interactive fallback', async () => {
  const f=fixture();await f.bridge.refresh();f.failCapture();
  assert.equal(await f.providers[0].getCredentials(host()),undefined);assert.equal(f.bridge.status.phase,'unavailable');
  assert.doesNotMatch(JSON.stringify(f.notices),/PRIVATE_FAKE_TOKEN/);f.bridge.dispose();
  for (const value of [{id:'one',accountId:'123',accessToken:''},{id:'one',accountId:'123',accessToken:'bad\ntoken'},{id:'one',accountId:'bad\nuser',accessToken:'FAKE'},{id:'one',accountId:'123',accessToken:42}]) {
    const next=fixture();next.setSession(value);await next.bridge.refresh();
    assert.equal(await next.providers[0].getCredentials(host()),undefined);next.bridge.dispose();
  }
});
test('unsupported Git API and activation errors produce fixed actionable status', async () => {
  const f=fixture({gitAPI:{}});await f.bridge.refresh();assert.equal(f.bridge.status.phase,'unavailable');assert.match(f.bridge.status.message,/credentials API/);f.bridge.dispose();
  const next=fixture();const bridge=createNativeGitAuthentication({vscode:next.vscode,authentication:next.authentication,getGitAPI:async()=>{throw new Error('PRIVATE_FAKE_TOKEN');}});
  await bridge.refresh();assert.equal(bridge.status.phase,'unavailable');assert.doesNotMatch(bridge.status.message,/PRIVATE/);bridge.dispose();next.bridge.dispose();
});
test('default loader activates only built-in Git and requests supported API v1', async () => {
  const f=fixture();let activations=0,registered=0;
  f.vscode.extensions={getExtension(id){assert.equal(id,'vscode.git');return {isActive:false,async activate(){activations++;return {getAPI(version){assert.equal(version,1);return {registerCredentialsProvider(){registered++;return {dispose(){}};}};}};}};}};
  const bridge=createNativeGitAuthentication({vscode:f.vscode,authentication:f.authentication});await bridge.refresh();
  assert.equal(activations,1);assert.equal(registered,1);bridge.dispose();f.bridge.dispose();
});
test('default loader retries delayed Git readiness and invalidates on enablement loss', async () => {
  const f=fixture();let enabled=true,ready=false,listener,unsubscribed=0,registrations=0;
  const providers=[],disposals=[];
  const exports={get enabled(){return enabled;},
    onDidChangeEnablement(fn){listener=fn;return {dispose(){unsubscribed++;}};},
    getAPI(){if(!ready)throw Error('Git model not found');return {registerCredentialsProvider(provider){
      registrations++;providers.push(provider);const record={disposed:false,dispose(){this.disposed=true;}};disposals.push(record);return record;
    }};}};
  f.vscode.extensions={getExtension:()=>({isActive:true,exports})};
  const bridge=createNativeGitAuthentication({vscode:f.vscode,authentication:f.authentication});
  await bridge.refresh();assert.equal(bridge.status.phase,'unavailable');assert.equal(registrations,0);
  ready=true;listener(true);await bridge.refresh();assert.equal(bridge.status.phase,'ready');assert.equal(registrations,1);
  assert.deepEqual(await providers[0].getCredentials(host()),{username:'123',password:'FAKE_ZERO_TOKEN'});
  enabled=false;ready=false;listener(false);assert.equal(disposals[0].disposed,true);
  assert.equal(await providers[0].getCredentials(host()),undefined);await bridge.refresh();
  assert.match(bridge.status.message,/Waiting/);assert.equal(registrations,1);
  enabled=true;ready=true;listener(true);await bridge.refresh();assert.equal(registrations,2);
  bridge.dispose();assert.equal(unsubscribed,1);assert.equal(disposals[1].disposed,true);
  listener(true);await bridge.refresh();assert.equal(registrations,2);f.bridge.dispose();
});
test('disposal during Git activation cannot leave a readiness subscription', async () => {
  const f=fixture(),activation=deferred();let subscriptions=0;
  f.vscode.extensions={getExtension:()=>({isActive:false,activate:()=>activation.promise})};
  const bridge=createNativeGitAuthentication({vscode:f.vscode,authentication:f.authentication});
  const loading=bridge.refresh();await Promise.resolve();bridge.dispose();
  activation.resolve({onDidChangeEnablement(){subscriptions++;return {dispose(){}};},getAPI(){assert.fail('Disposed activation must not request API');}});
  await loading;assert.equal(subscriptions,0);f.bridge.dispose();
});
test('real Zero authentication remains silent and its refresh callback does not invalidate a stable registration', async () => {
  const f=fixture();let bridge,session={id:'session',account:{id:'123',label:'student'},accessToken:'FAKE_OWNED_TOKEN'},listener;
  const lookups=[];
  const auth=createAuthentication({async getSession(provider,scopes,options){lookups.push({provider,scopes,options});return session;},onDidChangeSessions(fn){listener=fn;return {dispose(){}};}},()=>{void bridge?.refresh();});
  await auth.refresh();bridge=createNativeGitAuthentication({vscode:f.vscode,authentication:auth,getGitAPI:async()=>({registerCredentialsProvider(provider){f.providers.push(provider);return {dispose(){}};}})});
  await bridge.refresh();assert.deepEqual(await f.providers[0].getCredentials(host()),{username:'123',password:'FAKE_OWNED_TOKEN'});
  assert.equal(lookups.length,2);assert.ok(lookups.every(call=>call.provider==='zero-github'&&call.options.silent===true));
  session=undefined;listener({provider:{id:'zero-github'}});assert.equal(await f.providers[0].getCredentials(host()),undefined);
  bridge.dispose();auth.dispose();f.bridge.dispose();
});
test('disposal closes providers and subscriptions without claiming native cache revocation', async () => {
  const f=fixture();await f.bridge.refresh();f.bridge.dispose();f.bridge.dispose();await f.bridge.refresh();
  assert.equal(f.registrations[0].disposed,true);assert.equal(f.subscriptionDisposals,2);
  assert.equal(await f.providers[0].getCredentials(host()),undefined);assert.equal(f.loads,1);
  assert.match(f.bridge.status.message,/previously returned credential/);
});
