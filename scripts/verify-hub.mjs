// Actual local PostgreSQL -> isolated checker -> fake Maven publication -> apps.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {startLocalHub} from '../hub/local.mjs';
import {starterUiBundle} from '../hub/fixtures/starter-ui.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);const editor=require('../extension/src/hub-components.js');
const args=process.argv.slice(2);const flag=name=>{const n=args.indexOf(name);return n<0?undefined:args[n+1];};
const output=path.resolve(flag('--output')||path.join(root,'.verification/hub-integration'));
await mkdir(output); // Fresh evidence only; no overwriting a prior proof.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const origin='http://127.0.0.1:8788';
const started=Date.now();const demo=await startLocalHub({origin,output});
async function run(command,args,name) {
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,stdio:['ignore','pipe','pipe']});let log='';
    const timer=setTimeout(()=>child.kill('SIGTERM'),180000);
    child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,log});});
  });
  await writeFile(path.join(output,name+'.log'),result.log);assert.equal(result.code,0,`See ${name}.log`);return result.log;
}
async function terminal(id) {
  for(let i=0;i<360;i++) {
    const status=await demo.hub.getSubmission({id:'101',login:'zero-local-demo'},id);
    if(['failed','published'].includes(status.status))return status;
    await new Promise(res=>setTimeout(res,500));
  }
  throw new Error('Local checking did not reach a terminal report within 180s');
}
try {
  const user={id:'101',login:'zero-local-demo'};
  const reservation=await demo.hub.reserveLibrary(user,{className:'ScoreDisplay',title:'Starter UI'});
  const bundle=await starterUiBundle(reservation.libraryId);
  if(flag('--preview'))bundle.files['preview.png']=(await readFile(flag('--preview'))).toString('base64');
  const broken=structuredClone(bundle);broken.files[`src/zero/${reservation.libraryId}/Hud.java`]+='\nsyntax error\n';
  const bad=await terminal((await demo.hub.submit(user,broken)).id);assert.equal(bad.status,'failed');assert.equal(bad.report.passed,false);assert.equal((await demo.hub.catalog()).libraries.length,0);
  const good=await terminal((await demo.hub.submit(user,bundle)).id);assert.equal(good.status,'published');assert.equal(good.release.status,'automatically-checked');
  assert.equal((await demo.hub.getSubmission(user,bad.id)).report.sourceDigest,bad.report.sourceDigest);
  const source0=good.release.sourceDigest;
  const upgraded=structuredClone(bundle);upgraded.descriptor.version='0.1.1';upgraded.files['CHANGELOG.md']+='\n## 0.1.1\n\nDocumentation-only patch to exercise explicit Update/Revert.\n';
  const patch=await terminal((await demo.hub.submit(user,upgraded)).id);assert.equal(patch.status,'published');
  const context=await editor.loadCatalog(origin);assert.equal(context.catalog.libraries.length,2);
  const first=context.catalog.libraries.find(r=>r.version==='0.1.0');const next=context.catalog.libraries.find(r=>r.version==='0.1.1');
  await editor.verifyRelease(context,first);await editor.verifyRelease(context,next);
  const settings=path.join(output,'settings.xml');await writeFile(settings,'<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');
  const cache=path.join(output,'cache');
  if(flag('--cache-from')) {
    await cp(path.resolve(flag('--cache-from')),cache,{recursive:true,errorOnExist:true,force:false});
    // Reuse third-party downloads while proving assigned hub artifacts resolve anew.
    await rm(path.join(cache,'ca/codepet/zero/library'),{recursive:true,force:true});
  } else await mkdir(cache);
  for(const release of [first,next,first]) {
    await run('python3',['scripts/verify-examples.py','--only','packaged-study','packaged-game','--starter-ui-repository',cache,'--maven-settings',settings,'--hub-library-id',release.libraryId,'--hub-library-version',release.version,'--hub-repository-url',`${origin}/api/hub/maven`],`consumers-${release.version}-${release===first&&release!==next?'pin':'patch'}-${Date.now()}`);
    const cached=await readFile(path.join(cache,`ca/codepet/zero/library/${release.libraryId}/${release.version}/${release.libraryId}-${release.version}.jar`));assert.equal(digest(cached),release.artifacts.jar.sha256);
  }
  // Exercise the actual extension engine using a disposable student project.
  const project=path.join(output,'student');await mkdir(project);await mkdir(path.join(project,'src/main/java'),{recursive:true});await writeFile(path.join(project,'zero.json'),'{}');await writeFile(path.join(project,'src/main/java/Main.java'),'class Main {}\n');await writeFile(path.join(project,'pom.xml'),await readFile(path.join(root,'student-template/pom.xml')));
  let plan=await editor.planChange(project,context,first);await writeFile(path.join(project,'pom.xml'),plan.afterText);
  plan=await editor.planChange(project,context,next,{operation:'update'});await writeFile(path.join(project,'pom.xml'),plan.afterText);
  plan=await editor.planChange(project,context,first,{operation:'revert'});await writeFile(path.join(project,'pom.xml'),plan.afterText);
  assert.equal((await demo.hub.catalog()).libraries.find(r=>r.version==='0.1.0').sourceDigest,source0);
  const receipt={mode:'local-fake-publication',sourceRepository:root,starterUiSource:path.join(root,'libraries/starter-ui'),failedSubmission:bad,release:first,patch:next,mavenConsumers:['study','coin-game'],versionsResolved:['0.1.0','0.1.1','0.1.0'],actualLoadedJarHashesVerified:true,extensionAddUpdateRevert:true,nativePlatform:process.platform+'-'+process.arch,elapsedSeconds:(Date.now()-started)/1000,limits:['Synthetic JavaFX actions; physical input/novice/Windows/Linux native desktop untested','GitHub OAuth and hosted database/storage/workers not configured or tested']};
  await writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(`HUB_INTEGRATION_OK: ${output}`);
} finally {await demo.stop();}
