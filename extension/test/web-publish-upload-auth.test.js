'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {publishingFiles}=require('../src/web-publish-github');
const {isManagedPublishingSetup,selectUploadAuthentication}=require('../src/web-publish-upload-auth');
async function fixture(t,{kit=true}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-upload-auth-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  if(kit)for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
  let current=true,allowed=true,afterAccess=()=>{};
  const calls=[],session={accountId:'1',label:'student',scopes:[]},initialTicket={session};
  const authentication={assertCurrent:async ticket=>{assert.equal(ticket,initialTicket);if(!current)throw Error('GitHub account changed');}};
  const repositories={access:async(url,options)=>{calls.push({url,...options});if(!allowed)throw Error('Select this repository in the Zero GitHub App installation');afterAccess();return {ticket:initialTicket,repository:{id:12},installation:{id:99}};}};
  return {root,repositoryUrl:'https://github.com/student/game',authentication,initialTicket,repositories,calls,set current(v){current=v;},set allowed(v){allowed=v;},set afterAccess(v){afterAccess=v;}};
}
test('canonical kit checks App Contents and Workflows capabilities using the same empty-scope session',async t=>{
  const h=await fixture(t);assert.equal(await isManagedPublishingSetup(h.root),true);
  const chosen=await selectUploadAuthentication(h);assert.equal(chosen.authentication,h.authentication);assert.equal(chosen.ticket,h.initialTicket);
  assert.deepEqual(chosen.ticket.session.scopes,[]);assert.deepEqual(h.calls.map(c=>c.permissions),[{contents:'write',workflows:'write'}]);chosen.dispose();
});
test('ordinary, forged, edited, incomplete and symlinked setups only require App Contents upload access',async t=>{
  const h=await fixture(t,{kit:false});
  for(const configure of [async()=>{},async()=>{await fs.mkdir(path.join(h.root,'.zero-web'));await fs.writeFile(path.join(h.root,'.zero-web/owner.json'),'{}');},async()=>{for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(h.root,name)),{recursive:true});await fs.writeFile(path.join(h.root,name),bytes);}await fs.writeFile(path.join(h.root,'.zero-web/run.cjs'),'edited');},async()=>{await fs.rm(path.join(h.root,'.zero-web/run.cjs'));await fs.symlink(path.join(h.root,'.zero-web/web-publish-bundle.js'),path.join(h.root,'.zero-web/run.cjs'));}]) {
    await configure();const chosen=await selectUploadAuthentication(h);assert.equal(chosen.authentication,h.authentication);chosen.dispose();
  }
  assert.ok(h.calls.every(call=>JSON.stringify(call.permissions)===JSON.stringify({contents:'write'})));
});
test('unselected repository and removed permission reject upload without requesting broad OAuth scopes',async t=>{
  const h=await fixture(t);h.allowed=false;await assert.rejects(selectUploadAuthentication(h),/Select this repository/);
  await assert.rejects(selectUploadAuthentication({...h,repositories:undefined}),/not configured/);
});
test('account or project drift during App access rejects selection',async t=>{
  const h=await fixture(t);h.afterAccess=()=>{h.current=false;};await assert.rejects(selectUploadAuthentication(h),/account changed/);
  const held=await fixture(t);await assert.rejects(selectUploadAuthentication({...held,assertCurrentProject:async()=>{throw Error('Live uploads were disabled');}}),/disabled/);assert.deepEqual(held.calls,[]);
});
