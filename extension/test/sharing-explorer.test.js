'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createSharingEditor}=require('../src/sharing/editor');
const authoring=require('../src/sharing/authoring');
const {readProjectModel}=require('../src/project-explorer-model');

async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-sharing-explorer-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.copyFile(path.resolve(__dirname,'../../student-template/pom.xml'),path.join(root,'pom.xml'));
 await fs.writeFile(path.join(root,'zero.json'),'{}');
 await fs.mkdir(path.join(root,'src/main/java'),{recursive:true});
 await fs.writeFile(path.join(root,'src/main/java/Health.java'),'public class Health {}\n');
 await fs.writeFile(path.join(root,'LICENSE'),'MIT\n');
 const repository={id:'12345',ownerId:'123',owner:'student',name:'game',url:'https://github.com/student/game'};
 const descriptor={schema:1,kind:'library',slug:'health-bar',version:'1.0.0',title:'Health bar',description:'Helper',license:'MIT',libraryKind:'helper'};
 await authoring.applyPlan(await authoring.previewExtraction(root,{repository,descriptor,sources:['src/main/java/Health.java']}));
 let activeRoot=root,busy=false,provider,onClose,shown=[],pickCount=0,info;const copied=[];
 const vscode={Uri:{parse:value=>value,file:fsPath=>({fsPath})},env:{clipboard:{writeText:async value=>{copied.push(value);}}},workspace:{isTrusted:true,textDocuments:[],getConfiguration:()=>({get:(_key,fallback)=>fallback}),registerTextDocumentContentProvider:(_scheme,value)=>{provider=value;return {dispose(){}};},onDidCloseTextDocument:listener=>{onClose=listener;return {dispose(){onClose=undefined;}};},openTextDocument:async uri=>({uri,content:provider.provideTextDocumentContent(uri)})},window:{showQuickPick:async values=>{pickCount++;return values[0];},showInformationMessage:async(...args)=>info?.(...args),showTextDocument:async document=>{shown.push(document);},withProgress:async(_opts,callback)=>callback({report(){}},{onCancellationRequested:()=>({dispose(){}})})},ProgressLocation:{Notification:1},commands:{executeCommand:async()=>{}}};
 const host={project:async()=>activeRoot,isBusy:()=>busy,setBusy:value=>{busy=value;},output:{appendLine(){},show(){}},setState(){}};
 const makeEditor=options=>createSharingEditor(vscode,host,options);
 const context={root,libraryId:'lib-r12345-health-bar'};
 return {root,context,vscode,host,makeEditor,shown,copied,picks:()=>pickCount,close:document=>onClose?.(document),provided:uri=>provider.provideTextDocumentContent(uri),setRoot:value=>{activeRoot=value;},setInfo:value=>{info=value;}};
}

test('selected local reference reads public source and labels the local README and examples',async t=>{
 const f=await fixture(t),folder='libraries/health-bar';
 await fs.writeFile(path.join(f.root,folder,'README.md'),'Use Health in your app.\n');
 await fs.mkdir(path.join(f.root,folder,'examples'),{recursive:true});
 await fs.writeFile(path.join(f.root,folder,'examples/Example.java'),'public class Example { Health h; }\n');
 const result=await f.makeEditor().commands['zero.libraryReference'](f.context);
 assert.equal(f.shown.length,1);assert.match(f.shown[0].content,/Active mode: Local source/);
 assert.match(f.shown[0].content,/Active version: 1\.0\.0/);
 assert.match(f.shown[0].content,/import zero\.contrib\.r12345\.health_bar\.Health;/);
 assert.match(f.shown[0].content,/Local README:[\s\S]*Use Health/);
 assert.match(f.shown[0].content,/Example: libraries\/health-bar\/examples\/Example.java/);
 assert.match(result.imports,/import zero\.contrib\.r12345\.health_bar\.Health;/);
 assert.equal(f.picks(),0);
});

test('selected published reference shows only the exact active catalog component inventory',async t=>{
 const f=await fixture(t);
 await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
 let loads=0,downloads=0;
 const release={kind:'library',id:f.context.libraryId,version:'1.2.3',status:'available',components:[{className:'zero.contrib.r12345.health_bar.Health',description:'Health helper',usage:'Health h = new Health();',api:['public Health()']} ]};
 const editor=f.makeEditor({consumer:{loadCatalog:async()=>{loads++;return {catalog:{releases:[{...release,version:'9.9.9'},release]}};},verifyLibrary:async()=>{downloads++;}}});
 await editor.commands['zero.libraryReference'](f.context);
 assert.equal(loads,1);assert.equal(downloads,0);assert.equal(f.picks(),0);
 assert.match(f.shown[0].content,/Active mode: Published dependency/);
 assert.match(f.shown[0].content,/Active version: 1\.2\.3/);
 assert.match(f.shown[0].content,/Health h = new Health\(\);/);
 assert.match(f.shown[0].content,/public Health\(\)/);
 assert.doesNotMatch(f.shown[0].content,/9\.9\.9/);
 assert.doesNotMatch(f.shown[0].content,/Local README/);
});

test('offline published reference and missing exact inventory show no fabricated imports',async t=>{
 const f=await fixture(t);
 await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
 await f.makeEditor({consumer:{loadCatalog:async()=>{throw new Error('offline');}}}).commands['zero.libraryReference'](f.context);
 assert.match(f.shown[0].content,/catalog is unavailable/);assert.doesNotMatch(f.shown[0].content,/import zero\./);
 await f.makeEditor({consumer:{loadCatalog:async()=>({catalog:{releases:[]}})}}).commands['zero.libraryReference'](f.context);
 assert.match(f.shown[1].content,/Exact active release metadata is unavailable/);assert.doesNotMatch(f.shown[1].content,/import zero\./);
});

test('installed library pin resolves by ID and exact version without authored source',async t=>{
 const f=await fixture(t);
 await fs.rm(path.join(f.root,'libraries'),{recursive:true,force:true});
 await fs.rm(path.join(f.root,'zero-libraries.json'));
 const pom=await fs.readFile(path.resolve(__dirname,'../../student-template/pom.xml'),'utf8');
 const pinned=pom.replace('</properties>','<!-- zero-sharing lib-r88-score-display history start -->\n<zero.sharing.lib-r88-score-display.previous>none</zero.sharing.lib-r88-score-display.previous>\n<!-- zero-sharing lib-r88-score-display history end -->\n</properties>')
  .replace('</dependencies>','<!-- zero-sharing lib-r88-score-display dependency start -->\n<dependency><groupId>ca.codepet.zero.contrib.r88</groupId><artifactId>score-display</artifactId><version>1.2.3</version></dependency>\n<!-- zero-sharing lib-r88-score-display dependency end -->\n</dependencies>')
  .replace('</project>','<repositories>\n<!-- zero-sharing repository start -->\n<repository><id>zero-sharing</id><url>https://artifacts.example/maven</url><releases><enabled>true</enabled></releases><snapshots><enabled>false</enabled></snapshots></repository>\n<!-- zero-sharing repository end -->\n</repositories></project>');
 await fs.writeFile(path.join(f.root,'pom.xml'),pinned);
 const id='lib-r88-score-display',release={kind:'library',id,version:'1.2.3',status:'available',components:[{className:'zero.contrib.r88.score_display.ScoreDisplay',usage:'ScoreDisplay score = new ScoreDisplay();',api:[]}]};
 const editor=f.makeEditor({consumer:{loadCatalog:async()=>({catalog:{releases:[release]}})}});
 await editor.commands['zero.libraryReference']({root:f.root,libraryId:id});
 assert.match(f.shown[0].content,/import zero\.contrib\.r88\.score_display\.ScoreDisplay;/);
 assert.match(f.shown[0].content,/Active version: 1\.2\.3/);
 assert.equal(f.picks(),0);
});

test('contextual commands reject stale roots, missing IDs and mode drift before guarded work',async t=>{
 const f=await fixture(t),editor=f.makeEditor();
 for(const command of ['zero.checkLibrary','zero.switchLibraryMode','zero.shareLibrary','zero.libraryReference']){
  await assert.rejects(editor.commands[command]({...f.context,root:f.root+'-old'}),/another project/);
  await assert.rejects(editor.commands[command]({...f.context,libraryId:'lib-r12345-missing'}),/no longer in this project/);
 }
 let called=0;f.setInfo(async()=>{await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));return 'Check library';});
 const check=f.makeEditor({checks:{prepareLocalCheck:async()=>{called++;}}});
 await assert.rejects(check.commands['zero.checkLibrary'](f.context),/selected library changed/);
 assert.equal(called,0);
 f.setRoot(f.root+'-other');await assert.rejects(editor.commands['zero.libraryReference'](f.context),/another project/);
});

test('reference refuses project or active version changes during fetch and document opening',async t=>{
 const f=await fixture(t);
 await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
 const model=await readProjectModel(f.root);assert.equal(model.libraries[0].version,'1.2.3');
 const changed=f.makeEditor({consumer:{loadCatalog:async()=>{await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'2.0.0'}));return {catalog:{releases:[]}};}}});
 await assert.rejects(changed.commands['zero.libraryReference'](f.context),/mode or version changed/);assert.equal(f.shown.length,0);
 await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
 f.vscode.workspace.openTextDocument=async uri=>{f.setRoot(f.root+'-other');return {uri};};
 const switched=f.makeEditor({consumer:{loadCatalog:async()=>({catalog:{releases:[]}})}});
 await assert.rejects(switched.commands['zero.libraryReference'](f.context),/project changed/);assert.equal(f.shown.length,0);
});

test('explicit copy action rechecks the active library before writing imports',async t=>{
 const f=await fixture(t);let reads=0;
 const editor=f.makeEditor({readProjectModel:async root=>{if(++reads===2)await authoring.applyPlan(await authoring.previewMode(root,{slug:'health-bar',mode:'published',version:'1.2.3'}));return readProjectModel(root);}});
 await assert.rejects(editor.commands['zero.copyLibraryImports'](f.context),/mode or version changed/);
 assert.deepEqual(f.copied,[]);assert.equal(f.shown.length,0);
 await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'local'}));
 await f.makeEditor().commands['zero.copyLibraryImports'](f.context);
 assert.deepEqual(f.copied,['import zero.contrib.r12345.health_bar.Health;']);
});

test('reference content is released on close and pending lookups stop after disposal',async t=>{
 const f=await fixture(t),editor=f.makeEditor();
 await editor.commands['zero.libraryReference'](f.context);
 const [document]=f.shown;assert.match(f.provided(document.uri),/import zero\.contrib/);
 f.close(document);assert.equal(f.provided(document.uri),'');
 await authoring.applyPlan(await authoring.previewMode(f.root,{slug:'health-bar',mode:'published',version:'1.2.3'}));
 let releaseFetch;const waiting=f.makeEditor({consumer:{loadCatalog:async()=>new Promise(resolve=>{releaseFetch=resolve;})}});
 const pending=waiting.commands['zero.libraryReference'](f.context);
 while(!releaseFetch)await new Promise(resolve=>setImmediate(resolve));
 for(const disposable of waiting.disposables)disposable.dispose();
 releaseFetch({catalog:{releases:[]}});
 await assert.rejects(pending,/reference view has closed/);assert.equal(f.shown.length,1);
 for(const disposable of editor.disposables)disposable.dispose();assert.equal(f.provided(document.uri),'');
});

test('read-only reference provider retains a bounded number of documents',async t=>{
 const f=await fixture(t),model=await readProjectModel(f.root),editor=f.makeEditor({readProjectModel:async()=>model});
 for(let index=0;index<17;index++)await editor.commands['zero.libraryReference'](f.context);
 assert.equal(f.provided(f.shown[0].uri),'');
 assert.match(f.provided(f.shown.at(-1).uri),/Active mode: Local source/);
});
