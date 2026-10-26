import {postJamActionResponse} from '@/lib/jams-http.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  const hidden = authorizeJamRequest(request); if (hidden) return hidden;
  return postJamActionResponse(request,(await context.params).id);
}
