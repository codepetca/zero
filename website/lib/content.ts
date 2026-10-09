import snapshot from '../.generated/content.json';
export const release = snapshot.release as {
  schema: number; kitVersion: string; coreVersion: string;
  publication: { status: string; repository: string; tag: string };
  assets: Record<string, { filename: string; label: string; url?: string; sha256?: string; size?: number }>;
};
export const docs: Record<string, { source: string; markdown: string }> = snapshot.docs;
export function localDownloadsEnabled() {
  // Never enable a local filesystem download on Vercel, even if a flag was copied.
  return process.env.ZERO_LOCAL_DOWNLOADS === '1' && !process.env.VERCEL;
}
export function downloadHref(asset = 'kit') {
  const metadata = release.assets[asset];
  if (release.publication.status === 'published' && metadata?.url) return metadata.url;
  if (localDownloadsEnabled()) return `/download/${asset}`;
  return '/learn#downloads';
}
