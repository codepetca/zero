import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { buildGamePackage, inspectGamePackage, extractGamePackage } from '../game-package.mjs';

const files=()=>Object.entries({'zero.json':'{}','pom.xml':'<project/>','mvnw':readFileSync(new URL('../../student-template/mvnw',import.meta.url)),'mvnw.cmd':readFileSync(new URL('../../student-template/mvnw.cmd',import.meta.url)),'.mvn/wrapper/maven-wrapper.properties':readFileSync(new URL('../../student-template/.mvn/wrapper/maven-wrapper.properties',import.meta.url)),'.vscode/tasks.json':'{"tasks":[{"type":"zero","task":"run"}]}','src/main/java/Main.java':'class Main {}','assets/coin.png':'asset bytes','src/main/resources/player sprite.png':'sprite bytes','zero-libraries.json':'{"schema":1,"libraries":[]}','libraries/health-bar/zero-library.json':'{}','libraries/health-bar/src/main/java/Health.java':'class Health {}','libraries/health-bar/src/test/java/HealthTest.java':'class HealthTest {}','libraries/health-bar/examples/first/Main.java':'class Main {}','libraries/health-bar/pom.xml':'<project/>','.git/config':'secret history','.env':'token','target/output.class':'build','unrelated/secret.txt':'private','setup.sh':'arbitrary script'}).map(([path,data])=>({path,data:Buffer.from(data)}));
test('exact sorted deterministic ZIP preserves source/assets/library state and wrapper modes',async t=>{
  const first=buildGamePackage({files:files()}),second=buildGamePackage({files:files().reverse()});
  assert.deepEqual(first.bytes,second.bytes);assert.equal(first.sourceDigest,second.sourceDigest);
  const inspected=inspectGamePackage(first.bytes);
  assert.equal(inspected.find(file=>file.path==='mvnw').mode,0o100755);
  assert.ok(inspected.some(file=>file.path==='assets/coin.png'));assert.ok(inspected.some(file=>file.path==='zero-libraries.json'));
  assert.ok(inspected.some(file=>file.path==='src/main/resources/player sprite.png'));
  assert.ok(!inspected.some(file=>file.path.startsWith('.git')||file.path==='.env'||file.path.startsWith('target/')||file.path.startsWith('unrelated/')));
  const parent=await mkdtemp(path.join(os.tmpdir(),'zero-game-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  // macOS /var -> /private/var: pass its real path as an explicit destination.
  const {realpath}=await import('node:fs/promises');const destination=path.join(await realpath(parent),'opened');
  await extractGamePackage({bytes:first.bytes,destination,expectedSha256:first.sha256});
  assert.equal((await stat(path.join(destination,'mvnw'))).mode&0o777,0o755);
  assert.equal((await readFile(path.join(destination,'assets/coin.png'))).toString(),'asset bytes');
  assert.ok(!(await readdir(destination)).includes('.git'));
  await assert.rejects(extractGamePackage({bytes:first.bytes,destination}),/EEXIST/);
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
