'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sidebarDOM}=require('./fixtures/sidebar-dom');
function fixture(){const h=sidebarDOM();return {...h,trigger:h.nodes['run-menu-button'],menu:h.nodes['run-menu'],publish:h.nodes['run-menu'].children[0]};}
test('Run options opens without launching; Publish closes and dispatches the existing guarded command once',()=>{
 const h=fixture();h.clickCommand(h.trigger);
 assert.equal(h.menu.hidden,false);assert.equal(h.trigger.getAttribute('aria-expanded'),'true');assert.equal(h.document.activeElement,h.publish);
 assert.equal(h.sent.some(message=>message.command),false);
 h.clickCommand(h.publish);assert.equal(h.menu.hidden,true);assert.equal(h.document.activeElement,h.trigger);
 assert.deepEqual(h.sent.filter(message=>message.command).map(message=>message.command),['zero.publishAndOpenWeb']);
 const run=h.document.createElement('button');run.dataset.command='zero.toggleApp';h.clickCommand(run);
 assert.equal(h.sent.at(-1).command,'zero.toggleApp','Main Run remains a direct action');
});
test('Run options supports arrow keys, Escape, Tab and mutually exclusive Files/Run menus',()=>{
 const h=fixture();h.key(h.trigger,'ArrowDown');assert.equal(h.document.activeElement,h.publish);
 for(const key of ['ArrowDown','ArrowUp','Home','End']){h.key(h.publish,key);assert.equal(h.document.activeElement,h.publish);}
 h.key(h.publish,'Escape');assert.equal(h.menu.hidden,true);assert.equal(h.document.activeElement,h.trigger);
 h.key(h.trigger,'ArrowUp');assert.equal(h.document.activeElement,h.publish);assert.equal(h.key(h.publish,'Tab'),false);assert.equal(h.menu.hidden,true);
 h.clickCommand(h.trigger);h.clickCommand(h.nodes['files-menu-button']);assert.equal(h.menu.hidden,true);assert.equal(h.nodes['files-menu'].hidden,false);
 h.clickCommand(h.trigger);assert.equal(h.nodes['files-menu'].hidden,true);assert.equal(h.menu.hidden,false);
});
test('busy controls cannot open or publish; outside focus, blur dismiss Run options',()=>{
 const h=fixture();h.trigger.disabled=true;h.clickCommand(h.trigger);h.key(h.trigger,'ArrowDown');assert.equal(h.menu.hidden,true);
 h.publish.disabled=true;h.clickCommand(h.publish);assert.equal(h.sent.some(message=>message.command),false);
 for(const dismiss of [h=>h.clickCommand(h.nodes.controls),h=>h.focus(h.nodes['run-status']),h=>h.blur()]) {
  const f=fixture();f.clickCommand(f.trigger);dismiss(f);assert.equal(f.menu.hidden,true);assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
 }
});
test('status-only updates keep Run options open; changed controls close it without replacing the status region',()=>{
 const h=fixture();h.emit({type:'sidebar.update',controls:'ready',status:'',failed:false});h.clickCommand(h.trigger);
 h.emit({type:'sidebar.update',controls:'ready',status:'Ready',failed:false});assert.equal(h.menu.hidden,false);
 const tree=h.nodes['run-status'];h.emit({type:'sidebar.update',controls:'busy',status:'Building',failed:false});assert.equal(h.menu.hidden,true);assert.equal(h.nodes['run-status'],tree);
});
test('a busy refresh moves focus from Publish to Stop when its dropdown becomes disabled',()=>{
 const h=fixture(),stop=h.document.createElement('button');stop.dataset.command='zero.toggleApp';h.nodes.controls.append(stop);
 h.clickCommand(h.trigger);assert.equal(h.document.activeElement,h.publish);
 h.trigger.disabled=true;h.publish.disabled=true;
 h.emit({type:'sidebar.update',controls:'stopping',status:'Stopping…',failed:false});
 assert.equal(h.menu.hidden,true);assert.equal(h.document.activeElement,stop);
});
test('actual renderer offers publishing only for ready connected projects and disables it during Run/Stop',async()=>{
 const {sidebarSource}=await import('../../design/playground/sidebar-source.mjs');
 const ready=sidebarSource('ready',{connected:true});
 assert.match(ready,/class="run-split"><button class="run" data-command="zero.toggleApp"/);
 assert.match(ready,/id="run-menu-button"[^>]*aria-haspopup="menu"[^>]*aria-controls="run-menu"/);
 assert.match(ready,/data-command="zero.publishAndOpenWeb"[^>]*>Publish &amp; open app<\/button>/);
 assert.doesNotMatch(sidebarSource('ready'),/id="run-menu-button"/,'Signed-out local Run needs no publishing account');
 assert.doesNotMatch(sidebarSource('empty',{connected:true}),/id="run-menu-button"/);
 for(const state of ['building','running','stopping']) {
  const html=sidebarSource(state,{connected:true});
  assert.match(html,/id="run-menu-button"[^>]* disabled/);assert.match(html,/data-command="zero.publishAndOpenWeb"[^>]* disabled/);
  assert.match(html,state==='stopping'?/Stopping…<\/button>/:/Stop<\/button>/);
 }
});
