import { community } from '@/lib/content';
import { artifactResponse } from '@/lib/community.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() { return artifactResponse(community, [], { workshop: true }); }
export function HEAD() { return artifactResponse(community, [], { workshop: true, head: true }); }
