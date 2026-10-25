import {preparedJamResponse} from '@/lib/jam-template-http.mjs';
import {createJamTemplateZip} from '@/lib/jam-template.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime = 'nodejs';
export async function GET(request:Request) {
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

export async function POST(request:Request) {
  const hidden=hiddenJamsResponse();if(hidden)return hidden;
  return preparedJamResponse(request);
}
