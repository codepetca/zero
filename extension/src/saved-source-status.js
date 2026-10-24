'use strict';
// Pure host controller. Opening a workspace has no execution authority. The host
// provides data-only inspect and its independently verified saved-builder runner.
const identityKeys=Object.freeze(['builderHash','scopeHash']);
const proofKeys=Object.freeze(['sourceHash','coreHash','librariesHash','profileHash','checkerHash','contractHash','jdkHash']);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function validIdentity(identity){return identity&&typeof identity==='object'&&!Array.isArray(identity)&&Object.keys(identity).length===identityKeys.length&&identityKeys.every(key=>hash(identity[key]));}
const same=(left,right)=>validIdentity(left)&&validIdentity(right)&&identityKeys.every(key=>left[key]===right[key]);
function createSavedSourceStatus({inspect,check,isTrusted=()=>false,onChange=()=>{},debounceMs=650,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(typeof inspect!=='function'||typeof check!=='function'||debounceMs<500||debounceMs>750)throw new Error('Saved browser checks require inspect/check callbacks and a 500–750 ms debounce.');
 let state=Object.freeze({status:'unavailable',enabled:false,message:'Choose Enable browser checks explicitly in a trusted workspace.'}),approval=null,generation=0,timer=null,active=null,disposed=false,dirty=false,lifetime=Promise.resolve();
 const publish=next=>{if(disposed)return;state=Object.freeze({...next,enabled:approval!==null});onChange(state);};
 const cancel=()=>{generation++;if(timer!==null){clearTimer(timer);timer=null;}active?.abort();active=null;};
 const trusted=()=>isTrusted()===true;
 function revoke(message){cancel();approval=null;publish({status:'unavailable',message});}
 async function run(expectedGeneration){
  timer=null;if(disposed||!approval||dirty||generation!==expectedGeneration)return;
  if(!trusted())return revoke('Workspace trust was removed. Enable browser checks explicitly after trusting it.');
  const controller=new AbortController();active=controller;
  const current=()=>!disposed&&generation===expectedGeneration&&active===controller&&!controller.signal.aborted;
  try{
   const before=structuredClone(await inspect({signal:controller.signal}));if(!current())return;
   if(!validIdentity(before))throw Error('Exact saved source, library, builder, checker or JDK identity is unavailable.');
   if(before.builderHash!==approval.builderHash)return revoke('Saved browser tooling changed. Enable checks explicitly for the new exact builder.');
   publish({status:'checking',identity:before,message:'Checking saved Java source against the prepared browser profile.'});
   const result=await check({signal:controller.signal,approval:{...approval},expectedIdentity:{...before}});if(!current())return;
   const after=await inspect({signal:controller.signal});if(!current())return;
   if(!trusted())return revoke('Workspace trust was removed. Browser checks are disabled.');
   if(!validIdentity(after))throw Error('Current saved browser inputs are unavailable.');
   if(after.builderHash!==approval.builderHash)return revoke('Saved browser tooling changed. Enable checks explicitly for the new exact builder.');
   if(!same(before,after)||dirty||result?.status==='stale')return publish({status:'stale',message:'Saved inputs or verified tools changed during browser checking.'});
   if(!result||!['compatible','unsupported','unavailable'].includes(result.status))throw Error('This saved builder does not support cache-only browser checks.');
   if(result.status!=='unavailable'&&(!same(result.scopeIdentity,after)||!result.identity||Object.keys(result.identity).length!==proofKeys.length||proofKeys.some(key=>!hash(result.identity[key]))||result.identity.profileHash!==approval.builderHash))return publish({status:'stale',message:'The checker result belongs to earlier source or tooling.'});
   publish({status:result.status,identity:after,diagnostics:Array.isArray(result.diagnostics)?result.diagnostics:[],message:result.status==='compatible'?'Saved source is compatible with this prepared browser profile. A real browser build is a separate check.':result.status==='unsupported'?'Saved source uses unsupported or unresolved browser APIs.':'Prepared browser tooling is unavailable. Choose preparation explicitly.'});
  }catch(error){if(current()&&error.name!=='AbortError'){if(error.code==='ZERO_BUILDER_UNAVAILABLE')revoke('Saved browser tooling is incomplete or changed. Enable checks explicitly after restoring it.');else publish({status:'unavailable',message:String(error.message).slice(0,4096)});}}
  finally{if(active===controller)active=null;}
 }
 const enqueue=currentGeneration=>{const next=lifetime.then(()=>run(currentGeneration));lifetime=next.catch(()=>{});return next;};
 const schedule=()=>{const currentGeneration=generation;timer=setTimer(()=>{void enqueue(currentGeneration).catch(()=>{});},debounceMs);};
 return {
  getState:()=>state,
  async enable({explicitAction=false}={}){
   if(disposed)return state;if(!explicitAction||!trusted()){revoke('Choose Enable browser checks explicitly in a trusted workspace.');return state;}
   cancel();const currentGeneration=generation,controller=new AbortController();active=controller;
   try{const identity=await inspect({explicitAction:true,signal:controller.signal});if(disposed||generation!==currentGeneration||controller.signal.aborted)return state;if(!trusted()||!validIdentity(identity))throw Error('Verified saved browser tooling and JDK are unavailable. Prepare checks explicitly.');approval=Object.freeze({builderHash:identity.builderHash});publish({status:'stale',identity,message:'Browser checks enabled for this exact saved builder.'});if(!dirty)schedule();}
   catch(error){if(!disposed&&generation===currentGeneration&&error.name!=='AbortError'){approval=null;publish({status:'unavailable',message:String(error.message).slice(0,4096)});}}
   finally{if(active===controller)active=null;}return state;
  },
  changed({dirty:nextDirty=false,reason='saved inputs changed'}={}){
   if(disposed)return;dirty=nextDirty===true;cancel();if(!approval)return;if(!trusted())return revoke('Workspace trust was removed. Browser checks are disabled.');publish({status:'stale',message:dirty?'Unsaved edits differ from the last saved browser check.':String(reason).slice(0,4096)});if(!dirty)schedule();
  },
  disable:()=>revoke('Browser checks are disabled. Enable them explicitly to check saved source.'),
  dispose(){cancel();disposed=true;approval=null;},
  // Useful for deterministic tests and a deliberate host Check now action.
  async flush(){if(active)cancel();if(timer!==null){clearTimer(timer);timer=null;}if(approval&&!dirty)await enqueue(generation);return state;}
 };
}
module.exports={createSavedSourceStatus,validIdentity,identityKeys};
