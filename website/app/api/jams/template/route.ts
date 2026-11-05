import {preparedJamResponse} from '@/lib/jam-template-http.mjs';
import {createJamTemplateZip} from '@/lib/jam-template.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime = 'nodejs';
async function legacyGET(request:Request) {
  const hidden = hiddenJamsResponse(); if (hidden) return hidden;
  const parameters = new URL(request.url).searchParams;
  const type = parameters.get('type') || 'game';
  if (parameters.getAll('type').length > 1 || !['game','app'].includes(type)) return Response.json({error:'Choose Game Jam or App Jam.'},{status:400});
  try {
    const zip = await createJamTemplateZip(type);
    return new Response(new Uint8Array(zip), {headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="zero-${type}-jam.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch {
    return Response.json({error:'The jam template could not be prepared. Try downloading it again later.'},{status:503});
  }
}

async function legacyPOST(request:Request) {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return preparedJamResponse(request);
}

// Retained creator-hosted handlers are inactive. Only the closed responses below
// are exported; existing template implementation stays available for review.
function unavailable() {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return Response.json({error:'Creator-hosted jam websites are unavailable. Create a Zero-hosted proposal on Zero.'},
    {status:410,headers:{'Cache-Control':'no-store'}});
}
export async function GET() { return unavailable(); }
export async function POST() { return unavailable(); }
