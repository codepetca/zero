'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/core');
async function temporary(t) {const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-test-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('accepts canonical GitHub repository pages and .git remotes', () => {
  for (const input of ['https://github.com/student/app','https://github.com/student/app.git','https://github.com/student/app/']) assert.deepEqual(core.parseRepositoryUrl(input),{page:'https://github.com/student/app',remote:'https://github.com/student/app.git'});
});
test('rejects credentials, shell input, alternate hosts, paths and schemes', () => {
  for (const input of ['git@github.com:a/b','https://token@github.com/a/b','https://github.com.evil/a/b','http://github.com/a/b','https://github.com/a/b/tree/main','https://github.com/a/b?token=secret','https://github.com/a/b#x','https://github.com/a/..','https://github.com/a/b;echo',' https://github.com/a/b','https://github.com/a/b%20x','https://github.com:443/a/b']) assert.throws(()=>core.parseRepositoryUrl(input));
});
test('resolves root and development child, rejects ambiguous or missing projects', async t => {
  const dir = await temporary(t); const a = path.join(dir,'a');const b = path.join(dir,'b');
  await fs.mkdir(path.join(a,'student-template'),{recursive:true}); await fs.mkdir(b);
  await fs.writeFile(path.join(a,'student-template','zero.json'),'{}');
  assert.equal(await core.resolveProject([a]),path.join(a,'student-template'));
  await fs.writeFile(path.join(b,'zero.json'),'{}'); assert.equal(await core.resolveProject([b]),b);
  await assert.rejects(core.resolveProject([a,b]),/Multiple/); await assert.rejects(core.resolveProject([dir]),/Open a folder/);
});
test('parent repository prevents all Git mutations', async t => {
  const parent = await temporary(t);const child = path.join(parent,'student');await fs.mkdir(child);
  const calls=[]; const run=async (_,args)=>{calls.push(args);return parent;};
  await assert.rejects(core.connectRepository(child,'https://github.com/student/app',async()=>true,run),/different Git repository/);
  assert.deepEqual(calls,[['rev-parse','--show-toplevel']]);
});
test('connect initializes exact project and checks root before remote mutation', async t => {
  const dir=await temporary(t);const calls=[];let initialized=false;
  const run=async(cwd,args)=>{assert.equal(cwd,dir);calls.push(args);if(args[0]==='rev-parse'){if(initialized)return dir;throw Object.assign(new Error('missing'),{code:128,stderr:'fatal: not a git repository'});}if(args[0]==='init'){initialized=true;return '';}if(args[1]==='get-url')throw Object.assign(new Error('missing'),{code:2,stderr:"error: No such remote 'origin'"});return '';};
  await core.connectRepository(dir,'https://github.com/student/app',async()=>true,run);
  assert.deepEqual(calls.at(-1),['remote','add','origin','https://github.com/student/app.git']);
  assert.deepEqual(calls.at(-2),['rev-parse','--show-toplevel']);
});
test('remote replacement cancellation preserves remote and arbitrary process errors propagate', async t => {
  const dir=await temporary(t);const calls=[];
  const run=async(_,args)=>{calls.push(args);return args[0]==='rev-parse'?dir:'https://github.com/old/app.git';};
  assert.equal(await core.connectRepository(dir,'https://github.com/new/app',async()=>false,run),null);
  assert.ok(calls.every(args=>args[1]!=='set-url'));
  await assert.rejects(core.assertRepositoryRoot(dir,async()=>{throw Object.assign(new Error('git missing'),{code:'ENOENT'});}),/git missing/);
});
test('simulation reports no upload and has no process or mutation dependencies', () => {
  assert.deepEqual(core.simulatedUpload(),{simulation:true,uploaded:false,message:'Simulation only — nothing uploaded. Your files remain local. Copy your repository link separately for Pika.'});
  const source=core.simulatedUpload.toString(); assert.doesNotMatch(source,/\b(?:git|execute|execFile|spawn|push|commit|stage)\s*\(/);
});
test('run specification uses separate fixed args and platform wrappers', () => {
  assert.deepEqual(core.runSpecification('/a path','linux'),{cwd:'/a path',command:'/a path/mvnw',args:['clean','compile','javafx:run'],shell:false});
  assert.equal(core.runSpecification('/a path','win32').command,'/a path/mvnw.cmd');
  assert.equal(core.runSpecification('/a path','win32').shell,true);
});
