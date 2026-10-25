import {JamError, keys, manifestData} from '../../jams/manifest.mjs';
import {createJamTemplatePreview,createJamTemplateZip} from './jam-template.mjs';

async function requestManifest(request) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new JamError(415,'Send jam details as JSON.');
  const origin=request.headers.get('origin');
  const url=new URL(request.url);
  // Next development may normalize request.url to localhost while preserving
  // the browser-facing Host (127.0.0.1). No forwarded-host override is accepted.
  const publicOrigin=`${url.protocol}//${request.headers.get('host')||url.host}`;
  if(origin&&origin!==url.origin&&origin!==publicOrigin)throw new JamError(403,'Open the preparation page directly to continue.');
  const reader=request.body?.getReader();
  if(!reader)throw new JamError(400,'Provide jam details.');
  const chunks=[];let size=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new JamError(413,'Jam details are too large. Shorten the text.');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new JamError(400,'Provide valid jam details.');}
  keys(body,['manifest']);return manifestData(body.manifest);
}
export async function preparedJamResponse(request,{preview=false}={}) {
  try {
    const manifest=await requestManifest(request);
    if(preview)return Response.json(await createJamTemplatePreview(manifest),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    return new Response(new Uint8Array(await createJamTemplateZip(manifest.type,manifest)),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="zero-${manifest.type}-jam.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return Response.json({error:error instanceof JamError?error.message:'The jam site could not be prepared. Try again.'},{status:error instanceof JamError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
