import {getDesktopJamProjectResponse} from '@/lib/jams-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const hidden = hiddenJamsResponse(); if (hidden) return hidden;
  return getDesktopJamProjectResponse(request);
}
