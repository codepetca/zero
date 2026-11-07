'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {parseStudentFileStatus, readStudentFileStatus} = require('../src/student-file-status');

test('partial clone configuration is refused before status',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-promisor-status-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('/usr/bin/git',args,{cwd:root,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});git('init','-q','--template=');git('config','remote.origin.promisor','true');await assert.rejects(readStudentFileStatus(root,{safeConfig:true}),/partial clones/i);
});

test('classifies Git changes without losing spaces or Unicode in file names', () => {
  const status = parseStudentFileStatus(' M src/Main.java\0?? assets/ coin.wav\0 D assets/old.wav\0A  src/é.java\0UU src/conflict.java\0');
  assert.deepEqual([...status], [['src/Main.java','modified'],['assets/ coin.wav','added'],['assets/old.wav','deleted'],['src/é.java','added'],['src/conflict.java','conflict']]);
  assert.equal(status.statusCodes.get('src/Main.java'),' M');assert.equal(status.statusCodes.get('assets/ coin.wav'),'??');
  assert.equal(Object.keys(status).includes('statusCodes'),false);
});
test('status hints distinguish staged additions, staged-only changes and recreated paths',()=>{
  const status=parseStudentFileStatus('AM staged\0A  staged-only\0D  recreated\0?? recreated\0');
  assert.equal(status.get('staged'),'added');assert.equal(status.statusCodes.get('staged'),'AM');
  assert.equal(status.statusCodes.get('staged-only'),'A ');assert.equal(status.statusCodes.get('recreated'),'recreated');
});

test('refuses truncated, ambiguous, unsupported, and unsafe status records', () => {
  for (const status of [' M file', 'bad\0', 'R  renamed\0', ' M ../outside\0', ' M /absolute\0', ' M a\\b\0', ' M a\0 M a\0', 'D  a\0?? a\0?? a\0', ' D a\0?? a\0']) {
    assert.throws(() => parseStudentFileStatus(status));
  }
  assert.equal(parseStudentFileStatus('').size, 0);
});

test('represents staged deletion with recreation and a deleted staged addition', async t => {
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {execFileSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-status-recreated-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'}});
  git('init','-q');await fs.writeFile(path.join(root,'Recreated.java'),'original');git('add','.');
  git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','initial');
  git('rm','-q','Recreated.java');await fs.writeFile(path.join(root,'Recreated.java'),'new work');
  await fs.writeFile(path.join(root,'Added.java'),'staged');git('add','Added.java');await fs.unlink(path.join(root,'Added.java'));
  const raw=git('status','--porcelain=v1','-z','--no-renames','--untracked-files=all');
  assert.match(raw,/D  Recreated\.java\0/);assert.match(raw,/\?\? Recreated\.java\0/);assert.match(raw,/AD Added\.java\0/);
  assert.deepEqual(Object.fromEntries(await readStudentFileStatus(root)),{'Added.java':'deleted','Recreated.java':'modified'});
  assert.equal(parseStudentFileStatus('?? Recreated.java\0D  Recreated.java\0').get('Recreated.java'),'modified');
});

test('reads real Git status for a disposable student project', async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const {execFileSync} = require('node:child_process');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-file-status-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', env:{...process.env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_TERMINAL_PROMPT:'0'}});
  git('init', '-q');
  await fs.writeFile(path.join(root, 'modify.txt'), 'before');
  await fs.writeFile(path.join(root, 'delete.txt'), 'before');
  git('add', '.');
  git('-c', 'user.name=Student', '-c', 'user.email=student@example.invalid', 'commit', '-qm', 'Initial');
  await fs.writeFile(path.join(root, 'modify.txt'), 'after');
  await fs.rm(path.join(root, 'delete.txt'));
  await fs.writeFile(path.join(root, 'new file.txt'), 'new');
  const changes = await readStudentFileStatus(root);
  assert.deepEqual(Object.fromEntries(changes), {'delete.txt':'deleted', 'modify.txt':'modified', 'new file.txt':'added'});
});

test('background status does not execute configured clean filters', async t => {
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {execFileSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-status-filter-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}});
  git('init','-q');await fs.writeFile(path.join(root,'file.txt'),'original');git('add','file.txt');
  git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','initial');
  await fs.writeFile(path.join(root,'.gitattributes'),'*.txt filter=example\n');
  git('config','filter.example.clean',`touch ${path.join(root,'filter-ran')}`);
  await fs.writeFile(path.join(root,'file.txt'),'student work');
  await assert.rejects(readStudentFileStatus(root),/filters/);
  await assert.rejects(fs.stat(path.join(root,'filter-ran')),{code:'ENOENT'});
});

test('background status refuses ambiguous literal filter names and accepts stock attributes', async t => {
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {execFileSync}=require('node:child_process');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-status-ambiguous-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
  const git=(...args)=>execFileSync('git',['-c',`core.hooksPath=${os.devNull}`,...args],{cwd:root,env,encoding:'utf8'});
  git('init','-q');await fs.writeFile(path.join(root,'Main.java'),'original\n');
  await fs.writeFile(path.join(root,'.gitattributes'),'* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
  git('add','.');git('-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','initial');
  await fs.writeFile(path.join(root,'Main.java'),'student work\n');git('config','filter.unused.clean','false');
  assert.equal((await readStudentFileStatus(root,{safeConfig:true})).get('Main.java'),'modified');
  const index=await fs.readFile(path.join(root,'.git','index'));
  for(const name of ['unset','unspecified']) {
    await fs.writeFile(path.join(root,'.git','info','attributes'),`Main.java filter=${name}\n`);
    git('config',`filter.${name}.process`,'false');
    await assert.rejects(readStudentFileStatus(root,{safeConfig:true}),/File status is unavailable with active Git filters/);
    assert.equal(await fs.readFile(path.join(root,'Main.java'),'utf8'),'student work\n');
    assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);
    git('config','--unset',`filter.${name}.process`);
  }
});

test('reads a linked worktree without running filters or trusting symlinked metadata', async t => {
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const {execFileSync}=require('node:child_process');
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-linked-status-')));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const main=path.join(base,'main'),linked=path.join(base,'linked');await fs.mkdir(main);
  const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'};
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,env,encoding:'utf8'});
  git(main,'init','-q');await fs.writeFile(path.join(main,'Main.java'),'original');git(main,'add','.');
  git(main,'-c','user.name=Student','-c','user.email=student@example.invalid','commit','-qm','initial');
  git(main,'worktree','add','-qb','feature',linked);
  await fs.writeFile(path.join(linked,'Main.java'),'changed');await fs.writeFile(path.join(linked,'New.java'),'new');
  const changes=await readStudentFileStatus(linked);
  assert.deepEqual(Object.fromEntries(changes),{'Main.java':'modified','New.java':'added'});assert.equal(changes.supportsDiscard,false);
  await assert.rejects(readStudentFileStatus(linked,{standaloneOnly:true}),/standalone/);
  await fs.writeFile(path.join(linked,'.gitattributes'),'*.java filter=example\n');
  git(main,'config','filter.example.clean',`touch ${path.join(base,'filter-ran')}`);
  await assert.rejects(readStudentFileStatus(linked),/filters/);await assert.rejects(fs.stat(path.join(base,'filter-ran')),{code:'ENOENT'});
  const marker=path.join(linked,'.git'),original=await fs.readFile(marker,'utf8');
  const gitdir=original.trim().slice('gitdir: '.length),alias=path.join(base,'gitdir-alias');
  await fs.symlink(gitdir,alias,'dir');await fs.writeFile(marker,`gitdir: ${alias}\n`);
  await assert.rejects(readStudentFileStatus(linked),/metadata cannot be verified/);
  await fs.writeFile(marker,original);
});
