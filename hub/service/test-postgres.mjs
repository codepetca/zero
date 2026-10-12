import {spawn} from 'node:child_process';
import {startDisposablePostgres} from './postgres-fixture.mjs';

const fixture=await startDisposablePostgres({port:Number(process.env.ZERO_HUB_TEST_PORT??15439)});
try {
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--test','service/service.test.mjs'],{cwd:new URL('..',import.meta.url).pathname,stdio:'inherit',env:{...process.env,ZERO_HUB_TEST_DATABASE:fixture.connectionString}});
    child.on('error',reject);child.on('exit',resolve);
  });
  if(exitCode!==0)process.exitCode=exitCode??1;
} finally {await fixture.stop();}
