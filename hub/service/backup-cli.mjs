// Run in a separate, private operator environment. No service starts here.
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createRuntimePool} from './runtime.mjs';
import {exportBackup,restoreBackup} from './backup.mjs';

export function operatorBackupConfiguration(args,env) {
  const [operation,file]=args;
  if(args.length!==2||!['export','restore'].includes(operation)||!path.isAbsolute(file??'')||path.normalize(file)!==file)throw new Error('Invalid private operator invocation');
  const dedicated=operation==='restore'?'ZERO_HUB_RESTORE_DATABASE_URL':'ZERO_HUB_BACKUP_DATABASE_URL';
  const names=[dedicated,'ZERO_HUB_MIGRATION_DATABASE_URL'].filter(name=>env[name]);
  if(names.length!==1)throw new Error('Separate operator database environment required');
  const selected=names[0];
  for(const [name,value] of Object.entries(env)) {
    if(!value||name===selected)continue;
    if(/DATABASE_URL|POSTGRES|NEON.*(?:URL|TOKEN|KEY)|^PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|OPTIONS)|GITHUB_CLIENT_(?:ID|SECRET)/.test(name))throw new Error('Mixed credential environment refused');
  }
  if(env.ZERO_HUB_UPLOADS==='1'||env.ZERO_HUB_WORKERS_ENABLED==='1')throw new Error('Active service environment refused');
  if(operation==='restore'&&env.ZERO_HUB_RESTORE_ENABLED!=='1')throw new Error('Restore enable flag required');
  return {operation,file,connectionString:env[selected]};
}
export async function runOperatorBackup(args=process.argv.slice(2),env=process.env) {
  let pool;
  try {
    const config=operatorBackupConfiguration(args,env);
    pool=createRuntimePool(config.connectionString,'hub_migration_owner');
    return await (config.operation==='restore'?restoreBackup({pool,file:config.file,enabled:true}):exportBackup({pool,file:config.file}));
  }catch{throw new Error('ZeroHub private backup operation failed');}
  finally{await pool?.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{console.log(JSON.stringify(await runOperatorBackup()));}
  catch{console.error('ZeroHub private backup operation failed; no credentials or archive content are logged.');process.exitCode=1;}
}
