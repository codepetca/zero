'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGitHubAppRepositories}=require('../src/github-app/repositories');
const configuration={appId:41,slug:'zero-development',owner:'codepetca'};
const token='SECRET_FOR_FAKE_API_ONLY';
function fixture() {
  let active=true,created=false,postFailure,postStatus,visibility=false,postHook;
  const session={id:'one',accountId:'17',label:'student',accessToken:token};
  const ticket={session,revision:1};
  const authentication={capture:async()=>{if(!active)throw Error('account changed');return ticket;},assertCurrent:async value=>{if(!active||value!==ticket)throw Error('account changed');return session;},assertCurrentNow:value=>{if(!active||value!==ticket)throw Error('account changed');return session;}};
  const repo={id:32,name:'project',full_name:'student/project',owner:{id:17,login:'student',type:'User'},html_url:'https://github.com/student/project',clone_url:'https://github.com/student/project.git',default_branch:'main',private:true,permissions:{push:true}};
  const installed={id:51,app_id:41,app_slug:'zero-development',account:{id:17,type:'User'},target_type:'User',repository_selection:'selected',suspended_at:null,permissions:{contents:'write',repository_creation:'write',workflows:'write',actions:'write',pages:'write'}};
  let installations=[installed],members=[repo],user={id:17,login:'student',type:'User'},template={full_name:'codepetca/zero-tutorial-game',private:false,is_template:true};
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.cache,'no-store');
    const route=url.slice('https://api.github.com'.length);
    let data,status=200;
    if(route==='/user')data=user;
    else if(route.startsWith('/user/installations?'))data={installations};
    else if(route.startsWith('/user/installations/51/repositories?'))data={repositories:members};
    else if(route==='/repos/codepetca/zero-tutorial-game'&&options.method==='GET')data=template;
    else if(options.method==='POST') {
      if(postHook)await postHook();
      if(postFailure)throw Error(token);
      created=true;status=postStatus||201;repo.private=visibility;data={...repo};
    } else if(route==='/repos/student/project') {data=repo;if(!created&&calls.some(call=>call.url.endsWith('/user')))status=404;}
    else throw Error('Unexpected fake request '+route);
    return {status,ok:status<400,json:async()=>data};
  };
  const api=createGitHubAppRepositories({authentication,configuration,fetchImpl,now:()=>123});
  return {api,calls,repo,installed,ticket,authentication,fetchImpl,set active(value){active=value;},set members(value){members=value;},set installations(value){installations=value;},set user(value){user=value;},set template(value){template=value;},set created(value){created=value;},set postFailure(value){postFailure=value;},set postStatus(value){postStatus=value;},set visibility(value){visibility=value;},set postHook(value){postHook=value;}};
}
test('setup accepts an empty selected installation or existing all access using only account and installation GETs',async()=>{
 for(const selection of ['selected','all']) {
  const f=fixture();f.members=[];f.installed.repository_selection=selection;
  const result=await f.api.checkSetup();
  assert.equal(result.ticket,f.ticket);assert.equal(result.installation.id,51);assert.equal(result.installation.repository_selection,selection);assert.equal(result.checkedAt,123);
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.installation));
  assert.deepEqual(f.calls.map(call=>new URL(call.url).pathname),['/user','/user/installations']);
  assert.ok(f.calls.every(call=>call.options.method==='GET'&&!call.options.body));
 }
});
test('setup requires the pinned App on the same numeric personal account with both create and save permissions',async()=>{
 for(const change of [
  f=>{f.installations=[];},f=>{f.installed.app_id=42;},f=>{f.installed.app_slug='other';},
  f=>{f.installed.account.id=18;},f=>{f.installed.account.id='17';},
  f=>{f.installed.account.type='Organization';},f=>{f.installed.target_type='Organization';},
  f=>{f.installed.suspended_at='today';},f=>{f.installed.id=0;},f=>{f.installed.repository_selection='unknown';},
  f=>{f.installed.permissions.contents='read';},f=>{delete f.installed.permissions.contents;},
  f=>{f.installed.permissions.repository_creation='read';},f=>{delete f.installed.permissions.repository_creation;},
  f=>{f.installed.permissions=null;}
 ]) {
  const f=fixture();change(f);
  await assert.rejects(f.api.checkSetup(),error=>['installation-required','permission-required'].includes(error.code)&&error.actionUrl==='https://github.com/apps/zero-development/installations/new'&&error.message.startsWith('Allow Zero to create and save projects on your personal GitHub account')&&!/select the repository|Install Zero/.test(error.message));
  assert.ok(f.calls.every(call=>call.options.method==='GET'));
  assert.ok(!f.calls.some(call=>new URL(call.url).pathname.endsWith('/repositories')));
 }
});
test('setup rejects a different, organization or malformed authenticated account before reading installations',async()=>{
 for(const user of [null,{id:18,login:'student',type:'User'},{id:'17',login:'student',type:'User'},{id:17,login:'student',type:'Organization'},{id:17,login:'bad/name',type:'User'}]) {
  const f=fixture();f.user=user;
  await assert.rejects(f.api.checkSetup(),error=>error.code==='account-mismatch');
  assert.deepEqual(f.calls.map(call=>new URL(call.url).pathname),['/user']);
 }
});
test('setup rejects malformed and conflicting installation responses safely',async()=>{
 for(const installations of [null,{},[null],[[]],Array(101).fill({}),[fixture().installed,fixture().installed]]) {
  const f=fixture();f.installations=installations;
  await assert.rejects(f.api.checkSetup(),error=>error.code==='invalid-response'&&!error.message.includes(token));
  assert.ok(f.calls.every(call=>call.options.method==='GET'));
 }
});
test('setup reuses a supplied account ticket and refuses drift without recapturing',async()=>{
 const f=fixture();f.authentication.capture=async()=>{throw Error('must not capture');};
 assert.equal((await f.api.checkSetup({ticket:f.ticket})).ticket,f.ticket);
 const g=fixture();g.authentication.capture=async()=>{throw Error('must not capture');};g.active=false;
 await assert.rejects(g.api.checkSetup({ticket:g.ticket}),/account changed/);assert.equal(g.calls.length,0);
 for(const driftAfter of [1,2]) {
  const h=fixture();let calls=0;
  const api=createGitHubAppRepositories({authentication:h.authentication,configuration,fetchImpl:async(...args)=>{const response=await h.fetchImpl(...args);if(++calls===driftAfter)h.active=false;return response;}});
  await assert.rejects(api.checkSetup(),/account changed/);assert.equal(calls,driftAfter);
 }
});
test('setup cancellation stops before credentials, between reads and during a request',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 f.authentication.capture=async()=>{throw Error('must not capture');};
 await assert.rejects(f.api.checkSetup({signal:controller.signal}),error=>error.code==='cancelled');assert.equal(f.calls.length,0);
 for(const failRequest of [false,true]) {
  const g=fixture(),abort=new AbortController();let calls=0;
  const api=createGitHubAppRepositories({authentication:g.authentication,configuration,fetchImpl:async(...args)=>{calls++;abort.abort();if(failRequest)throw Error('aborted');return g.fetchImpl(...args);}});
  await assert.rejects(api.checkSetup({signal:abort.signal}),error=>error.code==='cancelled');assert.equal(calls,1);
 }
});
test('access proves personal owner, pinned App installation and explicit selected repository membership',async()=>{
 const f=fixture(),result=await f.api.access(f.repo.html_url,{permissions:{contents:'write',workflows:'write',actions:'write',pages:'read'}});
 assert.equal(result.repository.id,32);assert.equal(result.installation.id,51);assert.equal(result.ticket,f.ticket);assert.equal(result.checkedAt,123);
 assert.deepEqual(f.calls.map(call=>new URL(call.url).pathname),['/user/installations','/repos/student/project','/user/installations/51/repositories']);
 assert.ok(f.calls.every(call=>call.options.method==='GET'));
});
test('public push permission alone, another App, another account, suspension and missing capabilities do not grant access',async()=>{
 for(const change of [f=>{f.members=[];},f=>{f.installed.app_id=42;},f=>{f.installed.app_slug='other';},f=>{f.installed.account.id=18;},f=>{f.installed.suspended_at='today';},f=>{f.installed.permissions.contents='read';},f=>{f.repo.owner.id=18;},f=>{f.repo.owner.type='Organization';},f=>{f.repo.permissions.push=false;}]) {
   const f=fixture();change(f);await assert.rejects(f.api.access(f.repo.html_url));assert.equal(f.calls.some(call=>call.options.method==='POST'),false);
 }
});
test('membership is checked by immutable repository ID with consistent owner and destination',async()=>{
 for(const item of [{id:33},{owner:{id:18,type:'User',login:'student'}},{clone_url:'https://evil.invalid/project.git'}]) {
  const f=fixture();f.members=[{...f.repo,...item}];await assert.rejects(f.api.access(f.repo.html_url));
 }
});
test('read-only clone access accepts Contents read while write operations reject it',async()=>{
 const f=fixture();f.installed.permissions.contents='read';f.repo.permissions.push=false;
 await f.api.access(f.repo.html_url,{permissions:{contents:'read'}});await assert.rejects(f.api.access(f.repo.html_url),/permissions/);
});
test('already all-repository installation is observed without requesting or changing its selection',async()=>{
 const f=fixture();f.installed.repository_selection='all';await f.api.access(f.repo.html_url);assert.ok(f.calls.every(call=>call.options.method==='GET'));
});
test('invalid or unconfigured input and cancellation request no credentials or network',async()=>{
 const f=fixture();
 await assert.rejects(createGitHubAppRepositories({authentication:f.authentication,configuration:null,fetchImpl:f.fetchImpl}).access(f.repo.html_url),/not configured/);
 await assert.rejects(f.api.access('https://evil.invalid/student/project'));
 const controller=new AbortController();controller.abort();await assert.rejects(f.api.access(f.repo.html_url,{signal:controller.signal}));
 await assert.rejects(f.api.create({name:'project'}));await assert.rejects(f.api.create({name:'project',private:true}),error=>error.code==='invalid-project');await assert.rejects(f.api.create({name:'../project',private:false}));assert.equal(f.calls.length,0);
});
test('create uses narrow repository creation, public visibility and verified post-create membership',async()=>{
 const f=fixture(),result=await f.api.create({name:'project',private:false});assert.equal(result.created,true);assert.equal(result.repository.id,32);
 const posts=f.calls.filter(call=>call.options.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].url,'https://api.github.com/user/repos');
 assert.deepEqual(JSON.parse(posts[0].options.body),{name:'project',private:false,auto_init:false});
 assert.ok(!f.calls.some(call=>/installations\/repositories|\/installation\/repositories/.test(call.url)));
});
test('template creation accepts only a verified public Codepet scaffold and uses the fixed generate route',async()=>{
 const f=fixture();await f.api.create({name:'project',private:false,template:{owner:'codepetca',repo:'zero-tutorial-game'}});
 const post=f.calls.find(call=>call.options.method==='POST');assert.equal(post.url,'https://api.github.com/repos/codepetca/zero-tutorial-game/generate');assert.deepEqual(JSON.parse(post.options.body),{name:'project',private:false,owner:'student',include_all_branches:false});
 for(const template of [{owner:'attacker',repo:'zero-tutorial-game'},{owner:'codepetca',repo:'../x'},{owner:'codepetca',repo:'zero-tutorial-game',url:'https://evil.invalid'}])await assert.rejects(f.api.create({name:'project',private:false,template}));
 for(const change of [{is_template:false},{private:true}]) {const g=fixture();g.template={full_name:'codepetca/zero-tutorial-game',private:false,is_template:true,...change};await assert.rejects(g.api.create({name:'project',private:false,template:{owner:'codepetca',repo:'zero-tutorial-game'}}));assert.ok(g.calls.every(call=>call.options.method==='GET'));}
});
test('existing destination is never silently adopted or modified',async()=>{
 const f=fixture();f.created=true;await assert.rejects(f.api.create({name:'project',private:false}),error=>error.code==='repository-exists'&&error.repositoryUrl===f.repo.html_url);
 assert.ok(f.calls.every(call=>call.options.method==='GET'));
});
test('lost creation response gives a redacted recovery URL and never retries its POST',async()=>{
 const f=fixture();f.postFailure=true;
 for(let attempt=0;attempt<2;attempt++)await assert.rejects(f.api.create({name:'project',private:false}),error=>error.code==='creation-uncertain'&&error.repositoryUrl===f.repo.html_url&&!error.message.includes(token));
 assert.equal(f.calls.filter(call=>call.options.method==='POST').length,1);
 f.postFailure=false;f.created=true;const recovered=await f.api.access(f.repo.html_url);assert.equal(recovered.repository.id,32);
});
test('post-create membership failure, wrong visibility and identity drift preserve uncertainty',async()=>{
 for(const change of [f=>{f.members=[];},f=>{f.visibility=true;},f=>{f.postHook=async()=>{f.active=false;};}]) {
  const f=fixture();change(f);await assert.rejects(f.api.create({name:'project',private:false}),error=>error.code==='creation-uncertain');assert.equal(f.calls.filter(call=>call.options.method==='POST').length,1);
 }
});
test('definitive rejected create is reported without leaking raw provider details',async()=>{
 const f=fixture();f.postStatus=422;await assert.rejects(f.api.create({name:'project',private:false}),error=>error.status===422&&!error.message.includes(token));
});
test('session change between installation and repository read stops further requests',async()=>{
 const f=fixture();let calls=0;
 const api=createGitHubAppRepositories({authentication:f.authentication,configuration,fetchImpl:async(...args)=>{const response=await f.fetchImpl(...args);if(++calls===1)f.active=false;return response;}});
 await assert.rejects(api.access(f.repo.html_url),/account changed/);assert.equal(calls,1);
});
test('creation reuses the reviewed form ticket and refuses drift without capturing a replacement',async()=>{
 const f=fixture();f.authentication.capture=async()=>{throw Error('must not capture');};
 const result=await f.api.create({name:'project',private:false},{ticket:f.ticket});assert.equal(result.ticket,f.ticket);
 const g=fixture();g.authentication.capture=async()=>{throw Error('must not capture');};g.active=false;await assert.rejects(g.api.create({name:'project',private:false},{ticket:g.ticket}),/account changed/);assert.equal(g.calls.length,0);
});
test('missing installation and repository selection expose only the pinned App setup link',async()=>{
 for(const change of [f=>{f.installations=[];},f=>{f.members=[];},f=>{f.installed.permissions.contents='read';}]) {
  const f=fixture();change(f);await assert.rejects(f.api.access(f.repo.html_url),error=>error.actionUrl==='https://github.com/apps/zero-development/installations/new');
 }
});
test('installation and repository pagination are followed using fixed API paths rather than untrusted next links',async()=>{
 const f=fixture(),seen=[];
 const api=createGitHubAppRepositories({authentication:f.authentication,configuration,fetchImpl:async(url,options)=>{
  seen.push(url);const parsed=new URL(url),page=parsed.searchParams.get('page');
  if(parsed.pathname==='/user/installations')return {status:200,ok:true,json:async()=>({installations:page==='1'?Array.from({length:100},(_,index)=>({id:index+100,app_id:900,account:{id:17}})):[f.installed]})};
  if(parsed.pathname==='/user/installations/51/repositories')return {status:200,ok:true,json:async()=>({repositories:page==='1'?Array.from({length:100},(_,index)=>({id:index+1000})):[f.repo]})};
  return f.fetchImpl(url,options);
 }});
 await api.access(f.repo.html_url);assert.ok(seen.some(url=>url.endsWith('/user/installations?per_page=100&page=2')));assert.ok(seen.some(url=>url.endsWith('/user/installations/51/repositories?per_page=100&page=2')));
});
