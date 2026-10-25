import {getJamsResponse} from '@/lib/jams-http.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => getJamsResponse(request);
