// Retain local native/browser builds for the Actor Coin example.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {zipSync} from 'fflate';
import {starterMembers} from '../../../scripts/kit.mjs';
import {extractProject, maven} from '../../../scripts/verification-project.mjs';
import {assertZeroOnly} from '../../../scripts/verify-basic-games.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const lesson=fs.readFileSync(path.join(root,'student-template/lessons/18-actors.md'),'utf8');
const blocks=[...lesson.matchAll(/^```java\s*\n([\s\S]*?)^```\s*$/gm)].map(match=>match[1]);
for (const [index,name] of ['Player.java','Coin.java','Main.java'].entries()) {
  assert.equal(blocks[index], fs.readFileSync(path.join(root,'teaching/new-curriculum/actor-coin/actors',name),'utf8'), `Lesson code differs from ${name}`);
}
assert.equal(blocks.length,3);
const out=path.join(root,'.verification/actor-coin');
fs.mkdirSync(out,{recursive:true});
for (const variant of ['actors']) {
  const parent=path.join(out,variant); fs.mkdirSync(parent,{recursive:true});
  const members=starterMembers(root);
  for (const name of Object.keys(members)) if (name.startsWith('zero-starter/examples/') || name.startsWith('zero-starter/lessons/') || /^zero-starter\/src\/main\/java\/[^/]+\.java$/.test(name)) delete members[name];
  const project=extractProject(zipSync(members),'zero-starter',parent);
  for (const name of fs.readdirSync(path.join(root,'teaching/new-curriculum/actor-coin',variant)).filter(n=>n.endsWith('.java'))) {
    const source=fs.readFileSync(path.join(root,'teaching/new-curriculum/actor-coin',variant,name),'utf8');
    assertZeroOnly(source,name); fs.writeFileSync(path.join(project,'src/main/java',name),source);
  }
  maven(project,['compile']); console.log(`${variant}: native compile passed`);
  const require=createRequire(import.meta.url);
  const {exportForWeb}=require(path.join(project,'.zero-build/src/web-export'));
  const result=await exportForWeb({projectRoot:project,cacheRoot:path.join(root,'.verification/web-export-checks/cache'),onProgress:message=>console.log(`${variant}: ${message}`)});
  console.log(`${variant}: WebFX output ${result.sitePath}`);
}
