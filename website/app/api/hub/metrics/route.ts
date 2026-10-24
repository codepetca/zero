import {hubMetricsResponse} from '@/lib/hub-metrics.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return hubMetricsResponse(request); }
