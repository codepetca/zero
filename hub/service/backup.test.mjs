import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,chmod,writeFile,readdir,stat,symlink,mkdir,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportBackup,restoreBackup} from './backup.mjs';
import {operatorBackupConfiguration,runOperatorBackup} from './backup-cli.mjs';
let root;
before(async()=>{root=await realpath(await mkdtemp(path.join(os.tmpdir(),'zero-backup-unit-')));await chmod(root,0o700);});
after(async()=>{await rm(root,{recursive:true,force:true});});
const unavailable={async connect(){throw new Error('SECRET_SOURCE_PRIVATE_PASSWORD');}};
test('operator invocation requires one dedicated URL, explicit restore flag and absolute path',()=>{
  const file=path.join(root,'backup');
  const env={ZERO_HUB_BACKUP_DATABASE_URL:'postgres://operator/private'};
  assert.equal(operatorBackupConfiguration(['export',file],env).operation,'export');
  assert.equal(operatorBackupConfiguration(['restore',file],{ZERO_HUB_MIGRATION_DATABASE_URL:'postgres://operator/private',ZERO_HUB_RESTORE_ENABLED:'1'}).operation,'restore');
  for(const args of [[],['export','relative'],['export',file,'extra'],['unknown',file],['export',path.join(root,'x')+'/../archive']])assert.throws(()=>operatorBackupConfiguration(args,env));
  assert.throws(()=>operatorBackupConfiguration(['restore',file],{ZERO_HUB_RESTORE_DATABASE_URL:'private'}));
  for(const variable of ['ZERO_HUB_API_DATABASE_URL','ZERO_HUB_CHECKER_DATABASE_URL','ZERO_HUB_PUBLISHER_DATABASE_URL','ZERO_HUB_RESTORE_DATABASE_URL','ZERO_HUB_MIGRATION_DATABASE_URL','DATABASE_URL','POSTGRES_URL','PGPASSWORD','ZERO_HUB_GITHUB_CLIENT_SECRET','ZERO_HUB_GITHUB_CLIENT_ID','NEON_API_KEY','ZERO_HUB_UPLOADS','ZERO_HUB_WORKERS_ENABLED'])assert.throws(()=>operatorBackupConfiguration(['export',file],{...env,[variable]:'1'}));
});
test('failed export removes exclusive private partial file and sanitizes failure',async()=>{
  const file=path.join(root,'failed');await assert.rejects(exportBackup({pool:unavailable,file}),{message:'ZeroHub private backup operation failed'});
  assert.equal((await readdir(root)).length,0);
  await assert.rejects(runOperatorBackup(['export',file],{ZERO_HUB_BACKUP_DATABASE_URL:'PRIVATE_INVALID_URL'}),{message:'ZeroHub private backup operation failed'});
});
test('overwrite, symlinks, public directories and nonregular archive paths fail closed',async()=>{
  const occupied=path.join(root,'occupied');await writeFile(occupied,'inert',{mode:0o600});
  await assert.rejects(exportBackup({pool:unavailable,file:occupied}));assert.equal((await stat(occupied)).size,5);
  const pointer=path.join(root,'pointer');await symlink(occupied,pointer);
  await assert.rejects(exportBackup({pool:unavailable,file:pointer}));await assert.rejects(restoreBackup({pool:unavailable,file:pointer,enabled:true}));
  const directory=path.join(root,'directory');await mkdir(directory,{mode:0o700});await assert.rejects(restoreBackup({pool:unavailable,file:directory,enabled:true}));
  const alias=path.join(root,'alias');await symlink(directory,alias);await assert.rejects(exportBackup({pool:unavailable,file:path.join(alias,'archive')}));
  await chmod(directory,0o755);await assert.rejects(exportBackup({pool:unavailable,file:path.join(directory,'archive')}));
  await chmod(occupied,0o644);await assert.rejects(restoreBackup({pool:unavailable,file:occupied,enabled:true}));
  await assert.rejects(restoreBackup({pool:unavailable,file:occupied}));
});
