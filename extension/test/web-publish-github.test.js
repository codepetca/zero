'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const core=require('../src/core');
const {createGitHubPagesPublisher,pagesPublishWorkflow,publishingFiles}=require('../src/web-publish-github');
async function fixture(t,{installed=true}={}) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-pages-test-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=args=>core.git(root,args);
  await git(['init','-b','main']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);await git(['remote','add','origin','https://github.com/student/game.git']);
  await fs.writeFile(path.join(root,'zero.json'),'{}');
  const files=new Map([['.zero-web/owner.json',Buffer.from('owned')],['.github/workflows/zero-web.yml',Buffer.from('workflow')]]);
  if(installed)for(const [name,data] of files){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),data);}
  await git(['add','.']);await git(['commit','-m','initial']);
  const head=await git(['rev-parse','HEAD']);
  let current=true,simulation=false,remoteHead=head,pages=installed?{build_type:'workflow',public:true,html_url:'https://student.github.io/game/'}:null;
  let run={head_sha:head,path:'.github/workflows/zero-web.yml',event:'workflow_dispatch',head_branch:'main',repository:{full_name:'student/game'},status:'completed',conclusion:'success'};
  let marker=head+'\n42\n',publicStatus=200,dispatchStatus=200,createStatus=201;
  let repo={full_name:'student/game',owner:{id:1,type:'User'},default_branch:'main',permissions:{push:true},private:false};
  const calls=[];const session={accountId:'1',label:'student',accessToken:'TEST_SECRET',scopes:['repo','workflow']};
  const ticket={session};
  const authentication={capture:async()=>ticket,assertCurrent:async value=>{if(!current || value!==ticket)throw Error('Account changed');return session;},assertCurrentNow:value=>{if(!current || value!==ticket)throw Error('Account changed');return session;}};
  const response=(value,status=200)=>new Response(status===204?null:JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  const fetch=async(url,options)=>{
    calls.push({url,options});assert.equal(options.redirect,'error');
    if(url.startsWith('https://student.github.io/') || url.startsWith('https://play.example.org/')){assert.equal(options.headers,undefined);return new Response(marker,{status:publicStatus});}
    assert.equal(options.headers.Authorization,'Bearer TEST_SECRET');assert.equal(options.headers['X-GitHub-Api-Version'],'2026-03-10');
    const suffix=url.slice('https://api.github.com/repos/student/game'.length);
    if(suffix==='')return response(repo);
    if(suffix==='/git/ref/heads/main')return response({object:{sha:remoteHead}});
    if(suffix==='/pages'){
      if(options.method==='POST'){if(createStatus===201)pages={build_type:'workflow',public:true,html_url:'https://student.github.io/game/'};return response(pages,createStatus);}
      return response(pages,pages?200:404);
    }
    if(suffix.endsWith('/dispatches'))return response({workflow_run_id:42},dispatchStatus);
    if(suffix==='/actions/runs/42')return response(run);
    assert.fail('Unexpected API '+url);
  };
  const publisher=createGitHubPagesPublisher({authentication,fetch,files,isSimulation:()=>simulation});
  return {root,git,head,files,publisher,calls,get pages(){return pages;},set pages(v){pages=v;},get repo(){return repo;},set repo(v){repo=v;},get run(){return run;},set marker(v){marker=v;},set current(v){current=v;},set simulation(v){simulation=v;},set remoteHead(v){remoteHead=v;},set dispatchStatus(v){dispatchStatus=v;},set createStatus(v){createStatus=v;},set publicStatus(v){publicStatus=v;}};
}
test('simulation never looks up auth, reads repository, creates files or requests network',async()=>{
  const no=()=>assert.fail('Unexpected side effect');const p=createGitHubPagesPublisher({authentication:{capture:no},fetch:no,git:no});
  assert.equal((await p.review('/missing')).status,'simulated');assert.equal((await p.setup({})).status,'simulated');assert.equal((await p.publish({})).status,'simulated');assert.equal((await p.check({})).status,'simulated');
});
test('clean uploaded main dispatches exact reviewed source and confirms actual public run marker without token',async t=>{
  const h=await fixture(t);const review=await h.publisher.review(h.root);assert.equal(review.setup,false);
  const pending=await h.publisher.publish(review);assert.equal(pending.status,'pending');assert.equal(pending.resume.runId,42);
  const dispatch=h.calls.find(c=>c.url.endsWith('/dispatches'));assert.deepEqual(JSON.parse(dispatch.options.body),{ref:'main',inputs:{source_sha:h.head}});
  assert.equal((await h.publisher.check(pending.resume)).status,'live');assert.equal((await h.publisher.check(pending.resume)).url,h.pages.html_url);
  assert.equal((await h.publisher.publish(await h.publisher.review(h.root))).status,'pending','Later updates reuse the configured destination');
});
test('setup creates source-only files then requires normal Upload changes, never remote commits',async t=>{
  const h=await fixture(t,{installed:false});const review=await h.publisher.review(h.root);assert.equal(review.setup,true);
  assert.equal((await h.publisher.setup(review)).status,'upload-required');
  assert.equal(await fs.readFile(path.join(h.root,'.zero-web/owner.json'),'utf8'),'owned');
  assert.equal(await h.git(['rev-parse','HEAD']),h.head);assert.ok(h.calls.every(c=>c.options.method==='GET'));
  await assert.rejects(h.publisher.review(h.root),/Upload your changes/);
});
test('dirty, unuploaded, unfinished and changed reviews fail before publication',async t=>{
  const h=await fixture(t);h.remoteHead='f'.repeat(40);await assert.rejects(h.publisher.review(h.root),/Upload your main/);h.remoteHead=h.head;
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
  const post=h.calls.find(c=>c.options.method==='POST');assert.deepEqual(JSON.parse(post.options.body),{build_type:'workflow'});
});
test('generated workflow pins source, separates build and deployment privileges and leaves generated site out of Git',async()=>{
  assert.match(pagesPublishWorkflow,/ref: \$\{\{ inputs.source_sha \}\}/);assert.match(pagesPublishWorkflow,/inputs.source_sha == github.sha/);assert.match(pagesPublishWorkflow,/\$GITHUB_RUN_ID/);assert.match(pagesPublishWorkflow,/zero-source-sha.txt/);
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
