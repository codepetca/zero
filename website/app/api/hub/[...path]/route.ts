import { proxyHub } from '@/lib/hub-proxy.mjs';
import { readOnlyHubResponse } from '@/lib/hub-runtime.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{path: string[]}> };
async function handle(request: Request, {params}: Context) { const path=(await params).path; return process.env.ZERO_HUB_EMBEDDED === '1' ? readOnlyHubResponse(request,path) : proxyHub(request,path); }
export { handle as GET, handle as POST, handle as HEAD };
