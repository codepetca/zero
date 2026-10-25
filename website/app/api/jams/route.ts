import {getJamsResponse} from '@/lib/jams-http.mjs';
import {hiddenJamsResponse} from '@/lib/jams-visibility.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => hiddenJamsResponse() ?? getJamsResponse(request);
