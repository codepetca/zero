'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sidebarDOM}=require('./fixtures/sidebar-dom');
test('Teaching helpers update with project/busy state without stealing focus',()=>{
  const h=sidebarDOM();h.nodes['run-status'].focus();const focused=h.document.activeElement;
  h.emit({type:'sidebar.update',controls:'Run',fileActions:'New asset',status:'Ready',failed:false});
  assert.equal(h.nodes['file-actions'].innerHTML,'New asset');
  h.emit({type:'sidebar.update',controls:'Run',fileActions:'<button disabled>New asset</button>',status:'Working',failed:false});
  assert.match(h.nodes['file-actions'].innerHTML,/disabled/);
  assert.equal(h.document.activeElement,focused);
  h.emit({type:'sidebar.update',controls:'Run',fileActions:'',status:'Open a project',failed:false});
  assert.equal(h.nodes['file-actions'].innerHTML,'');assert.equal(h.document.activeElement,focused);
});

test('focusable unavailable run control blocks activation until shutdown finishes',()=>{
  const h=sidebarDOM(),button=h.document.createElement('button');button.dataset.command='zero.toggleApp';
  button.setAttribute('aria-disabled','true');h.clickCommand(button);
  assert.equal(h.sent.filter(message=>message.command==='zero.toggleApp').length,0);
  button.setAttribute('aria-disabled','false');h.clickCommand(button);
  assert.equal(h.sent.filter(message=>message.command==='zero.toggleApp').length,1);
});

test('publishing bar updates and clears in the persistent sidebar without moving focus',()=>{
  const h=sidebarDOM();h.nodes['run-status'].focus();
  h.emit({type:'sidebar.update',status:'Building app',publishingProgress:'<div role="progressbar">Building</div>'});
  assert.match(h.nodes['publishing-progress'].innerHTML,/progressbar/);
  h.emit({type:'sidebar.update',status:'Failed',failed:true});
  assert.equal(h.nodes['publishing-progress'].innerHTML,'');assert.equal(h.document.activeElement,h.nodes['run-status']);
});
