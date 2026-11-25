'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {coreSourcePaths, makeCoreRecord} = require('../extension/src/core-contract');
const {previewExtraction, applyPlan} = require('../extension/src/sharing/authoring');
const {prepareLocalCheck, runLocalCheck} = require('../extension/src/sharing/local-check');
const source = path.resolve(__dirname, '..');
const scratch = process.env.RUNNER_TEMP || require('node:os').tmpdir();
const slug = 'tutorial-credits-badge';
async function run() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(scratch, 'zero coin project ')));
  const sources = {};
  for (const name of coreSourcePaths) {
    sources[name] = await fs.readFile(path.join(source, 'framework', name));
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), {recursive:true});
    await fs.writeFile(destination, sources[name]);
  }
  const record = makeCoreRecord(sources);
  await fs.writeFile(path.join(root,'zero-core.json'), JSON.stringify(record, null, 2) + '\n');
  await fs.writeFile(path.join(root,'zero.json'), JSON.stringify({name:'Synthetic Coin Game',mainClass:'Main'}) + '\n');
  await fs.cp(path.join(source,'student-template/.mvn'), path.join(root,'.mvn'), {recursive:true});
  for (const filename of ['pom.xml','mvnw','mvnw.cmd']) {
    await fs.copyFile(path.join(source, 'student-template', filename), path.join(root, filename));
  }
  const checkpoint = path.join(source, 'teaching/checkpoints/11');
  const gameSource = path.join(root,'src/main/java');
  for (const filename of ['Main','Player','Coin','ScoreDisplay','PlayerInput','CreditsBadge']) {
    await fs.copyFile(path.join(checkpoint, 'game', filename + '.java'), path.join(gameSource, filename + '.java'));
  }
  const descriptor = {schema:2,kind:'library',slug,version:'0.1.0',title:'Tutorial practice: CreditsBadge',description:'Synthetic lesson 11 reproduction.',license:'MIT',libraryKind:'widget',coreRequirement:{minVersion:record.coordinate.version,maxExclusive:`0.${Number(record.coordinate.version.split('.')[1])+1}.0`},coreInput:{version:record.coordinate.version,sourceSha256:record.sourceSha256}};
  const repository = {id:'12345',ownerId:'123',owner:'example-student',name:'coin-practice',url:'https://github.com/example-student/coin-practice'};
  const plan = await previewExtraction(root,{repository,descriptor,sources:['src/main/java/CreditsBadge.java']});
  await applyPlan(plan);
  const libraryRoot = path.join(root, 'libraries', slug);
  for (const [name, folder] of [['LibraryCheck','src/test/java'],['FirstExample','examples/first'],['SecondExample','examples/second']]) {
    await fs.copyFile(path.join(checkpoint, 'practice', name + '.java'), path.join(libraryRoot, folder, name + '.java'));
  }
  const temporaryRoot = await fs.mkdtemp(path.join(scratch, 'zero check with spaces '));
  const result = await runLocalCheck(await prepareLocalCheck(root, slug, {temporaryRoot}));
  assert.equal(result.passed, true);
  assert.deepEqual(result.checks, ['LibraryCheck','FirstExample','SecondExample']);
  assert.equal(result.outputs.length, 6);
  console.log(JSON.stringify({passed:result.passed,version:result.version,checks:result.checks,commands:result.outputs.length,package:result.classes,platform:process.platform,arch:process.arch}));
}
run().catch(error => {console.error(error);process.exitCode = 1;});
