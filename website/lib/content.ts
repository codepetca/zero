import snapshot from '../.generated/content.json';
import { installerHref, landingDownloadHref, localDownloadsAllowed } from './installer.mjs';
import { availableKitRelease, releaseAssetHref } from './contracts.mjs';
export const release = snapshot.release as {
  schema: number; kitVersion: string; coreVersion: string;
  publication: { status: string; repository: string; tag: string };
  assets: Record<string, { filename: string; label: string; publicationStatus?: 'local' | 'published'; url?: string; sha256?: string; size?: number }>;
};
const publishedKit = snapshot.publishedKit as typeof release | null;
export const docs: Record<string, { source: string; markdown: string }> = snapshot.docs;
export function localDownloadsEnabled() {
  // Never enable a local filesystem download on Vercel, even if a flag was copied.
  return localDownloadsAllowed(process.env);
}
export function downloadHref(asset = 'kit') {
  const available = downloadableKit();
  return available ? releaseAssetHref(available, asset, localDownloadsEnabled()) : '/downloads';
}
export function downloadableKit(): typeof release | null {
  return availableKitRelease(release, publishedKit, localDownloadsEnabled());
}

export const sources: Record<string,string> = snapshot.sources;
export const installer = snapshot.installer;
export function macDownloadHref() { return installerHref(installer, localDownloadsEnabled()); }
export function landingHref() { return landingDownloadHref(downloadHref(), installer, localDownloadsEnabled()); }

export const windowsInstaller = snapshot.windowsInstaller as {
  kitVersion: string;
  publication: {status: 'published'; repository: string; tag: string};
  asset: {url: string; minimumOS: string; architectures: string[]};
} | null;
export function windowsDownloadHref() { return windowsInstaller?.publication.status === 'published' ? windowsInstaller.asset.url : null; }
