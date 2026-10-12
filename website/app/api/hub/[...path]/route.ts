import { proxyHub } from '@/lib/hub-proxy.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{path: string[]}> };
async function handle(request: Request, {params}: Context) { return proxyHub(request, (await params).path); }
export { handle as GET, handle as POST, handle as HEAD };
