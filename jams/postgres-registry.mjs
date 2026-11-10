// Local proof only. No connection, schema creation, seed or runtime wiring occurs
// without an explicitly supplied pool and explicit operator action.
import {randomBytes} from 'node:crypto';
import {ID,LIMITS,SHA,fail,validateSettlements,validateState} from './schema.mjs';

export const POSTGRES_REGISTRY_SCHEMA = `
CREATE TABLE zero_jams_registry_poc (
  singleton smallint PRIMARY KEY CHECK (singleton = 1),
  epoch text NOT NULL CHECK (epoch ~ '^[0-9a-f]{24}$'),
  generation bigint NOT NULL CHECK (generation >= 0),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object')
);`;
// Each new database incarnation MUST use a fresh unpredictable epoch. Never
// reuse an epoch when restoring/resetting a registry with a lower generation.
export const POSTGRES_REGISTRY_SEED = `INSERT INTO zero_jams_registry_poc (singleton,epoch,generation,document) VALUES (1,$1,0,$2::jsonb)`;
export const freshRegistryEpoch=()=>randomBytes(12).toString('hex');
const MAX_GENERATION=9223372036854775807n;
const MAX_DOCUMENT_BYTES=16_000_000;
const clone=value=>structuredClone(value);
const unavailable=()=>fail(503,'The transactional jam registry is unavailable.');
const validId=id=>{if(typeof id!=='string'||!ID.test(id))fail(400,'Invalid jam ID.');};
const revision=(epoch,generation)=>epoch+generation.toString(16).padStart(16,'0');

export class PostgresRegistryUnknown extends Error {
  constructor(){super('Jam transaction outcome is unknown. Retry with the same operation ID.');this.name='PostgresRegistryUnknown';this.status=503;}
}
function documentOf(input,maxEvents){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='events,settlements'||!input.events||typeof input.events!=='object'||Array.isArray(input.events))unavailable();
  const ids=Object.keys(input.events);if(ids.length>maxEvents)unavailable();
  for(const id of ids){if(!ID.test(id))unavailable();validateState(input.events[id],id,LIMITS,{enforceReserve:false});}
  validateSettlements(input.settlements);
  let data;try{data=JSON.stringify(input);}catch{unavailable();}
  if(Buffer.byteLength(data)>MAX_DOCUMENT_BYTES)unavailable();
  return JSON.parse(data);
}
function rowOf(rows,maxEvents){
  if(!Array.isArray(rows)||rows.length!==1)unavailable();
  const row=rows[0];if(typeof row.epoch!=='string'||!/^[0-9a-f]{24}$/.test(row.epoch)||!['number','string'].includes(typeof row.generation)||typeof row.generation==='number'&&!Number.isSafeInteger(row.generation)||!/^\d+$/.test(String(row.generation)))unavailable();
  let generation;try{generation=BigInt(row.generation);}catch{unavailable();}
  if(generation<0n||generation>MAX_GENERATION)unavailable();
  let document=row.document;if(typeof document==='string')try{document=JSON.parse(document);}catch{unavailable();}
  return {epoch:row.epoch,generation,document:documentOf(document,maxEvents)};
}
function snapshotFor(row){
  const document=clone(row.document),rev=revision(row.epoch,row.generation);
  return {revision:rev,ids:Object.keys(document.events).sort(),settlements:clone(document.settlements),async read(id,options={}){
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal')||options.signal!==undefined&&!(options.signal instanceof AbortSignal)||options.signal?.aborted)unavailable();
    validId(id);const state=Object.hasOwn(document.events,id)?clone(document.events[id]):null;
    if(options.signal?.aborted)unavailable();return {state};
  }};
}

/** `transact` callbacks may await transaction-local facade calls and pure,
 * bounded work. The sole external-I/O exception is the separately configured,
 * time-bounded central entitlement check for new proposals. Do not add other
 * network or provider verification while holding the global row lock. A slow
 * entitlement check can delay unrelated writes until its deadline. A callback timeout invalidates its facade;
 * late continuations cannot mutate the transaction. The absolute client-side
 * deadline bounds the caller, not server-side execution or physical connection
 * reclamation. In particular, a dispatched COMMIT may still complete later.
 * Scoped service mutations pass their cancellation signal; unscoped work uses
 * the configured deadline. Actual server-side behavior remains a launch gate. */
export function createPostgresJamStore({pool,target='local',maxEvents=LIMITS.events,transactionTimeoutMs=5000,readTimeoutMs=5000}={}){
  if(!pool||typeof pool.connect!=='function'||!['local','staging','production'].includes(target)||!Number.isSafeInteger(maxEvents)||maxEvents<1||maxEvents>LIMITS.events||!Number.isSafeInteger(transactionTimeoutMs)||transactionTimeoutMs<1||transactionTimeoutMs>30000||!Number.isSafeInteger(readTimeoutMs)||readTimeoutMs<1||readTimeoutMs>30000)unavailable();
  // Staging must not resolve types or comparison operators through a caller's
  // search_path. Both choices are fixed literals, never caller-provided SQL.
  const sql=target==='production'?{
    read:'SELECT epoch,generation,document FROM zerojams_production_private.registry WHERE singleton OPERATOR(pg_catalog.=) 1',
    lock:'SELECT epoch,generation,document FROM zerojams_production_private.registry WHERE singleton OPERATOR(pg_catalog.=) 1 FOR UPDATE',
    update:'UPDATE zerojams_production_private.registry SET generation=$1,document=$2::pg_catalog.jsonb WHERE singleton OPERATOR(pg_catalog.=) 1 AND epoch OPERATOR(pg_catalog.=) $3 AND generation OPERATOR(pg_catalog.=) $4'
  }:target==='staging'?{
    read:'SELECT epoch,generation,document FROM zerojams_staging_private.registry WHERE singleton OPERATOR(pg_catalog.=) 1',
    lock:'SELECT epoch,generation,document FROM zerojams_staging_private.registry WHERE singleton OPERATOR(pg_catalog.=) 1 FOR UPDATE',
    update:'UPDATE zerojams_staging_private.registry SET generation=$1,document=$2::pg_catalog.jsonb WHERE singleton OPERATOR(pg_catalog.=) 1 AND epoch OPERATOR(pg_catalog.=) $3 AND generation OPERATOR(pg_catalog.=) $4'
  }:{
    read:'SELECT epoch,generation,document FROM zero_jams_registry_poc WHERE singleton=1',
    lock:'SELECT epoch,generation,document FROM zero_jams_registry_poc WHERE singleton=1 FOR UPDATE',
    update:'UPDATE zero_jams_registry_poc SET generation=$1,document=$2::jsonb WHERE singleton=1 AND epoch=$3 AND generation=$4'
  };
  // This bounds the caller's wait, not server-side execution. A client whose
  // acquisition or query outlives this scope is destroyed, never reused.
  async function snapshot(options={}){
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal'))unavailable();
    const {signal}=options;if(signal!==undefined&&!(signal instanceof AbortSignal))unavailable();
    if(signal?.aborted)unavailable();
    const deadline=performance.now()+readTimeoutMs;
    let client=null,released=false,stopped=false,timer,rejectStopped;
    // Once release is attempted, do not blindly call it twice: if it throws,
    // physical client reclamation is uncertain. A healthy-release failure must
    // never produce a successful authority snapshot.
    const release=destroy=>{if(!client||released)return;released=true;try{client.release(destroy);}catch{if(!destroy)unavailable();}};
    const stoppedPromise=new Promise((_,reject)=>{rejectStopped=reject;});
    // Observe the rejection even if a caller aborts before the first race.
    void stoppedPromise.catch(()=>{});
    const stop=()=>{if(stopped)return;stopped=true;release(true);rejectStopped(new Error('Registry read stopped.'));};
    const check=()=>{if(signal?.aborted||performance.now()>=deadline)stop();if(stopped)unavailable();};
    const onAbort=()=>stop();
    signal?.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(stop,readTimeoutMs);
    try{
      check();
      const acquiring=Promise.resolve().then(()=>{check();return pool.connect();}).then(value=>{client=value;if(stopped)release(true);return value;});
      await Promise.race([acquiring,stoppedPromise]);check();
      const result=await Promise.race([Promise.resolve().then(()=>{check();return client.query(sql.read);}),stoppedPromise]);
      check();const current=snapshotFor(rowOf(result.rows,maxEvents));check();
      release(false);return current;
    }catch{stop();unavailable();}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }
  async function transact(callback,options={}){
    if(typeof callback!=='function')fail(400,'A transaction callback is required.');
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='signal')||options.signal!==undefined&&!(options.signal instanceof AbortSignal))unavailable();
    const {signal}=options;if(signal?.aborted)unavailable();
    const deadline=performance.now()+transactionTimeoutMs;
    let client=null,released=false,stopped=false,facadeActive=true,begun=false,beginDispatched=false,commitStarted=false,timer,rejectStopped;
    const release=destroy=>{if(!client||released)return;released=true;try{client.release(destroy);}catch{if(!destroy)unavailable();}};
    const stoppedPromise=new Promise((_,reject)=>{rejectStopped=reject;});void stoppedPromise.catch(()=>{});
    const stop=()=>{if(stopped)return;stopped=true;facadeActive=false;release(true);rejectStopped(new Error('Transaction timed out or was cancelled.'));};
    const check=()=>{if(signal?.aborted||performance.now()>=deadline)stop();if(stopped)throw new Error('Transaction timed out or was cancelled.');};
    const checkFacade=()=>{if(!facadeActive)throw new Error('Transaction facade is no longer active.');check();};
    const dispatch=async(sql,params)=>{
      const pending=Promise.resolve().then(()=>{
        check();
        if(sql==='BEGIN')beginDispatched=true;
        if(sql==='COMMIT')commitStarted=true;
        return params===undefined?client.query(sql):client.query(sql,params);
      });
      const result=await Promise.race([pending,stoppedPromise]);check();return result;
    };
    const onAbort=()=>stop();signal?.addEventListener('abort',onAbort,{once:true});timer=setTimeout(stop,transactionTimeoutMs);
    try{
      check();
      const acquiring=Promise.resolve().then(()=>{check();return pool.connect();}).then(value=>{client=value;if(stopped)release(true);return value;});
      await Promise.race([acquiring,stoppedPromise]);check();
      await dispatch('BEGIN');begun=true;
      await dispatch(`SET LOCAL lock_timeout = '${transactionTimeoutMs}ms'`);
      await dispatch(`SET LOCAL statement_timeout = '${transactionTimeoutMs}ms'`);
      const row=rowOf((await dispatch(sql.lock)).rows,maxEvents);check();
      let dirty=false;
      const tx={async snapshot(){checkFacade();return snapshotFor(row);},async read(id){checkFacade();const current=snapshotFor(row);return {...await current.read(id),revision:current.revision};},async list(){checkFacade();return Object.keys(row.document.events).sort();},
        async compareAndSwap(id,expectedRevision,nextState,{settlements}={}){
          checkFacade();if(id!==null)validId(id);
          if(typeof expectedRevision!=='string'||!SHA.test(expectedRevision))fail(400,'An exact registry revision is required.');
          if(id===null&&nextState!==null||id!==null&&nextState===null||id===null&&settlements===undefined)fail(400,'Invalid atomic jam update.');
          if(expectedRevision!==revision(row.epoch,row.generation))return false;
          if(row.generation===MAX_GENERATION)unavailable();
          const next=clone(row.document);
          if(id!==null){if(!Object.hasOwn(next.events,id)&&Object.keys(next.events).length>=maxEvents)fail(429,'The jam pilot is at event capacity.');next.events[id]=clone(validateState(nextState,id,LIMITS,{enforceReserve:false}));}
          if(settlements!==undefined)next.settlements=clone(validateSettlements(settlements));
          row.document=documentOf(next,maxEvents);row.generation++;dirty=true;return true;
        }};
      const originalGeneration=row.generation;
      const pending=Promise.resolve().then(()=>{checkFacade();return callback(tx);});
      const result=await Promise.race([pending,stoppedPromise]);check();facadeActive=false;
      if(dirty){
        const updated=await dispatch(sql.update,[row.generation.toString(),JSON.stringify(row.document),row.epoch,originalGeneration.toString()]);
        if(updated.rowCount!==1)unavailable();
      }
      await dispatch('COMMIT');begun=false;release(false);return result;
    }catch(error){
      facadeActive=false;
      if(commitStarted){release(true);throw new PostgresRegistryUnknown();}
      const beginUncertain=beginDispatched&&!begun;
      if(begun&&!stopped)try{await dispatch('ROLLBACK');begun=false;}catch{release(true);}
      if(stopped||beginUncertain)release(true);else release(false);
      throw error;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }
  return {snapshot,async read(id,options){const current=await snapshot(options);return {...await current.read(id,options),revision:current.revision};},async list(options){return (await snapshot(options)).ids;},transact,
    async compareAndSwap(id,expectedRevision,nextState,options={}){return transact(tx=>tx.compareAndSwap(id,expectedRevision,nextState,options),{signal:options.signal});}};
}
