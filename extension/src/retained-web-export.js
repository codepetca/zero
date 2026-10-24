'use strict';
// Finished output is data: this validator never loads project modules or tools.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {inspectRetainedZip}=require('./retained-web-zip');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const LIMITS=Object.freeze({files:10000,totalBytes:256*1024*1024,manifestBytes:2*1024*1024});
function relative(name){return typeof name==='string'&&name.length<=512&&name.split('/').every(part=>part&&!/[\\\x00-\x1f\x7f<>:\x22|?*]/.test(part)&&!['.','..'].includes(part)&&!/[. ]$/.test(part)&&!/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));}
async function ordinary(filename,{directory=false,maxBytes=LIMITS.totalBytes}={}){
 let current=path.parse(path.resolve(filename)).root;
 for(const part of path.resolve(filename).slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const stat=await fs.lstat(current);
  if(stat.isSymbolicLink())throw Error('Browser output refuses symbolic links.');
 }
 const stat=await fs.lstat(filename);
 if(directory?!stat.isDirectory():!stat.isFile()||stat.nlink!==1||stat.size>maxBytes)throw Error('Browser output needs bounded ordinary files and directories.');
 return stat;
}
async function readTree(root){
 await ordinary(root,{directory:true});const files=[];let total=0,entries=0;const folded=new Set();
 async function walk(folder,prefix=''){
  for(const item of await fs.readdir(folder,{withFileTypes:true})){
   const name=prefix+item.name,file=path.join(folder,item.name),key=name.toLowerCase();
   if(++entries>LIMITS.files*4)throw Error('Browser output contains too many paths.');
   if(!relative(name)||folded.has(key))throw Error('Browser output contains unsafe or case-colliding paths.');folded.add(key);
   if(item.isDirectory()){await ordinary(file,{directory:true});await walk(file,name+'/');}
   else {await ordinary(file);const bytes=await fs.readFile(file);total+=bytes.length;
    if(files.length>=LIMITS.files||total>LIMITS.totalBytes)throw Error('Browser output exceeds retained-output limits.');files.push({path:name,bytes});}
  }
 }
 await walk(root);return files;
}
function inventoryMatches(files,expected){
 if(!Array.isArray(expected)||expected.length!==files.length||expected.length>LIMITS.files)return false;
 const names=new Set(),map=new Map();
 for(const entry of expected){if(!entry||!relative(entry.path)||names.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||! /^[a-f0-9]{64}$/.test(entry.sha256))return false;names.add(entry.path.toLowerCase());map.set(entry.path,entry);}
 return files.every(file=>{const entry=map.get(file.path);return entry&&entry.bytes===file.bytes.length&&entry.sha256===sha(file.bytes);});
}
async function validateRetainedExport({projectRoot,result,signal}={}){
 if(signal?.aborted)throw Error('Browser output validation cancelled.');
 await ordinary(projectRoot,{directory:true});const root=await fs.realpath(projectRoot),output=path.join(root,'.zero','web-export');
 await ordinary(output,{directory:true});const manifestPath=path.join(output,'manifest.json');
 if(result?.manifestPath&&path.resolve(result.manifestPath)!==manifestPath)throw Error('The browser build belongs to a different project.');
 await ordinary(manifestPath,{maxBytes:LIMITS.manifestBytes});const raw=await fs.readFile(manifestPath),manifest=JSON.parse(raw.toString('utf8'));
 if(manifest.schemaVersion!==1||typeof manifest.buildId!=='string'||!manifest.buildId||manifest.buildId.length>200||manifest.compatibility?.status!=='passed'||! /^[a-f0-9]{64}$/.test(manifest.sourceHash)||! /^[a-f0-9]{64}$/.test(manifest.profileHash))throw Error('The retained browser build receipt is invalid.');
 if(result?.buildId&&result.buildId!==manifest.buildId)throw Error('The browser build was replaced. Export again before using it.');
 // A copied repository retains historical absolute paths. Only the fixed site
 // and ZIP basenames under the same historical output are rebased here.
 const historical=/^(?:[A-Za-z]:|\\\\)/.test(manifest.sitePath||'')?path.win32:path.posix;
 if(typeof manifest.sitePath!=='string'||!historical.isAbsolute(manifest.sitePath)||typeof manifest.zipPath!=='string'||!historical.isAbsolute(manifest.zipPath)||historical.basename(manifest.sitePath)!=='site'||historical.basename(manifest.zipPath)!=='web-export.zip'||historical.dirname(manifest.sitePath)!==historical.dirname(manifest.zipPath)||historical.basename(historical.dirname(manifest.sitePath))!=='web-export'||historical.basename(historical.dirname(historical.dirname(manifest.sitePath)))!=='.zero')throw Error('Invalid retained browser output paths.');
 const sitePath=path.join(output,'site'),zipPath=path.join(output,'web-export.zip'),siteFiles=await readTree(sitePath);
 if(!inventoryMatches(siteFiles,manifest.files)||manifest.totalBytes!==siteFiles.reduce((n,file)=>n+file.bytes.length,0))throw Error('The retained browser site changed or is incomplete.');
 if(!siteFiles.some(file=>file.path==='index.html'&&file.bytes.length)||!siteFiles.some(file=>file.path==='zero_web.nocache.js'&&file.bytes.length)||!siteFiles.some(file=>/\.cache\.js$/.test(file.path)&&file.bytes.length))throw Error('The retained browser site is incomplete.');
 await ordinary(zipPath);const zipBytes=await fs.readFile(zipPath);
 inspectRetainedZip(zipBytes,siteFiles,{safePath:relative,maxFiles:LIMITS.files,maxBytes:LIMITS.totalBytes});
 const all=await readTree(output),allowed=new Set(['manifest.json','web-export.zip',...siteFiles.map(file=>'site/'+file.path)]);
 if(all.length!==allowed.size||all.some(file=>!allowed.has(file.path)))throw Error('The retained browser output contains undeclared files.');
 if(!raw.equals(await fs.readFile(manifestPath))||signal?.aborted)throw Error('The retained browser receipt changed during validation.');
 return {...result,buildId:manifest.buildId,sitePath,zipPath,manifestPath,sourceHash:manifest.sourceHash,profileHash:manifest.profileHash,totalBytes:manifest.totalBytes,files:manifest.files,manifest,siteFiles,zipBytes};
}
module.exports={validateRetainedExport,ordinary,readTree,inventoryMatches,relative,LIMITS};
