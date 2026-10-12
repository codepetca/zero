/** One browser/job lifetime. Status updates never reset its automatic budget.
 * Manual refresh is one explicit request and cannot restart stopped polling.
 */
const pending=new Set(['queued','checking','checked','publishing','running','pending']);
export function createHubPoll({jobId,status,fetch:transport=globalThis.fetch,onJob,onState,onError=(_message)=>{},now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,maxDurationMs=5*60*1000,maxAttempts=25,requestTimeoutMs=15000}) {
  if(typeof jobId!=='string'||!jobId||typeof onJob!=='function'||typeof onState!=='function')throw new Error('Submission polling requires a job and callbacks');
  const startedAt=now();
  let automatic=pending.has(status),disposed=false,started=false,visible=true,online=true;
  let attempts=0,delay=2000,nextTimer,deadlineTimer,flight,generation=0;
  let state=automatic?'waiting':'complete',message=automatic?'Waiting for checks. Status updates slow down while you wait.':'';
  const available=()=>visible&&online;
  const emit=()=>{if(!disposed)onState({state,message,inFlight:!!flight});};
  const clearNext=()=>{clearTimer(nextTimer);nextTimer=undefined;};
  const cancel=()=>{generation++;flight?.abort();};
  const exhausted=()=>now()-startedAt>=maxDurationMs||attempts>=maxAttempts;
  function stopAutomatic(reason) {
    automatic=false;clearNext();clearTimer(deadlineTimer);deadlineTimer=undefined;
    state='stopped';message=reason;cancel();emit();
  }
  function schedule() {
    clearNext();
    if(!automatic||disposed||flight)return;
    if(exhausted()){stopAutomatic('Automatic status checks stopped. Refresh result when you are ready.');return;}
    if(!available()){state='paused';message='Status checks paused while this page is hidden or offline.';emit();return;}
    state='waiting';message='Waiting for checks. Status updates slow down while you wait.';emit();
    nextTimer=setTimer(()=>{nextTimer=undefined;void requestStatus(false);},Math.min(delay,maxDurationMs-(now()-startedAt)));
  }
  async function requestStatus(manual) {
    if(disposed||flight||!available())return false;
    if(!manual&&(!automatic||exhausted())){if(automatic)stopAutomatic('Automatic status checks stopped. Refresh result when you are ready.');return false;}
    clearNext();attempts++;
    const controller=new AbortController(),version=++generation;
    flight=controller;state='checking';message='Checking status…';emit();
    let timeoutTimer,onAbort,timedOut=false;
    const interruption=new Promise((_,reject)=>{
      onAbort=()=>reject(new Error(timedOut?'Status request timed out.':'Status request cancelled.'));
      controller.signal.addEventListener('abort',onAbort,{once:true});
      timeoutTimer=setTimer(()=>{timedOut=true;controller.abort();},requestTimeoutMs);
    });
    try {
      const data=await Promise.race([(async()=>{
        const response=await transport(`/api/hub/submissions/${encodeURIComponent(jobId)}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
        const result=await response.json();
        if(!response.ok)throw new Error(result?.error||'Could not check submission.');
        if(result?.id!==jobId||typeof result.status!=='string')throw new Error('Could not check submission.');
        return result;
      })(),interruption]);
      if(disposed||version!==generation)return false;
      status=data.status;onJob(data);
      if(!pending.has(status)) {
        automatic=false;clearTimer(deadlineTimer);deadlineTimer=undefined;state='complete';message='';
      }else if(automatic)delay=Math.min(delay*2,15000);
      else {state='stopped';message='Automatic status checks stopped. Refresh result when you are ready.';}
      return true;
    }catch(error) {
      if(!disposed&&version===generation) {
        automatic=false;clearTimer(deadlineTimer);deadlineTimer=undefined;state='stopped';message='Could not check submission. Refresh result to try again.';
        onError(error instanceof Error?error.message:'Could not check submission.');
      }
      return false;
    }finally {
      clearTimer(timeoutTimer);controller.signal.removeEventListener('abort',onAbort);
      if(flight===controller)flight=undefined;
      if(!disposed){if(automatic)schedule();else emit();}
    }
  }
  return {
    start(){if(started||disposed)return;started=true;if(automatic){deadlineTimer=setTimer(()=>stopAutomatic('Automatic status checks stopped. Refresh result when you are ready.'),Math.max(0,maxDurationMs-(now()-startedAt)));schedule();}else emit();},
    refresh(){return requestStatus(true);},
    setAvailable(value){
      if(disposed)return;
      visible=value.visible;online=value.online;
      if(!available()) {
        clearNext();cancel();
        if(automatic||flight){state='paused';message='Status checks paused while this page is hidden or offline.';}
        emit();
      }else if(started&&automatic)schedule();
      else {if(state==='paused'){state='stopped';message='Automatic status checks stopped. Refresh result when you are ready.';}emit();}
    },
    setStatus(value){
      if(disposed||typeof value!=='string')return;
      status=value;
      if(!pending.has(status)){automatic=false;clearNext();clearTimer(deadlineTimer);deadlineTimer=undefined;cancel();state='complete';message='';emit();}
    },
    dispose(){if(disposed)return;disposed=true;automatic=false;clearNext();clearTimer(deadlineTimer);cancel();}
  };
}
