import { community } from '@/lib/content';
import { catalogResponse } from '@/lib/community.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() { return catalogResponse(community, false, {legacy:true}); }
export function HEAD() { return catalogResponse(community, true, {legacy:true}); }
