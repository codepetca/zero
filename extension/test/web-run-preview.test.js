'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createWebPreview}=require('../src/web-preview');
const {createManagedWebPreview}=require('../src/web-run-preview');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-browser-run-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const index=Buffer.from('<h1>compiled app</h1>');
 await fs.writeFile(path.join(root,'index.html'),'unvalidated replacement');
 await fs.writeFile(path.join(root,'source.java'),'private source');
 const preview=await createWebPreview(root,{siteFiles:[{path:'index.html',bytes:index},{path:'assets/app.js',bytes:Buffer.from('compiled javascript')}]});
 t.after(()=>preview.dispose());
 return {root,index,preview};
}

function shellHarness(html) {
 let source,now=0,watchdog,cleared=false;
 const status={hidden:false,textContent:'Opening app…'},frames=[],events={},documentEvents={};
 const document={querySelector:()=>status,addEventListener:(type,fn)=>{documentEvents[type]=fn;},createElement:type=>{
  assert.equal(type,'iframe');const frame={removed:false,setAttribute(name,value){this[name]=value;},addEventListener(){},focus(){},remove(){this.removed=true;}};frames.push(frame);return frame;
 },body:{append(frame){frame.attached=true;}}};
 class EventSource {constructor(url){this.url=url;this.closed=false;source=this;}close(){this.closed=true;}}
 vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1],{EventSource,document,window:{addEventListener:(type,fn)=>{events[type]=fn;}},Date:{now:()=>now},setInterval:(fn,ms)=>{assert.equal(ms,500);watchdog=fn;return 7;},clearInterval:id=>{assert.equal(id,7);cleared=true;}});
 return {source,status,frames,events,documentEvents,get cleared(){return cleared;},advance(ms){now+=ms;watchdog();}};
}

test('browser shell serves only a preview wrapper around the same immutable validated app',async t=>{
 const {root,index,preview}=await fixture(t);
 assert.equal(new URL(preview.browserUrl).origin,new URL(preview.url).origin);assert.equal(new URL(preview.url).hostname,'127.0.0.1');
 const response=await fetch(preview.browserUrl),html=await response.text();assert.match(response.headers.get('content-security-policy'),/default-src 'none'; frame-src 'self'; connect-src 'self'/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.doesNotMatch(html,/Open in browser|acquireVsCodeApi|window\.open/);
 const shell=shellHarness(html);assert.equal(shell.frames.length,0,'No app before live runtime acknowledges connection');
 shell.source.onmessage({data:'running'});assert.equal(shell.frames.length,1);assert.equal(shell.frames[0].src,new URL(preview.url).pathname);assert.equal(shell.frames[0].sandbox,'allow-scripts allow-same-origin');assert.equal(shell.frames[0].allow,'autoplay; fullscreen');
 assert.equal(await(await fetch(preview.url)).text(),'<h1>compiled app</h1>');index.fill(0);await fs.writeFile(path.join(root,'index.html'),'new app');await fs.rm(root,{recursive:true,force:true});
 assert.equal(await(await fetch(preview.url)).text(),'<h1>compiled app</h1>');assert.equal((await fetch(preview.url+'source.java')).status,404);assert.equal(await(await fetch(preview.url+'assets/app.js')).text(),'compiled javascript');
});

test('liveness disconnect removes executing frame and never reconnects or secretly reruns it',async t=>{
 const {preview}=await fixture(t);const shell=shellHarness(await(await fetch(preview.browserUrl)).text());
 shell.source.onmessage({data:'running'});shell.source.onmessage({data:'running'});assert.equal(shell.frames.length,1);
 shell.source.onerror();assert.equal(shell.frames[0].removed,true);assert.equal(shell.source.closed,true);assert.equal(shell.cleared,true);assert.equal(shell.status.hidden,false);assert.match(shell.status.textContent,/App stopped/);
 shell.source.onmessage({data:'running'});assert.equal(shell.frames.length,1,'A late event cannot restart the app');
 const pending=shellHarness(await(await fetch(preview.browserUrl)).text());pending.source.onerror();pending.source.onmessage({data:'running'});assert.equal(pending.frames.length,0);
});

test('silent liveness expires within four seconds plus a watchdog tick while browser timers run',async t=>{
 const {preview}=await fixture(t);const html=await(await fetch(preview.browserUrl)).text();const shell=shellHarness(html);
 shell.source.onmessage({data:'running'});shell.advance(3500);assert.equal(shell.frames[0].removed,false);shell.source.onmessage({data:'running'});shell.advance(3999);assert.equal(shell.frames[0].removed,false);shell.advance(501);assert.equal(shell.frames[0].removed,true);
 const pending=shellHarness(html);pending.advance(4500);assert.equal(pending.source.closed,true);pending.source.onmessage({data:'running'});assert.equal(pending.frames.length,0);
 const cached=shellHarness(html);cached.source.onmessage({data:'running'});cached.events.pagehide();assert.equal(cached.frames[0].removed,true);cached.events.pageshow({persisted:true});assert.equal(cached.frames.length,1);
});

test('Stop ends live connections promptly, closes every browser session and refuses old URLs',async t=>{
 const {preview}=await fixture(t);const html=await(await fetch(preview.browserUrl)).text();const shell=shellHarness(html);
 const responses=await Promise.all([fetch(new URL(shell.source.url,preview.url)),fetch(new URL(shell.source.url,preview.url))]);
 const readers=responses.map(response=>{assert.equal(response.headers.get('content-type'),'text/event-stream');return response.body.getReader();});
 for(const reader of readers)assert.match(new TextDecoder().decode((await reader.read()).value),/data: running/);
 const pending=readers.map(reader=>reader.read().then(result=>assert.equal(result.done,true),()=>{}));preview.dispose();preview.dispose();
 let timeout;try{await Promise.race([Promise.all(pending),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('live streams remained open after Stop')),1000);})]);}finally{clearTimeout(timeout);}
 await assert.rejects(fetch(preview.url));await assert.rejects(fetch(preview.browserUrl));
});

test('preview control routes retain method/path confinement and cannot shadow build assets',async t=>{
 const {preview}=await fixture(t);const html=await(await fetch(preview.browserUrl)).text();const shell=shellHarness(html);const live=new URL(shell.source.url,preview.url);
 assert.match(new URL(preview.browserUrl).pathname,/\/\.zero-preview-[a-f0-9]{36}\/$/);
 assert.equal((await fetch(preview.browserUrl,{method:'HEAD'})).status,200);assert.equal((await fetch(preview.browserUrl,{method:'POST'})).status,405);assert.equal((await fetch(live,{method:'HEAD'})).status,405);assert.equal((await fetch(live,{method:'POST'})).status,405);
 for(const suffix of ['source.java','.zero-preview-fake/','assets%2f..%2fsource.java','%2e%2e/private','%00'])assert.equal((await fetch(preview.url+suffix)).status,404,suffix);
 assert.equal((await fetch(new URL('/',preview.url))).status,404);assert.equal((await fetch(preview.browserUrl+'index.html')).status,404);
});

function managedHarness() {
 let receive,close,html,openResult=true;
 const opened=[],errors=[],events=[];
 const panel={webview:{set html(value){html=value;},onDidReceiveMessage(fn){receive=fn;return {dispose(){events.push('messages disposed');}};}},onDidDispose(fn){close=fn;return {dispose(){}};},dispose(){events.push('frame disposed');close();}};
 const vscode={Uri:{parse:url=>({toString:()=>url})},env:{asExternalUri:async uri=>uri,openExternal:async uri=>{opened.push(uri.toString());if(openResult instanceof Error)throw openResult;return openResult;}},ViewColumn:{Beside:2},window:{createWebviewPanel:()=>panel,showErrorMessage:message=>errors.push(message)}};
 return {vscode,opened,errors,events,get html(){return html;},set openResult(value){openResult=value;},receive:message=>receive(message),close:()=>close()};
}

test('managed preview reuses the active tutorial group after Stop and reads placement anew each run',async()=>{
 const h=managedHarness(),placements=[];
 const createPanel=h.vscode.window.createWebviewPanel;
 h.vscode.ViewColumn.Beside=-2;
 h.vscode.window.createWebviewPanel=(type,title,column,options)=>{placements.push(column);return createPanel(type,title,column,options);};
 h.vscode.window.tabGroups={active:{viewColumn:1}};
 h.vscode.window.activeTextEditor={document:{languageId:'java'}};
 const options={serverFactory:async()=>({url:'http://127.0.0.1:1234/site/',dispose(){}})};
 const fromCode=await createManagedWebPreview(h.vscode,'/site',options);assert.deepEqual(placements,[-2]);fromCode.dispose();
 // Stop reveals the tutorial in the existing right-hand group.
 h.vscode.window.activeTextEditor=undefined;h.vscode.window.tabGroups.active.viewColumn=2;
 const fromTutorial=await createManagedWebPreview(h.vscode,'/site',options);assert.deepEqual(placements,[-2,2]);fromTutorial.dispose();
 h.vscode.window.tabGroups.active.viewColumn=3;
 const movedTutorial=await createManagedWebPreview(h.vscode,'/site',options);assert.deepEqual(placements,[-2,2,3]);movedTutorial.dispose();
 // Older factory mocks or unavailable group information retain the fallback.
 h.vscode.window.tabGroups=undefined;
 const fallback=await createManagedWebPreview(h.vscode,'/site',options);assert.deepEqual(placements,[-2,2,3,-2]);fallback.dispose();
});

test('managed toolbar opens the default browser using only the runtime shell URL and reports failed opens',async()=>{
 const h=managedHarness();const options=[];
 const preview=await createManagedWebPreview(h.vscode,'/site',{siteFiles:['validated'],serverFactory:async(site,value)=>{options.push({site,value});return {url:'http://127.0.0.1:1234/immutable/',browserUrl:'http://127.0.0.1:1234/immutable/.zero-preview-secret/',dispose:()=>h.events.push('server disposed')};}});
 assert.match(h.html,/<button type="button">Open in browser<\/button>/);assert.match(h.html,/postMessage\(\{type:'openInBrowser'\}\)/);assert.match(h.html,/button:focus-visible/);assert.deepEqual(options,[{site:'/site',value:{siteFiles:['validated']}}]);
 h.receive({type:'unknown',url:'https://wrong.example'});await tick();assert.equal(h.opened.length,0);
 h.receive({type:'openInBrowser',url:'https://wrong.example'});await tick();assert.deepEqual(h.opened,[preview.browserUrl]);
 h.openResult=false;await assert.rejects(preview.openInBrowser(),/browser did not open/);h.receive({type:'openInBrowser'});await tick();assert.match(h.errors.at(-1),/browser did not open/);
 h.openResult=Error('Browser unavailable');h.receive({type:'openInBrowser'});await tick();assert.equal(h.errors.at(-1),'Browser unavailable');
 preview.dispose();assert.deepEqual(h.events,['messages disposed','frame disposed','server disposed']);await assert.rejects(preview.openInBrowser(),/App stopped/);const count=h.opened.length;h.receive({type:'openInBrowser'});await tick();assert.equal(h.opened.length,count);
});

test('managed toolbar uses the coordinator guard and catches guard failures',async()=>{
 const h=managedHarness();let calls=0;const preview=await createManagedWebPreview(h.vscode,'/site',{onOpenInBrowser:async()=>{calls++;throw Error('The student project changed.');},serverFactory:async()=>({url:'http://127.0.0.1:1234/site/',dispose(){}})});
 h.receive({type:'openInBrowser'});await tick();assert.equal(calls,1);assert.equal(h.opened.length,0);assert.deepEqual(h.errors,['The student project changed.']);preview.dispose();
});
