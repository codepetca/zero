import { downloadableInstaller, macDownloadHref } from "@/lib/release";

const WINDOWS_STORE_LISTING = 'https://apps.microsoft.com/detail/9mxkd6dqlfgx';

function AppleIcon() {
  return <svg className="download-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c.03 3.04 2.66 4.05 2.69 4.06-.02.07-.42 1.45-1.4 2.87-.84 1.23-1.71 2.45-3.08 2.48-1.35.03-1.78-.8-3.32-.8s-2.02.78-3.3.83c-1.32.05-2.33-1.32-3.18-2.54-1.74-2.5-3.06-7.08-1.27-10.19a4.96 4.96 0 0 1 4.2-2.55c1.3-.02 2.52.87 3.32.87.8 0 2.3-1.08 3.88-.92.66.03 2.52.27 3.72 2.02-.1.06-2.28 1.33-2.26 3.87ZM14.56 4.98A4.45 4.45 0 0 0 15.61 1.7c-1.02.04-2.25.68-2.98 1.53a4.23 4.23 0 0 0-1.08 3.15c1.13.09 2.28-.57 3.01-1.4Z" /></svg>;
}

function WindowsIcon() {
  return <svg className="download-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z" /></svg>;
}

export function Downloads() {
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  return (
    <section className="download-section" id="downloads" aria-label="Downloads">
      <div className="hub-actions">
        {mac && <a className="button primary compact" href={mac}><AppleIcon />Get Zero for Mac Silicon{installer.publication.status === 'local' && ' (local preview)'}</a>}
        <a className="button primary compact" href={WINDOWS_STORE_LISTING}><WindowsIcon />Get Zero for Windows</a>
      </div>
      <p className="source-note">Zero is free for individual personal use. Schools and organizations require a paid license.</p>
    </section>
  );
}

export function DownloadRequirements({ platformAware = false } = {}) {
  const installer = downloadableInstaller();
  const mac = macDownloadHref();
  return (
    <p className="source-note" aria-label="Download requirements">
      {mac && installer && <span className={platformAware ? "platform-mac" : undefined}>Mac {installer.kitVersion}: Apple Silicon, macOS {installer.asset.minimumOS}+.{!platformAware && <br />}</span>}
      <span className={platformAware ? "platform-windows" : undefined}>Windows: x64, Windows 10 (build 19041) or later. Install Zero from Microsoft Store.</span>
    </p>
  );
}
