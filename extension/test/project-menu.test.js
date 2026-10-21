'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sidebarDOM}=require('./fixtures/sidebar-dom');
test('Project menu navigates all three commands and restores focus on selection or Escape',()=>{
 const h=sidebarDOM(),trigger=h.nodes['project-menu-button'],menu=h.nodes['project-menu'];
 h.key(trigger,'ArrowDown');assert.equal(menu.hidden,false);assert.equal(h.document.activeElement,menu.children[0]);
 h.key(menu.children[0],'End');assert.equal(h.document.activeElement,menu.children[2]);
 h.key(menu.children[2],'ArrowDown');assert.equal(h.document.activeElement,menu.children[0]);
 h.key(menu.children[0],'Escape');assert.equal(menu.hidden,true);assert.equal(h.document.activeElement,trigger);
 for(const button of menu.children){h.clickCommand(trigger);h.clickCommand(button);assert.equal(menu.hidden,true);assert.equal(h.document.activeElement,trigger);}
 assert.deepEqual(h.sent.filter(item=>item.command).map(item=>item.command),['zero.newProject','zero.cloneRepository','zero.openLocalProject']);
 h.clickCommand(trigger);h.clickCommand(h.nodes['files-menu-button']);assert.equal(menu.hidden,true);
 h.clickCommand(trigger);assert.equal(h.nodes['files-menu'].hidden,true);
 h.clickCommand(h.nodes['run-menu-button']);assert.equal(menu.hidden,true);
 trigger.disabled=true;h.clickCommand(trigger);assert.equal(menu.hidden,true);
});
test('ready welcome has Start tutorial and one Project menu; diagnostics and empty repository controls stay out',async()=>{
 const {sidebarSource}=await import('../../design/playground/sidebar-source.mjs');
 for(const state of ['empty','ready']){
  const html=sidebarSource(state,{connected:true});
  assert.equal((html.match(/id="project-menu-button"/g)||[]).length,1);
  const menu=html.match(/<div id="project-menu"[\s\S]*?<\/div>/)[0];
  assert.deepEqual([...menu.matchAll(/data-command="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map(m=>[m[1],m[2]]),[['zero.newProject','New project'],['zero.cloneRepository','Clone project'],['zero.openLocalProject','Open local project']]);
  assert.doesNotMatch(html,/zero.showSetup|Setup help/);
  if(state==='empty'){assert.match(html,/Start tutorial/);assert.doesNotMatch(html,/zero.chooseRepository|class="repository"/);}
  else assert.match(html,/zero.chooseRepository/,'Current repository actions remain reachable');
 }
 const signedOut=sidebarSource('empty');assert.match(signedOut,/Sign in to GitHub/);assert.match(signedOut,/zero.openLocalProject/);assert.doesNotMatch(signedOut,/id="project-menu-button"|zero.showSetup/);
 const manifest=require('../package.json');assert.equal(manifest.contributes.commands.find(c=>c.command==='zero.showSetup').shortTitle,'Troubleshooting');
 assert.ok(manifest.contributes.menus['view/title'].some(c=>c.command==='zero.showSetup'));
 assert.ok(manifest.contributes.menus['view/title'].some(c=>c.command==='zero.githubAccount'));
 assert.ok(manifest.contributes.menus['view/title'].some(c=>c.command==='zero.chooseRepository'));
});
