#!/usr/bin/env node
// Local, finite headless-Chrome workload probe. No performance claim for school hardware.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const {exportForWeb}=require('../extension/src/web-export');
const {createWebPreview}=require('../extension/src/web-preview');
const {validateExport}=require('../extension/src/web-export/snapshot');
const cacheRoot=process.env.ZERO_STRESS_CACHE_ROOT||path.join(root,'.verification/web-export-checks/cache');
const output=path.join(root,'.verification/actor-stress-web');
const project=path.join(root,'.verification/ui-prototypes/actor-stress');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
await fs.mkdir(output,{recursive:true});
const args=process.argv.slice(2);
if(args.some(arg=>!['--build','--measure'].includes(arg)))throw Error('Usage: node scripts/verify-actor-stress.mjs [--build] [--measure]. Run measurement only in an agreed quiet window.');
const started=Date.now();
if(!args.includes('--measure')||args.includes('--build')){
 const build=await exportForWeb({projectRoot:project,cacheRoot,onProgress:console.log});
 const studentSourceHashes=Object.fromEntries(await Promise.all(['Main.java','StressActor.java'].map(async name=>[name,sha(await fs.readFile(path.join(project,'src/main/java',name)))])));
 await fs.writeFile(path.join(output,'build.json'),JSON.stringify({...build,studentSourceHashes,elapsedSeconds:(Date.now()-started)/1000},null,2)+'\n');
 console.log('Build recorded. Coordinate a quiet window, then run with --measure.');
}
if(!args.includes('--measure'))process.exit(0);
const build=await validateExport({projectRoot:project,result:JSON.parse(await fs.readFile(path.join(output,'build.json'),'utf8'))});
// Never measure an old export against changed student sources.
for(const name of ['Main.java','StressActor.java']){
 const canonical=await fs.readFile(path.join(root,'framework/prototypes/actor-stress',name));
 const assembled=await fs.readFile(path.join(project,'src/main/java',name));
 if(!canonical.equals(assembled)||sha(assembled)!==build.studentSourceHashes?.[name])throw Error('Reassemble and rebuild changed source before measuring '+name);
}
async function assertCanonicalTree(directory,assembled){
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  const source=path.join(directory,entry.name),target=path.join(assembled,entry.name);
  if(entry.isDirectory())await assertCanonicalTree(source,target);
  else if(!(await fs.readFile(source)).equals(await fs.readFile(target)))throw Error('Reassemble and rebuild changed canonical source: '+source);
 }
}
await assertCanonicalTree(path.join(root,'framework/src/main/java/zero'),path.join(project,'src/main/java/zero'));
if(!(await fs.readFile(path.join(root,'framework/prototypes/actor-stress/stress-sprites.png'))).equals(await fs.readFile(path.join(project,'src/main/resources/stress-sprites.png'))))throw Error('Reassemble and rebuild changed sprite asset');
const session='zero-stress-'+process.pid;
const cli=path.join(root,'node_modules/@playwright/cli/playwright-cli.js');
async function command(args){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[cli,'--session',session,...args],{cwd:root,env:{...process.env,NO_UPDATE_NOTIFIER:'1'}});let output='';
 child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 child.on('error',reject);child.on('close',code=>code||output.includes('### Error')?reject(Error(output)):resolve(output));
});}
const preview=await createWebPreview(build.sitePath);
try{
 const script=String.raw`async (page) => {
 await page.setViewportSize({width:900,height:900});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(() => {
  const prototype=CanvasRenderingContext2D.prototype;
  const draw=prototype.drawImage,clear=prototype.clearRect;
  window.__stressFunctional={frames:[],current:0,crops:[]};
  prototype.clearRect=function(...args){const s=window.__stressFunctional;if(s.frames.length<500)s.frames.push(s.current);s.current=0;return clear.apply(this,args);};
  prototype.drawImage=function(...args){const s=window.__stressFunctional;s.current++;if(args.length===9&&s.current===1&&s.crops.length<5000)s.crops.push(args.slice(1,5));return draw.apply(this,args);};
  window.__restoreStressFunctional=()=>{prototype.drawImage=draw;prototype.clearRect=clear;};
 });
 await page.goto(URL_PLACEHOLDER);await page.bringToFront();
 await page.getByRole('button',{name:/^100(?: actors)?$/i}).waitFor();
 const environment=await page.evaluate(()=>({userAgent:navigator.userAgent,devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,visibility:document.visibilityState,focused:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight}}));
 if(environment.devicePixelRatio!==1||environment.visibility!=='visible'||!environment.focused)throw Error('Benchmark requires DPR1, visible focused page: '+JSON.stringify(environment));
 const functional=[];
 for(const count of [100,250,500]){
  await page.getByRole('button',{name:new RegExp('^'+count+'(?: actors)?$','i')}).click();
  await page.evaluate(()=>{window.__stressFunctional.frames=[];window.__stressFunctional.crops=[];});
  await page.waitForTimeout(1600);
  const sample=await page.evaluate(()=>({frames:window.__stressFunctional.frames,crops:window.__stressFunctional.crops,text:document.body.innerText}));
  const frames=sample.frames.slice(2);
  const crops=[...new Set(sample.crops.map(c=>JSON.stringify(c)))];
  if(frames.length<10||!frames.every(n=>n===count))throw Error('Actual draw count differs from selected '+count+': '+JSON.stringify(frames));
  if(crops.length!==4)throw Error('Expected four sprite source rectangles, got '+JSON.stringify(crops));
  const fps=sample.text.match(/FPS:\s*([0-9.]+)/i);
  if(!await page.locator('fx-text:not([aria-hidden="true"])').filter({hasText:new RegExp('^Actors: '+count+'$')}).isVisible()||!await page.locator('fx-text:not([aria-hidden="true"])').filter({hasText:/^FPS: [0-9.]+$/}).isVisible())throw Error('Workload/FPS HUD is not visible');
  if(!fps||Number(fps[1])<=0)throw Error('Nonzero wall-clock FPS missing: '+sample.text);
  functional.push({count,actualDrawFrames:frames.length,drawsPerFrame:count,crops: crops.map(JSON.parse),uiText:sample.text});
 }
 await page.evaluate(()=>window.__restoreStressFunctional());
 // Per-image instrumentation has been restored. Only one timestamp per clear/frame remains.
 await page.evaluate(()=>{
  const prototype=CanvasRenderingContext2D.prototype,clear=prototype.clearRect;
  window.__stressSamples={draw:[],raf:[],record:false};
  prototype.clearRect=function(...args){const s=window.__stressSamples;if(s.record)s.draw.push(performance.now());return clear.apply(this,args);};
  let id;function tick(now){const s=window.__stressSamples;if(s.record)s.raf.push(now);id=requestAnimationFrame(tick);}id=requestAnimationFrame(tick);
  window.__stopStressSamples=()=>{cancelAnimationFrame(id);prototype.clearRect=clear;};
 });
 const runs=[];
 for(const [index,count] of [100,250,500,500,250,100].entries()){
  await page.getByRole('button',{name:new RegExp('^'+count+'(?: actors)?$','i')}).click();
  await page.waitForTimeout(3000);
  await page.evaluate(()=>{window.__stressSamples.draw=[];window.__stressSamples.raf=[];window.__stressSamples.record=true;window.__stressSamples.started=performance.now();});
  await page.waitForTimeout(10000);
  const sample=await page.evaluate(()=>{const s=window.__stressSamples;s.record=false;return{draw:s.draw,raf:s.raf,elapsed:performance.now()-s.started,text:document.body.innerText,visibility:document.visibilityState,focused:document.hasFocus()};});
  if(sample.visibility!=='visible'||!sample.focused)throw Error('Measurement lost foreground visibility/focus');
  function stats(times){const intervals=times.slice(1).map((t,i)=>t-times[i]),sorted=[...intervals].sort((a,b)=>a-b);const p=q=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];return{frames:times.length,averageFps:intervals.length*1000/(times.at(-1)-times[0]),p50Ms:p(.5),p95Ms:p(.95),maxMs:Math.max(...intervals),gapsOver33_3Ms:intervals.filter(n=>n>33.3).length,intervalsMs:intervals,timestampsMs:times};}
  const draw=stats(sample.draw),raf=stats(sample.raf),uiFps=Number(sample.text.match(/FPS:\s*([0-9.]+)/i)?.[1]);
  if(!Number.isFinite(draw.averageFps)||!uiFps||Math.abs(uiFps-draw.averageFps)>Math.max(12,draw.averageFps*.3))throw Error('UI wall-clock FPS inconsistent with actual draw rate: '+JSON.stringify({uiFps,draw}));
  runs.push({pass:index<3?'ascending':'descending',count,warmupMs:3000,requestedMeasurementMs:10000,elapsedMs:sample.elapsed,draw,raf,uiFps,uiText:sample.text});
 }
 await page.evaluate(()=>window.__stopStressSamples());
 if(errors.length)throw Error('Browser runtime errors: '+JSON.stringify(errors));
 return{status:'passed',environment,functional,runs,errors};
}`.replace('URL_PLACEHOLDER',JSON.stringify(preview.url));
 const scriptPath=path.join(output,'browser-probe.js');await fs.writeFile(scriptPath,script);
 await command(['open',preview.url,'--browser','chrome']);
 const raw=await command(['run-code','--filename',scriptPath]);await fs.writeFile(path.join(output,'browser.log'),raw);
 await validateExport({projectRoot:project,result:build});
 const result=JSON.parse(raw.slice(raw.indexOf('### Result\n')+11).split('\n')[0]);
 await fs.writeFile(path.join(output,'samples.json'),JSON.stringify(result,null,2)+'\n');
 const files=['scripts/verify-actor-stress.mjs','extension/src/web-export/compatibility/contract.json','extension/test/web-export-compatibility.test.js','framework/prototypes/actor-stress/Main.java','framework/prototypes/actor-stress/StressActor.java','framework/prototypes/actor-stress/stress-sprites.png'];
 const receipt={completedAt:new Date().toISOString(),actualPinnedBuilds:1,buildId:build.buildId,sourceHash:build.sourceHash,profileHash:build.profileHash,compatibility:build.compatibility,hashes:Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fs.readFile(path.join(root,file)))]))),environment:result.environment,functional:result.functional,runs:result.runs.map(({draw,raf,...rest})=>({...rest,draw:Object.fromEntries(Object.entries(draw).filter(([k])=>!['timestampsMs','intervalsMs'].includes(k))),raf:Object.fromEntries(Object.entries(raf).filter(([k])=>!['timestampsMs','intervalsMs'].includes(k)))})),method:'Headless Chrome; no CPU throttle/artificial lag. Six serial passes 100/250/500 then500/250/100; each3s warmup+10s measurement. Separate per-image functional hooks restored before timing. One lightweight clearRect timestamp per GameApp draw plus rAF cadence; raw samples in samples.json. UI FPS compared with measured draw FPS using max12FPS/30percent tolerance.',interpretation:'Local headless benchmark only; no school hardware performance claim. No failure threshold found if500 remains smooth.',cleanup:'Own browser session and preview disposed in finally.',limits:['One browser/device configuration; no physical school hardware','No concurrent build/test/native work permitted during measurement; coordination is external','No telemetry, installs, publication or remote writes']};
 await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:result.status,buildId:build.buildId,runs:receipt.runs.map(r=>({count:r.count,pass:r.pass,fps:r.draw.averageFps,p95Ms:r.draw.p95Ms}))}));
}finally{try{await command(['close']);}finally{preview.dispose();}}
