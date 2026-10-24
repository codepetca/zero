'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createSharingEditor,importEdits}=require('../src/sharing/editor');const authoring=require('../src/sharing/authoring');
const repository={id:'12345',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
async function fixture(t,{approval,dirty=false,drift=false,policy='b'.repeat(40),owner='7',notification}={}) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-editor-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));await fs.writeFile(path.join(root,'zero.json'),'{}');await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});await fs.writeFile(path.join(root,'src/main/java/Main.java'),'public class Main { Health health = new Health(); }');await fs.writeFile(path.join(root,'src/main/java/Health.java'),'public class Health {}');
 const descriptor={schema:1,kind:'game',slug:'game',version:'0.1.0',title:'Game',description:'Finite fixture',controls:'Keys',license:'MIT',preview:'preview.png'};await fs.writeFile(path.join(root,'zero-game.json'),JSON.stringify(descriptor,null,2)+'\n');
 await fs.writeFile(path.join(root,'preview.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
 let busy=false;const opened=[],gitCalls=[],messages=[],states=[];let sources=0,edits=0,saves=0,stagedPlan;
 const vscode={Uri:{file:fsPath=>({fsPath}),parse:x=>x},Range:class{},ProgressLocation:{Notification:1},workspace:{isTrusted:true,textDocuments:dirty?[{isDirty:true,uri:{fsPath:path.join(root,'src/main/java/Main.java')}}]:[],openTextDocument:async uri=>({uri,getText:()=>'',version:1,isDirty:false}),getConfiguration:()=>({get:(key,fallback)=>key==='sharingPolicyRevision'?policy:fallback})},env:{openExternal:async url=>{opened.push(url);return true;}},commands:{executeCommand:async()=>{}},window:{
 showInputBox:async options=>options.title==='Library name'?'health-bar':options.title==='Library title'?'Health':options.title==='Library description'?'An ordinary helper':options.value||'description',
 showQuickPick:async entries=>entries[0]?.path?[entries.find(e=>e.label==='Health')]:entries.find(e=>e.kind==='helper')||entries[0],
 showInformationMessage:async(message,options)=>{messages.push(message);if(options?.modal){if(drift&&message.startsWith('Extract'))await fs.appendFile(path.join(root,'src/main/java/Health.java'),'// newer');return approval;}return notification;},
 showTextDocument:async()=>{},withProgress:async(_opts,callback)=>callback({report(){}},{onCancellationRequested:()=>({dispose(){}})})
 }};
 const host={setState:message=>states.push(message),project:async()=>root,isBusy:()=>busy,setBusy:x=>{busy=x;},output:{appendLine(){},show(){}},auth:{capture:async()=>({session:{accessToken:'NEVER_LOG',label:'student',accountId:'7'},revision:1}),assertCurrent:async()=>{}}};
 const git=async(_root,args)=>{gitCalls.push(args);if(args[0]==='rev-parse')return args[1]==='--show-toplevel'?root:'a'.repeat(40);if(args[0]==='remote')return repository.url+'.git';if(args[0]==='status')return '';if(args[0]==='show')return JSON.stringify(descriptor);throw new Error('Unexpected Git action');};
 const reader=()=>({authenticatedUser:async()=>({githubId:owner,login:'student'}),repository:async()=>({...repository,visibility:'public',ownerType:'User'}),source:async()=>{sources++;return {};}});
 const api={...authoring,applyPlan:async plan=>{stagedPlan=plan;return authoring.applyPlan(plan);}};
 const editor=createSharingEditor(vscode,host,{git,reader,authoring:api});return {root,editor,vscode,host,git,reader,opened,gitCalls,messages,states,stats:()=>({busy,sources,edits,saves,stagedPlan})};
}
test('Share opens a fully prefilled frozen GitHub form; never commits, pushes or sends an issue',async t=>{
 const f=await fixture(t,{approval:'Open GitHub form'});await f.editor.commands['zero.shareGame']();assert.equal(f.opened.length,1);const url=new URL(f.opened[0]);assert.equal(url.pathname,'/codepetca/zero/issues/new');assert.match(url.searchParams.get('body'),new RegExp('a'.repeat(40)));assert.equal(f.stats().sources,1);assert.ok(f.gitCalls.every(args=>['rev-parse','remote','status','show'].includes(args[0])));assert.equal(f.stats().busy,false);
});
test('cancelled Share, inactive policy and mismatched authenticated owner never open a form',async t=>{
 const cancelled=await fixture(t);await cancelled.editor.commands['zero.shareGame']();assert.equal(cancelled.opened.length,0);
 const inactive=await fixture(t,{policy:''});await assert.rejects(inactive.editor.commands['zero.shareGame'](),/active reviewed policy/);assert.equal(inactive.gitCalls.length,0);
 const other=await fixture(t,{owner:'8',approval:'Open GitHub form'});await assert.rejects(other.editor.commands['zero.shareGame'](),/personal GitHub account/);assert.equal(other.opened.length,0);
});
test('extraction cancellation, unsaved changes and source drift preserve files; explicit import and ignore are previewed',async t=>{
 for(const opts of [{},{dirty:true,approval:'Apply'},{drift:true,approval:'Apply'}]) {
  const f=await fixture(t,opts);if(opts.dirty||opts.drift)await assert.rejects(f.editor.commands['zero.extractLibrary'](),/Save your project|changed after preview/);else await f.editor.commands['zero.extractLibrary']();
  await fs.access(path.join(f.root,'src/main/java/Health.java'));assert.equal(f.stats().busy,false);await assert.rejects(fs.access(path.join(f.root,'.gitignore')));
 }
 const applied=await fixture(t,{approval:'Apply'});await applied.editor.commands['zero.extractLibrary']();assert.match(await fs.readFile(path.join(applied.root,'src/main/java/Main.java'),'utf8'),/import zero.contrib.r12345.health_bar.Health;/);assert.match(await fs.readFile(path.join(applied.root,'.gitignore'),'utf8'),/\.zero-sharing-recovery\//);assert.ok(applied.stats().stagedPlan.changes.some(c=>c.path==='.gitignore'));assert.equal(applied.stats().busy,false);assert.match(applied.states.at(-1),/Library extracted/);assert.ok(!applied.messages.some(text=>text.startsWith('Library extracted')));
});
test('ordinary extraction records current project core support without manual metadata editing',async t=>{
 const f=await fixture(t,{approval:'Apply'}),core=require('../src/core-contract'),sources={};
 for(const name of core.coreSourcePaths) {
  sources[name]=await fs.readFile(path.resolve(__dirname,'../../framework',name));
  await fs.mkdir(path.dirname(path.join(f.root,name)),{recursive:true});await fs.writeFile(path.join(f.root,name),sources[name]);
 }
 const record=core.makeCoreRecord(sources);await fs.writeFile(path.join(f.root,'zero-core.json'),JSON.stringify(record));
 await f.editor.commands['zero.extractLibrary']();
 const descriptor=JSON.parse(await fs.readFile(path.join(f.root,'libraries/health-bar/zero-library.json')));
 assert.equal(descriptor.schema,2);assert.deepEqual(descriptor.coreRequirement,{minVersion:'0.3.0',maxExclusive:'0.4.0'});
 assert.deepEqual(descriptor.coreInput,{version:'0.3.0',sourceSha256:record.sourceSha256});
 assert.equal(f.stats().stagedPlan.coreSnapshot.length,17);
});
test('Use published version passes the selected verified release into core-aware mode planning',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.root,'pom.xml'));
 const identity=require('../src/sharing/contracts').identity('library','12345','health-bar');
 const release={schema:2,kind:'library',id:identity.id,status:'available',version:'2.0.0',title:'Health',coreRequirement:{minVersion:'0.4.0',maxExclusive:'0.5.0'}};
 let verified=0,planned=0;
 const api={...authoring,discoverLibraries:async()=>[{slug:'health-bar',mode:'local',identity,descriptor:{schema:1,title:'Health',version:'0.1.0'}}],previewMode:async(root,options)=>{
  planned++;assert.equal(root,f.root);assert.equal(options.publishedRelease,release);assert.equal(options.version,'2.0.0');
  throw new Error('Selected release core requirement blocks the mode switch.');
 }};
 f.vscode.window.showQuickPick=async entries=>entries.find(entry=>entry.mode==='published')||entries[0];
 const editor=createSharingEditor(f.vscode,f.host,{authoring:api,consumer:{loadCatalog:async()=>({catalog:{releases:[release]}}),verifyLibrary:async(context,selected)=>{assert.equal(selected,release);verified++;}}});
 await assert.rejects(editor.commands['zero.switchLibraryMode'](),/Selected release core requirement/);
 assert.equal(verified,1);assert.equal(planned,1);assert.deepEqual(await fs.readFile(path.join(f.root,'pom.xml')),before);
});
test('direct import rewriting preserves strings/comments and complex qualified references take manual path',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'src/main/java/Health.java'),'package game; public class Health {}');
 await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'import game.Health; public class Main { Health h; String text="import game.Health;"; /* import game.Health; */ }');
 const edits=await importEdits(f.root,['src/main/java/Health.java'],'zero.contrib.r12345.health_bar');assert.match(edits[0].after,/import zero.contrib.r12345.health_bar.Health;/);assert.match(edits[0].after,/String text="import game.Health;"/);assert.match(edits[0].after,/\/\* import game.Health; \*\//);
 await fs.writeFile(path.join(f.root,'src/main/java/Main.java'),'public class Main { game.Health h; }');await assert.rejects(importEdits(f.root,['src/main/java/Health.java'],'zero.contrib.r12345.health_bar'),/manual package\/import/);
});

test('native Add applies one undoable reviewed POM edit; cancellation and document drift do not save',async t=>{
 for(const scenario of ['apply','cancel','drift']) {
  const f=await fixture(t,{approval:scenario==='cancel'?undefined:'Apply'}),before=await fs.readFile(path.join(f.root,'pom.xml'),'utf8');let edits=0,saves=0,text=before;
  const release={status:'available',kind:'library',id:'lib-r12345-health-bar',version:'0.1.0',title:'Health',description:'Fixture',contributor:{login:'student'},namespace:'zero.contrib.r12345.health_bar'};
  const document={version:1,isDirty:false,getText:()=>text,positionAt:x=>x,save:async()=>{saves++;await fs.writeFile(path.join(f.root,'pom.xml'),text);document.isDirty=false;return true;}};
  f.vscode.workspace.openTextDocument=async()=>document;f.vscode.window.showTextDocument=async()=>({edit:async callback=>{edits++;callback({replace:(_,newText)=>{text=newText;document.version++;document.isDirty=true;}});return true;}});
  const api={loadCatalog:async()=>({catalog:{releases:[release]}}),planChange:async()=>({root:f.root,beforeText:before,afterText:before+'<!-- exact pin -->',release,current:null}),validatePlan:async()=>{if(scenario==='drift')document.version++;}};
  const editor=createSharingEditor(f.vscode,f.host,{consumer:api});if(scenario==='drift')await assert.rejects(editor.commands['zero.browseHub'](),/POM changed/);else await editor.commands['zero.browseHub']();
  assert.equal(edits,scenario==='apply'?1:0);assert.equal(saves,scenario==='apply'?1:0);assert.equal(f.stats().busy,false);
 }
});
test('undismissed Add and empty-catalog notices release the Zero command guard',async t=>{
 for(const scenario of ['add','empty-library','empty-game']) {
  let dismiss,timer;const notification=new Promise(resolve=>{dismiss=resolve;});t.after(()=>dismiss());
  const f=await fixture(t,{approval:'Apply',notification}),before=await fs.readFile(path.join(f.root,'pom.xml'),'utf8');let text=before,edits=0,saves=0,loads=0;
  const release={status:'available',kind:'library',id:'lib-r12345-health-bar',version:'0.1.0',title:'Health',description:'Fixture',contributor:{login:'student'},namespace:'zero.contrib.r12345.health_bar'};
  const document={version:1,isDirty:false,getText:()=>text,positionAt:x=>x,save:async()=>{saves++;await fs.writeFile(path.join(f.root,'pom.xml'),text);document.isDirty=false;return true;}};
  f.vscode.workspace.openTextDocument=async()=>document;f.vscode.window.showTextDocument=async()=>({edit:async callback=>{edits++;callback({replace:(_,newText)=>{text=newText;document.version++;document.isDirty=true;}});return true;}});
  const api={loadCatalog:async()=>{loads++;return {catalog:{releases:scenario==='add'&&loads===1?[release]:[]}};},planChange:async()=>({root:f.root,beforeText:before,afterText:before+'<!-- exact pin -->',release,current:null}),validatePlan:async()=>{}};
  const editor=createSharingEditor(f.vscode,f.host,{consumer:api}),command=scenario==='empty-game'?'zero.browseGames':'zero.browseHub';
  const completed=await Promise.race([editor.commands[command]().then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]).finally(()=>clearTimeout(timer));
  assert.equal(completed,true,'Informational notices must not block the completed command');assert.equal(f.stats().busy,false);
  assert.equal(edits,scenario==='add'?1:0);assert.equal(saves,scenario==='add'?1:0);
  await editor.commands[command]();assert.equal(loads,2,'Another command must start while the original notice remains open');assert.equal(f.stats().busy,false);
 }
});
test('game Open verifies selected bytes, requests a new destination and opens a separate window without running',async t=>{
 const f=await fixture(t,{approval:'Open project'}),destination=path.join(f.root,'opened-game'),calls=[];
 const bytes=Buffer.from('finite archive fixture'),release={status:'available',kind:'game',id:'game-r12345-game',version:'1.0.0',title:'Game',description:'Fixture',contributor:{login:'student'},artifacts:{zip:{sha256:authoring.hash(bytes)}}};
 f.vscode.window.showSaveDialog=async()=>({fsPath:destination});f.vscode.commands.executeCommand=async(...args)=>calls.push(args);
 const editor=createSharingEditor(f.vscode,f.host,{consumer:{loadCatalog:async()=>({catalog:{releases:[release]}}),downloadGame:async(_context,selected)=>{assert.equal(selected,release);return bytes;}},archive:{extractGamePackage:async options=>{assert.equal(options.bytes,bytes);assert.equal(options.destination,destination);assert.equal(options.expectedSha256,authoring.hash(bytes));await fs.mkdir(destination);}}});
 await editor.commands['zero.openProject']();assert.equal(calls.length,1);assert.equal(calls[0][0],'vscode.openFolder');assert.deepEqual(calls[0][2],{forceNewWindow:true});assert.equal(f.stats().busy,false);
});
test('native recovery restores a reviewed extraction while keeping private receipt ignores',async t=>{
 const f=await fixture(t,{approval:'Apply'});await f.editor.commands['zero.extractLibrary']();f.vscode.window.showInformationMessage=async()=> 'Restore originals';await f.editor.commands['zero.recoverLibraryChange']();
 await fs.access(path.join(f.root,'src/main/java/Health.java'));assert.equal(await fs.readFile(path.join(f.root,'.zero-sharing-recovery/.gitignore'),'utf8'),'*\n');await assert.rejects(fs.access(path.join(f.root,'.gitignore')));assert.equal(f.stats().busy,false);
});

test('explicit scoped settings precede bundled operator configuration and real manifest defaults',async t=>{
 const manifest=require('../package.json').contributes.configuration.properties,bundle={catalogUrl:'https://operator.example/catalog.json',artifactOrigin:'https://artifacts.example',policyRevision:'e'.repeat(40)};
 for(const overrides of [null,{level:'globalValue',catalog:'https://global.example/catalog.json',origin:'https://global-files.example'},{level:'workspaceValue',catalog:'https://workspace.example/catalog.json',origin:'https://workspace-files.example'},{level:'workspaceFolderValue',catalog:'https://folder.example/catalog.json',origin:'https://folder-files.example'}]) {
  const f=await fixture(t);let observed,resource;f.vscode.workspace.workspaceFolders=[{uri:{fsPath:f.root}}];
  f.vscode.workspace.getConfiguration=(_section,uri)=>{resource=uri;return {get:key=>manifest['zero.'+key].default,inspect:key=>({defaultValue:manifest['zero.'+key].default,...(overrides?{[overrides.level]:key==='sharingCatalogUrl'?overrides.catalog:key==='sharingArtifactOrigin'?overrides.origin:'f'.repeat(40)}:{})})};};
  const editor=createSharingEditor(f.vscode,f.host,{kitConfiguration:bundle,consumer:{loadCatalog:async settings=>{observed=settings;return {catalog:{releases:[]}};}}});await editor.commands['zero.browseHub']();
  assert.equal(observed.catalogUrl,overrides?.catalog||bundle.catalogUrl);assert.equal(observed.artifactOrigin,overrides?.origin||bundle.artifactOrigin);assert.equal(resource.fsPath,f.root);
 }
 const f=await fixture(t);let observed;f.vscode.workspace.getConfiguration=()=>({get:key=>manifest['zero.'+key].default,inspect:key=>({defaultValue:manifest['zero.'+key].default,globalValue:key==='sharingCatalogUrl'?'https://global.example/catalog.json':key==='sharingArtifactOrigin'?'https://global-files.example':undefined,workspaceValue:key==='sharingCatalogUrl'?'https://workspace.example/catalog.json':undefined,workspaceFolderValue:key==='sharingCatalogUrl'?'https://folder.example/catalog.json':undefined})});
 const editor=createSharingEditor(f.vscode,f.host,{kitConfiguration:bundle,consumer:{loadCatalog:async settings=>{observed=settings;return {catalog:{releases:[]}};}}});await editor.commands['zero.browseHub']();assert.equal(observed.catalogUrl,'https://folder.example/catalog.json');assert.equal(observed.artifactOrigin,'https://global-files.example');
});
test('explicit empty operator settings disable bundled activation; policy uses same precedence',async t=>{
 const manifest=require('../package.json').contributes.configuration.properties,bundle={catalogUrl:'https://operator.example/catalog.json',artifactOrigin:'https://artifacts.example',policyRevision:'e'.repeat(40)},f=await fixture(t);let observed;
 f.vscode.workspace.getConfiguration=()=>({get:key=>manifest['zero.'+key].default,inspect:key=>({defaultValue:manifest['zero.'+key].default,...(['sharingArtifactOrigin','sharingPolicyRevision'].includes(key)?{globalValue:''}:{})})});
 const editor=createSharingEditor(f.vscode,f.host,{kitConfiguration:bundle,consumer:{loadCatalog:async settings=>{observed=settings;return {catalog:{releases:[]}};}}});await editor.commands['zero.browseHub']();assert.equal(observed.artifactOrigin,'');await assert.rejects(editor.commands['zero.shareGame'](),/active reviewed policy/);assert.equal(f.gitCalls.length,0);
});

test('Share policy revision follows bundled settings until explicitly overridden',async t=>{
 const manifest=require('../package.json').contributes.configuration.properties,bundle={catalogUrl:'https://operator.example/catalog.json',artifactOrigin:'https://artifacts.example',policyRevision:'e'.repeat(40)};
 for(const override of [undefined,'f'.repeat(40)]) {
  const f=await fixture(t,{approval:'Open GitHub form'});f.vscode.workspace.getConfiguration=()=>({get:key=>manifest['zero.'+key].default,inspect:key=>({defaultValue:manifest['zero.'+key].default,...(key==='sharingPolicyRevision'&&override!==undefined?{globalValue:'d'.repeat(40),workspaceValue:'c'.repeat(40),workspaceFolderValue:override}:{})})});
  const editor=createSharingEditor(f.vscode,f.host,{kitConfiguration:bundle,git:f.git,reader:f.reader});await editor.commands['zero.shareGame']();assert.equal(f.opened.length,1);const body=new URL(f.opened[0]).searchParams.get('body');const request=JSON.parse(/```json\n([\s\S]*?)\n```/.exec(body)[1]);assert.equal(request.policyRevision,override||bundle.policyRevision);
 }
});

test('Share attaches the exact verified playable receipt without changing source metadata',async t=>{
 const f=await fixture(t,{approval:'Open GitHub form'}),before=await fs.readFile(path.join(f.root,'zero-game.json'));
 const web={provider:'github-pages',url:'https://student.github.io/game/',commit:'a'.repeat(40),runId:42};
 let calls=0,detail='';f.host.verifiedPublication=async(root,commit)=>{assert.equal(root,f.root);assert.equal(commit,web.commit);calls++;return web;};
 const original=f.vscode.window.showInformationMessage;f.vscode.window.showInformationMessage=async(...args)=>{if(args[1]?.modal)detail=args[1].detail;return original(...args);};
 await f.editor.commands['zero.shareGame']();
 const request=JSON.parse(/```json\n([\s\S]*?)\n```/.exec(new URL(f.opened[0]).searchParams.get('body'))[1]);
 assert.deepEqual(request.web,web);assert.equal(calls,1);assert.match(detail,/Play latest: https:\/\/student.github.io\/game\//);
 assert.deepEqual(await fs.readFile(path.join(f.root,'zero-game.json')),before);assert.equal(f.stats().busy,false);
});
test('source-only sharing stays available and a mismatched web commit cannot enter its form',async t=>{
 const plain=await fixture(t,{approval:'Open GitHub form'});plain.host.verifiedPublication=async()=>undefined;await plain.editor.commands['zero.shareGame']();
 const request=JSON.parse(/```json\n([\s\S]*?)\n```/.exec(new URL(plain.opened[0]).searchParams.get('body'))[1]);assert.equal(Object.hasOwn(request,'web'),false);
 const stale=await fixture(t,{approval:'Open GitHub form'});stale.host.verifiedPublication=async()=>({provider:'github-pages',url:'https://student.github.io/game/',commit:'b'.repeat(40),runId:42});
 await assert.rejects(stale.editor.commands['zero.shareGame'](),/exact shared source/i);assert.equal(stale.opened.length,0);assert.equal(stale.stats().busy,false);
});
test('native game discovery offers Play latest without downloading or opening source',async t=>{
 const f=await fixture(t),web={provider:'github-pages',url:'https://student.github.io/game/',commit:'a'.repeat(40),runId:42};
 const release={kind:'game',status:'available',title:'Game',version:'0.1.0',description:'Game',contributor:{login:'student'},source:{commit:web.commit},web};
 f.vscode.window.showQuickPick=async entries=>entries[0];f.vscode.window.showSaveDialog=async()=>assert.fail('Play must not ask for a source folder');
 const editor=createSharingEditor(f.vscode,f.host,{consumer:{loadCatalog:async()=>({catalog:{releases:[release]}}),downloadGame:async()=>assert.fail('Play must not download source')}});
 await editor.commands['zero.browseGames']();assert.deepEqual(f.opened,[web.url]);assert.equal(f.stats().busy,false);
});

test('reconnected same-folder same-commit projects can Share source without a stale playable receipt',async t=>{
 const {createWebPublishCommands}=require('../src/web-publish-ui');
 for(const accountDrift of [false,true]) {
  const f=await fixture(t,{approval:'Open GitHub form'});let verifyCalls=0,accountChanged=false;
  const saved={root:f.root,sha:'a'.repeat(40),resume:{repository:'https://github.com/student/previous-game',sha:'a'.repeat(40),runId:42}};
  const publishing=createWebPublishCommands(f.vscode,{project:f.host.project,isSimulation:()=>false,isBusy:()=>true,workspaceState:{get:()=>saved},publisherFactory:()=>({verifyLink:async()=>{verifyCalls++;accountChanged=accountDrift;const error=new Error('The connected repository changed');error.code='WEB_PUBLISH_REPOSITORY_CHANGED';throw error;}})});
  t.after(()=>publishing.disposables.forEach(d=>d.dispose()));f.host.verifiedPublication=publishing.verifiedPublication;
  f.host.auth.assertCurrent=async()=>{if(accountChanged)throw Error('The GitHub account changed');};
  if(accountDrift) {await assert.rejects(f.editor.commands['zero.shareGame'](),/account changed/);assert.equal(f.opened.length,0);}
  else {await f.editor.commands['zero.shareGame']();const request=JSON.parse(/```json\n([\s\S]*?)\n```/.exec(new URL(f.opened[0]).searchParams.get('body'))[1]);assert.equal(request.repository.url,repository.url);assert.equal(request.commit,saved.sha);assert.equal(request.web,undefined);}
  assert.equal(verifyCalls,1);assert.equal(f.stats().busy,false);
 }
});

async function guidedFixture(t) {
 const f=await fixture(t,{approval:'Open GitHub form'});let dirty=true,sha='a'.repeat(40),web,uploads=0,publishes=0;const sourceCommits=[],verifiedCommits=[],prompts=[];
 const git=async(root,args)=>args[0]==='status'?dirty?' M zero-game.json\0':'':args[0]==='rev-parse'&&args[1]==='HEAD'?sha:args[0]==='show'?await fs.readFile(path.join(root,'zero-game.json'),'utf8'):f.git(root,args);
 const reader=()=>({...f.reader(),source:async request=>{sourceCommits.push(request.commit);return {};}});
 f.vscode.window.showQuickPick=async(entries,options)=>{prompts.push(options.title);return entries[0];};
 f.host.verifiedPublication=async(root,commit)=>{verifiedCommits.push(commit);return web?.commit===commit?web:undefined;};
 f.host.uploadForSharing=async()=>{uploads++;dirty=false;sha='c'.repeat(40);return {uploaded:true};};
 f.host.publishForSharing=async()=>{publishes++;sha='d'.repeat(40);web={provider:'github-pages',url:'https://student.github.io/game/',commit:sha,runId:42};return {status:'live'};};
 const editor=createSharingEditor(f.vscode,f.host,{git,reader});
 return Object.assign(f,{editor,prompts,sourceCommits,verifiedCommits,setDirty:value=>{dirty=value;},setSha:value=>{sha=value;},statsGuided:()=>({uploads,publishes,sha}),request:()=>JSON.parse(/```json\n([\s\S]*?)\n```/.exec(new URL(f.opened[0]).searchParams.get('body'))[1])});
}
test('guided game Share uploads, optionally publishes, and freezes the fresh post-publication revision',async t=>{
 const f=await guidedFixture(t);await f.editor.commands['zero.shareGame']();
 assert.deepEqual(f.statsGuided(),{uploads:1,publishes:1,sha:'d'.repeat(40)});assert.deepEqual(f.sourceCommits,['c'.repeat(40),'d'.repeat(40)]);assert.deepEqual(f.verifiedCommits,['c'.repeat(40),'d'.repeat(40)]);assert.equal(f.request().commit,'d'.repeat(40));assert.equal(f.request().web.commit,f.request().commit);assert.match(f.states.at(-1),/Form opened.*submit on GitHub/);assert.equal(f.stats().busy,false);
});
test('game Share can explicitly select source only after upload',async t=>{
 const f=await guidedFixture(t);f.vscode.window.showQuickPick=async entries=>entries.find(e=>e.action==='source')||entries[0];await f.editor.commands['zero.shareGame']();assert.equal(f.statsGuided().uploads,1);assert.equal(f.statsGuided().publishes,0);assert.equal(f.request().web,undefined);assert.equal(f.request().commit,'c'.repeat(40));
});
test('cancelled upload decision keeps saved details and opens no form',async t=>{
 const f=await guidedFixture(t),before=await fs.readFile(path.join(f.root,'zero-game.json'));f.vscode.window.showQuickPick=async()=>undefined;await f.editor.commands['zero.shareGame']();assert.equal(f.statsGuided().uploads,0);assert.equal(f.opened.length,0);assert.deepEqual(await fs.readFile(path.join(f.root,'zero-game.json')),before);assert.match(f.states.at(-1),/details kept.*Commit & push/);
});
test('cancelled or failed handoffs never fall back to a source-only form',async t=>{
 for(const stage of ['upload','publish'])for(const result of ['cancel','fail']) {
  const f=await guidedFixture(t);const callback=async()=>{if(result==='fail')throw Error('handoff failed');return undefined;};f.host[stage==='upload'?'uploadForSharing':'publishForSharing']=callback;
  if(result==='fail')await assert.rejects(f.editor.commands['zero.shareGame'](),/handoff failed/);else await f.editor.commands['zero.shareGame']();assert.equal(f.opened.length,0);assert.equal(f.stats().busy,false);
 }
 const f=await guidedFixture(t);f.vscode.window.showQuickPick=async entries=>entries[0].action==='upload'?entries[0]:undefined;await f.editor.commands['zero.shareGame']();assert.equal(f.opened.length,0);assert.equal(f.statsGuided().publishes,0);
});
test('game Share local guard blocks reentry while host releases the global lock for upload',async t=>{
 const f=await guidedFixture(t);let reentries=0;
 f.host.uploadForSharing=async()=>{f.host.setBusy(false);await f.editor.commands['zero.shareGame']();await f.editor.commands['zero.sharingActions']();reentries++;f.setDirty(false);f.host.setBusy(true);return {uploaded:true};};
 await f.editor.commands['zero.shareGame']();assert.equal(reentries,1);assert.equal(f.opened.length,1);assert.equal(f.prompts.filter(p=>p==='Upload game before sharing').length,1);assert.equal(f.stats().busy,false);
});
test('handoffs recheck root, account, dirty files and committed metadata before opening a form',async t=>{
 for(const drift of ['root','account','dirty','metadata','repository','trust']) {
  const f=await guidedFixture(t);f.host.uploadForSharing=async()=>{f.setDirty(false);if(drift==='root')f.host.project=async()=>f.root+'-other';if(drift==='account')f.host.auth.assertCurrent=async()=>{throw Error('account changed');};if(drift==='dirty')f.setDirty(true);if(drift==='metadata'){const metadata=JSON.parse(await fs.readFile(path.join(f.root,'zero-game.json')));metadata.title='Unreviewed title';await fs.writeFile(path.join(f.root,'zero-game.json'),JSON.stringify(metadata));}if(drift==='repository')f.host.project=async()=>{throw Error('repository changed');};if(drift==='trust')f.vscode.workspace.isTrusted=false;return {uploaded:true};};
  await assert.rejects(f.editor.commands['zero.shareGame'](),/changed|Commit & push|Trust your own/);assert.equal(f.opened.length,0);assert.equal(f.stats().busy,false);
 }
});
test('new game metadata asks its version once and previews human-readable details',async t=>{
 const f=await guidedFixture(t);await fs.unlink(path.join(f.root,'zero-game.json'));const titles=[],details=[];
 f.vscode.window.showInputBox=async options=>{titles.push(options.title);return options.title==='Game name'?'game':options.value||'Game fixture';};
 f.vscode.window.showInformationMessage=async(message,options)=>{details.push(options.detail);return message==='Save sharing details?'?'Save details':'Open GitHub form';};
 await f.editor.commands['zero.shareGame']();assert.equal(titles.filter(title=>title==='Game version').length,1);assert.equal(titles.filter(title=>title==='Square PNG path').length,1);assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'zero-game.json'))).preview,'preview.png');assert.equal(titles.includes('Sharing version'),false);assert.match(details[0],/License: MIT/);assert.doesNotMatch(details[0],/"schema"/);assert.equal(f.opened.length,1);
});
test('new game screenshot cancellation or invalid bytes preserve source and open no form',async t=>{
 for(const scenario of ['cancel','invalid']){
  const f=await guidedFixture(t);await fs.unlink(path.join(f.root,'zero-game.json'));const original=await fs.readFile(path.join(f.root,'src/main/java/Main.java'));
  if(scenario==='invalid')await fs.writeFile(path.join(f.root,'preview.png'),'not a PNG');
  f.vscode.window.showInputBox=async options=>options.title==='Square PNG path'&&scenario==='cancel'?undefined:options.title==='Game name'?'game':options.value||'Game fixture';
  if(scenario==='invalid')await assert.rejects(f.editor.commands['zero.shareGame'](),/valid square PNG/);else await f.editor.commands['zero.shareGame']();
  await assert.rejects(fs.access(path.join(f.root,'zero-game.json')));assert.equal(f.opened.length,0);assert.equal(f.statsGuided().uploads,0);assert.deepEqual(await fs.readFile(path.join(f.root,'src/main/java/Main.java')),original);
 }
});
test('existing game without a screenshot saves its chosen path before the normal upload handoff',async t=>{
 const f=await guidedFixture(t),filename=path.join(f.root,'zero-game.json'),descriptor=JSON.parse(await fs.readFile(filename));delete descriptor.preview;await fs.writeFile(filename,JSON.stringify(descriptor,null,2)+'\n');
 let text=await fs.readFile(filename,'utf8');const document={isDirty:false,getText:()=>text,positionAt:value=>value,save:async()=>{await fs.writeFile(filename,text);return true;}};
 f.vscode.workspace.openTextDocument=async()=>document;f.vscode.window.showTextDocument=async()=>({edit:async callback=>{callback({replace:(_range,value)=>{text=value;}});return true;}});
 f.vscode.window.showInformationMessage=async message=>message==='Save sharing details?'?'Save details':'Open GitHub form';
 await f.editor.commands['zero.shareGame']();assert.equal(f.request().descriptor.preview,'preview.png');assert.equal(f.statsGuided().uploads,1);assert.equal(f.opened.length,1);
});
test('sharingActions delegates within its existing local guard and still opens Share game',async t=>{
 const f=await guidedFixture(t),pick=f.vscode.window.showQuickPick;
 f.vscode.window.showQuickPick=async(entries,options)=>options.title==='Libraries and games'?entries.find(e=>e.command==='zero.shareGame'):pick(entries,options);
 await f.editor.commands['zero.sharingActions']();assert.equal(f.statsGuided().uploads,1);assert.equal(f.opened.length,1);assert.equal(f.stats().busy,false);
});
test('a successful publish handoff needs a newly verified receipt and never silently shares source only',async t=>{
 const f=await guidedFixture(t);f.host.publishForSharing=async()=>({status:'live'});await assert.rejects(f.editor.commands['zero.shareGame'](),/could not be verified.*exact source/);assert.equal(f.opened.length,0);
});
test('post-upload source verification failures and committed descriptor mismatches stop Share',async t=>{
 for(const failure of ['source','descriptor']) {
  const f=await guidedFixture(t);const git=async(root,args)=>args[0]==='status'?'':args[0]==='show'&&failure==='descriptor'?JSON.stringify({...JSON.parse(await fs.readFile(path.join(root,'zero-game.json'))),version:'0.2.0'}):f.git(root,args);
  const reader=()=>({...f.reader(),source:async()=>{if(failure==='source')throw Error('source not uploaded');return {};}});
  const editor=createSharingEditor(f.vscode,f.host,{git,reader});await assert.rejects(editor.commands['zero.shareGame'](),/committed sharing details differ|source not uploaded/);assert.equal(f.opened.length,0);
 }
});
test('library Share remains read-only even when game handoff callbacks exist',async t=>{
 const f=await fixture(t,{approval:'Apply'});await f.editor.commands['zero.extractLibrary']();let handoffs=0;f.host.uploadForSharing=f.host.publishForSharing=async()=>{handoffs++;return {};};
 const editor=createSharingEditor(f.vscode,f.host,{git:async(root,args)=>args[0]==='status'?' M pom.xml\0':f.git(root,args),reader:f.reader});
 await assert.rejects(editor.commands['zero.shareLibrary'](),/Commit & push through the reviewed/);assert.equal(handoffs,0);assert.equal(f.opened.length,0);assert.equal(f.stats().busy,false);
});
test('upload and publish accept same-account native token rotations and reject account changes',async t=>{
 for(const stage of ['upload','publish'])for(const changedAccount of [false,true]) {
  const f=await guidedFixture(t);let revision=1,accountId='7';
  f.host.auth.capture=async()=>({session:{accountId,accessToken:'native-token-'+revision,label:'student'},revision});
  f.host.auth.assertCurrent=async ticket=>{if(ticket.revision!==revision||ticket.session.accountId!==accountId)throw Error('stale session');};
  const key=stage==='upload'?'uploadForSharing':'publishForSharing',original=f.host[key];
  f.host[key]=async root=>{const result=await original(root);revision++;if(changedAccount)accountId='8';return result;};
  if(changedAccount){await assert.rejects(f.editor.commands['zero.shareGame'](),/account changed during sharing/);assert.equal(f.opened.length,0);}else{await f.editor.commands['zero.shareGame']();assert.equal(f.opened.length,1);assert.equal(f.request().web.commit,'d'.repeat(40));}
  assert.equal(f.stats().busy,false);
 }
});
test('simulated, incomplete and action-required handoff results cannot advance Share',async t=>{
 for(const result of [{},{uploaded:false},{uploaded:'true'},{status:'simulated'},{status:'action-required'},{status:'ready'}])for(const stage of ['upload','publish']) {
  const f=await guidedFixture(t);f.host[stage==='upload'?'uploadForSharing':'publishForSharing']=async()=>result;await f.editor.commands['zero.shareGame']();assert.equal(f.opened.length,0);assert.match(f.states.at(-1),/Share paused/);assert.equal(f.stats().busy,false);
 }
});
