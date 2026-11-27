import {deleteDesktopJamJoinResponse,getDesktopJamJoinResponse,postDesktopJamJoinResponse} from '@/lib/jams-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: {params: Promise<{id:string}>}) {
  const hidden = hiddenJamsResponse(); if (hidden) return hidden;
  return getDesktopJamJoinResponse(request,(await context.params).id);
}

export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
  const hidden = hiddenJamsResponse(); if (hidden) return hidden;
  return postDesktopJamJoinResponse(request,(await context.params).id);
}

export async function DELETE(request: Request, context: {params: Promise<{id:string}>}) {
  const hidden = hiddenJamsResponse(); if (hidden) return hidden;
  return deleteDesktopJamJoinResponse(request,(await context.params).id);
}
