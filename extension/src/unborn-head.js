'use strict';
// Read-only evidence for an ordinary standalone unborn branch. A caller must
// revalidate this evidence under the relevant Git locks before any mutation.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {constants}=require('node:fs'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=()=>new Error('The unborn branch cannot be verified. Inspect the project in Source Control.');
const identity=info=>({dev:info.dev,ino:info.ino,size:info.size,mtime:info.mtimeMs,ctime:info.ctimeMs,mode:info.mode});
async function ordinaryDirectory(dir) {
 const info=await fs.lstat(dir);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();return {dev:info.dev,ino:info.ino,mode:info.mode};
}
async function boundedFile(filename,max,{optional=false,links=1}={}) {
 let before;try{before=await fs.lstat(filename);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
 if(!Number.isSafeInteger(max)||max<0||!before.isFile()||before.isSymbolicLink()||before.nlink!==links||!Number.isSafeInteger(before.size)||before.size<0||before.size>max)throw new Error('File evidence cannot be verified safely.');
 const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try {const opened=await handle.stat();if(!opened.isFile()||JSON.stringify(identity(opened))!==JSON.stringify(identity(before))||opened.nlink!==links)throw new Error('File evidence cannot be verified safely.');
  const buffer=Buffer.alloc(opened.size+1);let count=0;while(count<buffer.length){const part=await handle.read(buffer,count,buffer.length-count,count);if(!part.bytesRead)break;count+=part.bytesRead;}
  const data=buffer.subarray(0,count),after=await handle.stat(),named=await fs.lstat(filename);
  if(data.length!==opened.size||JSON.stringify(identity(after))!==JSON.stringify(identity(opened))||JSON.stringify(identity(named))!==JSON.stringify(identity(opened))||named.isSymbolicLink()||named.nlink!==links||after.nlink!==links)throw new Error('File evidence cannot be verified safely.');
  return {identity:identity(opened),hash:hash(data),data};
 }finally{await handle.close();}
}
async function absent(filename){try{await fs.lstat(filename);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
async function inspectUnbornHead(root) {
 if(typeof root!=='string'||!path.isAbsolute(root)||await fs.realpath(root)!==root)throw fail();
 const dot=path.join(root,'.git'),rootIdentity=await ordinaryDirectory(root),dotIdentity=await ordinaryDirectory(dot);
 const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_ATTR_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
 const git=async args=>(await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env,encoding:'utf8',timeout:10000,maxBuffer:1024*1024})).stdout;
 const head=await boundedFile(path.join(dot,'HEAD'),16384),headText=new TextDecoder('utf-8',{fatal:true}).decode(head.data);
 const match=/^ref: (refs\/heads\/[^\r\n]+)\n$/.exec(headText);if(!match)throw fail();const ref=match[1];
 if(/[\x00-\x20\x7f\\]/.test(ref)||ref.length>2048)throw fail();
 try{await git(['check-ref-format',ref]);}catch{throw fail();}
 if((await git(['symbolic-ref','--no-recurse','--quiet','HEAD']))!==ref+'\n')throw fail();
 const parts=ref.split('/'),parents=[];let dir=dot;
 for(const part of parts.slice(0,-1)){dir=path.join(dir,part);parents.push({path:parts.slice(0,parents.length+1).join('/'),identity:await ordinaryDirectory(dir)});}
 const loose=path.join(dot,...parts);if(!await absent(loose)||!await absent(path.join(dot,'reftable')))throw fail();
 const format=(await git(['rev-parse','--show-object-format'])).trim(),oidLength=format==='sha1'?40:format==='sha256'?64:0;if(!oidLength)throw fail();
 const packed=await boundedFile(path.join(dot,'packed-refs'),4*1024*1024,{optional:true});
 if(packed){const text=new TextDecoder('utf-8',{fatal:true}).decode(packed.data);if(text&&!text.endsWith('\n'))throw fail();let previous=false;const seen=new Set();
  for(const line of text.split('\n').filter(Boolean)){
   if(line.startsWith('#')){previous=false;continue;}
   if(line.startsWith('^')){if(!previous||!new RegExp(`^\\^[a-f0-9]{${oidLength}}$`).test(line))throw fail();previous=false;continue;}
   const row=new RegExp(`^[a-f0-9]{${oidLength}} (refs/[^\\s]+)$`).exec(line);if(!row||seen.has(row[1])||row[1]===ref)throw fail();seen.add(row[1]);previous=true;
  }
 }
 try{await git(['rev-parse','--verify','--quiet',`${ref}^{commit}`]);throw fail();}catch(error){if(error.code!==1||String(error.stderr||'').trim())throw error;}
 const finalHead=await boundedFile(path.join(dot,'HEAD'),16384),finalPacked=await boundedFile(path.join(dot,'packed-refs'),4*1024*1024,{optional:true});
 if(JSON.stringify({identity:head.identity,hash:head.hash})!==JSON.stringify({identity:finalHead.identity,hash:finalHead.hash})||JSON.stringify(packed&&{identity:packed.identity,hash:packed.hash})!==JSON.stringify(finalPacked&&{identity:finalPacked.identity,hash:finalPacked.hash})||!await absent(loose)||!await absent(path.join(dot,'reftable'))||JSON.stringify(rootIdentity)!==JSON.stringify(await ordinaryDirectory(root))||JSON.stringify(dotIdentity)!==JSON.stringify(await ordinaryDirectory(dot)))throw fail();
 for(const parent of parents)if(JSON.stringify(parent.identity)!==JSON.stringify(await ordinaryDirectory(path.join(dot,...parent.path.split('/')))))throw fail();
 return Object.freeze({root,ref,format,head:{identity:head.identity,hash:head.hash},packed:packed?{identity:packed.identity,hash:packed.hash}:null,parents,rootIdentity,dotIdentity});
}
module.exports={inspectUnbornHead,readOrdinaryBounded:boundedFile};
