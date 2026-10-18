import {loginResponse} from '@/lib/hub-github-auth.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return loginResponse(request); }
