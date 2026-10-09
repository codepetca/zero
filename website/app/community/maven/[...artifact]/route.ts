import { community } from '@/lib/content';
import { artifactResponse } from '@/lib/community.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ artifact: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  return artifactResponse(community, (await params).artifact);
}
export async function HEAD(_request: Request, { params }: Context) {
  return artifactResponse(community, (await params).artifact, { head: true });
}
