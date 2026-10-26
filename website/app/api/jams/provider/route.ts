import {getJamProviderResponse} from '@/lib/jams-http.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>authorizeJamRequest(request)??getJamProviderResponse(request);
export const POST=(request:Request)=>authorizeJamRequest(request)??new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});
