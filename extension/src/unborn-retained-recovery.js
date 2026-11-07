'use strict';
// Validates only fixed files in an explicitly selected retained folder. This
// receipt is self-recorded evidence, not authentication against its owner.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {readOrdinaryBounded}=require('./unborn-head'),{parseIndexFlags}=require('./index-entry-flags');
const exec=promisify(execFile),digest=data=>crypto.createHash('sha256').update(data).digest('hex'),hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function validateUnbornRemoval(root,folder,manifestBytes,manifest,validManifest) {
 if(!validManifest(manifest))return false;
 const directory=async filename=>{const info=await fs.lstat(filename);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(filename)!==filename)throw Error();return {dev:info.dev,ino:info.ino,mode:info.mode};};
 const dot=path.join(root,'.git'),anchors=await Promise.all([directory(root),directory(dot),directory(folder)]);
 const read=async(name,max,optional=false)=>{const value=await readOrdinaryBounded(path.join(folder,name),max,{optional});return value?.data??null;};
 const marker=await read('complete.json',1024*1024),complete=JSON.parse(marker.toString('utf8'));
 if((await read('complete.sha256',128)).toString('utf8')!==digest(marker)+'\n')return false;
 const moves=await read('removed-files.json',1024*1024),moveRows=JSON.parse(moves.toString('utf8'));
 if(complete?.schema!==6||complete.kind!=='unborn-added-file-removal-complete'||complete.manifestHash!==digest(manifestBytes)||complete.movesHash!==digest(moves)||!hash(complete.journalHash)||complete.ref!==manifest.ref||complete.headHash!==manifest.headHash||!same(complete.originalIndex,manifest.index)||!complete.resultIndex||typeof complete.resultIndex.present!=='boolean'||(complete.resultIndex.present?!hash(complete.resultIndex.hash):complete.resultIndex.hash!==undefined)||!Array.isArray(moveRows)||moveRows.length!==1||moveRows[0]?.name!==manifest.name||moveRows[0]?.copy!=='removed-0')return false;
 const head=await read('head',16384);if(digest(head)!==manifest.headHash||new TextDecoder('utf-8',{fatal:true}).decode(head)!==`ref: ${manifest.ref}\n`)return false;
 const packed=await read('packed-refs',4*1024*1024,true);
 if(manifest.packedHash===null){if(packed!==null)return false;}
 else {
  if(!packed||digest(packed)!==manifest.packedHash)return false;const text=new TextDecoder('utf-8',{fatal:true}).decode(packed),length=manifest.format==='sha1'?40:64,seen=new Set();let prior=false;
  if(text&&!text.endsWith('\n'))return false;
  for(const line of text.split('\n').filter(Boolean)){
   if(line.startsWith('#')){prior=false;continue;}
   if(line.startsWith('^')){if(!prior||!new RegExp(`^\\^[a-f0-9]{${length}}$`).test(line))return false;prior=false;continue;}
   const match=new RegExp(`^[a-f0-9]{${length}} (refs/[^\\s]+)$`).exec(line);if(!match||seen.has(match[1])||match[1]===manifest.ref)return false;seen.add(match[1]);prior=true;
  }
 }
 const backup=await read('file-0',64*1024*1024),moved=await read('removed-0',64*1024*1024),movedInfo=await fs.lstat(path.join(folder,'removed-0'));
 if(digest(backup)!==manifest.file.hash||digest(moved)!==manifest.file.hash||!movedInfo.isFile()||movedInfo.isSymbolicLink()||movedInfo.nlink!==1||movedInfo.mode!==manifest.file.mode)return false;
 const staged=await read('staged-0',64*1024*1024,true);
 if(manifest.staged){if(!staged||digest(staged)!==manifest.staged.hash||crypto.createHash(manifest.format).update(`blob ${staged.length}\0`).update(staged).digest('hex')!==manifest.staged.object)return false;}
 else if(staged!==null)return false;
 const journal=await read('unborn-removal-journal.jsonl',1024*1024);if(digest(journal)!==complete.journalHash)return false;
 const text=new TextDecoder('utf-8',{fatal:true}).decode(journal);if(!text.endsWith('\n'))return false;
 const events=text.trimEnd().split('\n').map(line=>JSON.parse(line)),start=events[0];
 if(start?.schema!==6||start.event!=='start'||start.manifestHash!==complete.manifestHash||start.movesHash!==complete.movesHash||start.name!==manifest.name||!same(start.selection,manifest.selection)||start.ref!==manifest.ref||!same(start.index,manifest.index))return false;
 const expected=[{event:'move-intent',name:manifest.name},{event:'moved',name:manifest.name}];if(manifest.selection.source==='index')expected.push({event:'index-intent'},{event:'index-installed'});expected.push({event:'complete'});if(!same(events.slice(1),expected))return false;
 const oldIndex=await read('index',4*1024*1024,true),newIndex=await read('completed-index',4*1024*1024,true),movedIndex=await read('moved-index',4*1024*1024,true);
 if(!manifest.index.present){if(complete.resultIndex.present||oldIndex||newIndex||movedIndex||manifest.selection.source!=='untracked')return false;}
 else {
  if(!complete.resultIndex.present||!oldIndex||!newIndex||digest(oldIndex)!==manifest.index.hash||digest(newIndex)!==complete.resultIndex.hash)return false;
  if(manifest.selection.source==='untracked'){if(complete.resultIndex.hash!==manifest.index.hash||movedIndex)return false;}
  else if(!movedIndex||digest(movedIndex)!==manifest.index.hash)return false;
  const env=Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
  const git=async(file,args)=>(await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c',`core.attributesFile=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env:{...env,GIT_INDEX_FILE:path.join(folder,file)},encoding:'buffer',timeout:10000,maxBuffer:4*1024*1024})).stdout;
  const rows=async file=>{const text=new TextDecoder('utf-8',{fatal:true}).decode(await git(file,['ls-files','--stage','-z']));if(text&&!text.endsWith('\0'))throw Error();const result=new Map();for(const row of text.split('\0').filter(Boolean)){const m=/^(100644|100755) ([a-f0-9]{40,64}) 0\t([^\0]+)$/.exec(row);if(!m||result.has(m[3]))throw Error();result.set(m[3],`${m[1]} ${m[2]}`);}return result;};
  const before=await rows('index'),after=await rows('completed-index');if(after.has(manifest.name))return false;
  if(manifest.selection.source==='index'){
   if(before.get(manifest.name)!==`${manifest.staged.mode} ${manifest.staged.object}`)return false;
   const oldFlags=parseIndexFlags(await git('index',['ls-files','--debug','-z'])),newFlags=parseIndexFlags(await git('completed-index',['ls-files','--debug','-z']));
   if(oldFlags.size!==before.size||newFlags.size!==after.size||oldFlags.get(manifest.name)!=='0'||newFlags.has(manifest.name))return false;
   for(const [name,value]of oldFlags)if(name!==manifest.name&&newFlags.get(name)!==value)return false;before.delete(manifest.name);
  } else if(before.has(manifest.name))return false;
  if(!same([...before],[...after]))return false;
 }
 if(!same(anchors,await Promise.all([directory(root),directory(dot),directory(folder)])))return false;
 return true;
}
module.exports={validateUnbornRemoval};
