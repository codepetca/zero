import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRuntimePool,configurationError,runMain} from './runtime.mjs';
import {recordReleaseEvent} from './release-availability.mjs';

export function operatorReleaseConfiguration(args,env) {
  const values=new Map();
  for(let i=0;i<args.length;i+=2) {
    if(!['--library','--version','--action','--reason-file'].includes(args[i])||values.has(args[i])||!args[i+1])
      throw configurationError('Use --library ID --version VERSION --action withdrawn|restored --reason-file PRIVATE_FILE');
    values.set(args[i],args[i+1]);
  }
  if(values.size!==4)throw configurationError('Provide library, version, action and a private reason file');
  if(env.ZERO_HUB_RELEASE_EVENTS_ENABLED!=='1')throw configurationError('Set ZERO_HUB_RELEASE_EVENTS_ENABLED=1 to enable operator mutations');
  if(!env.ZERO_HUB_MIGRATION_DATABASE_URL)throw configurationError('Set the separate ZERO_HUB_MIGRATION_DATABASE_URL');
  for(const [name,value]of Object.entries(env)) {
    if(!value||name==='ZERO_HUB_MIGRATION_DATABASE_URL')continue;
    if(/DATABASE_URL|POSTGRES|NEON.*(?:URL|TOKEN|KEY)|^PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|OPTIONS)|GITHUB_CLIENT_(?:ID|SECRET)/.test(name))
      throw configurationError('Use a separate operator environment without runtime or account credentials');
  }
  if(env.ZERO_HUB_UPLOADS==='1'||env.ZERO_HUB_WORKERS_ENABLED==='1')throw configurationError('Use a separate operator environment without active services');
  return {values,connectionString:env.ZERO_HUB_MIGRATION_DATABASE_URL};
}

export async function runOperatorRelease(args=process.argv.slice(2),env=process.env) {
  const {values,connectionString}=operatorReleaseConfiguration(args,env);
  let reason;
  try {
    const file=await open(values.get('--reason-file'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try {
      const stat=await file.stat();
      if(!stat.isFile()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid()||stat.size>8000)throw new Error();
      const buffer=Buffer.alloc(8001),{bytesRead}=await file.read(buffer,0,buffer.length,0);
      if(bytesRead>8000)throw new Error();
      const bytes=buffer.subarray(0,bytesRead);reason=bytes.toString('utf8').trimEnd();
      if(!Buffer.from(bytes.toString('utf8')).equals(bytes))throw new Error();
    } finally {await file.close();}
  } catch {throw configurationError('Use an owned regular private reason file with mode 600 and at most 8000 UTF-8 bytes');}
  const pool=createRuntimePool(connectionString,'hub_migration_owner');
  try {
    const result=await recordReleaseEvent(pool,{libraryId:values.get('--library'),version:values.get('--version'),action:values.get('--action'),reason},{enabled:true});
    return result;
  } finally {await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runMain(async()=>{
  const result=await runOperatorRelease();
  console.log(`ZeroHub release ${result.libraryId}:${result.version} ${result.action}; appended ${result.appended} event, revision ${result.revision}`);
});
