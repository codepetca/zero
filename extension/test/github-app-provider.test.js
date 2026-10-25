'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createGitHubAppProvider}=require('../src/github-app/provider');
const {binding,SECRET_KEY}=require('../src/github-app/credential-store');
const {createAuthentication,ownedProviderApi}=require('../src/authentication');
const {createGitHubAppRepositories}=require('../src/github-app/repositories');
const permissions={metadata:'read',repository_creation:'write',contents:'write',workflows:'write',actions:'write',pages:'write',starring:'write'};
const configuration={appId:123,clientId:'Iv1234567890',owner:'codepetca',slug:'codepet-zero',permissions};
class Emitter{constructor(){this.listeners=new Set();this.event=listener=>{this.listeners.add(listener);return{dispose:()=>this.listeners.delete(listener)}};}fire(value){for(const listener of this.listeners)listener(value);}dispose(){this.listeners.clear();}}
const record=(time=1000000)=>({schema:1,app:binding(configuration),sessionId:'12345678-1234-1234-1234-123456789012',account:{id:'42',label:'learner'},state:'active',accessToken:'ghu_accessabcdefgh',refreshToken:'ghr_refreshabcdefgh',expiresAt:time+500000,refreshExpiresAt:time+15000000});
const pair={access_token:'ghu_newaccessabcdefgh',refresh_token:'ghr_newrefreshabcdefgh',expires_in:28800,refresh_token_expires_in:15897600,token_type:'bearer',scope:''};
const metadata={id:123,client_id:configuration.clientId,slug:configuration.slug,owner:{login:'codepetca'},permissions};
const response=value=>new Response(JSON.stringify(value),{status:200});
async function fixture(t,{saved=record(),overrides={},config=configuration,clock}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'zero-provider-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const events=new Emitter(),data=new Map(saved?[[SECRET_KEY,JSON.stringify(saved)]]:[]),calls=[],diagnostics=[];
 const context={globalStorageUri:{scheme:'file',fsPath:directory},secrets:{onDidChange:events.event,get:async k=>data.get(k),store:async(k,v)=>{data.set(k,v);events.fire({key:k});},delete:async k=>{data.delete(k);events.fire({key:k});}}};
 let cancelListener,time=1000000;const progress=[];
 const vscode={EventEmitter:Emitter,ProgressLocation:{Notification:15},Uri:{parse:value=>value},env:{openExternal:async()=>{assert.fail('Saved-session tests must not open a browser');}},window:{withProgress:async(_options,callback)=>callback({report:value=>progress.push(value)}, {onCancellationRequested:listener=>{cancelListener=listener;return{dispose(){}};},isCancellationRequested:false})}};
 const fetchImpl=async(url,options)=>{calls.push([url,options]);if(overrides.fetch)return overrides.fetch(url,options);if(url.includes('/apps/'))return response(metadata);if(url.endsWith('/user'))return response({id:42,login:'learner',type:'User'});if(url.endsWith('/access_token')){assert.equal(new URLSearchParams(options.body).get('grant_type'),'refresh_token');return response(pair);}assert.fail('Unexpected request '+url);};
 const create=()=>createGitHubAppProvider({vscode,context,configuration:config,fetchImpl,now:clock||(()=>time),onDiagnostic:value=>diagnostics.push(value)});
 const provider=create();t.after(()=>provider.dispose());return{provider,create,vscode,context,data,calls,events,progress,diagnostics,fetchImpl,advance:ms=>{time+=ms;},cancel:()=>cancelListener?.()};
}
test('unconfigured activation leaves local work available and never acquires other provider sessions',async t=>{
 const f=await fixture(t,{config:null});assert.deepEqual(await f.provider.getSessions([]),[]);await assert.rejects(f.provider.createSession([]),error=>error.code==='unconfigured');assert.equal(f.calls.length,0);
});
test('restart returns standard numeric identity session, no OAuth scopes, and signout only clears Zero',async t=>{
 const f=await fixture(t);f.data.set('other.extension','preserve');const [session]=await f.provider.getSessions([]);assert.equal(session.account.id,'42');assert.deepEqual(session.scopes,[]);assert.equal(session.accessToken,'ghu_accessabcdefgh');
 const second=f.create();t.after(()=>second.dispose());assert.deepEqual(await second.getSessions([]),[session]);await f.provider.removeSession('other-session');assert(f.data.has(SECRET_KEY));await f.provider.removeSession(session.id);assert.equal(f.data.get('other.extension'),'preserve');assert.equal(f.data.has(SECRET_KEY),false);assert.deepEqual(await second.getSessions([]),[]);await assert.rejects(f.provider.getSessions(['repo']),error=>error.code==='unsupported-scopes');
});
test('secret changes invalidate immediately; repeated empty reads do not cause event loops',async t=>{
 const f=await fixture(t);await f.provider.getSessions([]);const events=[];f.provider.onDidChangeSessions(value=>events.push(value));f.events.fire({key:SECRET_KEY});assert.equal(events.length,1);assert.equal(events[0].removed[0].account.id,'42');await f.context.secrets.delete(SECRET_KEY);const count=events.length;await f.provider.getSessions([]);await f.provider.getSessions([]);assert.equal(events.length,count);
});
test('App metadata id/client/owner/permission tampering prevents browser sign-in',async t=>{
 for(const changed of [{id:456},{client_id:'Ivattacker'},{owner:{login:'evil'}},{permissions:{...permissions,administration:'write'}}]){
 const f=await fixture(t,{saved:null,overrides:{fetch:async url=>{assert(url.includes('/apps/'));return response({...metadata,...changed});}}});await assert.rejects(f.provider.createSession([]),error=>error.code==='app-mismatch');assert.equal(f.calls.length,1);assert.equal(f.data.has(SECRET_KEY),false);
 }
});
test('missing browser configuration never falls back to device authorization',async t=>{
 const f=await fixture(t,{saved:null});
 await assert.rejects(f.provider.createSession([]),error=>error.code==='browser-unavailable'&&!/using a code/.test(error.message));
 assert.equal(f.calls.length,1);assert.ok(f.calls[0][0].includes('/apps/'));assert.equal(f.data.has(SECRET_KEY),false);
});
test('account drift removes credentials; mutable username updates preserve numeric account',async t=>{
 const f=await fixture(t,{overrides:{fetch:async url=>response(url.includes('/apps/')?metadata:{id:99,login:'learner',type:'User'})}});await assert.rejects(f.provider.getSessions([]),error=>error.code==='account-changed');assert.equal(f.data.has(SECRET_KEY),false);
 const renamed=await fixture(t,{overrides:{fetch:async url=>response(url.includes('/apps/')?metadata:{id:42,login:'new-name',type:'User'})}});assert.equal((await renamed.provider.getSessions([]))[0].account.label,'new-name');assert.equal(JSON.parse(renamed.data.get(SECRET_KEY)).account.id,'42');
});
test('two windows refresh once and reread the winning atomic pair',async t=>{
 const f=await fixture(t,{saved:{...record(),expiresAt:999999}});const second=f.create();t.after(()=>second.dispose());
 const [a,b]=await Promise.all([f.provider.getSessions([]),second.getSessions([])]);assert.equal(a[0].accessToken,pair.access_token);assert.equal(b[0].accessToken,pair.access_token);assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,1);const saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.refreshToken,pair.refresh_token);assert.equal(saved.state,'active');
});
test('saved device sessions keep their family, identity and legacy renewal route',async t=>{
 for(const flow of [undefined,'device']){
  const saved={...record(),...(flow?{flow}:{})},f=await fixture(t,{saved});
  assert.equal((await f.provider.getSessions([]))[0].accessToken,saved.accessToken);
  assert.equal(f.calls.some(([url])=>url.endsWith('/access_token')),false);
  f.advance(500000);const [renewed]=await f.provider.getSessions([]);
  assert.equal(renewed.id,saved.sessionId);assert.deepEqual(renewed.account,saved.account);assert.equal(renewed.accessToken,pair.access_token);
  const stored=JSON.parse(f.data.get(SECRET_KEY));assert.equal(stored.flow,flow);assert.equal(stored.refreshToken,pair.refresh_token);
  const rotations=f.calls.filter(([url])=>url==='https://github.com/login/oauth/access_token');assert.equal(rotations.length,1);
  const fields=new URLSearchParams(rotations[0][1].body);assert.equal(fields.get('grant_type'),'refresh_token');assert.equal(fields.get('refresh_token'),saved.refreshToken);
  assert.equal(f.calls.some(([url])=>url.includes('/device/')||url.includes('/api/desktop/')),false);
 }
});
test('provider remains busy throughout silent rotating renewal and account removal',async t=>{
 let release,started;
 const rotating=new Promise(resolve=>{started=resolve;});
 const f=await fixture(t,{saved:{...record(),expiresAt:999999},overrides:{fetch:async url=>{
  if(url.endsWith('/access_token')){started();await new Promise(resolve=>{release=resolve;});return response(pair);}
  return response(url.includes('/apps/')?metadata:{id:42,login:'learner',type:'User'});
 }}});
 const pending=f.provider.getSessions([]);assert.equal(f.provider.busy,true);
 await rotating;assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'refreshing');assert.equal(f.provider.busy,true);
 release();await pending;assert.equal(f.provider.busy,false);assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'active');
 const remove=f.context.secrets.delete;let finishDelete,deleteStarted;
 const deleting=new Promise(resolve=>{deleteStarted=resolve;});
 f.context.secrets.delete=async key=>{deleteStarted();await new Promise(resolve=>{finishDelete=resolve;});return remove(key);};
 const removal=f.provider.removeSession(record().sessionId);assert.equal(f.provider.busy,true);
 await deleting;assert.equal(f.provider.busy,true);finishDelete();await removal;
 assert.equal(f.provider.busy,false);assert.equal(f.data.has(SECRET_KEY),false);
});
test('automatic update reload waits for real provider rotation and leaves its new pair active',async t=>{
 const {createNativeUpdateReload}=require('../src/native-update-reload');
 let release,started;const rotating=new Promise(resolve=>{started=resolve;});
 const f=await fixture(t,{saved:{...record(),expiresAt:999999},overrides:{fetch:async url=>{
  if(url.endsWith('/access_token')){started();await new Promise(resolve=>{release=resolve;});return response(pair);}
  return response(url.includes('/apps/')?metadata:{id:42,login:'learner',type:'User'});
 }}});
 const auth=integratedAuthentication(f,t),renewal=auth.refresh();await rotating;
 let reloads=0;
 const home='/private/isolated-home';
 const reload=createNativeUpdateReload({commands:{executeCommand:async id=>{assert.equal(id,'workbench.action.reloadWindow');reloads++;f.provider.dispose();}}},{
  context:{extensionPath:home+'/Library/Application Support/Zero/editor/extensions/zero.zero-0.5.34',extension:{packageJSON:{version:'0.5.34'}}},
  platform:'darwin',home,realpath:async value=>value,read:async()=>({schema:1,version:'0.5.35',requestId:'00000000-0000-0000-0000-000000000001'}),
  isBusy:()=>auth.busy||f.provider.busy,setTimer:()=>0,clearTimer:()=>{}
 });
 t.after(()=>reload.dispose());assert.equal(await reload.ready,false);assert.equal(reloads,0);assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'refreshing');
 release();await renewal;const deadline=Date.now()+5000;
 while(auth.busy||f.provider.busy){assert.ok(Date.now()<deadline);await new Promise(resolve=>setImmediate(resolve));}
 assert.equal(await reload.check(),true);assert.equal(reloads,1);
 const saved=JSON.parse(f.data.get(SECRET_KEY));assert.equal(saved.state,'active');assert.equal(saved.refreshToken,pair.refresh_token);
});
test('unknown rotation outcome persists reconnect state and restart never retries old refresh',async t=>{
 let rotations=0;const f=await fixture(t,{saved:{...record(),expiresAt:999999},overrides:{fetch:async url=>{if(url.endsWith('/access_token')){rotations++;throw Error('ghr_do_not_leak');}return response(metadata);}}});
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='reconnect-required'&&!error.message.includes('do_not_leak'));assert.equal(JSON.parse(f.data.get(SECRET_KEY)).state,'reconnect');assert.deepEqual(await f.provider.getSessions([]),[]);
 const second=f.create();t.after(()=>second.dispose());assert.deepEqual(await second.getSessions([]),[]);assert.equal(rotations,1);
});
test('crash marker, expired refresh and malformed secret require reconnection without network',async t=>{
 for(const saved of [{...record(),state:'refreshing'},{...record(),expiresAt:100,refreshExpiresAt:999999}]){const f=await fixture(t,{saved});assert.deepEqual(await f.provider.getSessions([]),[]);assert.equal(f.calls.length,0);}
 const f=await fixture(t);f.data.set(SECRET_KEY,'ghu_invalid secret');await assert.rejects(f.provider.getSessions([]),error=>error.code==='invalid-credentials'&&!error.message.includes('ghu_'));assert.equal(f.calls.length,0);
});

test('revoked connection clears only the Zero secret',async t=>{
 const f=await fixture(t,{overrides:{fetch:async url=>url.endsWith('/user')?new Response('token details must not leak',{status:401}):response(metadata)}});f.data.set('other.extension','keep');
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='unauthorized'&&!error.message.includes('token details'));assert.equal(f.data.has(SECRET_KEY),false);assert.equal(f.data.get('other.extension'),'keep');
});
test('rotation persisted despite uncertain storage acknowledgement is reread and retained',async t=>{
 const f=await fixture(t,{saved:{...record(),expiresAt:999999}});const store=f.context.secrets.store;
 f.context.secrets.store=async(key,value)=>{await store(key,value);const saved=JSON.parse(value);if(saved.state==='active'&&saved.refreshToken===pair.refresh_token)throw Error('storage acknowledgement lost');};
 assert.equal((await f.provider.getSessions([]))[0].accessToken,pair.access_token);assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,1);
});
test('a secret change while identity is in flight cannot resurrect the previous session',async t=>{
 let fixtureValue;const f=await fixture(t,{overrides:{fetch:async url=>{if(url.includes('/apps/'))return response(metadata);await fixtureValue.context.secrets.delete(SECRET_KEY);return response({id:42,login:'learner',type:'User'});}}});fixtureValue=f;
 await assert.rejects(f.provider.getSessions([]),error=>error.code==='connection-changed');assert.equal(f.data.has(SECRET_KEY),false);
});
test('existing connection metadata uses its valid token, caches success briefly and refreshes before checking expired credentials',async t=>{
 const f=await fixture(t);await f.provider.getSessions([]);await f.provider.getSessions([]);
 let checks=f.calls.filter(([url])=>url.includes('/apps/'));assert.equal(checks.length,1);assert.equal(checks[0][1].headers.Authorization,'Bearer '+record().accessToken);
 f.advance(60001);await f.provider.getSessions([]);checks=f.calls.filter(([url])=>url.includes('/apps/'));assert.equal(checks.length,2);
 const g=await fixture(t,{saved:{...record(),expiresAt:999999}});await g.provider.getSessions([]);
 assert(g.calls[0][0].endsWith('/access_token'),'Renew before any metadata request');const metadataCall=g.calls.find(([url])=>url.includes('/apps/'));assert.equal(metadataCall[1].headers.Authorization,'Bearer '+pair.access_token);
});
test('metadata cache binds the complete pinned configuration and never caches a mismatch',async t=>{
 const config={...configuration,permissions:{...permissions}};const f=await fixture(t,{config});await f.provider.getSessions([]);
 config.permissions.administration='write';
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(f.provider.getSessions([]),error=>error.code==='app-mismatch');
 assert.equal(f.calls.filter(([url])=>url.includes('/apps/')).length,3);assert.ok(f.calls.every(([,options])=>options.headers.Authorization==='Bearer '+record().accessToken));
});
function integratedAuthentication(f,t) {
 const auth=createAuthentication(ownedProviderApi(f.provider));
 t.after(()=>auth.dispose());return auth;
}
test('actual provider, facade and repository access have a bounded authenticated metadata request budget',async t=>{
 const repo={id:75,name:'project',full_name:'learner/project',owner:{id:42,login:'learner',type:'User'},html_url:'https://github.com/learner/project',clone_url:'https://github.com/learner/project.git',default_branch:'main',private:true,permissions:{push:true}};
 const installation={id:65,app_id:123,app_slug:configuration.slug,account:{id:42,type:'User'},target_type:'User',repository_selection:'selected',suspended_at:null,permissions};
 const f=await fixture(t,{overrides:{fetch:async url=>{
  if(url.includes('/apps/'))return response(metadata);
  if(url.endsWith('/user'))return response({id:42,login:'learner',type:'User'});
  if(url.includes('/user/installations?'))return response({installations:[installation]});
  if(url.includes('/user/installations/65/repositories?'))return response({repositories:[repo]});
  if(url.endsWith('/repos/learner/project'))return response(repo);
  throw Error('Unexpected request');
 }}});
 const authentication=integratedAuthentication(f,t),repositories=createGitHubAppRepositories({authentication,configuration,fetchImpl:f.fetchImpl});
 assert.equal((await repositories.access(repo.html_url)).repository.id,75);
 assert.equal(f.calls.filter(([url])=>url.includes('/apps/')).length,1);
 assert.equal(f.calls.filter(([,options])=>!options.headers.Authorization).length,0,'Existing sessions spend no anonymous IP quota');
 assert(f.calls.length<=14,`One repository check unexpectedly used ${f.calls.length} requests`);
});
test('integrated metadata mismatch stops repository work and is retried rather than cached',async t=>{
 const f=await fixture(t,{overrides:{fetch:async url=>{assert(url.includes('/apps/'));return response({...metadata,id:999});}}});
 const authentication=integratedAuthentication(f,t),repositories=createGitHubAppRepositories({authentication,configuration,fetchImpl:f.fetchImpl});
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(repositories.access('https://github.com/learner/project'),/Sign in to GitHub/);
 assert.equal(f.calls.length,2);assert.ok(f.calls.every(([,options])=>options.headers.Authorization==='Bearer '+record().accessToken));
});

test('lock repair diagnostic reaches Zero Output callback even when authentication facade sanitizes its error',async t=>{
 let time=1000000;const f=await fixture(t,{clock:()=>time+=10000});
 await fs.writeFile(path.join(f.context.globalStorageUri.fsPath,'github-app-refresh.lock'),'{}');
 await fs.writeFile(path.join(f.context.globalStorageUri.fsPath,'github-app-refresh.recovery.lock'),'');
 const auth=integratedAuthentication(f,t);
 await auth.refresh();assert.equal(auth.signedIn,false);assert.ok(f.diagnostics.length>0);assert.match(f.diagnostics[0],/https:\/\/github.com\/codepetca\/zero\/blob\/main\/docs\/ZERO-AUTH-RECOVERY.md/);assert.ok(f.diagnostics[0].includes(f.context.globalStorageUri.fsPath));
});

test('reviewed optional Pages setup permission supports staged rollout without accepting other grants',async t=>{
 const config={...configuration,optionalPermissions:{administration:'write'}};
 for(const added of [{},{administration:'write'}]){
  const f=await fixture(t,{config,overrides:{fetch:async url=>response(url.includes('/apps/')?{...metadata,permissions:{...permissions,...added}}:{id:42,login:'learner',type:'User'})}});
  assert.equal((await f.provider.getSessions([]))[0].account.id,'42');
 }
 for(const changed of [{administration:'read'},{administration:'write',issues:'write'},{pages:'read'}]){
  const f=await fixture(t,{config,overrides:{fetch:async()=>response({...metadata,permissions:{...permissions,...changed}})}});
  await assert.rejects(f.provider.getSessions([]),error=>error.code==='app-mismatch');
 }
});

test('captured operation reuses verified identity, rereads locked storage and keeps standard lookups strong',async t=>{
 const f=await fixture(t),auth=integratedAuthentication(f,t);
 await auth.refresh();while(auth.busy)await new Promise(resolve=>setImmediate(resolve));
 const ticket=await auth.capture();
 let reads=0;const get=f.context.secrets.get;
 f.context.secrets.get=async key=>{reads++;await fs.access(path.join(f.context.globalStorageUri.fsPath,'github-app-refresh.lock'));return get(key);};
 const users=()=>f.calls.filter(([url])=>url.endsWith('/user')).length;
 const before=users();
 for(let i=0;i<25;i++)assert.equal((await auth.assertCurrent(ticket)).accountId,'42');
 assert.equal(users(),before,'An unchanged operation must not repeatedly query /user');
 assert.equal(reads,50,'Each assertion rereads storage while locked, including its final drift check');
 f.advance(60001);await auth.assertCurrent(ticket);
 assert.equal(users(),before);assert.equal(f.calls.filter(([url])=>url.includes('/apps/')).length,2,'App metadata retains its existing bounded freshness policy');
 await auth.capture();assert.equal(users(),before+1,'A new operation verifies remote identity');
 await f.provider.getSessions([]);assert.equal(users(),before+2,'Standard provider lookups still verify remotely');
});

test('only the exact session returned by remote verification can use the private operation path',async t=>{
 const f=await fixture(t),[verified]=await f.provider.getSessions([]);
 const users=()=>f.calls.filter(([url])=>url.endsWith('/user')).length;
 assert.equal(users(),1);await f.provider.getSessionsForOperation(verified,[]);assert.equal(users(),1);
 await f.provider.getSessionsForOperation({...verified},[]);assert.equal(users(),2,'Copied session fields do not carry the private receipt');
 await assert.rejects(f.provider.getSessionsForOperation(verified,['repo']),error=>error.code==='unsupported-scopes');
 assert.deepEqual(await f.provider.getSessionsForOperation(verified,[],{account:{id:'99'}}),[]);
});

test('unannounced record drift cannot reuse a verified operation even when its access token is unchanged',async t=>{
 const mutations=[
  value=>({...value,sessionId:'22345678-1234-1234-1234-123456789012'}),
  value=>({...value,account:{id:'99',label:'other'}}),
  value=>({...value,account:{...value.account,label:'renamed'}}),
  value=>({...value,accessToken:'ghu_changedabcdefgh'}),
  value=>({...value,refreshToken:'ghr_changedabcdefgh'}),
  value=>({...value,expiresAt:value.expiresAt+1}),
  value=>({...value,flow:'browser'}),
  value=>({...value,state:'reconnect'})
 ];
 for(const mutate of mutations){
  const f=await fixture(t),[verified]=await f.provider.getSessions([]);
  f.data.set(SECRET_KEY,JSON.stringify(mutate(record())));
  const result=await f.provider.getSessionsForOperation(verified,[]).catch(error=>error);
  assert.ok(result.code==='connection-changed'||Array.isArray(result)&&result.length===0);
  assert.equal(f.calls.filter(([url])=>url.endsWith('/user')).length,1,'Drift requires a new operation, never silent identity reuse');
 }
});

test('storage failures, silent deletion, configuration changes and secret events reject existing receipts',async t=>{
 for(const kind of ['storage','deleted','malformed','configuration','event']){
  const config={...configuration,permissions:{...permissions}},f=await fixture(t,{config});
  const [verified]=await f.provider.getSessions([]);
  if(kind==='storage')f.context.secrets.get=async()=>{throw Error('private storage details');};
  if(kind==='deleted')f.data.delete(SECRET_KEY);
  if(kind==='malformed')f.data.set(SECRET_KEY,'invalid');
  if(kind==='configuration')config.permissions.administration='write';
  if(kind==='event')f.events.fire({key:SECRET_KEY});
  const result=await f.provider.getSessionsForOperation(verified,[]).catch(error=>error);
  assert.ok(result instanceof Error||Array.isArray(result)&&result.length===0,kind);
  assert.equal(f.calls.filter(([url])=>url.endsWith('/user')).length,1,kind);
 }
});

test('operation checks renew expiring tokens and invalidate the captured facade ticket',async t=>{
 const f=await fixture(t),auth=integratedAuthentication(f,t);
 await auth.refresh();while(auth.busy)await new Promise(resolve=>setImmediate(resolve));
 const ticket=await auth.capture();f.advance(450000);
 await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);
 assert.equal(f.calls.filter(([url])=>url.endsWith('/access_token')).length,1);
 assert.equal(JSON.parse(f.data.get(SECRET_KEY)).accessToken,pair.access_token);
});

test('new capture detects server revocation while local operation rereads make no revocation claim',async t=>{
 let revoked=false;
 const f=await fixture(t,{overrides:{fetch:async url=>{
  if(url.includes('/apps/'))return response(metadata);
  return revoked?new Response('',{status:401}):response({id:42,login:'learner',type:'User'});
 }}}),auth=integratedAuthentication(f,t);
 await auth.refresh();while(auth.busy)await new Promise(resolve=>setImmediate(resolve));
 const ticket=await auth.capture();revoked=true;
 await auth.assertCurrent(ticket);
 await assert.rejects(auth.capture(),/Sign in to GitHub/);
 assert.equal(f.data.has(SECRET_KEY),false);assert.throws(()=>auth.assertCurrentNow(ticket),/account or sign-in changed/);
});

test('signout and disposal during an operation storage read cannot return its verified session',async t=>{
 for(const action of ['signout','dispose']){
  const f=await fixture(t),[verified]=await f.provider.getSessions([]);
  const get=f.context.secrets.get;let started,release;
  const waiting=new Promise(resolve=>{started=resolve;});let once=true;
  f.context.secrets.get=async key=>{const value=await get(key);if(once){once=false;started();await new Promise(resolve=>{release=resolve;});}return value;};
  const checking=f.provider.getSessionsForOperation(verified,[]);await waiting;
  let removal;
  if(action==='signout')removal=f.provider.removeSession(verified.id);else f.provider.dispose();
  release();await assert.rejects(checking,error=>['cancelled','disposed'].includes(error.code));
  if(removal)await removal;
  assert.equal(f.provider.busy,false);assert.deepEqual(await f.provider.getSessionsForOperation(verified,[]),[]);
 }
});

test('a storage event during the final operation reread invalidates immediately before returning',async t=>{
 const f=await fixture(t),auth=integratedAuthentication(f,t);
 await auth.refresh();while(auth.busy)await new Promise(resolve=>setImmediate(resolve));
 const ticket=await auth.capture(),get=f.context.secrets.get;let reads=0;
 f.context.secrets.get=async key=>{const value=await get(key);if(++reads===2)f.events.fire({key:SECRET_KEY});return value;};
 await assert.rejects(auth.assertCurrent(ticket),/account or sign-in changed/);
});

test('explicit signout invalidates facade tickets before storage removal finishes',async t=>{
 const f=await fixture(t),auth=integratedAuthentication(f,t);
 await auth.refresh();while(auth.busy)await new Promise(resolve=>setImmediate(resolve));
 const ticket=await auth.capture(),remove=f.context.secrets.delete;let started,release;
 const waiting=new Promise(resolve=>{started=resolve;});
 f.context.secrets.delete=async key=>{started();await new Promise(resolve=>{release=resolve;});return remove(key);};
 const pending=f.provider.removeSession(ticket.session.id);
 assert.throws(()=>auth.assertCurrentNow(ticket),/account or sign-in changed/);
 await waiting;assert.equal(f.data.has(SECRET_KEY),true);release();await pending;
 while(auth.busy)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(auth.signedIn,false);assert.equal(f.data.has(SECRET_KEY),false);
});
