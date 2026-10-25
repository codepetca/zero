import {postJamActionResponse} from '@/lib/jams-http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  return postJamActionResponse(request,(await context.params).id);
}
