import {preparedJamResponse} from '@/lib/jam-template-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime='nodejs';
export async function POST(request:Request) {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return preparedJamResponse(request,{preview:true});
}
export async function GET() {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return new Response('Use the preparation form.',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
}
