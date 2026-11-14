import { open, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { localDownloadsEnabled } from '@/lib/release';
import pilot from '../../../../release/windows-portable-pilot.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  if (!localDownloadsEnabled()) return new Response(null, { status: 404, headers });

  const { filename, size, sha256 } = pilot.localAsset;
  try {
    const folder = resolve(process.cwd(), '../dist/school-pilot');
    const file = await realpath(resolve(folder, filename));
    const realFolder = await realpath(folder);
    if (dirname(file) !== realFolder) throw new Error('Unexpected pilot file location');
    const handle = await open(file, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== size) throw new Error('Unexpected pilot file size');
      const data = new Uint8Array(size);
      for (let offset = 0; offset < size;) {
        const { bytesRead } = await handle.read(data, offset, size - offset, offset);
        if (!bytesRead) throw new Error('Incomplete pilot file');
        offset += bytesRead;
      }
      if (createHash('sha256').update(data).digest('hex') !== sha256) throw new Error('Unexpected pilot checksum');
      return new Response(data, { headers: {
        ...headers,
        'Content-Type': 'application/zip',
        'Content-Length': String(size),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      } });
    } finally {
      await handle.close();
    }
  } catch {
    return new Response('The portable pilot ZIP is missing or failed its checksum.', { status: 503, headers });
  }
}
