
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('development sidebar leaves tutorial, setup and project selection on the Start Page',async()=>{
 const {sidebarSource}=await import('../../design/playground/sidebar-source.mjs');
 for(const connected of [false,true]){
  const empty=sidebarSource('empty',{connected});
  assert.match(empty,/data-command="zero.startPage"[^>]*>Open Start Page/);
  assert.doesNotMatch(empty,/data-command="zero\.(?:startProject|newProject|cloneRepository|openLocalProject|signInToGitHub|setupGitHub)"|id="project-menu-button"/);
  const project=sidebarSource('ready',{connected});
  assert.match(project,/zero.toggleApp/);assert.match(project,/zero.newClass/);assert.match(project,/zero.importAssets/);assert.doesNotMatch(project,/role="tree"|id="files"/);assert.match(project,/zero.browseZeroHub/);
  assert.doesNotMatch(project,/data-command="zero\.(?:startProject|newProject|cloneRepository|openLocalProject|signInToGitHub|setupGitHub)"/);
  if(connected)assert.match(project,/zero.chooseRepository/);else assert.match(project,/data-command="zero.startPage"[^>]*>GitHub setup/);
 }
 const manifest=require('../package.json');
 assert.ok(manifest.contributes.commands.some(c=>c.command==='zero.startPage'&&c.title==='Zero: Start Page'));
 assert.ok(manifest.contributes.menus['view/title'].some(c=>c.command==='zero.startPage'));
 assert.ok(!manifest.contributes.menus['view/title'].some(c=>c.command==='zero.startProject'));
 assert.ok(manifest.contributes.menus['view/title'].some(c=>c.command==='zero.showSetup'));
});
test('student explorer owns New and ZeroHub while its controls stay minimal',async()=>{
 const {sidebarSource}=await import('../../design/playground/sidebar-source.mjs');
 for(const connected of [false,true]) {
  const controls=sidebarSource('ready',{connected,studentExplorer:true});
  assert.match(controls,/zero.toggleApp/);
  assert.doesNotMatch(controls,/data-command="zero\.(?:newClass|newPackage|newFile|newFolder|importAssets|browseZeroHub)"|id="files-menu-button"/);
  if(connected)assert.match(controls,/zero.chooseRepository/);
 }
 const menus=require('../package.json').contributes.menus;
 assert.ok(menus['view/title'].some(item=>item.command==='zero.explorerNew'&&item.when==='view == zero.studentProject'&&item.group==='navigation@0'));
 assert.ok(menus['view/title'].some(item=>item.command==='zero.browseZeroHub'&&item.when==='view == zero.studentProject'));
 for(const command of ['zero.explorerNewFile','zero.explorerNewFolder'])assert.ok(menus['view/item/context'].some(item=>item.command===command));
});
