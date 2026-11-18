import {hubPlayResponse} from '@/lib/hub-play.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request:Request) { return hubPlayResponse(request); }
