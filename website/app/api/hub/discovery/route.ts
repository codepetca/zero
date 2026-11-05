import {hubDiscoveryResponse} from '@/lib/hub-discovery.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return hubDiscoveryResponse(request); }
