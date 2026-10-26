import {JamError,ID,validateState,validateSettlements,fail} from './schema.mjs';

// These are accepted-intent limits shared by cooperating writers of one registry
// branch. They are not a reservation or hard budget for outbound GitHub calls.
export const PILOT_PROVIDER_PACING=Object.freeze({
  ordinary:Object.freeze({minute:2,hour:20}),
  safety:Object.freeze({minute:2,hour:10}),
  settlement:Object.freeze({minute:2,hour:10}),
  clockSkewMs:30_000,
});

export function pacingPolicy(input) {
  if(input===null)return null;
  if(!input||Object.keys(input).sort().join(',')!=='clockSkewMs,ordinary,safety,settlement')fail(503,'Invalid jam pacing policy.');
  const result={clockSkewMs:input.clockSkewMs};
  if(!Number.isSafeInteger(result.clockSkewMs)||result.clockSkewMs<0||result.clockSkewMs>30_000)fail(503,'Invalid jam pacing clock tolerance.');
  for(const pool of ['ordinary','safety','settlement']) {
    const value=input[pool];
    if(!value||Object.keys(value).sort().join(',')!=='hour,minute'||
      !Number.isSafeInteger(value.minute)||!Number.isSafeInteger(value.hour)||value.minute<1||value.hour<value.minute||
      value.minute>PILOT_PROVIDER_PACING[pool].minute||value.hour>PILOT_PROVIDER_PACING[pool].hour)fail(503,'Invalid jam pacing limits.');
    result[pool]={minute:value.minute,hour:value.hour};
  }
  return result;
}

export async function admitJamIntent(snapshot,pool,time,policy,limits) {
  if(!policy)return;
  if(!snapshot||!['ordinary','safety','settlement'].includes(pool)||!Array.isArray(snapshot.ids)||snapshot.ids.length>limits.events||
    snapshot.ids.some(id=>typeof id!=='string'||!ID.test(id))||new Set(snapshot.ids).size!==snapshot.ids.length)fail(503,'Shared jam pacing is unavailable. Keep the same request.');
  const times={ordinary:[],safety:[],settlement:[]};
  const ledger=validateSettlements(snapshot.settlements,limits);
  for(const item of Object.values(ledger.operations))times.settlement.push(item.settledAt);
  for(const id of snapshot.ids) {
    const {state}=await snapshot.read(id);
    if(!state)fail(503,'Shared jam pacing is unavailable. Keep the same request.');
    for(const item of Object.values(validateState(state,id,limits).operations))times[item.pool].push(item.acceptedAt);
  }
  // Count modest future timestamps conservatively. A larger clock disagreement
  // stops new work without changing event deadlines or blocking result recovery.
  if(Object.values(times).some(items=>items.some(stamp=>stamp>time+policy.clockSkewMs)))fail(503,'The jam clock is behind official records. Keep the same request and contact the maintainer.');
  let retryMs=0;
  for(const [windowMs,maximum]of [[60_000,policy[pool].minute],[3_600_000,policy[pool].hour]]) {
    const recent=times[pool].filter(stamp=>stamp>time-windowMs).sort((a,b)=>a-b);
    if(recent.length>=maximum)retryMs=Math.max(retryMs,recent[recent.length-maximum]+windowMs-time);
  }
  if(retryMs>0) {
    const error=new JamError(429,'ZeroJams is pacing new changes. Wait and retry this same request; completed requests can still be recovered.');
    error.retryAfterSeconds=Math.min(86400,Math.max(1,Math.ceil(retryMs/1000)));
    throw error;
  }
}
