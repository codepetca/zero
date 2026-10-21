'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sidebarDOM}=require('./fixtures/sidebar-dom');
function fixture(){const h=sidebarDOM();return {...h,trigger:h.nodes['files-menu-button'],menu:h.nodes['files-menu'],choices:h.nodes['files-menu'].children};}
test('Files toggles an anchored menu locally and selecting an item dispatches once after closing',()=>{
 const h=fixture();h.clickCommand(h.trigger);
 assert.equal(h.menu.hidden,false);assert.equal(h.trigger.getAttribute('aria-expanded'),'true');assert.equal(h.document.activeElement,h.choices[0]);
 assert.equal(h.sent.some(message=>message.command),false,'Opening Files must not invoke a native picker');
 h.clickCommand(h.choices[1]);assert.equal(h.menu.hidden,true);assert.equal(h.trigger.getAttribute('aria-expanded'),'false');
 assert.equal(h.document.activeElement,h.trigger);assert.deepEqual(h.sent.filter(message=>message.command).map(message=>message.command),['zero.newFile']);
 h.clickCommand(h.trigger);h.clickCommand(h.trigger);assert.equal(h.menu.hidden,true);
});
test('arrow keys, Home, End and Escape navigate the menu and return focus to Files',()=>{
 const h=fixture();assert.equal(h.key(h.trigger,'ArrowDown'),true);assert.equal(h.document.activeElement,h.choices[0]);
 h.key(h.choices[0],'ArrowUp');assert.equal(h.document.activeElement,h.choices[3]);
 h.key(h.choices[3],'ArrowDown');assert.equal(h.document.activeElement,h.choices[0]);
 h.key(h.choices[0],'End');assert.equal(h.document.activeElement,h.choices[3]);
 h.key(h.choices[3],'Home');assert.equal(h.document.activeElement,h.choices[0]);
 h.key(h.choices[0],'Escape');assert.equal(h.menu.hidden,true);assert.equal(h.document.activeElement,h.trigger);
 h.key(h.trigger,'ArrowUp');assert.equal(h.document.activeElement,h.choices[3]);
 assert.equal(h.key(h.choices[3],'Tab'),false,'Tab retains its native movement after closing');assert.equal(h.menu.hidden,true);assert.equal(h.document.activeElement,h.trigger);
});
test('outside clicks, focus leaving, window blur  dismiss the menu',()=>{
 for(const dismiss of [h=>h.clickCommand(h.nodes.controls),h=>h.focus(h.nodes.controls),h=>h.blur()]) {
  const h=fixture();h.clickCommand(h.trigger);dismiss(h);assert.equal(h.menu.hidden,true);assert.equal(h.trigger.getAttribute('aria-expanded'),'false');
 }
});
test('disabled items cannot dispatch and keyboard navigation skips them',()=>{
 const h=fixture();h.trigger.disabled=true;h.clickCommand(h.trigger);h.key(h.trigger,'ArrowDown');assert.equal(h.menu.hidden,true);
 h.trigger.disabled=false;h.choices[0].disabled=true;h.clickCommand(h.trigger);assert.equal(h.document.activeElement,h.choices[1]);
 h.clickCommand(h.choices[0]);assert.equal(h.sent.some(message=>message.command),false);
});
test('status updates retain the open menu, but changed file controls close it without replacing the status region',()=>{
 const h=fixture();h.emit({type:'sidebar.update',fileActions:'ready',status:'',failed:false});h.clickCommand(h.trigger);
 h.emit({type:'sidebar.update',fileActions:'ready',status:'App running',failed:false});assert.equal(h.menu.hidden,false);
 const tree=h.nodes['run-status'];h.emit({type:'sidebar.update',fileActions:'busy',status:'Building',failed:false});assert.equal(h.menu.hidden,true);assert.equal(h.nodes['run-status'],tree);
});
