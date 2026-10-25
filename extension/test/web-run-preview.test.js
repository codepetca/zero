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

async function fixture(t, indexBytes=Buffer.from('<h1>compiled app</h1>')) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-browser-run-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const index=Buffer.from(indexBytes);
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
 assert.equal(new URL(preview.browserUrl).origin,new URL(preview.url).origin);assert.equal(new URL(preview.webviewUrl).origin,new URL(preview.url).origin);assert.equal(new URL(preview.url).hostname,'127.0.0.1');
 const response=await fetch(preview.browserUrl),html=await response.text();assert.match(response.headers.get('content-security-policy'),/default-src 'none'; frame-src 'self'; connect-src 'self'/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.doesNotMatch(html,/Open in browser|acquireVsCodeApi|window\.open/);
 const shell=shellHarness(html);assert.equal(shell.frames.length,0,'No app before live runtime acknowledges connection');
 shell.source.onmessage({data:'running'});assert.equal(shell.frames.length,1);assert.equal(shell.frames[0].src,new URL(preview.url).pathname);assert.equal(shell.frames[0].sandbox,'allow-scripts allow-same-origin');assert.equal(shell.frames[0].allow,'autoplay; fullscreen');
 assert.equal(await(await fetch(preview.url)).text(),'<h1>compiled app</h1>');index.fill(0);await fs.writeFile(path.join(root,'index.html'),'new app');await fs.rm(root,{recursive:true,force:true});
 assert.equal(await(await fetch(preview.url)).text(),'<h1>compiled app</h1>');assert.equal((await fetch(preview.url+'source.java')).status,404);assert.equal(await(await fetch(preview.url+'assets/app.js')).text(),'compiled javascript');
});

test('only the exact embedded URL derives an older saved export index; all original bytes remain immutable',async t=>{
 const oldIndex=Buffer.from('<!doctype html><html><head><title>Earlier Zero export</title></head><body><script src="./zero_web.nocache.js"></script></body></html>\n');
 const {root,index,preview}=await fixture(t,oldIndex);
 const embeddedResponse=await fetch(preview.webviewUrl);
 assert.equal(embeddedResponse.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(embeddedResponse.headers.get('cache-control'),'no-store');
 const derived=Buffer.from(await embeddedResponse.arrayBuffer());
 assert.deepEqual(Buffer.from(await(await fetch(preview.url)).arrayBuffer()),oldIndex);
 const injection=derived.toString().indexOf('<script>(function selectAllInEmbeddedPreview');
 assert.ok(injection>0 && injection<derived.toString().indexOf('<script src="./zero_web.nocache.js"'),'Preview handler loads before the app');
 assert.deepEqual(Buffer.concat([derived.subarray(0,injection),derived.subarray(injection+derived.length-oldIndex.length)]),oldIndex);
 const head=await fetch(preview.webviewUrl,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),derived.length);
 const wrong=new URL(preview.webviewUrl);wrong.search='?zero-embedded-wrong';assert.deepEqual(Buffer.from(await(await fetch(wrong)).arrayBuffer()),oldIndex);
 const extra=new URL(preview.webviewUrl);extra.search+='&extra=1';assert.deepEqual(Buffer.from(await(await fetch(extra)).arrayBuffer()),oldIndex);
 const differentPath=new URL(preview.webviewUrl);differentPath.pathname+='index.html';assert.deepEqual(Buffer.from(await(await fetch(differentPath)).arrayBuffer()),oldIndex);
 const asset=new URL('assets/app.js',preview.webviewUrl);asset.search=new URL(preview.webviewUrl).search;
 assert.equal(await(await fetch(asset)).text(),'compiled javascript');
 assert.equal((await fetch(preview.webviewUrl,{method:'POST'})).status,405);
 const browser=await(await fetch(preview.browserUrl)).text();assert.doesNotMatch(browser,/selectAllInEmbeddedPreview/);
 index.fill(0);await fs.writeFile(path.join(root,'index.html'),'changed');assert.deepEqual(Buffer.from(await(await fetch(preview.url)).arrayBuffer()),oldIndex);
 assert.deepEqual(Buffer.from(await(await fetch(preview.webviewUrl)).arrayBuffer()),derived);
});

test('embedded Select All only selects a focused text control on plain Mac Meta+A',async t=>{
 const {preview}=await fixture(t);
 const html=await(await fetch(preview.webviewUrl)).text();
 const script=html.match(/<script>\(([\s\S]*?)\)\(\)<\/script>$/)?.[1];assert.ok(script);
 class Input {constructor(type='text'){this.type=type;this.disabled=false;this.readOnly=false;this.selections=0;}select(){this.selections++;}}
 class Textarea extends Input {}
 let keydown;const document={activeElement:null,addEventListener(type,listener,capture){assert.equal(type,'keydown');assert.equal(capture,true);keydown=listener;}};
 vm.runInNewContext(`(${script})()`,{document,HTMLInputElement:Input,HTMLTextAreaElement:Textarea});
 function press(target,options={}) {let prevented=false;keydown({target,key:'a',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,isComposing:false,preventDefault(){prevented=true;},...options});return prevented;}
 const input=new Input();document.activeElement=input;assert.equal(press(input),true);assert.equal(input.selections,1);
 const textarea=new Textarea();document.activeElement=textarea;assert.equal(press(textarea),true);assert.equal(textarea.selections,1);
 const readonly=new Input();readonly.readOnly=true;document.activeElement=readonly;assert.equal(press(readonly),true,'Read-only text remains selectable');
 document.activeElement=input;
 for(const options of [{metaKey:false,ctrlKey:true},{key:'c'},{key:'v'},{shiftKey:true},{altKey:true},{ctrlKey:true},{isComposing:true}])assert.equal(press(input,options),false);
 assert.equal(input.selections,1,'Other editing and modified shortcuts do not select');
 document.activeElement=textarea;assert.equal(press(input),false,'Only the focused control is selected');
 const disabled=new Input();disabled.disabled=true;document.activeElement=disabled;assert.equal(press(disabled),false);
 const number=new Input('number');document.activeElement=number;assert.equal(press(number),false);
 const canvas={};document.activeElement=canvas;assert.equal(press(canvas),false);
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
 await assert.rejects(fetch(preview.url));await assert.rejects(fetch(preview.webviewUrl));await assert.rejects(fetch(preview.browserUrl));
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

test('managed preview honors the explicit tutorial column even when the host reports an active Java editor',async()=>{
 const h=managedHarness(),placements=[];
 const createPanel=h.vscode.window.createWebviewPanel;
 h.vscode.ViewColumn.Beside=-2;
 h.vscode.window.createWebviewPanel=(type,title,column,options)=>{placements.push(column);return createPanel(type,title,column,options);};
 h.vscode.window.tabGroups={active:{viewColumn:2}};
 h.vscode.window.activeTextEditor={document:{languageId:'java'}};
 const options={serverFactory:async()=>({url:'http://127.0.0.1:1234/site/',dispose(){}})};
 const fromTutorial=await createManagedWebPreview(h.vscode,'/site',{...options,viewColumn:2});assert.deepEqual(placements,[2]);fromTutorial.dispose();
 const movedTutorial=await createManagedWebPreview(h.vscode,'/site',{...options,viewColumn:3});assert.deepEqual(placements,[2,3]);movedTutorial.dispose();
 // Without a project tutorial, use Beside regardless of active group/editor.
 const fallback=await createManagedWebPreview(h.vscode,'/site',options);assert.deepEqual(placements,[2,3,-2]);fallback.dispose();
 const invalid=await createManagedWebPreview(h.vscode,'/site',{...options,viewColumn:'2'});assert.deepEqual(placements,[2,3,-2,-2]);invalid.dispose();
});

test('managed toolbar opens the default browser using only the runtime shell URL and reports failed opens',async()=>{
 const h=managedHarness();const options=[];
 const preview=await createManagedWebPreview(h.vscode,'/site',{siteFiles:['validated'],serverFactory:async(site,value)=>{options.push({site,value});return {url:'http://127.0.0.1:1234/immutable/',webviewUrl:'http://127.0.0.1:1234/immutable/?zero-embedded-secret',browserUrl:'http://127.0.0.1:1234/immutable/.zero-preview-secret/',dispose:()=>h.events.push('server disposed')};}});
 assert.match(h.html,/<button type="button">Open in browser<\/button>/);assert.match(h.html,/postMessage\(\{type:'openInBrowser'\}\)/);assert.match(h.html,/button:focus-visible/);assert.deepEqual(options,[{site:'/site',value:{siteFiles:['validated']}}]);
 assert.match(h.html,/<iframe[^>]+src="http:\/\/127\.0\.0\.1:1234\/immutable\/\?zero-embedded-secret"/);
 assert.equal(preview.url,'http://127.0.0.1:1234/immutable/?zero-embedded-secret');
 h.receive({type:'unknown',url:'https://wrong.example'});await tick();assert.equal(h.opened.length,0);
 h.receive({type:'openInBrowser',url:'https://wrong.example'});await tick();assert.deepEqual(h.opened,[preview.browserUrl]);
 h.openResult=false;await assert.rejects(preview.openInBrowser(),/browser did not open/);h.receive({type:'openInBrowser'});await tick();assert.match(h.errors.at(-1),/browser did not open/);
 h.openResult=Error('Browser unavailable');h.receive({type:'openInBrowser'});await tick();assert.equal(h.errors.at(-1),'Browser unavailable');
 preview.dispose();assert.deepEqual(h.events,['messages disposed','frame disposed','server disposed']);await assert.rejects(preview.openInBrowser(),/App stopped/);const count=h.opened.length;h.receive({type:'openInBrowser'});await tick();assert.equal(h.opened.length,count);
});

test('embedded URL survives VS Code URI serialization and still reaches the exact derived route',async t=>{
 const {preview}=await fixture(t);
 assert.match(preview.webviewUrl,/\?zero-embedded-[a-f0-9]{36}$/);
 const h=managedHarness();h.vscode.Uri.parse=value=>({toString:()=>value.replaceAll('=','%3D')});
 const managed=await createManagedWebPreview(h.vscode,'/site',{serverFactory:async()=>preview});
 assert.equal(managed.url,preview.webviewUrl);
 assert.match(h.html,/zero-embedded-[a-f0-9]{36}/);
 assert.match(await(await fetch(managed.url)).text(),/selectAllInEmbeddedPreview/);
 assert.doesNotMatch(await(await fetch(preview.url)).text(),/selectAllInEmbeddedPreview/);
 managed.dispose();
});

test('managed toolbar uses the coordinator guard and catches guard failures',async()=>{
 const h=managedHarness();let calls=0;const preview=await createManagedWebPreview(h.vscode,'/site',{onOpenInBrowser:async()=>{calls++;throw Error('The student project changed.');},serverFactory:async()=>({url:'http://127.0.0.1:1234/site/',dispose(){}})});
 h.receive({type:'openInBrowser'});await tick();assert.equal(calls,1);assert.equal(h.opened.length,0);assert.deepEqual(h.errors,['The student project changed.']);preview.dispose();
});
