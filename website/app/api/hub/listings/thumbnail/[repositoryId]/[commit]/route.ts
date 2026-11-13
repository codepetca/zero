import {hubListingThumbnailResponse} from '@/lib/hub-listing-thumbnail.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, {params}: {params: Promise<{repositoryId: string; commit: string}>}) {
  return hubListingThumbnailResponse(request, await params);
}
