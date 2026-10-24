'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm');
const {createRuntimeSession,runtimeDiagnostics}=require('../src/runtime-session');
const {managedRuntimeScript}=require('../src/web-run-preview');
const event=(seq,patch={})=>({version:1,runId:'run-A',buildId:'build-A',seq,type:'startup',stage:'startup',code:'STARTING',...patch});
test('runtime session rejects stale, forged, oversized, reordered and post-terminal records',()=>{
 const events=[];let time=0;const session=createRuntimeSession({runId:'run-A',buildId:'build-A',onEvent:value=>events.push(value),now:()=>time,maxPerSecond:2});
 for(const value of [null,event(1,{runId:'old'}),event(1,{buildId:'old'}),event(1,{diagnostic:'x'.repeat(8193)}),event(1,{type:'fatal'})])assert.equal(session.accept(value),false);
 assert.equal(session.accept(event(1)),true);assert.equal(session.accept(event(1)),false);assert.equal(session.accept(event(2,{type:'ui-ready',code:'UI_READY'})),true);assert.equal(session.accept(event(3,{type:'first-frame',code:'FIRST_FRAME',stage:'frame-draw'})),false);
 time=1000;assert.equal(session.accept(event(4,{type:'fatal',code:'FRAME_EXCEPTION',stage:'frame-draw',diagnostic:'broken'})),true);assert.equal(session.accept(event(5)),false);assert.equal(events.length,3);
 const disposed=createRuntimeSession({runId:'run-A',buildId:'build-A'});disposed.dispose();assert.equal(disposed.accept(event(1)),false);
});
test('runtime stack links stay inside the student source tree',()=>{
 const actual=runtimeDiagnostics('Error: bad\n at demo.Player$Inner.draw(Player.java:9)\n at demo.Player$Inner.draw(Player.java:9)\n at Main.setup(Main.java:3)\n at Other.draw(../../secret.java:1)','/project');
 assert.deepEqual(actual.map(({file,line})=>({file,line})),[{file:'/project/src/main/java/demo/Player.java',line:9},{file:'/project/src/main/java/Main.java',line:3}]);
});
test('preview connects only its exact iframe with one port and forwards only bound ordered records',()=>{
 const loads=[],posted=[],forwarded=[],ports=[],windowEvents={};const frame={src:'about:blank',addEventListener:(name,fn)=>loads.push(fn),contentWindow:{postMessage:(...args)=>posted.push(args)}};
 class MessageChannel{constructor(){this.port1={close(){this.closed=true;},start(){}};this.port2={};ports.push(this);}}
 const window={location:{origin:'vscode-webview://panel-id'},addEventListener:(name,fn)=>{windowEvents[name]=fn;}};
 vm.runInNewContext(managedRuntimeScript('http://127.0.0.1:1234/immutable/','run-A','build-A'),{frame,window,MessageChannel,URL,URLSearchParams,TextEncoder,Date,Number,JSON,vscode:{postMessage:value=>forwarded.push(value)}});
 const url=new URL(frame.src);assert.equal(url.origin,'http://127.0.0.1:1234');assert.equal(new URLSearchParams(url.hash.slice(1)).get('zeroRuntimeParentOrigin'),'vscode-webview://panel-id');
 loads[0]();assert.equal(posted.length,1);assert.equal(posted[0][1],url.origin);assert.equal(posted[0][2].length,1);assert.equal(posted[0][2][0],ports[0].port2);
 const send=value=>ports.at(-1).port1.onmessage({data:value});send(event(1,{runId:'old'}));send(event(1,{buildId:'old'}));send(event(1,{diagnostic:'x'.repeat(66000)}));assert.equal(forwarded.length,0);send(event(1));send(event(1));assert.equal(forwarded.length,1);
 loads[0]();assert.equal(posted.length,1,'Loaded active runtime cannot silently reconnect');send(event(2,{type:'fatal',code:'FRAME_EXCEPTION',stage:'frame-draw'}));assert.equal(ports[0].port1.closed,true);send(event(3));assert.equal(forwarded.length,2);windowEvents.pagehide();
});
