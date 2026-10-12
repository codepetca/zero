// Worker lifecycle only: no HTTP, cookies, sessions, or OAuth imports.
import {createPipeline} from './pipeline.mjs';
import {createPostgresStorage} from './postgres-storage.mjs';
import {createRuntimePool,verifyRole,configurationError} from './runtime.mjs';
export function workerLifecycle(env={}) {
  const mode=env.ZERO_HUB_WORKER_MODE??'batch';
  if(!['batch','continuous'].includes(mode))throw configurationError('Use batch or continuous worker mode');
  const maxJobs=Number(env.ZERO_HUB_WORKER_MAX_JOBS??10);
  if(!Number.isSafeInteger(maxJobs)||maxJobs<1||maxJobs>100)throw configurationError('Worker batch limit must be from 1 to 100');
  const intervalMs=Number(env.ZERO_HUB_WORKER_INTERVAL_MS??1000);
  if(!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>60000)throw configurationError('Invalid worker interval');
  return {mode,maxJobs,intervalMs};
}
// Scheduling only. The caller must first verify its runtime database role.
export async function workerLoop(step,{mode,maxJobs,stopping,wait}) {
  let processed=0;
  while(!stopping()) {
    const worked=await step();
    if(worked)processed++;
    if(mode==='batch'&&(!worked||processed>=maxJobs))break;
    if(mode==='continuous'&&!stopping())await wait();
  }
  return {mode,processed};
}
export async function runWorker({kind,checker,env=process.env}) {
  if(!['checker','publisher'].includes(kind))throw configurationError('Invalid worker stage');
  if(env.ZERO_HUB_WORKERS_ENABLED!=='1')throw configurationError('Worker activation requires explicit ZERO_HUB_WORKERS_ENABLED=1 and the independent public execution gate');
  // Refuse a mixed credential environment before receiving any candidate source.
  if(env.ZERO_HUB_GITHUB_CLIENT_ID||env.ZERO_HUB_GITHUB_CLIENT_SECRET)throw configurationError('Worker environment must not contain GitHub OAuth credentials');
  const variable=kind==='checker'?'ZERO_HUB_CHECKER_DATABASE_URL':'ZERO_HUB_PUBLISHER_DATABASE_URL';
  const role=`hub_${kind}`;
  const {mode,maxJobs,intervalMs}=workerLifecycle(env);
  for(const name of ['ZERO_HUB_API_DATABASE_URL','ZERO_HUB_DATABASE_URL','ZERO_HUB_MIGRATION_DATABASE_URL',kind==='checker'?'ZERO_HUB_PUBLISHER_DATABASE_URL':'ZERO_HUB_CHECKER_DATABASE_URL']) if(env[name])throw configurationError('Worker environment must contain only its own database credential');
  const pool=createRuntimePool(env[variable],role);
  let stopping=false,wake,shutdownTimer;
  const stop=()=>{if(stopping)return;stopping=true;wake?.();shutdownTimer=setTimeout(()=>{console.error('ZeroHub worker shutdown exceeded the bounded grace period');process.exit(1);},180000);shutdownTimer.unref();};
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
  try {
    await verifyRole(pool,role);
    const pipeline=createPipeline({pool,storage:()=>Promise.resolve(createPostgresStorage(pool)),checker});
    const step=kind==='checker'?pipeline.workOnce:pipeline.publishOnce;
    return await workerLoop(step,{mode,maxJobs,stopping:()=>stopping,wait:()=>new Promise(resolve=>{const timer=setTimeout(resolve,intervalMs);wake=()=>{clearTimeout(timer);resolve();};})});
  } finally {
    clearTimeout(shutdownTimer);
    for(const signal of ['SIGINT','SIGTERM'])process.removeListener(signal,stop);
    await pool.end();
  }
}
