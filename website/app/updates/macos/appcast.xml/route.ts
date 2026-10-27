import snapshot from '../../../../.generated/release.json';
import {publishedFeedResponse} from '../../../../../scripts/mac-update-feed.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
// Build preparation verifies the exact signed bytes and published installer.
// Neither request parameters nor environment variables can select an update feed.
export function GET() {
  return publishedFeedResponse(snapshot.updateFeed);
}
