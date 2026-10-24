import {loginResponse} from '@/lib/desktop-github-auth.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return loginResponse(request); }
