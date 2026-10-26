'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createFileCommands,nameError} = require('../src/file-actions');
const {resolveAuthoringTarget,packageNameError} = require('../src/file-targets');
const {previewExtraction,previewMode,applyPlan} = require('../src/sharing/authoring');

async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-create-')));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'project');await fs.mkdir(root);
  let current=root,busy=false,name='Player',location=0;
  const opened=[],states=[],logs=[],prompts=[],pickers=[];
  const vscode={workspace:{isTrusted:true},Uri:{file:fsPath=>({fsPath})},commands:{executeCommand:async(command,uri)=>opened.push({command,path:uri.fsPath})},window:{
    showQuickPick:async(items,options)=>{pickers.push(options);return location===undefined?undefined:items[location];},
    showInputBox:async options=>{prompts.push(options);return name;}
  }};
  let refreshes=0;
  const commands=createFileCommands(vscode,{project:async()=>current,isBusy:()=>busy,setBusy:value=>{busy=value;},setState:state=>states.push(state),output:{appendLine:line=>logs.push(line)},refreshFiles:()=>refreshes++});
  return {base,root,vscode,commands,opened,states,logs,prompts,pickers,run:(kind,context)=>commands.commands[`zero.new${kind}`](context),set name(value){name=value;},set location(value){location=value;},set current(value){current=value;},set busy(value){busy=value;},get busy(){return busy;},get refreshes(){return refreshes;}};
}
test('New class creates ordinary Java beside Main, opens it and refreshes without a popup',async t=>{
  const f=await fixture(t);await f.run('Class');
  const filename=path.join(f.root,'src/main/java/Player.java');
  assert.equal(await fs.readFile(filename,'utf8'),'public class Player {\n\n}\n');
  assert.deepEqual(f.opened,[{command:'vscode.open',path:filename}]);assert.equal(f.pickers.length,0);
  assert.equal(f.states.at(-1),'Created Player.java');assert.equal(f.refreshes,1);assert.equal(f.busy,false);
  f.name='Enemy.java';await f.run('Class');assert.match(await fs.readFile(path.join(f.root,'src/main/java/Enemy.java'),'utf8'),/public class Enemy/);
});
test('files and nested folders use native project locations and never open Explorer',async t=>{
  const f=await fixture(t);f.location=1;f.name='images/backgrounds';await f.run('Folder');
  assert.equal((await fs.stat(path.join(f.root,'src/main/resources/images/backgrounds'))).isDirectory(),true);assert.equal(f.opened.length,0);
  f.name='data/questions.txt';await f.run('File');assert.equal(await fs.readFile(path.join(f.root,'src/main/resources/data/questions.txt'),'utf8'),'');
  f.location=2;f.name='notes.txt';await f.run('File');assert.equal(await fs.readFile(path.join(f.root,'notes.txt'),'utf8'),'');
  assert.equal(f.opened.length,2);assert.ok(f.opened.every(item=>item.command==='vscode.open'));
});
test('cancelled name or location creates no directories and releases busy state',async t=>{
  const f=await fixture(t);f.name=undefined;await f.run('Class');assert.deepEqual(await fs.readdir(f.root),[]);
  f.location=undefined;await f.run('Folder');assert.equal(f.prompts.length,1);assert.deepEqual(await fs.readdir(f.root),[]);assert.equal(f.busy,false);
});
test('invalid and existing names stay in the native input; final checks never overwrite files or folders',async t=>{
  const f=await fixture(t);await f.run('Class');
  const validate=f.prompts[0].validateInput;assert.match(await validate('Player'),/already exists/);assert.match(await validate('player'),/already exists/);assert.match(await validate('../Escape'),/class name/);
  await assert.rejects(f.run('Class'),/already exists/);assert.equal(await fs.readFile(path.join(f.root,'src/main/java/Player.java'),'utf8'),'public class Player {\n\n}\n');
  f.name='Player.java';await assert.rejects(f.run('Folder'),/already exists/);
  f.name='caf\u00e9.txt';f.location=2;await f.run('File');f.name='cafe\u0301.txt';await assert.rejects(f.run('File'),/already exists/);
});
test('portable names reject traversal, absolute paths, reserved names and hidden generated paths',()=>{
  for (const value of ['','../outside','/tmp/escape','a/../../b','a\\b','C:/temp/file','a//b','.git/config','target/file','src/main/java/node_modules/x','a/.zero/file','.zero-build/new.js','.zero-web/new.js','nul.txt','COM1','bad:thing','bad\nname','a.',' folder','folder ']) assert.ok(nameError(value,'file'),value);
  for (const value of ['class','record','true','_','var','bad name','1Player','../Player','Player.class','CON','nul.java']) assert.ok(nameError(value,'class'),value);
  for (const value of ['Player','Player.java','ScoreDisplay','counter2']) assert.equal(nameError(value,'class'),undefined,value);
  assert.equal(nameError('images/backgrounds','folder'),undefined);
});
test('untrusted workspaces, disposal, busy state and duplicate clicks cannot create files',async t=>{
  const f=await fixture(t);f.vscode.workspace.isTrusted=false;await assert.rejects(f.run('Class'),/Trust your own/);assert.equal(f.prompts.length,0);
  f.vscode.workspace.isTrusted=true;f.busy=true;await f.run('Class');assert.equal(f.prompts.length,0);f.busy=false;
  let release;f.vscode.window.showInputBox=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.run('Class');while(!release)await new Promise(resolve=>setImmediate(resolve));await f.run('File');
  f.commands.dispose();release('Player');await assert.rejects(pending,/stopped/);assert.deepEqual(await fs.readdir(f.root),[]);assert.equal(f.busy,false);
});
test('project switch or root replacement during name entry prevents writes',async t=>{
  for (const replacement of ['project','root']) {
    const f=await fixture(t);f.vscode.window.showInputBox=async()=>{
      if(replacement==='project')f.current=path.join(f.base,'other');
      else {await fs.rename(f.root,f.root+'-old');await fs.mkdir(f.root);}
      return 'Player';
    };
    await assert.rejects(f.run('Class'),/project (?:folder )?changed/i);assert.deepEqual(await fs.readdir(f.root),[]);assert.equal(f.opened.length,0);
  }
});
test('symbolic links in roots, destination parents and final names never write outside the project',async t=>{
  const f=await fixture(t),outside=path.join(f.base,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret'),'keep');
  await fs.mkdir(path.join(f.root,'src'));await fs.symlink(outside,path.join(f.root,'src/main'));
  await assert.rejects(f.run('Class'),/ordinary folder/);assert.deepEqual(await fs.readdir(outside),['secret']);
  await fs.unlink(path.join(f.root,'src/main'));await fs.mkdir(path.join(f.root,'src/main/java'),{recursive:true});
  await fs.symlink(path.join(outside,'secret'),path.join(f.root,'src/main/java/Player.java'));
  await assert.rejects(f.run('Class'),/already exists/);assert.equal(await fs.readFile(path.join(outside,'secret'),'utf8'),'keep');
  const link=path.join(f.base,'linked-project');await fs.symlink(f.root,link);f.current=link;await assert.rejects(f.run('Class'),/ordinary folder/);
});
test('parent replaced with a symlink during the prompt is refused before writing',async t=>{
  const f=await fixture(t),outside=path.join(f.base,'outside');await fs.mkdir(outside);await fs.mkdir(path.join(f.root,'src/main/java'),{recursive:true});
  f.vscode.window.showInputBox=async()=>{await fs.rmdir(path.join(f.root,'src/main/java'));await fs.symlink(outside,path.join(f.root,'src/main/java'));return 'Player';};
  await assert.rejects(f.run('Class'),/ordinary folder/);assert.deepEqual(await fs.readdir(outside),[]);
});
test('New package uses dotted folders and selected classes declare their exact package',async t=>{
  const f=await fixture(t);f.name='game.characters';await f.run('Package');
  const context={root:f.root,area:'code',relative:'src/main/java/game/characters'};
  f.name='Player';await f.run('Class',context);
  assert.equal(await fs.readFile(path.join(f.root,context.relative,'Player.java'),'utf8'),'package game.characters;\n\npublic class Player {\n\n}\n');
  f.name='enemies.bosses';await f.run('Package',context);
  assert.equal((await fs.stat(path.join(f.root,context.relative,'enemies/bosses'))).isDirectory(),true);
  assert.equal(f.pickers.length,0);assert.equal(f.prompts.at(-1).prompt,'In Code › game › characters');
  f.name='game.characters';await assert.rejects(f.run('Package'),/already exists/);
});
test('package names are portable Java identifiers and framework packages remain protected',async t=>{
  for(const value of ['','a..b','a/b','a\\b','../x','bad name','game.class','CON.ui','a.true','game.1bad','a._','a.','game.ü'])assert.ok(packageNameError(value),value);
  assert.equal(packageNameError('game.characters_2'),undefined);
  const f=await fixture(t);
  for(const name of ['zero','zero.ui','Zero.contrib.mine']){f.name=name;await assert.rejects(f.run('Package'),/framework/);}
  await fs.mkdir(path.join(f.root,'src/main/java/zero/ui'),{recursive:true});
  f.name='Player';await assert.rejects(f.run('Class',{root:f.root,area:'code',relative:'src/main/java/zero/ui'}),/framework/);
  f.location=2;f.name='src/main/java/zero/New.java';await assert.rejects(f.run('File'),/Choose Code/);
  f.name='libraries/unmanaged/Other.java';await assert.rejects(f.run('File'),/local library/);
});
test('selected assets and project folders bypass the picker but cannot forge code or library targets',async t=>{
  const f=await fixture(t);await fs.mkdir(path.join(f.root,'src/main/resources/images'),{recursive:true});
  const context={root:f.root,area:'assets',relative:'src/main/resources/images'};
  f.name='notes.txt';await f.run('File',context);assert.equal(await fs.readFile(path.join(f.root,context.relative,'notes.txt'),'utf8'),'');
  f.name='nested';await f.run('Folder',context);assert.equal(f.pickers.length,0);
  await assert.rejects(f.run('Class',context),/Choose Code/);
  for(const forged of [
    {...context,root:f.base}, {...context,relative:'../outside'}, {...context,relative:'/tmp'}, {...context,relative:'src/main/java'},
    {...context,relative:'src/main/resources/missing'}, {...context,area:'project',relative:'libraries/nope'},
    {...context,libraryFolder:'libraries/nope'}, {...context,area:'library-code',libraryFolder:'../outside'}
  ])await assert.rejects(f.run('File',forged),/project|folder|Code|Assets|library/);
});
test('selected descendant deletion and symlink replacement while prompting are refused',async t=>{
  for(const change of ['delete','symlink']) {
    const f=await fixture(t),relative='src/main/java/game',selected=path.join(f.root,relative),outside=path.join(f.base,'outside');
    await fs.mkdir(selected,{recursive:true});await fs.mkdir(outside);
    f.vscode.window.showInputBox=async()=>{await fs.rmdir(selected);if(change==='symlink')await fs.symlink(outside,selected);return 'Player';};
    await assert.rejects(f.run('Class',{root:f.root,area:'code',relative}),/no longer exists|ordinary folder/);
    assert.deepEqual(await fs.readdir(outside),[]);
  }
});
async function localLibrary(f) {
  await fs.writeFile(path.join(f.root,'zero.json'),'{}');
  await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(f.root,'pom.xml'));
  await fs.mkdir(path.join(f.root,'src/main/java'),{recursive:true});
  await fs.writeFile(path.join(f.root,'src/main/java/Health.java'),'public class Health {}\n');
  await applyPlan(await previewExtraction(f.root,{repository:{id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'},descriptor:{schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'An ordinary helper.',license:'MIT',libraryKind:'helper'},sources:['src/main/java/Health.java']}));
  return {root:f.root,area:'library-code',relative:'libraries/health-bar/src/main/java/zero/contrib/r12345/health_bar',libraryFolder:'libraries/health-bar'};
}
test('validated local library namespace permits classes and dotted subpackages without touching framework source',async t=>{
  const f=await fixture(t),context=await localLibrary(f);f.name='Meter';await f.run('Class',context);
  assert.equal(await fs.readFile(path.join(f.root,context.relative,'Meter.java'),'utf8'),'package zero.contrib.r12345.health_bar;\n\npublic class Meter {\n\n}\n');
  f.name='display.styles';await f.run('Package',context);
  f.name='Widget';await f.run('Class',{...context,relative:context.relative+'/display/styles'});
  assert.match(await fs.readFile(path.join(f.root,context.relative,'display/styles/Widget.java'),'utf8'),/^package zero.contrib.r12345.health_bar.display.styles;/);
  for(const relative of ['libraries/health-bar/src/main/java','libraries/health-bar/src/main/java/zero/ui','libraries/health-bar/src/main/java/zero/contrib/r999/health_bar'])await assert.rejects(f.run('Class',{...context,relative}),/selected Code/);
  const asset=await resolveAuthoringTarget(f.root,context,'asset');
  assert.equal(asset.baseRelative,'libraries/health-bar/src/main/resources/zero/contrib/r12345/health_bar');
  assert.equal(asset.resourceBaseRelative,'libraries/health-bar/src/main/resources');
  await assert.rejects(resolveAuthoringTarget(f.root,{...context,area:'library-assets',relative:asset.resourceBaseRelative},'asset'),/selected Code or Assets/);
});
test('library mode changes during the prompt stop creation and published libraries reject authoring',async t=>{
  const f=await fixture(t),context=await localLibrary(f);
  f.vscode.window.showInputBox=async()=>{await applyPlan(await previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.0.0'}));return 'Meter';};
  await assert.rejects(f.run('Class',context),/local mode/);
  await assert.rejects(fs.access(path.join(f.root,context.relative,'Meter.java')));
  await assert.rejects(resolveAuthoringTarget(f.root,context,'folder'),/local mode/);
});

test('Other project files cannot enter Code or Assets through slash-separated names',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.root,'src/main/web'),{recursive:true});
 for(const name of ['java/game/Extra.java','resources/image.png']) {
  f.name=name;await assert.rejects(f.run('File',{root:f.root,area:'project',relative:'src/main'}),/Choose Code, Assets/);
 }
 f.name='src/main/java/Extra.java';await assert.rejects(f.run('File',{root:f.root,area:'project',relative:''}),/Choose Code, Assets/);
 assert.deepEqual(await fs.readdir(path.join(f.root,'src/main')),['web']);
});
