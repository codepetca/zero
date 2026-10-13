import {readCatalog} from '@/lib/sharing-catalog.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const catalog = await readCatalog({signal: request.signal});
    return Response.json(catalog, {headers: {'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({error: 'ZeroHub is unavailable. Try again shortly.'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}
