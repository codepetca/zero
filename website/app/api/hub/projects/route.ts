import {hubProjectsResponse} from '@/lib/hub-project-status.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return hubProjectsResponse(request); }
