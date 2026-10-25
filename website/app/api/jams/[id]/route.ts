import {getJamResponse} from '@/lib/jams-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params: Promise<{id:string}>}) {
  const hidden = hiddenJamsResponse(); if (hidden) return hidden;
  return getJamResponse(request,(await context.params).id);
}
