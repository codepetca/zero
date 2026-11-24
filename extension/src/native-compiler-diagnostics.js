'use strict';
const path = require('node:path');
const {stripVTControlCharacters} = require('node:util');

// Maven stdout and stderr may split a diagnostic anywhere, including UTF-8
// characters (decoded by the transport). Keep bounded, separate line buffers.
function createNativeCompilerDiagnostics({root,pathApi=path,onChange=()=>{}}) {
  const buffers=new Map(),discarding=new Set(),items=[],seen=new Set();
  let compiling=true;
  function line(text) {
    if(!compiling)return;
    text=stripVTControlCharacters(text);
    if(/^\[INFO\] --- javafx:[^\s]+:run(?:\s|$)/.test(text)){compiling=false;return;}
    const match=/^\[ERROR\] (.+\.java):\[(\d+),(\d+)\]\s*(.*)$/.exec(text);
    if(!match || items.length>=200)return;
    // Maven may render a Windows file URI's path as /C:/project/Main.java.
    const reportedFile=pathApi.sep==='\\' ? match[1].replace(/^\/(?=[a-z]:[\\/])/i,'') : match[1];
    if(!pathApi.isAbsolute(reportedFile))return;
    const relative=pathApi.relative(root,reportedFile);
    if(!relative || relative==='..' || relative.startsWith('..'+pathApi.sep) || pathApi.isAbsolute(relative))return;
    const file=pathApi.resolve(root,relative),line=Number(match[2]),column=Number(match[3]);
    if(!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line<1 || column<1 || line>1000000 || column>1000000)return;
    const key=JSON.stringify([file,line,column,match[4]]);
    if(seen.has(key))return;
    seen.add(key);items.push({file,line,column,message:match[4]});onChange([...items]);
  }
  return {
    push(text,stream='stdout') {
      if(!compiling)return;
      for(const part of String(text).split(/(?<=\n)/)){
        let buffer=buffers.get(stream)||'';
        if(!discarding.has(stream)){
          if(buffer.length+part.length>8192){discarding.add(stream);buffer='';}
          else buffer+=part;
        }
        if(part.endsWith('\n')){
          if(!discarding.has(stream))line(buffer.replace(/\r?\n$/,''));
          buffers.delete(stream);discarding.delete(stream);
        }else buffers.set(stream,buffer);
      }
    },
    end(){for(const [stream,text]of buffers)if(!discarding.has(stream))line(text);buffers.clear();discarding.clear();}
  };
}
module.exports={createNativeCompilerDiagnostics};
