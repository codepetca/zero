'use strict';
const {validateRuntimeEvent,MAX_RECORD_BYTES}=require('./runtime-events');

// A run owns status only. No event can request files, commands or credentials.
function createRuntimeSession({runId,buildId,onEvent=()=>{},now=Date.now,maxPerSecond=30}={}) {
 let sequence=0,terminal=false,disposed=false,bucket=-1,count=0;
 return {accept(value){
  if(disposed||terminal)return false;
  let bytes;try{bytes=Buffer.byteLength(JSON.stringify(value),'utf8');}catch{return false;}
  if(bytes>MAX_RECORD_BYTES)return false;
  const event=validateRuntimeEvent(value,{runId,buildId,afterSeq:sequence});if(!event)return false;
  const current=Math.floor(now()/1000);if(current!==bucket){bucket=current;count=0;}if(++count>maxPerSecond)return false;
  sequence=event.seq;if(event.type==='fatal'||event.type==='stopped')terminal=true;
  onEvent(event);return true;
 },dispose(){disposed=true;},get terminal(){return terminal;}};
}

function runtimeDiagnostics(text,root) {
 const path=require('node:path'),items=[],seen=new Set();
 for(const line of String(text).split('\n')){
  const frame=/\bat\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\(([^/\\():]+\.java):(\d+)\)/.exec(line);
  if(!frame)continue;
  const owner=frame[1].slice(0,frame[1].lastIndexOf('.')),packageName=owner.includes('.')?owner.slice(0,owner.lastIndexOf('.')):'';
  const filename=path.join(root,'src/main/java',...packageName.split('.').filter(Boolean),frame[2]),key=filename+':'+frame[3];
  if(!filename.startsWith(root+path.sep)||seen.has(key))continue;seen.add(key);
  items.push({file:filename,line:Number(frame[3]),column:1,message:String(text).slice(0,8192)});
 }
 return items;
}
module.exports={createRuntimeSession,runtimeDiagnostics};
