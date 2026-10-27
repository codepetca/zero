// Maintainer-only measurement of Next route traces; these are not Vercel billed bytes.
import assert from 'node:assert/strict';
import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const next=resolve(site,'.next/server');
const names=(await readdir(next,{recursive:true})).filter(name=>name.endsWith('.nft.json')).sort();
const inventory=new Map();const routes=[];
for(const name of names){
 const trace=resolve(next,name);const data=JSON.parse(await readFile(trace,'utf8'));
 const paths=[trace.slice(0,-'.nft.json'.length),...data.files.map(file=>resolve(dirname(trace),file))];
 const files=[];
 for(const path of new Set(paths)){
  if(!inventory.has(path)){
   const bytes=await readFile(path);const info=await stat(path);
   if(!info.isFile())throw new Error(`Trace contains non-file: ${path}`);
   inventory.set(path,{path:relative(site,path),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  files.push(inventory.get(path));
 }
 routes.push({trace:relative(site,trace),bytes:files.reduce((n,f)=>n+f.bytes,0),files:files.map(f=>f.path)});
}
const files=[...inventory.values()].sort((a,b)=>b.bytes-a.bytes);
const report={measuredAt:new Date().toISOString(),note:'Local emitted route traces. Shared files deduplicated in union; route sums repeat shared files. Not hosted storage or billing.',routeCount:routes.length,uniqueFiles:files.length,uniqueBytes:files.reduce((n,f)=>n+f.bytes,0),routeSumBytes:routes.reduce((n,r)=>n+r.bytes,0),largestFiles:files.slice(0,30),routes,files};
const args=process.argv.slice(2);assert(args.every(arg=>arg==='--check'||!arg.startsWith('-')),'Unknown argument');
if(args.includes('--check')){
 const targetNames=['app/download/[asset]/route.js.nft.json','app/updates/macos/appcast.xml/route.js.nft.json','app/updates/windows/stable.json/route.js.nft.json','app/api/jams/template/route.js.nft.json','app/api/jams/template/preview/route.js.nft.json'];
 for(const target of targetNames){
  const route=routes.find(row=>row.trace===`.next/server/${target}`);assert(route,`Missing route trace: ${target}`);
  assert(!route.files.some(path=>/^(public|tests|app|components|docs|scripts)\//.test(path)||['tsconfig.tsbuildinfo','README.md','package-lock.json'].includes(path)),`Unnecessary runtime files in ${target}`);
  if(!target.includes('/api/jams/'))assert(!route.files.some(path=>path.endsWith('.js')&&inventory.get(resolve(site,path)).bytes>1024*1024),`Large document snapshot returned to ${target}`);
  else{
   const template=resolve(site,'../jam-template');
   for(const name of await readdir(template,{recursive:true})){
    const path=resolve(template,name);if(!(await stat(path)).isFile())continue;
    assert(route.files.includes(relative(site,path)),`Missing template file ${name} in ${target}`);
   }
  }
 }
 report.checksPassed=true;
}
const output=args.find(arg=>arg!=='--check');
if(output)await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({routeCount:report.routeCount,uniqueFiles:report.uniqueFiles,uniqueBytes:report.uniqueBytes,routeSumBytes:report.routeSumBytes,targets:routes.filter(r=>/download\/|updates\/|api\/jams\/template\//.test(r.trace)).map(({trace,bytes})=>({trace,bytes}))},null,2));
