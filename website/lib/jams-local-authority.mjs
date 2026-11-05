// Compose Jam and Hub against the same trusted authority. This module does
// not obtain credentials or provision state.
import {hasManualJamPro} from '../../jams/entitlements.mjs';
import {createJamService,JamError} from '../../jams/service.mjs';
import {createJamHubVisibilityReader} from './jam-hub-visibility.mjs';
import {ZERO_JAMS_APPROVER_ID} from './jams-runtime.mjs';
import {jamsPreviewAvailable} from './jams-visibility.mjs';

const unavailable=()=>{throw new JamError(503,'The local jam authority is unavailable.');};
const writes=new Set(['propose','mutate','settle']);
const HOSTED_PARTICIPANT_LIMIT=100;
const allowed=new Set(['env','store','now','verifySource','verifyRepository','pagesBindingReader','limits','visibilityTimeoutMs']);

/** Explicitly compose both lanes from one already-provisioned, trusted store.
 * Provider verifiers are injected separately and run outside its transactions.
 * Returned options are paired for existing handler injection; there is no
 * independent authority override or database/Git fallback in this composition.
 * The enable flag is an admission check, not a database writer fence. A flag
 * change after callback/CAS can still race the store's SQL UPDATE or COMMIT.
 * A rejected response does not prove absence: retain the operation ID and
 * recover/settle it after authority is restored. Atomic writer cutover requires
 * a separately verified database/provider fence and retirement of old writers.
 */
export function createLocalJamAuthority(options={}) {return compose(options,false);}

// This trusted server-side seam shares all service and visibility checks.
// Production requires explicit pilot admission and fixed pilot capacity.
export function createHostedJamAuthority(options={}) {return compose(options,true);}

function compose(options,hosted) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!allowed.has(key)))unavailable();
  const {env,store,now,verifySource,verifyRepository,pagesBindingReader,limits,visibilityTimeoutMs=15000}=options;
  if(!env||typeof env!=='object'||Array.isArray(env)||typeof now!=='function'||
      !store||['snapshot','compareAndSwap','transact'].some(key=>typeof store[key]!=='function')||
      [verifySource,verifyRepository,pagesBindingReader].some(value=>typeof value!=='function'))unavailable();
  // Hosted admission checks the actual process, not just the sanitized facade.
  const local=()=>{
    if(hosted){
      if(env.NODE_ENV!=='production'||process.env.NODE_ENV!=='production'||process.env.VERCEL!=='1'||process.env.VERCEL_ENV!=='production')unavailable();
    }else if(env.NODE_ENV!=='development'||env.VERCEL_ENV!==undefined)unavailable();
  };
  const writable=()=>{local();if(env.ZERO_JAMS_ENABLED!=='1'||hosted&&!jamsPreviewAvailable(process.env))unavailable();};
  local();
  const snapshot=store.snapshot.bind(store),compareAndSwap=store.compareAndSwap.bind(store),transact=store.transact.bind(store);
  const sharedStore=Object.freeze({
    async snapshot(options){local();const result=await snapshot(options);local();return result;},
    compareAndSwap(...args){writable();return compareAndSwap(...args);},
    transact(callback,options){
      writable();
      const guarded=tx=>{
        writable();
        if(!tx||typeof tx.snapshot!=='function'||typeof tx.compareAndSwap!=='function')unavailable();
        return callback(Object.freeze({
          snapshot(...args){local();return tx.snapshot(...args);},
          compareAndSwap(...args){writable();return tx.compareAndSwap(...args);}
        }));
      };
      return options===undefined?transact(guarded):transact(guarded,options);
    }
  });
  const engine=createJamService({store:sharedStore,now,verifySource,verifyRepository,pagesBindingReader,
    canCreateJam:id=>hasManualJamPro(id,hosted?process.env:env),maintainerIds:[ZERO_JAMS_APPROVER_ID],...(hosted?{limits:{...limits,participants:HOSTED_PARTICIPANT_LIMIT}}:limits===undefined?{}:{limits})});
  const service=Object.freeze(Object.fromEntries(Object.keys(engine).map(method=>[method,async(...args)=>{
    const check=writes.has(method)?writable:local;check();
    // This final check withholds confirmation after a mode change; it cannot
    // roll back a transaction that the injected store already dispatched.
    const result=await engine[method](...args);check();return result;
  }])));
  const readVisibility=createJamHubVisibilityReader({store:sharedStore,clock:now,totalTimeoutMs:visibilityTimeoutMs,
    fetchImpl:async()=>unavailable()});
  const visibilityReader=async(options={})=>{
    local();
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['env','signal'].includes(key))||
        options.env!==undefined&&options.env!==env)unavailable();
    const result=await readVisibility({env,signal:options.signal});local();
    if(result===null)unavailable();return result;
  };
  return Object.freeze({service,visibilityReader,
    jamOptions:Object.freeze({env,now,service,visibilityReader}),
    hubOptions:Object.freeze({env,decisionNow:now,visibilityReader})});
}
