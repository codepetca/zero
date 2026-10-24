import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile, readdir, mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import {minimalGameFiles} from './game-fixture.mjs';
import authoring from '../../extension/src/sharing/authoring.js';
import {projectBuilderFilesSync} from '../../scripts/prepare-project-builder.mjs';
import { buildGamePackage, inspectGamePackage, extractGamePackage, collectGameFiles } from '../game-package.mjs';

const files=()=>[...minimalGameFiles(),...Object.entries({'.vscode/tasks.json':'{"tasks":[{"type":"zero","task":"run"}]}','assets/coin.png':'asset bytes','src/main/resources/player sprite.png':'sprite bytes','zero-libraries.json':'{"schema":1,"libraries":[]}','libraries/health-bar/zero-library.json':'{}','libraries/health-bar/src/main/java/Health.java':'class Health {}','libraries/health-bar/src/test/java/HealthTest.java':'class HealthTest {}','libraries/health-bar/examples/first/Main.java':'class Main {}','.git/config':'secret history','.env':'token','target/output.class':'build','unrelated/secret.txt':'private','setup.sh':'arbitrary script'}).map(([path,data])=>({path,data:Buffer.from(data)})),{path:'libraries/health-bar/pom.xml',data:readFileSync(new URL('../../student-template/pom.xml',import.meta.url))},{path:'libraries/health-bar/LICENSE',data:readFileSync(new URL('../../student-template/LICENSE',import.meta.url))}];
test('exact sorted deterministic ZIP preserves source/assets/library state and wrapper modes',async t=>{
  const first=buildGamePackage({files:files()}),second=buildGamePackage({files:files().reverse()});
  assert.deepEqual(first.bytes,second.bytes);assert.equal(first.sourceDigest,second.sourceDigest);
  const inspected=inspectGamePackage(first.bytes);
  assert.equal(inspected.find(file=>file.path==='mvnw').mode,0o100755);
  assert.ok(inspected.some(file=>file.path==='assets/coin.png'));assert.ok(inspected.some(file=>file.path==='zero-libraries.json'));
  assert.ok(inspected.some(file=>file.path==='src/main/resources/player sprite.png'));
  assert.ok(!inspected.some(file=>file.path.startsWith('.git/')||file.path==='.env'||file.path.startsWith('target/')||file.path.startsWith('unrelated/')));
  const parent=await mkdtemp(path.join(os.tmpdir(),'zero-game-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  // macOS /var -> /private/var: pass its real path as an explicit destination.
  const {realpath}=await import('node:fs/promises');const destination=path.join(await realpath(parent),'opened');
  await extractGamePackage({bytes:first.bytes,destination,expectedSha256:first.sha256});
  assert.equal((await stat(path.join(destination,'mvnw'))).mode&0o777,0o755);
  assert.equal((await readFile(path.join(destination,'assets/coin.png'))).toString(),'asset bytes');
  assert.ok(!(await readdir(destination)).includes('.git'));
  const ignore=(await readFile(path.join(destination,'.gitignore'))).toString();assert.match(ignore,/\*\*\/target\//);assert.match(ignore,/\.env\.\*/);assert.match(ignore,/\.zero\//);assert.doesNotMatch(ignore,/\.zero\*/);
  await assert.rejects(extractGamePackage({bytes:first.bytes,destination}),/EEXIST/);
});

test('shared projects preserve a complete saved builder as data and reject incomplete or undeclared tooling', async t => {
  const builder = projectBuilderFilesSync().map(file => ({path:'.zero-build/' + file.path,data:file.bytes}));
  const built = buildGamePackage({files:[...minimalGameFiles(),...builder]});
  const inspected = inspectGamePackage(built.bytes);
  for (const file of builder) assert.deepEqual(inspected.find(item => item.path === file.path)?.data,file.data);
  assert.throws(() => buildGamePackage({files:[...minimalGameFiles(),...builder.filter(file => file.path !== '.zero-build/run.cjs')]}), /missing|absent|changed|undeclared/);
  assert.throws(() => buildGamePackage({files:[...minimalGameFiles(),...builder,{path:'.zero-build/extra.js',data:Buffer.from('throw Error("must never execute")')}]}), /missing|absent|changed|undeclared/);
  assert.throws(() => buildGamePackage({files:[...minimalGameFiles(),{path:'.zero-build/run.cjs',data:Buffer.from('throw Error("must never execute")')}]}), /complete saved/);
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(),'zero-saved-game-')));t.after(() => rm(parent,{recursive:true,force:true}));
  const destination = path.join(parent,'opened');await extractGamePackage({bytes:built.bytes,destination});
  assert.deepEqual(await readFile(path.join(destination,'.zero-build/run.cjs')),builder.find(file => file.path === '.zero-build/run.cjs').data);
  const ignore = await readFile(path.join(destination,'.gitignore'),'utf8');
  assert.doesNotMatch(ignore,/^\.zero\*$/m,'saved tooling must be tracked by the student repository');
});

test('static game structure rejects broken markers/main/framework/POM/pins/licenses and unignore overrides',()=>{
  const replace=(name,text)=>minimalGameFiles().map(file=>file.path===name?{...file,data:Buffer.from(text)}:file);
  for(const marker of ['{',JSON.stringify({name:'Game',mainClass:'Missing'}),JSON.stringify({name:'Game',mainClass:'../Main'})])assert.throws(()=>buildGamePackage({files:replace('zero.json',marker)}));
  assert.throws(()=>buildGamePackage({files:replace('src/main/java/Main.java','public class Main {}')}),/main method/);
  assert.throws(()=>buildGamePackage({files:minimalGameFiles().filter(file=>file.path!=='src/main/java/zero/GameApp.java')}),/GameApp/);
  assert.throws(()=>buildGamePackage({files:replace('LICENSE','MIT')}),/license/);
  assert.throws(()=>buildGamePackage({files:replace('.gitignore','!target/\n!.env\n')}),/unignore/);
  const pom=minimalGameFiles().find(file=>file.path==='pom.xml').data.toString();
  for(const modified of [pom.replace('<maven.compiler.release>17','<maven.compiler.release>21'),pom.replace('21.0.12','21.0.13'),pom.replace('3.14.0','LATEST'),pom.replace('3.14.0','3.14.0-SNAPSHOT'),pom.replace('</project>','<profiles/></project>'),pom.replace('<modelVersion>4.0.0</modelVersion>','<modelVersion>4.0.0</modelVersion><parent/>'),'<project><broken></project>'])assert.throws(()=>buildGamePackage({files:replace('pom.xml',modified)}));
  assert.doesNotThrow(()=>buildGamePackage({files:minimalGameFiles()}));
});

test('POM property graphs reject doubling, cycles, excessive depth/count and oversized values before large allocation',()=>{
  const base=minimalGameFiles(),pom=base.find(file=>file.path==='pom.xml').data.toString();
  const withProperties=properties=>base.map(file=>file.path==='pom.xml'?{...file,data:Buffer.from(pom.replace('</properties>',properties+'</properties>'))}:file);
  const chain=(count,double)=>'<p0>1</p0>'+Array.from({length:count},(_,index)=>`<p${index+1}>${'${p'+index+'}'}${double?'${p'+index+'}':''}</p${index+1}>`).join('');
  const started=performance.now();
  assert.throws(()=>buildGamePackage({files:withProperties(chain(35,true))}),/expansion limit/);
  assert.ok(performance.now()-started<1000,'a 2KB acyclic doubling graph must reject promptly');
  assert.throws(()=>buildGamePackage({files:withProperties('<a>${b}</a><b>${a}</b>')}),/cyclic/);
  assert.throws(()=>buildGamePackage({files:withProperties(chain(40,false))}),/depth/);
  assert.throws(()=>buildGamePackage({files:withProperties(Array.from({length:129},(_,index)=>`<p${index}>1</p${index}>`).join(''))}),/property count/);
  assert.throws(()=>buildGamePackage({files:withProperties('<large>'+ 'x'.repeat(4097)+'</large>')}),/expansion limit/);
  assert.throws(()=>buildGamePackage({files:withProperties(Array.from({length:60},(_,index)=>`<p${index}>${'x'.repeat(4096)}</p${index}>`).join(''))}),/total work limit/);
  assert.doesNotThrow(()=>buildGamePackage({files:withProperties('<compilerVersion>3.14.0</compilerVersion><alias>${compilerVersion}</alias>')}));
});

test('Open project refuses ancestor Git directories and worktree files before writing',async t=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),'zero-git-ancestor-'));t.after(()=>rm(temporary,{recursive:true,force:true}));
  const root=await realpath(temporary),bytes=buildGamePackage({files:minimalGameFiles()}).bytes;
  for(const kind of ['directory','file']) {
    const parent=path.join(root,kind);await mkdir(parent);
    if(kind==='directory')await mkdir(path.join(parent,'.git'));else await writeFile(path.join(parent,'.git'),'gitdir: /fixture');
    const nested=path.join(parent,'nested');await mkdir(nested);
    const destination=path.join(nested,'opened');await assert.rejects(extractGamePackage({bytes,destination}),/outside existing Git/);
    await assert.rejects(stat(destination),{code:'ENOENT'});
  }
});

test('actual maintained starter and ordinary local/published library POM roots satisfy static snapshot checks',async()=>{
  const root=new URL('../../student-template/',import.meta.url).pathname;
  const source=await collectGameFiles(root);assert.doesNotThrow(()=>buildGamePackage({files:source}));
  const pom=minimalGameFiles().find(file=>file.path==='pom.xml').data.toString();
  const local=pom.replace('</plugins>','<plugin><groupId>org.codehaus.mojo</groupId><artifactId>build-helper-maven-plugin</artifactId><version>3.6.1</version><executions><execution><id>zero-local-libraries</id><phase>generate-sources</phase><goals><goal>add-source</goal></goals><configuration><sources><source>libraries/health-bar/src/main/java</source></sources></configuration></execution></executions></plugin></plugins>');
  const published=pom.replace('</dependencies>','<dependency><groupId>ca.codepet.zero.contrib.r11</groupId><artifactId>health-bar</artifactId><version>0.1.0</version></dependency></dependencies>');
  for(const text of [local,published])assert.doesNotThrow(()=>buildGamePackage({files:minimalGameFiles().map(file=>file.path==='pom.xml'?{...file,data:Buffer.from(text)}:file)}));
});

test('actual local extraction and published mode retain a valid game snapshot and safe opened exclusions',async t=>{
  const temporary=await realpath(await mkdtemp(path.join(os.tmpdir(),'zero-extracted-game-')));t.after(()=>rm(temporary,{recursive:true,force:true}));
  const project=path.join(temporary,'project');await mkdir(project);
  for(const file of minimalGameFiles()){const location=path.join(project,file.path);await mkdir(path.dirname(location),{recursive:true});await writeFile(location,file.data);}
  await writeFile(path.join(project,'src/main/java/Health.java'),'public class Health { private final Range range = new Range(); public int value() { return range.value; } }');
  await writeFile(path.join(project,'src/main/java/Range.java'),'final class Range { int value = 7; }');
  const descriptor={schema:1,kind:'library',slug:'health-bar',version:'0.1.0',title:'Health bar',description:'A helper',license:'MIT',libraryKind:'helper'};
  const repository={id:'11',ownerId:'7',owner:'student',name:'game',url:'https://github.com/student/game'};
  await authoring.applyPlan(await authoring.previewExtraction(project,{repository,descriptor,sources:['src/main/java/Health.java','src/main/java/Range.java']}));
  for(const mode of ['local','published']) {
    if(mode==='published')await authoring.applyPlan(await authoring.previewMode(project,{slug:'health-bar',mode,version:'0.1.0'}));
    const packageResult=buildGamePackage({files:await collectGameFiles(project)});
    assert.ok(packageResult.files.some(file=>file.path==='libraries/health-bar/src/main/java/zero/contrib/r11/health_bar/Range.java'));
    const destination=path.join(temporary,'opened-'+mode);await extractGamePackage({bytes:packageResult.bytes,destination});
    const ignore=(await readFile(path.join(destination,'.gitignore'))).toString();assert.match(ignore,/\*\*\/target\//);assert.match(ignore,/\.env/);assert.match(ignore,/\.zero\//);assert.doesNotMatch(ignore,/\.zero\*/);
    assert.ok((await readFile(path.join(destination,'.mvn/wrapper/NOTICE'))).length>40);
  }
});
test('path/link/collision/automatic task policy is applied before packing',()=>{
  for(const file of [{path:'../bad',data:Buffer.from('x')},{path:'assets/link.png',data:Buffer.from('x'),mode:'120000'},{path:'CON.txt',data:Buffer.from('x')},{path:'src/main/java/main.java',data:Buffer.from('x')}]) assert.throws(()=>buildGamePackage({files:[...files(),file]}));
  assert.throws(()=>buildGamePackage({files:files().map(file=>file.path==='.vscode/tasks.json'?{...file,data:Buffer.from('{"tasks":[{"runOptions":{"runOn":"folderOpen"}}]}')}:file)}),/automatically/);
  assert.throws(()=>buildGamePackage({files:files().map(file=>file.path==='mvnw'?{...file,data:Buffer.from('#!/bin/sh\nevil')} :file)}),/pinned trusted/);
});
test('untrusted ZIP traversal, symlinks, mismatched headers, huge sizes and checksum failure are refused',async()=>{
  for(const [name,mode]of [['../escape',0o100644],['assets/link.png',0o120777],['.git/config',0o100644]]) {
    const bytes=zipSync({[name]:[new Uint8Array([1]),{os:3,attrs:mode<<16,mtime:new Date(1980,0,1,0,0,0)}]});
    assert.throws(()=>inspectGamePackage(bytes));
  }
  const normal=buildGamePackage({files:files()});
  const huge=Buffer.from(normal.bytes),end=huge.length-22,start=huge.readUInt32LE(end+16);huge.writeUInt32LE(0x7fffffff,start+24);
  assert.throws(()=>inspectGamePackage(huge),/limit/);
  const mismatch=Buffer.from(normal.bytes);mismatch.writeUInt16LE(8,6);assert.throws(()=>inspectGamePackage(mismatch),/differs/);
  const understated=Buffer.from(normal.bytes),directory=understated.readUInt32LE(understated.length-6);
  // A forged central/local size cannot make a larger deflate stream allocate
  // beyond its declared bound before the final size/CRC validation.
  const local=understated.readUInt32LE(directory+42);
  understated.writeUInt32LE(1,directory+24);understated.writeUInt32LE(1,local+22);
  assert.throws(()=>inspectGamePackage(understated),/larger than|CRC|size/i);
  await assert.rejects(extractGamePackage({bytes:normal.bytes,destination:'/unneeded',expectedSha256:'a'.repeat(64)}),/checksum/);
});
