import {recordOpen} from '@/lib/hub-opens.mjs';
import {resolveHubProject} from '@/lib/hub-project-status.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return recordOpen(request, {resolve: resolveHubProject}); }
