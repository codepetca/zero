import {preparedJamResponse} from '@/lib/jam-template-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime='nodejs';
async function legacyPOST(request:Request) {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return preparedJamResponse(request,{preview:true});
}
async function legacyGET() {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return new Response('Use the preparation form.',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
}

// Retained creator-hosted handlers are inactive. Only the closed responses below
// are exported; existing template implementation stays available for review.
function unavailable() {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return Response.json({error:'Creator-hosted jam previews are unavailable. Create a Zero-hosted proposal on Zero.'},
    {status:410,headers:{'Cache-Control':'no-store'}});
}
export async function GET() { return unavailable(); }
export async function POST() { return unavailable(); }
