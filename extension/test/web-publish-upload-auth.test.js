'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createAuthentication}=require('../src/authentication');
const {publishingFiles}=require('../src/web-publish-github');
const {isManagedPublishingSetup,selectUploadAuthentication}=require('../src/web-publish-upload-auth');
async function fixture(t,{kit=true,available=true}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-upload-auth-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  if(kit)for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
  const calls=[],listeners=new Set();let workflowAvailable=available,workflowAccount='1',baseAccount='1',cancel=false,disposed=0;
  const provider={getSession:async(provider,scopes,options)=>{
    calls.push({provider,scopes,options});const workflow=scopes.includes('workflow');
    if(workflow&&!workflowAvailable){if(!options.createIfNone||cancel)return undefined;workflowAvailable=true;}
    const account=workflow?workflowAccount:baseAccount;
    return {id:workflow?'workflow-session':'ordinary-session',account:{id:account,label:'student'},scopes:[...scopes],accessToken:workflow?'WORKFLOW_TEST_ONLY':'REPO_TEST_ONLY'};
  },onDidChangeSessions:listener=>{listeners.add(listener);return {dispose(){disposed++;listeners.delete(listener);}};}};
  const authentication=createAuthentication(provider);t.after(()=>authentication.dispose());const initialTicket=await authentication.capture();calls.length=0;
  return {root,provider,authentication,initialTicket,calls,get disposed(){return disposed;},set cancel(value){cancel=value;},set workflowAccount(value){workflowAccount=value;},set baseAccount(value){baseAccount=value;},removeWorkflow(){workflowAvailable=false;for(const listener of [...listeners])listener({provider:{id:'github'}});}};
}
const select=h=>selectUploadAuthentication(h);
test('canonical kit reuses an existing native workflow session and disposes only its temporary auth',async t=>{
  const h=await fixture(t);assert.equal(await isManagedPublishingSetup(h.root),true);
  const chosen=await select(h);assert.deepEqual(chosen.ticket.session.scopes,['repo','workflow']);assert.equal(chosen.ticket.session.accountId,'1');
  assert.ok(h.calls.every(call=>call.options.silent));chosen.dispose();assert.equal(h.disposed,1);assert.equal(h.authentication.signedIn,true);
});
test('ordinary, forged, edited, incomplete and symlinked setups never request workflow access',async t=>{
  const h=await fixture(t,{kit:false});
  for(const configure of [async()=>{},async()=>{await fs.mkdir(path.join(h.root,'.zero-web'));await fs.writeFile(path.join(h.root,'.zero-web/owner.json'),'{"format":1,"toolHash":"forged"}');},async()=>{for(const [name,bytes] of await publishingFiles()){await fs.mkdir(path.dirname(path.join(h.root,name)),{recursive:true});await fs.writeFile(path.join(h.root,name),bytes);}await fs.writeFile(path.join(h.root,'.zero-web/run.cjs'),'edited');},async()=>{await fs.rm(path.join(h.root,'.zero-web/run.cjs'));await fs.symlink(path.join(h.root,'.zero-web/web-publish-bundle.js'),path.join(h.root,'.zero-web/run.cjs'));}]) {
    await configure();const chosen=await select(h);assert.equal(chosen.authentication,h.authentication);chosen.dispose();
  }
  assert.ok(h.calls.every(call=>call.scopes.join(',')==='repo'));assert.equal(h.disposed,0);
});
test('missing workflow session requests native authorization once and cancellation disposes without returning credentials',async t=>{
  const h=await fixture(t,{available:false});h.cancel=true;
  await assert.rejects(select(h),error=>/Sign in|cancelled/.test(error.message)&&!error.message.includes('TEST_ONLY'));
  assert.equal(h.calls.filter(call=>call.options.createIfNone).length,1);assert.equal(h.disposed,1);
  h.cancel=false;const chosen=await select(h);assert.equal(chosen.ticket.session.scopes.includes('workflow'),true);chosen.dispose();assert.equal(h.disposed,2);
});
test('workflow account mismatch and base-account drift reject selection and dispose scoped auth',async t=>{
  const h=await fixture(t);h.workflowAccount='2';await assert.rejects(select(h),/account changed/);assert.equal(h.disposed,1);
  h.workflowAccount='1';let checks=0;
  await assert.rejects(selectUploadAuthentication({...h,assertCurrentProject:async()=>{if(++checks===3)h.baseAccount='2';}}),/account changed/);assert.equal(h.disposed,2);
});
test('project or mode hold before scope selection performs no workflow provider lookup',async t=>{
  const h=await fixture(t);await assert.rejects(selectUploadAuthentication({...h,assertCurrentProject:async()=>{throw Error('Live uploads were disabled');}}),/disabled/);
  assert.deepEqual(h.calls,[]);
});
