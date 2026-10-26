
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
 assert.ok(menus['view/title'].some(item=>item.submenu==='zero.projectNewMenu'&&item.when==='view == zero.studentProject'&&item.group==='navigation@0'));
 assert.ok(menus['view/title'].some(item=>item.command==='zero.browseZeroHub'&&item.when==='view == zero.studentProject'));
 for(const command of ['zero.explorerNewFile','zero.explorerNewFolder'])assert.ok(menus['view/item/context'].some(item=>item.command===command));
});

test('Project New is a supported dropdown with selected-area choices and file context rename',()=>{
 const {commands,menus,submenus}=require('../package.json').contributes;
 assert.deepEqual(submenus.find(s=>s.id==='zero.projectNewMenu'),{id:'zero.projectNewMenu',label:'New',icon:'$(add)'});
 assert.deepEqual(menus['zero.projectNewMenu'].map(x=>x.command),['zero.projectNewClass','zero.projectNewPackage','zero.projectNewFile','zero.projectNewFolder','zero.projectImportAssets']);
 assert.equal(menus['zero.projectNewMenu'][0].when,'zero.explorerCodeTarget');
 assert.equal(menus['zero.projectNewMenu'][4].when,'zero.explorerAssetTarget');
 assert.ok(!commands.some(c=>c.command==='zero.explorerNew'));
 for(const suffix of ['NewClass','NewPackage','NewFile','NewFolder','ImportAssets','RenameFile']) {
  const entry=menus['view/item/context'].find(c=>c.command==='zero.explorer'+suffix);
  assert.match(entry.when,/zeroCodeFile/);
  assert.doesNotMatch(entry.when,/zeroReadonly/);
 }
});
