/** Shared immutable Maven streaming for both upload capability states.
 * Vercel's buffered payload limit requires streaming larger stored artifacts.
 * Actual hosted streaming proof remains a separate prerequisite.
 */
export const MAVEN_CHUNK_BYTES=64*1024;

/** The service has already verified full stored size/digest before this runs.
 * Copy each small chunk so delivered chunks cannot retain the full stored object.
 * Zero queued chunks: reading controls pulls; completion/cancel drops the source.
 */
export function mavenStream(verifiedBytes,signal) {
  let source=verifiedBytes,offset=0,onAbort;
  verifiedBytes=null; // Keep only the releasable source reference in this closure.
  const release=()=>{source=null;signal.removeEventListener('abort',onAbort);};
  return new ReadableStream({
    start(controller){
      onAbort=()=>{release();controller.error(new Error('Hub transfer was cancelled.'));};
      signal.addEventListener('abort',onAbort,{once:true});
      if(signal.aborted)onAbort();
    },
    pull(controller){
      if(!source)return;
      const next=Math.min(offset+MAVEN_CHUNK_BYTES,source.length);
      controller.enqueue(Uint8Array.from(source.subarray(offset,next)));
      offset=next;
      if(offset===source.length){release();controller.close();}
    },
    cancel(){release();}
  },{highWaterMark:0});
}

