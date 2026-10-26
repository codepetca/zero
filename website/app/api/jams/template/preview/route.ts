import {jamOfficialOrigin} from '@/lib/jams-pilot-policy.mjs';
import {preparedJamResponse} from '@/lib/jam-template-http.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
export const runtime='nodejs';
export async function POST(request:Request) {
  const hidden=authorizeJamRequest(request);if(hidden)return hidden;
  return preparedJamResponse(request,{preview:true,officialOrigin:jamOfficialOrigin()});
}
export async function GET(request:Request) {
  const hidden=authorizeJamRequest(request);if(hidden)return hidden;
  return new Response('Use the preparation form.',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
}
