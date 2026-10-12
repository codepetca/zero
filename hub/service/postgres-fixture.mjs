// Disposable local test database. All credentials are fresh and confined to the
// temporary environment file/child environment; none appear in command arguments.
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const IMAGE='postgres@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3';
async function docker(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['ignore','ignore','pipe']});
    let error='';child.stderr.on('data',data=>{error+=data.toString();});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(`Disposable database command failed (${code}): ${error.slice(0,500)}`)));
  });
}

export async function startDisposablePostgres({port=15439}={}) {
  if (!Number.isSafeInteger(port) || port<1024 || port>65535) throw new Error('Choose a dedicated test port from 1024–65535');
  const temporary=await mkdtemp(path.join(os.tmpdir(),'zero-hub-pg-'));
  const name=`zero-hub-tests-${process.pid}-${randomBytes(4).toString('hex')}`;
  const password=randomBytes(32).toString('hex');
  const envFile=path.join(temporary,'postgres.env');
  await writeFile(envFile,`POSTGRES_USER=zero_test\nPOSTGRES_DB=zero_test\nPOSTGRES_PASSWORD=${password}\n`,{mode:0o600});
  const connectionString=`postgresql://zero_test:${password}@127.0.0.1:${port}/zero_test`;
  const pool=new pg.Pool({connectionString,max:10,connectionTimeoutMillis:1000});
  let stopped=false;
  async function stop() {
    if (stopped) return;
    stopped=true;
    await pool.end();
    await docker(['rm','--force',name]).catch(()=>{});
    await rm(temporary,{recursive:true,force:true});
  }
  try {
    await docker(['run','--detach','--rm','--name',name,'--publish',`127.0.0.1:${port}:5432`,'--env-file',envFile,'--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',IMAGE]);
    let ready=false;
    for(let attempt=0;attempt<60;attempt++) {
      try {await pool.query('SELECT 1');ready=true;}catch{}
      if(ready)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!ready)throw new Error('Disposable PostgreSQL did not become ready');
    return {pool,stop,connectionString};
  } catch(error) {await stop();throw error;}
}
