import snapshot from '../.generated/release.json';
import { installerHref, landingDownloadHref, localDownloadsAllowed } from './installer.mjs';
import { availableInstaller } from './published-installer.mjs';
import { availableWindowsDownload, windowsManualHref } from './windows-preview.mjs';
import { availableKitRelease, releaseAssetHref } from './contracts.mjs';
export const release = snapshot.release as {
  schema: number; kitVersion: string; coreVersion: string;
  publication: { status: string; repository: string; tag: string };
  assets: Record<string, { filename: string; label: string; publicationStatus?: 'local' | 'published'; url?: string; sha256?: string; size?: number }>;
};
const publishedKit = snapshot.publishedKit as typeof release | null;
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

export const installer = snapshot.installer;
export function downloadableInstaller() { return availableInstaller(installer, snapshot.publishedInstaller, localDownloadsEnabled()); }
export function macDownloadHref() { return installerHref(downloadableInstaller(), localDownloadsEnabled()); }
export function landingHref() { return landingDownloadHref(downloadHref(), installer, localDownloadsEnabled()); }

export const windowsInstaller = snapshot.windowsInstaller as {
  kitVersion: string;
  publication: {status: 'published'; repository: string; tag: string};
  asset: {url: string; minimumOS: string; architectures: string[]};
} | null;
const windowsPreview = snapshot.windowsPreview as (NonNullable<typeof windowsInstaller> & {kind: 'unsigned-preview'; manualSetup?: {url: string}}) | null;
export function downloadableWindowsInstaller(): typeof windowsInstaller { return availableWindowsDownload(windowsInstaller, windowsPreview); }
export function windowsDownloadIsUnsigned() { return !windowsInstaller && !!windowsPreview; }
export function windowsDownloadHref() { return downloadableWindowsInstaller()?.asset.url ?? null; }
export function windowsManualDownloadHref(): string | null { return windowsManualHref(windowsInstaller, windowsPreview); }
