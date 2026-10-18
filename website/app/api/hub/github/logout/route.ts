import {logoutResponse} from '@/lib/hub-github-auth.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) { return logoutResponse(request); }
