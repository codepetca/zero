'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const core=require('../src/core');
const {createGitHubPagesPublisher,pagesPublishWorkflow,publishingFiles}=require('../src/web-publish-github');
async function fixture(t,{installed=true,publisherOptions={},sourceFiles,memoizeGit=false}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-pages-test-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=args=>core.git(root,args);
  await git(['init','-b','main']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);await git(['remote','add','origin','https://github.com/student/game.git']);
  await fs.writeFile(path.join(root,'zero.json'),'{}');
  const files=publisherOptions.files || new Map([['.zero-web/owner.json',Buffer.from('owned')],['.github/workflows/zero-web.yml',Buffer.from('workflow')]]);
  if(installed)for(const [name,data] of sourceFiles || files){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),data);}
  await git(['add','.']);await git(['commit','-m','initial']);
  const head=await git(['rev-parse','HEAD']);
  let current=true,simulation=false,remoteHead=head,pages=installed?{build_type:'workflow',public:true,html_url:'https://student.github.io/game/'}:null;
  let run={id:42,head_sha:head,path:'.github/workflows/zero-web.yml',event:'workflow_dispatch',head_branch:'main',repository:{id:12,full_name:'student/game'},status:'completed',conclusion:'success'};
  let marker=head+'\n42\n',publicStatus=200,dispatchStatus=200,createStatus=201,losePagesResponse=false,createdPages;
  let repo={id:12,full_name:'student/game',owner:{id:1,type:'User'},default_branch:'main',permissions:{push:true},private:false};
  let release,asset,afterUpload=async()=>{},assetPatch={},loseCreationResponse=false,listError=false;const calls=[];const session={accountId:'1',label:'student',accessToken:'TEST_SECRET',scopes:[]};
  const ticket={session};
  const authentication={capture:async()=>ticket,assertCurrent:async value=>{if(!current || value!==ticket)throw Error('Account changed');return session;},assertCurrentNow:value=>{if(!current || value!==ticket)throw Error('Account changed');return session;}};
  let allowed=true,installationId=99,deniedPermission,afterAccess=async()=>{};
  const accessCalls=[];
  const repositories={access:async(url,{ticket:observed,permissions})=>{
    await authentication.assertCurrent(observed);accessCalls.push({url,permissions});
    if(!allowed || (deniedPermission && permissions[deniedPermission]))throw Object.assign(Error('Zero GitHub App repository access was removed'),{code:deniedPermission?'permission-required':'installation-required',actionUrl:'https://github.com/apps/codepet-zero/installations/new'});
    await afterAccess();return {ticket:observed,repository:repo,installation:{id:installationId}};
  }};
  const response=(value,status=200)=>new Response(status===204?null:JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  const fetch=async(url,options)=>{
    if(options.signal?.aborted)throw options.signal.reason;
    calls.push({url,options});assert.equal(options.redirect,'error');
    if(url.startsWith('https://student.github.io/') || url.startsWith('https://play.example.org/')){assert.equal(options.headers,undefined);return new Response(marker,{status:publicStatus});}
    assert.equal(options.headers.Authorization,'Bearer TEST_SECRET');assert.equal(options.headers['X-GitHub-Api-Version'],'2026-03-10');
    if(url.startsWith('https://uploads.github.com/')) {asset={id:8,digest:'sha256:'+require('../src/web-publish-bundle').hash(options.body),size:options.body.length,state:'uploaded',name:'zero-web-bundle.json.gz',...assetPatch};await afterUpload();return response(asset,201);}
    const suffix=url.slice('https://api.github.com/repos/student/game'.length);
    if(suffix==='')return response(repo);
    if(suffix==='/git/ref/heads/main')return remoteHead?response({object:{sha:remoteHead}}):response({},404);
    if(suffix==='/pages'){
      if(options.method==='POST'){assert.deepEqual(JSON.parse(options.body),{build_type:'workflow'});if(createStatus===201)pages=createdPages || {build_type:'workflow',public:true,html_url:'https://student.github.io/game/'};if(losePagesResponse)throw Error('Pages creation response lost');return response(pages,createStatus);}
      return response(pages,pages?200:404);
    }
    if(suffix.endsWith('/dispatches'))return response({workflow_run_id:42},dispatchStatus);
    if(suffix==='/actions/runs/42')return response(run);
    if(suffix==='/releases?per_page=100'){if(listError)throw Error('network failed');return response(release?[release]:[]);}
    if(suffix==='/releases'){release={...JSON.parse(options.body),id:7,author:{id:1},upload_url:'https://uploads.github.com/repos/student/game/releases/7/assets{?name,label}'};if(loseCreationResponse){loseCreationResponse=false;throw Error('creation response lost');}return response(release,201);}
    if(suffix==='/releases/7'){if(options.method==='DELETE'){release=undefined;return response(null,204);}return response(release||{},release?200:404);}
    assert.fail('Unexpected API '+url);
  };
  const site=path.join(root,'.zero/web-export/site');await fs.mkdir(site,{recursive:true});await fs.writeFile(path.join(root,'.git/info/exclude'),'.zero/\n');
  const data=[['index.html','<html></html>'],['app.js','window.app=true;'],['licenses/source-artifacts.json','{}']];
  const outputFiles=[];for(const [name,value] of data){await fs.mkdir(path.dirname(path.join(site,name)),{recursive:true});await fs.writeFile(path.join(site,name),value);outputFiles.push({path:name,bytes:Buffer.byteLength(value),sha256:require('../src/web-publish-bundle').hash(Buffer.from(value))});}
  const result={manifestPath:path.join(root,'.zero/web-export/manifest.json'),sitePath:site,sourceHash:'b'.repeat(64),profileHash:'c'.repeat(64)};await fs.writeFile(result.manifestPath,JSON.stringify({files:outputFiles}));
  const localBuild=async()=>result;let validationError;const validateExport=async()=>{if(validationError)throw validationError;const siteFiles=[];for(const file of outputFiles)siteFiles.push({path:file.path,bytes:await fs.readFile(path.join(site,file.path))});if(siteFiles.some(file=>require('../src/web-publish-bundle').hash(file.bytes)!==outputFiles.find(output=>output.path===file.path).sha256))throw Error('browser output changed');return {...result,manifest:{files:outputFiles},siteFiles};};
  const gitReads=new Map();const guardedGit=memoizeGit?((cwd,args)=>{const key=JSON.stringify([cwd,args]);if(!gitReads.has(key))gitReads.set(key,core.git(cwd,args));return gitReads.get(key);}):core.git;
  const publisher=createGitHubPagesPublisher({git:guardedGit,authentication,repositories,fetch,files,isSimulation:()=>simulation,localBuild,validateExport,assertBuildInputsAtCommit:validateExport,...publisherOptions});
  return {root,git,head,files,publisher,calls,authentication,result,accessCalls,set afterAccess(v){afterAccess=v;},set allowed(v){allowed=v;},set installationId(v){installationId=v;},set deniedPermission(v){deniedPermission=v;},set validationError(value){validationError=value;},set afterUpload(value){afterUpload=value;},set loseCreationResponse(value){loseCreationResponse=value;},set listError(value){listError=value;},set assetPatch(value){assetPatch=value;},set losePagesResponse(v){losePagesResponse=v;},set createdPages(v){createdPages=v;},get pages(){return pages;},get release(){return release;},set release(v){release=v;},set pages(v){pages=v;},get repo(){return repo;},set repo(v){repo=v;},get run(){return run;},set marker(v){marker=v;},set current(v){current=v;},set simulation(v){simulation=v;},set remoteHead(v){remoteHead=v;},set dispatchStatus(v){dispatchStatus=v;},set createStatus(v){createStatus=v;},set publicStatus(v){publicStatus=v;}};
}
test('simulation never looks up auth, reads repository, creates files or requests network',async()=>{
  const no=()=>assert.fail('Unexpected side effect');const p=createGitHubPagesPublisher({authentication:{capture:no},fetch:no,git:no});
  assert.equal(p.prepare,undefined);assert.equal((await p.review('/missing')).status,'simulated');assert.equal((await p.setup({})).status,'simulated');assert.equal((await p.update({})).status,'simulated');assert.equal((await p.publish({})).status,'simulated');assert.equal((await p.check({})).status,'simulated');
});
test('clean uploaded main dispatches exact reviewed source and confirms actual public run marker without token',async t=>{
  const h=await fixture(t);const review=await h.publisher.review(h.root);assert.equal(review.setup,false);
  const pending=await h.publisher.publish(review);assert.equal(pending.status,'pending');assert.equal(pending.resume.runId,42);
  const dispatch=h.calls.find(c=>c.url.endsWith('/dispatches'));const body=JSON.parse(dispatch.options.body);assert.equal(body.ref,'main');assert.equal(body.inputs.source_sha,h.head);assert.equal(body.inputs.release_id,'7');assert.equal(body.inputs.asset_id,'8');assert.match(body.inputs.bundle_sha256,/^[a-f0-9]{64}$/);
  assert.equal((await h.publisher.check(pending.resume)).status,'live');assert.equal((await h.publisher.check(pending.resume)).url,h.pages.html_url);
  assert.equal((await h.publisher.publish(await h.publisher.review(h.root))).status,'pending','Later updates reuse the configured destination');
});
test('tracking a dispatched publication permits later edits while retaining repository and account guards',async t=>{
  const h=await fixture(t);const pending=await h.publisher.publish(await h.publisher.review(h.root));
  await fs.writeFile(path.join(h.root,'Working.java'),'class Working {}');
  assert.equal((await h.publisher.check(pending.resume)).status,'live');
  let edited=false;
  h.afterAccess=async()=>{if(!edited){edited=true;await fs.writeFile(path.join(h.root,'Working.java'),'class Working { int next; }');}};
  assert.equal((await h.publisher.check(pending.resume)).status,'live','Editing during a permission check must not interrupt deployment tracking');
  assert.equal(h.calls.filter(call=>call.url.endsWith('/dispatches')).length,1,'Tracking must never dispatch again');
  h.current=false;await assert.rejects(h.publisher.check(pending.resume),/Account changed/);h.current=true;
  h.installationId=100;await assert.rejects(h.publisher.check(pending.resume),/installation changed/);h.installationId=99;
  await h.git(['remote','set-url','origin','https://github.com/student/another.git']);
  await assert.rejects(h.publisher.check(pending.resume),/repository.*changed|project.*changed/i);
});
test('setup creates source-only files then requires normal Commit & push, never remote commits',async t=>{
  const h=await fixture(t,{installed:false});const review=await h.publisher.review(h.root);assert.equal(review.setup,true);
  assert.equal((await h.publisher.setup(review)).status,'upload-required');
  assert.equal(await fs.readFile(path.join(h.root,'.zero-web/owner.json'),'utf8'),'owned');
  assert.equal(await h.git(['rev-parse','HEAD']),h.head);assert.ok(h.calls.every(c=>c.options.method==='GET'));
  await assert.rejects(h.publisher.review(h.root),/Commit & push your changes/);
});
test('dirty, unuploaded, unfinished and changed reviews fail before publication',async t=>{
  const h=await fixture(t);h.remoteHead='f'.repeat(40);await assert.rejects(h.publisher.review(h.root),/Commit & push your main/);h.remoteHead=h.head;
  const review=await h.publisher.review(h.root);await fs.writeFile(path.join(h.root,'New.java'),'class New {}');
  await assert.rejects(h.publisher.publish(review),/files changed/);assert.ok(h.calls.every(c=>c.options.method==='GET'));
  await fs.rm(path.join(h.root,'New.java'));await fs.writeFile(path.join(h.root,'.git/MERGE_HEAD'),h.head);await assert.rejects(h.publisher.review(h.root),/Finish or cancel/);
});
test('session, remote and simulation drift invalidate reviewed mutation',async t=>{
  const h=await fixture(t);const review=await h.publisher.review(h.root);h.current=false;await assert.rejects(h.publisher.publish(review),/Account changed/);h.current=true;
  h.remoteHead='b'.repeat(40);await assert.rejects(h.publisher.publish(review),/main changed/);h.simulation=true;assert.equal((await h.publisher.publish(review)).status,'simulated');
  assert.ok(h.calls.every(c=>c.options.method==='GET'));
});
test('private eligibility, different existing Pages and custom domains preserve all settings',async t=>{
  const h=await fixture(t,{installed:false});h.repo.private=true;assert.equal((await h.publisher.review(h.root)).status,'review');assert.equal(h.repo.private,true);
  h.repo.private=false;h.pages={build_type:'legacy',public:true,html_url:'https://student.github.io/game/'};assert.equal((await h.publisher.review(h.root)).status,'action-required');
  h.pages={build_type:'workflow',cname:'example.com',public:true,html_url:'https://example.com/'};assert.equal((await h.publisher.review(h.root)).status,'action-required');assert.ok(h.calls.every(c=>c.options.method==='GET'));
});
test('conflicting workflow or symlink is never overwritten',async t=>{
  const h=await fixture(t);await fs.writeFile(path.join(h.root,'.github/workflows/zero-web.yml'),'existing workflow');await h.git(['add','.']);await h.git(['commit','-m','edited']);h.remoteHead=await h.git(['rev-parse','HEAD']);
  await assert.rejects(h.publisher.review(h.root),/different content/);assert.equal(await fs.readFile(path.join(h.root,'.github/workflows/zero-web.yml'),'utf8'),'existing workflow');
});
test('unknown run IDs, unrelated runs, old public version and failed deployment never claim Live',async t=>{
  const h=await fixture(t);let review=await h.publisher.review(h.root);h.dispatchStatus=204;await assert.rejects(h.publisher.publish(review),/did not identify/);h.dispatchStatus=200;
  const pending=await h.publisher.publish(review);h.run.head_sha='a'.repeat(40);await assert.rejects(h.publisher.check(pending.resume),/different publishing run/);h.run.head_sha=h.head;
  h.marker=h.head+'\n41\n';assert.equal((await h.publisher.check(pending.resume)).status,'pending');h.marker=h.head+'\n42\n';h.publicStatus=404;assert.equal((await h.publisher.check(pending.resume)).status,'pending');
  h.run.conclusion='failure';assert.equal((await h.publisher.check(pending.resume)).status,'failed');
});
test('Pages creation denial provides one guided action and never changes repository visibility',async t=>{
  const h=await fixture(t);h.pages=null;h.createStatus=403;const result=await h.publisher.publish(await h.publisher.review(h.root));assert.equal(result.status,'action-required');
  assert.match(result.action.url,/apps\/codepet-zero\/installations/);assert.equal(h.calls.filter(c=>c.url.endsWith('/pages') && c.options.method==='POST').length,1);assert.equal(h.repo.private,false);
});
test('generated workflow pins source, separates build and deployment privileges and leaves generated site out of Git',async()=>{
  assert.match(pagesPublishWorkflow,/ref: \$\{\{ inputs.source_sha \}\}/);assert.match(pagesPublishWorkflow,/inputs.source_sha == github.sha/);assert.match(pagesPublishWorkflow,/ZERO_BUNDLE_SHA256/);assert.doesNotMatch(pagesPublishWorkflow,/setup-java|mvn|exportForWeb|Build the browser/);assert.match(pagesPublishWorkflow,/if: always\(\)/);
  const files=await publishingFiles(path.join(__dirname,'../src/web-export'));
  assert.ok(files.has('.github/workflows/zero-web.yml'));assert.ok(files.has('.zero-web/owner.json'));assert.ok([...files.keys()].every(name=>! /\.(jar|zip|class)$/.test(name)));
});

test('owned custom-domain Pages keeps its actual URL and verifies exact public run',async t=>{
  const h=await fixture(t);h.pages={build_type:'workflow',public:true,cname:'play.example.org',html_url:'https://play.example.org/'};
  // Reuse fixture API replies while recording unauthenticated custom readiness.
  const review=await h.publisher.review(h.root);assert.equal(review.publicUrl,'https://play.example.org/');
  const pending=await h.publisher.publish(review);assert.equal(pending.status,'pending');assert.equal(h.pages.cname,'play.example.org');assert.equal((await h.publisher.check(pending.resume)).url,'https://play.example.org/');
  assert.ok(h.calls.filter(c=>c.url.endsWith('/pages')).every(c=>c.options.method==='GET'));
});
test('saved pending runs can be restored with a fresh review after restarting',async t=>{
  const h=await fixture(t);const pending=await h.publisher.publish(await h.publisher.review(h.root));
  const restored=await h.publisher.restore(h.root,JSON.parse(JSON.stringify(pending.resume)));assert.equal(restored.status,'live');assert.equal((await h.publisher.check(restored.resume)).status,'live');
  await assert.rejects(h.publisher.restore(h.root,{...pending.resume,sha:'c'.repeat(40)}),/different publishing run/);
});
test('verified prior link remains usable while local source has changed',async t=>{
  const h=await fixture(t);const pending=await h.publisher.publish(await h.publisher.review(h.root));const live=await h.publisher.check(pending.resume);
  await fs.writeFile(path.join(h.root,'Working.java'),'class Working {}');
  const verified=await h.publisher.verifyLink(h.root,{root:h.root,url:live.url,sha:live.sha,resume:JSON.parse(JSON.stringify(live.resume))});assert.equal(verified.status,'live');assert.equal(verified.url,live.url);
});
test('public readiness address policy rejects private, mapped and local networks',()=>{
  const {publicAddress}=require('../src/web-publish-github');
  for(const address of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('185.199.108.153'),true);assert.equal(publicAddress('2606:50c0:8000::153'),true);
});

test('a Pages destination appearing after no-site consent cannot be overwritten',async t=>{
  const h=await fixture(t);h.pages=null;
  const review=await h.publisher.review(h.root);
  h.pages={build_type:'workflow',public:true,cname:'existing.example.org',html_url:'https://existing.example.org/'};
  await assert.rejects(h.publisher.publish(review),/Pages settings changed/);
  assert.ok(h.calls.every(call=>call.options.method==='GET'));
});
test('simulation enabled during the final asynchronous guard blocks dispatch and setup writes',async t=>{
  const h=await fixture(t);const review=await h.publisher.review(h.root);
  const original=h.authentication.assertCurrent;let armed=false;
  h.authentication.assertCurrent=async ticket=>{const value=await original(ticket);if(armed)h.simulation=true;return value;};
  await assert.rejects(h.publisher.publish(review,{onProgress:()=>{armed=true;}}),/Live publishing is disabled/);
  assert.ok(h.calls.every(call=>call.options.method==='GET'));
  const setup=await fixture(t,{installed:false}),setupReview=await setup.publisher.review(setup.root);
  const check=setup.authentication.assertCurrent;let checks=0;
  setup.authentication.assertCurrent=async ticket=>{const value=await check(ticket);if(++checks===2)setup.simulation=true;return value;};
  await assert.rejects(setup.publisher.setup(setupReview),/Live publishing (?:was|is) disabled/);
  for(const name of setup.files.keys())await assert.rejects(fs.stat(path.join(setup.root,name)),{code:'ENOENT'});
});
test('repository changes return a typed stale-run error without requesting the old destination',async t=>{
  const h=await fixture(t);const pending=await h.publisher.publish(await h.publisher.review(h.root));
  await h.git(['remote','set-url','origin','https://github.com/student/new-game.git']);
  const before=h.calls.length;
  await assert.rejects(h.publisher.restore(h.root,pending.resume),error=>error.code==='WEB_PUBLISH_REPOSITORY_CHANGED');
  assert.equal(h.calls.length,before);
});
test('asynchronous unexpected readiness responses reject safely and bounded empty bodies are harmless',async()=>{
  const {EventEmitter}=require('node:events');
  const {publicReadiness,boundedText}=require('../src/web-publish-github')._test;
  for(const status of [204,205,304,999]) {
    const get=(url,options,respond)=>{
      const request=new EventEmitter();
      queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=status;response.headers={};respond(response);response.emit('end');});
      return request;
    };
    await assert.rejects(publicReadiness('https://student.github.io/game/zero-source-sha.txt',{get}),/not available/);
  }
  assert.equal(await boundedText(new Response(null,{status:204})), '');
  const get=(url,options,respond)=>{
    const request=new EventEmitter();queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=200;response.headers={};respond(response);response.emit('data',Buffer.from('version'));response.emit('end');});return request;
  };
  assert.equal(await boundedText(await publicReadiness('https://student.github.io/game/zero-source-sha.txt',{get})),'version');
});

test('simulation enabled during Pages response validation blocks public readiness traffic',async t=>{
  const h=await fixture(t);const pending=await h.publisher.publish(await h.publisher.review(h.root));
  const original=h.authentication.assertCurrent;
  h.authentication.assertCurrent=async ticket=>{
    const value=await original(ticket);
    if(h.calls.at(-1)?.url.endsWith('/pages'))h.simulation=true;
    return value;
  };
  await assert.rejects(h.publisher.check(pending.resume),/Live publishing is disabled/);
  assert.ok(h.calls.every(call=>!call.url.startsWith('https://student.github.io/')));
});


test('local validation failure never creates Pages, stages bytes or dispatches a workflow',async t=>{
  const h=await fixture(t);const reviewed=await h.publisher.review(h.root);h.validationError=Error('local source no longer matches uploaded HEAD');
  await assert.rejects(h.publisher.publish(reviewed),/uploaded HEAD/);assert.ok(h.calls.every(call=>call.options.method==='GET'));
});
test('ignored output and source drift after upload remove temporary draft without dispatching',async t=>{
  for(const output of [true,false]) {
    const h=await fixture(t),reviewed=await h.publisher.review(h.root),stages=[];
    h.afterUpload=()=>fs.writeFile(path.join(h.root,output?'.zero/web-export/site/app.js':'Changed.java'),'changed');
    await assert.rejects(h.publisher.publish(reviewed,{onStaging:async value=>stages.push(value)}),/output changed|files changed/);
    assert.ok(h.calls.some(call=>call.options.method==='DELETE'&&call.url.endsWith('/releases/7')));
    assert.ok(!h.calls.some(call=>call.url.endsWith('/dispatches')));assert.equal(stages.at(-1),undefined);
  }
});
test('cancellation after staging cleans the draft with bounded authorized cleanup and retains no new run',async t=>{
  const h=await fixture(t),reviewed=await h.publisher.review(h.root),controller=new AbortController(),stages=[];
  await assert.rejects(h.publisher.publish(reviewed,{signal:controller.signal,onProgress:message=>{if(message.startsWith('Deploying'))controller.abort();},onStaging:async value=>stages.push(value)}),/cancelled/);
  assert.ok(h.calls.some(call=>call.options.method==='DELETE'));assert.ok(!h.calls.some(call=>call.url.endsWith('/dispatches')));assert.equal(stages.at(-1),undefined);
});
test('wrong staged asset digest is cleaned and a persisted predispatch receipt can retry cleanup',async t=>{
  const h=await fixture(t),reviewed=await h.publisher.review(h.root);h.assetPatch={digest:'sha256:'+'0'.repeat(64)};let saved;
  await assert.rejects(h.publisher.publish(reviewed,{onStaging:async value=>{if(value)saved=JSON.parse(JSON.stringify(value));}}),/exact app bundle/);
  assert.ok(h.calls.some(call=>call.options.method==='DELETE'));await h.publisher.cleanup(h.root,saved);
  assert.ok(!h.calls.some(call=>call.url.endsWith('/dispatches')));
});


test('lost creation response recovers only the pre-persisted exact draft before permitting another stage',async t=>{
  const h=await fixture(t),reviewed=await h.publisher.review(h.root);let saved;h.loseCreationResponse=true;h.listError=true;
  await assert.rejects(h.publisher.publish(reviewed,{onStaging:async value=>{if(value)saved=JSON.parse(JSON.stringify(value));}}),/cleanup is incomplete/);
  assert.ok(saved.staging.tag.startsWith('zero-web-stage-'));assert.equal(saved.staging.releaseId,undefined);
  const before=h.calls.filter(call=>call.options.method==='POST'&&call.url.endsWith('/releases')).length;
  await assert.rejects(h.publisher.publish(reviewed),/could not be reached/);
  assert.equal(h.calls.filter(call=>call.options.method==='POST'&&call.url.endsWith('/releases')).length,before,'An unresolved stage cannot accumulate new bundles');
  h.listError=false;await h.publisher.cleanup(h.root,saved);
  assert.ok(h.calls.some(call=>call.options.method==='DELETE'&&call.url.endsWith('/releases/7')));
  assert.equal((await h.publisher.publish(await h.publisher.review(h.root))).status,'pending');
});


test('binary app upload has its own bounded slower-network timeout while API reads keep their short budget',async t=>{
  const h=await fixture(t,{publisherOptions:{timeoutMs:10,uploadTimeoutMs:200}}),reviewed=await h.publisher.review(h.root);
  h.afterUpload=async()=>{await new Promise(resolve=>setTimeout(resolve,30));const upload=h.calls.find(call=>call.url.startsWith('https://uploads.github.com/'));assert.equal(upload.options.signal.aborted,false);assert.equal(h.calls[0].options.signal.aborted,true);};
  assert.equal((await h.publisher.publish(reviewed)).status,'pending');
});


test('Pages destination drift during upload blocks dispatch for URL, CNAME, visibility and build mode',async t=>{
  const h=await fixture(t,{memoizeGit:true}),original={...h.pages};
  for(const changed of [{html_url:'https://play.example.org/',cname:'play.example.org'},{cname:'play.example.org'},{public:false},{build_type:'legacy'}]) {
    h.pages={...original};const reviewed=await h.publisher.review(h.root);
    h.afterUpload=async()=>{h.pages={...original,...changed};};
    await assert.rejects(h.publisher.publish(reviewed),/Pages settings changed/);
  }
  assert.ok(!h.calls.some(call=>call.url.endsWith('/dispatches')));
  assert.equal(h.calls.filter(call=>call.options.method==='DELETE').length,4,'Each rejected upload removes its exact temporary draft');
});
test('approved Pages destination persists through restart and rejects changed destinations after dispatch',async t=>{
  const h=await fixture(t,{memoizeGit:true}),pending=await h.publisher.publish(await h.publisher.review(h.root));
  const saved=JSON.parse(JSON.stringify(pending.resume));assert.deepEqual(saved.destination,{url:'https://student.github.io/game/',cname:null,buildType:'workflow',public:true});
  assert.equal((await h.publisher.restore(h.root,saved)).status,'live');
  h.pages={build_type:'workflow',public:true,html_url:'https://play.example.org/',cname:'play.example.org'};
  const before=h.calls.filter(call=>!call.url.startsWith('https://api.github.com/')).length;
  await assert.rejects(h.publisher.check(pending.resume),/Pages settings changed/);
  await assert.rejects(h.publisher.restore(h.root,saved),/Pages settings changed/);
  assert.equal(h.calls.filter(call=>!call.url.startsWith('https://api.github.com/')).length,before,'An unapproved domain is never queried or returned live');
  delete saved.destination;await assert.rejects(h.publisher.restore(h.root,saved),/public destination/);
});
test('initial Pages setup creates only the approved workflow site, then continues deployment',async t=>{
  const h=await fixture(t,{memoizeGit:true});h.pages=null;const reviewed=await h.publisher.review(h.root);assert.equal(reviewed.needsPages,true);assert.equal(reviewed.publicUrl,'https://student.github.io/game/');
  const result=await h.publisher.publish(reviewed);assert.equal(result.status,'pending');
  assert.deepEqual(h.accessCalls.filter(call=>call.permissions.administration).map(call=>call.permissions),[{pages:'write',administration:'write'},{pages:'write',administration:'write'}]);
  assert.equal(h.calls.filter(call=>call.url.endsWith('/pages') && call.options.method==='POST').length,1);
  assert.ok(!h.calls.some(call=>['PUT','PATCH'].includes(call.options.method)));
  assert.equal((await h.publisher.check(result.resume)).status,'live');
});
test('existing Pages never requests Administration and denied setup preserves repository settings',async t=>{
  const existing=await fixture(t,{memoizeGit:true});existing.deniedPermission='administration';
  assert.equal((await existing.publisher.publish(await existing.publisher.review(existing.root))).status,'pending');
  assert.ok(existing.accessCalls.every(call=>!call.permissions.administration));
  const h=await fixture(t,{memoizeGit:true});h.pages=null;h.deniedPermission='administration';h.validationError=Error('must not build');
  const result=await h.publisher.publish(await h.publisher.review(h.root));assert.equal(result.status,'action-required');assert.match(result.action.message,/updated GitHub permissions/);
  assert.ok(h.calls.every(call=>call.options.method==='GET'));assert.equal(h.pages,null);assert.equal(h.repo.private,false);
});
test('uncertain Pages creation reconciles once and never repeats or adopts an unapproved site',async t=>{
  const h=await fixture(t,{memoizeGit:true});h.pages=null;h.losePagesResponse=true;
  assert.equal((await h.publisher.publish(await h.publisher.review(h.root))).status,'pending');
  assert.equal(h.calls.filter(call=>call.url.endsWith('/pages') && call.options.method==='POST').length,1);
  for(const actual of [{build_type:'legacy',public:true,html_url:'https://student.github.io/game/'},{build_type:'workflow',public:false,html_url:'https://student.github.io/game/'},{build_type:'workflow',public:true,cname:'other.example.org',html_url:'https://other.example.org/'}]){
    const f=await fixture(t,{memoizeGit:true});f.pages=null;f.createdPages=actual;
    await assert.rejects(f.publisher.publish(await f.publisher.review(f.root)),/Pages settings changed/);
    assert.ok(!f.calls.some(call=>call.url.endsWith('/dispatches')));
    assert.ok(!f.calls.some(call=>['PUT','PATCH','DELETE'].includes(call.options.method)));
  }
});
test('abort during the release guard sends no create request and clears its preflight stage receipt',async t=>{
  const h=await fixture(t,{memoizeGit:true}),controller=new AbortController(),stages=[];
  const reviewed=await h.publisher.review(h.root),original=h.authentication.assertCurrent;let armed=false;
  h.authentication.assertCurrent=async ticket=>{const value=await original(ticket);if(armed){armed=false;await Promise.resolve();controller.abort();}return value;};
  await assert.rejects(h.publisher.publish(reviewed,{signal:controller.signal,onStaging:async value=>{stages.push(value);if(value&&!value.staging.releaseId)armed=true;}}),/cancelled/);
  assert.equal(h.calls.filter(call=>call.url.endsWith('/releases')&&call.options.method==='POST').length,0);
  assert.equal(stages.at(-1),undefined);assert.ok(!h.calls.some(call=>call.url.includes('/releases?')),'No uncertain-request recovery is recorded for a request never sent');
  assert.equal((await h.publisher.publish(await h.publisher.review(h.root))).status,'pending','Cancellation does not leave a nonexistent draft blocking retry');
});

test('App repository access, capability removal and installation replacement invalidate reviewed mutations',async t=>{
  for(const change of ['allowed','installationId','deniedPermission']) {
    const h=await fixture(t,{memoizeGit:true}),reviewed=await h.publisher.review(h.root);
    h[change]=change==='allowed'?false:change==='installationId'?100:'contents';
    const before=h.calls.length;await assert.rejects(h.publisher.publish(reviewed),/access was removed|installation changed/);
    assert.ok(h.calls.slice(before).every(call=>call.options.method==='GET'));
  }
});
test('App workflow capability is checked before writing local setup',async t=>{
  const h=await fixture(t,{installed:false}),reviewed=await h.publisher.review(h.root);h.deniedPermission='workflows';
  await assert.rejects(h.publisher.setup(reviewed),/access was removed/);
  for(const name of h.files.keys())await assert.rejects(fs.stat(path.join(h.root,name)),{code:'ENOENT'});
});
test('saved run cannot move to a replacement App installation',async t=>{
  const h=await fixture(t,{memoizeGit:true}),pending=await h.publisher.publish(await h.publisher.review(h.root));
  h.installationId=100;await assert.rejects(h.publisher.restore(h.root,JSON.parse(JSON.stringify(pending.resume))),/installation changed/);
});

test('local source changing while App access awaits blocks staging before any write request',async t=>{
  const h=await fixture(t),reviewed=await h.publisher.review(h.root);let armed=false;
  h.afterAccess=async()=>{if(armed){armed=false;await fs.writeFile(path.join(h.root,'Changed.java'),'changed');}};
  await assert.rejects(h.publisher.publish(reviewed,{onStaging:async value=>{if(value)armed=true;}}),/files changed/);
  assert.ok(h.calls.every(call=>call.options.method==='GET'));
});

test('verified historical kit can update an existing Pages site without changing source, history or destination',async t=>{
  const {current,legacy}=await require('./web-publish-legacy-fixture')();
  const h=await fixture(t,{publisherOptions:{files:current},sourceFiles:legacy});
  const {isManagedPublishingSetup}=require('../src/web-publish-upload-auth');
  assert.equal(await isManagedPublishingSetup(h.root),false);
  const reviewed=await h.publisher.review(h.root);
  assert.equal(reviewed.setup,false);assert.deepEqual([...reviewed.upgrade.files].sort(),['.zero-web/README.md','.zero-web/owner.json']);
  assert.equal(reviewed.upgrade.previousSha,h.head);assert.equal(reviewed.publicUrl,h.pages.html_url);
  assert.equal((await h.publisher.publish(reviewed)).status,'action-required');
  assert.equal((await h.publisher.update(reviewed)).status,'upload-required');
  assert.equal(await isManagedPublishingSetup(h.root),true,'The normal uploader now sees the exact current workflow-capable kit');
  assert.equal(await h.git(['rev-parse','HEAD']),h.head);
  for(const [name,bytes]of current)assert.deepEqual(await fs.readFile(path.join(h.root,name)),bytes);
  assert.equal(await fs.readFile(path.join(h.root,'zero.json'),'utf8'),'{}');
  assert.ok(h.calls.every(call=>call.options.method==='GET'));
  assert.ok(h.accessCalls.some(call=>call.permissions.workflows==='write'));
  await assert.rejects(h.publisher.update(reviewed),/Review the older/);
  await assert.rejects(h.publisher.review(h.root),/Commit & push/);
  await h.git(['add','.']);await h.git(['commit','-m','Update publishing files']);h.remoteHead=await h.git(['rev-parse','HEAD']);
  const ready=await h.publisher.review(h.root);assert.equal(ready.upgrade,undefined);assert.equal(ready.sha,await h.git(['rev-parse','HEAD']));
});

test('older kit update refuses source, session, repository, remote and Pages drift without writes',async t=>{
  const {current,legacy}=await require('./web-publish-legacy-fixture')();
  for(const kind of ['source','session','remote','pages','repository','permission','simulation','cancel'])await t.test(kind,async t=>{
    const h=await fixture(t,{publisherOptions:{files:current},sourceFiles:legacy}),review=await h.publisher.review(h.root);
    const controller=new AbortController();
    if(kind==='source')await fs.writeFile(path.join(h.root,'New.java'),'class New {}');
    if(kind==='session')h.current=false;
    if(kind==='remote')h.remoteHead='f'.repeat(40);
    if(kind==='pages')h.pages={...h.pages,html_url:'https://student.github.io/other/'};
    if(kind==='repository')h.repo={...h.repo,id:13};
    if(kind==='permission')h.deniedPermission='workflows';
    if(kind==='simulation')h.simulation=true;
    if(kind==='cancel')controller.abort();
    if(kind==='simulation')assert.equal((await h.publisher.update(review)).status,'simulated');
    else await assert.rejects(h.publisher.update(review,{signal:controller.signal}));
    for(const [name,bytes]of legacy)assert.deepEqual(await fs.readFile(path.join(h.root,name)),bytes);
    assert.ok(h.calls.every(call=>call.options.method==='GET'));
  });
});

test('upgrade review refuses legacy bytes that are not recoverable tracked regular files',async t=>{
  const {current,legacy}=await require('./web-publish-legacy-fixture')();
  const h=await fixture(t,{publisherOptions:{files:current},sourceFiles:legacy});
  await h.git(['rm','--cached','.zero-web/README.md']);await fs.appendFile(path.join(h.root,'.git/info/exclude'),'.zero-web/README.md\n');
  await h.git(['commit','-m','Untrack guide']);h.remoteHead=await h.git(['rev-parse','HEAD']);
  await assert.rejects(h.publisher.review(h.root),/saved unchanged in Git history/);
});


test('source upload requests carry a guarded main snapshot, including a new remote without main',async t=>{
  const h=await fixture(t);
  for(const remote of [null,'f'.repeat(40)]) {
    h.remoteHead=remote;
    await assert.rejects(h.publisher.review(h.root),error=>error.code==='WEB_PUBLISH_UPLOAD_REQUIRED' && error.plan.root===h.root && error.plan.branch==='main' && error.plan.head===h.head);
  }
  h.remoteHead=h.head;await fs.writeFile(path.join(h.root,'Main.java'),'class Main {}');
  await assert.rejects(h.publisher.review(h.root),error=>error.code==='WEB_PUBLISH_UPLOAD_REQUIRED' && Boolean(error.plan.status));
  await h.git(['switch','-c','add-score']);
  await assert.rejects(h.publisher.review(h.root),error=>!error.code && /Merge to main/.test(error.message));
  assert.ok(h.calls.every(call=>call.options.method==='GET'));
});

test('invalid local browser source never creates a first Pages site',async t=>{
 const h=await fixture(t,{memoizeGit:true});h.pages=null;h.validationError=Error('browser source invalid');
 await assert.rejects(h.publisher.publish(await h.publisher.review(h.root)),/browser source invalid/);
 assert.equal(h.pages,null);assert.ok(h.calls.every(call=>call.options.method==='GET'));
});
test('publisher exposes no automatic helper migration entrypoint',()=>{
 const publisher=createGitHubPagesPublisher();assert.equal(publisher.prepare,undefined);
});


async function savedPublication(h) {
  const reviewed=await h.publisher.review(h.root),pending=await h.publisher.publish(reviewed),live=await h.publisher.check(pending.resume);
  return {root:h.root,account:reviewed.account,url:live.url,sha:live.sha,resume:live.resume};
}
test('current publication verification reuses a live version with read-only requests and exact local commit proof',async t=>{
  let proofs=0;const h=await fixture(t,{publisherOptions:{assertBuildInputsAtCommit:async()=>{proofs++;return {sourceHash:'b'.repeat(64)};}}});
  const saved=await savedPublication(h),reviewed=await h.publisher.review(h.root),before=h.calls.length,proofsBefore=proofs;
  const result=await h.publisher.verifyCurrent(reviewed,saved);assert.equal(result.status,'live');assert.equal(result.sha,h.head);assert.equal(proofs-proofsBefore,2);assert.ok(h.calls.slice(before).every(call=>call.options.method==='GET')); // no dispatch, upload or compiler
});
test('current verification rejects stale receipt, missing local proof and drift after remote verification',async t=>{
  const h=await fixture(t),saved=await savedPublication(h),reviewed=await h.publisher.review(h.root);
  for(const changed of [{sha:'f'.repeat(40)},{account:'other'},{root:'/other'},{url:'https://other.invalid/'}])assert.equal((await h.publisher.verifyCurrent(reviewed,{...saved,...changed})).status,'stale');
  h.validationError=Error('Retained build missing');assert.equal((await h.publisher.verifyCurrent(reviewed,saved)).status,'stale');h.validationError=undefined;
  h.remoteHead='f'.repeat(40);await assert.rejects(h.publisher.verifyCurrent(reviewed,saved),/GitHub main changed/);
});
test('current verification never treats authentication or public availability failures as permission to publish',async t=>{
  const h=await fixture(t),saved=await savedPublication(h),reviewed=await h.publisher.review(h.root);
  h.current=false;await assert.rejects(h.publisher.verifyCurrent(reviewed,saved));h.current=true;h.publicStatus=503;
  const start=h.calls.length;assert.equal((await h.publisher.verifyCurrent(reviewed,saved)).status,'pending');assert.ok(h.calls.slice(start).every(call=>call.options.method==='GET'));
});

test('current publication detects ignored-source drift after the public check and requires an input proof',async t=>{
  for(const mode of ['missing','drift']) {
    let calls=0;const h=await fixture(t,{publisherOptions:{assertBuildInputsAtCommit:async({result}={})=>{if(result)return {sourceHash:'b'.repeat(64)};calls++;return mode==='missing'?undefined:{sourceHash:(calls===1?'b':'d').repeat(64)};}}});
    const saved=await savedPublication(h),reviewed=await h.publisher.review(h.root);
    if(mode==='missing')assert.equal((await h.publisher.verifyCurrent(reviewed,saved)).status,'stale');else await assert.rejects(h.publisher.verifyCurrent(reviewed,saved),/app changed/);
  }
});

test('current-page reuse never deletes a staging draft, while pending recovery can clean its owned draft',async t=>{
  const h=await fixture(t),saved=await savedPublication(h),stage=saved.resume.staging;
  h.release={id:stage.releaseId,draft:true,tag_name:stage.tag,author:{id:1},target_commitish:saved.sha};
  const reviewed=await h.publisher.review(h.root),before=h.calls.length;
  assert.equal((await h.publisher.verifyCurrent(reviewed,saved)).status,'live');assert.ok(h.release);assert.ok(h.calls.slice(before).every(call=>call.options.method==='GET'));
  await h.publisher.restore(h.root,saved.resume);assert.equal(h.release,undefined,'Explicit pending-run recovery retains its owned cleanup');
});

test('a failed remembered deployment needs a new publication instead of opening its old page',async t=>{
 const h=await fixture(t),saved=await savedPublication(h),reviewed=await h.publisher.review(h.root);h.run.conclusion='failure';
 const before=h.calls.length;assert.equal((await h.publisher.verifyCurrent(reviewed,saved)).status,'stale');assert.ok(h.calls.slice(before).every(call=>call.options.method==='GET'));
});
