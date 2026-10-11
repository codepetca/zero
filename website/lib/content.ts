import snapshot from '../.generated/content.json';
import { installerHref, landingDownloadHref, localDownloadsAllowed } from './installer.mjs';
import { releaseAssetHref } from './contracts.mjs';
export const release = snapshot.release as {
  schema: number; kitVersion: string; coreVersion: string;
  publication: { status: string; repository: string; tag: string };
  assets: Record<string, { filename: string; label: string; publicationStatus?: 'local' | 'published'; url?: string; sha256?: string; size?: number }>;
};
export const docs: Record<string, { source: string; markdown: string }> = snapshot.docs;
export function localDownloadsEnabled() {
  // Never enable a local filesystem download on Vercel, even if a flag was copied.
  return localDownloadsAllowed(process.env);
}
export function downloadHref(asset = 'kit') {
  return releaseAssetHref(release, asset, localDownloadsEnabled());
}

export const sources: Record<string,string> = snapshot.sources;
export const community = snapshot.community;

export type CommunityComponent = {
  id: string; name: string; className: string; description: string;
  api: string[]; category?: string; versions?: string[];
  status: string; license: string; maintainer: string | null;
};
export const communityPreview = snapshot.communityPreview as {
  version: string; components: CommunityComponent[];
} | null;

export const installer = snapshot.installer;
export function macDownloadHref() { return installerHref(installer, localDownloadsEnabled()); }
export function landingHref() { return landingDownloadHref(downloadHref(), installer, localDownloadsEnabled()); }
