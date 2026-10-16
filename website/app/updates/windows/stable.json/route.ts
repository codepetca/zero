import snapshot from '../../../../.generated/content.json';
import {publishedWindowsFeedResponse} from '../../../../lib/windows-installer.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
// Preparation verifies exact signed bytes against the published Windows release.
// No request parameter can select a feed, package or public key.
export function GET() {
  return publishedWindowsFeedResponse(snapshot.windowsUpdateFeed);
}
