import versions from '../../../.generated/desktop-update-versions.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json({schema: 1, versions}, {
    headers: {'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff'},
  });
}
