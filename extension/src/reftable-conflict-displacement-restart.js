'use strict';
// Observations only: neither a matching inode nor a journal authorizes mutation.
const fs=require('node:fs/promises'),{constants}=require('node:fs'),path=require('node:path');
const {inspectDisplacementEvidence}=require('./reftable-conflict-displacement-evidence');
const fail=()=>new Error('Cannot inspect displacement evidence reliably. Keep all entries and inspect both locations.');
const snapshot=s=>[s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
const id=s=>({dev:String(s.dev),ino:String(s.ino)});
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
async function directory(p){if(typeof p!=='string'||!path.isAbsolute(p)||await fs.realpath(p)!==p)throw fail();const s=await fs.lstat(p,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink())throw fail();return s;}
async function entry(p){try{return await fs.lstat(p,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function description(s,expected){if(!s)return Object.freeze({kind:'absent'});const type=s.isFile()?'file':s.isDirectory()?'directory':s.isSymbolicLink()?'symlink':'other';return Object.freeze({kind:same(id(s),expected)&&type==='file'?'matching-identity':'unexpected',type,dev:String(s.dev),ino:String(s.ino),size:String(s.size),links:String(s.nlink)});}
async function inspectDisplacementRestart({sourceDir,retentionDir,evidenceHash}={}){
 if(!/^[0-9a-f]{64}$/.test(evidenceHash||''))throw fail();
 const source=await directory(sourceDir),retention=await directory(retentionDir),journalPath=path.join(retentionDir,'displacement-journal.jsonl');
 const j=await fs.open(journalPath,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
 try{
  const initial=await j.stat({bigint:true});if(!initial.isFile()||initial.nlink!==1n||initial.size<1n||initial.size>262144n)throw fail();
  const bytes=Buffer.alloc(Number(initial.size)+1);let n=0;while(n<bytes.length){const r=await j.read(bytes,n,bytes.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}if(n!==Number(initial.size))throw fail();
  const data=bytes.subarray(0,n),report=inspectDisplacementEvidence(data),start=JSON.parse(data.toString('utf8').split('\n',1)[0]);
  if(report.evidenceHash!==evidenceHash||!same(id(source),start.sourceDirectory)||!same(id(retention),start.retentionDirectory)||[start.sourceLeaf,start.retainedLeaf,start.preparedLeaf].includes('displacement-journal.jsonl'))throw fail();
  const paths=[path.join(sourceDir,start.sourceLeaf),path.join(retentionDir,start.retainedLeaf),path.join(retentionDir,start.preparedLeaf)];
  const first=await Promise.all(paths.map(entry)),second=await Promise.all(paths.map(entry));
  if(first.some((s,i)=>s===null?second[i]!==null:second[i]===null||snapshot(s)!==snapshot(second[i])))throw fail();
  const [sourceAfter,retentionAfter,named,openAfter]=await Promise.all([directory(sourceDir),directory(retentionDir),entry(journalPath),j.stat({bigint:true})]);
  if(!same(id(source),id(sourceAfter))||!same(id(retention),id(retentionAfter))||!named||snapshot(initial)!==snapshot(named)||snapshot(initial)!==snapshot(openAfter))throw fail();
  return Object.freeze({journalState:report.state,source:description(first[0],start.sourceFile),retained:description(first[1],start.sourceFile),prepared:description(first[2],start.preparedFile),authorizesMutation:false,safeToRetry:false,observationOnly:true});
 }finally{await j.close();}
}
module.exports={inspectDisplacementRestart};
