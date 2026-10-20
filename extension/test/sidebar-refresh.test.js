'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sidebarDOM}=require('./fixtures/sidebar-dom');
const {createSidebarBridge}=require('../src/sidebar-bridge');
const id=n=>n.toString(16).padStart(32,'0');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const root={generation:'g',parent:null,items:[{id:id(1),label:'Main.java',directory:false},{id:id(2),label:'Resources',directory:true}]};
const child={generation:'g',parent:id(2),items:[{id:id(3),label:'sound.wav',directory:false}]};
function prepared(){const h=sidebarDOM();h.reply(h.sent.at(-1),root);h.click(id(2));h.reply(h.sent.at(-1),child);h.click(id(3));return h;}
function refresh(h){h.emit({type:'files.reset'});h.reply(h.sent.at(-1),root);return h.sent.at(-1);}
test('nested focus survives asynchronous root and child refresh without replacing unchanged rows',()=>{
  const h=prepared(),sound=h.row(id(3));assert.equal(h.document.activeElement,sound);
  const request=refresh(h);assert.equal(h.document.activeElement,sound,'Root result must retain the focused descendant while its folder reloads');
  h.reply(request,child);assert.equal(h.document.activeElement,sound);assert.equal(h.saved.focus,id(3));
});
test('removed focused child deliberately falls back to its folder, but later replies do not steal moved focus',()=>{
  const h=prepared(),request=refresh(h);
  h.reply(request,{...child,items:[]});assert.equal(h.document.activeElement,h.row(id(2)));assert.equal(h.saved.focus,id(2));
  const moved=prepared(),next=refresh(moved);moved.nodes.controls.focus();moved.reply(next,{...child,items:[]});
  assert.equal(moved.document.activeElement,moved.nodes.controls,'User focus outside the tree wins over asynchronous results');
  const other=prepared(),pending=refresh(other);other.click(id(1));other.reply(pending,child);
  assert.equal(other.document.activeElement,other.row(id(1)),'A newer tree selection must also win');
});
test('nine expanded folders all refresh and file-open during saturation completes with bounded concurrency',async()=>{
  const h=sidebarDOM(),folders=Array.from({length:9},(_,i)=>({id:id(i+1),label:`Folder ${i}`,directory:true}));
  let held=false,version=0,active=0,maxActive=0,opened=0;const gates=[];const replies=[];
  const webview={postMessage:message=>{replies.push(message);h.emit(message);}};
  const files={list:async folder=>{
    if(!folder)return {generation:'g',parent:null,items:folders};
    active++;maxActive=Math.max(maxActive,active);
    if(held)await new Promise(resolve=>gates.push(resolve));
    active--;return {generation:'g',parent:folder,items:[{id:id(100+Number.parseInt(folder,16)+version*100),label:'lesson.txt',directory:false}]};
  },openFile:async()=>{opened++;return true;}};
  const bridge=createSidebarBridge({files,isEmpty:()=>false,isCurrent:()=>true,report:error=>assert.fail(error.message)});
  h.connect(message=>{if(message.type.startsWith('files.'))bridge(webview,message);});await tick();
  for(const folder of folders){h.click(folder.id);await tick();}
  held=true;version=1;h.emit({type:'files.reset'});await tick();
  assert.equal(active,8);h.click(id(101));
  for(let round=0;round<4;round++){for(const release of gates.splice(0))release();await tick();}
  assert.equal(opened,1,'A file-open queued behind the folder burst must reach native open');
  assert.equal(maxActive,8);
  for(let i=1;i<=9;i++)assert.ok(h.row(id(200+i)),`Folder ${i} refreshed, including the ninth`);
  assert.ok(replies.some(message=>message.type==='files.opened'));
});
test('overflow, stale, error and empty outcomes release requests so folders can be retried',async()=>{
  const h=prepared();let request=refresh(h);
  h.emit({type:'files.error',requestId:request.requestId,message:'Try again'});
  h.click(id(2));h.click(id(2));assert.equal(h.sent.at(-1).type,'files.list');assert.notEqual(h.sent.at(-1).requestId,request.requestId);
  request=h.sent.at(-1);h.emit({type:'files.stale',requestId:request.requestId});assert.equal(h.sent.at(-1).id,undefined);
  request=h.sent.at(-1);h.emit({type:'files.empty',requestId:request.requestId});assert.equal(h.nodes.files.childElementCount,0);
  const responses=[],gates=[];const view={postMessage:reply=>responses.push(reply)};
  const bridge=createSidebarBridge({files:{list:()=>new Promise(resolve=>gates.push(resolve))},isEmpty:()=>false,isCurrent:()=>true,report:()=>{}});
  for(let i=1;i<=73;i++)bridge(view,{type:'files.list',requestId:i,id:id(i),generation:'g'});
  assert.equal(gates.length,8);assert.equal(responses.length,1);assert.equal(responses[0].requestId,73);assert.equal(responses[0].type,'files.error');
  for(let round=0;round<10;round++){for(const release of gates.splice(0))release(null);await tick();}
  assert.equal(responses.length,73,'Every valid request has a terminal outcome, even beyond the queue bound');
});

test('Files actions update with project/busy state without replacing the file tree or stealing focus',()=>{
  const h=prepared(),sound=h.row(id(3));
  h.emit({type:'sidebar.update',controls:'Run',fileActions:'New asset',status:'Ready',failed:false});
  assert.equal(h.nodes['file-actions'].innerHTML,'New asset');
  h.emit({type:'sidebar.update',controls:'Run',fileActions:'<button disabled>New asset</button>',status:'Working',failed:false});
  assert.match(h.nodes['file-actions'].innerHTML,/disabled/);
  assert.equal(h.row(id(3)),sound);assert.equal(h.document.activeElement,sound);
  h.emit({type:'sidebar.update',controls:'Run',fileActions:'',status:'Open a project',failed:false});
  assert.equal(h.nodes['file-actions'].innerHTML,'');assert.equal(h.document.activeElement,sound);
});

test('focusable unavailable run control blocks activation until shutdown finishes',()=>{
  const h=sidebarDOM(),button=h.document.createElement('button');button.dataset.command='zero.toggleApp';
  button.setAttribute('aria-disabled','true');h.clickCommand(button);
  assert.equal(h.sent.filter(message=>message.command==='zero.toggleApp').length,0);
  button.setAttribute('aria-disabled','false');h.clickCommand(button);
  assert.equal(h.sent.filter(message=>message.command==='zero.toggleApp').length,1);
});
