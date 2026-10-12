import {pathToFileURL} from 'node:url';
import {createRuntimePool} from './runtime.mjs';
import {readOperations,OPERATIONS_FAILURE} from './operations.mjs';

export function operationsConfiguration(env) {
  if(env.ZERO_HUB_MONITOR_ENABLED!=='1'||!env.ZERO_HUB_API_DATABASE_URL)throw new Error(OPERATIONS_FAILURE);
  for(const [name,value]of Object.entries(env)) {
    if(!value||name==='ZERO_HUB_API_DATABASE_URL')continue;
    if(/DATABASE_URL|POSTGRES|NEON.*(?:URL|TOKEN|KEY|SECRET|PASSWORD)|^PG[A-Z_]+$|OAUTH|GITHUB_CLIENT_(?:ID|SECRET)|^(?:GH_TOKEN|GITHUB_TOKEN)$/.test(name))throw new Error(OPERATIONS_FAILURE);
  }
  if(env.ZERO_HUB_UPLOADS==='1'||env.ZERO_HUB_WORKERS_ENABLED==='1')throw new Error(OPERATIONS_FAILURE);
  return {connectionString:env.ZERO_HUB_API_DATABASE_URL};
}
export async function runOperationsMonitor(env=process.env) {
  let pool;
  try {
    const {connectionString}=operationsConfiguration(env);
    pool=createRuntimePool(connectionString,'hub_api');
    return await readOperations(pool);
  } catch {throw new Error(OPERATIONS_FAILURE);}
  finally {try {await pool?.end();}catch {throw new Error(OPERATIONS_FAILURE);}}
}

export function operationsArguments(args) {
  if(args.length===0)return {alertsOnly:false};
  if(args.length===1&&args[0]==='--alerts-only')return {alertsOnly:true};
  throw new Error(OPERATIONS_FAILURE);
}
export function operationsOutput(report,{alertsOnly=false}={}) {
  return JSON.stringify(alertsOnly?{status:report.status,alerts:report.alerts}:report);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  // One invocation, one bounded report. A stalled connection or pool shutdown
  // cannot keep the standalone monitor alive indefinitely.
  const timer=setTimeout(()=>{console.error(OPERATIONS_FAILURE);process.exit(1);},30000);
  try {
    const options=operationsArguments(process.argv.slice(2));
    const report=await runOperationsMonitor();
    console.log(operationsOutput(report,options));process.exitCode=report.status==='attention'?2:0;
  } catch {console.error(OPERATIONS_FAILURE);process.exitCode=1;}
  finally {clearTimeout(timer);}
}
