import { resolve } from 'node:path';
import { localDownloadsEnabled, release, installer } from '@/lib/release';
import { verifiedLocalInstaller } from '@/lib/local-installer.mjs';
import { verifiedLocalAsset } from '@/lib/local-download.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!['kit', 'starter', 'extension', 'installer'].includes(asset)) return new Response('Unknown download.', { status: 404 });
  if (!localDownloadsEnabled()) return new Response(null, { status: 303, headers: { Location: '/downloads', 'Cache-Control': 'no-store' } });
  try {
    const { bytes, asset: receipt } = await (asset === 'installer' ? verifiedLocalInstaller(resolve(process.cwd(), '..'), installer, release) : verifiedLocalAsset(resolve(process.cwd(), '..'), asset, release));
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': asset === 'installer' ? 'application/x-apple-diskimage' : 'application/zip', 'Content-Length': String(bytes.length), 'Content-Disposition': `attachment; filename="${receipt.filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('This local download is not ready or failed verification. Ask the maintainer to verify the exact release artifacts.', { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
