// Exercise emitted handlers using only their traced files, outside the checkout.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {jamTemplateFiles} from '../lib/jam-template.mjs';
import {publishedFeedResponse} from '../../scripts/mac-update-feed.mjs';
import {publishedWindowsFeedResponse} from '../lib/windows-installer.mjs';
async function checkFeed(response,expected,kind){
 assert.equal(response.status,expected===null?(kind==='mac'?404:503):200);
 assert.equal(await response.text(),expected??(kind==='mac'?'Updates are not available yet.':'Windows updates are not available yet.'));
}
// Exercise the same expectation helper on both supported unavailable-feed states.
await checkFeed(publishedFeedResponse(null),null,'mac');
await checkFeed(publishedWindowsFeedResponse(null),null,'windows');
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..');const repo=resolve(site,'..');
const routes=['download/[asset]','updates/macos/appcast.xml','updates/windows/stable.json','api/jams/template','api/jams/template/preview'];
const files=new Set();
for(const route of routes){
 const entry=resolve(site,`.next/server/app/${route}/route.js`);files.add(entry);
 for(const file of JSON.parse(await readFile(`${entry}.nft.json`,'utf8')).files)files.add(resolve(dirname(entry),file));
}
const stage=await mkdtemp(join(tmpdir(),'zero-function-trace-'));
try{
 const root=resolve(stage,'repo');const website=resolve(root,'website');
 for(const file of files){
  const name=relative(repo,file);assert(name&&!name.startsWith('..'),'Trace escaped repository root');
  const target=resolve(root,name);await mkdir(dirname(target),{recursive:true});await copyFile(file,target);
 }
 for(const forbidden of ['tests','public','app','components','docs','scripts']){
  await assert.rejects(readdir(resolve(website,forbidden)),{code:'ENOENT'});
 }
 const source=String.raw`
${checkFeed.toString()}
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const Module=require('node:module');
const root=path.resolve(process.cwd(),'..');const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(...args){const file=originalResolve.apply(this,args);if(!Module.isBuiltin(file))assert(file.startsWith(root+path.sep),'Dependency escaped traced package: '+file);return file;};
const expected=JSON.parse(fs.readFileSync(0,'utf8'));const load=route=>require('./.next/server/app/'+route+'/route.js').routeModule.userland;
(async()=>{
 const download=load('download/[asset]');
 const redirect=await download.GET(new Request('https://zero.codepet.ca/download/kit'),{params:Promise.resolve({asset:'kit'})});assert.equal(redirect.status,303);assert.equal(redirect.headers.get('Location'),'/downloads');
 const unknown=await download.GET(new Request('https://zero.codepet.ca/download/nope'),{params:Promise.resolve({asset:'nope'})});assert.equal(unknown.status,404);
 await checkFeed(await load('updates/macos/appcast.xml').GET(),expected.updateFeed,'mac');
 await checkFeed(await load('updates/windows/stable.json').GET(),expected.windowsUpdateFeed,'windows');
 const template=load('api/jams/template'),preview=load('api/jams/template/preview');
 for(const handler of [template.GET,template.POST,preview.GET,preview.POST])assert.equal((await handler(new Request('https://zero.codepet.ca/api/jams/template'))).status,404);
 // Production compilation deliberately fixes the Jam hold; changing process env cannot publish it.
 delete process.env.VERCEL;delete process.env.VERCEL_ENV;process.env.NODE_ENV='development';
 for(const handler of [template.GET,template.POST,preview.GET,preview.POST])assert.equal((await handler(new Request('http://127.0.0.1/api/jams/template'))).status,404);
 // Exact local kit receipt/bytes remain usable outside Vercel; forged installer fails closed.
 fs.mkdirSync(path.join(root,'dist'));const receipt=structuredClone(expected.release);
 for(const key of ['kit','starter','extension']){
  const bytes=Buffer.from('receipted local '+key);const asset=expected.release.assets[key];fs.writeFileSync(path.join(root,'dist',asset.filename),bytes);receipt.assets[key]={...asset,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 }
 fs.writeFileSync(path.join(root,'dist/release.json'),JSON.stringify(receipt));
 for(const key of ['kit','starter','extension']){const response=await download.GET(new Request('http://127.0.0.1/download/'+key),{params:Promise.resolve({asset:key})});assert.equal(response.status,200);assert.equal(await response.text(),'receipted local '+key);}
 const missingInstaller=await download.GET(new Request('http://127.0.0.1/download/installer'),{params:Promise.resolve({asset:'installer'})});assert.equal(missingInstaller.status,503);
 console.log(JSON.stringify({tracedHandlers:5,vercelLocalDownloadBlocked:true,unknownDownload404:true,feedsByteIdentical:true,unavailableMac404:true,unavailableWindows503:true,productionTemplatesHidden:true,compiledHoldCannotBeToggled:true,localKitDownloadsVerified:3,unverifiedInstallerRefused:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});`;
 const result=spawnSync(process.execPath,['-e',source],{cwd:website,input:JSON.stringify({...JSON.parse(await readFile(resolve(site,'.generated/release.json'),'utf8'))}),encoding:'utf8',env:{...process.env,NODE_PATH:'',NODE_ENV:'production',VERCEL:'1',VERCEL_ENV:'production',ZERO_LOCAL_DOWNLOADS:'1'},timeout:60000,maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr||result.stdout||String(result.error));const report=JSON.parse(result.stdout);
 // The source generator (covered separately by template tests) reads only staged template assets here.
 report.sourceTemplateTypes=[];
 for(const type of ['game','app']){
  const template=await jamTemplateFiles(type,resolve(root,'jam-template'));
  assert(template['assets/jam.js']);assert(template['.github/workflows/pages.yml']);
  assert.equal(JSON.parse(new TextDecoder().decode(template['zero-jam.json'])).type,type);
  report.sourceTemplateTypes.push(type);
 }
 console.log(JSON.stringify(report));
}finally{await rm(stage,{recursive:true,force:true});}
