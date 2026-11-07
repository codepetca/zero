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

test('inline commit sends the typed message and clears only for the matching project',()=>{
 const h=sidebarDOM(),field=h.document.createElement('input');field.value='Add sounds';field.dataset.project='project-a';h.nodes['commit-message']=field;
 const button=h.document.createElement('button');button.dataset.command='zero.commitChanges';h.clickCommand(button);
 assert.equal(h.sent.at(-1).command,'zero.commitChanges');assert.equal(h.sent.at(-1).commitMessage,'Add sounds');
 h.emit({type:'commit.clear',project:'project-b'});assert.equal(field.value,'Add sounds');
 h.emit({type:'commit.clear',project:'project-a'});assert.equal(field.value,'');
});

test('keyboard conflict choice retains focus across busy and announces the next file',()=>{
 const h=sidebarDOM(),controls=h.nodes.controls;let markup='';
 Object.defineProperty(controls,'innerHTML',{get:()=>markup,set:value=>{
   markup=value;controls.replaceChildren();delete h.nodes['update-recovery-heading'];
   if(value==='busy'||value==='next'){
     const heading=h.document.createElement('p');heading.id='update-recovery-heading';heading.textContent=value==='busy'?'Choose changes to keep in Player.java.':'Choose changes to keep in Coin.java.';h.nodes[heading.id]=heading;controls.append(heading);
     const button=h.document.createElement('button');button.dataset.command='zero.keepLocalUpdate';button.dataset.conflictChoice='true';button.disabled=value==='busy';controls.append(button);
   }
 }});
 controls.innerHTML='next';const button=controls.querySelector('[data-command="zero.keepLocalUpdate"]');h.focus(button);h.clickCommand(button);
 assert.equal(h.sent.at(-1).command,'zero.keepLocalUpdate');
 h.emit({type:'sidebar.update',controls:'busy',status:'Working',failed:false});
 assert.equal(h.document.activeElement,h.nodes['update-recovery-heading']);
 h.emit({type:'sidebar.update',controls:'next',status:'Choose changes to keep in Coin.java',failed:false});
 assert.equal(h.document.activeElement,h.nodes['update-recovery-heading']);assert.match(h.document.activeElement.textContent,/Coin.java/);
 assert.match(h.nodes['run-status'].textContent,/Coin.java/);
 h.emit({type:'sidebar.update',controls:'complete',status:'Main updated',failed:false});
 assert.equal(h.document.activeElement,h.nodes['run-status']);
});
