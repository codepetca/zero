'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {createWebPublishCommands}=require('../src/web-publish-ui');
function fixture(t) {
  let simulation=false,busy=false,active='/student',reviewed=0,published=0,checks=0,setup=false,uploaded=0;
  const messages=[],states=[],copied=[],opened=[],authCalls=[],choices=[];
  const stored=new Map(),workspaceState={get:key=>stored.get(key),update:async(key,value)=>{if(value===undefined)stored.delete(key);else stored.set(key,JSON.parse(JSON.stringify(value)));}};
  const session={id:'native',account:{id:'1',label:'student'},accessToken:'TEST',scopes:['repo','workflow']};
  const vscode={workspace:{isTrusted:true},authentication:{getSession:async(...args)=>{authCalls.push(args);return session;},onDidChangeSessions:()=>({dispose(){}})},window:{showInformationMessage:async(...args)=>{messages.push(args);return choices.shift();}},env:{clipboard:{writeText:async url=>copied.push(url)},openExternal:async uri=>{opened.push(uri);return true;}},Uri:{parse:url=>url}};
  const auth={capture:async()=>({session:{accountId:'1'}})};
  const review=()=>({status:'review',setup,repository:'https://github.com/student/game',publicUrl:'https://student.github.io/game/',sha:'a'.repeat(40),account:'student'});
  const calls=[];
  const publisher={review:async()=>{calls.push('review');reviewed++;return review();},setup:async()=>{calls.push('setup');return {status:'upload-required',message:'Upload setup'};},publish:async()=>{calls.push('publish');published++;return {status:'pending',resume:{runId:42}};},check:async()=>{checks++;return {status:'live',url:'https://student.github.io/game/',sha:'a'.repeat(40),resume:{runId:42,sha:'a'.repeat(40),repository:'https://github.com/student/game'}};}};
  publisher.verifyLink=async()=>publisher.check();
  const api=createWebPublishCommands(vscode,{project:async()=>active,authentication:auth,workspaceState,isSimulation:()=>simulation,isBusy:()=>busy,setBusy:v=>{busy=v;},setState:message=>states.push(message),publisherFactory:()=>publisher,uploadChanges:async()=>{assert.equal(busy,false);uploaded++;setup=false;},pollIntervalMs:0,maxChecks:2});
  t.after(()=>api.disposables.forEach(d=>d.dispose()));
  return {api,choices,vscode,workspaceState,stored,messages,states,copied,opened,calls,authCalls,set simulation(v){simulation=v;},set setup(v){setup=v;},set active(v){active=v;},get busy(){return busy;},get reviewed(){return reviewed;},get published(){return published;},get checks(){return checks;},get uploaded(){return uploaded;},publisher};
}
test('simulation publish never saves, authenticates, writes setup or calls publisher',async t=>{
  const h=fixture(t);h.simulation=true;const result=await h.api.publish();assert.equal(result.status,'simulated');assert.deepEqual(h.calls,[]);assert.deepEqual(h.authCalls,[]);assert.equal(h.busy,false);
});
test('one publish review leads to exact-run polling and copies actual ready URL',async t=>{
  const h=fixture(t);h.choices.push('Publish game','Copy playable link');const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(h.reviewed,1);assert.equal(h.published,1);assert.equal(h.checks,1);assert.deepEqual(h.copied,['https://student.github.io/game/']);assert.deepEqual(h.opened,[]);assert.equal(h.busy,false);
});
test('first setup authorizes workflows explicitly, uses normal upload, reviews new source and then publishes',async t=>{
  const h=fixture(t);h.setup=true;h.choices.push('Set up publishing','Publish game');const result=await h.api.publish();assert.equal(result.status,'live');assert.equal(h.uploaded,1);assert.deepEqual(h.calls,['review','review','setup','review','publish']);assert.ok(h.authCalls.every(args=>args[0]==='github' && args[1].join() ==='repo,workflow' && args[2].silent));assert.equal(h.messages.filter(m=>m[1]?.modal).length,2);
});
test('cancelled consent and project drift never publish or expose a URL',async t=>{
  const h=fixture(t);await h.api.publish();assert.equal(h.published,0);assert.deepEqual(h.authCalls,[]);
  h.vscode.window.showInformationMessage=async()=>{h.active='/other';return 'Publish game';};await assert.rejects(h.api.publish(),/project changed/);assert.equal(h.published,0);assert.deepEqual(h.copied,[]);assert.equal(h.busy,false);
});
test('failed and still-pending deployments never copy a link',async t=>{
  const h=fixture(t);h.choices.push('Publish game');h.publisher.check=async()=>({status:'failed',message:'Build failed'});assert.equal((await h.api.publish()).status,'failed');assert.deepEqual(h.copied,[]);
  h.choices.push('Publish game');h.publisher.check=async value=>({status:'pending',resume:value,message:'Waiting'});assert.equal((await h.api.publish()).status,'pending');assert.deepEqual(h.copied,[]);assert.equal(h.busy,false);
});

test('prior verified live link persists through failed update and works after editor restart',async t=>{
  const h=fixture(t);h.choices.push('Publish game');await h.api.publish();const saved=h.workspaceState.get('zero.webPublish.lastLive');assert.equal(saved.url,'https://student.github.io/game/');
  h.choices.push('Publish game');const originalCheck=h.publisher.check;h.publisher.check=async()=>({status:'failed',message:'Build failed'});await h.api.publish();assert.deepEqual(h.workspaceState.get('zero.webPublish.lastLive'),saved);
  h.publisher.check=originalCheck;
  const restarted=createWebPublishCommands(h.vscode,{project:async()=>'/student',workspaceState:h.workspaceState,isSimulation:()=>false,publisherFactory:()=>h.publisher});t.after(()=>restarted.disposables.forEach(d=>d.dispose()));
  await restarted.commands['zero.copyPublishedWebLink']();assert.deepEqual(h.copied,['https://student.github.io/game/']);
  await restarted.commands['zero.openPublishedWeb']();assert.deepEqual(h.opened,['https://student.github.io/game/']);
});

test('later publish revalidates the same approved destination with one command',async t=>{
  const h=fixture(t);h.choices.push('Publish game');await h.api.publish();const modalCount=h.messages.filter(message=>message[1]?.modal).length;
  await h.api.publish();assert.equal(h.published,2);assert.equal(h.reviewed,2);assert.equal(h.messages.filter(message=>message[1]?.modal).length,modalCount);
});
