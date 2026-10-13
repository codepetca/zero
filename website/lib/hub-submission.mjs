export function validSubmissionId(id) {
  return typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
}
export function submissionLink(id) {
  if (!validSubmissionId(id)) throw new Error('Invalid submission link.');
  return `/hub/prepare?submission=${id}`;
}
export function submissionFromSearch(search) {
  const query = new URLSearchParams(search);
  if (!query.has('submission')) return null;
  const ids = query.getAll('submission');
  if (ids.length !== 1 || !validSubmissionId(ids[0])) throw new Error('Invalid submission link.');
  return ids[0];
}
const returnKey='zero-hub-submission-return';
export function clearSubmissionReturn(storage) {
  try { storage?.removeItem(returnKey); } catch { /* Storage is optional. */ }
}
/** Keep only an opaque ID in this tab across the fixed authentication redirect. */
export function rememberSubmissionReturn(search,storage) {
  clearSubmissionReturn(storage);
  let id;
  try { id=submissionFromSearch(search); } catch { return; }
  if(id)try { storage?.setItem(returnKey,id); } catch { /* Sign-in still works. */ }
}
/** Consume once. A direct bookmark wins and discards any older return marker. */
export function consumeSubmissionReturn(search,storage) {
  let pending=null;
  try {
    pending=storage?.getItem(returnKey);
    storage?.removeItem(returnKey);
  } catch { pending=null; }
  const direct=submissionFromSearch(search);
  return direct || (validSubmissionId(pending)?pending:null);
}
/** Snapshot before resetting the native input, so the same folder/file can be chosen again.
 * @param {{files: ArrayLike<File>|null, value:string}} input
 */
export function takeSelectedFiles(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  return files;
}

/** One bounded authenticated read. invalidate() prevents stale account/unmount responses,
 * even if a transport ignores abort. No submission data is persisted here.
 */
export function createSubmissionReader({fetch:transport=globalThis.fetch, timeoutMs=15000, setTimer=setTimeout, clearTimer=clearTimeout}={}) {
  let generation=0, controller;
  function invalidate() { generation++; controller?.abort(); controller=undefined; }
  return {
    invalidate,
    async read(id) {
      if (!validSubmissionId(id)) throw new Error('Invalid submission link.');
      invalidate();
      const version=generation, request=new AbortController(); controller=request;
      let timer, onAbort, timedOut=false;
      const interruption=new Promise((_,reject)=>{
        onAbort=()=>reject(new Error(timedOut?'Submission request timed out. Use the result link to try again.':'Submission request cancelled.'));
        request.signal.addEventListener('abort',onAbort,{once:true});
        timer=setTimer(()=>{timedOut=true;request.abort();},timeoutMs);
      });
      try {
        const job=await Promise.race([(async()=>{
          const response=await transport(`/api/hub/submissions/${id}`,{cache:'no-store',credentials:'same-origin',signal:request.signal});
          const data=await response.json();
          if (!response.ok) throw new Error(data?.error || 'Could not retrieve this submission. Sign in with its contributor account.');
          if (data?.id!==id || typeof data.status!=='string') throw new Error('Could not retrieve this submission.');
          return data;
        })(),interruption]);
        return version===generation ? job : null;
      } catch(error) {
        if(version!==generation)return null;
        throw error;
      } finally {
        clearTimer(timer);request.signal.removeEventListener('abort',onAbort);
        if(controller===request)controller=undefined;
      }
    }
  };
}
