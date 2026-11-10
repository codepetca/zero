import {hubPublicListingsResponse} from '@/lib/hub-listings-http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => hubPublicListingsResponse(request);
