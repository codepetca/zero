'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createTutorialReader,cleanState,rootKey} = require('../src/tutorial-reader');
const {loadContent} = require('../src/tutorial-content');
function fake() {
  const panels=[], saved=new Map(), external=[], copied=[], errors=[], serializers=new Map();
  const context={extensionPath:path.resolve(__dirname,'..'),workspaceState:{get:key=>saved.get(key),update:async(key,value)=>saved.set(key,value)}};
  const vscode={Uri:{file:filename=>({fsPath:filename,toString:()=>`file://${filename}`}),parse:url=>url},ViewColumn:{Beside:-2},window:{registerWebviewPanelSerializer:(type,serializer)=>{serializers.set(type,serializer);return {dispose:()=>serializers.delete(type)};},createWebviewPanel:(kind,title,show,options)=>{
    let receive;const disposals = new Set();
    const panel={kind,title,show,options,reveals:[],messages:[],viewColumn:2,webview:{cspSource:'https://webview.test',asWebviewUri:uri=>({toString:()=>`https://webview.test${uri.fsPath}`}),postMessage:async message=>panel.messages.push(message),onDidReceiveMessage:callback=>{receive=callback;}},onDidDispose:callback=>{disposals.add(callback);return {dispose:()=>disposals.delete(callback)};},dispose:()=>{panel.disposed=true;for(const callback of [...disposals]) callback();},reveal:(...args)=>panel.reveals.push(args),receive:message=>receive(message)};
    panels.push(panel);return panel;
  },showErrorMessage:async text=>errors.push(text)},env:{openExternal:async uri=>{external.push(uri);return true;},clipboard:{writeText:async text=>copied.push(text)}}};
  return {vscode,context,panels,saved,external,copied,errors,serializers};
}
test('reader opens beside Java with bounded resources/CSP and restores per-root reading position',async () => {
  const f=fake();
  f.saved.set(rootKey('/project-a'),{lessonId:'5',scroll:{5:420},details:{'explanation-5':true}});
  const reader=createTutorialReader(f.vscode,{context:f.context,project:async()=>'/project-a'});
  const panel=await reader.open('/project-a','3');
  assert.equal(panel.title,'Tutorials');
  assert.equal(reader.columnFor('/project-a'),2);
  assert.equal(reader.columnFor('/project-other'),undefined);
  assert.equal(panel.show.viewColumn,-2);
  assert.equal(panel.options.retainContextWhenHidden,true);
  assert.equal(panel.options.enableCommandUris,false);
  assert.deepEqual(panel.options.localResourceRoots.map(uri=>uri.fsPath),[path.join(f.context.extensionPath,'media')]);
  assert.match(panel.webview.html,/default-src 'none'/);
  assert.match(panel.webview.html,/connect-src 'none'/);
  assert.match(panel.webview.html,/nonce-[A-Za-z0-9+/]+=*/);
  assert.match(panel.webview.html,/Open in browser/);
  assert.match(panel.webview.html,/tutorial-reader\.js/);
  await panel.receive({type:'ready'});
  assert.equal(panel.messages[0].state.lessonId,'5');
  assert.equal(panel.messages[0].state.scroll[5],420);
  assert.equal(await reader.open('/project-a','0'),panel);
  assert.equal(f.panels.length,1);
  await panel.receive({type:'state',state:{readerKey:rootKey('/project-a'),lessonId:'6',scroll:{6:88},details:{'explanation-6':true}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.saved.get(rootKey('/project-a')).lessonId,'6');
  panel.dispose();
  assert.equal(reader.columnFor('/project-a'),undefined);
  const reopened=await reader.open('/project-a','3');await reopened.receive({type:'ready'});
  assert.equal(reopened.messages[0].state.lessonId,'6');
  const other=await reader.open('/project-b','8');await other.receive({type:'ready'});
  assert.equal(other.messages[0].state.lessonId,'8');
  reader.dispose();
});
test('browser and clipboard messages are fixed allowlists with no project writes or arbitrary commands',async () => {
  const f=fake();const reader=createTutorialReader(f.vscode,{context:f.context});const panel=await reader.open();
  await panel.receive({type:'ready'});
  for(const message of [{type:'browser',lessonId:'../0'},{type:'external',url:'file:///secret'},{type:'external',url:'https://evil.test'},{type:'external',url:'https://zero.codepet.ca/hub?kind=practice&redirect=evil'},{type:'copy',id:'unknown'},{type:'execute',command:'delete'}]) await panel.receive(message);
  assert.deepEqual(f.external,[]);assert.deepEqual(f.copied,[]);
  await panel.receive({type:'browser',lessonId:'3'});
  assert.deepEqual(f.external,['https://zero.codepet.ca/tutorials/3']);
  assert.match(panel.webview.html,/data-external="https:\/\/zero.codepet.ca\/hub\?kind=practice"/);
  await panel.receive({type:'external',url:'https://zero.codepet.ca/hub?kind=practice'});
  assert.equal(f.external.at(-1),'https://zero.codepet.ca/hub?kind=practice');
  await panel.receive({type:'copy',id:'code-0'});
  assert.ok(f.copied[0].includes('import zero.ui.Label;'));
  assert.deepEqual(panel.messages.at(-1),{type:'copied',id:'code-0',ok:true});
  f.vscode.env.clipboard.writeText=async()=>{throw new Error('clipboard unavailable');};
  await panel.receive({type:'copy',id:'code-0'});assert.equal(panel.messages.at(-1).ok,false);
  f.vscode.env.openExternal=async()=>false;await panel.receive({type:'browser',lessonId:'0'});
  assert.match(f.errors[0],/browser could not open/);
  reader.dispose();
});
test('empty workspace, concurrent opens, invalid states and disposal stay bounded',async () => {
  const f=fake();const bundle=await loadContent(f.context.extensionPath);let resolve;
  const reader=createTutorialReader(f.vscode,{context:f.context,project:async()=>{throw new Error('no project');},load:()=>new Promise(done=>{resolve=done;})});
  const a=reader.open(),b=reader.open();await new Promise(done=>setImmediate(done));resolve(bundle);
  assert.equal(await a,await b);assert.equal(f.panels.length,1);
  await f.panels[0].receive({type:'ready'});assert.equal(f.panels[0].messages[0].state.lessonId,'0');
  assert.deepEqual(cleanState({lessonId:'evil',scroll:{0:Infinity,1:-1,2:12},details:{evil:true,'explanation-2':true}}),{lessonId:'0',scroll:{2:12},details:{'explanation-2':true}});
  await assert.rejects(reader.open('relative','0'),/absolute/);
  await assert.rejects(reader.open('/project','12?evil'),/Unknown/);
  reader.dispose();assert.equal(await reader.open(),undefined);
});
test('serializer rehydrates the host panel and root-matched lesson, scroll and disclosures',async () => {
  const f=fake();const key=rootKey('/project-a');
  const reader=createTutorialReader(f.vscode,{context:f.context,project:async()=>'/project-a'});
  const serializer=f.serializers.get('zero.tutorials');assert.ok(serializer);
  const panel=f.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
  await serializer.deserializeWebviewPanel(panel,{readerKey:key,lessonId:'4',scroll:{4:512},details:{'explanation-4':true}});
  assert.equal(f.panels.length,1);
  assert.equal(await reader.open('/project-a'),panel);
  assert.match(panel.webview.html,/Tutorials/);
  await panel.receive({type:'ready'});
  assert.deepEqual(panel.messages[0].state,{readerKey:key,lessonId:'4',scroll:{4:512},details:{'explanation-4':true}});
  assert.equal(panel.webview.options.enableCommandUris,false);
  assert.equal(panel.webview.options.localResourceRoots.length,1);
  await panel.receive({type:'state',state:{readerKey:rootKey('/other'),lessonId:'12'}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(f.saved.has(key),false);
  reader.dispose();assert.equal(f.serializers.size,0);
});
test('serializer rejects another root state and uses current root workspace fallback',async () => {
  const f=fake();const key=rootKey('/project-b');
  f.saved.set(key,{lessonId:'8',scroll:{8:125},details:{'explanation-8':true}});
  const reader=createTutorialReader(f.vscode,{context:f.context,project:async()=>'/project-b'});
  const panel=f.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
  await f.serializers.get('zero.tutorials').deserializeWebviewPanel(panel,{readerKey:rootKey('/project-a'),lessonId:'4',scroll:{4:512}});
  await panel.receive({type:'ready'});
  assert.equal(panel.messages[0].state.lessonId,'8');assert.equal(panel.messages[0].state.readerKey,key);
  assert.deepEqual(panel.messages[0].state.scroll,{8:125});
  reader.dispose();
});
test('serializer and explicit open races keep one panel; disposal cancels delayed restore',async () => {
  const f=fake();const bundle=await loadContent(f.context.extensionPath);let finish;
  const reader=createTutorialReader(f.vscode,{context:f.context,project:async()=>'/project',load:()=>new Promise(resolve=>{finish=resolve;})});
  const serializer=f.serializers.get('zero.tutorials');
  const panel=f.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
  const restore=serializer.deserializeWebviewPanel(panel,{readerKey:rootKey('/project'),lessonId:'4'});
  await new Promise(resolve=>setImmediate(resolve));
  const opening=reader.open('/project');finish(bundle);await restore;
  assert.equal(await opening,panel);assert.equal(f.panels.length,1);
  const duplicate=f.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
  await serializer.deserializeWebviewPanel(duplicate,{});assert.equal(duplicate.disposed,true);
  reader.dispose();
  const g=fake();let rootReady;
  const other=createTutorialReader(g.vscode,{context:g.context,project:()=>new Promise(resolve=>{rootReady=resolve;})});
  const pending=g.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
  const restoring=g.serializers.get('zero.tutorials').deserializeWebviewPanel(pending,{});
  other.dispose();rootReady('/project');await restoring;
  assert.equal(pending.disposed,true);assert.equal(pending.webview.html,undefined);
});
test('legacy constructor mocks remain lazy and closing during bundle load cannot render a disposed panel',async () => {
  const reader=createTutorialReader({window:{}},{context:{workspaceState:{}}});reader.dispose();
  const f=fake();const bundle=await loadContent(f.context.extensionPath);let finish;
  const loading=createTutorialReader(f.vscode,{context:f.context,load:()=>new Promise(resolve=>{finish=resolve;})});
  const opening=loading.open('/project');await new Promise(resolve=>setImmediate(resolve));
  const panel=f.panels[0];panel.dispose();finish(bundle);
  assert.equal(await opening,undefined);assert.equal(panel.webview.html,undefined);loading.dispose();
});
test('webview restore handshake ignores local state from another root',() => {
  const vm=require('node:vm');const fs=require('node:fs');
  const rootA=rootKey('/project-a'),rootB=rootKey('/project-b');
  const articles=Array.from({length:13},(_,id)=>({dataset:{lessonId:String(id)},querySelector:()=>({focus(){}})}));
  const elements=new Map(['lesson-picker','lesson-index','status'].map(id=>[id,{addEventListener(){}}]));
  const handlers=new Map();let saved;
  const sandbox={document:{querySelectorAll:selector=>selector === '.lesson' ? articles : [],getElementById:id=>elements.get(id),addEventListener(){}},window:{addEventListener:(name,handler)=>handlers.set(name,handler),scrollY:0,scrollTo(x,y){this.scrollY=y;}},requestAnimationFrame:callback=>callback(),setTimeout,clearTimeout,acquireVsCodeApi:()=>({getState:()=>({readerKey:rootA,lessonId:'4',scroll:{4:400},details:{}}),setState:state=>{saved=structuredClone(state);},postMessage(){}})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../media/tutorial-reader.js'),'utf8'),sandbox);
  handlers.get('message')({data:{type:'restore',state:{readerKey:rootB,lessonId:'8',scroll:{8:88},details:{}}}});
  assert.equal(elements.get('lesson-picker').value,'8');assert.equal(saved.readerKey,rootB);assert.equal(saved.lessonId,'8');assert.equal(sandbox.window.scrollY,88);
  assert.equal(articles.filter(article=>!article.hidden)[0].dataset.lessonId,'8');
});
test('serializer initialization failures report useful reinstall guidance before disposing their panel',async () => {
  for (const failure of ['missing bundle','render failure']) {
    const f=fake();const lines=[];
    const reader=createTutorialReader(f.vscode,{context:f.context,output:{appendLine:text=>lines.push(text)},load:async()=>{
      if(failure === 'missing bundle') throw new Error('ENOENT tutorial-content.json');
      return {lessons:null};
    }});
    const panel=f.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
    await f.serializers.get('zero.tutorials').deserializeWebviewPanel(panel,{});
    assert.equal(panel.disposed,true);
    assert.equal(f.errors.length,1);assert.match(f.errors[0],/Reinstall Zero to restore the bundled tutorials/);
    assert.equal(lines.length,1);assert.match(lines[0],/Tutorials:/);
    assert.equal(reader.columnFor(),undefined);reader.dispose();
  }
});
test('serializer suppresses delayed initialization errors after genuine user close or manager disposal',async () => {
  for (const close of ['user','manager']) {
    const f=fake();let fail;
    const reader=createTutorialReader(f.vscode,{context:f.context,load:()=>new Promise((resolve,reject)=>{fail=reject;})});
    const panel=f.vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{},{});
    const restoring=f.serializers.get('zero.tutorials').deserializeWebviewPanel(panel,{});
    await new Promise(resolve=>setImmediate(resolve));
    if(close === 'user') panel.dispose();else reader.dispose();
    fail(new Error('delayed missing bundle'));await restoring;
    assert.equal(panel.disposed,true);assert.deepEqual(f.errors,[]);reader.dispose();
  }
});
test('explicit open still disposes its failed panel and propagates initialization failure to its command',async () => {
  const f=fake();const reader=createTutorialReader(f.vscode,{context:f.context,load:async()=>{throw new Error('missing bundle');}});
  await assert.rejects(reader.open('/project'),/missing bundle/);
  assert.equal(f.panels[0].disposed,true);assert.equal(reader.columnFor('/project'),undefined);reader.dispose();
});
