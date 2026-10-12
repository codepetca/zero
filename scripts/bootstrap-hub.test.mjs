import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {authenticatedGithubIdentity,readBootstrapPreview,maintainedStarterUi,bootstrapArguments,bootstrapStarterUi} from './bootstrap-hub.mjs';
import * as trusted from '../hub/checker/runner.mjs';
import {createHub} from '../hub/service/hub.mjs';
import {createPostgresStorage} from '../hub/service/postgres-storage.mjs';
import {migrateDatabase} from '../hub/service/database.mjs';
import {createRuntimePool} from '../hub/service/runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const previewFile=path.join(repo,'.verification/zerohub-hosting/preview.png');

test('bootstrap accepts only fixed-source preview arguments',()=>{
  assert.deepEqual(bootstrapArguments(['--preview','actual.png']),{previewPath:'actual.png'});
  for(const args of [[],['--bundle','x'],['--preview','x','--owner','1'],['--preview','x','--command','evil'],['--source','elsewhere']])assert.throws(()=>bootstrapArguments(args),/Usage/);
});
test('preview loader validates bounded PNG bytes and rejects symlinks, truncation and oversize',async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),'zero-bootstrap-png-'));
  try {
    const bundle=await (await import('../hub/fixtures/starter-ui.mjs')).starterUiBundle('ui1');
    const png=path.join(temporary,'preview.png');await writeFile(png,Buffer.from(bundle.files['preview.png'],'base64'));
    assert.equal(await readBootstrapPreview(png),bundle.files['preview.png']);
    await symlink(png,path.join(temporary,'link.png'));await assert.rejects(readBootstrapPreview(path.join(temporary,'link.png')));
    await writeFile(png,Buffer.alloc(256*1024+1));await assert.rejects(readBootstrapPreview(png),/256 KiB/);
    await writeFile(png,Buffer.from('not a PNG'));await assert.rejects(readBootstrapPreview(png),/PNG policy/);
  } finally {await rm(temporary,{recursive:true,force:true});}
});
test('maintained bundle has fixed version/source/classes/provenance and truthful changelog',async()=>{
  const fixture=await (await import('../hub/fixtures/starter-ui.mjs')).starterUiBundle('ui1');
  const bundle=await maintainedStarterUi('ui9',fixture.files['preview.png']);
  assert.equal(bundle.descriptor.version,'0.1.0');assert.equal(bundle.descriptor.title,'Starter UI');
  assert.deepEqual(bundle.descriptor.components.map(component=>component.className),['StartScreen','Hud','ScoreDisplay']);
  assert.match(bundle.files['CHANGELOG.md'],/First maintained Starter UI release/);
  assert.equal(bundle.files.LICENSE,await readFile(path.join(repo,'libraries/starter-ui/LICENSE'),'utf8'));
  for(const name of ['StartScreen','Hud','ScoreDisplay'])assert.equal(bundle.files[`src/zero/ui9/${name}.java`],(await readFile(path.join(repo,`libraries/starter-ui/src/main/java/zero/starterui/${name}.java`),'utf8')).replaceAll('zero.starterui','zero.ui9'));
});
test('actor comes only from bounded authenticated gh api user response',async()=>{
  // Unit-only executable fixture; no live GitHub call or demo default in script.
  const temporary=await mkdtemp(path.join(os.tmpdir(),'zero-bootstrap-gh-'));
  const prior=process.env.PATH;
  try {
    process.env.PATH=temporary+path.delimiter+prior;
    const stub=path.join(temporary,'gh');
    for(const [profile,valid] of [[{id:303,login:'fixture-maintainer'},true],[{id:'303',login:'fixture-maintainer'},false],[{id:0,login:'fixture-maintainer'},false],[{id:303,login:'bad login'},false]]) {
      await writeFile(stub,`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(profile)}'\n`,{mode:0o700});
      if(valid)assert.deepEqual(await authenticatedGithubIdentity(),{id:'303',login:'fixture-maintainer'});
      else await assert.rejects(authenticatedGithubIdentity(),/authenticated numeric identity/);
    }
    await writeFile(stub,'#!/bin/sh\nexit 1\n',{mode:0o700});await assert.rejects(authenticatedGithubIdentity(),/Authenticated GitHub identity unavailable/);
  } finally {process.env.PATH=prior;await rm(temporary,{recursive:true,force:true});}
});

test('optional real maintained-source bootstrap uses three restricted logins, ignores other jobs and is idempotent',{skip:process.env.ZERO_HUB_BOOTSTRAP_DOCKER!=='1'},async()=>{
  const {startDisposablePostgres}=await import('../hub/service/postgres-fixture.mjs');
  const fixture=await startDisposablePostgres({port:15452});
  const pools=[];
  try {
    await fixture.pool.query(await readFile(new URL('../hub/sql/000-roles.sql',import.meta.url),'utf8'));
    await migrateDatabase(fixture.pool,{roles:true});
    for(const kind of ['api','checker','publisher']) {
      const login=`zero_bootstrap_${kind}_${randomBytes(5).toString('hex')}`,password=randomBytes(24).toString('hex');
      await fixture.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'`);await fixture.pool.query(`GRANT hub_${kind} TO ${login}`);
      const url=new URL(fixture.connectionString);url.username=login;url.password=password;pools.push(createRuntimePool(url.href,`hub_${kind}`));
    }
    const api=createHub({pool:pools[0],storage:createPostgresStorage(pools[0]),checker:trusted,origin:'https://zero.example',uploadsEnabled:true});
    const unrelatedActor={id:'10000001',login:'disposable-fixture'};
    const unrelated=await api.reserveLibrary(unrelatedActor,{className:'ScoreDisplay',title:'Unrelated queued sentinel'});
    const unrelatedJob=await api.submit(unrelatedActor,await maintainedStarterUi(unrelated.libraryId,await readBootstrapPreview(previewFile)));
    const options={apiPool:pools[0],checkerPool:pools[1],publisherPool:pools[2],origin:'https://zero.example',previewPath:previewFile};
    const actor=await authenticatedGithubIdentity();
    const first=await bootstrapStarterUi(options);assert.equal(first.status,'published',JSON.stringify(first));
    assert.equal(first.release.contributor.githubId,actor.id);assert.equal(first.release.contributor.login,actor.login);
    assert.equal((await api.getSubmission(unrelatedActor,unrelatedJob.id)).status,'queued');
    const again=await bootstrapStarterUi(options);assert.equal(again.status,'already-exists');assert.equal(again.submissionId,first.submissionId);assert.deepEqual(again.release,first.release);
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_submissions')).rows[0].n,2);
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_releases')).rows[0].n,1);
    const changed=path.join(os.tmpdir(),`zero-bootstrap-changed-${randomBytes(6).toString('hex')}.png`);
    const illustrative=(await (await import('../hub/fixtures/starter-ui.mjs')).starterUiBundle('ui1')).files['preview.png'];
    await writeFile(changed,Buffer.from(illustrative,'base64'));
    try {await assert.rejects(bootstrapStarterUi({...options,previewPath:changed}),/differs from the fixed maintained source/);} finally {await rm(changed,{force:true});}
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM hub_releases')).rows[0].n,1);
    await api.stop();
    console.log(`MAINTAINED_STARTER_UI_OK ${first.release.libraryId}:${first.release.version}; authenticated contributor; exact-source checker/publisher; unrelated job unchanged`);
  } finally {await Promise.all(pools.map(pool=>pool.end()));await fixture.stop();}
});

test('terminal failed maintained job returns bounded failure without running checker or publisher',async()=>{
  const temporary=await mkdtemp(path.join(os.tmpdir(),'zero-bootstrap-failure-'));
  const prior=process.env.PATH;
  try {
    await writeFile(path.join(temporary,'gh'),'#!/bin/sh\nprintf \'%s\\n\' \'{"id":303,"login":"fixture-maintainer"}\'\n',{mode:0o700});
    process.env.PATH=temporary+path.delimiter+prior;
    const preview=(await (await import('../hub/fixtures/starter-ui.mjs')).starterUiBundle('ui1')).files['preview.png'];
    const png=path.join(temporary,'preview.png');await writeFile(png,Buffer.from(preview,'base64'));
    const bundle=await maintainedStarterUi('ui9',preview),id='11111111-1111-4111-8111-111111111111';
    const counts={checker:0,publisher:0};
    const guarded=role=>({query:async sql=>{counts[role.slice(4)]++;if(sql==='SELECT current_user AS role')return {rows:[{role}]};return {rows:[{elevated:false,missing_group:false,extra_membership:false,membership_admin:false,direct_grants:false,owned_objects:false}]};}});
    const apiPool={
      connect:async()=>({query:async()=>({rows:[]}),release:()=>{}}),
      query:async sql=>{
        if(sql==='SELECT current_user AS role')return {rows:[{role:'hub_api'}]};
        if(sql.startsWith('\nWITH RECURSIVE'))return {rows:[{elevated:false,missing_group:false,extra_membership:false,membership_admin:false,direct_grants:false,owned_objects:false}]};
        if(sql.startsWith('SELECT s.id,s.library_id'))return {rows:[{id,library_id:'ui9',source_digest:trusted.sourceDigest(bundle),bundle,status:'failed'}]};
        if(sql.startsWith('SELECT s.id,s.status'))return {rows:[{id,status:'failed',owner_id:'303',error:'failure '.repeat(200),report:{passed:false,checks:Array.from({length:20},()=>({id:'behavior',passed:false,detail:'details '.repeat(200)}))}}]};
        throw new Error('Unexpected fixture DB operation');
      }
    };
    const result=await bootstrapStarterUi({apiPool,checkerPool:guarded('hub_checker'),publisherPool:guarded('hub_publisher'),origin:'https://zero.example',previewPath:png});
    assert.equal(result.status,'failed');assert.equal(result.submissionId,id);assert.equal(result.checks.length,8);assert.ok(result.reason.length<=512);assert.ok(result.checks.every(check=>check.detail.length<=512));
    assert.deepEqual(counts,{checker:2,publisher:2}); // Role validation only.
  } finally {process.env.PATH=prior;await rm(temporary,{recursive:true,force:true});}
});
