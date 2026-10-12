import {zipSync,strToU8} from 'fflate';
import {developmentFiles} from '../../hub/development-files.mjs';
import {boundedBytes} from './hub-proxy.mjs';
function sameWebsiteOrigin(request) {
  try {
    const website=new URL(request.url);
    const origin=request.headers.get('origin');
    const source=new URL(origin);
    if(!['http:','https:'].includes(website.protocol) || origin!==source.origin)return false;
    // Next may normalize the URL's hostname to localhost. The direct Host is
    // the browser's destination authority; forwarded headers do not establish it.
    const host=request.headers.get('host')??website.host;
    if(!/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::[0-9]{1,5})?$/.test(host))return false;
    return new URL(`${website.protocol}//${host}`).origin===origin;
  }catch{return false;}
}
export async function projectResponse(request) {
  if(request.method!=='POST')return Response.json({error:'Use POST.'},{status:405});
  if(!sameWebsiteOrigin(request))return Response.json({error:'Use this website to download a library project.'},{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Send a library bundle as JSON.'},{status:415});
  try {
    const bytes=await boundedBytes(request.body,1024*1024);
    const bundle=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    const development=await developmentFiles(bundle); // Validates full descriptor/files before any interpolation.
    const files={'.zero-library.json':strToU8(JSON.stringify(bundle.descriptor,null,2)+'\n')};
    for(const [path,text]of Object.entries(bundle.files))files[path]=path==='preview.png'?new Uint8Array(Buffer.from(text,'base64')):strToU8(text);
    for(const [path,text]of Object.entries(development))files[path]=[strToU8(text),{os:3,attrs:(path==='mvnw'?0o100755:0o100644)<<16}];
    const zip=zipSync(files,{level:6});
    if(zip.length>4*1024*1024)throw new Error('Project exceeds 4 MiB.');
    return new Response(new Uint8Array(zip),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${bundle.descriptor.libraryId}-${bundle.descriptor.version}.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not prepare project.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
