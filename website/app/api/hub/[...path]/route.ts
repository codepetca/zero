import { proxyHub } from '@/lib/hub-proxy.mjs';
import { contributionHubResponse } from '@/lib/hub-contribution-runtime.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{path: string[]}> };
async function handle(request: Request, {params}: Context) { const path=(await params).path; return process.env.ZERO_HUB_EMBEDDED === '1' ? contributionHubResponse(request,path) : proxyHub(request,path); }
export { handle as GET, handle as POST, handle as HEAD };
