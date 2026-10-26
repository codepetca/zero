import {getJamsResponse} from '@/lib/jams-http.mjs';
import {authorizeJamRequest} from '@/lib/jams-access.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => authorizeJamRequest(request) ?? getJamsResponse(request);
