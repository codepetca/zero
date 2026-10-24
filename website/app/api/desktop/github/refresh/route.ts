import {refreshResponse} from '@/lib/desktop-github-auth.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return refreshResponse(request); }
