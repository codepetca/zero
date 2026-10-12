import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,chmod,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {releaseEventInput,recordReleaseEvent} from './release-availability.mjs';
import {operatorReleaseConfiguration,runOperatorRelease} from './release-availability-cli.mjs';

const input={libraryId:'ui1',version:'1.0.0',action:'withdrawn',reason:'Private operational reason'};
test('operator configuration rejects mixed credentials and active service environments',()=>{
  const args=['--library','ui1','--version','1.0.0','--action','withdrawn','--reason-file','private.txt'];
  const env={ZERO_HUB_RELEASE_EVENTS_ENABLED:'1',ZERO_HUB_MIGRATION_DATABASE_URL:'postgresql://operator@example.test/test'};
  assert.equal(operatorReleaseConfiguration(args,env).connectionString,env.ZERO_HUB_MIGRATION_DATABASE_URL);
  for(const key of ['ZERO_HUB_API_DATABASE_URL','ZERO_HUB_CHECKER_DATABASE_URL','ZERO_HUB_PUBLISHER_DATABASE_URL','DATABASE_URL','POSTGRES_PASSWORD','PGHOST','NEON_TOKEN','ZERO_HUB_GITHUB_CLIENT_SECRET','ZERO_HUB_UPLOADS','ZERO_HUB_WORKERS_ENABLED'])assert.throws(()=>operatorReleaseConfiguration(args,{...env,[key]:'1'}),{code:'ZERO_HUB_CONFIG'});
});
test('operator validates exact coordinates, action and private reason before any SQL',async()=>{
  assert.deepEqual(releaseEventInput(input),input);
  for(const invalid of [null,[],{...input,actor:'spoofed'},{...input,libraryId:'ui0'},{...input,libraryId:'ui'+'a'.repeat(13)},{...input,version:'01.0.0'},{...input,version:'latest'},{...input,version:'1.0.0-dev'},{...input,action:'deleted'},{...input,reason:''},{...input,reason:'  '},{...input,reason:'bad\nlog'},{...input,reason:'\ud800'},{...input,reason:'😀'.repeat(2001)}]) {
    await assert.rejects(recordReleaseEvent({connect:()=>assert.fail('Invalid input reached SQL')},invalid,{enabled:true}),{code:'ZERO_HUB_CONFIG'});
  }
  for(const enabled of [undefined,false,'1',1])await assert.rejects(recordReleaseEvent({connect:()=>assert.fail('Disabled mutation reached SQL')},input,{enabled}),{code:'ZERO_HUB_CONFIG'});
});
test('operator refuses a non-migration role, rolls back and releases its connection',async()=>{
  const queries=[];let released=false;
  const client={query:async sql=>{queries.push(sql);return {rows:[{role:'hub_api'}]};},release:()=>{released=true;}};
  await assert.rejects(recordReleaseEvent({connect:async()=>client},input,{enabled:true}),{code:'ZERO_HUB_CONFIG'});
  assert.deepEqual(queries,['BEGIN','SELECT current_user AS role','ROLLBACK']);assert.ok(released);
});
test('operator rejects public, linked, nonregular, oversized and invalid UTF-8 reason files before database setup',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zero-release-private-'));
  try {
    const privateFile=path.join(dir,'private.txt'),publicFile=path.join(dir,'public.txt'),link=path.join(dir,'link.txt'),large=path.join(dir,'large.txt'),invalid=path.join(dir,'invalid.txt');
    await writeFile(privateFile,'Private reason',{mode:0o600});
    await writeFile(publicFile,'Private reason',{mode:0o600});await chmod(publicFile,0o644);
    await symlink(privateFile,link);await writeFile(large,Buffer.alloc(8001,97),{mode:0o600});await writeFile(invalid,Buffer.from([0xff]),{mode:0o600});
    for(const file of [publicFile,link,dir,large,invalid]) {
      await assert.rejects(runOperatorRelease(['--library','ui1','--version','1.0.0','--action','withdrawn','--reason-file',file],{
        ZERO_HUB_RELEASE_EVENTS_ENABLED:'1',ZERO_HUB_MIGRATION_DATABASE_URL:'invalid://must-not-reach-database'
      }),error=>error.code==='ZERO_HUB_CONFIG'&&error.message.startsWith('Use an owned regular private reason file'));
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('CLI invalid arguments and disabled mutation failures do not log private arguments or URLs',async()=>{
  for(const args of [['--reason','private-hidden-value'],['--library','ui1','--version','1.0.0','--action','withdrawn','--reason-file','private-hidden-value']]) {
    let output='';const child=spawn(process.execPath,[new URL('./release-availability-cli.mjs',import.meta.url).pathname,...args],{env:{...process.env,ZERO_HUB_RELEASE_EVENTS_ENABLED:'0',ZERO_HUB_MIGRATION_DATABASE_URL:'postgresql://private-hidden-value'},stdio:['ignore','pipe','pipe']});
    for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;});
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
    assert.equal(code,1);assert.ok(!output.includes('private-hidden-value'));assert.ok(!output.includes('postgresql://'));
  }
});
